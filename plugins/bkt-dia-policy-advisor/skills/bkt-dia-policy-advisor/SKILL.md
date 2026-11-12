---
name: bkt-dia-policy-advisor
description: Advise on tax, investment and R&D policy with sources.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, policy, F023]
    category: decision-support
    requires_toolsets: [bkt-dia-policy-advisor]
---

# DIA Policy Advisor Skill

Supports managers and leaders who ask for policy advice on tax, investment incentives, R&D support
and market expansion support for the digital-technology industry (F023: UC137, UC138, UC139,
UC144). The tools only retrieve documents and statistics from the DIA AI data service. Impact
analysis, option comparison and recommendations are your own analysis built on that evidence. They
are advisory: the AI never issues or changes policy, and an expert must review any recommendation.

## When to Use

- The user asks which laws, decrees or circulars apply to a policy topic, or what a policy says:
  `bkt_dia_policy_advisor_documents` (set `policy_area` when the topic is clearly tax, investment
  incentives, R&D or market support).
- The user asks for the impact of a policy, a comparison between sectors or regions, or a
  recommendation: call `bkt_dia_policy_advisor_documents` for the legal basis and
  `bkt_dia_policy_advisor_statistics` for the evidence (budget contribution, revenue, foreign
  revenue, workforce, research spending), then analyse.

Example questions:

- "Phân tích tác động của chính sách thuế hiện tại đối với doanh nghiệp phần mềm."
- "So sánh hiệu quả ưu đãi đầu tư giữa Hà Nội và TP. Hồ Chí Minh."
- "Lĩnh vực R&D nào trong công nghiệp số nên được ưu tiên hỗ trợ?"
- "Đề xuất chính sách hỗ trợ doanh nghiệp công nghệ số mở rộng thị trường quốc tế."

## Prerequisites

The `bkt-dia-common` and `bkt-dia-policy-advisor` plugins are enabled and
`plugins.entries.bkt-dia-common.settings.endpoint` points at the DIA query service. If a tool
returns `"ok": false`, show the user its `error` and `hint`.

## Procedure

1. Clarify the policy area, sector, region and period when the question is ambiguous. Do not pick
   them yourself.
2. Retrieve the legal basis with `bkt_dia_policy_advisor_documents`, then the evidence with
   `bkt_dia_policy_advisor_statistics`. Pass only parameters the user gave or confirmed.
3. Write the answer in this structure:
   - **Căn cứ pháp lý (legal basis):** each document with its number and title from `sources`. If
     the record has no issue or effective date, say its validity is not confirmed by the data.
   - **Số liệu (data):** figures with unit, period, scope and source, copied from the result.
   - **Phân tích (analysis, not data):** impact, comparison, options and risks of policy change,
     clearly labelled as your analysis. Say which figures each point relies on.
   - **Khuyến nghị (advisory recommendation):** options with expected effects and assumptions,
     marked as requiring expert review.
4. If `sources_omitted` is present, say that more records exist than were returned.

## Pitfalls

- The service has no impact model or scenario engine. Never present your analysis as a computed
  impact, forecast or official assessment.
- Correlation is not causation: do not claim a policy caused a change in the figures.
- Missing data is an answer: when `sources` is empty, say the service has no data for it; do not
  fill in laws, rates or figures from general knowledge as if they were records.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the failure with
  its hint; do not retry in a loop and do not answer from memory.

## Verification

Every document, figure and date in the reply appears in a tool result's `answer` or `sources`,
and every analytical or recommendation sentence sits under a section labelled as analysis.
