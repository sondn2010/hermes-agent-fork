---
name: bkt-dia-admin-assistant
description: Answer admin DIA questions on firms, products and laws.
version: 0.1.0
author: BKTech
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [bkt, dia-ai, admin, assistant, F010]
    category: assistant-channels
    requires_toolsets: [bkt-dia-admin-assistant]
---

# DIA Admin Assistant Skill

Answers an administrator's questions from the DIA AI data service: digital-technology enterprises
and products, legal documents (văn bản quy phạm pháp luật) and summary reports, with cited sources
(F010: UC046, UC047, UC050). It only reads data. Model, language and history administration
(UC049, UC051, UC052) are existing Hermes features: point the admin to them instead of answering
from this module.

## When to Use

- A question about enterprises or digital products and services in general (counts, lists, who
  supplies what, where they are): `bkt_dia_admin_assistant_ask`. Set `subject` only when the
  question is clearly about enterprises or about products. For one named enterprise's full
  profile, prefer the `bkt-dia-enterprise-profile` tools when that module is enabled.
- A question about a law, decree, circular or regulation, or a request to quote or summarise one:
  `bkt_dia_admin_assistant_documents` with `document_type` "văn bản quy phạm pháp luật".
- A request to summarise a statistical or summary report held in DIA:
  `bkt_dia_admin_assistant_documents` with `document_type` "báo cáo tổng hợp".
- Summary depth: pass `summary_level` "ngắn gọn" or "chi tiết" only when a summary was asked
  for. When the admin asks for more or less detail, call the tool again with the other level.
- Text the admin pasted or attached (not stored in DIA): summarise it yourself, without a tool, and
  say that the summary is your own reading of the text they gave.

## Question templates (UC048)

Offer these when the admin asks what they can ask, or wants a ready-made question:

- Doanh nghiệp: "Có bao nhiêu doanh nghiệp công nghệ số ở Hà Nội?", "Doanh nghiệp nào cung cấp
  dịch vụ điện toán đám mây?"
- Sản phẩm: "Tìm sản phẩm phần mềm quản lý doanh nghiệp", "Đơn vị nào cung cấp giải pháp an toàn
  thông tin?"
- Văn bản pháp quy: "Nghị định nào quy định về chuyển đổi số?", "Tóm tắt các điều khoản ưu đãi
  thuế cho doanh nghiệp phần mềm", "Nội dung chính của văn bản số 13/2023/NĐ-CP"
- Báo cáo: "Tóm tắt báo cáo doanh thu ngành công nghệ số năm 2024", "Số lao động ngành công nghệ
  số theo tỉnh thành"

Templates here are fixed examples. Saving, editing or categorising templates in a database is not
available.

## Administration that lives elsewhere in Hermes

- Choosing the model and its parameters (UC051): `hermes model`, `hermes config`, or the
  dashboard Config page. Do not change model settings yourself.
- Language and voice (UC052): answer in the admin's language (Vietnamese or English). Voice
  input and spoken replies come from Hermes voice mode and the STT/TTS settings (`stt.*`,
  `tts.*` in config.yaml; see the Voice & TTS docs).
- Conversation history (UC049): Hermes saves every session. Admins browse, search, resume or
  delete sessions with `hermes sessions` or the dashboard Sessions page; inside a chat, use the
  `session_search` tool when it is available.

## Procedure

1. If the question names no subject, period or document, ask for it; never guess an enterprise,
   indicator or document number.
2. Call the matching tool with the admin's own wording.
3. Answer from `answer` and `sources` only. Cite the records you used (code, number, title as
   present in `sources`) and give units, period and update time when the data has them.
4. For legal content, give the document number and title, say that this is legal information and
   not formal legal advice, and say when the data does not show whether the document is still in
   force.
5. If `sources_omitted` is present, say that more records exist than were returned.
6. Summaries, comparisons and conclusions you write yourself are your analysis: label them so and
   keep them apart from the reported data.

## Pitfalls

- Missing data is an answer: if `sources` is empty or the answer says nothing was found, tell the
  admin that the service has no data for it. Do not fill the gap from general knowledge.
- On `"ok": false` (service disabled, endpoint unset, timeout, HTTP error), report the `error`
  and `hint` plainly. Do not retry in a loop and do not answer from memory.
- Never invent document numbers, provisions, figures or enterprise names.

## Verification

Every fact or figure in the reply appears in the tool result's `answer` or `sources`, and each
cited record matches an entry in `sources`.
