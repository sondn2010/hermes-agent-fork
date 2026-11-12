---
name: bkt-dia-strategy-advisor
description: Build cited strategy reports for digital enterprises.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, strategy, F024]
    category: decision-support
    requires_toolsets: [bkt-dia-strategy-advisor]
---

# DIA Strategy Advisor Skill

Supports managers and leaders who ask for enterprise strategy, investment and cooperation
opportunities, high-quality workforce training, new product strategy and strategic risk (F024:
UC140, UC141, UC142, UC143, UC145, UC146). The tools only retrieve an enterprise's capability
profile and sector or market data from the DIA AI data service. Strategy, scoring, comparison and
risk assessment are your own analysis built on that evidence, and an expert must review any
proposal with economic impact.

## When to Use

- The question is about one enterprise (capability, products, market, cooperation fit, risks):
  `bkt_dia_strategy_advisor_enterprise`. Call it once per enterprise to compare several.
- The question needs sector or market evidence (revenue or exports by sector, products by group,
  bid packages by field, workforce by qualification, training institutions, large problems):
  `bkt_dia_strategy_advisor_market`.
- Most strategy questions need both: the enterprise profile plus the market context.

Example questions:

- "Phân tích năng lực hiện tại và thị trường tiềm năng của công ty có mã số thuế 0101234567."
- "Đề xuất lĩnh vực đầu tư tiềm năng trong ngành phần mềm năm 2024."
- "Doanh nghiệp này nên hợp tác với ai và có rủi ro liên kết gì?"
- "Nhu cầu đào tạo nhân lực công nghệ số theo trình độ tại Đà Nẵng."
- "Đánh giá rủi ro chiến lược của doanh nghiệp so với các doanh nghiệp cùng ngành."

## Prerequisites

The `bkt-dia-common` and `bkt-dia-strategy-advisor` plugins are enabled and
`plugins.entries.bkt-dia-common.settings.endpoint` points at the DIA query service. If a tool
returns `"ok": false`, show the user its `error` and `hint`.

## Procedure

1. Identify the enterprise (prefer a tax code). When the `sources` show several matching
   enterprises, list them (name, tax code) and ask which one; never pick one yourself.
2. Retrieve the profile and the market evidence the question needs. Pass only parameters the user
   gave or confirmed.
3. Write the report in this structure:
   - **Hồ sơ năng lực (capability profile):** facts from the enterprise result, with sources.
   - **Bối cảnh thị trường (market context):** figures with unit, period, scope and source.
   - **Phân tích (analysis, not data):** strengths, gaps, opportunities and risks (finance,
     workforce, market). When you compare or prioritise options, show the criteria and how each
     option meets them; never show a score that looks computed by the service.
   - **Đề xuất (advisory proposals):** strategy, investment, cooperation, training or product
     options with assumptions and mitigation measures, marked as requiring expert review.
   - **Giới hạn dữ liệu (data limits):** what the data does not cover (for example profitability
     per investment option, which the service does not hold).
4. If `sources_omitted` is present, say that more records exist than were returned.

## Pitfalls

- The service holds no profitability, risk score or forecast. Never present your analysis as a
  computed result; correlation is not causation.
- Do not reveal one enterprise's private data while comparing it with another; use only what the
  results return.
- Missing data is an answer: when `sources` is empty, say the service has no data for it; never
  invent capital, revenue, headcount or products.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the failure with
  its hint; do not retry in a loop and do not answer from memory.

## Verification

Every fact or figure in the report appears in a tool result's `answer` or `sources`, and every
judgement or proposal sits under a section labelled as analysis or proposal.
