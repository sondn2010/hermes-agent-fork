---
name: bkt-dia-enterprise-profile
description: Look up enterprise profiles and history in DIA AI.
version: 1.0.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, enterprise, F015]
    category: domain-lookup
    requires_toolsets: [bkt-dia-enterprise-profile]
---

# DIA Enterprise Profile Skill

Answers questions about one enterprise (doanh nghiệp) from the DIA AI data service: its current
profile, its profile over the years and similar enterprises (F015: UC097, UC107). It only reads
data; it never creates or edits records, and it never fills gaps with guesses.

## When to Use

- The user names an enterprise or gives a tax code (mã số thuế) and asks who it is, what it does,
  its status or sector: `bkt_dia_enterprise_profile_lookup`.
- The user asks for similar or same-sector enterprises: `bkt_dia_enterprise_profile_lookup` with
  `focus` set to "doanh nghiệp tương tự cùng lĩnh vực".
- The user asks how the enterprise changed over the years, or to compare periods or indicators
  (revenue, workforce): `bkt_dia_enterprise_profile_history`.

## Prerequisites

The `bkt-dia-common` and `bkt-dia-enterprise-profile` plugins are enabled and
`plugins.entries.bkt-dia-common.settings.endpoint` points at the DIA query service. If a tool
returns `"ok": false`, show the user its `error` and `hint`.

## Procedure

1. Identify the enterprise. Prefer a tax code. If the user gave only a common or partial name,
   call the lookup tool, and when the `sources` show several matching enterprises, list them
   (name, tax code) and ask which one; never pick one yourself.
2. Call the matching tool with the user's own wording for the enterprise. Pass `from_year`,
   `to_year` and `indicators` only when the user gave them.
3. Answer from `answer` and `sources` only. Cite the source records you used (code, name or title
   as present in `sources`), and give units, period and update time when the data has them.
4. If `sources_omitted` is present, say that more records exist than were returned.
5. Summaries, trends and comparisons you write yourself are your analysis: label them as such and
   keep them separate from the reported data.

## Pitfalls

- Missing data is an answer: if `sources` is empty or the answer says nothing was found, tell the
  user the service has no data for it. Do not use general knowledge as if it were the record.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the failure
  plainly with its hint; do not retry in a loop and do not answer from memory.
- Never invent tax codes, legal status, revenue or headcount.

## Verification

Every figure or fact in the reply appears in the tool result's `answer` or `sources`, and each
cited record can be traced to an entry in `sources`.
