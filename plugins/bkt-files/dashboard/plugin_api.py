"""bkt-files dashboard plugin: move, rename, copy, unzip, zip, text save and name search.

Mounted at ``/api/plugins/bkt-files/``. Core ``/api/files*`` already serves list, read, download,
upload-stream, mkdir and delete; this module only adds the operations core lacks, and every one
of them applies all of the core file guards, not just the managed policy:

* ``_resolve_managed_path`` enforces ``locked_root`` (``HERMES_DASHBOARD_FILES_ROOT`` or a hosted
  ``/opt/data``). On a local install it is ``None``, so the checks below are the real protection.
* ``_sensitive`` wraps core ``_is_sensitive_path`` (credential basenames, ``.env*``,
  ``mcp-tokens/``, ``pairing/``) after NFKC-normalizing and case-folding every path part, because
  APFS and NTFS open ``auth.j\u017fon`` or ``con\ufb01g.yaml`` as the real credential file while
  ``str.lower()`` leaves those characters alone. It runs on the resolved path, every requested
  name, every walked entry, every archive member and every search hit. Core applies it to reads
  only.
* A path's final component is also refused when Windows would open it as a different name:
  trailing dots or spaces, ``:`` (alternate data streams) and reserved device names. The on-disk
  real name of an existing entry is checked too, so an 8.3 short name cannot alias a credential.
* ``_refuse_live_database`` / ``_serve_offline`` keep raw reads off SQLite files with an open
  connection (a raw ``close()`` would cancel that connection's POSIX locks).
* Hermes homes (root, launch, current, ``profiles/`` and every profile home), the managed root,
  the user's home and the filesystem root, and any folder containing one of them, can never be
  moved, renamed or overwritten.
* Code directories are never written into, nor moved, renamed or replaced as part of a folder
  that contains them: every Hermes home's ``plugins/``, ``hooks/`` and ``skills/`` plus each
  dashboard plugin search directory (bundled and, when enabled, project). Content there becomes
  code or instructions that Hermes loads.
* Symlinks are never followed. Trees are walked with ``follow_symlinks=False`` and links are
  skipped and reported; rename and move act on the link itself. Before each write the final
  target's parent ``realpath`` is checked again, which narrows (but cannot close) the window
  between check and use. Writes go to a sibling temp file and ``os.replace`` into place, which
  replaces a final-component link instead of writing through it.
"""

from __future__ import annotations

import asyncio
import errno
import json
import logging
import os
import secrets
import shutil
import stat
import tempfile
import time
import unicodedata
import urllib.parse
import zipfile
import zlib
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator, BinaryIO, Callable, Iterator, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from hermes_cli.archive_safe import normalize_archive_parts
from hermes_cli.web_routers.files import _is_sensitive_path, _refuse_live_database, _serve_offline
from hermes_cli.web_server_files import _managed_files_policy, _path_is_under, _resolve_managed_path

router = APIRouter()
logger = logging.getLogger(__name__)

Conflict = Literal["fail", "rename", "overwrite"]

MAX_SOURCES = 500
WALK_MAX_ENTRIES = 100_000
COPY_CHUNK_BYTES = 1024 * 1024
ZIP_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
UNZIP_MAX_MEMBERS = 10_000
UNZIP_MAX_TOTAL_BYTES = 1024 * 1024 * 1024
UNZIP_MAX_RATIO = 100
# Deep member paths cost quadratic memory while planning parent folders; real archives stay far
# below both caps.
UNZIP_MAX_DEPTH = 64
UNZIP_MAX_NAME_BYTES = 1024
# Ratios are only meaningful above this size; tiny text files legitimately compress very well.
UNZIP_RATIO_MIN_BYTES = 1024 * 1024
WRITE_TEXT_MAX_BYTES = 8 * 1024 * 1024
SEARCH_MAX_RESULTS = 200
SEARCH_MAX_VISITED = 200_000
SEARCH_TIMEOUT_SECONDS = 5.0
SEARCH_SKIP_DIRS = frozenset({".git", "node_modules", "__pycache__", ".venv", "venv"})
# Reverse proxies commonly reject response headers over 8-16 KB.
SKIPPED_HEADER_MAX_BYTES = 4096
CODE_DIR_NAMES = ("plugins", "hooks", "skills")
NAME_MAX_BYTES = 255

_WINDOWS_RESERVED = frozenset(
    {"con", "prn", "aux", "nul", "conin$", "conout$"}
    | {f"com{i}" for i in "123456789¹²³"}
    | {f"lpt{i}" for i in "123456789¹²³"}
)
_WINDOWS_FORBIDDEN_CHARS = frozenset('<>:"|?*')

S_IFMT_MASK = 0o170000


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class MoveRequest(BaseModel):
    sources: list[str] = Field(min_length=1, max_length=MAX_SOURCES)
    dest_dir: str = Field(min_length=1)
    on_conflict: Conflict = "fail"


class CopyRequest(MoveRequest):
    pass


class RenameRequest(BaseModel):
    path: str = Field(min_length=1)
    new_name: str = Field(min_length=1, max_length=NAME_MAX_BYTES)


class UnzipRequest(BaseModel):
    path: str = Field(min_length=1)
    dest_dir: Optional[str] = None
    on_conflict: Conflict = "fail"


class ZipRequest(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=MAX_SOURCES)


class WriteTextRequest(BaseModel):
    path: str = Field(min_length=1)
    content: str
    expected_mtime: Optional[float] = None


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------


def _norm(part: str) -> str:
    """NFKC case fold of one path part (``\u017f`` -> ``s``, ``\ufb01`` -> ``fi``)."""
    return unicodedata.normalize("NFKC", unicodedata.normalize("NFKC", part).casefold())


def _fold(path: Path) -> tuple[str, ...]:
    """Folded parts for deny-list containment: macOS and Windows volumes are usually
    case-insensitive, so ``PLUGINS/`` must not slip past a ``plugins/`` check. Over-matching on a
    case-sensitive volume only refuses more, never less."""
    return tuple(_norm(part) for part in path.parts)


def _sensitive(path: Path) -> bool:
    """Core ``_is_sensitive_path`` on the path as given and on its NFKC case-folded form."""
    if _is_sensitive_path(path):
        return True
    folded = _fold(path)
    return bool(folded) and _is_sensitive_path(Path(*folded))


def _folded_under(root: tuple[str, ...], target: tuple[str, ...]) -> bool:
    return target[: len(root)] == root


def _real(path: Path) -> Path:
    try:
        return path.resolve(strict=False)
    except (OSError, RuntimeError):
        return path


@dataclass(frozen=True)
class GuardContext:
    """Per-request snapshot of the roots every guard compares against."""

    locked_root: Optional[Path]
    protected: tuple[tuple[str, ...], ...]
    code_dirs: tuple[tuple[str, ...], ...]


def _hermes_homes() -> set[Path]:
    from hermes_constants import get_default_hermes_root, get_hermes_home, get_process_hermes_home

    root = get_default_hermes_root()
    homes = {root, get_hermes_home(), get_process_hermes_home()}
    try:
        with os.scandir(root / "profiles") as scan:
            homes.update(Path(entry.path) for entry in scan if entry.is_dir(follow_symlinks=False))
    except OSError:
        pass
    return homes | {root / "profiles"}


def _code_roots(homes: set[Path]) -> set[Path]:
    from hermes_cli.web_server_dashboard import _dashboard_plugin_search_dirs

    roots = {home / name for home in homes for name in CODE_DIR_NAMES}
    roots.update(Path(directory) for directory, _source in _dashboard_plugin_search_dirs())
    return roots


def _context(request: Request) -> GuardContext:
    policy = _managed_files_policy(request)
    homes = _hermes_homes()
    protected = {_real(p) for p in homes} | {_real(policy.default_path), _real(Path.home())}
    if policy.locked_root is not None:
        protected.add(policy.locked_root)
    code_dirs = set()
    for directory in _code_roots(homes):
        code_dirs.update({directory, _real(directory)})
    return GuardContext(
        locked_root=policy.locked_root,
        protected=tuple(_fold(p) for p in protected),
        code_dirs=tuple(_fold(p) for p in code_dirs),
    )


def _refuse(status: int, detail: str) -> HTTPException:
    return HTTPException(status_code=status, detail=detail)


def _check(path: Path, ctx: GuardContext, *, write: bool, names: tuple[str, ...] = ()) -> None:
    """Root, sensitive and code-directory checks for one already-resolved path."""
    if ctx.locked_root is not None and not _path_is_under(ctx.locked_root, path):
        raise _refuse(403, "Path outside managed files root")
    if _sensitive(path) or any(_sensitive(Path(name)) for name in names if name):
        raise _refuse(403, "Access to sensitive files is not allowed")
    if write:
        folded = _fold(path)
        if any(_folded_under(d, folded) for d in ctx.code_dirs):
            raise _refuse(403, "Writing into a Hermes code directory (plugins, hooks, skills) is not allowed")


def _refuse_code_container(path: Path, ctx: GuardContext) -> None:
    """A move/rename/copy target or moved source must not contain a code directory: otherwise a
    staged tree could take the place of one (rename the folder holding it, then move a tree in)."""
    folded = _fold(path)
    if any(_folded_under(folded, d) for d in ctx.code_dirs):
        raise _refuse(403, "Cannot move, rename or replace a folder that contains a Hermes code directory")


def _refuse_protected(path: Path, ctx: GuardContext, what: str) -> None:
    """A Hermes home, the managed root or the filesystem root, or anything that contains one."""
    folded = _fold(path)
    if path.parent == path or any(_folded_under(folded, p) for p in ctx.protected):
        raise _refuse(400, f"Cannot {what} a Hermes home, the managed root or a folder containing one")


def _guard(
    raw: str, request: Request, ctx: GuardContext, *, write: bool, follow: bool = True, must_exist: bool = True,
) -> Path:
    """Resolve ``raw`` through the managed policy and apply every guard.

    ``follow=False`` resolves the parent only and keeps the last component as named, so the
    caller acts on a symlink itself rather than its target. The parent must exist, and so must
    the entry unless ``must_exist`` is False.
    """
    if follow:
        _policy, resolved, _display = _resolve_managed_path(raw, request, for_write=write)
        _check(resolved, ctx, write=write, names=(Path(raw).name,))
        return resolved

    text = str(raw or "").strip()
    name = Path(text).name if text else ""
    if not name or name in {".", ".."}:
        raise _refuse(400, "Cannot operate on the root folder")
    # Checked on the unstripped name too: the managed resolver strips whitespace, which would
    # silently turn "notes.txt " into a different file.
    for candidate in {name, Path(str(raw or "")).name}:
        problem = alias_problem(candidate)
        if problem:
            raise _refuse(400, f"{candidate!r}: {problem}")
    parent_text = str(Path(text).parent)
    _policy, parent, _display = _resolve_managed_path(parent_text, request)
    entry = parent / name
    _check(entry, ctx, write=write, names=(name,))
    exists = _lexists(entry)
    if must_exist and not exists:
        raise _refuse(404, "Path not found")
    if exists and not _is_link(entry):
        # The on-disk name, e.g. the long name behind a Windows 8.3 short name.
        real = _real(entry)
        _check(real, ctx, write=write, names=(real.name,))
    return entry


def alias_problem(name: str) -> Optional[str]:
    """Why Windows would open ``name`` as something else (a trimmed name, a data stream, a
    device), or None. Applied on every host: the tree may be opened on Windows later."""
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in name):
        return "Name cannot contain control characters"
    if any(ch in _WINDOWS_FORBIDDEN_CHARS for ch in name):
        return 'Name cannot contain any of < > : " | ? *'
    if name[-1] in {".", " "}:
        return "Name cannot end with a dot or a space"
    if name.split(".", 1)[0].rstrip(" ").casefold() in _WINDOWS_RESERVED:
        return "Name is reserved on Windows"
    return None


def name_problem(name: str) -> Optional[str]:
    """Why ``name`` cannot be a single portable path component, or None.

    Applied on every host so a tree created on macOS/Linux still opens on native Windows."""
    if not name or name in {".", ".."}:
        return "Name is empty"
    if "/" in name or "\\" in name:
        return "Name cannot contain a path separator"
    problem = alias_problem(name)
    if problem:
        return problem
    if len(name.encode("utf-8")) > NAME_MAX_BYTES:
        return "Name is too long"
    return None


def _require_dir(path: Path) -> None:
    try:
        st = path.stat()
    except FileNotFoundError:
        raise _refuse(404, "Destination folder not found")
    except OSError as exc:
        raise _refuse(400, f"Invalid destination: {exc}")
    if not stat.S_ISDIR(st.st_mode):
        raise _refuse(400, "Destination is not a folder")


def _safe_target(base: Path, parts: tuple[str, ...], ctx: GuardContext) -> Path:
    """``base/parts`` checked component by component without following links.

    ``base`` is a resolved directory. Intermediate components that exist must be real
    directories (a symlinked subfolder could redirect the write elsewhere); the final
    component may be anything, because writes replace it rather than writing through it. The
    parent's realpath is compared with the lexical path, then the full guard runs."""
    current = base
    for part in parts[:-1]:
        current = current / part
        try:
            st = os.lstat(current)
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(st.st_mode):
            raise _refuse(409, f"Refusing to write through the symlink {current}")
        if not stat.S_ISDIR(st.st_mode):
            raise _refuse(409, f"A file is in the way at {current}")
    target = current / parts[-1] if parts else current
    if target.parent.exists() and _fold(_real(target.parent)) != _fold(target.parent):
        raise _refuse(409, f"Destination {target.parent} changed while writing")
    _check(target, ctx, write=True, names=parts)
    return target


def _lexists(path: Path) -> bool:
    return os.path.lexists(path)


def _is_link(path: Path) -> bool:
    return os.path.islink(path)


def _is_real_dir(path: Path) -> bool:
    try:
        return stat.S_ISDIR(os.lstat(path).st_mode)
    except OSError:
        return False


def _unique_name(name: str, taken) -> str:
    """``name (n).ext`` for the first ``n`` where ``taken(candidate)`` is False."""
    stem, dot, ext = name.rpartition(".")
    if not stem:  # no extension, or a dotfile such as ".profile"
        stem, dot, ext = name, "", ""
    for n in range(1, 10_000):
        candidate = f"{stem} ({n}){dot}{ext}"
        if not taken(candidate):
            return candidate
    raise _refuse(409, f"No free name for {name}")


# ---------------------------------------------------------------------------
# Tree walking (never follows symlinks)
# ---------------------------------------------------------------------------


@dataclass
class TreePlan:
    dirs: list[tuple[str, ...]]
    files: list[tuple[Path, tuple[str, ...], int]]
    skipped: list[dict]


def _live_database(path: Path) -> bool:
    try:
        _refuse_live_database(path)
    except HTTPException as exc:
        if exc.status_code == 409:
            return True
        raise
    return False


def _walk(source: Path, ctx: GuardContext, *, top: tuple[str, ...], exclude: Optional[Path] = None) -> TreePlan:
    """Regular files and directories under ``source``; links, sensitive entries, special files
    and live databases are skipped and reported."""
    plan = TreePlan(dirs=[top], files=[], skipped=[])
    queue: deque[tuple[Path, tuple[str, ...]]] = deque([(source, top)])
    seen = 0
    while queue:
        directory, rel = queue.popleft()
        try:
            with os.scandir(directory) as scan:
                entries = sorted(scan, key=lambda e: e.name)
        except OSError as exc:
            plan.skipped.append({"path": str(directory), "reason": f"unreadable: {exc.strerror or exc}"})
            continue
        for entry in entries:
            seen += 1
            if seen > WALK_MAX_ENTRIES:
                raise _refuse(413, f"Too many entries (limit {WALK_MAX_ENTRIES})")
            path = Path(entry.path)
            if exclude is not None and path == exclude:
                continue
            if _sensitive(path):
                plan.skipped.append({"path": str(path), "reason": "sensitive"})
                continue
            if entry.is_symlink():
                plan.skipped.append({"path": str(path), "reason": "symlink"})
                continue
            try:
                st = entry.stat(follow_symlinks=False)
            except OSError as exc:
                plan.skipped.append({"path": str(path), "reason": f"unreadable: {exc.strerror or exc}"})
                continue
            child = rel + (entry.name,)
            if stat.S_ISDIR(st.st_mode):
                plan.dirs.append(child)
                queue.append((path, child))
            elif not stat.S_ISREG(st.st_mode):
                plan.skipped.append({"path": str(path), "reason": "not a regular file"})
            elif _live_database(path):
                plan.skipped.append({"path": str(path), "reason": "live database"})
            else:
                plan.files.append((path, child, st.st_size))
    return plan


def _open_regular(src: Path):
    """Open ``src`` for reading without following a final symlink (where the OS can), and
    confirm on the open descriptor that it is still a regular file."""
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0)
    fd = os.open(src, flags)
    handle = os.fdopen(fd, "rb")
    if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
        handle.close()
        raise _refuse(409, f"{src} is no longer a regular file")
    return handle


def _place(staged: Path, target: Path, *, replace: bool) -> None:
    """Move a finished temp file into place. Without ``replace`` it never clobbers: a hard link
    fails if ``target`` appeared since it was checked. Volumes without hard links fall back to a
    last existence check before ``os.replace``."""
    if replace:
        os.replace(staged, target)
        return
    try:
        os.link(staged, target)
    except FileExistsError:
        raise _refuse(409, f"{target} already exists")
    except OSError:
        if _lexists(target):
            raise _refuse(409, f"{target} already exists")
        os.replace(staged, target)
        return
    staged.unlink()


def _copy_file(src: Path, target: Path, replace: bool) -> None:
    """Copy one regular file into place via a sibling temp file and ``_place``."""
    fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name[:40]}.", suffix=".bkt-tmp", dir=str(target.parent))
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as out, _serve_offline(src), _open_regular(src) as handle:
            shutil.copyfileobj(handle, out, COPY_CHUNK_BYTES)
            mode = os.fstat(handle.fileno()).st_mode & 0o777
        os.chmod(tmp, mode)
        _place(tmp, target, replace=replace)
    finally:
        tmp.unlink(missing_ok=True)


def _ensure_dir(path: Path) -> None:
    try:
        path.mkdir(exist_ok=True)
    except FileExistsError:
        pass
    if not _is_real_dir(path):
        raise _refuse(409, f"{path} is not a folder")


def _io(func):
    """Run ``func`` mapping OS errors to HTTP errors; HTTPException passes through."""
    try:
        return func()
    except HTTPException:
        raise
    except PermissionError as exc:
        raise _refuse(403, f"Permission denied: {exc.filename or exc}")
    except OSError as exc:
        raise _refuse(500, f"File operation failed: {exc}")


# ---------------------------------------------------------------------------
# Move / rename
# ---------------------------------------------------------------------------


def _resolve_conflict(dest: Path, name: str, on_conflict: Conflict) -> tuple[str, bool]:
    """``(final name, replaces_existing)`` for a top-level entry; 409 in ``fail`` mode."""
    if not _lexists(dest / name):
        return name, False
    if on_conflict == "fail":
        raise _refuse(409, f"{name} already exists in {dest}")
    if on_conflict == "rename":
        return _unique_name(name, lambda candidate: _lexists(dest / candidate)), False
    return name, True


def _remove(path: Path) -> None:
    if _is_real_dir(path):
        shutil.rmtree(path)
    else:
        path.unlink()


def _move_into_place(source: Path, target: Path, replaces: bool) -> None:
    """Rename ``source`` onto ``target``. An existing target (overwrite mode) is first renamed to
    a sibling backup, which is deleted only after the move succeeded and restored if it failed,
    so a failing rename (EXDEV, EACCES, EBUSY) never loses the destination."""
    backup: Optional[Path] = None
    if _lexists(target):
        if not replaces:
            raise _refuse(409, f"{target.name} appeared in {target.parent} during the move")
        backup = target.with_name(f".{target.name[:40]}.bkt-backup-{secrets.token_hex(4)}")
        os.rename(target, backup)
    try:
        os.rename(source, target)
    except BaseException:
        if backup is not None:
            os.rename(backup, target)
        raise
    if backup is not None:
        try:
            _remove(backup)
        except OSError:
            logger.warning("bkt-files: could not remove the replaced copy %s", backup, exc_info=True)


def _plan_move(source: Path, dest: Path, payload: MoveRequest, ctx: GuardContext, reserved: set[str]) -> tuple[Path, bool]:
    """Validate one move source and return ``(target, replaces)``."""
    _refuse_protected(source, ctx, "move")
    _refuse_code_container(source, ctx)
    if not _is_link(source) and _is_real_dir(source) and _folded_under(_fold(_real(source)), _fold(dest)):
        raise _refuse(400, f"Cannot move {source.name} into itself")
    name, replaces = _resolve_conflict(dest, source.name, payload.on_conflict)
    if name.casefold() in reserved:
        raise _refuse(409, f"Two sources are both named {name}")
    reserved.add(name.casefold())
    target = _safe_target(dest, (name,), ctx)
    if replaces:
        _refuse_protected(target, ctx, "overwrite")
        if _folded_under(_fold(target), _fold(source)):
            raise _refuse(400, f"Cannot overwrite a folder that contains {source.name}")
        if _is_real_dir(target) != _is_real_dir(source):
            raise _refuse(409, f"Cannot replace {name}: one is a folder and the other is not")
    _refuse_code_container(target, ctx)
    return target, replaces


def _move(payload: MoveRequest, request: Request) -> dict:
    ctx = _context(request)
    dest = _guard(payload.dest_dir, request, ctx, write=True)
    _require_dir(dest)
    planned: list[tuple[Path, Path, bool]] = []
    skipped: list[dict] = []
    reserved: set[str] = set()
    for raw in payload.sources:
        source = _guard(raw, request, ctx, write=True, follow=False)
        if _fold(_real(source.parent)) == _fold(dest):
            skipped.append({"path": str(source), "reason": "already in that folder"})
            continue
        target, replaces = _plan_move(source, dest, payload, ctx, reserved)
        planned.append((source, target, replaces))

    moved = []
    for source, target, replaces in planned:
        def run(source=source, target=target, replaces=replaces):
            _safe_target(dest, (target.name,), ctx)
            try:
                _move_into_place(source, target, replaces)
            except OSError as exc:
                if exc.errno == errno.EXDEV:
                    raise _refuse(409, "Cannot move across filesystems; copy and delete instead")
                raise
        _io(run)
        moved.append({"source": str(source), "target": str(target)})
    return {"ok": True, "moved": moved, "skipped": skipped}


def _rename(payload: RenameRequest, request: Request) -> dict:
    problem = name_problem(payload.new_name)
    if problem:
        raise _refuse(400, problem)
    ctx = _context(request)
    source = _guard(payload.path, request, ctx, write=True, follow=False)
    _refuse_protected(source, ctx, "rename")
    _refuse_code_container(source, ctx)
    if payload.new_name == source.name:
        return {"ok": True, "path": str(source)}
    target = _safe_target(source.parent, (payload.new_name,), ctx)
    _refuse_code_container(target, ctx)
    if _lexists(target):
        case_only = payload.new_name.casefold() == source.name.casefold() and os.path.samefile(source, target)
        if not case_only:
            raise _refuse(409, f"{payload.new_name} already exists")
    _io(lambda: os.rename(source, target))
    return {"ok": True, "path": str(target)}


# ---------------------------------------------------------------------------
# Copy
# ---------------------------------------------------------------------------


def _plan_copy_source(source: Path, dest: Path, payload: CopyRequest, ctx: GuardContext,
                      reserved: set[str]) -> Optional[tuple[TreePlan, bool]]:
    """Plan one copy source; None when it is skipped (link or special file, reported by caller)."""
    st = os.lstat(source)
    if stat.S_ISLNK(st.st_mode) or not (stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode)):
        return None
    is_dir = stat.S_ISDIR(st.st_mode)
    if is_dir and _folded_under(_fold(source), _fold(dest)):
        raise _refuse(400, f"Cannot copy {source.name} into itself")
    name, replaces = _resolve_conflict(dest, source.name, payload.on_conflict)
    if name.casefold() in reserved:
        raise _refuse(409, f"Two sources are both named {name}")
    reserved.add(name.casefold())
    _refuse_code_container(dest / name, ctx)
    if is_dir:
        plan = _walk(source, ctx, top=(name,))
    else:
        _refuse_live_database(source)
        plan = TreePlan(dirs=[], files=[(source, (name,), st.st_size)], skipped=[])
    if replaces:
        _refuse_protected(dest / name, ctx, "overwrite")
        if _is_real_dir(dest / name) != is_dir:
            raise _refuse(409, f"Cannot replace {name}: one is a folder and the other is not")
    return plan, replaces


def _precheck_copy(jobs: list[tuple[TreePlan, bool]], dest: Path, ctx: GuardContext) -> None:
    """Every destination is checked before anything is written."""
    for plan, replaces in jobs:
        for rel in plan.dirs:
            target = _safe_target(dest, rel, ctx)
            if _lexists(target) and not _is_real_dir(target):
                raise _refuse(409, f"A file is in the way at {target}")
        for _src, rel, _size in plan.files:
            target = _safe_target(dest, rel, ctx)
            if _is_real_dir(target):
                raise _refuse(409, f"A folder is in the way at {target}")
            if _lexists(target) and not replaces:
                raise _refuse(409, f"{target} already exists")


def _copy(payload: CopyRequest, request: Request) -> dict:
    ctx = _context(request)
    dest = _guard(payload.dest_dir, request, ctx, write=True)
    _require_dir(dest)
    jobs: list[tuple[TreePlan, bool]] = []
    skipped: list[dict] = []
    reserved: set[str] = set()
    for raw in payload.sources:
        source = _guard(raw, request, ctx, write=False, follow=False)
        job = _plan_copy_source(source, dest, payload, ctx, reserved)
        if job is None:
            reason = "symlink" if _is_link(source) else "not a regular file"
            skipped.append({"path": str(source), "reason": reason})
            continue
        skipped.extend(job[0].skipped)
        jobs.append(job)
    _precheck_copy(jobs, dest, ctx)

    copied = 0
    for plan, replaces in jobs:
        for rel in plan.dirs:
            _io(lambda rel=rel: _ensure_dir(_safe_target(dest, rel, ctx)))
        for src, rel, _size in plan.files:
            _io(lambda src=src, rel=rel, replaces=replaces: _copy_file(src, _safe_target(dest, rel, ctx), replaces))
            copied += 1
    return {"ok": True, "copied": copied, "skipped": skipped}


# ---------------------------------------------------------------------------
# Unzip
# ---------------------------------------------------------------------------


@dataclass
class ArchivePlan:
    dirs: set[tuple[str, ...]]
    files: list[tuple[zipfile.ZipInfo, tuple[str, ...]]]


def _member_kind(info: zipfile.ZipInfo) -> int:
    return (info.external_attr >> 16) & S_IFMT_MASK


def _member_parts(info: zipfile.ZipInfo) -> tuple[str, ...]:
    """Safe, bounded, non-sensitive path parts of one member, or 400."""
    if len(info.filename.encode("utf-8")) > UNZIP_MAX_NAME_BYTES:
        raise _refuse(400, f"Archive member name is too long (limit {UNZIP_MAX_NAME_BYTES} bytes)")
    try:
        parts = tuple(normalize_archive_parts(info.filename))
    except ValueError:
        raise _refuse(400, f"Unsafe archive member path: {info.filename}")
    if len(parts) > UNZIP_MAX_DEPTH:
        raise _refuse(400, f"Archive member path is too deep (limit {UNZIP_MAX_DEPTH} folders)")
    for part in parts:
        problem = name_problem(part)
        if problem:
            raise _refuse(400, f"Unsafe archive member name {info.filename!r}: {problem}")
    if _sensitive(Path(*parts)):
        raise _refuse(400, f"Archive contains a sensitive file: {info.filename}")
    return parts


def _member_is_dir(info: zipfile.ZipInfo) -> bool:
    """Directory or regular file; links, special files and encrypted members are refused."""
    kind = _member_kind(info)
    if kind == stat.S_IFLNK:
        raise _refuse(400, f"Archive contains a symlink: {info.filename}")
    if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
        raise _refuse(400, f"Archive contains a special file: {info.filename}")
    if info.flag_bits & 0x1:
        raise _refuse(400, f"Encrypted archive members are not supported: {info.filename}")
    return info.is_dir() or kind == stat.S_IFDIR


def _folded_rel(parts: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(_norm(p) for p in parts)


def _scan_archive(archive: zipfile.ZipFile, archive_size: int) -> ArchivePlan:
    """Validate every member before anything is written: names, types, counts and sizes."""
    infos = archive.infolist()
    if len(infos) > UNZIP_MAX_MEMBERS:
        raise _refuse(400, f"Archive has too many members (limit {UNZIP_MAX_MEMBERS})")
    plan = ArchivePlan(dirs=set(), files=[])
    seen: set[tuple[str, ...]] = set()
    total = 0
    for info in infos:
        parts = _member_parts(info)
        is_dir = _member_is_dir(info)
        folded = _folded_rel(parts)
        if folded in seen and not is_dir:
            raise _refuse(400, f"Archive contains {info.filename} twice")
        seen.add(folded)
        for depth in range(1, len(parts)):
            plan.dirs.add(parts[:depth])
        if is_dir:
            plan.dirs.add(parts)
            continue
        total += info.file_size
        if total > UNZIP_MAX_TOTAL_BYTES:
            raise _refuse(400, "Archive expands beyond the size limit")
        if info.file_size > UNZIP_RATIO_MIN_BYTES and info.file_size > UNZIP_MAX_RATIO * max(info.compress_size, 1):
            raise _refuse(400, f"Archive member {info.filename} has a suspicious compression ratio")
        plan.files.append((info, parts))
    if total > UNZIP_RATIO_MIN_BYTES and total > UNZIP_MAX_RATIO * max(archive_size, 1):
        raise _refuse(400, "Archive has a suspicious compression ratio")
    file_parts = {_folded_rel(parts) for _info, parts in plan.files}
    if any(_folded_rel(d) in file_parts for d in plan.dirs):
        raise _refuse(400, "Archive uses one name as both a file and a folder")
    return plan


def _extract_member(archive: zipfile.ZipFile, info: zipfile.ZipInfo, target: Path, budget: list[int]) -> None:
    """Stream one member, enforcing its declared size and the shared byte budget, because
    a crafted header can understate the real expanded size."""
    written = 0
    try:
        with archive.open(info) as src, open(target, "xb") as out:
            while True:
                chunk = src.read(COPY_CHUNK_BYTES)
                if not chunk:
                    break
                written += len(chunk)
                budget[0] -= len(chunk)
                if written > info.file_size or budget[0] < 0:
                    raise _refuse(400, f"Archive member {info.filename} expands beyond its declared size")
                out.write(chunk)
    except (zipfile.BadZipFile, zlib.error, EOFError, NotImplementedError) as exc:
        raise _refuse(400, f"Cannot extract {info.filename}: {exc}")


def _unzip_dest(payload: UnzipRequest, request: Request, ctx: GuardContext, archive_path: Path) -> tuple[Path, bool]:
    """``(destination, must_create)``: the requested folder, or ``<archive folder>/<stem>``."""
    if payload.dest_dir:
        dest = _guard(payload.dest_dir, request, ctx, write=True)
        _require_dir(dest)
        return dest, False
    stem = archive_path.stem or "archive"
    problem = name_problem(stem)
    if problem:
        raise _refuse(400, f"Cannot derive a folder name from the archive: {problem}")
    dest = _safe_target(_real(archive_path.parent), (stem,), ctx)
    create = not _lexists(dest)
    if not create and (_is_link(dest) or not _is_real_dir(dest)):
        raise _refuse(409, f"{dest} exists and is not a folder")
    return dest, create


def _plan_unzip_targets(plan: ArchivePlan, dest: Path, ctx: GuardContext,
                        on_conflict: Conflict) -> dict[tuple[str, ...], tuple[str, ...]]:
    """Check every final target before anything is written; return renames for ``rename`` mode.

    A generated name must be free on disk AND among the archive's own planned names, or a
    member such as ``a (1).txt`` would overwrite the renamed copy of ``a.txt``."""
    for rel in sorted(plan.dirs):
        target = _safe_target(dest, rel, ctx)
        if _lexists(target) and (_is_link(target) or not _is_real_dir(target)):
            raise _refuse(409, f"{target} exists and is not a folder")
    taken = {_folded_rel(rel) for _info, rel in plan.files} | {_folded_rel(d) for d in plan.dirs}
    renames: dict[tuple[str, ...], tuple[str, ...]] = {}
    for _info, rel in plan.files:
        target = _safe_target(dest, rel, ctx)
        if _is_real_dir(target):
            raise _refuse(409, f"A folder is in the way at {target}")
        if not _lexists(target) or on_conflict == "overwrite":
            continue
        if on_conflict == "fail":
            raise _refuse(409, f"{target} already exists")
        parent, parent_rel = target.parent, rel[:-1]
        new_name = _unique_name(rel[-1], lambda c, parent=parent, parent_rel=parent_rel: (
            _lexists(parent / c) or _folded_rel(parent_rel + (c,)) in taken))
        taken.add(_folded_rel(parent_rel + (new_name,)))
        _safe_target(dest, parent_rel + (new_name,), ctx)
        renames[rel] = parent_rel + (new_name,)
    return renames


def _extract_and_place(archive: zipfile.ZipFile, plan: ArchivePlan, dest: Path, staging: Path,
                       renames: dict, *, replace: bool, create_dest: bool, ctx: GuardContext) -> None:
    budget = [UNZIP_MAX_TOTAL_BYTES]
    for info, rel in plan.files:
        staged = staging.joinpath(*rel)
        staged.parent.mkdir(parents=True, exist_ok=True)
        _io(lambda info=info, staged=staged: _extract_member(archive, info, staged, budget))
    if create_dest:
        _io(lambda: _ensure_dir(_safe_target(dest.parent, (dest.name,), ctx)))
    for rel in sorted(plan.dirs, key=len):
        _io(lambda rel=rel: _ensure_dir(_safe_target(dest, rel, ctx)))
    for _info, rel in plan.files:
        final_rel = renames.get(rel, rel)
        _io(lambda rel=rel, final_rel=final_rel: _place(
            staging.joinpath(*rel), _safe_target(dest, final_rel, ctx), replace=replace))


def _unzip(payload: UnzipRequest, request: Request) -> dict:
    ctx = _context(request)
    archive_path = _guard(payload.path, request, ctx, write=False, follow=False)
    st = os.lstat(archive_path)
    if not stat.S_ISREG(st.st_mode):
        raise _refuse(400, "Only a regular .zip file can be extracted")
    dest, create_dest = _unzip_dest(payload, request, ctx, archive_path)
    try:
        archive = zipfile.ZipFile(archive_path)
    except (zipfile.BadZipFile, OSError) as exc:
        raise _refuse(400, f"Not a valid zip archive: {exc}")
    with archive:
        plan = _scan_archive(archive, st.st_size)
        # A malicious or conflicting archive is refused here, before anything is written.
        if create_dest:
            renames: dict[tuple[str, ...], tuple[str, ...]] = {}
            for _info, rel in plan.files:
                _check(dest.joinpath(*rel), ctx, write=True, names=rel)
        else:
            renames = _plan_unzip_targets(plan, dest, ctx, payload.on_conflict)
        staging = Path(tempfile.mkdtemp(prefix=".bkt-unzip-", dir=str(dest.parent if create_dest else dest)))
        try:
            _extract_and_place(archive, plan, dest, staging, renames, replace=payload.on_conflict == "overwrite",
                               create_dest=create_dest, ctx=ctx)
        finally:
            shutil.rmtree(staging, ignore_errors=True)
    return {"ok": True, "dest_dir": str(dest), "files": len(plan.files), "dirs": len(plan.dirs)}


# ---------------------------------------------------------------------------
# Zip
# ---------------------------------------------------------------------------


def _zip_sources(raw_paths: list[str], request: Request, ctx: GuardContext) -> tuple[list[tuple[Path, str]], list[dict]]:
    sources: list[tuple[Path, str]] = []
    skipped: list[dict] = []
    names: set[str] = set()
    for raw in raw_paths:
        source = _guard(raw, request, ctx, write=False, follow=False)
        if _is_link(source):
            skipped.append({"path": str(source), "reason": "symlink"})
            continue
        name = source.name
        if name.casefold() in names:
            name = _unique_name(name, lambda candidate: candidate.casefold() in names)
        names.add(name.casefold())
        sources.append((source, name))
    if not sources:
        raise _refuse(400, "Nothing to zip: " + ", ".join(f"{s['path']} ({s['reason']})" for s in skipped))
    return sources, skipped


def _source_plan(source: Path, name: str, ctx: GuardContext, tmp: Path, skipped: list[dict]) -> Optional[TreePlan]:
    if _is_real_dir(source):
        return _walk(source, ctx, top=(name,), exclude=tmp)
    if not stat.S_ISREG(os.lstat(source).st_mode):
        skipped.append({"path": str(source), "reason": "not a regular file"})
        return None
    if _live_database(source):
        skipped.append({"path": str(source), "reason": "live database"})
        return None
    return TreePlan(dirs=[], files=[(source, (name,), source.stat().st_size)], skipped=[])


def _write_zip(tmp: Path, sources: list[tuple[Path, str]], ctx: GuardContext, skipped: list[dict]) -> None:
    total = 0
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        for source, name in sources:
            plan = _source_plan(source, name, ctx, tmp, skipped)
            if plan is None:
                continue
            skipped.extend(plan.skipped)
            for rel in plan.dirs:
                archive.writestr(zipfile.ZipInfo("/".join(rel) + "/"), b"")
            for src, rel, size in plan.files:
                total += size
                if total > ZIP_MAX_TOTAL_BYTES:
                    raise _refuse(413, "Selection is too large to zip")
                info = zipfile.ZipInfo.from_file(src, "/".join(rel))
                info.compress_type = zipfile.ZIP_DEFLATED
                with _serve_offline(src), _open_regular(src) as handle, \
                        archive.open(info, "w", force_zip64=size > 0x7FFFFFFF) as out:
                    shutil.copyfileobj(handle, out, COPY_CHUNK_BYTES)


def _open_spooled_zip(build: Callable[[Path], None]) -> tuple[BinaryIO, int]:
    """Build an archive into a temp file and return an open handle whose file is already gone
    from the directory (POSIX: unlinked; Windows: delete-on-close), so a client that disconnects
    mid-download cannot leave a multi-GB temp file behind."""
    fd, tmp_name = tempfile.mkstemp(prefix="bkt-files-", suffix=".zip")
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        build(tmp)
        flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_TEMPORARY", 0)
        fd = os.open(tmp, flags)
        handle = os.fdopen(fd, "rb")
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    if os.name != "nt":
        tmp.unlink(missing_ok=True)
    return handle, os.fstat(handle.fileno()).st_size


async def _stream_and_close(handle: BinaryIO) -> AsyncIterator[bytes]:
    try:
        while True:
            chunk = await asyncio.to_thread(handle.read, COPY_CHUNK_BYTES)
            if not chunk:
                break
            yield chunk
    finally:
        handle.close()


def _build_zip(raw_paths: list[str], request: Request) -> tuple[BinaryIO, int, str, list[dict]]:
    ctx = _context(request)
    sources, skipped = _zip_sources(raw_paths, request, ctx)
    handle, size = _open_spooled_zip(lambda tmp: _write_zip(tmp, sources, ctx, skipped))
    download = f"{sources[0][1]}.zip" if len(sources) == 1 else "files.zip"
    return handle, size, download, skipped


def _skipped_header(skipped: list[dict]) -> str:
    """As many skipped entries as fit in ``SKIPPED_HEADER_MAX_BYTES`` of JSON."""
    kept: list[dict] = []
    used = 2
    for item in skipped:
        piece = len(json.dumps(item, ensure_ascii=True)) + 2
        if used + piece > SKIPPED_HEADER_MAX_BYTES:
            break
        kept.append(item)
        used += piece
    return json.dumps(kept, ensure_ascii=True)


def _content_disposition(filename: str) -> str:
    quoted = urllib.parse.quote(filename)
    if quoted != filename:
        return f"attachment; filename*=utf-8''{quoted}"
    return f'attachment; filename="{filename}"'


# ---------------------------------------------------------------------------
# Write text
# ---------------------------------------------------------------------------


def _write_text(payload: WriteTextRequest, request: Request) -> dict:
    data = payload.content.encode("utf-8")
    if len(data) > WRITE_TEXT_MAX_BYTES:
        raise _refuse(413, "Text is too large to save")
    ctx = _context(request)
    target = _guard(payload.path, request, ctx, write=True, follow=False, must_exist=False)
    target = _safe_target(target.parent, (target.name,), ctx)

    try:
        st = os.lstat(target)
    except FileNotFoundError:
        st = None
    if st is not None:
        if stat.S_ISLNK(st.st_mode):
            raise _refuse(400, "Cannot write through a symlink")
        if not stat.S_ISREG(st.st_mode):
            raise _refuse(400, "Path is not a regular file")
        if payload.expected_mtime is not None and abs(st.st_mtime - payload.expected_mtime) > 1e-6:
            raise _refuse(409, "The file changed since it was opened")
        _refuse_live_database(target)
    elif payload.expected_mtime is not None:
        raise _refuse(409, "The file was removed since it was opened")

    def run() -> None:
        fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name[:40]}.", suffix=".bkt-tmp", dir=str(target.parent))
        tmp = Path(tmp_name)
        try:
            with os.fdopen(fd, "wb") as out:
                out.write(data)
            if st is not None:
                os.chmod(tmp, st.st_mode & 0o777)
            _safe_target(_real(target.parent), (target.name,), ctx)
            os.replace(tmp, target)
        finally:
            tmp.unlink(missing_ok=True)

    _io(run)
    new_st = target.stat()
    return {"ok": True, "path": str(target), "size": new_st.st_size, "mtime": new_st.st_mtime}


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


def _iter_search(root: Path, needle: str, deadline: float) -> Iterator[dict | str]:
    queue: deque[Path] = deque([root])
    visited = 0
    while queue:
        directory = queue.popleft()
        try:
            with os.scandir(directory) as scan:
                entries = list(scan)
        except OSError:
            continue
        for entry in entries:
            visited += 1
            if visited > SEARCH_MAX_VISITED or time.monotonic() > deadline:
                yield "truncated"
                return
            path = Path(entry.path)
            if _sensitive(path):
                continue
            try:
                is_dir = entry.is_dir(follow_symlinks=False)
            except OSError:
                continue
            if needle in entry.name.casefold():
                yield {"name": entry.name, "path": str(path), "is_directory": is_dir,
                       "is_symlink": entry.is_symlink()}
            if is_dir and entry.name not in SEARCH_SKIP_DIRS:
                queue.append(path)


def _search(root_raw: str, q: str, request: Request) -> dict:
    needle = q.strip().casefold()
    if not needle:
        raise _refuse(400, "Search text is required")
    ctx = _context(request)
    root = _guard(root_raw, request, ctx, write=False)
    _require_dir(root)
    deadline = time.monotonic() + SEARCH_TIMEOUT_SECONDS
    results: list[dict] = []
    truncated = False
    for item in _iter_search(root, needle, deadline):
        if item == "truncated":
            truncated = True
            break
        results.append(item)  # type: ignore[arg-type]
        if len(results) >= SEARCH_MAX_RESULTS:
            truncated = True
            break
    return {"root": str(root), "results": results, "truncated": truncated}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


def _require_token(request: Request) -> None:
    """Same per-route check as the other bkt plugins; still holds if the plugin is run hosted."""
    from hermes_cli.web_server import _require_token as core_require_token

    core_require_token(request)


@router.post("/move")
async def move(payload: MoveRequest, request: Request):
    _require_token(request)
    return await asyncio.to_thread(_move, payload, request)


@router.post("/rename")
async def rename(payload: RenameRequest, request: Request):
    _require_token(request)
    return await asyncio.to_thread(_rename, payload, request)


@router.post("/copy")
async def copy(payload: CopyRequest, request: Request):
    _require_token(request)
    return await asyncio.to_thread(_copy, payload, request)


@router.post("/unzip")
async def unzip(payload: UnzipRequest, request: Request):
    _require_token(request)
    return await asyncio.to_thread(_unzip, payload, request)


@router.post("/zip")
async def zip_paths(payload: ZipRequest, request: Request):
    _require_token(request)
    handle, size, download, skipped = await asyncio.to_thread(_build_zip, payload.paths, request)
    return StreamingResponse(
        _stream_and_close(handle),
        media_type="application/zip",
        headers={
            "Content-Length": str(size),
            "Content-Disposition": _content_disposition(download),
            "X-BKT-Skipped": _skipped_header(skipped),
            "X-BKT-Skipped-Count": str(len(skipped)),
        },
    )


@router.post("/write-text")
async def write_text(payload: WriteTextRequest, request: Request):
    _require_token(request)
    return await asyncio.to_thread(_write_text, payload, request)


@router.get("/search")
async def search(request: Request, root: str = Query(""), q: str = Query(..., max_length=200)):
    _require_token(request)
    return await asyncio.to_thread(_search, root, q, request)
