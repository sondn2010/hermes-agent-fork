"""A real-subprocess stand-in for the openzca CLI, shared by the Zalo adapter tests.

The fake is an executable Python script (shebang = this interpreter) so the adapter resolves it
through ``ZALO_OPENZCA_BIN`` exactly like a real install. Its behaviour is baked into the script
as JSON (no env coupling); every invocation appends its argv to ``calls.jsonl`` and long-lived
commands record their PID to ``<command>.pid``.
"""

from __future__ import annotations

import json
import os
import stat
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from gateway.config import PlatformConfig
from tests.gateway._plugin_adapter_loader import load_plugin_adapter

OWN_UID = "999"

_SCRIPT = r'''
import json, os, sys, threading
CONFIG = json.loads(__CONFIG__)
STATE = CONFIG["state"]
args = sys.argv[1:]
with open(os.path.join(STATE, "calls.jsonl"), "a", encoding="utf-8") as fh:
    fh.write(json.dumps(args) + "\n")

def record_pid(name):
    with open(os.path.join(STATE, name + ".pid"), "w", encoding="utf-8") as fh:
        fh.write(str(os.getpid()))

def block():
    threading.Event().wait()

def finish(spec, default_out=""):
    if spec.get("hang"):
        block()
    sys.stdout.write(spec.get("stdout", default_out))
    sys.stderr.write(spec.get("stderr", ""))
    sys.stdout.flush()
    sys.exit(spec.get("code", 0))

if args[:1] == ["--version"]:
    finish(CONFIG.get("version", {}), "0.1.60\n")
if args[:1] == ["--profile"]:
    args = args[2:]
cmd = args[0] if args else ""
if cmd == "me":
    record_pid("me")
    finish(CONFIG.get("me", {}), CONFIG["own_uid"] + "\n")
if cmd == "listen":
    record_pid("listen")
    print("Listening... Press Ctrl+C to stop.", flush=True)
    for line in CONFIG.get("listen_lines", []):
        print(line, flush=True)
    listen = CONFIG.get("listen", {})
    if "code" not in listen:
        block()
    sys.stderr.write(listen.get("stderr", ""))
    sys.exit(listen["code"])
if cmd == "msg":
    record_pid("msg")
    spec = CONFIG.get("msg", {})
    if "--raw" not in args and CONFIG.get("msg_needs_raw"):
        sys.stderr.write("Error: ambiguous mention @Bob\n")
        sys.exit(1)
    finish(spec, "{ message: { msgId: 7158000000001 }, attachment: [] }\n")
sys.exit(2)
'''


@dataclass
class FakeOpenzca:
    path: Path
    state: Path
    config: dict[str, Any] = field(default_factory=dict)

    def calls(self) -> list[list[str]]:
        log = self.state / "calls.jsonl"
        if not log.exists():
            return []
        return [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines() if line]

    def msg_calls(self) -> list[list[str]]:
        return [c for c in self.calls() if "msg" in c]

    def pid(self, name: str) -> int | None:
        path = self.state / f"{name}.pid"
        return int(path.read_text(encoding="utf-8")) if path.exists() else None


def make_fake_openzca(tmp_path: Path, **config: Any) -> FakeOpenzca:
    state = tmp_path / "fake-openzca-state"
    state.mkdir(parents=True, exist_ok=True)
    config = {"state": str(state), "own_uid": OWN_UID, **config}
    script = tmp_path / "openzca"
    source = _SCRIPT.replace("__CONFIG__", repr(json.dumps(config)))
    script.write_text(f"#!{sys.executable}\n{source}", encoding="utf-8")
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return FakeOpenzca(script, state, config)


def zalo_module():
    return load_plugin_adapter("zalo")


def make_adapter(fake: FakeOpenzca, **extra: Any):
    """A ZaloAdapter wired to ``fake`` whose dispatched events land in ``adapter.received``."""
    module = zalo_module()
    config = PlatformConfig(enabled=True, extra={"profile": "test", "openzca_bin": str(fake.path), **extra})
    adapter = module.ZaloAdapter(config)
    adapter.send_gap_seconds = 0.0
    adapter.received = []

    async def _handle(event):
        adapter.received.append(event)

    adapter.set_message_handler(_handle)
    adapter.handle_message = _handle
    return adapter


def pid_alive(pid: int | None) -> bool:
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def dm_line(content: str = "hello", *, sender: str = "111", msg_id: str = "7001", **extra: Any) -> dict:
    return {"threadId": sender, "msgId": msg_id, "cliMsgId": "1729900000123", "content": content,
            "type": 0, "timestamp": 1729900000, "msgType": "webchat", "chatType": "user",
            "senderId": sender, "senderDisplayName": "Alice", "toId": OWN_UID, "ts": "1729900000123",
            **extra}


def group_line(content: str = "@Hermes hi", *, group: str = "555", sender: str = "111",
               msg_id: str = "8001", **extra: Any) -> dict:
    return {"threadId": group, "msgId": msg_id, "cliMsgId": "1729900000999", "content": content,
            "type": 1, "timestamp": 1729900000, "msgType": "webchat", "chatType": "group",
            "senderId": sender, "senderDisplayName": "Bob", "ts": "1729900000999",
            "metadata": {"isGroup": True, "threadName": "Team"}, **extra}
