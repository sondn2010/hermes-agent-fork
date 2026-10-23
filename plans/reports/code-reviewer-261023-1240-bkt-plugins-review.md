# Code Review: bkt dashboard plugins (uncommitted, branch feature/bkt-plugins-theme)

Date: 2026-10-23 (Asia/Saigon). Read-only review. No source files were edited.

## Scope
- plugins/bkt-files/dashboard/plugin_api.py (943 LOC), bkt-profiles (253), bkt-prompts (170), bkt-kanban-workflow (131)
- tests/plugins/bkt_* (about 1,100 LOC)
- bkt/shared, bkt/packages/*/src (TS; dist bundles skipped)
- Baseline: `scripts/run_tests.sh tests/plugins/bkt_*`: 127 passed, 2 skipped (platform-marked). `npm --prefix bkt test`: 158 passed.
- Experiments: scratch tests at /private/tmp/claude-501/-Users-sondn2010gmail-com-RiderProjects-hermes-agent-fork/89ee2375-646e-4a33-ac4f-e6309f4495e0/scratchpad/exp/ (test_exp.py, test_deep.py). They reuse a copy of the bkt_files conftest and run through scripts/run_tests.sh on macOS APFS (case-insensitive).

## Overall Assessment
bkt-files is careful about symlinks, zip-slip, archive link members and plugin-dir writes. But it routes every name check through core `_is_sensitive_path`, which uses `str.lower()`, and its `follow=False` path never canonicalizes the final path component. I bypassed the credential guard end to end on macOS, both for reads (exfiltration) and for writes. There is also a quadratic-memory DoS in unzip, and two data-loss paths. bkt-profiles, bkt-prompts and bkt-kanban-workflow look sound. bkt-chat rendering is safe.

## Critical

### C1. Unicode case-fold bypass of the sensitive-path guard: read, exfiltrate and overwrite credentials (VERIFIED by test)
- Where: plugin_api.py:194 (`_check`), :363 (`_walk`), :612 (`_scan_archive`), :865 (`_iter_search`). All of them delegate to core `hermes_cli/web_routers/files.py:86-108`, which compares `name.lower()` against the denylist.
- Cause: APFS (the macOS default) and NTFS fold case using Unicode case folding. `"auth.j\u017fon"` (LATIN SMALL LETTER LONG S) and `"con\ufb01g.yaml"` (the fi ligature) open `auth.json` and `config.yaml`, but `.lower()` leaves both characters unchanged. The plugin's own `_fold()` uses `casefold()`, which is why the plugins-dir guard held in the same experiment. The credential guard did not.
- Concrete requests. Each one passed on this machine against a temp HERMES_HOME:
  - `POST /zip {"paths": ["~/.hermes/auth.j\u017fon"]}` returns 200, and the zip contains the auth.json contents.
  - `POST /zip {"paths": ["~/.hermes/mcp-token\u017f"]}` returns 200, and the zip contains `mcp-tokens/server.json` (all MCP OAuth tokens).
  - `POST /rename {"path": "~/.hermes/auth.j\u017fon", "new_name": "stolen.txt"}` returns 200. Core `/api/files/read` then serves the credentials.
  - `POST /write-text {"path": "~/.hermes/con\ufb01g.yaml", "content": "pwned: 1"}` overwrites config.yaml. config.yaml controls MCP server commands, so this becomes command execution on the next agent start.
  - `POST /unzip` with dest `~/.hermes` and `on_conflict=overwrite`, on an archive holding `con\ufb01g.yaml` and `mcp-token\u017f/evil.json`, overwrites config.yaml and plants a file in mcp-tokens/. The archive can be one a prompt-injected agent dropped into the workspace.
- Fix: in the plugin, wrap the check, e.g. `_sensitive(p) = _is_sensitive_path(Path(*(unicodedata.normalize("NFKC", s).casefold() for s in p.parts)))`. Use it everywhere `_is_sensitive_path` is called, including archive member names. Also report the core `_is_sensitive_filename` bug upstream; it should use `casefold()` plus NFKC. Core `/api/files/read` has the same hole, so check SECURITY.md before opening a public issue. Add a regression test with `\u017f` and `\ufb01` variants that is marked red on the current code.

## High

### H1. Windows: final-component aliases bypass the guard on every `follow=False` route (by reading; not run, no Windows host)
- Where: plugin_api.py:223-233. `_guard(follow=False)` resolves the parent only and checks `entry.name` as typed.
- Win32 normalizes these names at open time but `_is_sensitive_filename` does not: `.env ` (trailing space), `config.yaml.` (trailing dot; `.env.` happens to be caught), `.env::$DATA` (alternate data stream), and 8.3 short names (`CONFIG~1.YAM`, `MCP-TO~1`).
- Example: `POST /zip {"paths": ["C:\\Users\\u\\.hermes\\.env::$DATA"]}` → `_open_regular` opens the main stream of .env, which leaks into the zip. `write-text` on `...\config.yaml.` replaces config.yaml through `os.replace`. Core read is not affected, because `resolve()` canonicalizes existing names there.
- Fix: in `_guard(follow=False)`, run `name_problem(name)` on the final component (it already rejects `:`, trailing dots and spaces, and reserved names). Then also `_check(_real(entry))` when the entry is not a symlink, so the on-disk long name is checked.

### H2. Unzip memory and CPU DoS from deep member paths (VERIFIED by measurement)
- Where: plugin_api.py:626-627 (`for depth in range(1, len(parts)): plan.dirs.add(parts[:depth])`), plus the quadratic check at :640.
- Measured inside `_scan_archive`, with tracemalloc on:

  | Path components | Archive size | Peak memory | Time |
  |---|---|---|---|
  | 2,000 | 8 KB | 17 MB | 0.5 s |
  | 4,000 | 16 KB | 65 MB | 2 s |
  | 8,000 | 32 KB | 258 MB | 8 s |

  The archive is accepted every time. A 64 KB member name gives about 32k components, which is roughly 4 GB. Ten such members fit in an archive under 1 MB and OOM the dashboard process, before any write and before the size or ratio checks matter.
- Fix: reject a member whose part count is over a small cap (e.g. 64) or whose filename is over about 1,024 bytes. Do this right after `normalize_archive_parts`, before `plan.dirs` is filled.

### H3. Move with `on_conflict=overwrite` deletes the destination before a rename that can fail (by reading)
- Where: plugin_api.py:482-494. The code runs `shutil.rmtree(target)` or `target.unlink()` and only then `os.rename`. EXDEV (moving across volumes, e.g. to an external disk or a Docker bind mount), EACCES or EBUSY then raise a 409 or 500 after the existing destination is already gone.
- Fix: rename the existing target to a sibling backup first, then `os.rename` the source into place, and delete the backup only after success (restore it on failure). Alternatively, check `st_dev` of the source against the destination before deleting anything.

## Medium

### M1. Unzip "rename" mode silently loses members that collide with generated names (VERIFIED by test)
- Where: plugin_api.py:707-709. `_unique_name` checks only the disk. It ignores other archive members and other renames.
- Experiment: `out/a.txt` exists on disk. The archive holds `a.txt` and `a (1).txt`. The response says `files: 2`, but `out/a (1).txt` contains only `member-a1`. The content of member `a.txt` is lost.
- Also, `os.replace` at :728 overwrites without warning in `fail` mode if a target appears between the check and the replace.
- Fix: build a `taken` set from the disk names plus every planned final name in that directory, and use it in `_unique_name`. In `fail` mode, use `os.link` + `unlink` or an O_EXCL-style placement so a file that appears late is not overwritten.

### M2. The "no code dirs" invariant covers plugins/ only (VERIFIED for hooks/)
- `write-text` into `~/.hermes/hooks/<name>/handler.py` returns 200. The gateway imports hooks (gateway/hooks.py:25), so this is the same risk class that the plugins-dir refusal exists to block.
- The module docstring (lines 13-15) promises more than the code delivers.
- The plugins guard can also be bypassed by moving an ancestor that is not a Hermes home. Example: rename the Hermes checkout that holds the bundled plugins/, then move a staged tree into its old name. `_check` only tests whether the top-level target is *under* a plugin dir, not whether it *contains* one.
- Core upload-stream is unguarded by design, so treat this as defense in depth. Still, either add `hooks/` (and `skills/`) per home to `plugin_dirs`, and make move/copy refuse targets that contain a plugin dir, or reword the docstring so it does not overclaim.

### M3. Zip temp file can leak on client disconnect; X-BKT-Skipped header can be very large (by reading)
- Where: plugin_api.py:758 and :927-933. Up to 2 GB is staged in the system temp dir and removed by a `BackgroundTask`. Starlette skips background tasks if sending raises on disconnect, so the file may stay behind.
- The `X-BKT-Skipped` header holds up to 50 absolute paths, possibly more than 100 KB. Reverse proxies in gated deployments commonly reject headers over 8 to 16 KB, which breaks the download.
- Fix: unlink in a `try/finally` around the response, or stream from an already-unlinked fd. Cap the header at about 4 KB and return the full list in a follow-up JSON call or the body.

## Low
- L1. `name_problem` skips `COM0`/`LPT0` and names with a trailing `.`/space inside a multi-dot stem. Mostly covered; fine.
- L2. Copy has no total-byte cap (`WALK_MAX_ENTRIES` only), so a large copy can fill the disk. Zip and unzip have byte caps.
- L3. bkt-profiles `_check_rate` (plugin_api.py:219) charges a slot before the 409 checks, so refused clicks count against the limit. Cosmetic.
- L4. Walk/open TOCTOU: `_open_regular` uses O_NOFOLLOW on the last component only, so an intermediate directory swapped for a symlink after `_walk` is followed. Exploiting it needs a local process (e.g. the agent) that wins the race. The docstring acknowledges this; acceptable.

## Areas checked and found sound (with evidence)
- **bkt-profiles**
  - `_require_token` is called on all three routes.
  - The key value appears only in the generate response. Logs carry the variable name and profile only, and OSError text is not logged.
  - One per-home lock covers check plus write, so rotations do not race.
  - Writes go through `save_provider_env_credential`, which uses the scoped `get_env_path()`. `_plugin_route_secret_scope` binds `?profile=`, and the profile-scoping tests pass.
  - The mask hides short keys entirely.
- **bkt-prompts**
  - All SQL is parameterized. The only f-string interpolates a constant column list.
  - One connection per request is opened with `closing()`, and `plugin_db` resolves the home per call, so there is no launch-profile pinning.
  - Body and title are bounded, and import is capped at 500.
  - `_list` is unbounded in row count (max about 64 KB per row). Consider a LIMIT if libraries grow.
- **bkt-kanban-workflow**
  - Static SQL with named parameters and LIMITs.
  - `connect_closing` per request.
  - Does not create the board DB on read.
  - Has no `_require_token`, but `auth_middleware` (hermes_cli/web_server.py:444) covers all of `/api/` and the route is read-only.
- **bkt-files auth**: no `_require_token`, but the same middleware covers it. For a bundled plugin this is acceptable. Adding `_require_token` would match bkt-profiles/prompts and keep it safe if the plugin is ever run hosted.
- **bkt-chat**
  - Markdown is rendered with `skipHtml`, and react-markdown's default `urlTransform` (>=10) strips `javascript:` URLs.
  - Mermaid is pinned at 11.16.1 with `securityLevel: "strict"`; its DOMPurified SVG is the only `dangerouslySetInnerHTML`.
  - Unknown server requests are declined with `METHOD_NOT_FOUND` (useGatewaySession.ts:115-118).
  - Approval choices are filtered by `allow_session`/`allow_permanent` (reducer.ts:167).
  - The prefill uses sessionStorage only (no secrets).
  - The Telegram deep link uses `rel="noopener noreferrer"`. It comes from the backend, so validating that it is `https://t.me/` would be a cheap extra.
- **Symlink handling, zip-slip, archive symlink/special/encrypted members, locked_root containment and plugins-dir case folding**: tests pass, and my `\u017f` probe against plugins/ was correctly refused.

## Recommended Actions (priority order)
1. C1: casefold + NFKC sensitive check in the plugin, plus tests; escalate the core guard per SECURITY.md.
2. H1: `name_problem` + realpath check on the final component in `_guard(follow=False)`.
3. H2: cap member depth and name length in `_scan_archive`.
4. H3: back up and restore the destination instead of deleting it before rename in move-overwrite.
5. M1: make unzip rename collision-aware.
6. M2/M3: extend the protected code dirs or fix the docstring; make zip temp cleanup robust.

## Metrics
- Python tests: 127 pass / 2 skipped. TS: 158 pass. Lint and typecheck not run (`python scripts/check` not run).
- 8 scratch experiment tests: all bypasses in C1, the M1 collision and the M2 hooks write were confirmed.

## Unresolved Questions
- Is native Windows a supported target for the dashboard plugins? It decides whether H1 is High or Medium. The chat manifest claims Windows support.
- Should the core `_is_sensitive_filename` fix go through a private advisory (SECURITY.md §3.1), given that core `/api/files/read` is also affected on macOS/Windows?
