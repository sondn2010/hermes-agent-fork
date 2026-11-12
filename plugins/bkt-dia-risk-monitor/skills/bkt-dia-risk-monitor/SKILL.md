---
name: bkt-dia-risk-monitor
description: Check business risk evidence and data freshness in DIA AI.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, risk, monitoring, F026]
    category: monitoring-personalization
    requires_toolsets: [bkt-dia-risk-monitor]
---

# DIA Risk Monitor Skill

Runs on-demand risk checks on DIA AI data (F026: UC148-UC151, UC156, UC158): financial, legal and
policy, import-export, workforce and combined cross-domain risk, plus the freshness of strategic
data. The data service returns facts and figures, not risk scores or alerts. The tools fetch the
evidence; any risk judgement is your analysis and must be labelled as such. It only reads data.

## When to Use

- "Doanh nghiệp X có dấu hiệu rủi ro tài chính không?", "So sánh rủi ro tài chính của X với các
  doanh nghiệp cùng ngành": `bkt_dia_risk_monitor_check` with the finance `risk_area` and, for
  peers, `compare_with`.
- "Dự án/sản phẩm của X có văn bản pháp luật nào cần lưu ý?": the legal/policy `risk_area`.
- "Xuất khẩu điện thoại năm 2024 có biến động bất thường không?": the import-export `risk_area`.
- "Lĩnh vực phần mềm có thiếu hụt nhân lực không?": the workforce `risk_area`.
- "Đánh giá rủi ro tổng hợp của ngành công nghệ số tại Hà Nội": the combined (last) `risk_area`.
  For a fuller picture you may also call the single-area checks; keep the calls few.
- "Số liệu doanh thu ngành CNS đã cũ chưa?", "Dữ liệu mới nhất về X là năm nào?":
  `bkt_dia_risk_monitor_freshness`.

## Prerequisites

The `bkt-dia-common` and `bkt-dia-risk-monitor` plugins are enabled and
`plugins.entries.bkt-dia-common.settings.endpoint` points at the DIA query service. If a tool
returns `"ok": false`, show the user its `error` and `hint`.

## Procedure

1. Identify the subject. If the user names an enterprise ambiguously and `sources` list several,
   list them (name, tax code) and ask which one; never pick one yourself. Pass `period` and
   `compare_with` only when the user gave them.
2. Report the data first: figures with unit, year or period, and the source records you used
   (code, name or title as present in `sources`). If `sources_omitted` is present, say that more
   records exist than were returned.
3. Then, under a heading such as "Phân tích (không phải cảnh báo chính thức)", give your reading:
   large drops or jumps between periods, gaps versus peers, missing years. Say what threshold you
   used. The service holds no debt, liquidity, violation or labour-demand records, so never claim
   a bad-debt, liquidity, violation or shortage finding from these tools; at most point to signals
   in the returned data and recommend a human review. A legal-risk reading is never a conclusion
   of violation.
4. Preventive or corrective measures you suggest are advice, not data: label them as such.
5. Freshness: report the latest year or period found and the update time if present. If the
   newest data is older than the user expects, say it may be outdated. The service has no daily
   news crawl, so you cannot confirm from news that a record is outdated.

## Scheduled monitoring

There is no alert centre or notifier in this module. To repeat a check on a schedule, offer to
create a Hermes cron job (only when the user asks), for example:

```bash
hermes cron create "every day at 08:00" \
  "Kiểm tra dữ liệu xuất nhập khẩu ngành công nghệ số năm nay và báo biến động lớn so với năm trước" \
  --skill bkt-dia-risk-monitor:bkt-dia-risk-monitor --name "DIA trade risk check"
```

In chat the same works through `/cron add` or the `cronjob_manage` tool. The job runs in the same
profile, so these plugins must stay enabled there; its output is delivered like any cron job.

## Pitfalls

- Missing data is an answer: if `sources` is empty or the answer says nothing was found, tell the
  user the service has no data for it. Do not use general knowledge as if it were the record.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the failure
  plainly with its hint; do not retry in a loop and do not answer from memory.
- Never invent figures, risk levels, legal status or alert states. Never assign, close or send an
  alert: these tools cannot.

## Verification

Every figure in the reply appears in the tool result's `answer` or `sources`, each cited record
traces to an entry in `sources`, and every risk statement sits under the labelled analysis part.
