# Dashboard — REQ-UI-01..03, REQ-UI-05..17

**Mô tả giao diện gốc:** [`docs/giao-dien.md`](../giao-dien.md) (bố cục, thành phần, luồng). Tài liệu này ánh xạ từng phần sang REQ và cách hiện thực. Bảng màu: [tong-quan.md § 6](../tong-quan.md#6-giao-diện-bảng-màu).

SPA thuần (ES module, không bước build) trong `frontend/src/`, gọi API trong [api.md](api.md). Mọi văn bản tiếng Việt, mọi giờ là giờ Việt Nam (REQ-UI-10). Định tuyến bằng hash: `#/` Lịch đặt ca, `#/ca` Ca của tôi, `#/tai-khoan` Tài khoản & Key, `#/quan-tri?tab=pending|users|audit`. Tối ưu cho desktop; màn hình hẹp vẫn dùng được (lịch xem từng ngày, không cuộn ngang).

## Khung trang — REQ-UI-05

| Vùng | Nội dung |
|---|---|
| Trái | Logo VMU + "VMU GPU Server" (về Lịch) |
| Giữa | Lịch đặt ca · Ca của tôi · Tài khoản & Key · Quản trị (chỉ admin); mục đang mở được tô |
| Phải | Chuông (số chưa đọc nền `--vmu-red`); **menu tài khoản**: họ tên, email, thanh dung lượng nhỏ `x / 100 GiB`, "Đổi mật khẩu SSH" (→ Tài khoản & Key), "Đăng xuất" |

Vượt soft quota → dải cảnh báo đỏ đầu mọi trang (REQ-ST-02).

## Trang 1 — Lịch đặt ca (`#/`) — REQ-UI-02, REQ-UI-12

- **Thanh công cụ:** `‹  29/09 – 06/10/2026  ›` (lùi tối đa 4 tuần để xem lại, không tiến quá 7 ngày tới); badge **"Hạn mức GPU: 4/10 giờ"** (màu `--warning` khi > 8 giờ); nút **"+ Đặt ca mới"**; chú giải: Ca của bạn / Ca GPU người khác / Ca CPU người khác / Đã qua.
- **Lưới:** 24 giờ × 8 ngày, cột hôm nay nền `--brand-softer`, vạch đỏ giờ hiện tại, giờ đã qua kẻ sọc mờ.
- **Khối ca** (dữ liệu `GET /calendar`, REQ-BK-14): tên người dùng; ca của mình nền `--brand`; ca GPU người khác nền xám đậm + chip `GPU`; ca không GPU người khác nền xám nhạt; tối đa 2 làn/ngày. Rê chuột: tooltip `vietnh · Trạng thái: Sắp tới | Loại: Có GPU`.
- **Bấm khoảng trống** (tương lai, còn chỗ) → hộp thoại đặt ca điền sẵn ngày/giờ.

## Hộp thoại Đặt ca mới — REQ-UI-01, REQ-UI-14

- Ngày (8 ngày), Từ giờ (giờ tròn; giờ đã bắt đầu bị khóa), Đến giờ (1–8 giờ sau; qua nửa đêm ghi "(+1 ngày)").
- **Công tắc "Sử dụng GPU RTX 5090"**, mặc định tắt; tóm tắt ghi rõ "có GPU" / "không dùng GPU".
- **Kiểm tra quy tắc tức thì:** mỗi lần đổi lựa chọn gọi `POST /bookings/check` (chống dồn: chỉ lấy kết quả của lần gọi mới nhất) và hiện 4 dòng ✅/❌ kèm lý do tiếng Việt:
  1. Khung giờ hợp lệ (giờ tròn, 1–8 giờ, không ở quá khứ, ≤ 7 ngày tới)
  2. Không trùng ca khác của bạn
  3. Còn chỗ trên máy (tối đa 2 phiên, 1 GPU)
  4. Đủ hạn mức GPU tuần
- Nút **Xác nhận đặt ca** chỉ bấm được khi cả 4 dòng đạt. Nếu `POST /bookings` vẫn lỗi (người khác vừa đặt) → hiện thông báo theo mã lỗi (REQ-UI-03) và kiểm tra lại.

## Trang 2 — Ca của tôi (`#/ca`) — REQ-UI-06, REQ-UI-11, REQ-UI-13, REQ-UI-17

**Khối ca đang hoạt động** (khi có ca `starting` / `running` / `exited`):
- Dòng tiêu đề: trạng thái, **Mã ca #id**, "Kết thúc lúc 17:00 (Còn 01 giờ 25 phút)", nút **Mở nhật ký**, **Kết thúc sớm** (nền `--danger-soft`), **Khởi động lại** (khi `exited`).
- Dòng tài nguyên: `RTX 5090 (1 GPU)` nếu có GPU · `14/28 GiB RAM` · `15 lõi CPU` (từ `/bookings/:id/metrics`).
- 3 tab:
  1. **Giám sát tài nguyên:** biểu đồ đường SVG (không thư viện ngoài) GPU %, VRAM %, CPU %, RAM %; lấy mẫu mỗi 5 giây, giữ 60 mẫu gần nhất (5 phút) trong trình duyệt.
  2. **Hướng dẫn kết nối:** `ssh vietnh@gpu.vimaru.edu.vn` và đoạn `~/.ssh/config` (Host vmu … vmu-connect), mỗi thứ có nút sao chép; chưa có SSH key thì nhắc.
  3. **Nhật ký container:** `GET /bookings/:id/logs?tail=500`, nút Làm mới.

Không có ca đang hoạt động → thẻ **Hướng dẫn kết nối** vẫn hiện (REQ-UI-11).

**Bảng ca:** Mã ca · Thời gian (`20:00 – 22:00` + "Hôm nay"/"Hôm qua"/ngày) · GPU (Có / Không) · Trạng thái (nhãn REQ-UI-17; OOM ghi "Dừng do hết RAM") · Thao tác (Hủy ca / Xem log / Xem lý do).

| Trạng thái | Nhãn | Màu |
|---|---|---|
| `scheduled` | Sắp tới | nền `--brand-soft`, chữ `--brand-strong` |
| `starting` / `stopping` | Đang khởi động / Đang dừng | `--warning` |
| `running` | Đang chạy | `--success` |
| `exited` | Đã dừng giữa chừng | `--warning` |
| `failed`, `cancelled`, OOM | Lỗi / Đã hủy / Dừng do hết RAM | `--danger` |
| `completed` | Hoàn thành | trung tính |

## Trang 3 — Tài khoản & Key (`#/tai-khoan`) — REQ-UI-16, REQ-US-12, REQ-US-13

- **Thẻ dung lượng:** thanh `--brand` (< 80 GiB), `--warning` (80 – < 100 GiB, kèm hạn dọn 7 ngày), `--danger` (≥ 100 GiB, không ghi được); hộp nhắc "không sao lưu, tải file về bằng SFTP/SCP".
- **SSH key:** bảng Tên · Fingerprint · Ngày thêm · Xóa; form **Tên gợi nhớ** + **Khóa public** + "Thêm SSH Key".
- **Mật khẩu SSH:** "Tạo lại mật khẩu SSH ngẫu nhiên" → xác nhận → hộp thoại mật khẩu chỉ hiện một lần + Sao chép.

## Trang 4 — Quản trị (`#/quan-tri`) — REQ-UI-09

| Tab | Nội dung |
|---|---|
| **Duyệt tài khoản** | Bảng tài khoản `pending`: Email, Họ tên, Thời gian đăng nhập; **Duyệt** / **Từ chối** |
| **Quản lý người dùng** | Bảng `active`, `locked`, `rejected`, `deleted` (số đang dùng /30); Khóa / Mở khóa / Xóa / **Cấp lại mật khẩu SSH** / Duyệt lại (rejected) |
| **Nhật ký** | Bảng audit; lọc theo người dùng, loại sự kiện (đặt/hủy ca, tài khoản, OOM, lỗi khởi chạy…), từ ngày – đến ngày |

## Popup sắp hết ca — REQ-UI-15

Khi ca của mình đang chạy còn ≤ 15 phút: thẻ nổi góc dưới phải "⚠ SẮP HẾT CA (Còn mm:ss)", "Ca của bạn sẽ kết thúc lúc 17:00", "Hãy lưu checkpoint (`--resume`) ngay", nút **Đã hiểu**. Đếm ngược mỗi giây. Đã bấm "Đã hiểu" thì không hiện lại cho ca đó (nhớ trong `localStorage`, lỗi truy cập thì bỏ qua). Dashboard kiểm tra ca đang chạy mỗi 30 giây ở mọi trang.

## Thông báo lỗi — REQ-UI-03

| `code` | Thông báo |
|---|---|
| `SLOT_FULL` | Khung giờ này đã đủ 2 phiên. Hãy chọn giờ khác. |
| `GPU_BUSY` | Khung giờ này đã có người dùng GPU. Bạn có thể tắt GPU hoặc chọn giờ khác. |
| `GPU_QUOTA_EXCEEDED` | Bạn đã dùng hết 10 giờ GPU tuần này. Bạn vẫn đặt được khung GPU còn trống trong 24 giờ tới. |
| `USER_OVERLAP` | Bạn đã có một ca khác trong khoảng thời gian này. |
| `INVALID_TIME` | Theo `reason`: giờ kết thúc phải sau giờ bắt đầu / giờ này đã qua / ca dài tối đa 8 giờ / chỉ đặt theo giờ tròn / chỉ đặt trước tối đa 7 ngày. |
| `INVALID_STATE` | Thao tác không còn hợp lệ với trạng thái hiện tại của ca. Hãy tải lại trang. |

## Chạy thử trên máy local

`npm run db:test` rồi `npm run dev` → http://127.0.0.1:4174/__dev (CSDL riêng `vmu_dev`, đồng hồ thật, Google/hệ thống/Docker giả; mỗi lần khởi động lại dữ liệu mẫu được tạo lại; trang đăng nhập có nút "Chạy thử: chọn tài khoản mẫu"). Production: Nginx phục vụ `frontend/src/`.
