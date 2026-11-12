# Code review: BKT Modules page and bkt-dia plugins

Date: 2026-11-12. Scope: the uncommitted changes on `feature/bktech`, covering the `plugins/bkt_dia_common/` module, the dashboard hub `tags` change, the `/bkt-modules` web page, three sampled plugins (enterprise-profile, partner-matchmaking and risk-monitor) and the bkt test files.

The review found no Critical or High issues. The controller fixed every item except Medium 1, which is waiting on a user decision.

## Findings and dispositions

| # | Sev | Finding | Disposition |
|---|---|---|---|
| M1 | Medium | `query_client.py` uses `is_safe_url`. A private DIA endpoint therefore forces the global `security.allow_private_urls: true`, which also relaxes SSRF blocking for every model-driven URL tool. | **Open: needs a user decision.** Option A is the floor-only check `is_always_blocked_url`, the primitive the repo uses for trusted targets. Option B is a plugin-scoped opt-in such as `settings.allow_private_endpoint`. Option C keeps the current behaviour. |
| M2 | Medium | No test pins `follow_redirects=False`. | Fixed. The stub gained a `redirect_to` knob. `test_redirect_is_not_followed` returns a 302 to 169.254.169.254 and asserts a fail-closed result with exactly one request. |
| M3 | Medium | The cron example in the risk-monitor skill, `"every 1d at 08:00"`, is rejected by the parser. | Fixed: the example now reads `"every day at 08:00"`. Checked with `cron.jobs.parse_schedule`, which gives `0 8 * * *`; the old string raises "Invalid duration". |
| L1 | Low | The category switch could race a row toggle that was still pending for one of its modules. | Fixed. The switch is now disabled while any module in the section is pending (`bkt-modules-category-section.tsx`). |
| L2 | Low | `register()` resolved the API key and could raise `UnscopedSecretError`. `query()` called `load_settings()` without a guard. | Fixed. `register()` now reads only `configured_endpoint()`. `query()` catches `UnscopedSecretError` (published `agent.secret_scope`) and fails closed. |
| L3 | Low | An invalid endpoint was logged with `%r`, so any userinfo credentials in the URL could reach the log. | Fixed: the log line no longer includes the endpoint value. |
| L4 | Low | The URL-safety hint always blamed cloud metadata. | Fixed: the hint now names the possible causes (DNS failure, credentials in the URL, a blocked address, a private address needing the opt-in). |
| L5 | Low | Two count or set-equality assertions read like snapshots. There is no drift check between the TS category list and Python `CATEGORIES`. | Not changed. The count of 20 is the plan's acceptance contract. The page labels were hand-aligned to `categories.py` during this run. A TS↔Python drift check is optional follow-up. |

## Verification after fixes
- `scripts/run_tests.sh tests/plugins/bkt_dia tests/hermes_cli/test_plugins_hub_tags.py`: 11 files, 288 passed, 0 failed.
- Web: `tsc --noEmit` clean, eslint on `src/pages/bkt-modules` clean, and the BKT vitest suites pass 20 of 20.
- `boundary_lint.py --check`: rc 0, counts unchanged at 843 and 20.
- `python scripts/check`: only the known `apps/desktop/src/i18n/vi.ts` FILE_LINES finding, which predates this work.

## Unresolved questions
- M1: choose between the floor-only check, a plugin-scoped private opt-in, or keeping the global toggle.
