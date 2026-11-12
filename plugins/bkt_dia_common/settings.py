"""Call-time settings for the DIA ES query service.

Everything is read when a tool runs, never at import: one process serves many profiles, and the
active profile's ``config.yaml`` / ``.env`` must win for every call.

* ``plugins.entries.bkt-dia-common.settings.endpoint``         base URL (required)
* ``plugins.entries.bkt-dia-common.settings.timeout_seconds``  default 15, clamped to (0, 60]
* ``plugins.entries.bkt-dia-common.settings.max_sources``      default 20, clamped to [0, 100]
* ``BKT_DIA_QUERY_API_KEY`` in the profile's ``.env``          optional bearer key (reverse proxy)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Mapping, Optional
from urllib.parse import urlsplit, urlunsplit

PLUGIN_ID = "bkt-dia-common"
API_KEY_ENV = "BKT_DIA_QUERY_API_KEY"
QUERY_PATH = "/api/v1/query"  # FastAPI API_V1_PREFIX ("/api/v1") + router prefix ("/query")

DEFAULT_TIMEOUT_SECONDS = 15.0
MAX_TIMEOUT_SECONDS = 60.0
DEFAULT_MAX_SOURCES = 20
MAX_SOURCES_CAP = 100


@dataclass(frozen=True)
class DiaSettings:
    """Resolved settings for one query. ``endpoint`` is the raw configured base URL ("" when unset)."""

    endpoint: str
    timeout_seconds: float
    max_sources: int
    api_key: Optional[str]


def _config() -> Mapping[str, Any]:
    from hermes_cli.config import load_config_readonly

    cfg = load_config_readonly()
    return cfg if isinstance(cfg, Mapping) else {}


def _plugins_section(cfg: Mapping[str, Any]) -> Mapping[str, Any]:
    section = cfg.get("plugins")
    return section if isinstance(section, Mapping) else {}


def _settings_mapping(cfg: Mapping[str, Any]) -> Mapping[str, Any]:
    entries = _plugins_section(cfg).get("entries")
    entry = entries.get(PLUGIN_ID) if isinstance(entries, Mapping) else None
    settings = entry.get("settings") if isinstance(entry, Mapping) else None
    return settings if isinstance(settings, Mapping) else {}


def _as_timeout(raw: Any) -> float:
    if isinstance(raw, bool):
        return DEFAULT_TIMEOUT_SECONDS
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return DEFAULT_TIMEOUT_SECONDS
    if not math.isfinite(value) or value <= 0:
        return DEFAULT_TIMEOUT_SECONDS
    return min(value, MAX_TIMEOUT_SECONDS)


def _as_max_sources(raw: Any) -> int:
    if isinstance(raw, bool):
        return DEFAULT_MAX_SOURCES
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_MAX_SOURCES
    return max(0, min(value, MAX_SOURCES_CAP))


def _api_key() -> Optional[str]:
    # Published plugin API: reads <get_hermes_home()>/.env first, then the profile-scoped secret
    # (agent.secret_scope), so a multiplexed process never hands one profile another's key.
    from hermes_cli.config import get_env_value_prefer_dotenv

    value = (get_env_value_prefer_dotenv(API_KEY_ENV) or "").strip()
    return value or None


def configured_endpoint() -> str:
    """The active profile's configured base URL ("" when unset), without touching any secret."""
    endpoint = _settings_mapping(_config()).get("endpoint")
    return endpoint.strip() if isinstance(endpoint, str) else ""


def load_settings() -> DiaSettings:
    """Resolve the active profile's settings now."""
    raw = _settings_mapping(_config())
    return DiaSettings(
        endpoint=configured_endpoint(),
        timeout_seconds=_as_timeout(raw.get("timeout_seconds", DEFAULT_TIMEOUT_SECONDS)),
        max_sources=_as_max_sources(raw.get("max_sources", DEFAULT_MAX_SOURCES)),
        api_key=_api_key(),
    )


def is_common_enabled() -> bool:
    """True when ``bkt-dia-common`` is in ``plugins.enabled`` and not in ``plugins.disabled``."""
    plugins = _plugins_section(_config())
    enabled, disabled = plugins.get("enabled"), plugins.get("disabled")
    if not isinstance(enabled, list) or PLUGIN_ID not in enabled:
        return False
    return not (isinstance(disabled, list) and PLUGIN_ID in disabled)


def query_url(endpoint: str) -> str:
    """Normalize a configured base URL to the query route.

    ``http://h:8000``, ``http://h:8000/``, ``http://h:8000/api/v1`` and ``http://h:8000/api/v1/query``
    all become ``http://h:8000/api/v1/query``; a reverse-proxy path prefix is kept
    (``https://h/dia`` -> ``https://h/dia/api/v1/query``). Query strings and fragments are dropped.
    Raises ``ValueError`` for a non-http(s) URL or one without a host.
    """
    parts = urlsplit(endpoint.strip())
    if parts.scheme.lower() not in {"http", "https"} or not parts.netloc:
        raise ValueError("endpoint must be an absolute http(s) URL")
    path = parts.path.rstrip("/")
    if path.endswith(QUERY_PATH):
        pass
    elif path.endswith("/api/v1"):
        path += "/query"
    else:
        path += QUERY_PATH
    return urlunsplit((parts.scheme.lower(), parts.netloc, path, "", ""))
