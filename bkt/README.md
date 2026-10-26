# BKT dashboard plugins

Source for the BachKhoa Technology (`bkt-*`) dashboard plugins and theme. This directory is a
standalone npm package: it is **not** a member of the root npm workspace, so the root
`package.json` and `package-lock.json` stay untouched.

User and maintainer guide: [`docs/bkt/README.md`](../docs/bkt/README.md).

## Layout

| Path | What |
|---|---|
| `packages/<name>/src/index.tsx` | One plugin each; built to `plugins/bkt-<name>/dashboard/dist/index.js` |
| `shared/` | Helpers bundled into every plugin (SDK access, profile-aware requests, MarkdownView, ...) |
| `theme/bkt.yaml` | Dashboard theme; plugins cannot ship themes, so the installer copies it |
| `theme/skins/bkt.yaml` | CLI/TUI/Desktop skin; the installer copies it into `<home>/skins/` |
| `scripts/build.mjs` | esbuild IIFE build; React comes from the host SDK, never bundled |
| `scripts/check-additive.mjs` | Fails when the branch changes anything outside the new BKT roots |
| `scripts/check-dist-fresh.mjs` | Fails when committed `dist/` bundles differ from a clean rebuild |
| `UPSTREAM-SEAMS.md` | Every Hermes internal BKT depends on |

## Commands

```sh
npm --prefix bkt ci                      # install (uses the committed lockfile)
npm --prefix bkt run build               # build every plugin bundle
npm --prefix bkt run build:vendor        # also build the git-ignored mermaid vendor bundle
npm --prefix bkt test                    # vitest suite
npm --prefix bkt run typecheck
node bkt/scripts/check-additive.mjs      # base defaults to main-bktech
node bkt/scripts/check-dist-fresh.mjs    # commit dist/ first; reports stale bundles
node bkt/install.mjs                     # ci + vendor build + theme and skin into every Hermes home
node bkt/install.mjs --home <dir>        # theme and skin into one home only
node bkt/install.mjs --force             # also overwrite a skin already present in a home
```

Run `/skin bkt` in the CLI to apply the BKT brand colors to the CLI/TUI and Desktop.

`install.sh` and `install.ps1` wrap `install.mjs` for WSL/Linux and native Windows.

## Rules

- Only add files under `bkt/`, `plugins/bkt-*/`, `tests/plugins/bkt_*/` and `docs/bkt/`.
- Commit rebuilt `plugins/bkt-*/dashboard/dist/` files with the source change that produced
  them; `check-dist-fresh` enforces it.
- Each committed `dist/` file must stay under 450 KiB (the build fails otherwise), leaving a
  margin under the repository's 500 KiB blob-size gate.
- Mermaid (~3.4 MB) is never committed. `build.mjs --vendor` writes it to
  `plugins/bkt-brand/dashboard/dist/vendor/mermaid.js`, which a committed `.gitignore` ignores.
  Without it, mermaid fences render as code blocks.
- Bundled dashboard plugins need no `plugins.enabled` entry: they load unless listed in
  `plugins.disabled` (`hermes_cli/web_server_dashboard.py`, `_plugin_api_mount_skip_reason`).
- Every request that acts on a profile names it explicitly through `profileRequest` /
  `profileFetch` (`shared/api.ts`); add new core endpoints to `PROFILE_TRANSPORT` after checking
  how the route reads the profile.
- Agent and file content is untrusted: render markdown only through `MarkdownView` (no raw
  HTML, mermaid `securityLevel: 'strict'`).
