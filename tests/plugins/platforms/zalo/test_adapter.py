"""Zalo adapter behaviour against a real fake-openzca subprocess: inbound DM routing, sends,
listener lifecycle (no orphaned children) and the credential-store guard."""

from __future__ import annotations

import asyncio
import json
import sys

import pytest

from gateway.config import PlatformConfig
from gateway.status import _get_scope_lock_path
from tests.plugins.platforms.zalo._fake_openzca import (
    OWN_UID, dm_line, make_adapter, make_fake_openzca, pid_alive, zalo_module,
)
from tests.waiting import async_wait_until

pytestmark = pytest.mark.platforms("posix")  # executable-shebang fake + POSIX signals


async def _connected(fake, **extra):
    adapter = make_adapter(fake, **extra)
    assert await adapter.connect(), adapter.fatal_error_code
    return adapter


@pytest.mark.asyncio
async def test_dm_line_reaches_handle_message(tmp_path):
    fake = make_fake_openzca(tmp_path, listen_lines=[json.dumps(dm_line("hello"))])
    adapter = await _connected(fake)
    try:
        await async_wait_until(lambda: adapter.received, what="DM dispatched")
        event = adapter.received[0]
        assert event.text == "hello"
        assert (event.source.chat_id, event.source.chat_type, event.source.user_id) == ("111", "dm", "111")
        assert event.message_id == "7001"
    finally:
        await adapter.disconnect()


@pytest.mark.asyncio
async def test_own_message_is_dropped(tmp_path):
    lines = [dm_line("echo of my reply", sender=OWN_UID, msg_id="1"), dm_line("marker", msg_id="2")]
    fake = make_fake_openzca(tmp_path, listen_lines=[json.dumps(line) for line in lines])
    adapter = await _connected(fake)
    try:
        await async_wait_until(lambda: adapter.received, what="marker dispatched")
        assert [e.text for e in adapter.received] == ["marker"]
    finally:
        await adapter.disconnect()


@pytest.mark.asyncio
async def test_non_json_and_kind_lines_are_skipped(tmp_path):
    lines = ["Connected to Zalo websocket.", "{not json",
             json.dumps({"kind": "lifecycle", "event": "heartbeat"}),
             json.dumps({"kind": "group_event", "event": "poll", "senderId": "111", "threadId": "111"}),
             json.dumps(dm_line("marker"))]
    fake = make_fake_openzca(tmp_path, listen_lines=lines)
    adapter = await _connected(fake)
    try:
        await async_wait_until(lambda: adapter.received, what="marker dispatched")
        assert [e.text for e in adapter.received] == ["marker"]
        assert adapter.is_connected
    finally:
        await adapter.disconnect()


@pytest.mark.asyncio
async def test_reply_passes_reduced_reply_message(tmp_path):
    original = dm_line("x" * 300, msg_id="7001", quote={"ownerId": "5"}, metadata={"secret": "y"})
    fake = make_fake_openzca(tmp_path, listen_lines=[json.dumps(original)])
    adapter = await _connected(fake)
    try:
        await async_wait_until(lambda: adapter.received, what="DM dispatched")
        result = await adapter.send("111", "answer", reply_to="7001")
        assert result.success and result.message_id == "7158000000001"
        call = fake.msg_calls()[-1]
        payload = json.loads(call[call.index("--reply-message") + 1])
        assert set(payload) == {"msgType", "senderId", "msgId", "cliMsgId", "ts", "content"}
        assert payload["msgId"] == "7001" and len(payload["content"]) == 100
        assert call[-3:] == ["--", "111", "answer"]
    finally:
        await adapter.disconnect()


@pytest.mark.asyncio
async def test_disconnect_kills_msg_children_and_listener(tmp_path):
    fake = make_fake_openzca(tmp_path, msg={"hang": True})
    adapter = await _connected(fake)
    send = asyncio.create_task(adapter.send("111", "stuck"))
    await async_wait_until(lambda: pid_alive(fake.pid("msg")), what="msg child running")
    listen_pid, msg_pid = fake.pid("listen"), fake.pid("msg")
    assert pid_alive(listen_pid)

    await adapter.disconnect()

    assert not pid_alive(msg_pid)
    assert not pid_alive(listen_pid)
    result = await asyncio.wait_for(send, timeout=5)
    assert not result.success


@pytest.mark.asyncio
async def test_close_code_3000_sets_retryable_fatal_without_restart(tmp_path):
    closed = {"kind": "lifecycle", "event": "closed", "code": 3000, "reason": "DuplicateConnection"}
    fake = make_fake_openzca(tmp_path, listen_lines=[json.dumps(closed)], listen={"code": 0})
    adapter = await _connected(fake)
    try:
        await async_wait_until(lambda: adapter.has_fatal_error, what="fatal error raised")
        assert adapter.fatal_error_code == "zalo_duplicate_session"
        assert adapter.fatal_error_retryable is True
        # The gateway watcher owns the backoff; the adapter never respawns the listener itself.
        assert sum(1 for c in fake.calls() if "listen" in c) == 1
    finally:
        await adapter.disconnect()


@pytest.mark.asyncio
async def test_connect_cancellation_releases_lock_and_stops_child(tmp_path):
    fake = make_fake_openzca(tmp_path, me={"hang": True})
    adapter = make_adapter(fake)
    connect = asyncio.create_task(adapter.connect())
    await async_wait_until(lambda: pid_alive(fake.pid("me")), what="me id child running")
    me_pid = fake.pid("me")

    connect.cancel()
    with pytest.raises(asyncio.CancelledError):
        await connect

    assert not pid_alive(me_pid)
    assert not _get_scope_lock_path("zalo", "test").exists()
    assert fake.pid("listen") is None


@pytest.mark.asyncio
@pytest.mark.parametrize(("stderr", "code", "retryable"), [
    ("Error: getaddrinfo ENOTFOUND wpa.chat.zalo.me\n", "zalo_connect", True),
    ("Error: request timed out\n", "zalo_connect", True),
    ("Error: Profile test: not logged in\n", "zalo_auth", False),
])
async def test_me_id_failure_classification(tmp_path, stderr, code, retryable):
    fake = make_fake_openzca(tmp_path, me={"code": 1, "stderr": stderr})
    adapter = make_adapter(fake)
    assert not await adapter.connect()
    assert (adapter.fatal_error_code, adapter.fatal_error_retryable) == (code, retryable)
    assert fake.pid("listen") is None
    assert not _get_scope_lock_path("zalo", "test").exists()


@pytest.mark.asyncio
async def test_content_starting_with_dash_is_not_an_option(tmp_path):
    fake = make_fake_openzca(tmp_path)
    adapter = await _connected(fake)
    try:
        assert (await adapter.send("111", "-rf --help")).success
        assert fake.msg_calls()[-1][-3:] == ["--", "111", "-rf --help"]
        assert not (await adapter.send("-g", "hi")).success  # a dash-led chat id never reaches argv
        assert len(fake.msg_calls()) == 1
    finally:
        await adapter.disconnect()


@pytest.mark.asyncio
async def test_formatting_error_retries_with_raw_once(tmp_path):
    fake = make_fake_openzca(tmp_path, msg_needs_raw=True)
    adapter = await _connected(fake)
    try:
        assert (await adapter.send("group:555", "@Bob hi")).success
        first, second = fake.msg_calls()
        assert "--raw" not in first and "--raw" in second
    finally:
        await adapter.disconnect()


@pytest.mark.asyncio
@pytest.mark.parametrize(("chat_id", "group_flag", "thread"), [("111", False, "111"), ("group:555", True, "555")])
async def test_standalone_sender_delivers(tmp_path, chat_id, group_flag, thread):
    fake = make_fake_openzca(tmp_path)
    pconfig = PlatformConfig(enabled=True, extra={"profile": "test", "openzca_bin": str(fake.path)})

    result = await zalo_module()._standalone_send(pconfig, chat_id, "cron says hi")

    assert result == {"success": True, "message_id": "7158000000001"}
    call = fake.msg_calls()[-1]
    assert ("--group" in call) is group_flag
    assert call[-3:] == ["--", thread, "cron says hi"]


@pytest.mark.asyncio
async def test_connect_reaps_listener_orphaned_by_a_previous_run(tmp_path):
    from gateway.status import get_process_start_time
    from hermes_constants import get_hermes_home

    orphan = await asyncio.create_subprocess_exec(
        sys.executable, "-c", "import threading; threading.Event().wait()")
    pidfile = get_hermes_home() / "cache" / "zalo-test.pid"
    pidfile.parent.mkdir(parents=True, exist_ok=True)
    pidfile.write_text(json.dumps({"pid": orphan.pid, "start_time": get_process_start_time(orphan.pid)}),
                       encoding="utf-8")
    fake = make_fake_openzca(tmp_path)
    adapter = await _connected(fake)
    try:
        assert await asyncio.wait_for(orphan.wait(), timeout=10) != 0  # signalled, not a clean exit
        listen_pid = await async_wait_until(lambda: fake.pid("listen"), what="listen child started")
        assert json.loads(pidfile.read_text(encoding="utf-8"))["pid"] == listen_pid
    finally:
        await adapter.disconnect()
    assert not pidfile.exists()


def test_env_enablement_reads_only_the_profile_scope(monkeypatch):
    """A secondary profile is seeded from its own secret scope, never from launch-process env."""
    import gateway.platforms._shared as shared

    scope = {"ZALO_PROFILE": "work", "ZALO_GROUP_REQUIRE_MENTION": "no", "ZALO_HOME_THREAD": "group:555"}
    monkeypatch.setenv("ZALO_PROFILE", "launch-profile")
    monkeypatch.setattr(shared, "_scoped_get_secret", lambda name, default=None: scope.get(name, default))

    seed = zalo_module()._env_enablement()

    assert seed["profile"] == "work"
    assert seed["group_require_mention"] is False
    assert seed["home_channel"]["chat_id"] == "group:555"


@pytest.mark.asyncio
async def test_openzca_credentials_are_never_sent(tmp_path, monkeypatch):
    home = tmp_path / "home"
    creds = home / ".openzca" / "profiles" / "default" / "credentials.json"
    creds.parent.mkdir(parents=True)
    creds.write_text('{"cookie": "c"}', encoding="utf-8")
    link = tmp_path / "innocent.json"
    link.symlink_to(creds)
    monkeypatch.setenv("HOME", str(home))
    fake = make_fake_openzca(tmp_path)
    adapter = await _connected(fake)
    try:
        for attempt in (adapter.send_document("111", "~/.openzca/profiles/default/credentials.json"),
                        adapter.send_document("111", str(link)),
                        adapter.send_image("111", str(creds)),
                        adapter.send_voice("111", str(creds))):
            result = await attempt
            assert not result.success and "credential" in result.error
        assert fake.msg_calls() == []
    finally:
        await adapter.disconnect()
