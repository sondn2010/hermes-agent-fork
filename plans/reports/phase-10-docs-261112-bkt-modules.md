# Phase 10 report: end-user and admin docs (BKT Modules + DIA AI)

Status: DONE_WITH_CONCERNS. Nothing committed. Only owned paths touched.

## Files

| File | Lines | Notes |
|---|---|---|
| `docs/bkt-dia-modules-user-guide.md` (new; `docs/` created) | 182 | Vietnamese primary, English summary at top. Page usage, rules (new sessions, keep `bkt-dia-common`, opt-in/token budget, per profile), one table per category (module, F-code, example questions, what it does not do, UCs), how answers work, FAQ. |
| `docs/bkt-dia-modules-admin-setup.md` (new) | 285 | Config keys/defaults/caps, `.env` key per profile, URL safety, CLI enable/disable, health check, error→fix table (strings from `query_client.py`), full UC matrix (118 rows: F, UC, status, tool), known limits. |
| `website/docs/user-guide/features/bkt-modules.md` (new) | 99 | English feature guide. |
| `website/sidebars.ts` | +1 | `user-guide/features/bkt-modules` after `plugin-catalog` in Features > Core. |

## Evidence

- Config keys, defaults (15s/max 60; 20/cap 100), endpoint normalization: `plugins/bkt_dia_common/settings.py`, `plugin.yaml`.
- API key via `hermes_cli.config.get_env_value_prefer_dotenv`: `settings.py`.
- `security.allow_private_urls` and always-blocked metadata: `tools/url_safety.py`; process-lifetime cache outside profile scope (docs say restart after changing).
- Fail-closed order and error strings: `query_client.py`.
- `requires_plugins` advisory (enable does not pull in `bkt-dia-common`): `website/docs/developer-guide/plugins/index.md`, `plugins_cmd.cmd_enable`.
- Health route returns 200 with `status` success/error: ES service `app/api/routers/query.py`.
- Page behaviour (search name+description, URL filters, category acts on visible modules, warning badge, vi labels): `web/src/pages/bkt-modules/*`, `web/src/i18n/en.ts`. User guide uses the page's vi labels (`bkt-modules-i18n.ts`).
- Coverage: phase 03–08 coverage tables verbatim in status. F015 had no coverage table; judged here from F015 spec UC097/UC107 + ES mapping basis in phase 05 report: UC097 covered, UC107 partial (only revenue/CIT per year 2022–2025).

## Validation

- Live CLI in scratch `HERMES_HOME` (scratchpad `home10`): `hermes config set plugins.entries.bkt-dia-common.settings.endpoint http://127.0.0.1:8000` wrote the nested key; `hermes plugins enable bkt-dia-common`, `enable/disable bkt-dia-enterprise-profile` succeeded (disable printed the `hermes gateway restart` hint).
- Grep: all 33 tool names in docs exist in `plugins/bkt-dia-*/` (0 missing); every `bkt-dia-*` name maps to a plugin dir; config keys, `BKT_DIA_QUERY_API_KEY`, `get_env_value_prefer_dotenv`, `allow_private_urls`, cited paths, UI strings ("Needs bkt-dia-common", "No BKT modules installed"), `session_search`, `text_to_speech`, `hermes logs` all present.
- `scripts/run_tests.sh tests/ci/test_docs_drift.py`: `1 files, 2 tests passed, 0 failed`. No core config keys or slash commands added, so nothing else needed.
- `python website/scripts/check_doc_links.py`: `OK: no route-style links in hand-authored docs.`
- Docusaurus build not run: `website/node_modules` absent; installing for a build is not cheap.
- All files < 800 lines.
- No screenshots (no running dashboard; no mockups used).

## Concerns

- Category vi labels differ: page shows "Tra cứu chuyên ngành", "Dùng chung", "Trợ lý & kênh"; `plugins/bkt_dia_common/categories.py` has "Tra cứu nghiệp vụ", "Thành phần dùng chung", "Trợ lý & kênh hội thoại". Docs follow the page. Not my file to fix.
- No zh-Hans translation of the website page (no parity test found requiring one).
- Coverage not checked against a live index (stated in all three docs).

## Unresolved questions

- Should the two vi category label sets be unified (page vs `categories.py`)?

Status: DONE_WITH_CONCERNS
Summary: Three docs and the sidebar entry are written, and every name in them was grep-checked; the docs-drift test and the link lint pass.
Concerns/Blockers: Docusaurus build not run (no node_modules); the page and `categories.py` use different Vietnamese category labels.
