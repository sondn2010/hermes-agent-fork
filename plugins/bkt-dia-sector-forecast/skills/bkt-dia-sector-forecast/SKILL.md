---
name: bkt-dia-sector-forecast
description: Analyse digital-industry trends from DIA AI data.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, workforce, trade, gdp, forecast, F022]
    category: analysis-forecast
    requires_toolsets: [bkt-dia-sector-forecast]
---

# DIA Digital-Industry Analysis Skill

Answers questions about digital-industry workforce supply and demand, export and import markets,
GDP contribution, overall sector outlook and bid packages (F022: UC130-UC135) from the DIA AI
data service. The service returns recorded statistics only. There is **no statistical or ML
forecasting service** behind it, so every projection, gap estimate or recommendation in your
reply is your own reasoning over the returned figures and must be labelled
`phân tích tham khảo, không phải dự báo thống kê` (reference analysis, not a statistical forecast).

## When to Use

- "Nhân lực công nghệ số theo trình độ qua các năm": `bkt_dia_sector_forecast_series` with
  `topic` "nhân lực công nghệ số" and `breakdown` "trình độ".
- "Dự báo nhu cầu nhân lực ngành phần mềm năm tới": `bkt_dia_sector_forecast_series` for the
  workforce history, then a labelled trend projection (see Procedure).
- "Kim ngạch xuất khẩu máy vi tính những năm gần đây": `bkt_dia_sector_forecast_series` with
  `topic` "giá trị xuất khẩu" and `breakdown` "sản phẩm".
- "Đóng góp của ngành công nghệ số vào GDP": `bkt_dia_sector_forecast_series` with `topic`
  "mức đóng góp của ngành công nghệ số vào GDP".
- "Báo cáo tổng quan ngành": call `bkt_dia_sector_forecast_series` once per topic (revenue,
  workforce, export, import, GDP) and combine the results.
- "Các gói thầu phần mềm tại Hà Nội năm 2024" or "gói thầu theo lĩnh vực":
  `bkt_dia_sector_forecast_tenders`.

## Prerequisites

The `bkt-dia-common` and `bkt-dia-sector-forecast` plugins are enabled and
`plugins.entries.bkt-dia-common.settings.endpoint` points at the DIA query service. If a tool
returns `"ok": false`, show the user its `error` and `hint`.

## Procedure

1. Pin down the topic, period and scope (province, sector, breakdown). Pass optional arguments only
   when the user gave them or they follow directly from the question; ask when the scope is vague.
2. Retrieve the observed statistics first and present them as a table: period, indicator, value,
   unit, and the source record it came from (code, name or title as present in `sources`).
3. Only then add analysis, in a separate section headed
   `Phân tích tham khảo, không phải dự báo thống kê`, keeping observed data, projection,
   assumptions and recommendations apart:
   - State the method in one line (for example average annual growth rate, or a straight-line
     trend over the listed years) and the exact periods used, and show the arithmetic.
   - Project at most one period ahead, and only when at least three consecutive observed periods
     exist. With fewer, say there is not enough history for a trend and stop.
   - State the uncertainty plainly: few data points, no confidence interval, no model, no
     backtest, and any gap or outlier year.
   - Training or recruitment suggestions and market opportunities are recommendations, not data:
     tie each to the figures it rests on.
4. If `sources_omitted` is present, say that more records exist than were returned.

## Pitfalls

- Trade data may only be national totals plus a few product lines (phones, cameras, computers),
  without partner countries, prices or market shares. Workforce data may lack skills and job
  positions or a demand series. When a breakdown is absent, say so instead of estimating it.
- Assessing an enterprise's ability to win or deliver a bid package (UC136) is not supported:
  the criteria are not defined. Show the tender records you found and state that limit.
- Missing data is an answer: if `sources` is empty or the answer says nothing was found, say the
  service has no data for it. Never fill gaps with general knowledge or assumed values.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the failure
  plainly with its hint; do not retry in a loop and do not answer from memory.
- Never present a projection as an official forecast and never invent figures.

## Verification

Every observed figure in the reply appears in a tool result's `answer` or `sources`; every
projected or derived figure sits under the labelled analysis heading with its method and periods.
