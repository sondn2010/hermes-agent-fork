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
| `background` | `#0E1012` | Desktop canvas seed (`skin.ts:60` reads this first); **must be set** or Desktop defaults to `#212428` |
| `ui_border`, `banner_border`, `session_border` | `rgba(63,81,181,.35)` | Desktop border token (`:74-75`); `banner_border` alone yields full-saturation blue |
| `ui_accent`, `banner_title`, `banner_accent`, `prompt`, `input_rule`, `response_border`, `status_bar_strong`, `shell_dollar` | `#00ADEF` | primary pulse: focus, active markers, generation |
| `ui_label`, `session_label` | `#3F51B5` | secondary framing, badges, tool surfaces |
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

1. [ ] Read `apps/desktop/src/themes/skin.ts` and `context.tsx:307,389` to confirm that Desktop
       applies every `--dt-*` token via `root.style.setProperty` (inline style), which wins over
       any stylesheet. All `customCSS` rules that override those tokens **must use `!important`**.
       Confirm the converter seeds the canvas from `colors.background` (`skin.ts:60`) and the
       border from `ui_border` / `banner_border` (`:74-75`). Record findings in the YAML header
       comment.
2. [ ] Write `bkt/theme/skins/bkt.yaml` with `name: bkt`, a description, the mapped `colors`, and
       `customCSS`. Add `light_colors` only if validation decides so (see plan.md unresolved
       questions).
3. [ ] Export `installTheme` and add `installSkins(homes)` as named exports in `install.mjs`
       (the test imports them directly). `installSkins` skips an existing `bkt.yaml` unless
       `--force` is passed, to avoid silently overwriting user edits.
4. [ ] Load-check: `python -c "from hermes_cli.skin_engine import load_skin; print(load_skin('bkt'))"`
       under a temp `HERMES_HOME` with the skin installed. Assert that the `customCSS` field
       contains no `url(`, `@import`, or `@font-face` (keep it to custom-property assignments and
       `!important` overrides only); add this assertion to `install.test.ts`.

## Verification

- `cd bkt && npm test`
- `node bkt/install.mjs` against a temp home, then start `hermes` with that home and run `/skin bkt`.
- Desktop: select the skin; check canvas, cards, sidebar, primary button and focus ring colors.

## Risks / rollback

Removing `bkt/theme/skins/` and the `installSkins` call reverts it; installed copies in user homes
are inert YAML.
