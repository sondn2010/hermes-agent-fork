---
phase: 5
title: "Docs and live verification"
status: pending
priority: P2
effort: "0.5d"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Docs and live verification

## Goal

An operator can set up Zalo from the docs alone, and every live acceptance criterion in `plan.md` is
checked against a real Zalo account.

## Files to create / modify

- Create: `docs/bkt/zalo.md` — prerequisites (Node 22.13+, `npm i -g openzca`), login
  (`openzca --profile <name> auth login`, headless `--qr-base64`), `.env` keys, enabling the
  platform, group mention behaviour, media limits (voice/video go out as files), the ban-risk warning
  and the dedicated-account advice, re-authentication, where inbound media is cached.
- Modify: `docs/bkt/README.md` — link `zalo.md`, add the skin to the install section.

## Tasks & Steps

1. [ ] Run `npm view openzca version` and record the current version in `docs/bkt/zalo.md` as the
       minimum pinned version. Update the `install_hint` in `adapter.py` task 1 to use this version.
2. [ ] Write the docs from the implemented code, not from this plan.
3. [ ] Live run on the dedicated test account (confirmed available): DM reply; group @mention
       reply; unaddressed group line ignored; inbound image and file reach the agent; outbound
       image send. Run in one short session with fixed message counts; abort and record partial
       evidence on any login warning or account lock.
4. [ ] Stop the gateway and confirm no `openzca` Node process survives (Windows:
       `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? CommandLine -match 'openzca'`).
5. [ ] `node bkt/scripts/check-additive.mjs` reports only additive changes.
6. [ ] Tick the acceptance boxes in `plan.md` with the evidence.

## Verification

- All `plan.md` acceptance criteria checked.
