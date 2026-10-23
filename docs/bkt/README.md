# BachKhoa Technology dashboard extensions

The Hermes fork ships eight `bkt-*` dashboard plugins, a BKT theme, and the company logo. All of
it is **additive**: no file that exists on `main-bktech` is changed, so merging upstream Hermes
adds no new conflicts. Developer details live in [`bkt/README.md`](../../bkt/README.md).

## Install

Requirements: Node 20+ and npm, plus a working Hermes checkout of this fork.

```sh
node bkt/install.mjs              # WSL / Linux / macOS (or: sh bkt/install.sh)
powershell bkt\install.ps1        # native Windows
```

The installer does three things:

1. It runs `npm --prefix bkt ci`.
2. It builds the plugins plus the mermaid diagram renderer. Mermaid is about 3.4 MB, so it is
   built locally and never committed.
3. It copies the theme into the root Hermes home and every profile home, which it finds through
   `hermes config path`.

Use `--home <dir>` to install the theme into a single home, and `--skip-npm` to reuse
`bkt/node_modules`. Restart a running dashboard afterwards, because plugin API routes are
mounted at startup.

The plugins are bundled with the checkout, so you do not need a `plugins.enabled` entry. To turn
one off, add it to `plugins.disabled` in that profile's `config.yaml`.

## What you get

| Plugin | Where | What it does |
|---|---|---|
| `bkt-brand` | sidebar header and favicon | Shows the BKT logo under every theme and profile. It also hosts the shared mermaid renderer. |
| `bkt-author` | a line under every page, plus the **About BKT** tab | Shows the author credit, and lists the installed `bkt-*` plugins with their versions. |
| `bkt-profiles` | **Profile Workbench** tab | A profile workbench: SOUL editor, messaging setup and onboarding, pairing approvals, API server keys, and an overview with clone, export and import. |
| `bkt-files` | **Files+** tab | A file manager: folder upload, zip and unzip, drag-and-drop move, rename, copy, search, previews and inline text editing. |
| `bkt-chat` | **BKT Chat** tab | A React chat with the agent over the dashboard's WebSocket gateway. It works on native Windows, where the terminal chat does not, and renders markdown, mermaid, tool calls, approvals and clarifying questions. |
| `bkt-kanban-workflow` | **Kanban Flow** tab | A graph of how kanban work moves between profiles (links and reassignments), with live-run overlays, board and time-window filters, and per-profile drill-down. |
| `bkt-health` | **Health** tab and a status dot in the header | Shows gateway, messaging and API server health per profile. It polls every 15 s while visible and has a per-platform Test button. |
| `bkt-prompts` | **Prompts** tab | A per-profile prompt library with `{{variables}}`, search, tags and JSON import and export. **Use** fills in the variables and opens the prompt in BKT Chat. |

The dashboard groups plugin tabs separately from the core pages, so the BKT tabs appear in the
plugin section of the sidebar.

### Theme and logo

Pick **BachKhoa Technology** in the theme picker. The palette is:

- cyan `#00ADEF` as primary;
- indigo `#3F51B5` as secondary;
- lime `#A2D149`, used only for success states;
- graphite surfaces.

The logo is drawn by `bkt-brand`, not by the theme, so it also shows under the other themes.
While the sidebar is collapsed the header logo is hidden, but the favicon still carries it.

### Safety notes

- **API server keys** (bkt-profiles):
  - Keys are generated on the server with `secrets.token_urlsafe(32)`.
  - The full value is shown once and is masked everywhere else.
  - Generating or deleting a key is rate-limited and written to the audit log without the value.
  - A usable `.env` `API_SERVER_KEY` wins over a `config.yaml` key. While the profile's key comes
    from `config.yaml`, generation is refused, because a generated `.env` key would silently
    replace it for every client.
  - A profile's own gateway needs a restart to pick up a new key. A multiplexed secondary profile
    does not.
- **File operations** (bkt-files):
  - Every source, destination, walked entry and archive member passes the core managed-path
    policy and the sensitive-path guard (`.env`, credentials, `mcp-tokens/`, `pairing/`).
  - Live SQLite databases are refused.
  - Hermes and profile homes cannot be moved, renamed or deleted, and nothing can be written into
    a Hermes `plugins/` directory.
  - Symlinks are never followed.
  - Archives are checked for zip-slip, symlink members and zip bombs.
- **Untrusted content**: markdown renders without raw HTML, and mermaid runs in strict mode.
- **Profiles**: every action names its target profile explicitly, and prompts are stored per
  profile. To share a prompt between profiles, export it as JSON and import it.

## Maintaining the fork

### One-time upstream setup

```sh
git remote add upstream https://github.com/NousResearch/hermes-agent.git
```

### Upstream sync checklist

1. `git fetch upstream`
2. Merge `upstream/main` into the fork branch.
3. Run `node bkt/scripts/check-additive.mjs`. It must report no changes outside `bkt/`,
   `plugins/bkt-*/`, `tests/plugins/bkt_*/` and `docs/bkt/`.
4. Run `npm --prefix bkt ci && npm --prefix bkt run build`, then
   `node bkt/scripts/check-dist-fresh.mjs`. Commit any rebuilt `dist/` file: bkt-chat bundles
   `apps/shared` sources, so upstream changes there change the bundle.
5. Run `npm --prefix bkt test`. Its contract test fails if the gateway JSON-RPC names bkt-chat
   uses have changed.
6. Run `scripts/run_tests.sh tests/plugins/bkt_common tests/plugins/bkt_profiles tests/plugins/bkt_files tests/plugins/bkt_kanban_workflow tests/plugins/bkt_prompts`.
   The seams test fails if a Hermes internal listed in
   [`bkt/UPSTREAM-SEAMS.md`](../../bkt/UPSTREAM-SEAMS.md) was renamed.
7. Smoke-test BKT Chat with one turn.

### Baseline conflicts

Before this work, the fork had already changed tracked files compared with upstream: the CNCNS
rebrand, Vietnamese i18n and the logo commits. Those files can still conflict on a merge. They
are the existing baseline, not BKT conflicts, and are resolved separately.
