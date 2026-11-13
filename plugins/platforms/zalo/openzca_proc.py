"""openzca process layer: executable resolution, one-shot ``msg``/``me`` children and the
supervised ``listen --raw`` child. No gateway imports, so the adapter, the standalone cron sender
and the tests share one spawn path.

Every child gets a credential-scrubbed env (``hermes_subprocess_env``): openzca reads its own
cookies from its profile store and needs no Hermes secret. Every child is killed on timeout or
cancellation, so a stuck ``node`` never outlives the coroutine that spawned it.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import re
from collections import deque
from pathlib import Path
from typing import Any, AsyncIterator, Optional

logger = logging.getLogger(__name__)

STOP_GRACE_SECONDS = 2.0
_STDERR_TAIL_LINES = 20
# Node shims that cannot be exec'd directly (Windows npm installs a .cmd/.ps1 wrapper).
_SHIM_SUFFIXES = (".cmd", ".ps1")
_MSG_ID_RE = re.compile(r"msgId:\s*'?(\d+)")
# 64 KiB default readline limit is too small for a long message line with media metadata.
_STREAM_LIMIT = 4 * 1024 * 1024


def _node_executable() -> Optional[str]:
    """PM-managed Node first, then PATH (openzca needs Node >= 22.13 for ``node:sqlite``)."""
    from hermes_constants import find_node_executable
    from hermes_platform.resolver.core import locate_command

    node = find_node_executable("node")
    if node:
        return node
    hit = locate_command("node")
    return hit.command[0] if hit.found else None


def _node_wrapped(script: Path) -> Optional[list[str]]:
    node = _node_executable()
    return [node, str(script)] if node else None


def _argv_for_hit(path: str) -> Optional[list[str]]:
    """``openzca`` at ``path`` -> spawnable argv; shims and bare ``.js`` entry points run under Node."""
    lowered = path.lower()
    if lowered.endswith(_SHIM_SUFFIXES):
        return _node_wrapped(Path(path).parent / "node_modules" / "openzca" / "dist" / "cli.js")
    if lowered.endswith((".js", ".mjs", ".cjs")):
        return _node_wrapped(Path(path))
    return [path]


def resolve_openzca_argv(explicit: Optional[str]) -> Optional[list[str]]:
    """argv prefix that runs openzca, or None when it is not installed.

    An explicit path (``ZALO_OPENZCA_BIN``) wins over PATH lookup and goes through the same shim
    rewrite, so a Windows ``openzca.cmd`` configured explicitly still spawns without ``cmd.exe``.
    """
    from hermes_platform.resolver.core import locate_command

    if explicit:
        expanded = os.path.expanduser(str(explicit).strip())
        if not os.path.isabs(expanded) or not os.path.isfile(expanded):
            logger.warning("Zalo: ZALO_OPENZCA_BIN is not an existing absolute path; ignoring it")
            return None
        return _argv_for_hit(expanded)
    hit = locate_command("openzca")
    return _argv_for_hit(hit.command[0]) if hit.found else None


def build_child_env(*, profile: str = "", media_dir: Optional[Path] = None) -> dict[str, str]:
    """Scrubbed child env: no Hermes secrets, PM Node on PATH, headless openzca settings."""
    from hermes_constants import with_hermes_node_path
    from tools.environments.local import hermes_subprocess_env

    env = with_hermes_node_path(hermes_subprocess_env())
    env["OPENZCA_LISTEN_HEARTBEAT_MS"] = "30000"
    env["OPENZCA_QR_AUTO_OPEN"] = "0"
    # The legacy OpenClaw state dir would override OPENZCA_LISTEN_MEDIA_DIR's location.
    env.pop("OPENCLAW_STATE_DIR", None)
    if media_dir is not None:
        env["OPENZCA_LISTEN_MEDIA_DIR"] = str(media_dir)
    if profile:
        env["OPENZCA_PROFILE"] = profile
    return env


async def terminate_process(proc: asyncio.subprocess.Process, grace: float = STOP_GRACE_SECONDS) -> None:
    """SIGTERM, wait ``grace`` s, then SIGKILL. The ``finally`` kills even when the caller is
    cancelled mid-wait, so a gateway shutdown cannot strand the child."""
    try:
        if proc.returncode is None:
            with contextlib.suppress(ProcessLookupError):
                proc.terminate()
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(proc.wait(), timeout=grace)
    finally:
        if proc.returncode is None:
            with contextlib.suppress(ProcessLookupError):
                proc.kill()
            with contextlib.suppress(TimeoutError, asyncio.CancelledError):
                await asyncio.wait_for(proc.wait(), timeout=grace)


class MsgChildTracker:
    """Live one-shot ``msg`` children of ONE adapter, so its ``disconnect()`` kills sends still in
    flight without touching another profile's adapter in the same process."""

    def __init__(self) -> None:
        self._procs: set[asyncio.subprocess.Process] = set()

    def track_msg_child(self, proc: asyncio.subprocess.Process) -> None:
        self._procs.add(proc)

    def untrack(self, proc: asyncio.subprocess.Process) -> None:
        self._procs.discard(proc)

    async def kill_msg_children(self) -> None:
        procs, self._procs = list(self._procs), set()
        await asyncio.gather(*(terminate_process(p, grace=0.5) for p in procs), return_exceptions=True)


async def run_cli(argv: list[str], *args: str, timeout: float, env: Optional[dict[str, str]] = None,
                  tracker: Optional[MsgChildTracker] = None) -> tuple[int, str, str]:
    """Run one openzca command; ``(exit_code, stdout, stderr)``. Raises ``TimeoutError`` after
    killing the child when ``timeout`` expires; cancellation kills it too."""
    proc = await asyncio.create_subprocess_exec(
        *argv, *args, stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE, env=env if env is not None else build_child_env())
    if tracker is not None:
        tracker.track_msg_child(proc)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except BaseException:
        await terminate_process(proc, grace=0.5)
        raise
    finally:
        if tracker is not None:
            tracker.untrack(proc)
    return (proc.returncode if proc.returncode is not None else -1,
            out.decode("utf-8", errors="replace"), err.decode("utf-8", errors="replace"))


def parse_msg_id(stdout: str) -> Optional[str]:
    """First ``msgId`` in openzca's ``util.inspect`` send output (it prints no JSON)."""
    match = _MSG_ID_RE.search(stdout or "")
    return match.group(1) if match else None


def parse_listen_line(raw: str) -> Optional[dict[str, Any]]:
    """A JSON object line from ``listen --raw`` stdout, else None (banners, plain-text notices)."""
    raw = raw.strip()
    if not raw.startswith("{"):
        return None
    try:
        parsed = json.loads(raw)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


class ListenProcess:
    """The single ``openzca --profile P listen --raw --self --supervised`` child for one adapter.

    Iterate it for message dicts. Lifecycle lines (``kind`` key) are logged and skipped, except
    ``closed``, which is yielded so the caller can read the websocket close ``code``. Iteration
    ends at stdout EOF; ``wait_exit()`` then returns the exit code and ``stderr_tail`` holds the
    last stderr lines for classification.
    """

    def __init__(self, argv: list[str], profile: str, media_dir: Path) -> None:
        self._argv = argv
        self._profile = profile
        self._media_dir = media_dir
        self._proc: Optional[asyncio.subprocess.Process] = None
        self._stderr_task: Optional[asyncio.Task] = None
        self._stderr: deque[str] = deque(maxlen=_STDERR_TAIL_LINES)

    @property
    def pid(self) -> Optional[int]:
        return self._proc.pid if self._proc else None

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.returncode is None

    @property
    def stderr_tail(self) -> str:
        return "\n".join(self._stderr)

    async def start(self) -> None:
        self._media_dir.mkdir(parents=True, exist_ok=True)
        self._proc = await asyncio.create_subprocess_exec(
            *self._argv, "--profile", self._profile, "listen", "--raw", "--self", "--supervised",
            stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE, limit=_STREAM_LIMIT,
            env=build_child_env(profile=self._profile, media_dir=self._media_dir))
        self._stderr_task = asyncio.create_task(self._drain_stderr())

    async def _drain_stderr(self) -> None:
        # Draining keeps the pipe from filling and blocking the child; only a tail is kept.
        assert self._proc is not None and self._proc.stderr is not None
        async for raw in self._proc.stderr:
            line = raw.decode("utf-8", errors="replace").rstrip()
            if line:
                self._stderr.append(line)

    async def __aiter__(self) -> AsyncIterator[dict[str, Any]]:
        if self._proc is None or self._proc.stdout is None:
            return
        async for raw in self._proc.stdout:
            line = parse_listen_line(raw.decode("utf-8", errors="replace"))
            if line is None:
                continue
            if "kind" not in line:
                yield line
                continue
            if line.get("kind") != "lifecycle":
                continue  # group polls and other non-message events
            event = line.get("event")
            if event == "error":
                logger.info("Zalo listener reported an error event")
            elif event == "closed":
                logger.warning("Zalo listener websocket closed (code %s)", line.get("code"))
                yield line

    async def wait_exit(self, timeout: float = STOP_GRACE_SECONDS * 2) -> Optional[int]:
        """Exit code after stdout EOF (None when the child is still alive after ``timeout``)."""
        if self._proc is None:
            return None
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self._proc.wait(), timeout=timeout)
        if self._stderr_task is not None:
            with contextlib.suppress(TimeoutError, asyncio.CancelledError):
                await asyncio.wait_for(asyncio.shield(self._stderr_task), timeout=0.5)
        return self._proc.returncode

    async def stop(self) -> None:
        """Terminate the child (2 s grace, then SIGKILL) and stop draining stderr."""
        try:
            if self._proc is not None:
                await terminate_process(self._proc)
        finally:
            if self._stderr_task is not None and not self._stderr_task.done():
                self._stderr_task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await self._stderr_task

