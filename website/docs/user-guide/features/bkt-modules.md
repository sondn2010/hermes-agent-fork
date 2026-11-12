---
sidebar_label: "BKT Modules (DIA AI)"
title: "BKT Modules and DIA AI plugins"
description: "Show or hide bkt-* plugins from the web dashboard, and set up the bkt-dia-* modules that answer questions from the DIA AI data service"
---

# BKT Modules and DIA AI plugins

The **BKT Modules** page in the [web dashboard](./web-dashboard.md) lists every plugin whose name
starts with `bkt-`, grouped by category, and lets you enable or disable them. The main set of
`bkt-` plugins is the DIA AI modules (`bkt-dia-*`): 20 read-only modules that answer questions
from the DIA Elasticsearch query service and cite their sources, plus the shared
`bkt-dia-common` module they all depend on.

The Vietnamese end-user guide and the operator guide (with the full use-case coverage matrix) live
in the repository at `docs/bkt-dia-modules-user-guide.md` and `docs/bkt-dia-modules-admin-setup.md`.

## Using the page

Open the dashboard (`hermes dashboard`) and choose **BKT Modules** in the navigation, or go to
`/bkt-modules`. The desktop app embeds the same dashboard.

- **Search** matches a module's name or description.
- **Categories** and **Status** (all, enabled, disabled) narrow the list. All three filters
  combine, and they are kept in the page URL, so a filtered view can be bookmarked or shared.
- Each module has a switch. Each category has a checkbox that shows how many of its modules are
  enabled and shows a mixed state when only some are. It switches the modules **currently
  visible** in that category, so active filters still apply.
- The switches call the same enable/disable action as the [Plugins](./plugins.md) page and
  `hermes plugins enable|disable <name>`.

Rules that matter:

- **Changes apply to new sessions.** A session's tool list is fixed when it starts so the prompt
  cache stays valid. Start a new session after toggling. A running gateway may need
  `hermes gateway restart`.
- **Keep `bkt-dia-common` enabled.** Enabling a DIA module does not enable it for you; while it is
  disabled every DIA tool refuses to query. The page marks enabled DIA modules with
  "Needs bkt-dia-common" in that case.
- **Everything is opt-in.** All modules are disabled by default. Every enabled tool is sent with
  every model call, so enable only the modules you need.
- **Per profile.** Each [profile](../profiles.md) keeps its own enabled list.

## Categories and modules

| Category | Modules (function code) |
|---|---|
| Knowledge & RAG (`knowledge-rag`) | `bkt-dia-document-intake` (F002), `bkt-dia-knowledge-governance` (F005), `bkt-dia-rag-retrieval` (F006), `bkt-dia-knowledge-insights` (F007) |
| Assistants & channels (`assistant-channels`) | `bkt-dia-admin-assistant` (F010), `bkt-dia-channel-assistant` (F011), `bkt-dia-conversation-assistant` (F012) |
| Domain lookup (`domain-lookup`) | `bkt-dia-enterprise-profile` (F015), `bkt-dia-finance-tax` (F016), `bkt-dia-import-export` (F017), `bkt-dia-digital-products` (F018), `bkt-dia-workforce` (F019), `bkt-dia-tech-zones-projects` (F020) |
| Analysis & forecast (`analysis-forecast`) | `bkt-dia-finance-forecast` (F021), `bkt-dia-sector-forecast` (F022) |
| Decision support (`decision-support`) | `bkt-dia-policy-advisor` (F023), `bkt-dia-strategy-advisor` (F024), `bkt-dia-partner-matchmaking` (F025) |
| Monitoring & personalization (`monitoring-personalization`) | `bkt-dia-risk-monitor` (F026), `bkt-dia-personalization-insights` (F027) |
| Shared (`shared`) | `bkt-dia-common` |

Each module's tools are listed under `provides_tools` in its `plugins/<name>/plugin.yaml`, and its
skill (`plugins/<name>/skills/<name>/SKILL.md`) says what the data service does and does not hold.
A plugin's category comes from its `category:<slug>` manifest tag.

## How answers work

The tools send one natural-language question to the DIA query service and return its answer with
the source records. They are read-only and never create or edit data.

- Answers cite their sources. When the service has no data, the agent says so instead of guessing.
- Text labelled as analysis, a reference forecast or a recommendation is the language model's
  reasoning over the retrieved data, **not** a statistical model.
- Coverage is honest: most DIA use cases are only partly covered because the service is
  keyword retrieval over one index, with no forecasting, scoring, matching or write path.
  Coverage was judged from the service source, not checked against a live index.
- Tools fail closed: if `bkt-dia-common` is disabled, the endpoint is unset, unsafe or
  unreachable, the request times out or the service returns an error, the tool returns
  `{"ok": false, "error", "hint"}` and the agent reports it.

## Setup

Set the service URL for the profile, then enable the shared module and the modules you need:

```bash
hermes config set plugins.entries.bkt-dia-common.settings.endpoint http://dia-query.internal:8000
hermes plugins enable bkt-dia-common
hermes plugins enable bkt-dia-enterprise-profile
```

| Key | Default | Notes |
|---|---|---|
| `plugins.entries.bkt-dia-common.settings.endpoint` | required | Base http(s) URL; `/api/v1/query` is appended unless already present. |
| `plugins.entries.bkt-dia-common.settings.timeout_seconds` | 15 | Per-request timeout, capped at 60. |
| `plugins.entries.bkt-dia-common.settings.max_sources` | 20 | Source records returned per call, capped at 100. |

- An optional bearer key goes in the profile's `.env` as `BKT_DIA_QUERY_API_KEY` (for a reverse
  proxy in front of the service; the service itself has no auth).
- A private-network or loopback endpoint needs `security.allow_private_urls: true`. Cloud metadata
  addresses are always refused.
- Health check: `GET <endpoint>/api/v1/query/test` returns HTTP 200 with a `status` field of
  `success` or `error`. Queries go to `POST <endpoint>/api/v1/query` with `{"question": "..."}`.

The settings are defined in `plugins/bkt_dia_common/settings.py` and the error messages and hints
in `plugins/bkt_dia_common/query_client.py`.
