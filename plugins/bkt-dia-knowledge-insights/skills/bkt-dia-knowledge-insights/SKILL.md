---
name: bkt-dia-knowledge-insights
description: Compare DIA AI data across entities, regions, years.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, insights, F007]
    category: knowledge-rag
    requires_toolsets: [bkt-dia-knowledge-insights]
---

# DIA Knowledge Insights Skill

Builds comparisons, groupings and trend readings from DIA AI data (F007: UC024, UC033; UC027 and
UC034 as your analysis). The tools only fetch data. The comparison, trend and anomaly reading is
your own analysis of the returned figures: always label it ("phân tích của trợ lý, không phải mô
hình thống kê").

## When to Use

- Compare two or more sides (enterprises, sectors, markets, regions, periods): call
  `bkt_dia_knowledge_insights_slice` once per side with the same `indicators` and years, then put
  the results side by side.
  - "So sánh doanh thu ngành phần mềm và phần cứng năm 2023 và 2024."
  - "Doanh nghiệp CNS ở Hà Nội và TP.HCM khác nhau thế nào về số lượng và lao động?"
- Group a statistic by one dimension: `bkt_dia_knowledge_insights_breakdown`.
  - "Số doanh nghiệp CNS phân theo tỉnh thành năm 2024."
  - "Nhân lực công nghệ số phân theo trình độ."
- Trends and unusual changes: fetch a year range with the slice tool (or a breakdown by `năm`),
  then describe the direction and any jumps you see, labelled as your analysis.
  - "Số doanh nghiệp CNS tăng hay giảm từ 2021 đến 2024? Có năm nào biến động bất thường không?"

## Prerequisites

The `bkt-dia-common` and `bkt-dia-knowledge-insights` plugins are enabled and
`plugins.entries.bkt-dia-common.settings.endpoint` points at the DIA query service. If a tool
returns `"ok": false`, show the user its `error` and `hint`.

## Procedure

1. Fix the sides and the dimensions first (what is compared, which indicators, which years). Ask
   when they are unclear.
2. Fetch each side with the same indicators and period so the figures are comparable.
3. Present the reported figures in a table or bullets with unit, period and source for each value,
   citing the records in `sources`.
4. If a side returns no data, show it as "không có dữ liệu" instead of dropping or estimating it.
5. Write the comparison, trend or anomaly reading as a separate, labelled analysis. Suggest other
   dimensions to compare only when the returned data supports them.

## Pitfalls

- No statistical model, baseline or anomaly threshold exists here; never present a computed
  growth rate or anomaly as an official figure. Show the arithmetic when you compute one.
- Do not mix periods or units across sides without saying so.
- No charts, BI export or alerts are produced by the service; you may draw a text table only.
- On `"ok": false` report the failure with its hint; do not retry in a loop and do not answer from
  memory. Never invent figures.

## Verification

Every figure in the reply appears in a tool result's `answer` or `sources` (or is shown as your own
arithmetic on those figures), and every analytic statement is labelled as analysis.
