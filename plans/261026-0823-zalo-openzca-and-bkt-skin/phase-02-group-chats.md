---
phase: 2
title: "Group chats and the mention guard"
status: pending
priority: P2
effort: "0.5d"
dependencies: [1]
---

# Phase 2: Group chats and the mention guard

## Goal

Group messages that address the account reach the agent and get replies in the group; all other
group lines are ignored.

## Context

- openzca group line: `type:1`, `chatType:"group"`, `threadId=<groupId>`, `mentionIds`, `mentions`
  `[{uid,pos,len,type,text}]`, `quote.ownerId` (researcher report §3).
- `@all` arrives as uid `"-1"`. Sticker content yields a bogus mention, so trust `mentionIds` only
  when `msgType` is `webchat` or `chat.text`.

## Files to create / modify

- Create: `plugins/platforms/zalo/groups.py` — pure functions, no I/O.
- Modify: `plugins/platforms/zalo/adapter.py` — route `type == 1` lines through `groups.py`.
- Create: `tests/plugins/platforms/zalo/test_groups.py`.

## Tasks & Steps

1. [ ] `is_addressed(line, own_uid) -> bool`: own UID in `mentionIds` (text message types only), or
       `quote.ownerId == own_uid` (a reply to the bot). `@all` does not count, so a broadcast to
       the whole group does not wake the agent.
2. [ ] `strip_self_mention(content, mentions, own_uid) -> str`: remove the bot's mention span using
       `pos`/`len`, then trim.
3. [ ] Adapter: for group lines, skip unless `require_mention` is false or `is_addressed`; build the
       source with `chat_id="group:<threadId>"`, `chat_type="group"`,
       `chat_name=metadata.threadName`; set `reply_to_is_own_message` when the quote owner is the bot.
4. [ ] `require_mention` is read with `_env_or_extra(extra, "ZALO_GROUP_REQUIRE_MENTION",
       "group_require_mention", True)` and then parsed against the `_TRUTHY` set (mirror
       `irc/adapter.py:131-132`) so that the env string `"false"` / `"0"` / `"no"` correctly
       disables the guard. Do not rely on Python truthiness of the raw env string.
5. [ ] Tests: mention passes and is stripped; unaddressed line dropped; reply-to-bot passes; sticker
       bogus mention dropped; `require_mention: false` (YAML/extra path) passes everything;
       `ZALO_GROUP_REQUIRE_MENTION=false` (env string path) also passes everything; group send uses
       `--group` and the bare group ID.

## Verification

- `scripts/run_tests.sh tests/plugins/platforms/zalo/`

## Risks / rollback

If Zalo omits `mentionIds` for some clients, the guard fails closed (no reply). This is the safe
direction; the live check in phase 5 confirms it.
