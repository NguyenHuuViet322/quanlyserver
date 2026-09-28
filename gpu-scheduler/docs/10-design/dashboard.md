# Dashboard — REQ-UI-01..09

SPA thuần (ES module, không bước build) trong `frontend/src/`, gọi API trong [api.md](api.md). Mọi văn bản bằng tiếng Việt. Định tuyến bằng hash để có deep link: `#/` Tổng quan, `#/lich`, `#/ca`, `#/tai-khoan`, `#/quan-tri?tab=users|images|audit`.

**Giao diện:** màu lấy từ logo VMU (`icon.svg`): xanh chủ đạo `#1f2bd0` (dịu hơn `#0001fe`), đỏ VMU `#e0101f` chỉ làm điểm nhấn thương hiệu; nền trắng/xám nhạt; font Inter (có tiếng Việt); icon SVG nét 1.75 (không emoji); token màu/khoảng cách trong `styles.css`. Trạng thái luôn có chữ, không chỉ dựa vào màu; vùng bấm ≥ 44px; tôn trọng `prefers-reduced-motion`.

**Chạy thử trên máy local:** `npm run db:test` (lần đầu) rồi `npm run dev` → http://127.0.0.1:4174/__dev để chọn tài khoản mẫu. Dùng CSDL riêng `vmu_dev` (xóa sạch mỗi lần chạy), đồng hồ thật, Google/hệ thống/Docker giả, Scheduler chạy mỗi 60 giây. Không cần bước build. Production: Nginx phục vụ `frontend/src/`.

**Đăng nhập:** nút của trang gọi Google Identity Services (One Tap, nếu bị chặn thì hiện nút chính thức của Google) → `POST /api/auth/google`.

| Màn hình | Nội dung | REQ |
|---|---|---|
| Đăng nhập | Nút "Đăng nhập bằng Google" (Google Identity Services, `hd=vimaru.edu.vn` chỉ để gợi ý) | REQ-UI-07 |
| Chờ duyệt | Hiện khi `status = pending`; ẩn toàn bộ chức năng khác | REQ-UI-07 |
| Mật khẩu lần đầu | Hiện khi `GET /me/password` trả `200`: mật khẩu, nút "Sao chép", cảnh báo "Chỉ hiển thị một lần", nút "Tôi đã lưu" → `POST /me/password/ack` | REQ-UI-08 |
| Tổng quan | Username, dải cổng, thanh dung lượng (đã dùng / 80 / 100 GiB, hạn dọn nếu vượt soft), giờ GPU còn lại tuần này, thông báo | REQ-UI-04, REQ-UI-05 |
| Lịch | Lưới 8 ngày (hôm nay + 7) × 24 giờ (giờ Việt Nam) từ `GET /calendar`: trống / 1 phiên / đầy (2 phiên) / đã có GPU | REQ-UI-02, REQ-UI-10 |
| Đặt ca | Chọn **ngày**, **từ giờ** (00–23), **đến giờ** (chỉ liệt kê 1–8 giờ sau giờ bắt đầu; qua nửa đêm ghi "(+1 ngày)", 24:00 = 00:00 hôm sau), **Dùng GPU: Có / Không (bắt buộc, không chọn sẵn)**, image, cổng. Hiện tóm tắt "05/10 22:00 – 06/10 02:00 (GMT+7), 4 giờ" | REQ-UI-01, REQ-UI-10 |
| Ca của tôi | Danh sách ca; nút Hủy (`scheduled`), Kết thúc sớm (`running`/`exited`), Khởi động lại (`exited`), xem số liệu và log | REQ-UI-06, REQ-MN-01, REQ-MN-02, REQ-MN-04 |
| Tài khoản | Cấp lại mật khẩu, quản lý SSH key | REQ-US-12, REQ-US-13 |
| Admin | Danh sách user theo trạng thái; Duyệt / Khóa / Mở khóa / Xóa; danh sách image; audit log | REQ-UI-09 |

## Thông báo lỗi — REQ-UI-03

| `code` | Thông báo |
|---|---|
| `SLOT_FULL` | Khung giờ này đã đủ 2 phiên. Hãy chọn giờ khác. |
| `GPU_BUSY` | Khung giờ này đã có người dùng GPU. Bạn có thể đặt phiên không GPU hoặc chọn giờ khác. |
| `GPU_QUOTA_EXCEEDED` | Bạn đã dùng hết 10 giờ GPU tuần này. Bạn vẫn đặt được khung GPU còn trống trong 24 giờ tới. |
| `USER_OVERLAP` | Bạn đã có một ca khác trong khoảng thời gian này. |
| `INVALID_TIME` | Theo `reason`: giờ kết thúc phải sau giờ bắt đầu / giờ này đã qua, hãy chọn từ giờ tới / ca dài tối đa 8 giờ / chỉ đặt theo giờ tròn / chỉ đặt trước tối đa 7 ngày / lỗi định dạng thời gian (`MISSING_TIMEZONE` — lỗi của client, không phải người dùng). |

## Múi giờ — REQ-UI-10

- Mọi hiển thị dùng `Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', … })`, không dùng múi giờ trình duyệt.
- Form không dùng `<input type="datetime-local">`. Client ghép chuỗi `YYYY-MM-DDTHH:00:00+07:00` từ ngày + giờ đã chọn; "24:00" đổi thành `00:00` của ngày hôm sau.
- Nếu múi giờ trình duyệt khác giờ Việt Nam, hiện một dòng nhắc: "Mọi giờ trên trang là giờ Việt Nam (GMT+7)".
- "Hôm nay" trên lịch là hôm nay theo giờ Việt Nam.
- Giờ đã bắt đầu thì không chọn được (Q9): đang 09:20 thì ô "Từ giờ" của hôm nay chỉ cho chọn từ 10:00 trở đi. Backend vẫn kiểm tra `IN_PAST` phòng khi client gửi trễ qua mốc giờ.
| `IMAGE_NOT_ALLOWED` | Image không nằm trong danh sách cho phép. |
| `PORT_NOT_ALLOWED` | Cổng phải nằm trong dải của bạn (`ports.from`–`ports.to`). |
| `INVALID_STATE` | Thao tác không còn hợp lệ với trạng thái hiện tại của ca. Hãy tải lại trang. |
