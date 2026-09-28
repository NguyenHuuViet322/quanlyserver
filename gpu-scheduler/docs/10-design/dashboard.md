# Dashboard — REQ-UI-01..09

SPA gọi API trong [api.md](api.md). Mọi văn bản bằng tiếng Việt.

| Màn hình | Nội dung | REQ |
|---|---|---|
| Đăng nhập | Nút "Đăng nhập bằng Google" (Google Identity Services, `hd=vimaru.edu.vn` chỉ để gợi ý) | REQ-UI-07 |
| Chờ duyệt | Hiện khi `status = pending`; ẩn toàn bộ chức năng khác | REQ-UI-07 |
| Mật khẩu lần đầu | Hiện khi `GET /me/password` trả `200`: mật khẩu, nút "Sao chép", cảnh báo "Chỉ hiển thị một lần", nút "Tôi đã lưu" → `POST /me/password/ack` | REQ-UI-08 |
| Tổng quan | Username, dải cổng, thanh dung lượng (đã dùng / 80 / 100 GiB, hạn dọn nếu vượt soft), giờ GPU còn lại tuần này, thông báo | REQ-UI-04, REQ-UI-05 |
| Lịch | Lưới 7 ngày × 24 giờ (giờ Việt Nam) từ `GET /calendar`: trống / 1 phiên / đầy (2 phiên) / đã có GPU | REQ-UI-02, REQ-UI-10 |
| Đặt ca | Chọn **ngày**, **từ giờ** (00–23), **đến giờ** (01–24, sang ngày sau nếu nhỏ hơn giờ bắt đầu), **Dùng GPU: Có / Không (bắt buộc, không chọn sẵn)**, image, cổng. Hiện tóm tắt "05/10 22:00 – 06/10 02:00 (GMT+7), 4 giờ" | REQ-UI-01, REQ-UI-10 |
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
