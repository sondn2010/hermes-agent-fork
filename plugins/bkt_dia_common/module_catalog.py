"""Read-only catalog of the bundled ``bkt-dia-*`` modules for the dashboard console.

Each sibling ``plugins/bkt-dia-<slug>/`` is described from its ``plugin.yaml`` and the ``MODULE``
spec in its ``__init__.py``. The file is loaded by path under a private module name and its
``register()`` is never called, so listing modules registers no tools. The module's own absolute
``plugins.bkt_dia_common.*`` imports resolve to the already-loaded shared package; only the module
file itself loads privately. Parsed entries are cached per directory and refreshed when either
file changes; ``enabled`` is read from the active profile on every call. A module that fails to
load is listed with ``"error"`` instead of failing the whole catalog.
"""

from __future__ import annotations

import importlib.util
import logging
import threading
from pathlib import Path
from typing import Any, Mapping, Optional

from hermes_yaml import safe_load

from plugins.bkt_dia_common.categories import CATEGORIES, CATEGORY_TAG_PREFIX
from plugins.bkt_dia_common.settings import is_module_enabled
from plugins.bkt_dia_common.tool_factory import validate_module_spec

logger = logging.getLogger(__name__)

PLUGINS_ROOT = Path(__file__).resolve().parent.parent
MODULE_DIR_GLOB = "bkt-dia-*"
_CATEGORY_ORDER = {slug: index for index, slug in enumerate(CATEGORIES)}

# directory -> (file mtimes, catalog entry without ``enabled``, MODULE spec or None when broken)
_cache: dict[Path, tuple[tuple[int, ...], dict[str, Any], Optional[Mapping[str, Any]]]] = {}
_cache_lock = threading.Lock()


def categories() -> list[dict[str, str]]:
    """Every category in display order, with both labels."""
    return [{"slug": slug, "label_vi": labels["vi"], "label_en": labels["en"]}
            for slug, labels in CATEGORIES.items()]


def _category(tags: Any) -> Optional[str]:
    for tag in tags if isinstance(tags, list) else []:
        if isinstance(tag, str) and tag.startswith(CATEGORY_TAG_PREFIX):
            slug = tag[len(CATEGORY_TAG_PREFIX):]
            if slug in CATEGORIES:
                return slug
    return None


def _title(name: str) -> str:
    """``bkt-dia-enterprise-profile`` -> ``Enterprise Profile``."""
    return name.removeprefix("bkt-dia-").replace("-", " ").title()


def _load_module_spec(directory: Path) -> Mapping[str, Any]:
    slug = directory.name.removeprefix("bkt-dia-").replace("-", "_")
    path = directory / "__init__.py"
    spec = importlib.util.spec_from_file_location(f"_bkt_dia_catalog_{slug}", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {directory.name}/__init__.py")
    loaded = importlib.util.module_from_spec(spec)
    # Compile from source instead of exec_module: a .pyc is validated by whole-second mtime and
    # size, so a same-size edit within that second would reload stale bytecode after our own
    # nanosecond-mtime cache already noticed the change.
    code = compile(path.read_bytes(), str(path), "exec")
    exec(code, loaded.__dict__)
    module = getattr(loaded, "MODULE", None)
    validate_module_spec(module)
    return module


def _describe(directory: Path) -> tuple[dict[str, Any], Optional[Mapping[str, Any]]]:
    """One module's catalog entry (everything but ``enabled``) and its MODULE spec (None when broken)."""
    try:
        manifest = safe_load((directory / "plugin.yaml").read_text(encoding="utf-8-sig"))
        manifest_error = None
    except Exception as exc:  # health: allow BLE001 -- a broken plugin.yaml must not hide the other modules
        manifest, manifest_error = None, f"plugin.yaml: {type(exc).__name__}: {exc}"
    manifest = manifest if isinstance(manifest, Mapping) else {}
    name = str(manifest.get("name") or directory.name)
    entry: dict[str, Any] = {
        "name": name, "function_code": None, "category": _category(manifest.get("tags")),
        "title": _title(name), "description": str(manifest.get("description") or ""), "emoji": None,
        "tools": [],
    }
    if manifest_error:
        logger.warning("bkt-dia catalog: %s %s", directory.name, manifest_error)
        return {**entry, "error": manifest_error}, None
    try:
        module = _load_module_spec(directory)
    except Exception as exc:  # health: allow BLE001 -- one broken module must not hide the other nineteen
        logger.warning("bkt-dia catalog: %s failed to load: %s", directory.name, exc)
        return {**entry, "error": f"{type(exc).__name__}: {exc}"}, None
    entry.update(
        function_code=module["function_code"], emoji=module.get("emoji"),
        tools=[{"name": t["name"], "description": t["description"], "parameters": dict(t["parameters"])}
               for t in module["tools"]])
    return entry, module


def _signature(directory: Path) -> tuple[int, ...]:
    return tuple((directory / f).stat().st_mtime_ns for f in ("plugin.yaml", "__init__.py"))


def _cached(directory: Path) -> tuple[dict[str, Any], Optional[Mapping[str, Any]]]:
    signature = _signature(directory)
    with _cache_lock:
        cached = _cache.get(directory)
    if cached is not None and cached[0] == signature:
        return cached[1], cached[2]
    entry, module = _describe(directory)
    with _cache_lock:
        _cache[directory] = (signature, entry, module)
    return entry, module


def _module_dirs() -> list[Path]:
    return sorted(d for d in PLUGINS_ROOT.glob(MODULE_DIR_GLOB)
                  if (d / "plugin.yaml").is_file() and (d / "__init__.py").is_file())


def list_modules() -> list[dict[str, Any]]:
    """Every bundled ``bkt-dia-*`` module, ordered by category then name, with ``enabled`` read now."""
    entries = [{**_cached(d)[0]} for d in _module_dirs()]
    for entry in entries:
        entry["enabled"] = is_module_enabled(entry["name"])
    return sorted(entries, key=lambda e: (_CATEGORY_ORDER.get(e["category"], len(_CATEGORY_ORDER)), e["name"]))


def find_tool(module_name: str, tool_name: str) -> Optional[tuple[Mapping[str, Any], Mapping[str, Any]]]:
    """``(MODULE spec, tool spec)`` for a loadable bundled module and one of its tools, else None.

    The specs include ``question_template`` for running the tool; :func:`list_modules` entries never do.
    """
    directory = next((d for d in _module_dirs() if d.name == module_name), None)
    module = _cached(directory)[1] if directory is not None else None
    tool = next((t for t in module["tools"] if t["name"] == tool_name), None) if module else None
    return (module, tool) if tool is not None else None
