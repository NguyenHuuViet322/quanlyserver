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
- M3 Scheduler: tick có khóa advisory, khởi chạy / cảnh báo 15 phút / dừng `docker stop -t 120` / lưu log, phát hiện container thoát và OOM, reconcile khi khởi động, `scheduler/main.js`. M4 (phần thuần): `buildRunArgs`, lớp gọi Docker CLI. Test system SC-T01/T04/T14 chạy với `VMU_SYSTEM=1` trên server.
- Truy cập SSH: `deploy/vmu-enter` (ForceCommand, chép file chạy trên máy chủ không qua shell), `deploy/vmu-exec` (vào container của chính user), `deploy/sshd/50-vmu.conf`, `deploy/sudoers.d/vmu`, `PermitOpen` riêng từng user tự sinh khi duyệt/xóa user.
- M5 Lưu trữ: đọc `xfs_quota` mỗi 5 phút, trường `storage` trong `GET /me`, cảnh báo vượt soft quota kèm hạn dọn dẹp.
- M6 Giám sát: `GET /bookings/:id/logs`, `GET /bookings/:id/metrics` (`docker stats`, `nvidia-smi`), `GET /admin/audit`, dọn log quá 30 ngày trong lệnh `purge`.
- Thông báo: `GET /notifications` (`?unread=1`, `?limit`), `POST /notifications/:id/read`, `POST /notifications/read-all`.
- M7 Dashboard (`frontend/src/`): đăng nhập Google, chờ duyệt, mật khẩu lần đầu, tổng quan, lịch 8 ngày × 24 giờ theo giờ VN, form đặt ca theo giờ tròn, ca của tôi (hủy / kết thúc sớm / khởi động lại / log / số liệu), tài khoản & SSH key, quản trị (tài khoản, image, nhật ký), chuông thông báo. Màu theo logo VMU. Test e2e Playwright (Edge trên Windows).
- `GET /api/config`; backend phục vụ file tĩnh khi có `STATIC_DIR`.
- SSH thẳng vào container cho VS Code Remote-SSH (`vmu-connect`, sshd trong container chạy bằng UID của user, chỉ nhận key); Scheduler thêm user vào `/etc/passwd` của container. Image chung `deploy/base-image/`.
- Dashboard: lịch là trang chính, khối ca có tên người dùng, đặt ca bằng hộp thoại; trang Kết nối (VS Code, SSH key, dung lượng); xem từng ngày trên điện thoại; dàn hết chiều rộng.
- Dashboard theo `docs/giao-dien.md`: thanh điều hướng ngang + menu tài khoản; lịch có chọn tuần (xem lại 4 tuần), chú giải, tooltip, thẻ ca bấm được để xem chi tiết và đặt ca vào giờ còn chỗ, "Hạn mức GPU: x/10 giờ"; hộp thoại "Đặt ca mới" có công tắc GPU (mặc định tắt) và 4 dòng kiểm tra trực tiếp; Ca của tôi có khối ca đang chạy (biểu đồ 5 giây, hướng dẫn kết nối, nhật ký) và bảng ca; trang Tài khoản & Key; Quản trị 3 tab; popup đếm ngược 15 phút.
- API: `POST /bookings/check`, `POST /admin/users/:id/reject`, `POST /admin/users/:id/password-reset`, lọc `GET /admin/audit`, lịch trả ca đã xong (xem lại 28 ngày), tên gợi nhớ SSH key, `cpus` trong số liệu, sự kiện hệ thống `booking.start_failed` / `booking.oom` trong nhật ký.

### Thay đổi
- Bỏ chọn image (một image chung `BASE_IMAGE`) và dải cổng riêng; container không mở cổng, gắn mạng `vmu-net` tắt giao tiếp giữa container; sshd máy chủ tắt mọi chuyển tiếp cổng.
- Dashboard không hiển thị giờ GPU còn lại và dải cổng (hạn mức GPU vẫn áp dụng).
- Kết nối PostgreSQL đặt `timezone=UTC` qua tham số kết nối.
- Cổng container chỉ mở trên `127.0.0.1`, truy cập qua SSH tunnel.
- Cảnh báo hết ca in ra terminal SSH trong container.
- `SESSION_TTL` = 30 ngày.
