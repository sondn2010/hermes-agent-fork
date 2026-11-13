"""bkt-profiles backend: the requested profile's API server key (``API_SERVER_KEY``).

Mounted at ``/api/plugins/bkt-profiles/``. The dashboard runs every request inside
``_plugin_route_secret_scope``, which binds ``?profile=`` to that profile's home and secret scope,
so ``load_env``/``load_config`` and the credential-lifecycle writers below all act on the requested
profile. Key generation stays on the backend; persistence reuses the core credential lifecycle so
config.yaml mirrors and the credential pool are reconciled exactly as the Keys page does.

Which value the api_server adapter uses (``gateway/config_env.py`` ``_api_server``): a usable
``.env`` key (``has_usable_secret(min_length=16)``) overrides the config.yaml
``platforms.api_server`` key; otherwise the config.yaml key, if any, is used.

Which listener serves it: a named profile gets a gateway of its own only when its config.yaml sets
``gateway.standalone: true`` (``hermes_cli/gateway.py`` refuses to start any other named profile's
gateway). Every other named profile is served by the default profile's gateway at
``/p/<profile>/v1``, where only its own ``.env`` key is read, live per request (``api_server.py``
``_expected_api_key``), so a new key needs no restart there.

Secrets: the full key value appears in exactly one place, the ``generate`` response. Reads are
masked and audit lines name only the variable and the profile.
"""

from __future__ import annotations

import logging
import secrets
import threading
import time
from collections import deque
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()
_log = logging.getLogger("bkt.profiles")

ENV_KEY = "API_SERVER_KEY"
MIN_KEY_LENGTH = 16  # the adapter's startup guard (gateway/config.py _has_usable_api_server_key)
RATE_WINDOW_SECONDS = 30.0
RATE_MAX_CALLS = 5
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8642  # gateway/platforms/api_server.py DEFAULT_PORT
_WILDCARD_HOSTS = {"0.0.0.0", "::", "[::]", ""}
_MASK = "•" * 8

_registry_lock = threading.Lock()
_profile_locks: dict[str, threading.Lock] = {}
_generate_calls: dict[str, deque] = {}


class GenerateRequest(BaseModel):
    rotate: bool = False


@dataclass(frozen=True)
class _KeyState:
    profile: str
    value: str
    source: str  # "env" | "config" | "none"
    endpoint: str
    base_url: str

    def public(self) -> dict[str, Any]:
        from hermes_cli.auth import has_usable_secret

        return {
            "present": bool(self.value),
            "masked": _mask(self.value),
            "strong": has_usable_secret(self.value, min_length=MIN_KEY_LENGTH),
            "source": self.source,
            "endpoint": self.endpoint,
            "base_url": self.base_url,
        }


def _require_token(request: Request) -> None:
    from hermes_cli.web_server import _require_token as guard

    guard(request)


def _mask(value: str) -> str:
    # A short key is mostly its last four characters, so only long keys keep a visible tail.
    if not value:
        return ""
    return _MASK + value[-4:] if len(value) >= MIN_KEY_LENGTH else _MASK


@contextmanager
def _home_scope(path: Path) -> Iterator[None]:
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override

    token = set_hermes_home_override(str(path))
    try:
        yield
    finally:
        reset_hermes_home_override(token)


def _scoped_profile() -> tuple[str, Path]:
    """Name and home of the profile this request is scoped to."""
    from hermes_constants import get_hermes_home, profile_name_for_home

    home = get_hermes_home()
    return profile_name_for_home(home) or "custom", home


def _served_on_shared_listener(profile: str, home: Path) -> bool:
    if profile in ("default", "custom"):
        return False
    from hermes_cli.profiles import profile_is_standalone

    return not profile_is_standalone(home)


def _api_server_section(config: dict) -> dict:
    """``platforms.api_server`` flattened the way ``PlatformConfig.from_dict`` reads it: top-level
    keys plus ``extra``, where ``extra`` wins on a clash."""
    platforms = config.get("platforms")
    section = platforms.get("api_server") if isinstance(platforms, dict) else None
    if not isinstance(section, dict):
        return {}
    extra = section.get("extra")
    return {**section, **(extra if isinstance(extra, dict) else {})}


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _listener_base_url(listener_home: Path, path: str) -> str:
    """Base URL of the listener serving ``path``. Env wins over config.yaml, as in
    ``_api_server``; wildcard binds are shown as loopback."""
    from hermes_cli.config import load_config, load_env

    with _home_scope(listener_home):
        section, env = _api_server_section(load_config()), load_env()
    host = _text(env.get("API_SERVER_HOST")) or _text(str(section.get("host") or "")) or DEFAULT_HOST
    if host in _WILDCARD_HOSTS:
        host = DEFAULT_HOST
    raw_port = _text(env.get("API_SERVER_PORT")) or str(section.get("port") or "")
    port = int(raw_port) if raw_port.isdigit() and 0 < int(raw_port) < 65536 else DEFAULT_PORT
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    return f"http://{host}:{port}{path}"


def _key_state() -> _KeyState:
    from hermes_cli.auth import has_usable_secret
    from hermes_cli.config import load_config, load_env
    from hermes_constants import get_default_hermes_root

    profile, home = _scoped_profile()
    shared = _served_on_shared_listener(profile, home)
    env_value = _text(load_env().get(ENV_KEY))
    # The shared listener never reads a secondary's config.yaml key.
    config_value = "" if shared else _text(_api_server_section(load_config()).get("key"))

    if has_usable_secret(env_value, min_length=MIN_KEY_LENGTH) or (env_value and not config_value):
        value, source = env_value, "env"
    elif config_value:
        value, source = config_value, "config"
    else:
        value, source = "", "none"

    endpoint = f"/p/{profile}/v1" if shared else "/v1"
    base_url = _listener_base_url(get_default_hermes_root() if shared else home, endpoint)
    return _KeyState(profile=profile, value=value, source=source, endpoint=endpoint, base_url=base_url)


def _profile_lock(key: str) -> threading.Lock:
    with _registry_lock:
        return _profile_locks.setdefault(key, threading.Lock())


def _check_rate(key: str) -> None:
    now = time.monotonic()
    with _registry_lock:
        calls = _generate_calls.setdefault(key, deque())
        while calls and calls[0] <= now - RATE_WINDOW_SECONDS:
            calls.popleft()
        if len(calls) >= RATE_MAX_CALLS:
            raise HTTPException(status_code=429, detail="Too many key generations for this profile. Try again shortly.")
        calls.append(now)


@contextmanager
def _env_write_errors(action: str, profile: str) -> Iterator[None]:
    """A locked ``.env`` (managed install or administrator scope) is a 409 with the core's own
    refusal text; anything else is logged by type only, never with the exception text."""
    try:
        yield
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OSError as exc:
        _log.error("bkt-profiles api-key %s failed: key=%s profile=%s error=%s",
                   action, ENV_KEY, profile, type(exc).__name__)
        raise HTTPException(status_code=500, detail=f"Could not update {ENV_KEY} in the profile's .env") from exc


@router.get("/api-key")
def get_api_key(request: Request) -> dict[str, Any]:
    _require_token(request)
    return _key_state().public()


@router.post("/api-key/generate")
def generate_api_key(request: Request, body: Optional[GenerateRequest] = None) -> dict[str, Any]:
    _require_token(request)
    rotate = bool(body and body.rotate)
    profile, home = _scoped_profile()
    lock_key = str(home.resolve())
    # One lock around check and write: two clicks cannot both see "no key" and both write.
    with _profile_lock(lock_key):
        state = _key_state()
        if state.source == "config":
            raise HTTPException(
                status_code=409,
                detail=(f"Profile '{profile}' uses the API server key set in config.yaml "
                        "(platforms.api_server.key). A generated .env key would silently replace it for "
                        "every client; remove the config.yaml key first, or keep managing it there."))
        if state.value and not rotate:
            raise HTTPException(
                status_code=409,
                detail=f"Profile '{profile}' already has an API server key. Confirm rotation to replace it.")
        # Charged only for a real generation: a refused click does not use up the window.
        _check_rate(lock_key)
        value = secrets.token_urlsafe(32)
        from hermes_cli.credential_lifecycle import save_provider_env_credential

        with _env_write_errors("generate", profile):
            save_provider_env_credential(ENV_KEY, value)
        _log.info("bkt-profiles api-key generate: key=%s profile=%s rotated=%s", ENV_KEY, profile, bool(state.value))
        result = _key_state().public()
    return {**result, "key": value}


@router.delete("/api-key")
def delete_api_key(request: Request) -> dict[str, Any]:
    _require_token(request)
    profile, home = _scoped_profile()
    with _profile_lock(str(home.resolve())):
        from hermes_cli.credential_lifecycle import remove_provider_env_credential

        with _env_write_errors("delete", profile):
            outcome = remove_provider_env_credential(ENV_KEY)
        if not outcome.get("removed"):
            raise HTTPException(status_code=404, detail=f"{ENV_KEY} is not set in profile '{profile}' .env")
        _log.info("bkt-profiles api-key delete: key=%s profile=%s", ENV_KEY, profile)
        return _key_state().public()
