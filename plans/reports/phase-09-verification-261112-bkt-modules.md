# Phase 09 verification: BKT Modules page and 20 DIA AI plugins

Date: 2026-11-12. Branch `feature/bktech`. Nothing committed.

## Outcome

Status: DONE_WITH_CONCERNS. The bkt work passes: the contract test, all 9 bkt_dia test files, plugin validation on all 21 directories, web typecheck, lint and tests, and the dashboard toggle. Two gates are not green for reasons outside bkt code: `python scripts/check` (one pre-existing health finding) and the prompt-surface test, which fails on this Windows host because a CI child process cannot find the home directory. The live ES smoke was not run because no endpoint is reachable.

## Fixes made in this phase

1. `plugins/bkt-dia-enterprise-profile/plugin.yaml`: version `1.0.0` to `0.1.0`, and tags now `[bkt, diaai, category:domain-lookup, f015]`. This is the controller decision. The pilot tests still pass (`test_enterprise_profile.py`, in the suite run below).
2. `plugins/bkt_dia_common/tool_factory.py`: the docstring example `version: 1.0.0` changed to `0.1.0`. No behaviour change.

No other source changes. `scripts/boundary_lint_baseline.json` was not touched because no new crossing was added.

## Files added

- `tests/plugins/bkt_dia/test_all_modules_contract.py`: 65 tests, all passing. It covers real discovery in a temp profile. Per-plugin checks: manifest shape (one `category:*` tag in the shared map, `bkt`, `diaai`, `fNNN` tags, `requires_plugins` lists the common module), loaded tools equal `provides_tools` and pass `validate_module_spec`, toolset equals the plugin name, skill registered. Global checks: tool names unique and `bkt_dia_*`, each of the 20 function codes maps to exactly one plugin. Enable-all registers every tool. Disabling one module removes only its tools, for each of the 20 modules. The common module is `category:shared` with no tools. The version is not pinned.

   Note on "fresh load": the disable test uses `discover_and_load(force=True)` on the same manager. This matches the accepted pilot test. A new process is not simulated.

## Acceptance criterion 1: page lists bkt modules, filters, toggle persists

- Hub API, with the session header, returned 21 `bkt-*` rows (20 functions plus `bkt-dia-common`), and every row has `tags` including `category:*`.
- Toggle round trip on `bkt-dia-workforce` through the real endpoints:
  - `POST /api/dashboard/agent-plugins/bkt-dia-workforce/enable` returned `{"ok":true,...,"restart_required":true}`. `config.yaml` became `plugins.enabled: [bkt-dia-workforce]`.
  - `POST .../disable` returned `{"ok":true,...}`. `config.yaml` became `enabled: []`, `disabled: [bkt-dia-workforce]`. Hub `runtime_status` followed: `disabled`.
- `GET /bkt-modules` returns HTTP 200 (the SPA shell).
- Filter and category-toggle logic is covered by the web vitest suite (`BktModulesPage.test.tsx`, `bkt-modules-grouping.test.ts` and siblings, all passing in the 75-file run below). I did not drive a real browser, so the visual filter and switch behaviour is not verified end to end.

Evidence: the scratch files `hub09.json` and `smoke09home/config.yaml` are in the scratchpad.

## Acceptance criterion 2: each plugin validates, has category, tool, skill, behaviour and fail-closed tests

`hermes plugins validate plugins/<dir>` was run for all 21 directories inside the managed environment (`scripts/run-in-hermes-env`) with a scratch `HERMES_HOME`. Result: 21 of 21 exit 0, 21 of 21 print `Validation passed.`, 21 of 21 show `✓ capability probe — register() ran in isolation`. Log: `validate09.log` in the scratchpad.

Concern: every plugin also prints a `⚠ private core imports` warning. The warning lists the in-tree `plugins.bkt_dia_common.*` imports (for example `plugins.bkt_dia_common.query_client.query`). The plan permits module-to-module imports, and the validator treats any `plugins.*` import outside the published API as private. The warning does not fail validation. It is still a warning, so the "0 warnings" wording in requirement 1 is only met for the capability probe. Resolving it would mean changing the shared-module design or publishing `plugins.bkt_dia_common` names, which is a design decision for the controller.

Per-module tests: the 9 `tests/plugins/bkt_dia/*` files pass in the suite run, including the stub-server behaviour tests and the unset-endpoint and HTTP 5xx fail-closed tests. Each function module has a `category:*` tag, one or two tools and a skill directory matching its name.

## Acceptance criterion 3: enabled tools in a session, disabled tools absent

Covered by `test_all_modules_contract.py`: enable-all registers each tool under its toolset, and disabling one removes exactly its tools. Also covered by the per-module test `test_enabled_toolset_is_on_for_a_new_cli_session` in `test_enterprise_profile.py`.

## Acceptance criterion 4: gates

### Prompt surface (`tests/ci/test_prompt_surface.py`): NOT GREEN, not confirmed

Result: 1 failed, 1 passed. The failing test is `test_committed_prompt_surface_is_current`, which asserts `render(...) == 0`, so the render child failed. Captured stderr: `hermes: Could not determine home directory.; run hermes pm repair`.

Findings:
- `tests/fixtures/prompt_surface` is unchanged in git (`git status` clean). No file under `hermes_cli`, `agent`, `tools`, `cli.py`, `run_agent.py`, `model_tools.py`, `toolsets.py`, `hermes_constants.py` or `gateway` mentions `bkt`. The stock `plugins.enabled` default is an empty allow-list, so bundled bkt plugins cannot reach the stock surface. No leak is found.
- The failure is the same environment fault seen in the unrelated suite failures below. `scripts/ci/prompt_surface.py` builds the render child's environment from an allow-list (`PATH`, `HOME`, `HERMES_HOME`, `HERMES_RUNTIME_DIR`, `SYSTEMROOT`). It omits `USERPROFILE`, which Windows `Path.home()` needs. A scratch copy that also passes `USERPROFILE` moved the failure to a different child-process import error, so I did not get a clean render. The diff against the snapshot is therefore not verified on this host.
- I did not re-render or edit the snapshot. I also did not edit `scripts/ci/prompt_surface.py`, because it is outside my fix authority.

Decision needed: add `"USERPROFILE"` to the allow-list at `scripts/ci/prompt_surface.py` line 209, which is a one-token change, or run this test on a Linux or CI runner where the child environment works. Either way the snapshot should be confirmed current before merge.

### `python scripts/check`: one blocking finding, pre-existing

`scripts/check`: 16 checks, 15 pass, 1 fails: `health`.
- `apps/desktop/src/i18n/vi.ts:1 FILE_LINES` at 3370 lines against a 2000-line target.
- Introduced by commit `629598e866` (2026-08-15, "Add language Vietnamese") and later edit `ca9c9c7417` (2026-08-17). This branch's bkt work does not touch it.

### Test suites: `scripts/run_tests.sh tests/plugins/ tests/hermes_cli/test_plugins_hub_tags.py tests/ci/test_docs_drift.py tests/scripts/test_boundary_lint.py`

Summary: 182 files, 2551 passed, 19 failed, 16 skipped.
- All 9 `tests/plugins/bkt_dia/*` files pass. Also passing: `tests/hermes_cli/test_plugins_hub_tags.py` (3 passed), `tests/ci/test_docs_drift.py` (2 passed) and `tests/scripts/test_boundary_lint.py` (7 passed). None of them is in the failing list.
- 19 failures in 7 unrelated files, none referencing bkt or a file modified on this branch:
  - `tests/plugins/config_backends/test_remote_backend.py` (6), `test_remote_multiprocess.py` (3), `test_remote_conformance.py` (1), `test_remote_nous_cold_boot.py` (6): the log shows `RuntimeError: Could not determine home directory` raised from `pm/workspace.py` and `pm/plugins_state.py` in a child process with a stripped environment, the same family as the prompt-surface failure. The log also contains `ssl.SSLError: [SSL] unknown error (0xa080024)`, a Windows certificate-store symptom, which I did not attribute per test.
  - `tests/plugins/memory/test_byterover_multiplex_child_env.py::test_secondary_profile_child_uses_its_own_key_not_defaults`
  - `tests/plugins/platforms/photon/test_auth.py::test_find_project_by_name_case_insensitive`
  - `tests/plugins/test_google_meet_plugin.py::test_looks_like_human_speaker`
  - These are not caused by this branch: the branch does not modify those tests or their sources, and none imports a bkt module. I did not rerun them on `HEAD` to prove they fail there too.

Timing: the contract test takes about 40 s alone and about 90 s inside the parallel suite. The 20 disable cases each re-run discovery of 21 plugins. If that is too slow, the disable check can move to a representative subset.

### Web: `npm run typecheck && npm run lint && npm test` (in `web/`, after the label change)

- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors, 29 warnings, none in the bkt files (`eslint src/pages/BktModulesPage.tsx src/pages/bkt-modules` exit 0).
- `npm test`: 75 files, 512 tests passed. Node is 22.21.0, the project expects 26. Not upgraded, per the brief. The `HTMLCanvasElement` "not implemented" messages are jsdom noise, not failures.

## Live ES smoke: NOT RUN

No endpoint is reachable. Probes to `http://127.0.0.1:8000/api/v1/query/test` and `http://localhost:8080/api/v1/query/test` both returned no connection. The service source exists under `D:\Sources\fish\outsources\ironman-all\ironman-mcp-api\...` but was not started, and no endpoint is configured in this verification home. Nothing was faked. `hermes chat -q` for F015 and F016 was not run.

## Processes

- The dashboard was started on `127.0.0.1:9417` with a temp `HERMES_HOME` (`scratchpad/smoke09home`) and a test session token. It was stopped. The listener on 9417 is gone, and no process referencing `smoke09home` remains.
- A managed-env bootstrap for a fresh home was started in error and stopped by PID. The stale interpreter PID 4207228 from `D:\AI\hermes\tools` belongs to another process and was left running.

## Unresolved questions

1. Approve the one-token `USERPROFILE` addition to `scripts/ci/prompt_surface.py`, or require a Linux or CI confirmation of the prompt-surface snapshot?
2. Is the `⚠ private core imports` warning on all 21 plugins acceptable for an in-tree shared module, or should `plugins.bkt_dia_common` names be published through the plugin API?
3. Should `scripts/check` health be closed for `apps/desktop/src/i18n/vi.ts` as a separate change? It is out of scope here.
4. Who runs the live ES smoke, and against which endpoint?

Status: DONE_WITH_CONCERNS
Summary: The bkt contract test (65 passing), all 21 plugin validations, the 9 bkt_dia suites, the web gates and the dashboard toggle all pass. Remaining blockers: the prompt-surface test cannot render on this Windows host (a child-environment home-directory issue, not a bkt leak), `scripts/check` has one pre-existing desktop-file health finding, and the live ES smoke has no reachable endpoint.
Concerns/Blockers: See the unresolved questions above.
