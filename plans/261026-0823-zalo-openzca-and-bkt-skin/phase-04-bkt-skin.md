---
phase: 4
title: "BKT skin and installer"
status: pending
priority: P2
effort: "0.5d"
dependencies: []
---

# Phase 4: BKT skin and installer

## Goal

`/skin bkt` repaints the CLI/TUI in BKT brand colors, the Desktop app picks up the same skin with BKT
surfaces through `customCSS`, and `bkt/install` puts the skin in place.

## Context

- Skin schema: `hermes_cli/skin_engine.py:16-30` (`colors`, `light_colors`, `dark_colors`, `spinner`,
  `branding`, `tool_prefix`, `banner_logo`, `banner_hero`, `custom_css`); full color key list in the
  `default` skin at `skin_engine.py:64-96`. User skins load from `<HERMES_HOME>/skins/*.yaml`
  (`skin_engine.py:365`). The YAML key for CSS is `customCSS` (`apps/shared/src/skin.ts:113`,
  32 KiB cap).
- Desktop CSS variables include `--dt-background`, `--dt-card`, `--dt-foreground`, `--dt-border`,
  `--dt-input`, `--dt-composer-ring`, `--dt-accent` and the `--color-*` sidebar/primary/ring set
  (grep `apps/desktop/src/**/*.css`).
- `bkt/install.mjs:74` `installTheme` copies every `*.yaml` directly in `bkt/theme/` to
  `<home>/dashboard-themes/`. The skin must therefore live in a subdirectory
  (`bkt/theme/skins/`), or it would also be installed as a dashboard theme.

## Brand mapping

| Skin key(s) | Value | Role |
|---|---|---|
| `ui_accent`, `banner_title`, `banner_accent`, `prompt`, `input_rule`, `response_border`, `status_bar_strong`, `shell_dollar` | `#00ADEF` | primary pulse: focus, active markers, generation |
| `banner_border`, `session_border`, `ui_label`, `session_label` | `#3F51B5` | secondary framing, badges, tool surfaces |
| `ui_ok`, `status_bar_good` | `#A2D149` | validation only |
| `status_bar_bg`, `completion_menu_bg`, `voice_status_bg` | `#212428` | elevated panels |
| `completion_menu_current_bg`, `selection_bg` | `#282B30` | floating / selected |
| `banner_text` | `#F0F4F8` | primary text |
| `banner_dim`, `status_bar_text`, `status_bar_dim` | `#94A3B8` | telemetry, timestamps |
| `ui_warn`, `status_bar_warn`; `ui_error`, `status_bar_bad`, `status_bar_critical` | keep amber / red family from `default` | warnings and errors are not brand roles |

Desktop `customCSS` sets `--dt-background:#0E1012`, `--dt-card:#1A1C1E`, sidebar `#212428`, popover
`#282B30`, foreground `#F0F4F8`, muted foreground `#94A3B8`, primary and ring `#00ADEF`, secondary
`#3F51B5`, border `rgba(63,81,181,.35)`, plus a lime success token reserved for completion
indicators.

## Files to create / modify

- Create: `bkt/theme/skins/bkt.yaml`.
- Modify: `bkt/install.mjs` — add `installSkins(homes)` copying `bkt/theme/skins/*.yaml` to
  `<home>/skins/`, called next to `installTheme`.
- Modify: `bkt/scripts/install.test.ts` — assert the skin lands in `<home>/skins/bkt.yaml` and is not
  copied into `dashboard-themes/`.
- Modify: `bkt/README.md` — one line on the skin and `/skin bkt`.

## Tasks & Steps

1. [ ] Read `apps/desktop/src/themes/skin.ts` and `classic-skin.test.tsx` to learn whether Desktop
       derives its palette from skin `colors` and whether theme variables are applied inline (then
       `customCSS` needs `!important` to win). Record the finding in the YAML header comment.
2. [ ] Write `bkt/theme/skins/bkt.yaml` with `name: bkt`, a description, the mapped `colors`, and
       `customCSS`. Add `light_colors` only if validation decides so (see plan.md unresolved
       questions).
3. [ ] Extend `install.mjs` and its test.
4. [ ] Load-check: `python -c "from hermes_cli.skin_engine import load_skin; print(load_skin('bkt'))"`
       under a temp `HERMES_HOME` with the skin installed (use the real loader name found in
       `skin_engine.py`).

## Verification

- `cd bkt && npm test`
- `node bkt/install.mjs` against a temp home, then start `hermes` with that home and run `/skin bkt`.
- Desktop: select the skin; check canvas, cards, sidebar, primary button and focus ring colors.

## Risks / rollback

Removing `bkt/theme/skins/` and the `installSkins` call reverts it; installed copies in user homes
are inert YAML.
