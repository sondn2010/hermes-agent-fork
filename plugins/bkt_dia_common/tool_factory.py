"""Tool factory for ``bkt-dia-*`` modules, and the frozen module contract.

How to add a bkt-dia module
===========================

Copy ``plugins/bkt-dia-enterprise-profile/`` (the pilot) and change only names and content:

1. ``plugins/bkt-dia-<slug>/plugin.yaml``::

       name: bkt-dia-<slug>                  # == MODULE["toolset"]
       version: 0.1.0
       manifest_version: 2
       description: "F0NN <what it answers>. Needs bkt-dia-common enabled."
       author: BKTech
       tags: [bkt, "category:<slug>"]        # exactly one slug from categories.CATEGORIES
       requires_plugins:
         - id: bkt-dia-common
       provides_tools:                       # EVERY tool name, same set as MODULE["tools"]
         - bkt_dia_<slug>_<verb>

2. ``plugins/bkt-dia-<slug>/__init__.py``::

       from pathlib import Path
       from plugins.bkt_dia_common.tool_factory import register_module_skills, register_query_tools

       MODULE = {"function_code": "F0NN", "toolset": "bkt-dia-<slug>", "tools": [ {...}, ... ]}

       def register(ctx):
           register_query_tools(ctx, MODULE)
           register_module_skills(ctx, Path(__file__).parent)

   Each tool spec is ``{"name", "description", "parameters", "question_template"}``:

   * ``name``: ``bkt_dia_<slug>_<verb>``, snake_case, globally unique, listed in ``provides_tools``.
   * ``parameters``: a JSON-schema ``object`` with ``properties`` (and optional ``required``).
     Keep it small: every enabled tool schema is sent on every model call.
   * ``question_template``: the natural-language question sent to ``POST /api/v1/query``.
     ``{param}`` inserts an argument. ``[[ ... {param} ... ]]`` is an optional segment, dropped
     whole when any placeholder inside it has no value (``None``, ``False``, blank, empty list),
     so a boolean works as a switch for an optional segment. Any other brace is literal text and a
     brace inside an argument value is never re-expanded, so rendering cannot raise.
     Every placeholder must name a declared property (checked at register time).

3. ``plugins/bkt-dia-<slug>/skills/bkt-dia-<slug>/SKILL.md``: when to use each tool, cite
   ``sources``, and say plainly when data is missing or the service fails. Frontmatter
   ``description`` is at most 60 characters, one sentence ending with a period.

4. Tests: a behaviour test against the conftest stub server plus fail-closed tests for an unset
   endpoint and HTTP 5xx (see ``tests/plugins/bkt_dia/test_enterprise_profile.py``).

Rules ``register_query_tools`` enforces (a violation raises ``ModuleSpecError`` and the plugin
fails to load): 1-2 tools per module (prompt-surface cost), ``function_code`` like ``F015``,
``toolset`` like ``bkt-dia-<slug>``, tool names matching ``bkt_dia_<slug>_<verb>``, placeholders
naming declared properties. Tools are read-only. ``toolset == manifest name`` and
``provides_tools == tool names`` are checked by ``hermes plugins validate`` (declared tools) and the
cross-module contract test, not at load: ``ctx`` exposes no manifest (the validate probe's ctx has none).

Tool results (JSON string): ``{"ok": true, "answer", "type", "sources", "function_code"}`` or
``{"ok": false, "error", "hint", "function_code"}``. See ``query_client.query`` for the failure
cases (disabled ``bkt-dia-common``, unset/unsafe endpoint, timeout, non-2xx, invalid JSON).

How a module's toolset reaches the agent
========================================

Bundled plugins are opt-in: discovery loads a module only when its manifest name is in
``plugins.enabled`` (``hermes plugins enable bkt-dia-<slug>`` or the dashboard). ``register()``
then puts the tools in ``tools.registry`` under ``toolset == manifest name``, and
``hermes_cli.tools_config._enabled_plugin_toolsets`` turns a plugin toolset on for every platform
by default (unless that platform already recorded it in ``known_plugin_toolsets`` and the user
left it unchecked in ``hermes tools``). The tool list is frozen per session for prompt caching,
so an enable/disable applies from the next session. Disabling unloads the plugin and its tools.
No ``check_fn`` is used: the handler itself fails closed with an actionable hint.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from plugins.bkt_dia_common.query_client import query

logger = logging.getLogger(__name__)

MAX_TOOLS_PER_MODULE = 2
_TOOL_NAME_RE = re.compile(r"^bkt_dia_[a-z0-9]+(?:_[a-z0-9]+)+$")
_FUNCTION_CODE_RE = re.compile(r"^F\d{3}$")
_TOOLSET_RE = re.compile(r"^bkt-dia-[a-z0-9]+(?:-[a-z0-9]+)*$")
_PLACEHOLDER_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")
_OPTIONAL_SEGMENT_RE = re.compile(r"\[\[(.*?)\]\]", re.DOTALL)
_MAX_ARG_CHARS = 500


class ModuleSpecError(ValueError):
    """A ``MODULE`` spec breaks the bkt-dia module contract."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ModuleSpecError(message)


def _validate_tool(tool: Any, index: int) -> None:
    _require(isinstance(tool, Mapping), f"tools[{index}] must be a mapping")
    name = tool.get("name")
    _require(isinstance(name, str) and bool(_TOOL_NAME_RE.match(name)),
             f"tools[{index}].name {name!r} must match bkt_dia_<slug>_<verb> (snake_case)")
    description = tool.get("description")
    _require(isinstance(description, str) and bool(description.strip()), f"{name}: description is required")
    params = tool.get("parameters")
    _require(isinstance(params, Mapping) and params.get("type") == "object"
             and isinstance(params.get("properties"), Mapping),
             f"{name}: parameters must be a JSON-schema object with properties")
    properties = params["properties"]
    required = params.get("required", [])
    _require(isinstance(required, list) and all(r in properties for r in required),
             f"{name}: every required parameter must be a declared property")
    template = tool.get("question_template")
    _require(isinstance(template, str) and bool(template.strip()), f"{name}: question_template is required")
    unknown = sorted(set(_PLACEHOLDER_RE.findall(template)) - set(properties))
    _require(not unknown, f"{name}: question_template uses undeclared parameters {unknown}")


def validate_module_spec(module: Any, *, provides_tools: Sequence[str] | None = None) -> None:
    """Raise :class:`ModuleSpecError` unless *module* satisfies the contract in this module's docstring.
    *provides_tools* (a manifest's list, for contract tests) must then name exactly the module's tools."""
    _require(isinstance(module, Mapping), "MODULE must be a mapping")
    code = module.get("function_code")
    _require(isinstance(code, str) and bool(_FUNCTION_CODE_RE.match(code)),
             f"function_code {code!r} must look like 'F015'")
    toolset = module.get("toolset")
    _require(isinstance(toolset, str) and bool(_TOOLSET_RE.match(toolset)),
             f"toolset {toolset!r} must look like 'bkt-dia-<slug>'")
    tools = module.get("tools")
    _require(isinstance(tools, (list, tuple)) and 1 <= len(tools) <= MAX_TOOLS_PER_MODULE,
             f"a module declares 1-{MAX_TOOLS_PER_MODULE} tools")
    for index, tool in enumerate(tools):
        _validate_tool(tool, index)
    names = [tool["name"] for tool in tools]
    _require(len(set(names)) == len(names), f"duplicate tool names {names}")
    if provides_tools is not None:
        _require(set(names) == set(provides_tools),
                 f"plugin.yaml provides_tools {sorted(provides_tools)} must list exactly {sorted(names)}")


def _format_value(value: Any) -> str:
    """One argument as single-line text; ``None``, ``False``, blank and empty list count as missing ("")."""
    if value is None or value is False:
        return ""
    if isinstance(value, (list, tuple)):
        text = ", ".join(_format_value(v) for v in value if _format_value(v))
    elif value is True:
        text = "yes"
    else:
        text = str(value)
    return " ".join(text.split())[:_MAX_ARG_CHARS]


def render_question(template: str, args: Mapping[str, Any]) -> str:
    """Render *template* with *args* in one pass (see the module docstring for the syntax)."""
    values = {key: _format_value(val) for key, val in args.items()} if isinstance(args, Mapping) else {}

    def _segment(match: re.Match[str]) -> str:
        body = match.group(1)
        names = _PLACEHOLDER_RE.findall(body)
        return body if names and all(values.get(n) for n in names) else ""

    text = _OPTIONAL_SEGMENT_RE.sub(_segment, template)
    text = _PLACEHOLDER_RE.sub(lambda m: values.get(m.group(1), ""), text)
    return " ".join(text.split())


def _missing_required(tool: Mapping[str, Any], args: Mapping[str, Any]) -> list[str]:
    required = tool["parameters"].get("required", [])
    return [name for name in required if not _format_value(args.get(name))]


def make_handler(function_code: str, tool: Mapping[str, Any]) -> Callable[..., str]:
    """Build the registry handler for one tool spec: render, query, stamp ``function_code``."""
    template = tool["question_template"]

    def handler(args: Any, **_kwargs: Any) -> str:
        args = args if isinstance(args, Mapping) else {}
        missing = _missing_required(tool, args)
        if missing:
            result = {"ok": False, "error": f"missing required argument(s): {', '.join(missing)}",
                      "hint": "ask the user for the missing value instead of guessing it"}
        else:
            result = query(render_question(template, args))
        return json.dumps({**result, "function_code": function_code}, ensure_ascii=False)

    return handler


def register_query_tools(ctx: Any, module: Mapping[str, Any]) -> list[str]:
    """Validate *module* and register its tools under ``module["toolset"]``.

    Returns the registered tool names. Raises :class:`ModuleSpecError` on a contract violation.
    """
    validate_module_spec(module)
    registered = []
    for tool in module["tools"]:
        schema = {"name": tool["name"], "description": tool["description"],
                  "parameters": dict(tool["parameters"])}
        ctx.register_tool(name=tool["name"], toolset=module["toolset"], schema=schema,
                          handler=make_handler(module["function_code"], tool),
                          description=tool["description"], emoji=module.get("emoji", "🔎"))
        registered.append(tool["name"])
    return registered


def _frontmatter_description(skill_md: Path) -> str:
    """The top-level ``description:`` of a SKILL.md frontmatter block ("" when absent)."""
    lines = skill_md.read_text(encoding="utf-8-sig").splitlines()
    if not lines or lines[0].strip() != "---":
        return ""
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if line.startswith("description:"):
            return line.partition(":")[2].strip().strip("'\"")
    return ""


def register_module_skills(ctx: Any, plugin_dir: Path) -> list[str]:
    """Register every ``<plugin_dir>/skills/<name>/SKILL.md`` as ``<plugin>:<name>``."""
    skills_dir = Path(plugin_dir) / "skills"
    registered = []
    for child in sorted(skills_dir.iterdir()) if skills_dir.is_dir() else []:
        skill_md = child / "SKILL.md"
        if child.is_dir() and skill_md.is_file():
            ctx.register_skill(child.name, skill_md, description=_frontmatter_description(skill_md))
            registered.append(child.name)
    return registered
