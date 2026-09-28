# Triển khai — REQ-DP-01..05

## Dịch vụ — REQ-DP-01

| Unit systemd | Tiến trình | Ghi chú |
|---|---|---|
| `vmu-api.service` | `node backend/src/server.js` | `Restart=always`, `RestartSec=2`, nghe `127.0.0.1:3000` |
| `vmu-scheduler.service` | `node backend/src/scheduler/main.js` | `Restart=always`, `After=docker.service postgresql.service` |
| `vmu-purge.timer` | dọn user đã xóa, log quá hạn, image quá hạn | chạy hằng ngày 03:00 |

Các lệnh cần root đi qua [`deploy/vmu-provision`](../../deploy/vmu-provision), cài tại `/usr/local/sbin/vmu-provision`, sudoers: `vmu ALL=(root) NOPASSWD: /usr/local/sbin/vmu-provision`. Helper chỉ nhận một danh sách thao tác cố định, từ chối user có UID < 2001; mật khẩu và SSH key truyền qua stdin.

Biến môi trường: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `PASSWORD_ENC_KEY` (64 ký tự hex, `openssl rand -hex 32`), `PORT`, `HOST`. Lần đầu: `node backend/src/cli.js migrate`.

Cả hai service chạy bằng user hệ thống `vmu` (thuộc nhóm `docker`), gọi `vmu-provision` qua `sudo` cho các lệnh cần root (xem [storage.md](storage.md)).

## Nginx — REQ-DP-02

- `:80` → `301` sang `https://`.
- `:443` TLS, proxy `/api` và `/` tới `127.0.0.1:3000`.
- `access_log` không ghi body; không log header `Cookie`. Các route `/api/me/password*` tắt `access_log` hoàn toàn (REQ-US-10).

## Bộ nhớ host — REQ-DP-03

Tổng giới hạn RAM container = `MAX_CONCURRENT_SESSIONS × SESSION_MEMORY` = 2 × 28 = 56 GiB. Phần 8 GiB còn lại dành cho OS, Docker, PostgreSQL, Node.js, Nginx. Khi khởi động, Scheduler kiểm tra `MAX_CONCURRENT_SESSIONS × SESSION_MEMORY ≤ MemTotal − HOST_RESERVED_MEMORY`; sai thì từ chối chạy.

## Đồng hồ và múi giờ — REQ-DP-06

- `timedatectl set-ntp true` (systemd-timesyncd) hoặc cài `chrony`; kiểm tra `timedatectl` báo `System clock synchronized: yes`.
- `timedatectl set-timezone Asia/Ho_Chi_Minh` chỉ để log hệ thống dễ đọc; ứng dụng **không phụ thuộc** vào giá trị này (REQ-BK-12).
- `postgresql.conf`: `timezone = 'UTC'`, `log_timezone = 'Asia/Ho_Chi_Minh'`.
- Unit systemd **không** đặt `Environment=TZ=…` cho backend/scheduler, để test không che giấu lỗi phụ thuộc múi giờ.
- Cài `tzdata`; cập nhật `tzdata` cùng các bản vá hệ điều hành.

## Dọn image — REQ-DP-04

Chạy hằng ngày: xóa image có `last_used_at < now − IMAGE_RETENTION` và không được ca hiệu lực nào tham chiếu.

## Tài liệu người dùng — REQ-DP-05

`docs/user-guide.md` gồm: đăng nhập và chờ duyệt, lấy mật khẩu, SSH lần đầu và đổi mật khẩu, thêm SSH key, đặt ca, dùng cổng (Jupyter/TensorBoard), lưu dữ liệu trong `/workspace`, checkpoint, **tự sao lưu** vì server không sao lưu.
