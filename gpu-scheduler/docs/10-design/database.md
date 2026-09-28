# Lược đồ CSDL (PostgreSQL)

Thời gian lưu dạng `timestamptz`; server PostgreSQL đặt `timezone = 'UTC'` (REQ-DP-06). Khoảng thời gian của ca là nửa mở `[start_at, end_at)`. Quy tắc múi giờ: xem [time.md](time.md).

```sql
CREATE TYPE user_status    AS ENUM ('pending', 'active', 'locked', 'deleted');
CREATE TYPE user_role      AS ENUM ('user', 'admin');
CREATE TYPE booking_status AS ENUM ('scheduled', 'starting', 'running', 'exited',
                                    'stopping', 'completed', 'cancelled', 'failed');

CREATE TABLE users (
  id              bigserial PRIMARY KEY,
  google_sub      text UNIQUE NOT NULL,              -- claim "sub", không đổi
  email           text UNIQUE NOT NULL,
  name            text NOT NULL,
  avatar_url      text,
  username        text UNIQUE NOT NULL,              -- REQ-US-05
  role            user_role   NOT NULL DEFAULT 'user',
  status          user_status NOT NULL DEFAULT 'pending',
  linux_uid       integer UNIQUE,                    -- NULL khi pending
  pending_password_enc bytea,                        -- REQ-US-10: mã hóa AES-GCM, xóa khi ack
  storage_used_bytes bigint,                         -- REQ-ST-05: lần đọc xfs_quota gần nhất
  storage_soft_bytes bigint,
  storage_hard_bytes bigint,
  storage_checked_at timestamptz,
  over_soft_since timestamptz,                       -- REQ-ST-02
  approved_at     timestamptz,
  deleted_at      timestamptz,                       -- REQ-US-16
  purge_after     timestamptz,
  purged_at       timestamptz,                       -- đã xóa hẳn; giữ dòng để UID không bị tái sử dụng
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id_hash    text PRIMARY KEY,                       -- sha256 của token trong cookie sid, không lưu token gốc
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,                   -- now + SESSION_TTL
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ssh_keys (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id),
  public_key  text NOT NULL,
  fingerprint text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint)
);

CREATE TABLE bookings (
  id             bigserial PRIMARY KEY,
  user_id        bigint NOT NULL REFERENCES users(id),
  start_at       timestamptz NOT NULL,
  end_at         timestamptz NOT NULL CHECK (end_at > start_at),
  -- REQ-BK-01, REQ-BK-12: lớp bảo vệ thứ hai, giờ tròn theo giờ Việt Nam
  CONSTRAINT bookings_whole_hour CHECK (
    date_trunc('hour', start_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = start_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
    AND date_trunc('hour', end_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = end_at AT TIME ZONE 'Asia/Ho_Chi_Minh'),
  use_gpu        boolean NOT NULL,
  status         booking_status NOT NULL DEFAULT 'scheduled',
  exit_reason    text,                               -- OOM | EXITED | ERROR
  actual_start_at timestamptz,
  actual_end_at   timestamptz,
  warned_at      timestamptz,                        -- REQ-SC-02: cảnh báo đúng 1 lần
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_active_range ON bookings (start_at, end_at)
  WHERE status IN ('scheduled', 'starting', 'running', 'exited', 'stopping');

CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id),
  booking_id bigint REFERENCES bookings(id),
  kind       text NOT NULL,                          -- END_WARNING | START_FAILED | OOM | SOFT_QUOTA
  message    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);

CREATE TABLE audit_log (                              -- REQ-MN-03
  id         bigserial PRIMARY KEY,
  actor_id   bigint REFERENCES users(id),             -- NULL = hệ thống (Scheduler)
  action     text NOT NULL,                           -- booking.create | booking.cancel | user.approve | …
  target     text NOT NULL,                           -- vd "booking:42", "user:7"
  details    jsonb NOT NULL DEFAULT '{}',             -- KHÔNG BAO GIỜ chứa mật khẩu
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## Khóa khi đặt ca — REQ-BK-06

Mỗi transaction đặt ca, hủy ca hoặc kết thúc sớm đều gọi `SELECT pg_advisory_xact_lock(<hằng số BOOKING_LOCK>)` trước khi đọc các ca hiệu lực. Mọi thay đổi lịch vì vậy được tuần tự hóa; với ~30 user thì chi phí không đáng kể.

## Thuật toán kiểm tra 2 phiên — REQ-BK-02

1. Lấy các ca hiệu lực chồng với `[s, e)`.
2. Tạo danh sách sự kiện: `(start, +1)`, `(end, −1)`; sắp theo thời gian, **`−1` trước `+1`** khi cùng mốc (vì khoảng nửa mở).
3. Quét, giữ bộ đếm; nếu tại một mốc bất kỳ trong `[s, e)` bộ đếm + 1 > `MAX_CONCURRENT_SESSIONS` thì trả `SLOT_FULL`.

Hàm thuần `checkConcurrency(existing, candidate, cfg)` đặt ở `backend/src/booking/conflict.js`, test bằng unit test.

## Giờ GPU theo tuần — REQ-BK-05, REQ-BK-12

Tuần tính theo giờ Việt Nam, **không** dùng `date_trunc('week', start_at)` trực tiếp (sẽ ra tuần UTC):

```sql
-- Mốc đầu tuần (Thứ Hai 00:00 giờ VN) chứa thời điểm $1, trả về timestamptz
SELECT date_trunc('week', $1 AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
```

Giờ GPU của một ca trong tuần `[w, w + 7 ngày)` = độ dài phần giao của ca với khoảng đó. Tính trong backend (`backend/src/time/`), SQL chỉ lọc ca có giao với tuần.
