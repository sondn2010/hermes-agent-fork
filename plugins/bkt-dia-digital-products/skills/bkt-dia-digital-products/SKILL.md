---
name: bkt-dia-digital-products
description: Look up digital-tech products and services in DIA AI.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, products, market, F018]
    category: domain-lookup
    requires_toolsets: [bkt-dia-digital-products]
---

# DIA Digital Products Skill

Answers questions about digital-tech products and services (sản phẩm, dịch vụ công nghệ số) from
the DIA AI data service (F018: UC100, UC104, UC110, UC114, UC119, UC123, UC124). It only reads
data; it never creates or edits records and never assigns a legal or licensing status itself.

## When to Use

- Find products or services by name, keyword or field, or those of one provider:
  `bkt_dia_digital_products_search`.
  - "Tìm các phần mềm quản lý doanh nghiệp."
  - "Công ty X cung cấp những sản phẩm công nghệ số nào?"
  - "Sản phẩm tương tự hoặc thay thế cho phần mềm Y?" (`focus`: "sản phẩm tương tự, thay thế")
  - "Tiêu chuẩn, chứng nhận của sản phẩm Z?" (`focus`: "tiêu chuẩn, chứng nhận")
- How many products exist per product group or per provider: `bkt_dia_digital_products_stats`.
  - "Thống kê sản phẩm công nghệ số theo nhóm sản phẩm."
  - "Đơn vị nào cung cấp nhiều sản phẩm nhất?"

## What the data service does not hold

Product records carry a name, a code and a description. Tell the user plainly, without guessing,
when they ask for:

- market share, market value, segments, distribution by market or popularity;
- products licensed for controlled testing (sandbox), key/strategic products (sản phẩm trọng
  điểm) or transfer-restricted products: there is no such status in the data;
- technical standards or certifications, unless the product description states them;
- investment or growth opportunities as data (you may suggest ideas, labelled as analysis).

## Procedure

1. Pass `provider` and `focus` only when the user gave them. If a provider name matches several
   enterprises in `sources`, list them and ask which one.
2. Answer from `answer` and `sources` only. Cite the product records you used (code, name), and
   give the year and update time of statistics when the data has them.
3. If `sources_omitted` is present, say that more records exist than were returned.
4. "Similar" or "competing" products come from a keyword search, not a market analysis; say so.
   Competition summaries and opportunity ideas you write are your analysis: label them "phân tích
   của trợ lý, không phải số liệu chính thức".

## Pitfalls

- Missing data is an answer: never state a license, certification or market share that is not in
  the records.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error) report the `error` and
  `hint` plainly; do not retry in a loop and do not answer from memory.

## Verification

Every product, status or figure in the reply appears in a tool result's `answer` or `sources`,
and every comparison or suggestion is labelled as analysis.
