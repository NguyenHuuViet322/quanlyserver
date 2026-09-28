# M7 — Dashboard

Tất cả là test `e2e` (Playwright) với backend chạy trên CSDL test.

- [x] **UI-T01** (REQ-UI-01) · negative · e2e — Form đặt ca có lựa chọn "Dùng GPU: Có/Không", không chọn sẵn; bấm Đặt khi chưa chọn → báo lỗi, không gửi request ✅ `a375761`
- [x] **UI-T02** (REQ-UI-02) · happy · e2e — Lịch hiển thị khác biệt khung đã đủ 2 phiên và khung đã có ca GPU ✅ `a375761`
- [x] **UI-T03** (REQ-UI-03) · negative · e2e — Gây ra `SLOT_FULL`, `GPU_BUSY`, `GPU_QUOTA_EXCEEDED`, `USER_OVERLAP`, `INVALID_TIME` → mỗi mã hiện thông báo tiếng Việt riêng ✅ `a375761`
- [x] **UI-T04** (REQ-UI-04) · happy · e2e — Hiển thị giờ GPU còn lại trong tuần, đúng với `GET /me` ✅ `a375761`
- [x] **UI-T05** (REQ-UI-05) · happy · e2e — Hiển thị username, dải cổng, dung lượng đã dùng / quota ✅ `a375761`
- [x] **UI-T06** (REQ-UI-06) · happy · e2e — Hủy ca `scheduled` và kết thúc sớm ca `running` từ giao diện ✅ `a375761`
- [x] **UI-T07** (REQ-UI-07) · happy · e2e — Có nút "Đăng nhập bằng Google"; tài khoản `pending` thấy màn hình chờ duyệt, không thấy form đặt ca ✅ `a375761`
- [x] **UI-T08** (REQ-UI-08) · happy · e2e — Màn hình mật khẩu lần đầu có nút sao chép, cảnh báo và nút "Tôi đã lưu"; tải lại trang sau khi bấm → không còn mật khẩu ✅ `a375761`
- [x] **UI-T09** (REQ-UI-09) · happy · e2e — Admin duyệt, khóa, xóa tài khoản từ trang admin; user thường không vào được trang này ✅ `a375761`
- [x] **UI-T10** (REQ-UI-10) · edge · e2e — Trình duyệt `timezoneId = America/New_York`: lịch và form hiển thị giờ VN kèm "(GMT+7)" và dòng nhắc; chọn 05/10 09–11 → request gửi `…T09:00:00+07:00` / `…T11:00:00+07:00` ✅ `a375761`
- [x] **UI-T11** (REQ-UI-10) · edge · e2e — Form chỉ cho chọn giờ tròn; chọn 22:00 → 02:00 → tóm tắt "05/10 22:00 – 06/10 02:00 (GMT+7), 4 giờ"; chọn kết thúc 24:00 → gửi `00:00` ngày hôm sau; đồng hồ giả 09:20 → ô "Từ giờ" hôm nay không cho chọn 09:00, giờ sớm nhất là 10:00 ✅ `a375761`
