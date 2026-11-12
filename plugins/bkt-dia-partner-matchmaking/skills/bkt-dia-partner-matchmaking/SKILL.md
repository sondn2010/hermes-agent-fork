---
name: bkt-dia-partner-matchmaking
description: Shortlist partner enterprises using shown criteria.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, matchmaking, F025]
    category: decision-support
    requires_toolsets: [bkt-dia-partner-matchmaking]
---

# DIA Partner Matchmaking Skill

Suggests partner enterprises for a specific bid package (gói thầu) or for an enterprise's
cooperation need (F025: UC147). There is no matching or ranking service: the tools only retrieve
the bid package and candidate enterprises from the DIA AI data service. The ranking is your own
analysis against explicit criteria that you show to the user. It is a suggestion, not a selection
decision, and nothing is saved.

## When to Use

- The user names a bid package and asks for suitable partners: `bkt_dia_partner_matchmaking_tender`
  first to read its field, value, location and requirements, then
  `bkt_dia_partner_matchmaking_candidates` with the capability those requirements imply.
- The user describes a cooperation need (capability, sector, region):
  `bkt_dia_partner_matchmaking_candidates` directly.

Example questions:

- "Gợi ý đối tác phù hợp cho gói thầu IB2400123456."
- "Tìm doanh nghiệp phần mềm tại Hà Nội có năng lực tích hợp hệ thống để hợp tác."
- "Doanh nghiệp của tôi cần đối tác về điện toán đám mây ở miền Nam, gợi ý giúp."

## Prerequisites

The `bkt-dia-common` and `bkt-dia-partner-matchmaking` plugins are enabled and
`plugins.entries.bkt-dia-common.settings.endpoint` points at the DIA query service. If a tool
returns `"ok": false`, show the user its `error` and `hint`.

## Procedure

1. Clarify the need: required capability, sector, region and any must-have condition. If the bid
   package match returns several packages, list them and ask which one.
2. State the criteria before ranking, for example: capability or business line matches the need,
   sector matches, location matches, operating status is active, charter capital is adequate for
   the package value. Use only lawful, non-sensitive criteria taken from the data, and agree the
   criteria with the user when they have preferences.
3. Retrieve candidates and rank them yourself. Present a table:
   `Rank | Enterprise (tax code) | Criteria met | Criteria not met or unknown | Source`.
   Mark a criterion "unknown" when the record lacks the field; never assume it is met.
4. Label the ranking as "analysis, not a matching-service result", note the evidence that is
   missing, and say the shortlist needs review by an authorised person.
5. If `sources_omitted` is present, say that more candidates exist than were returned.

## Pitfalls

- Never contact a candidate or share enterprise data on the user's behalf.
- Never invent candidates, tax codes, capital or capabilities; when `sources` is empty, say the
  service found no candidates and suggest broadening the capability, sector or region.
- Do not present numeric match scores as if a service computed them.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the failure with
  its hint; do not retry in a loop and do not answer from memory.

## Verification

Every candidate and every fact in the table appears in a tool result's `sources` or `answer`, and
the criteria used for the ranking are shown above the table.
