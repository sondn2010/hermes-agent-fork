# Cài đặt và vận hành module DIA AI (dành cho quản trị hệ thống)

> **English summary.** Point `bkt-dia-common` at the DIA ES query service with
> `plugins.entries.bkt-dia-common.settings.endpoint` (required; `timeout_seconds` default 15,
> max 60; `max_sources` default 20, max 100). An optional bearer key goes in the profile's `.env`
> as `BKT_DIA_QUERY_API_KEY`. A private or loopback endpoint needs
> `security.allow_private_urls: true`; cloud-metadata addresses are always refused. Enable
> `bkt-dia-common` plus only the modules you need (`hermes plugins enable <name>` or the
> dashboard BKT Modules page); every module is opt-in and each profile has its own list. Changes
> apply to new sessions. The tools fail closed with `{"ok": false, "error", "hint"}` and never
> fabricate data. The full use-case coverage matrix is in section 6.

Hướng dẫn cho người dùng cuối: [bkt-dia-modules-user-guide.md](bkt-dia-modules-user-guide.md).

## 1. Thành phần

- `plugins/bkt_dia_common/` (tên manifest `bkt-dia-common`): cấu hình, client truy vấn và bộ tạo
  công cụ dùng chung. Không đăng ký công cụ nào. Nguồn chuẩn cho cấu hình là
  `plugins/bkt_dia_common/settings.py` và `config_schema` trong `plugins/bkt_dia_common/plugin.yaml`;
  thứ tự kiểm tra và các thông báo lỗi nằm trong `plugins/bkt_dia_common/query_client.py`.
- 20 thư mục `plugins/bkt-dia-*/`: mỗi thư mục có `plugin.yaml` (`provides_tools`, thẻ
  `category:<slug>`), `__init__.py` (biến `MODULE`: mã chức năng, toolset, công cụ, tham số) và
  `skills/<tên>/SKILL.md`. Danh sách công cụ của từng module xem ở `provides_tools` trong
  `plugin.yaml` tương ứng.
- Trang dashboard: `web/src/pages/BktModulesPage.tsx` và `web/src/pages/bkt-modules/`.

Dịch vụ dữ liệu: dịch vụ truy vấn Elasticsearch của DIA (FastAPI), gồm
`POST /api/v1/query` (body `{"question": "..."}`, trả về `{answer, question, type, sources}`) và
`GET /api/v1/query/test` (kiểm tra kết nối). Dịch vụ không có xác thực riêng; khóa bearer chỉ cần
khi đặt sau reverse proxy có kiểm tra khóa.

## 2. Cấu hình

Cấu hình đọc tại thời điểm công cụ chạy, theo hồ sơ (profile) đang hoạt động, nên sửa `config.yaml`
có hiệu lực ngay ở lần gọi tiếp theo (không cần khởi động lại để đổi endpoint).

| Khóa trong `config.yaml` | Bắt buộc | Mặc định | Ghi chú |
|---|---|---|---|
| `plugins.entries.bkt-dia-common.settings.endpoint` | có | (trống) | URL gốc http(s). `/api/v1/query` được tự thêm; `http://h:8000`, `http://h:8000/api/v1` và `http://h:8000/api/v1/query` là như nhau; tiền tố đường dẫn của reverse proxy được giữ (`https://h/dia` thành `https://h/dia/api/v1/query`). |
| `plugins.entries.bkt-dia-common.settings.timeout_seconds` | không | 15 | Giây cho mỗi yêu cầu, giới hạn tối đa 60. Giá trị không hợp lệ quay về 15. |
| `plugins.entries.bkt-dia-common.settings.max_sources` | không | 20 | Số nguồn tối đa trả cho mô hình mỗi lần gọi, giới hạn 0–100. Phần bị cắt được báo qua `sources_omitted`. |

Ví dụ:

```yaml
plugins:
  enabled:
    - bkt-dia-common
    - bkt-dia-enterprise-profile
  entries:
    bkt-dia-common:
      settings:
        endpoint: http://dia-query.internal:8000
        timeout_seconds: 15
        max_sources: 20
security:
  allow_private_urls: true   # chỉ khi endpoint nằm trong mạng nội bộ hoặc loopback
```

Hoặc bằng CLI (ghi vào `config.yaml` của hồ sơ đang dùng):

```bash
hermes config set plugins.entries.bkt-dia-common.settings.endpoint http://dia-query.internal:8000
```

### Khóa API (tùy chọn)

Đặt `BKT_DIA_QUERY_API_KEY` trong tệp `.env` của **hồ sơ** đang dùng (thư mục home của hồ sơ đó,
không phải biến môi trường chung). Client đọc khóa qua
`hermes_cli.config.get_env_value_prefer_dotenv`: tệp `.env` của hồ sơ trước, sau đó tới secret theo
phạm vi hồ sơ; một tiến trình phục vụ nhiều hồ sơ không dùng nhầm khóa của hồ sơ khác. Khóa được
gửi dưới dạng `Authorization: Bearer ...`. Không ghi khóa vào `config.yaml`.

### An toàn URL

Trước mỗi yêu cầu, endpoint được kiểm tra bằng `tools.url_safety.is_safe_url` và yêu cầu được gửi
với chuyển hướng bị tắt.

- Địa chỉ riêng (RFC 1918, loopback, ...) bị chặn trừ khi `security.allow_private_urls: true`.
  Trong tiến trình không gắn hồ sơ riêng, giá trị này được lưu đệm trong suốt vòng đời tiến trình:
  sau khi đổi, khởi động lại dashboard/gateway.
- Địa chỉ metadata của cloud luôn bị từ chối, kể cả khi đã bật `allow_private_urls`.

## 3. Bật/tắt module

Mọi module DIA đều **tắt mặc định** (opt-in). Bật `bkt-dia-common` và chỉ những module cần thiết:
mỗi công cụ được bật được gửi kèm mọi lượt gọi mô hình, nên bật thừa làm tăng token và chi phí.

- Dashboard: trang **BKT Modules** (`/bkt-modules`), công tắc theo module hoặc theo danh mục.
- CLI:

```bash
hermes plugins enable bkt-dia-common
hermes plugins enable bkt-dia-enterprise-profile
hermes plugins disable bkt-dia-enterprise-profile
```

Lưu ý:

- **Theo hồ sơ.** Danh sách `plugins.enabled` / `plugins.disabled` nằm trong `config.yaml` của từng
  hồ sơ. Mỗi hồ sơ cần bật riêng.
- **Áp dụng cho phiên mới.** Danh sách công cụ cố định theo phiên (giữ prompt cache). Gateway đang
  chạy có thể cần `hermes gateway restart`; lệnh `disable` sẽ in gợi ý này khi cần.
- **`bkt-dia-common` phải luôn bật.** `requires_plugins` trong manifest chỉ là khuyến nghị: bật một
  module không tự bật `bkt-dia-common`. Khi nó tắt, mọi công cụ DIA trả lỗi
  `bkt-dia-common plugin is disabled`.
- Tác vụ cron dùng skill DIA (ví dụ `bkt-dia-risk-monitor`) chạy trong cùng hồ sơ, nên các module
  liên quan phải được bật ở hồ sơ đó.

## 4. Kiểm tra kết nối

```bash
curl -s http://dia-query.internal:8000/api/v1/query/test
curl -s -X POST http://dia-query.internal:8000/api/v1/query \
  -H "Content-Type: application/json" \
  -d '{"question": "Có bao nhiêu doanh nghiệp công nghệ số ở Hà Nội?"}'
```

`/api/v1/query/test` trả HTTP 200 cả khi lỗi: đọc trường `status` (`success` kèm `total_documents`,
hoặc `error` kèm `message`). Thêm `-H "Authorization: Bearer <khóa>"` nếu có reverse proxy kiểm tra
khóa.

Kiểm tra plugin trong repo: `hermes plugins validate plugins/<thư-mục>` và
`hermes plugins doctor plugins/<thư-mục>`.

## 5. Xử lý sự cố

Công cụ **fail closed**: trả `{"ok": false, "error", "hint"}` và không gửi yêu cầu khi cấu hình
chưa hợp lệ. Skill hướng dẫn trợ lý báo lỗi kèm gợi ý thay vì đoán câu trả lời.

| Lỗi (`error`) | Nguyên nhân | Xử lý |
|---|---|---|
| `bkt-dia-common plugin is disabled` | `bkt-dia-common` không có trong `plugins.enabled` hoặc nằm trong `plugins.disabled` | Bật nó cho hồ sơ này |
| `bkt-dia endpoint not configured` | Thiếu `endpoint` | Đặt `plugins.entries.bkt-dia-common.settings.endpoint` |
| `bkt-dia endpoint is invalid: ...` | Không phải URL http(s) tuyệt đối | Sửa URL |
| `bkt-dia endpoint blocked by URL safety policy` | Địa chỉ riêng/loopback hoặc metadata cloud | Với dịch vụ nội bộ tin cậy: `security.allow_private_urls: true` rồi khởi động lại |
| `... did not answer within Ns` / HTTP 504 | Dịch vụ chậm hoặc câu hỏi quá rộng | Thu hẹp câu hỏi; kiểm tra dịch vụ; có thể tăng `timeout_seconds` (tối đa 60) |
| `... is unreachable` | Không kết nối được | Kiểm tra endpoint, mạng, dịch vụ đang chạy |
| HTTP 401/403 | Reverse proxy từ chối khóa | Kiểm tra `BKT_DIA_QUERY_API_KEY` trong `.env` của hồ sơ |
| HTTP 5xx khác | Lỗi phía dịch vụ DIA | Xem log dịch vụ DIA |
| `invalid JSON` / `unexpected response shape` | Endpoint trỏ sai dịch vụ hoặc sai phiên bản | Kiểm tra endpoint trỏ đúng dịch vụ truy vấn DIA |

Khi `bkt-dia-common` được nạp mà `endpoint` trống hoặc sai, plugin ghi cảnh báo vào log
(`hermes logs`).

## 6. Ma trận đáp ứng use case

Trạng thái: `covered` (đủ), `partial` (một phần: truy xuất dữ liệu + phân tích có gắn nhãn của mô
hình, hoặc chỉ một phần luồng UC), `not covered` (chưa). Mọi đánh giá dựa trên mã nguồn và mapping
của dịch vụ truy vấn ES (`es_mapping.py`, `es_prompts.py`), **không** kiểm tra trên chỉ mục đang chạy
thực tế; dữ liệu thực có thể ít loại hơn mapping khai báo. F015 được đánh giá khi viết tài liệu này
theo cùng cơ sở; các chức năng còn lại lấy từ báo cáo phạm vi của từng nhóm. "core" nghĩa là tính
năng sẵn có của Hermes, "skill" nghĩa là chỉ do skill hướng dẫn, không có công cụ riêng.

| F | UC | Trạng thái | Công cụ |
|---|---|---|---|
| F002 | UC004 Trích xuất metadata | partial | `bkt_dia_document_intake_lookup` |
| F002 | UC005 Đọc toàn văn Word/PDF | not covered | — |
| F002 | UC006 Nhập liệu e-form | not covered | — |
| F002 | UC008 Chuyển giọng nói thành văn bản | not covered | — |
| F002 | UC009 OCR ảnh thành văn bản | not covered | — |
| F002 | UC064 Nhận dạng giọng nói AI | not covered | — |
| F002 | UC065 Phân tách người nói | not covered | — |
| F002 | UC066 Hiệu chỉnh văn bản sau STT | not covered | — |
| F002 | UC067 Nhận dạng tài liệu có cấu trúc | partial | `bkt_dia_document_intake_lookup` |
| F002 | UC068 Chuẩn hóa văn bản tiền xử lý | not covered | — |
| F005 | UC021 Gợi ý từ khóa/thực thể | partial | `bkt_dia_knowledge_governance_terms` |
| F005 | UC022 Phát hiện tri thức lỗi thời | partial | `bkt_dia_knowledge_governance_audit` |
| F005 | UC025 Phân loại độ nhạy cảm/ưu tiên | not covered | — |
| F005 | UC026 Truy cập RAG/LLM theo nhóm dữ liệu | not covered | — |
| F005 | UC029 Liên kết nguồn ngoài | partial | `bkt_dia_knowledge_governance_audit` |
| F005 | UC030 Chuẩn hóa thuật ngữ/đồng nghĩa | partial | `bkt_dia_knowledge_governance_terms` |
| F005 | UC035 Vòng phản hồi/huấn luyện lại | not covered | — |
| F006 | UC019 Tìm kiếm ngữ nghĩa bằng ngôn ngữ tự nhiên | covered | `bkt_dia_rag_retrieval_ask` |
| F006 | UC020 Xếp hạng lại | partial | `bkt_dia_rag_retrieval_ask` |
| F006 | UC023 Truy vấn thích ứng ngữ cảnh | covered | `bkt_dia_rag_retrieval_ask` |
| F006 | UC032 RAG hội thoại | partial | `bkt_dia_rag_retrieval_ask` |
| F007 | UC024 So sánh đa chiều | partial | `bkt_dia_knowledge_insights_slice` |
| F007 | UC027 Xu hướng tri thức theo thời gian | partial | `bkt_dia_knowledge_insights_slice`, `bkt_dia_knowledge_insights_breakdown` |
| F007 | UC033 So sánh theo thực thể/vùng/thời gian | covered | `bkt_dia_knowledge_insights_breakdown`, `bkt_dia_knowledge_insights_slice` |
| F007 | UC034 Phát hiện bất thường và mẫu | partial | `bkt_dia_knowledge_insights_slice` |
| F010 | UC046 Hỏi đáp doanh nghiệp/sản phẩm | covered | `bkt_dia_admin_assistant_ask` |
| F010 | UC047 Hỏi đáp văn bản pháp quy | partial | `bkt_dia_admin_assistant_documents` |
| F010 | UC048 Quản lý mẫu câu hỏi | partial | skill |
| F010 | UC049 Quản lý lịch sử hội thoại | partial | core (`hermes sessions`, `session_search`) |
| F010 | UC050 Tóm tắt nội dung văn bản | partial | `bkt_dia_admin_assistant_documents` |
| F010 | UC051 Quản lý mô hình LLM | not covered | — (core `hermes model`) |
| F010 | UC052 Quản lý ngôn ngữ và đa phương tiện | not covered | — (core voice, `stt.*`/`tts.*`) |
| F011 | UC053 Nhúng AI trên website khác | not covered | — |
| F011 | UC054 Kích hoạt nhận diện giọng nói | not covered | — (core voice mode) |
| F011 | UC055 Phản hồi bằng giọng nói | partial | `bkt_dia_channel_assistant_lookup` + core TTS |
| F011 | UC056 Lưu hội thoại âm thanh | not covered | — |
| F011 | UC057 Học thói quen giọng nói | not covered | — |
| F011 | UC058 Phát hiện ngữ cảnh hội thoại | partial | `bkt_dia_channel_assistant_lookup` |
| F011 | UC059 Kết nối Zalo OA | not covered | — |
| F011 | UC060 Xử lý tin nhắn người dùng | partial | `bkt_dia_channel_assistant_lookup` |
| F011 | UC061 Quản lý hội thoại trên MXH | not covered | — |
| F011 | UC062 Thống kê tương tác người dùng | not covered | — |
| F011 | UC063 Cập nhật nội dung phản hồi AI | not covered | — |
| F012 | UC073 Hội thoại với AI trợ lý ảo | covered | `bkt_dia_conversation_assistant_ask` |
| F012 | UC074 Cá nhân hóa trải nghiệm | partial | skill |
| F012 | UC075 Gợi ý thông minh theo mục tiêu | partial | `bkt_dia_conversation_assistant_ask` |
| F012 | UC076 Trợ lý ngữ cảnh | partial | `bkt_dia_conversation_assistant_ask` |
| F012 | UC077 Xử lý câu hỏi mơ hồ | covered | skill |
| F012 | UC078 Tóm tắt nhanh thông tin | partial | `bkt_dia_conversation_assistant_ask` |
| F012 | UC079 Tìm kiếm và hỏi đáp ngữ nghĩa | covered | `bkt_dia_conversation_assistant_ask` |
| F012 | UC080 Đa phương thức hội thoại | partial | core |
| F012 | UC081 Hỗ trợ đọc to và thuyết minh | partial | core `text_to_speech` |
| F012 | UC092 Khởi tạo phiên hội thoại mới | partial | core |
| F012 | UC094 Hội thoại theo mục tiêu cụ thể | partial | skill |
| F012 | UC095 Gợi ý mở hội thoại qua hành vi | not covered | — |
| F012 | UC096 Hội thoại khẩn cấp | partial | skill |
| F012 | UC106 Gợi ý tìm kiếm theo ngữ cảnh hội thoại | partial | `bkt_dia_conversation_assistant_ask` |
| F012 | UC116 Gợi ý tra cứu theo ngữ cảnh nghiệp vụ | partial | `bkt_dia_conversation_assistant_ask` |
| F015 | UC097 Hỏi đáp thông tin doanh nghiệp CNS | covered | `bkt_dia_enterprise_profile_lookup` |
| F015 | UC107 Tra cứu hồ sơ doanh nghiệp theo lịch sử | partial | `bkt_dia_enterprise_profile_history` |
| F016 | UC098 Tình hình tài chính doanh nghiệp | partial | `bkt_dia_finance_tax_enterprise_lookup` |
| F016 | UC101 Nghĩa vụ ngân sách nhà nước | partial | `bkt_dia_finance_tax_enterprise_lookup`, `bkt_dia_finance_tax_sector_stats` |
| F016 | UC102 Đóng góp GDP của doanh nghiệp/ngành | partial | `bkt_dia_finance_tax_sector_stats` |
| F016 | UC108 Chỉ số tài chính chi tiết | not covered | — |
| F016 | UC111 Thông tin thuế theo doanh nghiệp | partial | `bkt_dia_finance_tax_enterprise_lookup` |
| F016 | UC112 Đóng góp GDP của ngành công nghiệp số | partial | `bkt_dia_finance_tax_sector_stats` |
| F016 | UC120 Báo cáo tài chính ngành | partial | `bkt_dia_finance_tax_sector_stats` |
| F016 | UC121 Hỏi đáp thuế và ngân sách | partial | `bkt_dia_finance_tax_enterprise_lookup` |
| F017 | UC099 Dữ liệu xuất nhập khẩu doanh nghiệp | partial | `bkt_dia_import_export_lookup` |
| F017 | UC109 Xuất nhập khẩu theo sản phẩm | partial | `bkt_dia_import_export_lookup` |
| F017 | UC125 Hỏi đáp xuất nhập khẩu sản phẩm số | partial | `bkt_dia_import_export_lookup` |
| F018 | UC100 Sản phẩm và thị trường doanh nghiệp | partial | `bkt_dia_digital_products_search` |
| F018 | UC104 Danh mục sản phẩm/dịch vụ số | partial | `bkt_dia_digital_products_search`, `bkt_dia_digital_products_stats` |
| F018 | UC110 Hỏi đáp chi tiết thị trường sản phẩm | not covered | — |
| F018 | UC114 Danh mục sản phẩm số | partial | `bkt_dia_digital_products_search`, `bkt_dia_digital_products_stats` |
| F018 | UC119 Tổng quan thị trường công nghệ số | partial | `bkt_dia_digital_products_stats` |
| F018 | UC123 Sản phẩm được cấp phép (sandbox) | not covered | — |
| F018 | UC124 Sản phẩm số chủ lực | not covered | — |
| F019 | UC103 Hỏi đáp nhân lực công nghệ số | partial | `bkt_dia_workforce_stats` |
| F019 | UC113 Nhân lực theo vùng | partial | `bkt_dia_workforce_stats` |
| F019 | UC122 Nhân lực theo kỹ năng | partial | `bkt_dia_workforce_stats` |
| F020 | UC105 Khu công nghệ số tập trung | partial | `bkt_dia_tech_zones_projects_zone_lookup` |
| F020 | UC115 Chi tiết khu | partial | `bkt_dia_tech_zones_projects_zone_lookup` |
| F020 | UC117 Dự án đầu tư công nghệ số | not covered | — (gần nhất: `bkt_dia_tech_zones_projects_tender_lookup`) |
| F020 | UC118 Lịch sử đấu thầu | partial | `bkt_dia_tech_zones_projects_tender_lookup` |
| F021 | UC126 Phân tích sức khỏe tài chính doanh nghiệp | partial | `bkt_dia_finance_forecast_history`, `bkt_dia_finance_forecast_benchmark` |
| F021 | UC127 Dự báo doanh thu doanh nghiệp | partial | `bkt_dia_finance_forecast_history` |
| F021 | UC128 Dự báo chi phí hoạt động doanh nghiệp | partial | `bkt_dia_finance_forecast_history` |
| F021 | UC129 Phân tích rủi ro tài chính tổng quan | partial | `bkt_dia_finance_forecast_history`, `bkt_dia_finance_forecast_benchmark` |
| F022 | UC130 Dự báo nhu cầu nhân lực ngành công nghiệp số | partial | `bkt_dia_sector_forecast_series` |
| F022 | UC131 Phân tích nguồn cung lao động | partial | `bkt_dia_sector_forecast_series` |
| F022 | UC132 Dự báo thị trường xuất khẩu | partial | `bkt_dia_sector_forecast_series` |
| F022 | UC133 Dự báo thị trường nhập khẩu | partial | `bkt_dia_sector_forecast_series` |
| F022 | UC134 Tác động ngành CNS vào GDP | partial | `bkt_dia_sector_forecast_series` |
| F022 | UC135 Báo cáo dự báo tổng quan ngành | partial | `bkt_dia_sector_forecast_series`, `bkt_dia_sector_forecast_tenders` |
| F022 | UC136 Phân tích gói thầu/dự án lớn | not covered | — (`bkt_dia_sector_forecast_tenders` chỉ lấy bản ghi) |
| F023 | UC137 Khuyến nghị chính sách thuế | partial | `bkt_dia_policy_advisor_documents`, `bkt_dia_policy_advisor_statistics` |
| F023 | UC138 Khuyến nghị ưu đãi đầu tư | partial | `bkt_dia_policy_advisor_documents`, `bkt_dia_policy_advisor_statistics` |
| F023 | UC139 Khuyến nghị hỗ trợ R&D | partial | `bkt_dia_policy_advisor_documents`, `bkt_dia_policy_advisor_statistics` |
| F023 | UC144 Gợi ý chính sách hỗ trợ thị trường | partial | `bkt_dia_policy_advisor_documents`, `bkt_dia_policy_advisor_statistics` |
| F024 | UC140 Gợi ý chiến lược phát triển doanh nghiệp | partial | `bkt_dia_strategy_advisor_enterprise`, `bkt_dia_strategy_advisor_market` |
| F024 | UC141 Đề xuất cơ hội đầu tư | partial | `bkt_dia_strategy_advisor_market` |
| F024 | UC142 Đề xuất cơ hội hợp tác doanh nghiệp | partial | `bkt_dia_strategy_advisor_enterprise`, `bkt_dia_strategy_advisor_market` |
| F024 | UC143 Khuyến nghị đào tạo nhân lực chất lượng cao | partial | `bkt_dia_strategy_advisor_market` |
| F024 | UC145 Đề xuất chiến lược sản phẩm mới | partial | `bkt_dia_strategy_advisor_market`, `bkt_dia_strategy_advisor_enterprise` |
| F024 | UC146 Đánh giá rủi ro chiến lược doanh nghiệp | partial | `bkt_dia_strategy_advisor_enterprise`, `bkt_dia_strategy_advisor_market` |
| F025 | UC147 Matchmaking AI (gói thầu/nhu cầu kết nối) | partial | `bkt_dia_partner_matchmaking_tender`, `bkt_dia_partner_matchmaking_candidates` |
| F026 | UC148 Cảnh báo rủi ro tài chính | partial | `bkt_dia_risk_monitor_check` |
| F026 | UC149 Cảnh báo vi phạm chính sách/pháp luật | partial | `bkt_dia_risk_monitor_check` |
| F026 | UC150 Cảnh báo xuất nhập khẩu bất thường | partial | `bkt_dia_risk_monitor_check` |
| F026 | UC151 Cảnh báo thiếu hụt nhân lực | partial | `bkt_dia_risk_monitor_check` |
| F026 | UC156 Cảnh báo rủi ro tích hợp đa nguồn | partial | `bkt_dia_risk_monitor_check` |
| F026 | UC158 Cảnh báo dữ liệu chiến lược lỗi thời | partial | `bkt_dia_risk_monitor_freshness` |
| F027 | UC031 Khám phá chủ động | partial | `bkt_dia_personalization_insights_suggest` + core `memory` |
| F027 | UC152 Học từ hành vi người dùng | not covered | — |
| F027 | UC153 Nội dung tư vấn cá nhân hóa | partial | `bkt_dia_personalization_insights_suggest` |
| F027 | UC155 Gợi ý từ lịch sử tra cứu | partial | `bkt_dia_personalization_insights_suggest` |
| F027 | UC157 Giám sát tương tác thời gian thực | not covered | — |

Chi tiết lý do từng dòng (dữ liệu nào có, dữ liệu nào thiếu) nằm trong mục "What the data service
does not hold" hoặc "Pitfalls" của `SKILL.md` từng module.

## 7. Giới hạn đã biết

- Chỉ đọc. Không có công cụ ghi/sửa (cần chính sách, xác nhận và nhật ký kiểm toán chưa có).
- Một danh tính dịch vụ chung; chưa có phân quyền dữ liệu theo người dùng (dịch vụ ES chưa hỗ trợ).
- Không có dịch vụ dự báo/thống kê: nội dung "phân tích", "dự báo tham khảo", "khuyến nghị" là suy
  luận của mô hình ngôn ngữ trên dữ liệu đã lấy, có gắn nhãn.
- Chỉ mục văn bản pháp quy không có trường hiệu lực: không xác nhận được văn bản còn hiệu lực.
