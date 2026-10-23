---
phase: 2
title: "Theme, brand logo and author"
status: pending
priority: P1
effort: "0.5d"
dependencies: [1]
---

# Phase 2: Theme, brand logo and author

## Goal

Ship the BKT theme, put the company logo in the header and show the author footer, all without
core changes.

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
  - **`assets.logo`:** `/dashboard-plugins/bkt-brand/assets/logo.png`.
  - **`customCSS`:** a cyan focus ring, a cyan pulse keyframe for live generation, and an
    indigo surface for `[data-tool]` blocks. The total stays under the 32 KiB cap.
- `plugins/bkt-brand/dashboard/manifest.json` declares a hidden tab and the `header-left` slot.
- `plugins/bkt-brand/dashboard/assets/logo.png` is a copy of the root `Logo.png`. The untracked
  root `Logo.png` stays untouched.
- `bkt/packages/brand/src/index.tsx`:
  - The `header-left` slot renders the logo at about 28px high.
  - It reads `--theme-asset-logo-raw` when the active theme provides one and falls back to the
    plugin's own asset otherwise, so the logo also shows under other themes.
  - It sets the favicon to the logo.
- `plugins/bkt-author/dashboard/manifest.json` declares the `footer-right` slot and the
  `/bkt-about` tab, with `position: end` and icon `Heart`.
- `bkt/packages/author/src/index.tsx`:
  - The footer shows "Son Do · sondn2010@gmail.com", where the address is a `mailto:` link.
  - The About page shows the author, the company and the logo. It lists the installed `bkt-*`
    plugins with their versions from `/api/dashboard/plugins`.

## Steps

1. Write the theme, install it, and check the contrast of `#94A3B8` on `#1A1C1E`, which must be
   at least 4.5:1.
2. Build the brand and author packages.
3. Check how the theme looks on Sessions, Config, Files and Chat.

## Verification

- `curl /api/dashboard/themes` lists `bkt`, and selecting it persists `dashboard.theme`.
- The logo shows in the header under the bkt theme and under the default theme.
- The footer shows the author line and the About tab renders.
- check-additive passes.

## Risks

- `footer-right` replaces the default footer content. This is accepted because the footer
  belongs to the brand.
