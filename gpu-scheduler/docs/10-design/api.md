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
| 400 | `IMAGE_NOT_ALLOWED` | `image` không thuộc danh sách cho phép | REQ-BK-10, REQ-CT-06 | BK-T31 |
| 400 | `PORT_NOT_ALLOWED` | Có cổng ngoài dải của user | REQ-BK-10, REQ-CT-05 | BK-T32 |
| 400 | `INVALID_USERNAME` | Duyệt user có username không hợp lệ | REQ-US-05 | US-T10 |
| 400 | `INVALID_SSH_KEY` | SSH public key sai định dạng | REQ-US-13 | US-T28 |
| 401 | `UNAUTHENTICATED` | Không có hoặc hết phiên đăng nhập | REQ-US-14 | US-T27 |
| 401 | `INVALID_TOKEN` | ID token sai chữ ký, sai `aud`, hết hạn | REQ-US-01 | US-T06 |
| 403 | `EMAIL_NOT_VERIFIED` | `email_verified ≠ true` | REQ-US-02 | US-T05 |
| 403 | `DOMAIN_NOT_ALLOWED` | Sai tên miền hoặc sai claim `hd` | REQ-US-03 | US-T02, T03, T04, T07 |
| 403 | `ACCOUNT_PENDING` | Tài khoản chưa duyệt gọi API cần `active` | REQ-US-06 | US-T11 |
| 403 | `ACCOUNT_LOCKED` | Tài khoản bị khóa đăng nhập hoặc gọi API | REQ-US-15 | US-T25 |
| 403 | `FORBIDDEN` | User thường gọi API admin; thao tác trên ca người khác | REQ-US-14, REQ-BK-07 | US-T24, BK-T21 |
| 404 | `NOT_FOUND` | Tài nguyên không tồn tại; mật khẩu đã được xác nhận lưu | REQ-BK-07, REQ-US-10 | BK-T27, US-T18 |
| 409 | `SLOT_FULL` | Vi phạm giới hạn 2 phiên | REQ-BK-02 | BK-T10, BK-T12 |
| 409 | `GPU_BUSY` | Chồng lên ca GPU khác | REQ-BK-03 | BK-T09, BK-T29 |
| 409 | `GPU_QUOTA_EXCEEDED` | Vượt hạn mức giờ GPU tuần | REQ-BK-05 | BK-T16 |
| 409 | `USER_OVERLAP` | User đã có ca chồng thời gian | REQ-BK-04 | BK-T14 |
| 409 | `USER_LIMIT_REACHED` | Duyệt khi đã đủ `MAX_USERS` | REQ-US-08 | US-T14 |
| 409 | `INVALID_STATE` | Thao tác không hợp lệ với trạng thái ca | REQ-BK-08, REQ-SC-07 | BK-T26, SC-T11 |
| 500 | `PROVISIONING_FAILED` | Lỗi khi cấp phát tài khoản, đã rollback | REQ-US-07 | US-T15 |

Thứ tự kiểm tra khi đặt ca: `VALIDATION_ERROR` → `INVALID_TIME` → `IMAGE_NOT_ALLOWED` → `PORT_NOT_ALLOWED` → `USER_OVERLAP` → `GPU_BUSY` → `SLOT_FULL` → `GPU_QUOTA_EXCEEDED`.

## Xác thực — REQ-US-01..06

### `POST /auth/google`
Request: `{ "id_token": "<Google ID token>" }`

Response `200`, set cookie `sid`:
```json
{ "user": { "id": 7, "email": "vietnh@vimaru.edu.vn", "name": "Nguyễn Hữu Việt",
            "avatar_url": "https://…", "username": "vietnh", "role": "user", "status": "pending" } }
```
Lỗi: `401 INVALID_TOKEN`, `403 EMAIL_NOT_VERIFIED`, `403 DOMAIN_NOT_ALLOWED`, `403 ACCOUNT_LOCKED`.
Tài khoản `pending` vẫn đăng nhập được (để thấy màn hình chờ duyệt) nhưng các API khác trả `403 ACCOUNT_PENDING`.

### `POST /auth/logout` → `204`

## Tài khoản của tôi — REQ-US-09..13, REQ-UI-04, REQ-UI-05

### `GET /me`
```json
{ "id": 7, "email": "vietnh@vimaru.edu.vn", "name": "Nguyễn Hữu Việt", "avatar_url": "https://…",
  "username": "vietnh", "status": "active", "role": "user", "uid": 2001,
  "ports": { "from": 10000, "to": 10099 },
  "storage": { "used_bytes": 12884901888, "soft_bytes": 85899345920, "hard_bytes": 107374182400,
               "over_soft_since": null, "grace_deadline": null },
  "gpu_quota": { "week_start": "2026-09-28T00:00:00+07:00", "limit_hours": 10, "used_hours": 3.5, "remaining_hours": 6.5 } }
```

### `GET /me/password` — REQ-US-10
- Có mật khẩu chưa xác nhận: `200 { "password": "…16 ký tự…" }`, header `Cache-Control: no-store`.
- Đã xác nhận hoặc không có: `404 NOT_FOUND`.

### `POST /me/password/ack` → `204`. Xóa bản mã hóa tạm; sau đó `GET /me/password` trả `404`.

### `POST /me/password/reset` — REQ-US-12
`200 { "password": "…" }`, `Cache-Control: no-store`. Mật khẩu cũ hết hiệu lực ngay; mật khẩu mới phải đổi ở lần SSH đầu.

### `GET /me/ssh-keys` · `POST /me/ssh-keys { "public_key": "ssh-ed25519 AAAA… comment" }` → `201` · `DELETE /me/ssh-keys/:id` → `204`
Lỗi: `400 INVALID_SSH_KEY`.

## Đặt lịch — REQ-BK-01..10

### `GET /images` → `200 [{ "name": "vmu/pytorch:2.8-cuda12.8" }, …]`

### `GET /calendar?from=…&to=…` — REQ-UI-02
`from`, `to` có múi giờ, hoặc dạng ngày `2026-10-05` (00:00 giờ VN của ngày đó). Trả các khoảng thời gian liên tiếp có số phiên không đổi, mốc luôn là giờ tròn:
```json
[ { "start": "…T08:00+07:00", "end": "…T09:00+07:00", "sessions": 1, "gpu_taken": true } ]
```

### `POST /bookings`
```json
{ "start": "2026-10-05T09:00:00+07:00", "end": "2026-10-05T11:00:00+07:00",
  "use_gpu": true, "image": "vmu/pytorch:2.8-cuda12.8", "ports": [10001, 10006] }
```
`201` → đối tượng ca (dưới). Lỗi: xem bảng mã lỗi.

### Đối tượng ca
```json
{ "id": 42, "user": "vietnh", "start": "…", "end": "…", "use_gpu": true, "image": "…", "ports": [10001],
  "status": "scheduled", "container_name": "vmu-bk-42", "exit_reason": null,
  "gpu_hours_used": 0, "created_at": "…" }
```
`exit_reason` ∈ `null`, `OOM`, `EXITED`, `ERROR` (REQ-MN-04).

### `GET /bookings?mine=1&from=…&to=…` · `GET /bookings/:id`

### `POST /bookings/:id/cancel` — chỉ khi `scheduled` → `200`, trạng thái `cancelled`.
### `POST /bookings/:id/end` — chỉ khi `running` hoặc `exited` → `202`, trạng thái `stopping` rồi `completed`.
### `POST /bookings/:id/restart` — chỉ khi `exited` và `now < end` → `202` (REQ-SC-07).

Ba API trên: `403 FORBIDDEN` nếu không phải chủ ca hoặc admin, `404 NOT_FOUND`, `409 INVALID_STATE`.

## Giám sát — REQ-MN-01..04

- `GET /bookings/:id/metrics` → `{ "cpu_percent": 312.5, "mem_bytes": …, "mem_limit_bytes": …, "gpu": { "util_percent": 97, "mem_used_bytes": … } | null, "sampled_at": "…" }`
- `GET /bookings/:id/logs?tail=1000` → `text/plain`. Xem được trong `LOG_RETENTION` sau khi ca kết thúc.
- `GET /notifications` → danh sách thông báo (cảnh báo hết ca, lỗi khởi chạy, OOM, soft quota).

## Admin — REQ-US-07, REQ-US-08, REQ-US-14..16, REQ-MN-03

Tất cả trả `403 FORBIDDEN` với vai trò `user`. Kết quả thao tác trên một user có dạng `{ "user": { …như GET /me… } }`.

**Admin đầu tiên:** người đó đăng nhập Dashboard một lần (tài khoản `pending`), rồi trên server chạy `node backend/src/cli.js promote-admin <email>`. Vai trò `admin` được gọi API admin kể cả khi đang `pending`, nên admin tự duyệt được chính mình.

Tài khoản bị khóa hoặc đã xóa: phiên cũ vẫn tồn tại nhưng mọi request trả `403 ACCOUNT_LOCKED`.

| Endpoint | Kết quả | Lỗi |
|---|---|---|
| `GET /admin/users?status=pending` | danh sách user | |
| `POST /admin/users/:id/approve` | `200`, user `active` | `400 INVALID_USERNAME`, `409 USER_LIMIT_REACHED`, `409 INVALID_STATE`, `500 PROVISIONING_FAILED` |
| `POST /admin/users/:id/lock` | `200`, user `locked` | `409 INVALID_STATE` |
| `POST /admin/users/:id/unlock` | `200`, user `active` | `409 INVALID_STATE` |
| `DELETE /admin/users/:id` | `200`, user `deleted` | |
| `GET /admin/images` · `PUT /admin/images` | danh sách image cho phép | |
| `GET /admin/audit?from=…&to=…` | audit log | |

## Gate Bước 2

- [x] Mọi `REQ-…` trong spec đều xuất hiện trong docs — kiểm bằng [traceability.md](../traceability.md)
- [x] Mọi mã lỗi đều được liệt kê kèm điều kiện xảy ra
