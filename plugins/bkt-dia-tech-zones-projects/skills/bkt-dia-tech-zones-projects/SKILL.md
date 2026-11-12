---
name: bkt-dia-tech-zones-projects
description: Look up digital-tech zones and tenders in DIA AI.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, tech-zones, tenders, F020]
    category: domain-lookup
    requires_toolsets: [bkt-dia-tech-zones-projects]
---

# DIA Tech Zones, Projects and Tenders Skill

Answers questions about concentrated digital-tech zones (khu công nghệ số tập trung) and
digital-tech procurement packages (gói thầu) from the DIA AI data service (F020: UC105, UC115,
UC117, UC118). It only reads data; it never creates or edits records and never fills gaps with
guesses.

## When to Use

- Zones: which zones exist, where they are, how many there are, one zone's details:
  `bkt_dia_tech_zones_projects_zone_lookup` (omit `zone` to list them).
  - "Danh sách các khu công nghệ số tập trung đang hoạt động?"
  - "Khu công nghệ số tập trung ở Đà Nẵng nằm ở đâu, hạ tầng thế nào?"
  - "Có bao nhiêu khu công nghệ thông tin tập trung?"
- Tenders: bid packages by subject, number, status, location, party or period, and tender
  statistics: `bkt_dia_tech_zones_projects_tender_lookup`.
  - "Các gói thầu phần mềm tại Hà Nội năm 2024 và giá trị?"
  - "Gói thầu số IB2400012345 đang ở trạng thái nào?"
  - "Thống kê gói thầu công nghệ số theo lĩnh vực." (`focus`: "thống kê theo lĩnh vực")
  - "Các gói thầu mua sắm công nghệ số chưa đấu thầu?" (upcoming procurement needs)

## What the data service does not hold

Tell the user plainly, without guessing, when they ask for:

- investment-project records, their progress or effectiveness: no project data is indexed (open
  bid packages are the only signal of upcoming procurement);
- the list of enterprises operating inside a zone, a zone's area or infrastructure, unless the
  zone's description states them;
- the dominant field of a zone as statistics;
- the winning bidder or participating bidders of a package, unless the record states them;
- violation or delay warnings on tenders.

## Procedure

1. Pass only the filters the user gave. If a zone or package name matches several records in
   `sources`, list them and ask which one.
2. Answer from `answer` and `sources` only. Cite the records (bid number, zone name or code), and
   give dates, values with units (VND), status and update time when the data has them.
3. If `sources_omitted` is present, say that more records exist than were returned.
4. Zone suitability for an investment, tender comparisons and risk remarks you write yourself are
   your analysis: label them "phân tích của trợ lý, không phải số liệu chính thức".

## Pitfalls

- Missing data is an answer: do not use general knowledge or news as if it were the record.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the `error` and
  `hint` plainly; do not retry in a loop and do not answer from memory.
- A bid package's status is the recorded status at the update time; never infer it from dates.

## Verification

Every zone, package, value or status in the reply appears in a tool result's `answer` or
`sources`, and every suggestion is labelled as analysis.
