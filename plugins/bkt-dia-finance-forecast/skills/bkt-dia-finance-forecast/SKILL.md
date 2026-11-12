---
name: bkt-dia-finance-forecast
description: Analyse enterprise finance trends from DIA AI data.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, finance, forecast, F021]
    category: analysis-forecast
    requires_toolsets: [bkt-dia-finance-forecast]
---

# DIA Enterprise Finance Analysis Skill

Answers questions about an enterprise's financial health, revenue and cost trends and financial
risk (F021: UC126-UC129) from the DIA AI data service. The service returns recorded data only.
There is **no statistical or ML forecasting service** behind it, so every projection, score or
risk judgement in your reply is your own reasoning over the returned figures and must be labelled
`phân tích tham khảo, không phải dự báo thống kê` (reference analysis, not a statistical forecast).

## When to Use

- "Phân tích sức khỏe tài chính của công ty ACME (MST 0101234567)": call
  `bkt_dia_finance_forecast_history`, then compare with `bkt_dia_finance_forecast_benchmark`.
- "Dự báo doanh thu năm tới của doanh nghiệp 0101234567": `bkt_dia_finance_forecast_history` with
  the year range, then a labelled trend projection (see Procedure).
- "So sánh doanh thu của ACME với ngành phần mềm": `bkt_dia_finance_forecast_history` plus
  `bkt_dia_finance_forecast_benchmark` with `indicator` "doanh thu" and `sector` "phần mềm".
- "Lợi nhuận ngành công nghệ số tại Hà Nội qua các năm": `bkt_dia_finance_forecast_benchmark`.

## Prerequisites

The `bkt-dia-common` and `bkt-dia-finance-forecast` plugins are enabled and
`plugins.entries.bkt-dia-common.settings.endpoint` points at the DIA query service. If a tool
returns `"ok": false`, show the user its `error` and `hint`.

## Procedure

1. Identify the enterprise. Prefer a tax code. If several enterprises match, list them (name, tax
   code) and ask which one; never pick one yourself.
2. Retrieve the observed history first. Pass `from_year`, `to_year`, `indicators`, `sector` and
   `province` only when the user gave them or they follow directly from the question.
3. Present the observed data as a table: period, indicator, value, unit, and the source record it
   came from (code, name or title as present in `sources`).
4. Only then add analysis, in a separate section headed
   `Phân tích tham khảo, không phải dự báo thống kê`:
   - State the method in one line (for example average annual growth rate, or a straight-line
     trend over the listed years) and the exact periods used, and show the arithmetic.
   - Project at most one period ahead, and only when at least three consecutive observed periods
     exist. With fewer, say there is not enough history for a trend and stop.
   - State the uncertainty plainly: few data points, no confidence interval, no model, no
     backtest, and any gap or outlier year.
   - Risk and health remarks must point to the figures they rest on. Do not compute ratios the
     data cannot support (debt, liquidity, overdue debt, cost categories) and say so instead.
5. If `sources_omitted` is present, say that more records exist than were returned.

## Pitfalls

- The service may hold only yearly revenue and corporate income tax for an enterprise. Debt,
  liquidity, payment capacity, overdue debt, operating costs by category and monthly or quarterly
  series are usually absent: tell the user the data is not available rather than estimating it.
- Missing data is an answer: if `sources` is empty or the answer says nothing was found, say the
  service has no data for it. Never fill gaps with general knowledge or assumed values.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the failure
  plainly with its hint; do not retry in a loop and do not answer from memory.
- Never present a projection as an official forecast, and never invent figures, tax codes or
  peer enterprises.

## Verification

Every observed figure in the reply appears in a tool result's `answer` or `sources`; every
projected or derived figure sits under the labelled analysis heading with its method and periods.
