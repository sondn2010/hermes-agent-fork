---
name: bkt-dia-personalization-insights
description: Suggest DIA AI questions from topics the user follows.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, personalization, proactive, F027]
    category: monitoring-personalization
    requires_toolsets: [bkt-dia-personalization-insights]
---

# DIA Personalization Insights Skill

Personalizes DIA AI answers and proposes "what to ask next" (F027: UC031, UC152, UC153, UC155)
from what the user chose to share: the topics they follow, their role and whether proactive mode
is on. These preferences live in Hermes memory, which the user can see, change and delete. This
module does not track behaviour, profile users silently, detect anomalous queries or retrain any
model. It only reads data.

## When to Use

- "Gợi ý cho tôi nên hỏi gì về ngành công nghệ số hôm nay", "Có gì mới về doanh nghiệp phần mềm
  ở Đà Nẵng?": `bkt_dia_personalization_insights_suggest` with the user's saved or stated topics.
- "Tôi là lãnh đạo cục, theo dõi doanh thu và nhân lực phần mềm; hãy nhớ điều đó": save the
  preference (see Preferences), then offer one suggestion round.
- "Bật/tắt chế độ AI chủ động": update the proactive-mode preference.

## Prerequisites

The `bkt-dia-common` and `bkt-dia-personalization-insights` plugins are enabled and
`plugins.entries.bkt-dia-common.settings.endpoint` points at the DIA query service. Saving
preferences needs the `memory` toolset. If a tool returns `"ok": false`, show the user its
`error` and `hint`.

## Preferences (user-controlled)

1. Save only what the user explicitly asks you to remember, with the `memory` tool and
   `target: "user"`, as one short entry, e.g. "DIA AI: vai trò lãnh đạo cục; theo dõi doanh thu
   phần mềm, nhân lực CNS Hà Nội; AI chủ động: bật". Tell the user what you saved.
2. Proactive mode is that entry's "AI chủ động: bật/tắt" flag. When the user switches it, replace
   the entry and confirm. The default is off: never propose suggestions unasked while it is off.
3. Saved memory reaches the system prompt from the next session; in the current session use what
   the user just told you.
4. Never infer or store sensitive traits (health, politics, religion, personal life) or anything
   the user did not state. On "quên sở thích của tôi", remove the entry and confirm.

## Procedure

1. Take `interests` from the saved entry or the user's own words; pass `role` only when the user
   gave it and `exclude_topics` for topics already answered in this conversation.
2. From `answer` and `sources`, propose 3-5 concrete follow-up questions, each tied to a cited
   record (code, name or title as present in `sources`) and phrased in the user's language.
3. Tailor depth and wording to the stated role (an overview for leaders, detail for analysts).
   This tailoring is your own presentation choice; say so if asked.
4. If the user gives feedback on suggestions ("bỏ chủ đề này"), update the saved topics only after
   they confirm.

## Not provided

Silent behaviour collection, behaviour analytics dashboards, user segmentation, automatic model
updates, real-time interaction monitoring and anomalous-query alerts are not provided. If asked,
say so plainly and do not simulate them.

## Pitfalls

- Missing data is an answer: if `sources` is empty, say the service has no recent data on that
  topic. Do not use general knowledge as if it were the record.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the failure
  plainly with its hint; do not retry in a loop.
- Never invent figures or records to make a suggestion look grounded.

## Verification

Every suggestion traces to an entry in `sources`, and every saved preference is something the
user explicitly asked you to remember.
