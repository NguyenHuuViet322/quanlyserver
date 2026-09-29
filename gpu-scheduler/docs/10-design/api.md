# API

Tài liệu mô tả hệ thống **nhìn từ bên ngoài**. Người viết test đọc tài liệu này, không đọc code.

## Quy ước chung

- Base URL: `https://<host>/api`. Chỉ HTTPS (REQ-DP-02).
- Phiên đăng nhập: cookie `sid` (`HttpOnly`, `Secure`, `SameSite=Lax`) cấp sau `POST /auth/google`.
- Thời gian — REQ-BK-11, REQ-BK-12:
  - **Gửi lên:** ISO 8601 bắt buộc có múi giờ (`Z` hoặc `±HH:MM`). `2026-10-05T09:00:00+07:00` và `2026-10-05T02:00:00Z` là cùng một thời điểm. Thiếu múi giờ → `400 INVALID_TIME` (`MISSING_TIMEZONE`).
  - **Trả về:** luôn là giờ Việt Nam có offset, vd `2026-10-05T09:00:00+07:00`.
  - **Giờ tròn** được xét theo giờ Việt Nam sau khi quy đổi: `2026-10-05T11:00:00+09:00` (= 09:00 VN) hợp lệ; `2026-10-05T09:00:00+05:30` (= 10:30 VN) không hợp lệ.
  - Tham số ngày thuần (không có giờ), vd `?date=2026-10-05`, được hiểu là ngày theo giờ Việt Nam.
- Lỗi luôn có dạng:

```json
{ "error": { "code": "GPU_BUSY", "message": "Khung giờ này đã có người dùng GPU", "details": {} } }
```

## Mã lỗi

Mỗi mã lỗi phải có ít nhất 1 test case gây ra nó (Gate Bước 3).

| HTTP | `code` | Điều kiện xảy ra | REQ | Test case |
|---|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Body sai kiểu, thiếu trường bắt buộc (vd thiếu `use_gpu`) | REQ-BK-10 | BK-T25 |
| 400 | `INVALID_TIME` | Vi phạm REQ-BK-01; `details.reason` ∈ `MISSING_TIMEZONE`, `NOT_ALIGNED` (không phải giờ tròn theo giờ VN), `END_BEFORE_START`, `TOO_LONG`, `IN_PAST`, `BEYOND_HORIZON` | REQ-BK-01, REQ-BK-11 | BK-T02..T06, BK-T24, BK-T33, BK-T35 |
| 400 | `INVALID_USERNAME` | Duyệt user có username không hợp lệ | REQ-US-05 | US-T10 |
| 400 | `INVALID_SSH_KEY` | SSH public key sai định dạng | REQ-US-13 | US-T28 |
| 401 | `UNAUTHENTICATED` | Không có hoặc hết phiên đăng nhập | REQ-US-14 | US-T27 |
| 401 | `INVALID_TOKEN` | ID token sai chữ ký, sai `aud`, hết hạn | REQ-US-01 | US-T06 |
| 403 | `EMAIL_NOT_VERIFIED` | `email_verified ≠ true` | REQ-US-02 | US-T05 |
| 403 | `DOMAIN_NOT_ALLOWED` | Sai tên miền hoặc sai claim `hd` | REQ-US-03 | US-T02, T03, T04, T07 |
| 403 | `ACCOUNT_PENDING` | Tài khoản chưa duyệt gọi API cần `active` | REQ-US-06 | US-T11 |
| 403 | `ACCOUNT_LOCKED` | Tài khoản bị khóa đăng nhập hoặc gọi API | REQ-US-15 | US-T25 |
| 403 | `ACCOUNT_REJECTED` | Tài khoản bị từ chối đăng nhập hoặc gọi API | REQ-US-17 | US-T32 |
| 403 | `FORBIDDEN` | User thường gọi API admin; thao tác trên ca người khác | REQ-US-14, REQ-BK-07 | US-T24, BK-T21 |
| 404 | `NOT_FOUND` | Tài nguyên không tồn tại; mật khẩu đã được xác nhận lưu | REQ-BK-07, REQ-US-10 | BK-T27, US-T18 |
| 409 | `SLOT_FULL` | Vi phạm giới hạn 2 phiên | REQ-BK-02 | BK-T10, BK-T12 |
| 409 | `GPU_BUSY` | Chồng lên ca GPU khác | REQ-BK-03 | BK-T09, BK-T29 |
| 409 | `GPU_QUOTA_EXCEEDED` | Vượt hạn mức giờ GPU tuần | REQ-BK-05 | BK-T16 |
| 409 | `USER_OVERLAP` | User đã có ca chồng thời gian | REQ-BK-04 | BK-T14 |
| 409 | `USER_LIMIT_REACHED` | Duyệt khi đã đủ `MAX_USERS` | REQ-US-08 | US-T14 |
| 409 | `INVALID_STATE` | Thao tác không hợp lệ với trạng thái ca | REQ-BK-08, REQ-SC-07 | BK-T26, SC-T11 |
| 500 | `PROVISIONING_FAILED` | Lỗi khi cấp phát tài khoản, đã rollback | REQ-US-07 | US-T15 |

Thứ tự kiểm tra khi đặt ca: `VALIDATION_ERROR` → `INVALID_TIME` → `USER_OVERLAP` → `GPU_BUSY` → `SLOT_FULL` → `GPU_QUOTA_EXCEEDED`.

## Cấu hình công khai

`GET /config` (không cần đăng nhập) — Dashboard đọc trước khi có phiên:
```json
{ "google_client_id": "…apps.googleusercontent.com", "ssh_host": "gpu.vimaru.edu.vn", "dashboard_url": "https://gpu.vimaru.edu.vn",
  "timezone": "Asia/Ho_Chi_Minh", "slot_max_hours": 8, "booking_horizon_days": 7, "max_concurrent_sessions": 2 }
```

## Xác thực — REQ-US-01..06

### `POST /auth/google`
Request: `{ "id_token": "<Google ID token>" }`

Response `200`, set cookie `sid`:
```json
{ "user": { "id": 7, "email": "vietnh@vimaru.edu.vn", "name": "Nguyễn Hữu Việt",
            "avatar_url": "https://…", "username": "vietnh", "role": "user", "status": "pending" } }
```
Lỗi: `401 INVALID_TOKEN`, `403 EMAIL_NOT_VERIFIED`, `403 DOMAIN_NOT_ALLOWED`, `403 ACCOUNT_LOCKED`, `403 ACCOUNT_REJECTED`.
Tài khoản `pending` vẫn đăng nhập được (để thấy màn hình chờ duyệt) nhưng các API khác trả `403 ACCOUNT_PENDING`.

### `POST /auth/logout` → `204`

## Tài khoản của tôi — REQ-US-10..13, REQ-UI-05, REQ-UI-12

### `GET /me`
```json
{ "id": 7, "email": "vietnh@vimaru.edu.vn", "name": "Nguyễn Hữu Việt", "avatar_url": "https://…",
  "username": "vietnh", "status": "active", "role": "user", "uid": 2001,
  "storage": { "used_bytes": 12884901888, "soft_bytes": 85899345920, "hard_bytes": 107374182400,
               "over_soft_since": null, "grace_deadline": null, "checked_at": "2026-10-05T09:15:00+07:00" },
  "gpu_quota": { "week_start": "2026-10-05T00:00:00+07:00", "limit_hours": 10, "used_hours": 4, "remaining_hours": 6 } }
```
`gpu_quota`: giờ GPU đã dùng + đã đặt trong tuần hiện tại (Thứ Hai 00:00 giờ VN), tính như REQ-BK-05 — dùng cho "Hạn mức GPU: 4/10 giờ" (REQ-UI-12).

### `GET /me/password` — REQ-US-10
- Có mật khẩu chưa xác nhận: `200 { "password": "…16 ký tự…" }`, header `Cache-Control: no-store`.
- Đã xác nhận hoặc không có: `404 NOT_FOUND`.

### `POST /me/password/ack` → `204`. Xóa bản mã hóa tạm; sau đó `GET /me/password` trả `404`.

### `POST /me/password/reset` — REQ-US-12
`200 { "password": "…" }`, `Cache-Control: no-store`. Mật khẩu cũ hết hiệu lực ngay; mật khẩu mới phải đổi ở lần SSH đầu.

### `GET /me/ssh-keys` · `POST /me/ssh-keys { "name": "Laptop Macbook Pro", "public_key": "ssh-ed25519 AAAA… comment" }` → `201` · `DELETE /me/ssh-keys/:id` → `204`
Mỗi key: `{ id, name, public_key, fingerprint, created_at }`. `name` ≤ 60 ký tự, bỏ trống thì lấy chú thích cuối key (REQ-US-13).
Lỗi: `400 INVALID_SSH_KEY`. Key cũng dùng cho SSH thẳng vào container (REQ-CT-11), có hiệu lực ngay cả với ca đang chạy.

## Đặt lịch — REQ-BK-01..10

### `GET /calendar?from=…&to=…` — REQ-UI-02
`from`, `to` có múi giờ, hoặc dạng ngày `2026-10-05` (00:00 giờ VN của ngày đó); tối đa 8 ngày. Trả các **ca hiệu lực** giao với khoảng đó, của mọi người (REQ-UI-02: ai đang dùng, ca nào dùng GPU), sắp theo giờ bắt đầu:
```json
[ { "id": 42, "start": "2026-10-05T08:00:00+07:00", "end": "2026-10-05T10:00:00+07:00", "username": "vietnh", "use_gpu": true, "mine": true },
  { "id": 43, "start": "2026-10-05T09:00:00+07:00", "end": "2026-10-05T12:00:00+07:00", "username": "hoanglm", "use_gpu": false, "mine": false } ]
```
Mỗi ca có thêm `status`. Trả ca hiệu lực và ca `completed` (xem lại các tuần trước); không trả `cancelled`, `failed`. `from` sớm hơn hôm nay quá 28 ngày hoặc khoảng > 8 ngày → `400 VALIDATION_ERROR` (REQ-BK-14). Client tự tính khung nào đã đủ 2 phiên.

### `POST /bookings/check` — REQ-BK-13, REQ-UI-14
Cùng body với `POST /bookings`; **không tạo ca**. `200`:
```json
{ "ok": false,
  "checks": [ { "rule": "TIME", "ok": true },
              { "rule": "USER_OVERLAP", "ok": true },
              { "rule": "CAPACITY", "ok": false, "code": "GPU_BUSY" },
              { "rule": "GPU_QUOTA", "ok": true } ] }
```
`TIME` sai → `{ "ok": false, "code": "INVALID_TIME", "reason": "IN_PAST" }` và các quy tắc còn lại `ok: null` (chưa kiểm được). `CAPACITY` trả `GPU_BUSY` hoặc `SLOT_FULL` theo thứ tự ưu tiên như đặt ca. Body sai kiểu → `400 VALIDATION_ERROR`.

### `POST /bookings`
```json
{ "start": "2026-10-05T09:00:00+07:00", "end": "2026-10-05T11:00:00+07:00", "use_gpu": true }
```
`201` → đối tượng ca (dưới). Lỗi: xem bảng mã lỗi. Trường thừa (vd `image`, `ports`) bị bỏ qua.

### Đối tượng ca
```json
{ "id": 42, "user": "vietnh", "start": "…", "end": "…", "use_gpu": true,
  "status": "scheduled", "container_name": "vmu-bk-42", "exit_reason": null,
  "gpu_hours_used": 0, "created_at": "…" }
```
`exit_reason` ∈ `null`, `OOM`, `EXITED`, `ERROR` (REQ-MN-04).

### `GET /bookings?from=…&to=…` · `GET /bookings/:id`
Trả các ca của chính user; admin thêm `?all=1` để xem tất cả. Xem ca của người khác (không phải admin) → `403 FORBIDDEN`.

### `POST /bookings/:id/cancel` — chỉ khi `scheduled` → `200`, trạng thái `cancelled`.
### `POST /bookings/:id/end` — chỉ khi `running` hoặc `exited` → `202`, trạng thái `stopping`; Scheduler dừng container rồi chuyển `completed`.
### `POST /bookings/:id/restart` — chỉ khi `exited` và `now < end` → `202`, trạng thái `starting`; Scheduler tạo lại container với cấu hình cũ (REQ-SC-07).

Ba API trên kiểm tra theo thứ tự: `404 NOT_FOUND` → `403 FORBIDDEN` (không phải chủ ca hoặc admin) → `409 INVALID_STATE`.

## Giám sát — REQ-MN-01..04, REQ-UI-13

- `GET /bookings/:id/metrics` → `{ "cpu_percent": 312.5, "cpus": 15, "mem_bytes": …, "mem_limit_bytes": …, "gpu": { "util_percent": 97, "mem_used_bytes": …, "mem_total_bytes": … } | null, "sampled_at": "…" }`. Đọc trực tiếp khi gọi (`docker stats`, `nvidia-smi`); `gpu` chỉ có với ca `use_gpu`. Ca không `running` → `409 INVALID_STATE`.
- `GET /bookings/:id/logs?tail=1000` → `text/plain`: log đã lưu của các lần chạy trước + log trực tiếp nếu container còn. Xem được trong `LOG_RETENTION` sau khi ca kết thúc; không có log → `404 NOT_FOUND`.
- Cả hai: chỉ chủ ca hoặc admin (`403 FORBIDDEN`).
### Thông báo — REQ-SC-02, REQ-SC-06, REQ-MN-04, REQ-ST-02

`GET /notifications?unread=1&limit=50` — thông báo của chính user, mới nhất trước (`limit` mặc định 50, tối đa 200):
```json
{ "unread_count": 2,
  "items": [ { "id": 9, "kind": "END_WARNING", "booking_id": 42,
               "message": "Ca của bạn kết thúc lúc 11:00 (GMT+7). Hãy lưu checkpoint.",
               "created_at": "2026-10-05T10:45:00+07:00", "read_at": null } ] }
```
`kind` ∈ `END_WARNING`, `START_FAILED`, `OOM`, `SOFT_QUOTA`.

- `POST /notifications/:id/read` → `204`. Thông báo không tồn tại hoặc của người khác → `404 NOT_FOUND`.
- `POST /notifications/read-all` → `204`.

## Admin — REQ-US-07, REQ-US-08, REQ-US-14..16, REQ-MN-03

Tất cả trả `403 FORBIDDEN` với vai trò `user`. Kết quả thao tác trên một user có dạng `{ "user": { …như GET /me… } }`; đối tượng user có thêm `created_at` (lần đăng nhập đầu).

**Admin đầu tiên:** người đó đăng nhập Dashboard một lần (tài khoản `pending`), rồi trên server chạy `node backend/src/cli.js promote-admin <email>`. Vai trò `admin` được gọi API admin kể cả khi đang `pending`, nên admin tự duyệt được chính mình.

Tài khoản bị khóa hoặc đã xóa: phiên cũ vẫn tồn tại nhưng mọi request trả `403 ACCOUNT_LOCKED`.

| Endpoint | Kết quả | Lỗi |
|---|---|---|
| `GET /admin/users?status=pending` | danh sách user | |
| `POST /admin/users/:id/approve` | `200`, user `active` (từ `pending` hoặc `rejected`) | `400 INVALID_USERNAME`, `409 USER_LIMIT_REACHED`, `409 INVALID_STATE`, `500 PROVISIONING_FAILED` |
| `POST /admin/users/:id/reject` | `200`, user `rejected` (REQ-US-17) | `409 INVALID_STATE` |
| `POST /admin/users/:id/password-reset` | `200`, **không** trả mật khẩu; user thấy mật khẩu mới ở lần mở Dashboard kế tiếp (REQ-US-18) | `409 INVALID_STATE` |
| `POST /admin/users/:id/lock` | `200`, user `locked` | `409 INVALID_STATE` |
| `POST /admin/users/:id/unlock` | `200`, user `active` | `409 INVALID_STATE` |
| `DELETE /admin/users/:id` | `200`, user `deleted` | |
| `GET /admin/audit?user=…&action=…&from=…&to=…` | 1000 dòng mới nhất: `{ id, actor (username hoặc "system"), action, target, details, created_at }`. `user`: người thực hiện hoặc chủ đối tượng; `action`: đúng tên (vd `booking.oom`) hoặc tiền tố (`booking.`) (REQ-MN-03) | |

## Gate Bước 2

- [x] Mọi `REQ-…` trong spec đều xuất hiện trong docs — kiểm bằng [traceability.md](../traceability.md)
- [x] Mọi mã lỗi đều được liệt kê kèm điều kiện xảy ra
