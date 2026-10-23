"""bkt-prompts dashboard plugin: per-profile prompt library, mounted at /api/plugins/bkt-prompts/.

Rows live in ``plugin_db("bkt-prompts")``, which resolves ``get_hermes_home()`` on every call; the
dashboard's plugin route scope binds ``?profile=`` to that home, so each profile has its own
library. A connection is opened per request and closed before it returns: a module-level
connection would pin the launch profile's database for the life of the process.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from contextlib import closing
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from plugins.plugin_storage import plugin_db

router = APIRouter()

PLUGIN_NAME = "bkt-prompts"
MAX_TITLE = 200
MAX_BODY = 64 * 1024
MAX_TAGS = 20
MAX_IMPORT = 500
_TAG_RE = re.compile(r"^[\w][\w .-]{0,39}$", re.UNICODE)
_VARIABLE_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*\}\}")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    variables TEXT NOT NULL DEFAULT '[]',
    updated_at REAL NOT NULL
)
"""


def _require_token(request: Request) -> None:
    from hermes_cli.web_server import _require_token as core_require_token
    core_require_token(request)


def variables_of(body: str) -> list[str]:
    """``{{name}}`` placeholders in first-seen order, without duplicates."""
    return list(dict.fromkeys(_VARIABLE_RE.findall(body)))


class PromptIn(BaseModel):
    title: str = Field(min_length=1, max_length=MAX_TITLE)
    body: str = Field(min_length=1, max_length=MAX_BODY)
    tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS)

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title is empty")
        return value

    @field_validator("tags")
    @classmethod
    def _tags(cls, value: list[str]) -> list[str]:
        cleaned = []
        for tag in value:
            tag = tag.strip()
            if not _TAG_RE.fullmatch(tag):
                raise ValueError(f"invalid tag {tag!r}: 1-40 letters, digits, space, '.', '_' or '-'")
            cleaned.append(tag)
        return list(dict.fromkeys(cleaned))


class PromptImport(BaseModel):
    prompts: list[PromptIn] = Field(max_length=MAX_IMPORT)


def _open():
    conn = plugin_db(PLUGIN_NAME)
    conn.execute(_SCHEMA)
    return conn


def _row(row: tuple) -> dict[str, Any]:
    pid, title, body, tags, variables, updated_at = row
    return {"id": pid, "title": title, "body": body, "tags": json.loads(tags),
            "variables": json.loads(variables), "updated_at": updated_at}


_COLUMNS = "id, title, body, tags, variables, updated_at"


def _list() -> list[dict[str, Any]]:
    with closing(_open()) as conn:
        rows = conn.execute(f"SELECT {_COLUMNS} FROM prompts ORDER BY updated_at DESC, title").fetchall()
    return [_row(r) for r in rows]


def _insert(conn, prompt: PromptIn) -> dict[str, Any]:
    row = (uuid.uuid4().hex, prompt.title, prompt.body, json.dumps(prompt.tags),
           json.dumps(variables_of(prompt.body)), time.time())
    conn.execute(f"INSERT INTO prompts ({_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)", row)
    return _row(row)


def _create(prompt: PromptIn) -> dict[str, Any]:
    with closing(_open()) as conn, conn:
        return _insert(conn, prompt)


def _import(prompts: list[PromptIn]) -> list[dict[str, Any]]:
    with closing(_open()) as conn, conn:
        return [_insert(conn, p) for p in prompts]


def _update(prompt_id: str, prompt: PromptIn) -> dict[str, Any]:
    with closing(_open()) as conn, conn:
        updated_at = time.time()
        cur = conn.execute(
            "UPDATE prompts SET title = ?, body = ?, tags = ?, variables = ?, updated_at = ? WHERE id = ?",
            (prompt.title, prompt.body, json.dumps(prompt.tags), json.dumps(variables_of(prompt.body)),
             updated_at, prompt_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Prompt not found")
        row = conn.execute(f"SELECT {_COLUMNS} FROM prompts WHERE id = ?", (prompt_id,)).fetchone()
    return _row(row)


def _delete(prompt_id: str) -> None:
    with closing(_open()) as conn, conn:
        if conn.execute("DELETE FROM prompts WHERE id = ?", (prompt_id,)).rowcount == 0:
            raise HTTPException(status_code=404, detail="Prompt not found")


@router.get("/prompts")
async def list_prompts(request: Request) -> dict[str, Any]:
    _require_token(request)
    return {"prompts": await asyncio.to_thread(_list)}


@router.post("/prompts")
async def create_prompt(request: Request, body: PromptIn) -> dict[str, Any]:
    _require_token(request)
    return await asyncio.to_thread(_create, body)


@router.post("/prompts/import")
async def import_prompts(request: Request, body: PromptImport) -> dict[str, Any]:
    _require_token(request)
    return {"imported": await asyncio.to_thread(_import, body.prompts)}


@router.put("/prompts/{prompt_id}")
async def update_prompt(request: Request, prompt_id: str, body: PromptIn) -> dict[str, Any]:
    _require_token(request)
    return await asyncio.to_thread(_update, prompt_id, body)


@router.delete("/prompts/{prompt_id}")
async def delete_prompt(request: Request, prompt_id: str) -> dict[str, Any]:
    _require_token(request)
    await asyncio.to_thread(_delete, prompt_id)
    return {"ok": True}
