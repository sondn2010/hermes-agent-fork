# Phase 04 report: assistant & channels plugins (F010, F011, F012)

Status: DONE. Plan: `plans/261112-1101-bkt-modules-page-and-diaai-plugins/`. Nothing committed; no shared, core or pilot file touched.

## What shipped

| Fn | Plugin dir (manifest name = toolset) | Tools (read-only, via `POST /api/v1/query`) | Skill |
|---|---|---|---|
| F010 | `plugins/bkt-dia-admin-assistant/` | `bkt_dia_admin_assistant_ask` (question, optional `subject` enum enterprise/product), `bkt_dia_admin_assistant_documents` (`subject`, optional `document_type` legal/report, `document_code`, `summary_level` short/detailed) | `bkt-dia-admin-assistant:bkt-dia-admin-assistant`: question templates (UC048) as fixed examples, points admins to `hermes model`/`hermes config`/dashboard Config (UC051), voice mode + `stt.*`/`tts.*` (UC052), `hermes sessions`/dashboard Sessions/`session_search` (UC049) |
| F011 | `plugins/bkt-dia-channel-assistant/` | `bkt_dia_channel_assistant_lookup` (question, optional `scope` enum of the 10 ES domains) | `bkt-dia-channel-assistant:...`: per-channel answer shaping (voice: 2-3 sentences, no markdown; chat app/embed: short + sources), follow-up rewriting, explicit "not handled" list pointing to messaging platform docs, Voice & TTS, Open WebUI, dashboard Sessions/Analytics |
| F012 | `plugins/bkt-dia-conversation-assistant/` | `bkt_dia_conversation_assistant_ask` (self-contained question, optional `context`) | `bkt-dia-conversation-assistant:...`: clarify-first, goal-led sessions, follow-up suggestions, summaries, read-aloud via the core `text_to_speech` tool, urgent-request handling; prefers `bkt-dia-rag-retrieval` (F006) and more specific DIA modules when enabled |

Manifests: `version: 0.1.0`, English description with Vietnamese subtitle, `tags: [bkt, diaai, category:assistant-channels, f01x]`, `requires_plugins: bkt-dia-common`, `provides_tools` = registered tools. 4 tools total across 3 plugins.

ES service coverage basis (read-only review of `app/core/es_mapping.py`, `app/services/es_prompts.py`): the index holds enterprises, digital products/services, tech parks, legal documents, bid packages, big problems, workforce, research facilities, educational facilities and statistical reports; question types are search_entity/product/document/bid_packages/hr/science/statistics/count/other. It holds no conversation history, channel metrics, templates, audio or model config, and it cannot summarise user-supplied text (it only searches indexed records).

## Coverage table

| UC | Status | Tool | Note |
|---|---|---|---|
| UC046 Hỏi đáp doanh nghiệp/sản phẩm | covered | `bkt_dia_admin_assistant_ask` | Enterprise + product index; answer with `sources`. One named enterprise's full profile is better served by F015. |
| UC047 Hỏi đáp văn bản pháp quy | partial | `bkt_dia_admin_assistant_documents` | Retrieves indexed legal documents (number, title, content). Validity/effective status and version are not indexed fields; the skill says so and labels answers as legal information, not advice. |
| UC048 Quản lý mẫu câu hỏi | partial | — (skill) | Fixed example questions by topic in the skill. Creating/editing/storing templates is not available (no write path, no store). |
| UC049 Quản lý lịch sử hội thoại | partial | — (Hermes core) | Hermes already saves sessions; search/view/delete via `hermes sessions`, dashboard Sessions page, `session_search`. No DIA-specific admin history store. |
| UC050 Tóm tắt nội dung văn bản | partial | `bkt_dia_admin_assistant_documents` (`summary_level`) | Indexed documents/reports: retrieve + summary at a chosen depth. Pasted/attached text: LLM-side summary, labelled as such; no service support. |
| UC051 Quản lý mô hình LLM | not covered | — | Deliberately not duplicated: `hermes model`, `hermes config`, dashboard Config page. |
| UC052 Quản lý ngôn ngữ và đa phương tiện | not covered | — | Existing Hermes features: the agent answers in Vietnamese/English; voice input/output via voice mode and `stt.*`/`tts.*` config. |
| UC053 Nhúng AI trên website khác | not covered | — | Embed-code generation and visit tracking are channel admin; Hermes exposes the API server / Open WebUI integration. Skill shapes answers for an embedded chat. |
| UC054 Kích hoạt nhận diện giọng nói | not covered | — | STT is Hermes voice mode / gateway voice transcription (`stt.*`), not a plugin tool. Skill handles unclear transcripts. |
| UC055 Phản hồi bằng giọng nói | partial | `bkt_dia_channel_assistant_lookup` + core TTS | Skill produces voice-friendly short answers; audio synthesis, voice and speed are Hermes TTS settings (`tts.*`). |
| UC056 Lưu hội thoại âm thanh | not covered | — | No audio storage/replay/download in this module. |
| UC057 Học thói quen giọng nói | not covered | — | Voice profiling not implemented (spec also requires explicit consent/purpose). |
| UC058 Phát hiện ngữ cảnh hội thoại | partial | `bkt_dia_channel_assistant_lookup` | Agent keeps context and rewrites follow-ups into complete questions (skill); the ES service itself is stateless. |
| UC059 Kết nối Zalo OA | not covered | — | No Zalo platform adapter exists in `plugins/platforms/`; needs a gateway platform plugin (see `gateway/platforms/ADDING_A_PLATFORM.md`, messaging docs). |
| UC060 Xử lý tin nhắn người dùng | partial | `bkt_dia_channel_assistant_lookup` | Intent + automatic reply is covered once a channel adapter delivers the message; message intake itself is the gateway's. |
| UC061 Quản lý hội thoại trên MXH | not covered | — | Message history is Hermes sessions; tagging/labelling channel conversations is not available. |
| UC062 Thống kê tương tác người dùng | not covered | — | No channel metrics in the ES service; nearest existing surface is the dashboard Analytics page (token/usage, not per-channel question stats). |
| UC063 Cập nhật nội dung phản hồi AI | not covered | — | Write path (retraining reply templates, updating channel knowledge) is out of scope (read-only modules). |
| UC073 Hội thoại với AI trợ lý ảo | covered | `bkt_dia_conversation_assistant_ask` | Natural-language Q&A with context carried by the agent; topic switch / `/new` described in the skill. |
| UC074 Cá nhân hóa trải nghiệm | partial | — (skill) | Adapts to stated role/context in-session; cross-session preferences only via Hermes memory when the user asks. No behaviour-based profiling. |
| UC075 Gợi ý thông minh theo mục tiêu | partial | `bkt_dia_conversation_assistant_ask` | Suggestions are LLM-side and labelled as such; policy/technology data comes from the service. No recommendation engine. |
| UC076 Trợ lý ngữ cảnh | partial | `bkt_dia_conversation_assistant_ask` (`context`) | Context the user states (page/enterprise viewed) is passed along; no automatic page-context capture from Core UI. |
| UC077 Xử lý câu hỏi mơ hồ | covered | — (skill) | Clarify-first procedure: name what is missing, suggest additions, list multiple matches, confirm before the formal answer. |
| UC078 Tóm tắt nhanh thông tin | partial | `bkt_dia_conversation_assistant_ask` | Conversation summaries are LLM-side; stored legal docs/reports are fetched then summarised, labelled as the agent's summary. |
| UC079 Tìm kiếm và hỏi đáp ngữ nghĩa | covered | `bkt_dia_conversation_assistant_ask` | ES service does LLM-generated query building over the index (intent → objectType → query). F006 tools preferred when enabled. |
| UC080 Đa phương thức hội thoại | partial | — (Hermes core) | Text/voice/image in one session via Hermes voice mode, vision and file tools; no DIA-specific multimodal processing. |
| UC081 Hỗ trợ đọc to & thuyết minh | partial | — (core `text_to_speech`) | Read-aloud via the core TTS tool; plain-language explanations by the agent; speed is a TTS config setting, not per-request. |
| UC092 Khởi tạo phiên hội thoại mới | partial | — (Hermes core) | New session via `/new` or a new chat; topic suggestions by the skill. No "active session priority" flag. |
| UC094 Hội thoại theo mục tiêu cụ thể | partial | — (skill) | Goal restated and kept in view, opening questions offered; no per-goal prompt profiles or "deep task" session mode. |
| UC095 Gợi ý mở hội thoại qua hành vi | not covered | — | Needs Core UI behaviour tracking and an "Ask AI about this" button; not in Hermes. |
| UC096 Hội thoại khẩn cấp | partial | — (skill) | Summary-first answer for incidents; no priority queue, urgent flag or incident log (spec says SLA/types are undefined). |
| UC106 Gợi ý tìm kiếm theo ngữ cảnh hội thoại | partial | `bkt_dia_conversation_assistant_ask` | Related next questions suggested by the agent; ordering by level (strategy/enterprise/admin) is agent-side, not service ranking; no automatic preference memory. |
| UC116 Gợi ý tra cứu theo ngữ cảnh nghiệp vụ | partial | `bkt_dia_conversation_assistant_ask` | Same as UC106. |

Totals: 33 UCs. Covered 4, partial 18, not covered 11 (F010 1/4/2, F011 0/3/8, F012 3/11/1).

## Verification (exact outputs)

`scripts/run_tests.sh tests/plugins/bkt_dia/test_assistant_channels.py`
```
[100.0% |     9/~9 | ✓28 | ✗ 0] ✓ tests\plugins\bkt_dia\test_assistant_channels.py (28✓, 32.1s)
=== Summary: 1 files, 28 tests passed, 0 failed (100% complete) in 32.2s (20 workers) ===
```
Tests per plugin: real-discovery load with tools, toolset, skill, `provides_tools`, `category:assistant-channels` + `bkt`/`diaai`/`f01x` tags; `validate_module_spec(MODULE, provides_tools=manifest)`; per tool: stub happy path (`function_code`, `sources`), unset endpoint fails closed with no request, HTTP 502 fails closed, missing required argument makes no request; one full-template rendering test per tool plus one optional-segment-dropped test; disabled modules register nothing.

`hermes plugins validate plugins/<dir>` (scratch `HERMES_HOME` set inside the Python runner, launched via `scripts/run-in-hermes-env`), for each of the 3 dirs:
```
✓ capability probe — register() ran in isolation
✓ declared tools — matches registrations
Validation passed.      (rc=0)
```
Informational warning, same as the pilot: `⚠ private core imports (catalog rule 9) ... plugins.bkt_dia_common.tool_factory.*`.

`python scripts/boundary_lint.py --check`: rc=0 (`module_to_core: 843`, `core_to_module: 20`, unchanged).

`python scripts/check`: 16 checks, only `health` fails on the known pre-existing `apps/desktop/src/i18n/vi.ts:1 FILE_LINES 3370 > 2000`; ruff and all guards clean.

## Notes and deviations

- The phase file maps "question templates" to UC049; the spec has templates = UC048 and history = UC049. The table follows the spec.
- One transient `capability probe — import failed: No module named 'httpx'` occurred while a parallel agent's `pm install` was re-syncing the shared runtime; a re-run passed for all three dirs (the pilot also passed in the same window).
- F011/F012 tools are deliberately thin (free question + one optional hint) because the ES service routes by question text; extra structured parameters would only be appended as text.

## Unresolved questions

- Should a Zalo OA gateway platform plugin (UC059-UC061) be planned as separate work? It is a platform adapter, not a bkt-dia module.
