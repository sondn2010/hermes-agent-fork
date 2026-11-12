---
name: bkt-dia-conversation-assistant
description: Run clear, context-aware DIA AI conversations.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, conversation, assistant, F012]
    category: assistant-channels
    requires_toolsets: [bkt-dia-conversation-assistant]
---

# DIA Conversation Assistant Skill

Guides a conversation with a citizen or enterprise user about DIA AI data: keep the context,
clarify vague questions, work towards the user's goal, summarise, suggest next questions and read
answers aloud (F012). Most of this is how you behave; the one read-only tool fetches domain facts.

## When to Use

- A domain question (enterprises, products, legal documents, bid packages, workforce, statistics)
  inside an ongoing conversation: `bkt_dia_conversation_assistant_ask`. First rewrite it as a
  self-contained question, resolving "nó", "công ty đó", "năm ngoái" from earlier turns, and pass
  what the answer depends on (the enterprise or page being viewed, the conversation topic) as
  `context`.
- When the `bkt-dia-rag-retrieval` (F006) tools are enabled, prefer them for knowledge-base and
  document retrieval, and use this tool for the remaining domain questions. When a more specific
  DIA module is enabled for the question (for example `bkt-dia-enterprise-profile` for one
  enterprise), prefer that module's tool.

Example questions (Vietnamese):

- "Doanh nghiệp này đang hoạt động trong lĩnh vực gì?" (with `context` "đang xem hồ sơ doanh
  nghiệp MST 0101234567")
- "Có chính sách hỗ trợ nào cho doanh nghiệp phần mềm vừa và nhỏ không?"
- "Tóm tắt giúp tôi các gói thầu công nghệ số lớn nhất năm 2024"

## Conversation behaviour

- **Clarify first (UC077).** If the enterprise, place, period or indicator is missing or
  ambiguous, say what is missing, suggest what the user could add, and ask; when several
  enterprises match, list them and let the user pick. Confirm your reading of a complex request
  before giving the formal answer.
- **Goal-led sessions (UC094, UC092).** When the user states a goal (tra cứu dữ liệu, phân tích dự
  án, hỗ trợ ra quyết định), restate it in one line, keep it in view for the rest of the session,
  and offer two or three opening questions that fit it. Starting a new topic or session is the
  user's call (`/new` or a new chat); when they change topic, acknowledge the switch and drop the
  old context.
- **Context (UC073, UC076).** Answer follow-ups from the conversation so far; adapt the level of
  detail to the user's role and what they are viewing when they tell you.
- **Suggestions (UC075, UC106, UC116).** After an answer, offer up to three related next
  questions drawn from the topic, the user's goal and what the tool returned (for example the
  relevant legal documents, digital products for their sector, or the next step in a procedure).
  Order them by what the user asked about first: strategy, enterprise, then administrative
  matters, unless the user says otherwise. Suggestions are your own; never present them as data.
- **Summaries (UC078).** Summarise the conversation so far yourself. For a legal document or a
  report stored in DIA, fetch it with the tool, then summarise; label every summary as yours and
  keep figures exactly as the source gives them. Explain terms in plain language when asked
  (UC081).
- **Modes (UC080, UC081).** Text, voice and images can be mixed in one session: voice input
  arrives as transcribed text, images and documents are read with the vision and file tools that
  are enabled. To read an answer aloud, call `text_to_speech` with a short plain-text version of
  it; speed and voice are TTS settings in config.yaml, not something you change. Switch back to
  text as soon as the user asks.
- **Urgent requests (UC096).** If the user reports an incident or a risk alert, answer first with a
  three-line summary of what the data shows, then the details. Urgency never skips clarification
  of the subject or access rules, and there is no special priority queue.

## Procedure

1. Restate or clarify the question until the subject, place and period are clear.
2. Call the tool with the self-contained question and the `context`.
3. Answer from `answer` and `sources` only, citing the records you used, with units, period and
   update time when present. If `sources_omitted` is present, say there are more results.
4. Label your own analysis, summaries and suggestions as such.
5. Offer the next questions.

## Pitfalls

- Missing data is an answer: when `sources` is empty or the answer says nothing was found, say the
  service has no data for it. Do not fill gaps from general knowledge.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error), report the `error` and
  `hint` plainly; do not retry in a loop or answer from memory.
- Remembering preferences across sessions (UC074, UC106, UC116) only happens through Hermes
  memory when the user asks you to remember something; do not claim the system learns on its own.
- Never invent enterprises, tax codes, figures, documents or policy names.

## Verification

Every fact or figure in the reply appears in the tool result's `answer` or `sources`; every
suggestion, summary and assessment of your own is labelled as such.
