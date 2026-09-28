-- docs/10-design/database.md
CREATE TYPE user_status    AS ENUM ('pending', 'active', 'locked', 'deleted');
CREATE TYPE user_role      AS ENUM ('user', 'admin');
CREATE TYPE booking_status AS ENUM ('scheduled', 'starting', 'running', 'exited',
                                    'stopping', 'completed', 'cancelled', 'failed');

CREATE TABLE users (
  id                   bigserial PRIMARY KEY,
  google_sub           text UNIQUE NOT NULL,
  email                text UNIQUE NOT NULL,
  name                 text NOT NULL,
  avatar_url           text,
  username             text UNIQUE NOT NULL,
  role                 user_role   NOT NULL DEFAULT 'user',
  status               user_status NOT NULL DEFAULT 'pending',
  linux_uid            integer UNIQUE,
  pending_password_enc bytea,
  storage_used_bytes   bigint,        -- REQ-ST-05: lần đọc xfs_quota gần nhất
  storage_soft_bytes   bigint,
  storage_hard_bytes   bigint,
  storage_checked_at   timestamptz,
  over_soft_since      timestamptz,   -- REQ-ST-02
  approved_at          timestamptz,
  deleted_at           timestamptz,
  purge_after          timestamptz,
  purged_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id_hash    text PRIMARY KEY,                -- sha256 của token trong cookie sid
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ssh_keys (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key  text NOT NULL,
  fingerprint text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fingerprint)
);

CREATE TABLE bookings (
  id              bigserial PRIMARY KEY,
  user_id         bigint NOT NULL REFERENCES users(id),
  start_at        timestamptz NOT NULL,
  end_at          timestamptz NOT NULL CHECK (end_at > start_at),
  use_gpu         boolean NOT NULL,
  status          booking_status NOT NULL DEFAULT 'scheduled',
  exit_reason     text,
  actual_start_at timestamptz,
  actual_end_at   timestamptz,
  warned_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookings_whole_hour CHECK (
    date_trunc('hour', start_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = start_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
    AND date_trunc('hour', end_at AT TIME ZONE 'Asia/Ho_Chi_Minh') = end_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
);
CREATE INDEX bookings_active_range ON bookings (start_at, end_at)
  WHERE status IN ('scheduled', 'starting', 'running', 'exited', 'stopping');

CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id),
  booking_id bigint REFERENCES bookings(id),
  kind       text NOT NULL,
  message    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  actor_id   bigint REFERENCES users(id),
  action     text NOT NULL,
  target     text NOT NULL,
  details    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
