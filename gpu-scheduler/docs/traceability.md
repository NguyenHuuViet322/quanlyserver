# Ma trận truy vết

> Tự sinh bởi `node tools/trace.js --write`. **Không sửa tay.** Chạy lại sau mỗi lần merge.

- REQ: **83** · Test case: **162** · Đã tick: **122/162**
- Gate Bước 2–3: ✅ đạt

| REQ | Mô tả | Mục Docs | Test case | Có test tự động | File code | Trạng thái |
|---|---|---|---|---|---|---|
| REQ-US-01 | Xác thực ID token Google | api.md | US-T01 ✅, US-T06 ✅, US-T07 ✅ | 3/3 | backend/src/auth/google.js | ✅ Xong |
| REQ-US-02 | Email đã xác minh | api.md | US-T05 ✅ | 1/1 | backend/src/auth/google.js | ✅ Xong |
| REQ-US-03 | Giới hạn tên miền | api.md | US-T01 ✅, US-T02 ✅, US-T03 ✅, US-T04 ✅, US-T07 ✅ | 5/5 | backend/src/auth/google.js, frontend/src/views/auth.js | ✅ Xong |
| REQ-US-04 | Thông tin hồ sơ | api.md | US-T08 ✅ | 1/1 | backend/src/users/service.js | ✅ Xong |
| REQ-US-05 | Tên đăng nhập | api.md, database.md, scheduler.md | US-T09 ✅, US-T10 ✅ | 2/2 | backend/src/users/service.js, backend/src/users/username.js | ✅ Xong |
| REQ-US-06 | Tài khoản chờ duyệt | api.md | US-T11 ✅ | 1/1 | backend/src/app.js, backend/src/users/service.js | ✅ Xong |
| REQ-US-07 | Cấp phát khi duyệt | api.md, storage.md | US-T12, US-T15 ✅ | 2/2 | backend/src/system/linux.js, frontend/src/views/admin.js | Đang làm (1/2) |
| REQ-US-08 | Giới hạn số tài khoản | api.md | US-T14 ✅ | 1/1 | — | ✅ Xong |
| REQ-US-10 | Mật khẩu SSH ban đầu | api.md, database.md, deployment.md | DP-T11 ✅, US-T16 ✅, US-T17 ✅, US-T18 ✅, US-T19, US-T20 ✅ | 5/6 | backend/src/app.js, backend/src/users/password.js, backend/src/users/service.js, frontend/src/app.js | Đang làm (5/6) |
| REQ-US-11 | Bắt đổi mật khẩu lần đầu | api.md, ssh.md | US-T21 | 0/1 | backend/src/users/service.js, frontend/src/views/account.js | Đang làm (0/1) |
| REQ-US-12 | Cấp lại mật khẩu | api.md, dashboard.md | US-T22 | 0/1 | backend/src/users/service.js | Đang làm (0/1) |
| REQ-US-13 | SSH key | api.md, dashboard.md, database.md, ssh.md | US-T23, US-T28 ✅, US-T34 ✅ | 2/3 | backend/src/users/service.js, backend/src/users/ssh-key.js | Đang làm (2/3) |
| REQ-US-14 | Phân quyền | api.md | US-T24 ✅, US-T27 ✅, US-T30 ✅ | 3/3 | backend/src/app.js | ✅ Xong |
| REQ-US-15 | Khóa tài khoản | api.md | US-T25 ✅ | 1/1 | backend/src/app.js, backend/src/users/service.js | ✅ Xong |
| REQ-US-16 | Xóa tài khoản | api.md, database.md, storage.md | US-T26 ✅, US-T29 ✅ | 2/2 | backend/src/cli.js, backend/src/users/service.js | ✅ Xong |
| REQ-US-17 | Từ chối tài khoản | api.md, database.md | US-T32 ✅ | 1/1 | backend/src/users/service.js | ✅ Xong |
| REQ-US-18 | Admin cấp lại mật khẩu SSH | api.md | US-T33 ✅ | 1/1 | backend/src/users/service.js, frontend/src/app.js | ✅ Xong |
| REQ-BK-01 | Hợp lệ thời gian | api.md, database.md, time.md | BK-T01 ✅, BK-T02 ✅, BK-T03 ✅, BK-T04 ✅, BK-T05 ✅, BK-T06 ✅, BK-T24 ✅, BK-T39 ✅, BK-T40 ✅ | 9/9 | backend/src/app.js, backend/src/booking/rules.js | ✅ Xong |
| REQ-BK-02 | Tối đa 2 phiên đồng thời | api.md, database.md | BK-T07 ✅, BK-T08 ✅, BK-T10 ✅, BK-T11 ✅, BK-T12 ✅, BK-T13 ✅ | 6/6 | backend/src/app.js, backend/src/booking/conflict.js | ✅ Xong |
| REQ-BK-03 | Tối đa 1 phiên GPU | api.md | BK-T08 ✅, BK-T09 ✅, BK-T13 ✅, BK-T29 ✅ | 4/4 | backend/src/app.js, backend/src/booking/conflict.js | ✅ Xong |
| REQ-BK-04 | Không tự chồng | api.md | BK-T14 ✅ | 1/1 | backend/src/app.js, backend/src/booking/conflict.js | ✅ Xong |
| REQ-BK-05 | Hạn mức GPU theo tuần | api.md, database.md, scheduler.md | BK-T16 ✅, BK-T17 ✅, BK-T18 ✅, BK-T28 ✅, BK-T37 ✅, BK-T44 ✅ | 6/6 | backend/src/app.js, backend/src/booking/quota.js | ✅ Xong |
| REQ-BK-06 | An toàn khi đồng thời | api.md, database.md | BK-T19 ✅, BK-T20 ✅ | 2/2 | backend/src/app.js, backend/src/booking/service.js | ✅ Xong |
| REQ-BK-07 | Quyền trên ca | api.md | BK-T21 ✅, BK-T27 ✅, BK-T30 ✅ | 3/3 | backend/src/app.js, backend/src/booking/service.js | ✅ Xong |
| REQ-BK-08 | Hủy và kết thúc sớm | api.md, scheduler.md | BK-T22 ✅, BK-T23, BK-T26 ✅ | 2/3 | backend/src/app.js, backend/src/booking/service.js | Đang làm (2/3) |
| REQ-BK-09 | Ca không hiệu lực | api.md | BK-T15 ✅ | 1/1 | backend/src/app.js, backend/src/booking/conflict.js | ✅ Xong |
| REQ-BK-10 | Dữ liệu đặt ca | api.md | BK-T25 ✅, BK-T41 ✅ | 2/2 | backend/src/app.js | ✅ Xong |
| REQ-BK-11 | Định dạng thời gian ở API | api.md, time.md | BK-T33 ✅, BK-T34 ✅ | 2/2 | backend/src/app.js, backend/src/time/index.js | ✅ Xong |
| REQ-BK-13 | Kiểm tra thử đặt ca | api.md | BK-T43 ✅ | 1/1 | backend/src/booking/service.js | ✅ Xong |
| REQ-BK-14 | Lịch (dữ liệu) | api.md, dashboard.md | BK-T42 ✅ | 1/1 | frontend/src/views/calendar.js | ✅ Xong |
| REQ-BK-12 | Tính theo giờ Việt Nam, không phụ thuộc môi trường | api.md, database.md, deployment.md, time.md | BK-T35 ✅, BK-T36 ✅, BK-T37 ✅, BK-T38 ✅, BK-T40 ✅ | 5/5 | backend/src/app.js, backend/src/booking/quota.js, backend/src/time/index.js | ✅ Xong |
| REQ-SC-01 | Khởi chạy đúng giờ | scheduler.md | SC-T01, SC-T12 ✅ | 2/2 | backend/src/scheduler/tick.js | Đang làm (1/2) |
| REQ-SC-02 | Cảnh báo hết ca | api.md, database.md, scheduler.md, ssh.md | MN-T06 ✅, MN-T07 ✅, MN-T08 ✅, SC-T02 ✅, SC-T15 | 4/5 | backend/src/monitoring/service.js, backend/src/scheduler/tick.js | Đang làm (4/5) |
| REQ-SC-03 | Dừng khi hết ca | scheduler.md | SC-T03 ✅, SC-T04 | 2/2 | backend/src/scheduler/tick.js | Đang làm (1/2) |
| REQ-SC-04 | Không tạo trùng container | scheduler.md | SC-T05 ✅ | 1/1 | backend/src/scheduler/tick.js | ✅ Xong |
| REQ-SC-05 | Reconcile khi khởi động | scheduler.md | SC-T06 ✅, SC-T07 ✅ | 2/2 | backend/src/scheduler/tick.js | ✅ Xong |
| REQ-SC-06 | Lỗi tạo container | api.md, scheduler.md | MN-T06 ✅, SC-T08 ✅ | 2/2 | backend/src/monitoring/service.js, backend/src/scheduler/tick.js | ✅ Xong |
| REQ-SC-07 | Container tự thoát | api.md, container.md, scheduler.md | SC-T09 ✅, SC-T10 ✅, SC-T11 ✅ | 3/3 | backend/src/booking/service.js, backend/src/scheduler/tick.js | ✅ Xong |
| REQ-SC-08 | Đồng hồ của Scheduler | container.md, scheduler.md, time.md | SC-T13 ✅, SC-T14 | 2/2 | backend/src/container/run-args.js, backend/src/scheduler/tick.js | Đang làm (1/2) |
| REQ-CT-01 | GPU | container.md | CT-T01, CT-T02 | 0/2 | backend/src/container/run-args.js | Đang làm (0/2) |
| REQ-CT-02 | Tài nguyên | container.md | CT-T03, CT-T04, CT-T05 ✅, CT-T24 ✅, DP-T03 | 2/5 | backend/src/container/run-args.js | Đang làm (2/5) |
| REQ-CT-03 | Cách ly dữ liệu | container.md | CT-T06, CT-T07 | 0/2 | backend/src/container/run-args.js | Đang làm (0/2) |
| REQ-CT-04 | Bảo mật | container.md | CT-T08, CT-T09 ✅ | 1/2 | backend/src/container/run-args.js | Đang làm (1/2) |
| REQ-CT-05 | Mạng | container.md, deployment.md, ssh.md | CT-T10 ✅, CT-T19 | 1/2 | backend/src/config.js, backend/src/container/run-args.js | Đang làm (1/2) |
| REQ-CT-06 | Image chung | container.md | CT-T11 ✅ | 1/1 | backend/src/config.js, backend/src/container/run-args.js | ✅ Xong |
| REQ-CT-07 | Chạy song song | container.md | CT-T12 | 0/1 | — | Chưa code (0/1) |
| REQ-CT-08 | Vào container bằng SSH | ssh.md | CT-T13, CT-T14, CT-T15, SC-T15 | 0/4 | — | Chưa code (0/4) |
| REQ-CT-09 | Chép file mọi lúc | ssh.md | CT-T16, CT-T17 ✅ | 1/2 | — | Chưa code (0/2) |
| REQ-CT-11 | SSH thẳng vào container (VS Code Remote-SSH) | api.md, container.md, scheduler.md, ssh.md | CT-T20 ✅, CT-T21, CT-T22, CT-T23 ✅ | 2/4 | backend/src/config.js, backend/src/container/run-args.js, backend/src/scheduler/tick.js, frontend/src/views/connect-guide.js | Đang làm (2/4) |
| REQ-ST-01 | Project quota | storage.md | ST-T01, ST-T02, US-T12 | 1/3 | backend/src/system/linux.js | Đang làm (0/3) |
| REQ-ST-02 | Vượt soft quota | api.md, dashboard.md, database.md, storage.md | MN-T06 ✅, ST-T03 ✅, ST-T07 | 2/3 | backend/src/monitoring/service.js, backend/src/scheduler/main.js, backend/src/storage/service.js, frontend/src/app.js, frontend/src/views/account.js | Đang làm (2/3) |
| REQ-ST-03 | Writable layer | container.md, deployment.md, storage.md | ST-T04 | 0/1 | backend/src/container/run-args.js | Đang làm (0/1) |
| REQ-ST-04 | Dữ liệu bền vững | storage.md | ST-T05 | 0/1 | — | Chưa code (0/1) |
| REQ-ST-05 | Báo cáo dung lượng | database.md, storage.md | ST-T06 | 1/1 | backend/src/scheduler/main.js, backend/src/storage/service.js, backend/src/storage/xfs.js | Đang làm (0/1) |
| REQ-MN-01 | Số liệu phiên | api.md | MN-T01, MN-T09 ✅ | 2/2 | backend/src/app.js, backend/src/monitoring/parse.js, backend/src/monitoring/service.js, frontend/src/views/bookings.js | Đang làm (1/2) |
| REQ-MN-02 | Log container | api.md | MN-T02 ✅, MN-T05 ✅ | 2/2 | backend/src/app.js, backend/src/cli.js, backend/src/monitoring/service.js | ✅ Xong |
| REQ-MN-03 | Audit log | api.md, database.md, scheduler.md | MN-T03 ✅, MN-T10 ✅ | 2/2 | backend/src/monitoring/service.js, backend/src/scheduler/tick.js, frontend/src/views/admin.js | ✅ Xong |
| REQ-MN-04 | Lý do dừng | api.md, scheduler.md | MN-T04 ✅, MN-T06 ✅ | 2/2 | backend/src/monitoring/service.js, backend/src/scheduler/tick.js | ✅ Xong |
| REQ-UI-01 | Hộp thoại đặt ca có công tắc "Sử dụng GPU RTX 5090", **mặ… | dashboard.md | UI-T01 ✅ | 1/1 | frontend/src/views/calendar.js | ✅ Xong |
| REQ-UI-02 | Lịch 8 ngày (dữ liệu theo REQ-BK-14): mỗi ca là khối ghi … | api.md, dashboard.md | BK-T42 ✅, UI-T02 ✅, UI-T13 ✅, UI-T20 ✅ | 4/4 | backend/src/booking/service.js | ✅ Xong |
| REQ-UI-03 | Mỗi mã lỗi `409` và `400` MUST có thông báo tiếng Việt dễ… | dashboard.md | UI-T03 ✅ | 1/1 | frontend/src/ui.js | ✅ Xong |
| REQ-UI-05 | Menu tài khoản (góc phải thanh trên) MUST hiện họ tên, em… | api.md, dashboard.md | UI-T05 ✅ | 1/1 | backend/src/storage/service.js, frontend/src/app.js | ✅ Xong |
| REQ-UI-06 | User MUST hủy ca và kết thúc sớm được từ giao diện. Bảng … | dashboard.md | UI-T06 ✅, UI-T19 ✅ | 2/2 | frontend/src/views/bookings.js | ✅ Xong |
| REQ-UI-07 | Có nút "Đăng nhập bằng Google"; tài khoản `pending` thấy … | dashboard.md | UI-T07 ✅ | 1/1 | frontend/src/views/auth.js | ✅ Xong |
| REQ-UI-08 | Màn hình mật khẩu lần đầu có nút sao chép, cảnh báo lưu l… | dashboard.md | UI-T08 ✅ | 1/1 | frontend/src/app.js, frontend/src/views/auth.js | ✅ Xong |
| REQ-UI-09 | Trang Quản trị có 3 tab: **Duyệt tài khoản** (email, họ t… | dashboard.md | UI-T09 ✅ | 1/1 | frontend/src/views/admin.js | ✅ Xong |
| REQ-UI-11 | Trang Ca của tôi MUST có hướng dẫn kết nối: lệnh `ssh` và… | dashboard.md, ssh.md | UI-T12 ✅ | 1/1 | frontend/src/views/connect-guide.js | ✅ Xong |
| REQ-UI-12 | Thanh công cụ Lịch MUST hiện "Hạn mức GPU: <đã dùng>/<hạn… | api.md, dashboard.md | BK-T44 ✅, UI-T14 ✅ | 2/2 | backend/src/booking/service.js | ✅ Xong |
| REQ-UI-13 | Khi có ca `starting`, `running` hoặc `exited`: trang Ca c… | api.md, dashboard.md | UI-T15 ✅ | 1/1 | frontend/src/views/bookings.js | ✅ Xong |
| REQ-UI-14 | Hộp thoại đặt ca MUST kiểm tra quy tắc ngay khi thay đổi … | api.md, dashboard.md | UI-T16 ✅ | 1/1 | — | ✅ Xong |
| REQ-UI-15 | Ca của mình đang chạy còn ≤ `END_WARNING`: popup góc dưới… | dashboard.md | UI-T17 ✅ | 1/1 | frontend/src/app.js | ✅ Xong |
| REQ-UI-16 | Thẻ dung lượng (trang Tài khoản & Key): thanh màu chủ đạo… | dashboard.md | UI-T18 ✅ | 1/1 | frontend/src/views/account.js | ✅ Xong |
| REQ-UI-17 | Nhãn trạng thái ca luôn có chữ và màu: `scheduled` "Sắp t… | dashboard.md | UI-T19 ✅ | 1/1 | frontend/src/ui.js | ✅ Xong |
| REQ-UI-10 | Dashboard MUST hiển thị và nhận giờ theo giờ Việt Nam, kè… | dashboard.md, time.md | UI-T10 ✅, UI-T11 ✅ | 2/2 | frontend/src/time.js | ✅ Xong |
| REQ-DP-01 | Backend và Scheduler MUST chạy dưới systemd, tự khởi động… | deployment.md | DP-T01, DP-T11 ✅ | 1/2 | — | Chưa code (0/2) |
| REQ-DP-02 | Dashboard/API MUST chỉ truy cập qua HTTPS; HTTP chuyển hư… | api.md, deployment.md | DP-T02, DP-T11 ✅ | 1/2 | — | Chưa code (0/2) |
| REQ-DP-03 | Tổng giới hạn RAM của các container MUST ≤ RAM host − `HO… | deployment.md | DP-T03, DP-T09 ✅ | 1/2 | backend/src/config.js, backend/src/scheduler/main.js | Đang làm (1/2) |
| REQ-DP-04 | Phiên bản cũ của image không dùng quá `IMAGE_RETENTION` M… | deployment.md | DP-T04, DP-T10 ✅ | 1/2 | backend/src/cli.js, backend/src/container/docker.js, backend/src/container/images.js | Đang làm (1/2) |
| REQ-DP-05 | MUST có tài liệu người dùng: đăng ký, SSH, lưu dữ liệu, t… | deployment.md, storage.md | DP-T05 | 1/1 | — | Chưa code (0/1) |
| REQ-DP-06 | Đồng hồ server MUST được đồng bộ NTP (chrony hoặc systemd… | container.md, database.md, deployment.md, scheduler.md, time.md | DP-T06, DP-T11 ✅ | 1/2 | backend/src/db/index.js | Đang làm (1/2) |
| REQ-DP-07 | Các tham số ⚙ của bảng cấu hình MUST đọc từ biến môi trườ… | deployment.md | CT-T24 ✅, DP-T07 ✅, DP-T08 ✅ | 3/3 | backend/src/config.js, backend/src/scheduler/main.js, backend/src/server.js | ✅ Xong |
| REQ-DP-08 | MUST có script cài đặt `deploy/install.sh` cho Ubuntu 24.… | deployment.md | DP-T12 ✅, DP-T13 | 1/2 | — | Chưa code (0/2) |
| REQ-DP-09 | Lệnh `vmu-doctor` MUST kiểm tra và in `OK`/`FAIL` cho từn… | deployment.md | DP-T13, DP-T14 | 0/2 | — | Chưa code (0/2) |
