# Hướng dẫn sử dụng: trang BKT Modules và các module DIA AI

> **English summary.** The Hermes web dashboard has a **BKT Modules** page (`/bkt-modules`) that
> lists every plugin whose name starts with `bkt-`, grouped by category, with a text filter, a
> category filter and an enabled/disabled filter. Each module and each category has a switch.
> 20 `bkt-dia-*` modules (DIA AI functions F002, F005–F007, F010–F012, F015–F027) answer
> questions from the DIA data service (an Elasticsearch query service) with cited sources. They
> are read-only, disabled by default (opt-in), and need the shared `bkt-dia-common` module to stay
> enabled. Changes apply to **new sessions**. Text labelled as analysis or forecast is reasoning
> by the language model on retrieved data, not a statistical model. When the service is down or
> not configured, the tools refuse and say so; they never invent data. Coverage is honest:
> most use cases are *partial*. Operators: see
> [bkt-dia-modules-admin-setup.md](bkt-dia-modules-admin-setup.md) for setup and the full use-case
> coverage matrix. English feature page:
> [website/docs/user-guide/features/bkt-modules.md](../website/docs/user-guide/features/bkt-modules.md).

Đối tượng: người dùng nghiệp vụ và quản trị viên nghiệp vụ. Phần cài đặt kỹ thuật (địa chỉ dịch
vụ, khóa API, kiểm tra kết nối) nằm trong
[bkt-dia-modules-admin-setup.md](bkt-dia-modules-admin-setup.md).

## 1. Đã bàn giao những gì

- **Trang BKT Modules** trong bảng điều khiển web của Hermes (mục "BKT Modules" ngay sau mục
  Plugins). Trang này dùng để **bật/tắt** (hiện/ẩn) các module BKT cho trợ lý AI.
- **20 module DIA AI** (`bkt-dia-*`), mỗi module ứng với một chức năng DIA AI (mã F0xx). Mỗi
  module cung cấp 1–2 công cụ chỉ đọc và một kỹ năng (skill) hướng dẫn trợ lý cách trả lời.
- **Module dùng chung `bkt-dia-common`**: chứa kết nối tới dịch vụ dữ liệu DIA. Bản thân nó không
  có công cụ nào, nhưng mọi module DIA đều cần nó được bật.

Các module chỉ **đọc** dữ liệu. Không module nào tạo, sửa hay xóa dữ liệu trong hệ thống DIA.

## 2. Sử dụng trang BKT Modules

### Mở trang

1. Mở bảng điều khiển web của Hermes (lệnh `hermes dashboard`, hoặc qua ứng dụng desktop vì
   ứng dụng desktop nhúng chính bảng điều khiển này).
2. Chọn mục **BKT Modules** trên thanh điều hướng, hoặc mở đường dẫn `/bkt-modules`.

Trang chỉ liệt kê các plugin có tên bắt đầu bằng `bkt-`. Các plugin khác vẫn nằm ở trang Plugins.

### Lọc module

- **Ô tìm kiếm**: lọc theo tên hoặc mô tả module (không phân biệt hoa thường).
- **Danh mục**: chọn một hoặc nhiều danh mục.
- **Trạng thái**: Tất cả / Đang bật / Đang tắt.
- **Xóa bộ lọc** đưa về mặc định.

Ba bộ lọc kết hợp với nhau. Bộ lọc được lưu trên thanh địa chỉ, nên có thể đánh dấu hoặc gửi
đường dẫn đã lọc cho người khác.

### Bật/tắt một module hoặc cả danh mục

- Mỗi module có một công tắc riêng.
- Mỗi danh mục có một ô chọn chung, hiển thị số module đang bật trên tổng số (ví dụ `2/5`). Khi
  chỉ một phần module được bật, ô chọn ở trạng thái "lưng chừng". Bấm vào để bật (hoặc tắt) **các
  module đang hiển thị** trong danh mục đó, tức là bộ lọc hiện tại vẫn có hiệu lực.
- Nếu một số module không cập nhật được, trang báo rõ module nào lỗi.

Trên trang, các danh mục hiển thị song ngữ:

| Danh mục (trên trang) | Mã danh mục |
|---|---|
| Thành phần dùng chung / Shared foundation | `shared` |
| Tri thức & RAG / Knowledge & RAG | `knowledge-rag` |
| Trợ lý & kênh hội thoại / Assistants & channels | `assistant-channels` |
| Tra cứu nghiệp vụ / Domain lookup | `domain-lookup` |
| Phân tích & dự báo / Analysis & forecast | `analysis-forecast` |
| Hỗ trợ ra quyết định / Decision support | `decision-support` |
| Giám sát & cá nhân hóa / Monitoring & personalization | `monitoring-personalization` |

### Quy tắc quan trọng

- **Thay đổi áp dụng cho phiên mới.** Danh sách công cụ của một phiên hội thoại được cố định khi
  phiên bắt đầu (để giữ bộ nhớ đệm prompt và chi phí thấp). Sau khi bật/tắt, hãy mở phiên mới
  (ví dụ lệnh `/new` hoặc một cuộc trò chuyện mới). Phiên đang chạy giữ nguyên công cụ cũ.
- **Luôn bật `bkt-dia-common`.** Nếu module dùng chung bị tắt, mọi công cụ DIA sẽ từ chối truy vấn
  và báo lỗi. Trang hiển thị nhãn cảnh báo "Needs bkt-dia-common" trên module DIA đang bật khi
  `bkt-dia-common` đang tắt. Bật một module DIA **không** tự động bật `bkt-dia-common`.
- **Mặc định tất cả đều tắt.** Chỉ bật những module bạn thực sự cần. Mỗi công cụ được bật sẽ được
  gửi kèm trong mọi lượt hỏi đáp, nên bật quá nhiều module làm tăng số token (và chi phí) của mỗi
  câu hỏi. Ví dụ: người chỉ tra cứu doanh nghiệp chỉ cần `bkt-dia-common` và
  `bkt-dia-enterprise-profile`.
- **Mỗi hồ sơ (profile) Hermes có danh sách bật/tắt riêng.** Bật ở hồ sơ này không ảnh hưởng hồ sơ
  khác.

## 3. Các module theo danh mục

Cột "Chưa làm được" lấy từ bảng đánh giá mức đáp ứng use case (UC). Đánh giá dựa trên mã nguồn và
cấu trúc chỉ mục của dịch vụ dữ liệu DIA, **chưa** kiểm tra trên dữ liệu thực tế đang chạy; dữ liệu
thực có thể ít hơn. Bảng đầy đủ theo từng UC nằm trong tài liệu quản trị.

Ký hiệu mức đáp ứng: **đủ** (covered), **một phần** (partial), **chưa** (not covered).

### 3.1. Tri thức & RAG (`knowledge-rag`)

| Module | Mã | Có thể hỏi | Chưa làm được | UC liên quan |
|---|---|---|---|---|
| `bkt-dia-document-intake` | F002 | "Báo cáo số doanh nghiệp CNS năm 2024 gồm những trường thông tin nào?"; "Văn bản số … có tiêu đề và mô tả gì?" | Không đọc file Word/PDF, không OCR, không nhận dạng giọng nói, không nhập liệu; chỉ xem các trường đã có trong chỉ mục. | UC004, UC067 (một phần); UC005, UC006, UC008, UC009, UC064–UC066, UC068 (chưa) |
| `bkt-dia-knowledge-governance` | F005 | "Trong hệ thống có bao nhiêu bản ghi nói về SME / DNNVV?"; "Số liệu doanh thu ngành phần mềm này lấy từ báo cáo nào?"; "Những báo cáo nào về nhân lực CNS có số liệu cũ hơn năm 2023?" | Không ghi/sửa tri thức, không có nhãn mức độ nhạy cảm, không phân quyền theo nhóm dữ liệu, không lưu phản hồi; "cũ" chỉ dựa trên năm của bản ghi. | UC021, UC022, UC029, UC030 (một phần); UC025, UC026, UC035 (chưa) |
| `bkt-dia-rag-retrieval` | F006 | "Có bao nhiêu doanh nghiệp công nghệ số ở Đà Nẵng?"; "Các văn bản quy định về chuyển đổi số mới nhất là gì?"; hỏi tiếp "còn ở Huế thì sao?" | Tìm kiếm theo từ khóa (BM25), không phải tìm kiếm vector; không có điểm xếp hạng, không có đồ thị tri thức. | UC019, UC023 (đủ); UC020, UC032 (một phần) |
| `bkt-dia-knowledge-insights` | F007 | "Doanh nghiệp CNS ở Hà Nội và TP.HCM khác nhau thế nào về số lượng và lao động?"; "Số doanh nghiệp CNS tăng hay giảm từ 2021 đến 2024? Có năm nào bất thường không?" | Không vẽ biểu đồ; nhận định xu hướng/bất thường là phân tích của trợ lý, không có ngưỡng thống kê; không có cảnh báo tự động. | UC033 (đủ); UC024, UC027, UC034 (một phần) |

### 3.2. Trợ lý & kênh hội thoại (`assistant-channels`)

| Module | Mã | Có thể hỏi | Chưa làm được | UC liên quan |
|---|---|---|---|---|
| `bkt-dia-admin-assistant` | F010 | "Có bao nhiêu doanh nghiệp công nghệ số ở Hà Nội?"; "Nghị định nào quy định về chuyển đổi số?"; "Tóm tắt báo cáo doanh thu ngành công nghệ số năm 2024" | Không lưu/sửa mẫu câu hỏi; không biết hiệu lực văn bản; quản lý mô hình AI, ngôn ngữ, giọng nói dùng tính năng có sẵn của Hermes chứ không qua module. | UC046 (đủ); UC047–UC050 (một phần); UC051, UC052 (chưa) |
| `bkt-dia-channel-assistant` | F011 | "Gói thầu phần mềm nào đang mời thầu tại Hải Phòng?"; "Khu công nghệ số tập trung ở Đà Nẵng tên là gì?" | Chưa có kết nối Zalo OA; không tạo mã nhúng website, không lưu âm thanh, không thống kê tương tác theo kênh, không cập nhật nội dung trả lời. | UC055, UC058, UC060 (một phần); UC053, UC054, UC056, UC057, UC059, UC061–UC063 (chưa) |
| `bkt-dia-conversation-assistant` | F012 | "Có chính sách hỗ trợ nào cho doanh nghiệp phần mềm vừa và nhỏ không?"; "Doanh nghiệp này đang hoạt động trong lĩnh vực gì?" (khi nói rõ đang xem hồ sơ doanh nghiệp nào) | Không tự lấy ngữ cảnh trang đang xem; không có hàng đợi ưu tiên cho yêu cầu khẩn; không gợi ý dựa trên theo dõi hành vi. | UC073, UC077, UC079 (đủ); UC074–UC076, UC078, UC080, UC081, UC092, UC094, UC096, UC106, UC116 (một phần); UC095 (chưa) |

### 3.3. Tra cứu nghiệp vụ (`domain-lookup`)

| Module | Mã | Có thể hỏi | Chưa làm được | UC liên quan |
|---|---|---|---|---|
| `bkt-dia-enterprise-profile` | F015 | "Tra cứu doanh nghiệp có mã số thuế 0101234567"; "Doanh nghiệp tương tự cùng lĩnh vực với công ty X?"; "Doanh thu công ty X từ 2022 đến 2024 thay đổi thế nào?" | Lịch sử chỉ có doanh thu và thuế TNDN theo năm (2022–2025); không có lịch sử thay đổi hồ sơ hay số lao động của từng doanh nghiệp; không vẽ biểu đồ. | UC097 (đủ); UC107 (một phần) |
| `bkt-dia-finance-tax` | F016 | "Doanh thu và thuế TNDN của công ty có MST 0101234567 từ 2022 đến 2024?"; "Ngành công nghệ số đóng góp bao nhiêu vào GDP qua các năm?" | Không có lợi nhuận, thuế GTGT, báo cáo tài chính chi tiết hay chỉ số tài chính của doanh nghiệp; GDP chỉ ở cấp ngành. | UC098, UC101, UC102, UC111, UC112, UC120, UC121 (một phần); UC108 (chưa) |
| `bkt-dia-import-export` | F017 | "Kim ngạch xuất khẩu ngành công nghệ số năm 2024 là bao nhiêu?"; "Giá trị xuất khẩu điện thoại từ 2021 đến 2024?" | Không có số liệu xuất nhập khẩu theo doanh nghiệp, theo đối tác hay thị trường; chỉ có số liệu ngành theo năm. | UC099, UC109, UC125 (một phần) |
| `bkt-dia-digital-products` | F018 | "Công ty X cung cấp những sản phẩm công nghệ số nào?"; "Đơn vị nào cung cấp nhiều sản phẩm nhất?" | Không có thị phần, giá trị thị trường, sản phẩm được cấp phép thử nghiệm (sandbox) hay sản phẩm chủ lực. | UC100, UC104, UC114, UC119 (một phần); UC110, UC123, UC124 (chưa) |
| `bkt-dia-workforce` | F019 | "Ngành công nghệ số có bao nhiêu lao động năm 2024?"; "Nhân lực công nghệ số theo trình độ chuyên môn?" | Chỉ có số liệu tổng hợp; không có số lao động từng doanh nghiệp, không có kỹ năng cụ thể. | UC103, UC113, UC122 (một phần) |
| `bkt-dia-tech-zones-projects` | F020 | "Khu công nghệ số tập trung ở Đà Nẵng nằm ở đâu?"; "Các gói thầu phần mềm tại Hà Nội năm 2024 và giá trị?" | Không có danh sách doanh nghiệp trong khu, không có dữ liệu dự án đầu tư, không có thông tin nhà thầu tham gia/trúng thầu. | UC105, UC115, UC118 (một phần); UC117 (chưa) |

### 3.4. Phân tích & dự báo (`analysis-forecast`)

| Module | Mã | Có thể hỏi | Chưa làm được | UC liên quan |
|---|---|---|---|---|
| `bkt-dia-finance-forecast` | F021 | "Phân tích sức khỏe tài chính của công ty có MST 0101234567"; "So sánh doanh thu của công ty X với ngành phần mềm" | Không có nợ, thanh khoản, chi phí hoạt động hay số liệu theo tháng/quý. "Dự báo" là phân tích tham khảo, tối đa một kỳ tới, cần ít nhất ba kỳ dữ liệu, không có khoảng tin cậy. | UC126–UC129 (một phần) |
| `bkt-dia-sector-forecast` | F022 | "Nhân lực công nghệ số theo trình độ qua các năm"; "Đóng góp của ngành công nghệ số vào GDP"; "Các gói thầu phần mềm tại Hà Nội năm 2024" | Không có nhu cầu nhân lực, thị trường xuất/nhập khẩu theo quốc gia; đánh giá khả năng đáp ứng gói thầu chưa được định nghĩa nghiệp vụ. | UC130–UC135 (một phần); UC136 (chưa) |

### 3.5. Hỗ trợ ra quyết định (`decision-support`)

| Module | Mã | Có thể hỏi | Chưa làm được | UC liên quan |
|---|---|---|---|---|
| `bkt-dia-policy-advisor` | F023 | "Phân tích tác động của chính sách thuế hiện tại đối với doanh nghiệp phần mềm"; "Lĩnh vực R&D nào trong công nghiệp số nên được ưu tiên hỗ trợ?" | Không có mô hình đánh giá tác động; không biết văn bản còn hiệu lực hay không; khuyến nghị là phân tích tham khảo. | UC137–UC139, UC144 (một phần) |
| `bkt-dia-strategy-advisor` | F024 | "Phân tích năng lực hiện tại và thị trường tiềm năng của công ty có mã số thuế 0101234567"; "Nhu cầu đào tạo nhân lực công nghệ số theo trình độ tại Đà Nẵng" | Không có chỉ số rủi ro hay lợi nhuận theo doanh nghiệp; không so sánh được khả năng sinh lời giữa các phương án. | UC140–UC143, UC145, UC146 (một phần) |
| `bkt-dia-partner-matchmaking` | F025 | "Gợi ý đối tác phù hợp cho gói thầu IB2400123456"; "Tìm doanh nghiệp phần mềm tại Hà Nội có năng lực tích hợp hệ thống để hợp tác" | Không có dịch vụ ghép nối/xếp hạng; thứ tự gợi ý là phân tích của trợ lý theo tiêu chí nêu rõ; không lưu danh sách rút gọn. | UC147 (một phần) |

### 3.6. Giám sát & cá nhân hóa (`monitoring-personalization`)

| Module | Mã | Có thể hỏi | Chưa làm được | UC liên quan |
|---|---|---|---|---|
| `bkt-dia-risk-monitor` | F026 | "Doanh nghiệp X có dấu hiệu rủi ro tài chính không?"; "Xuất khẩu điện thoại năm 2024 có biến động bất thường không?"; "Dữ liệu mới nhất về X là năm nào?" | Không có cảnh báo đẩy; không có dữ liệu nợ xấu, vi phạm hay nhu cầu lao động; không kết luận vi phạm pháp luật. Có thể lên lịch kiểm tra định kỳ bằng tác vụ cron của Hermes. | UC148–UC151, UC156, UC158 (một phần) |
| `bkt-dia-personalization-insights` | F027 | "Gợi ý cho tôi nên hỏi gì về ngành công nghệ số hôm nay"; "Tôi là lãnh đạo cục, theo dõi doanh thu và nhân lực phần mềm; hãy nhớ điều đó"; "Bật chế độ AI chủ động" | Không theo dõi hay học từ hành vi; sở thích chỉ lưu khi bạn yêu cầu (bộ nhớ Hermes), mặc định tắt chế độ chủ động, có hiệu lực từ phiên sau; không giám sát tương tác thời gian thực. | UC031, UC153, UC155 (một phần); UC152, UC157 (chưa) |

## 4. Câu trả lời được tạo ra như thế nào

1. Trợ lý chọn công cụ phù hợp và gửi một câu hỏi tiếng Việt tới **dịch vụ dữ liệu DIA**.
2. Dịch vụ tìm trong chỉ mục dữ liệu DIA (doanh nghiệp, sản phẩm, văn bản pháp quy, gói thầu, khu
   công nghệ số, nhân lực, báo cáo thống kê theo năm, ...) và trả về câu trả lời kèm **nguồn**.
3. Trợ lý trả lời dựa trên dữ liệu đó và **dẫn nguồn** (mã, tên hoặc tiêu đề bản ghi). Nếu có nhiều
   bản ghi hơn số được trả về, trợ lý sẽ nói rõ.

Lưu ý khi đọc câu trả lời:

- Phần được ghi là **phân tích**, **dự báo tham khảo** hay **khuyến nghị** là suy luận của mô hình
  ngôn ngữ trên dữ liệu đã lấy được, **không phải** kết quả của mô hình thống kê hay dự báo. Hãy
  dùng như tài liệu tham khảo, không dùng làm số liệu chính thức.
- Không có dữ liệu cũng là một câu trả lời: trợ lý sẽ nói hệ thống không có dữ liệu thay vì đoán.
- Các module dùng một danh tính dịch vụ chung; chưa có phân quyền dữ liệu theo từng người dùng.

## 5. Câu hỏi thường gặp và xử lý sự cố

**Module không xuất hiện trên trang.** Trang chỉ hiện plugin có tên bắt đầu bằng `bkt-`. Nếu trang
báo "No BKT modules installed", bản cài đặt Hermes này chưa có các plugin `bkt-*`; liên hệ quản trị
viên.

**Đã bật module nhưng trợ lý không dùng.** Mở phiên hội thoại mới (thay đổi chỉ áp dụng cho phiên
mới). Kiểm tra bạn đang ở đúng hồ sơ (profile). Kiểm tra `bkt-dia-common` đang bật.

**Trợ lý báo "bkt-dia-common plugin is disabled".** Bật `bkt-dia-common` trên trang BKT Modules rồi
mở phiên mới.

**Trợ lý báo chưa cấu hình địa chỉ dịch vụ, dịch vụ không phản hồi, hết thời gian chờ, hoặc lỗi
HTTP.** Đây là lỗi kết nối tới dịch vụ dữ liệu DIA. Trợ lý sẽ báo lỗi kèm gợi ý và không tự trả lời
thay. Chuyển nội dung lỗi cho quản trị viên (xem
[bkt-dia-modules-admin-setup.md](bkt-dia-modules-admin-setup.md), mục xử lý sự cố).

**Câu trả lời không có dữ liệu.** Dịch vụ không tìm thấy bản ghi phù hợp, hoặc loại dữ liệu đó chưa
có trong chỉ mục (xem cột "Chưa làm được" ở mục 3). Thử diễn đạt cụ thể hơn: nêu mã số thuế thay vì
tên, nêu năm, tỉnh/thành, lĩnh vực.

**Câu hỏi quá rộng, trả lời chậm.** Thu hẹp câu hỏi (một năm, một tỉnh, một lĩnh vực).
