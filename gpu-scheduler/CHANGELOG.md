# Changelog

## [Unreleased]

### Thêm
- Spec (`docs/00-spec/SPEC.md`): 68 REQ, bảng cấu hình. Ca đăng ký theo giờ tròn; yêu cầu múi giờ (REQ-BK-11, BK-12, SC-08, UI-10, DP-06).
- Docs thiết kế (`docs/10-design/`): API, CSDL, Scheduler, Container, Lưu trữ, Dashboard, Triển khai.
- `docs/10-design/time.md`: quy tắc thời gian và múi giờ.
- 125 test case (`docs/20-test-cases/`).
- `tools/trace.js`, `tools/sync-ticks.js`.
- M1 Người dùng & xác thực: đăng nhập Google (kiểm token ở backend, chỉ `@vimaru.edu.vn`), phiên cookie, duyệt tài khoản kèm cấp phát có hoàn tác, dải cổng, mật khẩu SSH hiển thị một lần (mã hóa AES-GCM khi chờ), SSH key, khóa/xóa/purge user, lệnh CLI `migrate`/`promote-admin`/`purge`, helper `deploy/vmu-provision`.
- M2 Đặt lịch: ca theo giờ tròn giờ VN, kiểm tra thời gian theo thứ tự SPEC, giới hạn 2 phiên / 1 GPU theo từng mốc, hạn mức GPU theo tuần (Thứ Hai 00:00 VN), khóa advisory chống tranh chấp, hủy / kết thúc sớm / khởi động lại, lịch theo giờ, danh sách image, `gpu_quota` trong `GET /me`. Module `backend/src/time/` là nơi duy nhất quy đổi múi giờ.

### Thay đổi
- `SESSION_TTL` = 30 ngày.
