---
name: bkt-dia-import-export
description: Look up digital-tech import and export values in DIA AI.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, trade, import-export, F017]
    category: domain-lookup
    requires_toolsets: [bkt-dia-import-export]
---

# DIA Import/Export Skill

Answers questions about digital-tech import and export values (kim ngạch xuất nhập khẩu) from the
DIA AI data service (F017: UC099, UC109, UC125). It only reads data; it never creates or edits
records and never fills gaps with guesses.

## When to Use

Use `bkt_dia_import_export_lookup` for every import/export question. Set `flow` to "xuất khẩu",
"nhập khẩu" or "xuất nhập khẩu", and pass `product`, `market`, `enterprise`, `from_year` and
`to_year` only when the user gave them.

- "Kim ngạch xuất khẩu ngành công nghệ số năm 2024 là bao nhiêu?"
- "Giá trị xuất khẩu điện thoại từ 2021 đến 2024?"
- "Kim ngạch nhập khẩu công nghệ số năm 2023 so với 2022?" (call once for each year)

## What the data service does not hold

The service holds industry-level import and export reports, export values of a few key products
(phones, cameras, computers) and foreign-market revenue statistics. Tell the user plainly, without
guessing, when they ask for:

- one enterprise's own import/export values, or its trading partners;
- values by market or partner country, or by HS code;
- imports split by product;
- price-movement or market-risk warnings.

Pass the user's filter anyway when they ask; if `sources` come back empty or unrelated, say the
service has no data at that level.

## Procedure

1. To show a trend or compare periods, markets or products, call the tool once per period,
   market or product and compare the returned figures.
2. Answer from `answer` and `sources` only. Cite the source records, and always give the unit
   (USD, triệu USD...), the year and the update time when the data has them.
3. If `sources_omitted` is present, say that more records exist than were returned.
4. Growth rates, trends and risk remarks you compute yourself are your analysis: label them
   "phân tích của trợ lý, không phải số liệu chính thức" and show the figures they come from.

## Pitfalls

- Missing data is an answer: do not use general knowledge or news figures as if they were records.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the `error` and
  `hint` plainly; do not retry in a loop and do not answer from memory.
- Check that the figures you compare share the same unit and period before comparing them.

## Verification

Every figure in the reply appears in a tool result's `answer` or `sources`, with unit and year,
and every computed trend is labelled as analysis.
