// M3 — Scheduler: docs/10-design/scheduler.md. REQ-SC-01..08, REQ-MN-04.
// env = { db, docker, clock, cfg?, host? }. Mọi so sánh thời gian dùng thời điểm tuyệt đối (REQ-SC-08).
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DateTime } = require('luxon');
const { defaults } = require('../config');
const { portRange } = require('../users/ports');
const { buildRunArgs } = require('../container/run-args');

const SCHEDULER_LOCK = 3001; // khóa advisory mức phiên: chỉ một tick chạy tại một thời điểm — REQ-SC-04
const LIVE = ['starting', 'running', 'exited', 'stopping'];

const containerName = (id) => `vmu-bk-${id}`;

function resolve(env) {
  return {
    db: env.db,
    docker: env.docker,
    clock: env.clock,
    cfg: env.cfg || defaults,
    host: env.host || { cpuThreads: os.availableParallelism() },
  };
}

async function appendLog(cfg, bookingId, text) {
  if (!text) return;
  await fs.mkdir(cfg.logDir, { recursive: true });
  await fs.appendFile(path.join(cfg.logDir, `${bookingId}.log`), text.endsWith('\n') ? text : `${text}\n`);
}

async function notify(db, userId, bookingId, kind, message) {
  await db.query('INSERT INTO notifications (user_id, booking_id, kind, message) VALUES ($1, $2, $3, $4)', [userId, bookingId, kind, message]);
}

// Lưu log rồi xóa container cũ (nếu có)
async function saveAndRemove(e, bookingId) {
  const name = containerName(bookingId);
  const state = await e.docker.inspect(name);
  if (!state) return;
  if (state.running) await e.docker.stop(name, e.cfg.stopTimeoutSec);
  await appendLog(e.cfg, bookingId, await e.docker.logs(name));
  await e.docker.rm(name);
}

// --- Các bước của một tick ---

// Scheduler tắt suốt thời gian của ca → failed — SC-T12
async function failMissed(e, now) {
  const { rows } = await e.db.query(
    `UPDATE bookings SET status = 'failed' WHERE status = 'scheduled' AND end_at <= $1 RETURNING id`, [now]);
  for (const r of rows) await appendLog(e.cfg, r.id, `[${now.toISOString()}] Scheduler không chạy trong thời gian ca, không khởi chạy được`);
}

async function startOne(e, booking, now) {
  const name = containerName(booking.id);
  try {
    const user = (await e.db.query('SELECT username, linux_uid, slot_index FROM users WHERE id = $1', [booking.user_id])).rows[0];
    const images = (await e.db.query('SELECT name FROM images WHERE enabled')).rows.map((r) => r.name);
    const args = buildRunArgs({
      booking,
      user: { username: user.username, uid: user.linux_uid },
      ports: portRange(user.slot_index, e.cfg),
      allowedImages: images,
      cpuThreads: e.host.cpuThreads,
    }, e.cfg);

    const state = await e.docker.inspect(name);
    if (!state?.running) {
      if (state) await saveAndRemove(e, booking.id); // container cũ đã thoát (restart)
      await e.docker.run(args);
    }
    await e.db.query(
      `UPDATE bookings SET status = 'running', exit_reason = NULL, actual_start_at = coalesce(actual_start_at, $2)
       WHERE id = $1 AND status = 'starting'`, [booking.id, now]);
    await e.db.query('UPDATE images SET last_used_at = $2 WHERE name = $1', [booking.image, now]);
  } catch (err) {
    await appendLog(e.cfg, booking.id, `[${now.toISOString()}] Lỗi khởi chạy container: ${err.message}`);
    const { rowCount } = await e.db.query(
      `UPDATE bookings SET status = 'failed', exit_reason = 'ERROR' WHERE id = $1 AND status = 'starting'`, [booking.id]);
    if (rowCount) await notify(e.db, booking.user_id, booking.id, 'START_FAILED', `Không khởi chạy được ca #${booking.id}: ${err.message}`);
  }
}

// Ca đến giờ → starting → running — REQ-SC-01; ca starting (restart, reconcile) cũng được chạy
async function startDue(e, now) {
  await e.db.query(
    `UPDATE bookings SET status = 'starting' WHERE status = 'scheduled' AND start_at <= $1 AND end_at > $1`, [now]);
  const { rows } = await e.db.query(
    `SELECT * FROM bookings WHERE status = 'starting' AND end_at > $1 ORDER BY start_at`, [now]);
  for (const b of rows) await startOne(e, b, now);
}

// Container tự thoát → exited, không tự khởi động lại — REQ-SC-07, REQ-MN-04
async function syncExited(e) {
  const { rows } = await e.db.query(`SELECT * FROM bookings WHERE status = 'running'`);
  for (const b of rows) {
    const state = await e.docker.inspect(containerName(b.id));
    if (state?.running) continue;
    const reason = state?.oomKilled ? 'OOM' : 'EXITED';
    const { rowCount } = await e.db.query(
      `UPDATE bookings SET status = 'exited', exit_reason = $2 WHERE id = $1 AND status = 'running'`, [b.id, reason]);
    if (rowCount && reason === 'OOM') {
      await notify(e.db, b.user_id, b.id, 'OOM', `Ca #${b.id}: tiến trình vượt giới hạn RAM và bị dừng (OOM)`);
    }
  }
}

// Cảnh báo đúng một lần trước khi hết ca — REQ-SC-02
async function warnEnding(e, now) {
  const { rows } = await e.db.query(
    `SELECT * FROM bookings WHERE status = 'running' AND warned_at IS NULL
       AND end_at - make_interval(secs => $2) <= $1 AND end_at > $1`,
    [now, e.cfg.endWarningMs / 1000]);
  for (const b of rows) {
    const { rowCount } = await e.db.query(
      'UPDATE bookings SET warned_at = $2 WHERE id = $1 AND warned_at IS NULL', [b.id, now]);
    if (!rowCount) continue;
    const end = DateTime.fromJSDate(b.end_at, { zone: e.cfg.timezone });
    const msg = `Ca của bạn kết thúc lúc ${end.toFormat('HH:mm')} (GMT${end.toFormat('Z')}). Hãy lưu checkpoint.`;
    await notify(e.db, b.user_id, b.id, 'END_WARNING', msg);
    try {
      await e.docker.exec(containerName(b.id), ['sh', '-c', `echo "[VMU] ${msg}" > /proc/1/fd/1`]);
    } catch { /* image không có sh: vẫn còn thông báo trên Dashboard */ }
  }
}

// Hết ca / kết thúc sớm / user bị khóa → stopping → completed — REQ-SC-03
async function stopDue(e, now) {
  await e.db.query(
    `UPDATE bookings SET status = 'stopping' WHERE status IN ('starting', 'running', 'exited') AND end_at <= $1`, [now]);
  const { rows } = await e.db.query(`SELECT * FROM bookings WHERE status = 'stopping'`);
  for (const b of rows) {
    await saveAndRemove(e, b.id);
    await e.db.query(
      `UPDATE bookings SET status = 'completed',
         actual_end_at = CASE WHEN actual_start_at IS NULL THEN NULL ELSE coalesce(actual_end_at, $2) END
       WHERE id = $1 AND status = 'stopping'`, [b.id, now]);
  }
}

async function withLock(db, fn) {
  const client = await db.connect();
  let locked = false;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock($1) AS ok', [SCHEDULER_LOCK])).rows[0].ok;
    if (!locked) return { skipped: true };
    await fn();
    return { skipped: false };
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [SCHEDULER_LOCK]);
    client.release();
  }
}

async function tickSteps(e) {
  const now = e.clock.now();
  await failMissed(e, now);
  await startDue(e, now);
  await syncExited(e);
  await warnEnding(e, now);
  await stopDue(e, now);
}

async function runTick(env) {
  const e = resolve(env);
  return withLock(e.db, () => tickSteps(e));
}

// Khi Scheduler khởi động — REQ-SC-05
async function reconcile(env) {
  const e = resolve(env);
  return withLock(e.db, async () => {
    const now = e.clock.now();
    const managed = await e.docker.listManaged();
    const ids = managed.map((c) => c.bookingId).filter(Number.isFinite);
    const { rows } = await e.db.query('SELECT id, status FROM bookings WHERE id = ANY($1::bigint[])', [ids]);
    const status = new Map(rows.map((r) => [r.id, r.status]));
    for (const c of managed) {
      if (LIVE.includes(status.get(c.bookingId))) continue; // tick xử lý tiếp (kể cả ca đã hết giờ)
      if (status.has(c.bookingId)) {
        await saveAndRemove(e, c.bookingId);
      } else {
        if (c.running) await e.docker.stop(c.name, e.cfg.stopTimeoutSec);
        await e.docker.rm(c.name);
      }
    }
    // Ca đang diễn ra mà mất container → chạy lại
    const names = new Set(managed.map((c) => c.name));
    const { rows: live } = await e.db.query(
      `SELECT id FROM bookings WHERE status IN ('starting', 'running') AND start_at <= $1 AND end_at > $1`, [now]);
    for (const b of live) {
      if (!names.has(containerName(b.id))) await e.db.query(`UPDATE bookings SET status = 'starting' WHERE id = $1`, [b.id]);
    }
    await tickSteps(e);
  });
}

module.exports = { runTick, reconcile };
