"""Zalo group mention guard: only lines addressed to the bot reach the agent, unless the
operator turns the guard off (YAML bool or env string)."""

from __future__ import annotations

import pytest

from plugins.platforms.zalo import groups
from tests.plugins.platforms.zalo._fake_openzca import (
    OWN_UID, group_line, make_adapter, make_fake_openzca,
)

_SELF_MENTION = {"uid": OWN_UID, "pos": 0, "len": 7, "type": 0, "text": "@Hermes"}


def _mentioning(content: str = "@Hermes what time is it", **extra) -> dict:
    return group_line(content, mentions=[_SELF_MENTION], mentionIds=[OWN_UID], **extra)


async def _dispatch(adapter, line: dict) -> list:
    adapter._own_uid = OWN_UID
    await adapter._on_line(line)
    return adapter.received


@pytest.mark.asyncio
async def test_mention_passes_and_is_stripped(tmp_path):
    adapter = make_adapter(make_fake_openzca(tmp_path))
    [event] = await _dispatch(adapter, _mentioning())
    assert event.text == "what time is it"
    assert (event.source.chat_id, event.source.chat_type, event.source.chat_name) == ("group:555", "group", "Team")
    assert (await adapter.get_chat_info("group:555")) == {"name": "Team", "type": "group"}


def test_mid_sentence_mention_strip_leaves_single_spaces():
    mention = {"uid": OWN_UID, "pos": 4, "len": 7}
    assert groups.strip_self_mention("hey @Hermes look", [mention], OWN_UID) == "hey look"


@pytest.mark.asyncio
@pytest.mark.parametrize("line", [
    group_line("just chatting"),
    group_line("@all meeting now", mentions=[{"uid": "-1", "pos": 0, "len": 4, "type": 1}], mentionIds=["-1"]),
    group_line("@Bob hi", mentions=[{"uid": "222", "pos": 0, "len": 4}], mentionIds=["222"]),
], ids=["unaddressed", "at-all", "someone-else"])
async def test_unaddressed_group_line_is_dropped(tmp_path, line):
    adapter = make_adapter(make_fake_openzca(tmp_path))
    assert await _dispatch(adapter, line) == []


@pytest.mark.asyncio
async def test_reply_to_bot_passes(tmp_path):
    adapter = make_adapter(make_fake_openzca(tmp_path))
    [event] = await _dispatch(adapter, group_line("and tomorrow?", quote={"ownerId": OWN_UID, "msg": "Sunny"}))
    assert event.text == "and tomorrow?"
    assert event.reply_to_is_own_message is True
    assert event.reply_to_text == "Sunny"


@pytest.mark.asyncio
async def test_sticker_bogus_mention_is_dropped(tmp_path):
    adapter = make_adapter(make_fake_openzca(tmp_path))
    sticker = group_line("<non-text:chat.sticker>", msgType="chat.sticker", mentionIds=[OWN_UID])
    assert await _dispatch(adapter, sticker) == []


@pytest.mark.asyncio
async def test_require_mention_false_in_extra_passes_everything(tmp_path):
    adapter = make_adapter(make_fake_openzca(tmp_path), group_require_mention=False)
    [event] = await _dispatch(adapter, group_line("just chatting"))
    assert event.text == "just chatting"


@pytest.mark.asyncio
async def test_require_mention_env_string_false_passes_everything(tmp_path, monkeypatch):
    monkeypatch.setenv("ZALO_GROUP_REQUIRE_MENTION", "false")
    adapter = make_adapter(make_fake_openzca(tmp_path))
    [event] = await _dispatch(adapter, group_line("just chatting"))
    assert event.text == "just chatting"


@pytest.mark.asyncio
@pytest.mark.platforms("posix")  # executable-shebang fake openzca
async def test_group_send_uses_group_flag_and_bare_id(tmp_path):
    fake = make_fake_openzca(tmp_path)
    adapter = make_adapter(fake)
    assert await adapter.connect()
    try:
        assert (await adapter.send("group:555", "hello group")).success
        call = fake.msg_calls()[-1]
        assert "--group" in call
        assert call[-3:] == ["--", "555", "hello group"]
        assert not any(arg.startswith("group:") for arg in call)
    finally:
        await adapter.disconnect()
