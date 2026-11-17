"""bkt-dia-common dashboard API, mounted at ``/api/plugins/bkt-dia-common/`` for the core ``/dia`` page.

Every route requires the dashboard session token. The host binds ``?profile=`` per request, so
config, secrets and the run log are always the requesting profile's; nothing here caches a home
or config. Responses never carry the API key or the endpoint value. Work that reads config,
loads module files, touches SQLite or resolves DNS (the endpoint's URL-safety check) runs in a
worker thread, which inherits the request's profile scope.

The bundled plugin's API mounts unless the plugin is explicitly disabled, so the run route
applies its own gates: an unknown module or tool is a 404, a disabled module is refused with
``stage: "disabled"`` before any request, and everything else goes through the same
``run_query_tool`` path as the agent's tool calls (``bkt-dia-common`` itself disabled is refused
there).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator

from plugins.bkt_dia_common import module_catalog, query_client, run_log
from plugins.bkt_dia_common.settings import configured_endpoint, is_common_enabled, is_module_enabled
from plugins.bkt_dia_common.tool_factory import run_query_tool

MAX_ARGUMENTS_BYTES = 8 * 1024
STEP_KEYS = ("validate", "build_question", "query", "result")


def _require_token(request: Request) -> None:
    from hermes_cli.web_server import _require_token as core_require_token
    core_require_token(request)


router = APIRouter(dependencies=[Depends(_require_token)])


class RunRequest(BaseModel):
    module: str = Field(min_length=1, max_length=100)
    tool: str = Field(min_length=1, max_length=100)
    arguments: dict[str, Any] = Field(default_factory=dict)

    @field_validator("arguments")
    @classmethod
    def _arguments_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > MAX_ARGUMENTS_BYTES:
            raise ValueError(f"arguments must be at most {MAX_ARGUMENTS_BYTES} bytes of JSON")
        return value


def _modules_payload() -> dict[str, Any]:
    return {
        "common_enabled": is_common_enabled(),
        "endpoint_configured": bool(configured_endpoint()),
        "categories": module_catalog.categories(),
        "modules": module_catalog.list_modules(),
    }


def _run(body: RunRequest) -> dict[str, Any]:
    found = module_catalog.find_tool(body.module, body.tool)
    if found is None:
        raise HTTPException(status_code=404, detail=f"unknown bkt-dia module or tool: {body.module}/{body.tool}")
    module, tool = found
    if not is_module_enabled(body.module):
        return {"ok": False, "error": f"{body.module} plugin is disabled",
                "hint": f"enable {body.module} on the BKT Modules page", "stage": "disabled",
                "function_code": module["function_code"],
                "steps": [{"key": key, "status": "skipped", "ms": 0} for key in STEP_KEYS]}
    return run_query_tool(module, tool, body.arguments, source="console")


@router.get("/modules")
async def list_modules() -> dict[str, Any]:
    return await asyncio.to_thread(_modules_payload)


@router.get("/health")
async def health() -> dict[str, Any]:
    return await asyncio.to_thread(query_client.health)


@router.post("/run")
async def run(body: RunRequest) -> dict[str, Any]:
    return await asyncio.to_thread(_run, body)


@router.get("/runs")
async def runs(limit: int = Query(50, ge=1, le=run_log.MAX_ROWS)) -> dict[str, Any]:
    return {"runs": await asyncio.to_thread(run_log.recent, limit)}
