"""Zalo Platform Adapter for Hermes Agent — drives a personal Zalo account through the openzca CLI.

One supervised ``openzca listen --raw --self --supervised`` child per adapter carries inbound
messages as NDJSON; every outbound send is a short ``openzca msg ...`` child. openzca keeps the
Zalo cookies in its own profile store (``~/.openzca``); Hermes never reads or forwards them.

config.yaml ``gateway.platforms.zalo.extra`` keys: profile, group_require_mention (true),
openzca_bin. Env vars override config.yaml: ZALO_PROFILE, ZALO_GROUP_REQUIRE_MENTION,
ZALO_OPENZCA_BIN. Chat IDs: a DM is the peer UID, a group is ``group:<groupId>``.

Reconnects belong to the gateway watcher: when the listener exits, the reader classifies why and
raises one fatal error (retryable unless the login itself is gone). The adapter never restarts
the child on its own.
"""

from __future__ import annotations

import asyncio
import contextlib
import datetime
import json
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any, Optional

import httpx

from gateway.config import Platform
from gateway.platforms._shared import (
    get_scoped_secret as _get_scoped_secret, seed_extra_from_env as _seed_extra_from_env, send_error,
)
from gateway.platforms.base import BasePlatformAdapter, SendResult, cache_image_from_url
from gateway.platforms.event import MessageEvent, MessageType
from gateway.platforms.helpers import bounded_put, cancel_task
from plugins.platforms.zalo import groups, media
from plugins.platforms.zalo.openzca_proc import (
    ListenProcess, MsgChildTracker, build_child_env, parse_msg_id, resolve_openzca_argv, run_cli,
)

logger = logging.getLogger(__name__)

_GROUP_PREFIX = "group:"
_PROFILE_RE = re.compile(r"^[A-Za-z0-9_-]+$")
# Zalo user and group IDs are numeric; anything else could be read as a CLI option.
_THREAD_RE = re.compile(r"^[A-Za-z0-9_.]+$")
_CACHE_CAP = 256
_SEND_TIMEOUT = 30.0
_SEND_LOCK_TIMEOUT = 10.0
_ME_ID_TIMEOUT = 15.0
_VERSION_TIMEOUT = 10.0
# openzca release current when this adapter was written (``npm view openzca version``).
MIN_OPENZCA_VERSION = (0, 1, 60)
_VERSION_RE = re.compile(r"(\d+)\.(\d+)\.(\d+)")
# Network trouble outranks auth wording: "zalo.login() failed: getaddrinfo ENOTFOUND" is transient.
_NETWORK_RE = re.compile(
    r"ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|socket hang up|fetch failed"
    r"|timed? ?out|network", re.IGNORECASE)
_AUTH_RE = re.compile(
    r"not logged in|cookie|session (?:expired|invalid)|invalid session|login failed|credential"
    r"|does not exist", re.IGNORECASE)
_NODE_RE = re.compile(r"node:sqlite|ERR_UNKNOWN_BUILTIN_MODULE|Unsupported engine", re.IGNORECASE)
# Only these send failures are fixed by disabling openzca's markdown/mention rendering.
_FORMAT_ERROR_RE = re.compile(r"ambiguous|format|mention", re.IGNORECASE)
_DUPLICATE_LISTENER = "Another openzca listener"
_DUPLICATE_CONNECTION_CODE = 3000
_LOGIN_HINT = "re-run: openzca --profile {profile} auth login"


# ── Config helpers ───────────────────────────────────────────────────────────

def _env_or_extra(extra: dict, env: str, key: str, default: Any = "") -> Any:
    """Env var overrides config.yaml ``extra``."""
    return _get_scoped_secret(env) or extra.get(key, default)


def _extra(config) -> dict:
    return getattr(config, "extra", {}) or {}


def _profile_of(config) -> str:
    return str(_env_or_extra(_extra(config), "ZALO_PROFILE", "profile", "") or "").strip()


def _explicit_bin(config) -> Optional[str]:
    return str(_env_or_extra(_extra(config), "ZALO_OPENZCA_BIN", "openzca_bin", "") or "").strip() or None


def _redact(stderr: str) -> str:
    """The last ``Error:`` line of openzca stderr, secret-redacted and bounded for logs/results."""
    from agent.redact import redact_sensitive_text
    lines = [ln.strip() for ln in (stderr or "").splitlines() if ln.strip()]
    errors = [ln for ln in lines if ln.lower().startswith("error")]
    tail = (errors or lines or ["no error output"])[-1]
    return redact_sensitive_text(tail[:300], force=True)


def classify_cli_failure(stderr: str) -> tuple[str, bool]:
    """``(fatal_code, retryable)`` for a failed ``me id`` / listener start."""
    if _NETWORK_RE.search(stderr or ""):
        return "zalo_connect", True
    if _AUTH_RE.search(stderr or ""):
        return "zalo_auth", False
    return "zalo_connect", True


def _thread_args(chat_id: str) -> tuple[str, list[str]]:
    """``(thread_id, ["--group"] | [])``; raises ValueError for an ID that is not a Zalo thread."""
    chat_id = str(chat_id or "").strip()
    is_group = chat_id.startswith(_GROUP_PREFIX)
    thread = chat_id[len(_GROUP_PREFIX):] if is_group else chat_id
    if not _THREAD_RE.match(thread):
        raise ValueError("invalid Zalo chat id")
    return thread, (["--group"] if is_group else [])


def _msg_args(profile: str, sub: str, chat_id: str, opts: list[str], *,
              before: tuple[str, ...] = (), after: tuple[str, ...] = ()) -> list[str]:
    """``--profile P msg <sub> [--group] <opts> -- <before> <thread> <after>``. Positionals follow
    ``--`` so message text or a path starting with ``-`` is never parsed as an option."""
    thread, group = _thread_args(chat_id)
    return ["--profile", profile, "msg", sub, *group, *opts, "--", *before, thread, *after]


async def _send_text_cli(argv: list[str], profile: str, chat_id: str, content: str, opts: list[str],
                         tracker: Optional[MsgChildTracker] = None) -> tuple[int, str, str]:
    """``msg send``; retried once with ``--raw`` only for formatting / mention-resolution errors."""
    env = build_child_env(profile=profile)
    args = _msg_args(profile, "send", chat_id, opts, after=(content,))
    result = await run_cli(argv, *args, timeout=_SEND_TIMEOUT, env=env, tracker=tracker)
    if result[0] != 0 and _FORMAT_ERROR_RE.search(result[2]):
        args = _msg_args(profile, "send", chat_id, [*opts, "--raw"], after=(content,))
        result = await run_cli(argv, *args, timeout=_SEND_TIMEOUT, env=env, tracker=tracker)
    return result


def _openzca_roots() -> list[Path]:
    roots = [Path.home() / ".openzca", Path.home() / ".openclaw"]
    custom = str(_get_scoped_secret("OPENZCA_HOME", "") or "").strip()
    if custom:
        roots.append(Path(custom).expanduser())
    return roots


def _reject_if_openzca_home(path: str | os.PathLike) -> Path:
    """Resolved ``path``; raises ValueError when it sits inside openzca's credential store, so a
    prompt-injected agent cannot ship the Zalo session cookies to a chat."""
    resolved = Path(os.path.expanduser(str(path))).resolve()
    for root in _openzca_roots():
        with contextlib.suppress(OSError):
            root = root.resolve()
        if resolved == root or resolved.is_relative_to(root):
            raise ValueError("refusing to send a file from the openzca credential store")
    return resolved


def _default_inbound_dir() -> Path:
    """``<HERMES_HOME>/cache/zalo-inbound`` for the profile scope bound at call time."""
    from hermes_constants import get_hermes_home
    return get_hermes_home() / "cache" / "zalo-inbound"


def _parse_version(text: str) -> Optional[tuple[int, int, int]]:
    match = _VERSION_RE.search(text or "")
    return (int(match[1]), int(match[2]), int(match[3])) if match else None


# ── Zalo Adapter ─────────────────────────────────────────────────────────────

class ZaloAdapter(BasePlatformAdapter):
    """Async Zalo adapter over the openzca CLI."""

    serial_receive_loop = True  # the reader awaits each line's dispatch before reading the next
    send_gap_seconds = 1.0  # minimum spacing between sends (ban-risk mitigation)

    def __init__(self, config, **kwargs):
        super().__init__(config=config, platform=Platform("zalo"))
        extra = _extra(config)
        self._profile = _profile_of(config)
        self._require_mention = groups.parse_require_mention(
            _env_or_extra(extra, "ZALO_GROUP_REQUIRE_MENTION", "group_require_mention", True))
        self._openzca_explicit = _explicit_bin(config)
        self._argv: Optional[list[str]] = None
        self._listen: Optional[ListenProcess] = None
        self._reader_task: Optional[asyncio.Task] = None
        self._send_lock = asyncio.Lock()
        self._last_send_at = 0.0
        self._msg_children = MsgChildTracker()
        self._own_uid: Optional[str] = None
        self._closing = False
        self._reply_map: dict[str, dict] = {}
        self._chat_cache: dict[str, dict] = {}
        # Resolved in connect() under the owning profile's scope, then reused off-turn.
        self._pidfile: Optional[Path] = None
        self._inbound_dir: Optional[Path] = None

    def _fail(self, code: str, message: str, *, retryable: bool) -> bool:
        logger.error("Zalo: %s", message)
        self._set_fatal_error(code, message, retryable=retryable)
        return False

    # ── lifecycle ────────────────────────────────────────────────────────

    async def connect(self, *, is_reconnect: bool = False) -> bool:
        """Verify the openzca login, start the listener and the reader task."""
        profile = self._profile
        if not _PROFILE_RE.match(profile):
            return self._fail("zalo_config", "ZALO_PROFILE must be set to an openzca profile name "
                              "([A-Za-z0-9_-]+)", retryable=False)
        argv = resolve_openzca_argv(self._openzca_explicit)
        if argv is None:
            return self._fail("zalo_openzca_missing", "openzca (or Node) not found; install it with "
                              "npm i -g openzca and set ZALO_OPENZCA_BIN if it is not on PATH", retryable=False)
        if not self._acquire_platform_lock("zalo", profile, f"Zalo profile {profile}"):
            return False
        self._inbound_dir = _default_inbound_dir()
        self._pidfile = self._inbound_dir.parent / f"zalo-{profile}.pid"
        listen: Optional[ListenProcess] = None
        connected = False
        try:
            await self._reap_orphan_if_ours()
            if not await self._preflight(argv):
                return False
            own_uid = await self._resolve_own_uid(argv)
            if own_uid is None:
                return False
            listen = ListenProcess(argv, profile, self._inbound_dir)
            await listen.start()
            self._write_pidfile(listen.pid)
            self._argv, self._own_uid, self._listen, self._closing = argv, own_uid, listen, False
            self._reader_task = asyncio.create_task(self._read_loop(listen))
            self._mark_connected()
            self._wire_plugin_handlers(None)
            connected = True
            logger.info("Zalo: connected as profile %s", profile)
            return True
        except OSError as exc:  # spawn failure (EACCES, ENOENT) or pidfile write
            return self._fail("zalo_connect", f"connect failed: {type(exc).__name__}", retryable=True)
        finally:
            if not connected:  # failure, or cancellation (BaseException) mid-connect
                if listen is not None:
                    await listen.stop()
                    self._listen = None
                    self._delete_pidfile()
                self._release_platform_lock()

    async def disconnect(self) -> None:
        """Kill in-flight sends, stop the listener (2 s grace, then SIGKILL), release the lock."""
        self._closing = True
        self._mark_disconnected()
        try:
            await self._msg_children.kill_msg_children()
            if self._listen is not None:
                await self._listen.stop()  # stop the child first so the reader sees EOF
            await cancel_task(self._reader_task)
        finally:
            self._listen = None
            self._reader_task = None
            self._delete_pidfile()
            with contextlib.suppress(Exception):
                self._release_platform_lock()

    async def _preflight(self, argv: list[str]) -> bool:
        """``openzca --version``: catches a too-old Node (``node:sqlite``) or openzca release."""
        try:
            code, out, err = await run_cli(argv, "--version", timeout=_VERSION_TIMEOUT)
        except TimeoutError:
            return self._fail("zalo_connect", "openzca --version timed out", retryable=True)
        if code != 0:
            if _NODE_RE.search(err):
                return self._fail("zalo_node_version", "openzca needs Node >= 22.13", retryable=False)
            return self._fail("zalo_openzca_broken", f"openzca --version failed: {_redact(err)}",
                              retryable=False)
        version = _parse_version(out)
        if version is not None and version < MIN_OPENZCA_VERSION:
            wanted = ".".join(map(str, MIN_OPENZCA_VERSION))
            return self._fail("zalo_openzca_version", f"openzca {'.'.join(map(str, version))} is older "
                              f"than the supported {wanted}; npm i -g openzca@{wanted}", retryable=False)
        return True

    async def _me_id(self, argv: list[str]) -> tuple[int, str, str]:
        return await run_cli(argv, "--profile", self._profile, "me", "id", timeout=_ME_ID_TIMEOUT,
                             env=build_child_env(profile=self._profile))

    async def _resolve_own_uid(self, argv: list[str]) -> Optional[str]:
        try:
            code, out, err = await self._me_id(argv)
        except TimeoutError:
            self._fail("zalo_connect", "openzca me id timed out", retryable=True)
            return None
        uid = out.strip().splitlines()[-1].strip() if out.strip() else ""
        if code == 0 and uid.isdigit():
            return uid
        fatal, retryable = classify_cli_failure(err)
        hint = f" ({_LOGIN_HINT.format(profile=self._profile)})" if fatal == "zalo_auth" else ""
        self._fail(fatal, f"openzca me id failed: {_redact(err)}{hint}", retryable=retryable)
        return None

    # ── pidfile / orphan reaping ─────────────────────────────────────────

    def _write_pidfile(self, pid: Optional[int]) -> None:
        if pid is None or self._pidfile is None:
            return
        from gateway.status import get_process_start_time
        self._pidfile.parent.mkdir(parents=True, exist_ok=True)
        self._pidfile.write_text(json.dumps({"pid": pid, "start_time": get_process_start_time(pid)}),
                                 encoding="utf-8")

    def _delete_pidfile(self) -> None:
        if self._pidfile is not None:
            with contextlib.suppress(OSError):
                self._pidfile.unlink()

    async def _reap_orphan_if_ours(self) -> None:
        """Stop a listener a crashed previous run left behind. Only a live PID whose start-time
        fingerprint matches the pidfile is ours; a dead or recycled PID just clears the pidfile."""
        if self._pidfile is None:
            return
        try:
            recorded = json.loads(self._pidfile.read_text(encoding="utf-8-sig"))
        except FileNotFoundError:
            return
        except (OSError, ValueError):
            recorded = {}
        from gateway.status import get_process_start_time, start_time_fingerprints_match, terminate_pid
        pid, start = recorded.get("pid"), recorded.get("start_time")
        current = get_process_start_time(pid) if isinstance(pid, int) and pid > 0 else None
        if current is not None and start is not None and start_time_fingerprints_match(start, current):
            logger.warning("Zalo: stopping orphaned openzca listener PID %d from a previous run", pid)
            with contextlib.suppress(OSError):
                terminate_pid(pid)
            for _ in range(20):
                if get_process_start_time(pid) is None:
                    break
                await asyncio.sleep(0.1)
            else:
                with contextlib.suppress(OSError):
                    terminate_pid(pid, force=True, expected_start_time=get_process_start_time(pid))
        self._delete_pidfile()

    # ── reader ───────────────────────────────────────────────────────────

    async def _read_loop(self, listen: ListenProcess) -> None:
        ws_code: Any = None
        try:
            async for line in listen:
                if line.get("kind") == "lifecycle":
                    ws_code = line.get("code")
                    continue
                try:
                    await self._on_line(line)
                except Exception:
                    logger.warning("Zalo: failed to route an inbound line", exc_info=True)
            if self._closing:
                return
            exit_code = await listen.wait_exit()
            if self._closing:
                return
            code, message, retryable = await self._classify_listen_exit(ws_code, exit_code, listen.stderr_tail)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # the reader must always end in a fatal so the watcher reconnects
            logger.warning("Zalo: listener reader failed", exc_info=True)
            code, message, retryable = "zalo_disconnected", f"listener reader failed: {type(exc).__name__}", True
        logger.warning("Zalo: listener ended (%s): %s", code, message)
        self._set_fatal_error(code, message, retryable=retryable)
        await self._notify_fatal_error()

    async def _classify_listen_exit(self, ws_code: Any, exit_code: Optional[int],
                                    stderr: str) -> tuple[str, str, bool]:
        """``(fatal_code, message, retryable)`` for a listener that ended on its own."""
        if str(ws_code) == str(_DUPLICATE_CONNECTION_CODE):
            return ("zalo_duplicate_session", "another Zalo session took over the websocket (close "
                    "3000); use a dedicated Zalo account for the agent and keep other clients off it", True)
        if exit_code != 1:
            return "zalo_disconnected", f"openzca listener exited ({exit_code})", True
        if _DUPLICATE_LISTENER in stderr:
            return ("zalo_duplicate_listener", "another openzca listener owns this profile; stop it "
                    "(it is not this gateway's child)", True)
        try:
            code, _, err = await self._me_id(self._argv or [])
        except TimeoutError:
            return "zalo_connect", "listener exited and openzca me id timed out", True
        if code == 0:
            return "zalo_disconnected", f"openzca listener exited (1): {_redact(stderr)}", True
        fatal, retryable = classify_cli_failure(err)
        hint = f" ({_LOGIN_HINT.format(profile=self._profile)})" if fatal == "zalo_auth" else ""
        return fatal, f"openzca login check failed: {_redact(err)}{hint}", retryable

    # ── inbound routing ──────────────────────────────────────────────────

    def _route(self, line: dict) -> Optional[tuple[str, str, str, str, bool]]:
        """``(chat_id, chat_type, chat_name, text, reply_to_self)`` or None to drop the line."""
        sender = str(line.get("senderId") or "")
        thread = str(line.get("threadId") or "")
        if not sender or not thread or sender == self._own_uid:
            return None
        own_uid = self._own_uid or ""
        if line.get("type") == 0:
            name = str(line.get("senderDisplayName") or line.get("senderName") or thread)
            return thread, "dm", name, str(line.get("content") or ""), groups.is_reply_to_self(line, own_uid)
        if line.get("type") != 1:
            return None
        if self._require_mention and not groups.is_addressed(line, own_uid):
            return None
        name = str((line.get("metadata") or {}).get("threadName") or thread)
        return (f"{_GROUP_PREFIX}{thread}", "group", name, groups.group_text(line, own_uid),
                groups.is_reply_to_self(line, own_uid))

    async def _on_line(self, line: dict) -> None:
        inbound_dir = self._inbound_dir or _default_inbound_dir()
        route = self._route(line)
        if route is None:
            media.discard_inbound(line, inbound_dir)
            return
        chat_id, chat_type, chat_name, text, reply_to_self = route
        paths, types, message_type = await media.collect_inbound(line, inbound_dir)
        text = media.strip_media_markers(text)
        if not text and not paths:
            return
        msg_id = str(line.get("msgId") or "")
        if msg_id:
            bounded_put(self._reply_map, msg_id, line, _CACHE_CAP)
        bounded_put(self._chat_cache, chat_id, {"name": chat_name, "type": chat_type}, _CACHE_CAP)
        if not self._message_handler:
            return
        sender = str(line["senderId"])
        user_name = str(line.get("senderDisplayName") or line.get("senderName") or sender)
        source = self.build_source(chat_id=chat_id, chat_name=chat_name, chat_type=chat_type,
                                   user_id=sender, user_name=user_name, message_id=msg_id or None)
        quote = line.get("quote") if isinstance(line.get("quote"), dict) else {}
        await self.handle_message(MessageEvent(
            text=text, message_type=message_type if paths else MessageType.TEXT, source=source,
            raw_message=line, message_id=msg_id or uuid.uuid4().hex, media_urls=paths, media_types=types,
            reply_to_is_own_message=reply_to_self,
            reply_to_author_id=str(quote["ownerId"]) if quote.get("ownerId") else None,
            reply_to_text=quote.get("msg") if isinstance(quote.get("msg"), str) else None,
            timestamp=_line_time(line), reply_expected=True))

    # ── outbound ─────────────────────────────────────────────────────────

    def _reply_payload(self, reply_to: Optional[str]) -> Optional[str]:
        """Reduced ``--reply-message`` JSON: only the fields openzca needs, content capped."""
        line = self._reply_map.get(str(reply_to)) if reply_to else None
        if not line:
            return None
        reduced = {k: line[k] for k in ("msgType", "senderId", "msgId", "cliMsgId", "ts") if k in line}
        reduced["content"] = str(line.get("content") or "")[:100]
        return json.dumps(reduced, ensure_ascii=False)

    async def _locked(self, run, *, require_listener: bool = False) -> SendResult:
        """Run one send under the send lock, after the minimum gap since the previous send."""
        try:
            await asyncio.wait_for(self._send_lock.acquire(), timeout=_SEND_LOCK_TIMEOUT)
        except TimeoutError:
            return SendResult(success=False, error="Zalo send queue is busy", retryable=True)
        try:
            if not self.is_connected or self._argv is None:
                return SendResult(success=False, error="Not connected", retryable=True)
            if require_listener and not (self._listen is not None and self._listen.running):
                # Without the listener's IPC socket an upload opens its own websocket and kicks it.
                return SendResult(success=False, error="Zalo listener is not running", retryable=True)
            wait = self.send_gap_seconds - (time.monotonic() - self._last_send_at)
            if wait > 0:
                await asyncio.sleep(wait)
            try:
                code, out, err = await run(self._argv)
            except TimeoutError:
                return SendResult(success=False, error="openzca send timed out")
            if code != 0:
                return SendResult(success=False, error=_redact(err))
            return SendResult(success=True, message_id=parse_msg_id(out))
        finally:
            self._last_send_at = time.monotonic()
            self._send_lock.release()

    async def _run_msg(self, sub: str, chat_id: str, opts: list[str], *, before: tuple[str, ...] = (),
                       after: tuple[str, ...] = (), require_listener: bool = False) -> SendResult:
        try:
            args = _msg_args(self._profile, sub, chat_id, opts, before=before, after=after)
        except ValueError as exc:
            return SendResult(success=False, error=str(exc))
        env = build_child_env(profile=self._profile)
        return await self._locked(
            lambda argv: run_cli(argv, *args, timeout=_SEND_TIMEOUT, env=env, tracker=self._msg_children),
            require_listener=require_listener)

    async def send(self, chat_id: str, content: str, reply_to: Optional[str] = None,
                   metadata: Optional[dict[str, Any]] = None) -> SendResult:
        try:
            _thread_args(chat_id)
        except ValueError as exc:
            return SendResult(success=False, error=str(exc))
        reply = self._reply_payload(reply_to)
        opts = ["--reply-message", reply] if reply else []
        return await self._locked(lambda argv: _send_text_cli(
            argv, self._profile, chat_id, content, opts, tracker=self._msg_children))

    async def send_typing(self, chat_id: str, metadata=None) -> None:
        """Typing indicators are a non-goal (each one would cost a Node start and a Zalo login)."""

    async def get_chat_info(self, chat_id: str) -> dict[str, Any]:
        cached = self._chat_cache.get(chat_id)
        if cached:
            return dict(cached)
        return {"name": chat_id, "type": "group" if chat_id.startswith(_GROUP_PREFIX) else "dm"}

    @staticmethod
    def _local_file(path: str) -> tuple[Optional[Path], Optional[SendResult]]:
        try:
            resolved = _reject_if_openzca_home(path)
        except ValueError as exc:
            logger.warning("Zalo: %s", exc)
            return None, SendResult(success=False, error=str(exc))
        if not resolved.is_file():
            return None, SendResult(success=False, error="file not found")
        return resolved, None

    async def _send_image_path(self, chat_id: str, path: Path, caption: Optional[str]) -> SendResult:
        opts = ["-m", caption] if caption else []
        return await self._run_msg("image", chat_id, opts, after=(str(path),))

    async def send_image(self, chat_id: str, image_url: str, caption: Optional[str] = None,
                         reply_to: Optional[str] = None, metadata: Optional[dict[str, Any]] = None) -> SendResult:
        """Remote images are downloaded through Hermes' SSRF-guarded cache first: openzca's own
        ``-u <url>`` fetch has no SSRF protection, so it is never used."""
        if not str(image_url).lower().startswith(("http://", "https://")):
            return await self.send_image_file(chat_id, image_url, caption, reply_to, metadata)
        try:
            local = await cache_image_from_url(image_url)
        except (ValueError, OSError, httpx.HTTPError) as exc:  # SSRF refusal, size cap, HTTP error; never -u
            return SendResult(success=False, error=f"image download failed: {type(exc).__name__}")
        return await self._send_image_path(chat_id, Path(local), caption)

    async def send_image_file(self, chat_id: str, image_path: str, caption: Optional[str] = None,
                              reply_to: Optional[str] = None, metadata: Optional[dict[str, Any]] = None,
                              **kwargs) -> SendResult:
        path, error = self._local_file(image_path)
        if error is not None:
            return error
        return await self._send_image_path(chat_id, path, caption)

    async def _upload(self, chat_id: str, file_path: str, caption: Optional[str], reply_to: Optional[str],
                      metadata: Optional[dict[str, Any]]) -> SendResult:
        """``msg upload`` through the listener IPC (voice/video go out as file attachments: openzca's
        native voice/video uploads open a second websocket that kicks the listener)."""
        path, error = self._local_file(file_path)
        if error is not None:
            return error
        result = await self._run_msg("upload", chat_id, [], before=(str(path),), require_listener=True)
        if result.success and caption:
            await self.send(chat_id, caption, reply_to=reply_to, metadata=metadata)
        return result

    async def send_document(self, chat_id: str, file_path: str, caption: Optional[str] = None,
                            file_name: Optional[str] = None, reply_to: Optional[str] = None,
                            metadata: Optional[dict[str, Any]] = None, **kwargs) -> SendResult:
        return await self._upload(chat_id, file_path, caption, reply_to, metadata)

    async def send_voice(self, chat_id: str, audio_path: str, caption: Optional[str] = None,
                         reply_to: Optional[str] = None, metadata: Optional[dict[str, Any]] = None,
                         **kwargs) -> SendResult:
        return await self._upload(chat_id, audio_path, caption, reply_to, metadata)

    async def send_video(self, chat_id: str, video_path: str, caption: Optional[str] = None,
                         reply_to: Optional[str] = None, metadata: Optional[dict[str, Any]] = None,
                         **kwargs) -> SendResult:
        return await self._upload(chat_id, video_path, caption, reply_to, metadata)


def _line_time(line: dict) -> datetime.datetime:
    try:
        return datetime.datetime.fromtimestamp(float(line["timestamp"]))
    except (KeyError, TypeError, ValueError, OverflowError, OSError):
        return datetime.datetime.now()


# ── Plugin registration ──────────────────────────────────────────────────────

def check_requirements() -> bool:
    """Passive: ZALO_PROFILE set and openzca resolvable (no spawn; connect() probes versions)."""
    profile = str(_get_scoped_secret("ZALO_PROFILE", "") or "").strip()
    explicit = str(_get_scoped_secret("ZALO_OPENZCA_BIN", "") or "").strip() or None
    return bool(profile) and resolve_openzca_argv(explicit) is not None


def validate_config(config) -> bool:
    """The platform config (env or config.yaml) names an openzca profile."""
    return bool(_PROFILE_RE.match(_profile_of(config)))


def is_connected(config) -> bool:
    """Check whether Zalo is configured (env or config.yaml)."""
    return validate_config(config)


def _env_enablement() -> dict | None:
    """``env_enablement_fn``: seed ``PlatformConfig.extra`` from the profile's env before adapter
    construction; ``None`` when ZALO_PROFILE is unset."""
    profile = str(_get_scoped_secret("ZALO_PROFILE", "") or "").strip()
    if not profile:
        return None
    seed = _seed_extra_from_env((
        ("ZALO_GROUP_REQUIRE_MENTION", "group_require_mention", groups.parse_require_mention),
        ("ZALO_OPENZCA_BIN", "openzca_bin", None),
    ), home_env="ZALO_HOME_THREAD")
    return {"profile": profile, **seed}


async def _standalone_send(pconfig, chat_id: str, message: str, *, thread_id: Optional[str] = None,
                           media_files: Optional[list[str]] = None, force_document: bool = False) -> dict[str, Any]:
    """One ``openzca msg send`` outside the gateway (cron delivery via ``send_message_tool``).
    Text only: uploads need the gateway's listener. ``thread_id``/``media_files`` are accepted for
    signature parity."""
    profile = _profile_of(pconfig)
    if not _PROFILE_RE.match(profile):
        return send_error("Zalo standalone send: ZALO_PROFILE must be configured")
    argv = resolve_openzca_argv(_explicit_bin(pconfig))
    if argv is None:
        return send_error("Zalo standalone send: openzca not found")
    try:
        code, out, err = await _send_text_cli(argv, profile, chat_id, message, [])
    except ValueError as exc:
        return send_error(f"Zalo standalone send: {exc}")
    except TimeoutError:
        return send_error("Zalo standalone send: openzca timed out")
    if code != 0:
        return send_error(f"Zalo standalone send failed: {_redact(err)}")
    return {"success": True, "message_id": parse_msg_id(out)}


def register(ctx):
    """Plugin entry point: called by the Hermes plugin system."""
    ctx.register_platform(
        name="zalo",
        label="Zalo",
        adapter_factory=ZaloAdapter,
        check_fn=check_requirements,
        validate_config=validate_config,
        is_connected=is_connected,
        required_env=["ZALO_PROFILE"],
        allowed_users_env="ZALO_ALLOWED_USERS",
        allow_all_env="ZALO_ALLOW_ALL_USERS",
        allowlist_suppresses_pairing=True,
        cron_deliver_env_var="ZALO_HOME_THREAD",
        standalone_sender_fn=_standalone_send,
        max_message_length=2000,
        install_hint=("npm i -g openzca@<VERSION> (Node >= 22.13), then: openzca --profile <name> auth "
                      "login — replace <VERSION> with the minimum version recorded in docs/bkt/zalo.md"),
        env_enablement_fn=_env_enablement,
        platform_hint=(
            "You are chatting via Zalo. Zalo renders **bold**, *italic* and lists but not tables "
            "or code fences. WARNING: ZALO_ALLOW_ALL_USERS exposes the agent to every contact "
            "and group member who @mentions it."),
        emoji="💬",
    )
