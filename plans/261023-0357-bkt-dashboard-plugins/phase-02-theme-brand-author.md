---
phase: 2
title: "Theme, brand logo and author"
status: completed
priority: P1
effort: "0.5d"
dependencies: [1]
---

# Phase 2: Theme, brand logo and author

## Goal

Ship the BKT theme, put the company logo in the sidebar header and show the author line, all
without core changes.

## Context

- The rendered shell slots are `backdrop`, `header-banner`, `header-left`, `header-right`,
  `pre-main`, `post-main` and `overlay` (`web/src/App.tsx:526,577,618,729,771,826,832`).
- `footer-left` and `footer-right` are declared in `web/src/plugins/slots.ts:31-32,70-71` but
  never rendered. The sidebar footer is the hardcoded `SidebarFooter`
  (`web/src/components/SidebarFooter.tsx`). BKT must not use the footer slots.
  <!-- Red Team: footer-right slot is never rendered -->
- `header-left` sits inside a container that is hidden while the sidebar is collapsed
  (`web/src/App.tsx:612-618`).
- The theme emits `--theme-asset-logo` and `--theme-asset-logo-raw`
  (`web/src/themes/context.tsx:202-221`), but no shell component uses them. A theme
  `assets.logo` value is also an absolute URL that drops `HERMES_BASE_PATH`. The logo is
  therefore rendered only by the plugin, from its own asset URL.

## Files to create

- `bkt/theme/bkt.yaml`:
  - Sets `name: bkt` and `label: BachKhoa Technology`.
  - **Palette:** background `#0E1012`, midground `#F0F4F8`, and foreground `#00ADEF` at a low
    alpha.
  - **`colorOverrides`:**
    - `card` is `#1A1C1E`, `popover` is `#282B30`, and `muted` is `#212428`.
    - `mutedForeground` is `#94A3B8`.
    - `primary` and `ring` are `#00ADEF`, with `primaryForeground` set to `#0E1012`.
    - `secondary` is `#3F51B5`, and `success` is `#A2D149`.
    - `border` is a low-alpha indigo.
  - **`componentStyles`:** the header and sidebar use `#212428`, and cards get an indigo
    hairline border.
  - **`customCSS`:** a cyan focus ring, a cyan pulse keyframe for live generation, and an
    indigo surface for `[data-tool]` blocks. The server truncates `customCSS` silently at
    32 KiB (`hermes_cli/web_server_dashboard.py:318`), so keep it under 8 KiB.
  - It sets no `assets.logo`.
- `plugins/bkt-brand/dashboard/manifest.json` declares a hidden tab and the `header-left` slot.
- `plugins/bkt-brand/dashboard/assets/logo.png` is a copy of the root `Logo.png`, which is
  tracked and stays untouched.
- `bkt/packages/brand/src/index.tsx`:
  - The `header-left` slot renders the logo at about 28px high, from `selfAssetUrl` (phase 1),
    so the base path and profile segment hold. It works under every theme.
  - It sets the favicon to the same URL.
  - While the sidebar is collapsed, `header-left` is hidden and the logo is not shown. This is
    accepted, and the favicon still carries the brand.
- `plugins/bkt-author/dashboard/manifest.json` declares the `post-main` slot and the
  `/bkt-about` tab, with `position: end` and icon `Heart`.
- `bkt/packages/author/src/index.tsx`:
  - The `post-main` slot renders a small muted line under the page content: "Son Do ·
    sondn2010@gmail.com", where the address is a `mailto:` link.
  - The About page shows the author, the company and the logo. It lists the installed `bkt-*`
    plugins with their versions from `/api/dashboard/plugins`.
  <!-- Red Team: author line moved from footer-right to post-main -->
  <!-- Updated: Validation Session 1 - user confirmed post-main strip plus the About tab -->

## Steps

1. Write the theme, install it, and check the contrast of `#94A3B8` on `#1A1C1E`, which must be
   at least 4.5:1.
2. Build the brand and author packages.
3. Check how the theme looks on Sessions, Config, Files and Chat.

## Verification

- `curl /api/dashboard/themes` lists `bkt`, and selecting it persists `dashboard.theme`.
- The logo shows in the sidebar header under the bkt theme and the default theme, and under a
  non-default profile (`/dashboard-plugins/@<profile>/...`).
- The author line shows under the page content, and the About tab renders.
- check-additive passes.

## Risks

- The `post-main` line appears on every page, including Chat. Keep it a single muted line so it
  does not compete with page content.
