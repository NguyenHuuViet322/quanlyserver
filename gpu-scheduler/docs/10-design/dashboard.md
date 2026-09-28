# Dashboard — REQ-UI-01..03, REQ-UI-05..11

SPA thuần (ES module, không bước build) trong `frontend/src/`, gọi API trong [api.md](api.md). Mọi văn bản bằng tiếng Việt. Định tuyến bằng hash để có deep link: `#/` Lịch (trang chính), `#/ca` Ca của tôi, `#/ket-noi` Kết nối, `#/quan-tri?tab=users|audit`.

**Nguyên tắc:** gọn, ít chữ. Mỗi trang một việc chính; thông tin phụ chỉ hiện khi cần (cảnh báo dung lượng chỉ hiện khi vượt 80 GiB, dải cổng và giờ GPU còn lại không hiển thị — REQ-UI-05).

**Giao diện:** màu từ logo VMU (`icon.svg`): xanh chủ đạo `#1f2bd0`, đỏ VMU `#e0101f` chỉ làm điểm nhấn thương hiệu; nền trắng/xám nhạt; font Inter; icon SVG nét 1.75 (không emoji); token trong `styles.css`. Trạng thái luôn có chữ, không chỉ dựa vào màu; vùng bấm ≥ 44px; tôn trọng `prefers-reduced-motion`. Nội dung **dàn hết chiều rộng** màn hình (không có dải trắng ở màn hình lớn).

**Chạy thử trên máy local:** `npm run db:test` rồi `npm run dev` → http://127.0.0.1:4174/__dev để chọn tài khoản mẫu (CSDL riêng `vmu_dev`, đồng hồ thật, Google/hệ thống/Docker giả). Production: Nginx phục vụ `frontend/src/`.

**Đăng nhập:** nút của trang gọi Google Identity Services (One Tap, bị chặn thì hiện nút chính thức) → `POST /api/auth/google`.

| Màn hình | Nội dung | REQ |
|---|---|---|
| Đăng nhập | Nút "Đăng nhập bằng Google" (`hd=vimaru.edu.vn` chỉ để gợi ý) | REQ-UI-07 |
| Chờ duyệt | Hiện khi `status = pending`; ẩn toàn bộ chức năng khác | REQ-UI-07 |
| Mật khẩu lần đầu | Mật khẩu, nút "Sao chép", cảnh báo "Chỉ hiển thị một lần", nút "Tôi đã lưu" | REQ-UI-08 |
| **Lịch** (trang chính) | Lịch 8 ngày × 24 giờ chiếm toàn bộ chiều rộng. Mỗi ca là một khối liền ghi **tên người dùng** và nhãn GPU; tối đa 2 làn/ngày (2 phiên). Ca của mình tô màu chủ đạo. Giờ đã qua mờ đi. Bấm vào khoảng trống → hộp thoại đặt ca điền sẵn giờ. Màn hình hẹp (< 760px): xem từng ngày, có nút chuyển ngày | REQ-UI-02, REQ-UI-10 |
| Hộp thoại đặt ca | **Ngày**, **từ giờ** (00–23), **đến giờ** (1–8 giờ sau giờ bắt đầu; qua nửa đêm ghi "(+1 ngày)"), **Dùng GPU: Có / Không (bắt buộc, không chọn sẵn)**; tóm tắt "05/10 22:00 – 06/10 02:00 (GMT+7), 4 giờ". Không chọn image, không nhập cổng | REQ-UI-01, REQ-UI-10, REQ-BK-10 |
| Ca của tôi | Đang chạy / sắp tới / đã kết thúc; Hủy, Kết thúc sớm, Khởi động lại, Log, Số liệu | REQ-UI-06, REQ-MN-01, REQ-MN-02, REQ-MN-04 |
| **Kết nối** | (1) SSH key: danh sách, thêm, xóa — chưa có key thì nhắc; (2) đoạn `~/.ssh/config` cho VS Code (nút sao chép) + hướng dẫn 3 bước; (3) lệnh `ssh` nhanh; (4) cấp lại mật khẩu; (5) dung lượng `/workspace` đã dùng / quota | REQ-UI-05, REQ-UI-11, REQ-US-12, REQ-US-13 |
| Quản trị | Tab Tài khoản (lọc theo trạng thái; Duyệt / Khóa / Mở khóa / Xóa), tab Nhật ký | REQ-UI-09 |

Thanh trên cùng: tên trang, chuông thông báo, username (REQ-UI-05), đăng xuất. Vượt soft quota → dải cảnh báo đỏ ở đầu mọi trang kèm hạn dọn dẹp (REQ-ST-02).

## Thông báo lỗi — REQ-UI-03

| `code` | Thông báo |
|---|---|
| `SLOT_FULL` | Khung giờ này đã đủ 2 phiên. Hãy chọn giờ khác. |
| `GPU_BUSY` | Khung giờ này đã có người dùng GPU. Bạn có thể đặt phiên không GPU hoặc chọn giờ khác. |
| `GPU_QUOTA_EXCEEDED` | Bạn đã dùng hết 10 giờ GPU tuần này. Bạn vẫn đặt được khung GPU còn trống trong 24 giờ tới. |
| `USER_OVERLAP` | Bạn đã có một ca khác trong khoảng thời gian này. |
| `INVALID_TIME` | Theo `reason`: giờ kết thúc phải sau giờ bắt đầu / giờ này đã qua, hãy chọn từ giờ tới / ca dài tối đa 8 giờ / chỉ đặt theo giờ tròn / chỉ đặt trước tối đa 7 ngày / lỗi định dạng thời gian (`MISSING_TIMEZONE` — lỗi của client). |
| `INVALID_STATE` | Thao tác không còn hợp lệ với trạng thái hiện tại của ca. Hãy tải lại trang. |

## Múi giờ — REQ-UI-10

- Mọi hiển thị dùng `Intl.DateTimeFormat(…, { timeZone: 'Asia/Ho_Chi_Minh' })`, không dùng múi giờ trình duyệt.
- Form không dùng `<input type="datetime-local">`. Client ghép chuỗi `YYYY-MM-DDTHH:00:00+07:00`; "24:00" đổi thành `00:00` hôm sau.
- Múi giờ trình duyệt khác giờ Việt Nam → dòng nhắc "Mọi giờ trên trang là giờ Việt Nam (GMT+7)".
- "Hôm nay" trên lịch là hôm nay theo giờ Việt Nam.
- Giờ đã bắt đầu thì không chọn được (Q9); backend vẫn kiểm tra `IN_PAST`.
