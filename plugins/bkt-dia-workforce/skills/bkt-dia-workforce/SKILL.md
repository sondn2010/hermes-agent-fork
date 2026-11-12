---
name: bkt-dia-workforce
description: Look up digital-tech workforce statistics in DIA AI.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, workforce, F019]
    category: domain-lookup
    requires_toolsets: [bkt-dia-workforce]
---

# DIA Workforce Skill

Answers questions about the digital-tech workforce (nhân lực công nghệ số) from the DIA AI data
service (F019: UC103, UC113, UC122). It returns aggregate statistics only; it never looks up named
people, never creates or edits records and never fills gaps with guesses.

## When to Use

Use `bkt_dia_workforce_stats` for every workforce-size question. Set `breakdown` to one of
"tỉnh/thành phố", "trình độ chuyên môn", "giới tính", "độ tuổi" or "lĩnh vực", and pass `region`,
`sector`, `from_year` and `to_year` only when the user gave them.

- "Ngành công nghệ số có bao nhiêu lao động năm 2024?"
- "Phân bổ nhân lực công nghệ số theo tỉnh thành?"
- "Lao động lĩnh vực phần mềm tại Hà Nội từ 2021 đến 2024?"
- "Nhân lực công nghệ số theo trình độ chuyên môn?"

## What the data service does not hold

Tell the user plainly, without guessing, when they ask for:

- one enterprise's headcount or its workforce breakdown (the enterprise-profile module may hold
  some of it when enabled);
- headcount by individual skill or job position: only qualification levels are indexed;
- comparisons between enterprises;
- shortage, surplus or training-need figures (you may reason about them, labelled as analysis).

## Procedure

1. To compare regions, fields or periods, call the tool once for each and compare the figures.
2. Answer from `answer` and `sources` only. Cite the source reports, and always give the unit
   (người), the year and the update time when the data has them.
3. If `sources_omitted` is present, say that more records exist than were returned.
4. Trends, shortage or surplus remarks and training suggestions you write yourself are your
   analysis: label them "phân tích của trợ lý, không phải số liệu chính thức" and show the figures
   they come from.

## Pitfalls

- Missing data is an answer: do not use general knowledge or news figures as if they were records.
- Never list or identify individual employees, even if a source record names one.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the `error` and
  `hint` plainly; do not retry in a loop and do not answer from memory.

## Verification

Every figure in the reply appears in a tool result's `answer` or `sources`, with unit and year,
and every computed trend or suggestion is labelled as analysis.
