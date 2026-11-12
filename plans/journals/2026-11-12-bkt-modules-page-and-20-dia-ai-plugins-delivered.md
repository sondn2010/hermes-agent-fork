---
title: BKT Modules page and 20 DIA AI plugins delivered
date: 2026-11-12
summary: Executed the bkt-modules plan in 3 parallel waves; review fixes applied; SSRF private-endpoint decision and live ES smoke still open
---

# BKT Modules page and 20 DIA AI plugins delivered

## What happened
- Ran plan `plans/261112-1101-bkt-modules-page-and-diaai-plugins` with `/ak-cook --parallel --auto`. Wave A was the shared module and pilot plus the dashboard page. Wave B was 6 agents building 19 plugins in disjoint directories. Wave C was verification and docs.
- Delivered:
  - `plugins/bkt_dia_common/`: settings, a fail-closed query client and a tool factory.
  - 20 `plugins/bkt-dia-*` modules with 1-2 read-only tools each, plus a skill.
  - Generic `tags` on dashboard hub rows.
  - The `/bkt-modules` web page.
  - `docs/bkt-dia-modules-{user-guide,admin-setup}.md` and the website page `website/docs/user-guide/features/bkt-modules.md`.
- Tests:
  - 288 tests pass across `tests/plugins/bkt_dia` and the hub-tags test. This includes a cross-module contract test with 65 checks.
  - The web gates pass: typecheck, lint, and 512 vitest tests.

## Problems found
- **Plugin API boundary:** `hermes_cli.env_loader` is not on the plugin API. The API key is read through `hermes_cli.config.get_env_value_prefer_dotenv` instead, which still resolves per profile.
- **Undocumented `ctx.manifest`:** reading `ctx.manifest` at load time breaks the capability probe in `hermes plugins validate`.
- **Validate probe loses site-packages:** on this Windows dev install, the probe child process only finds the venv's site-packages if they are exported on `PYTHONPATH`.
- **Shared install lock:** parallel agents contended for the PM install lock, which caused transient `No module named 'httpx'` and `ruamel` errors.
- **Prompt-surface test is Linux-only:** `scripts/ci/prompt_surface.py` forces `sys.platform = "linux"`, so `tests/ci/test_prompt_surface.py` cannot pass on Windows and must be confirmed in CI.
- **Category labels differed:** the Vietnamese labels on the page did not match `categories.py`. I aligned the page to `categories.py`.

## Review fixes
- A redirect-not-followed test.
- The cron example string in the risk-monitor skill now parses.
- The category switch is disabled while one of its modules has a toggle pending.
- `register()` no longer touches secrets.
- `UnscopedSecretError` makes a query fail closed.
- The endpoint value is no longer logged.
- The URL-safety hint names the actual possible causes.

## Decision pending
- A private DIA endpoint currently needs the global `security.allow_private_urls`. The options are a floor-only check (`is_always_blocked_url`), a plugin-scoped opt-in, or keeping the current behaviour. The user decides.

## Next steps
- Run a live smoke test against the real ES endpoint.
- Confirm the prompt-surface snapshot in Linux CI.
- Get BA answers on F021 analysis vs spec, UC136, UC158 and the Zalo adapter.
- Split `apps/desktop/src/i18n/vi.ts`, which already failed the health check before this work.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
