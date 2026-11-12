---
name: bkt-dia-finance-tax
description: Look up enterprise and sector finance and tax in DIA AI.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, finance, tax, gdp, F016]
    category: domain-lookup
    requires_toolsets: [bkt-dia-finance-tax]
---

# DIA Finance, Tax and GDP Skill

Answers questions about finance, tax, state-budget payments (nghĩa vụ ngân sách) and GDP
contribution from the DIA AI data service (F016: UC098, UC101, UC102, UC108, UC111, UC112, UC120,
UC121). It only reads data; it never creates or edits records and never fills gaps with guesses.

## When to Use

- One enterprise's revenue, corporate income tax (TNDN), personal income tax (TNCN) or charter
  capital, for a year or a period: `bkt_dia_finance_tax_enterprise_lookup`.
  - "Doanh thu và thuế TNDN của công ty có MST 0101234567 từ 2022 đến 2024?"
  - "Công ty X nộp bao nhiêu thuế năm 2023?"
- Industry-wide revenue, profit, state-budget payments or GDP contribution, overall or for one
  field (phần mềm, phần cứng, nội dung số, dịch vụ công nghệ số): `bkt_dia_finance_tax_sector_stats`.
  - "Doanh thu ngành công nghệ số theo lĩnh vực năm 2024?"
  - "Ngành công nghệ số đóng góp bao nhiêu vào GDP qua các năm?"
  - "Nộp ngân sách nhà nước của lĩnh vực phần mềm từ 2021 đến 2024?"

## What the data service does not hold

Tell the user plainly, without guessing, when they ask for:

- detailed financial-statement line items or ratios (debt, equity, margins) of an enterprise;
- an enterprise's profit, VAT (GTGT) or tax by tax period below the year;
- GDP contribution of a single enterprise, or GDP contribution split by region or field;
- late-payment or non-compliance warnings and tax-law change notices;
- forecasts (point to the forecasting modules if they are enabled).

## Procedure

1. Identify the enterprise. Prefer a tax code. If several enterprises match a name in `sources`,
   list them (name, tax code) and ask which one; never pick one yourself.
2. Pass `from_year`, `to_year`, `sector` and `focus` only when the user gave them.
3. To compare two periods or two fields, call the tool once per period or field.
4. Answer from `answer` and `sources` only. Cite the source records you used, and always give the
   unit (VND, tỷ đồng...), the year and the update time when the data has them.
5. If `sources_omitted` is present, say that more records exist than were returned.
6. Ratios (tax over revenue), growth rates, peer comparisons and risk remarks you compute yourself
   are your analysis: label them "phân tích của trợ lý, không phải số liệu chính thức" and show the
   figures they come from.

## Pitfalls

- Missing data is an answer: if `sources` is empty or the answer says nothing was found, tell the
  user the service has no data for it. Do not use general knowledge as if it were the record.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the `error` and
  `hint` plainly; do not retry in a loop and do not answer from memory.
- Revenue in the enterprise record is the corporate-income-tax revenue (doanh thu tính thuế TNDN);
  say so instead of calling it total revenue.
- Finance and tax data can be sensitive: do not volunteer it beyond what the user asked.

## Verification

Every figure in the reply appears in the tool result's `answer` or `sources`, with its unit and
year, and anything computed is labelled as analysis.
