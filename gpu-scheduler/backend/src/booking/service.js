// M2 — Đặt lịch. ctx = { db, system, clock, cfg }
const { DateTime } = require('luxon');
const { tx } = require('../db');
const { ApiError, err } = require('../errors');
const { toVnIso, weekStartOf, addWeek, parseDateOrInstant } = require('../time');
const { portRange } = require('../users/ports');
const { validateBookingTimes } = require('./rules');
const { findConflict, ACTIVE } = require('./conflict');
const { checkGpuQuota, usedInWeek } = require('./quota');

const BOOKING_LOCK = 2001; // khóa advisory tuần tự hóa mọi thay đổi lịch — REQ-BK-06
const ACTIVE_LIST = [...ACTIVE];
const HOUR = 3600 * 1000;

const CONFLICT_MESSAGES = {
  USER_OVERLAP: 'Bạn đã có một ca khác trong khoảng thời gian này',
  GPU_BUSY: 'Khung giờ này đã có người dùng GPU',
  SLOT_FULL: 'Khung giờ này đã đủ số phiên chạy đồng thời',
  GPU_QUOTA_EXCEEDED: 'Đã hết hạn mức giờ GPU trong tuần',
};
const conflictError = (code) => new ApiError(409, code, CONFLICT_MESSAGES[code]);

const ms = (d) => (d == null ? null : d.getTime());

function toRule(row) {
  return {
    id: row.id,
    userId: row.user_id,
    start: ms(row.start_at),
    end: ms(row.end_at),
    useGpu: row.use_gpu,
    status: row.status,
    actualStart: ms(row.actual_start_at),
    actualEnd: ms(row.actual_end_at),
  };
}

function toApi(row) {
  const used = row.status === 'completed' && row.use_gpu && row.actual_start_at && row.actual_end_at
    ? (ms(row.actual_end_at) - ms(row.actual_start_at)) / HOUR
    : 0;
  return {
    id: row.id,
    user: row.username,
    start: toVnIso(ms(row.start_at)),
    end: toVnIso(ms(row.end_at)),
    use_gpu: row.use_gpu,
    image: row.image,
    ports: row.ports,
    status: row.status,
    container_name: `vmu-bk-${row.id}`,
    exit_reason: row.exit_reason,
    gpu_hours_used: Math.round(used * 100) / 100,
    created_at: toVnIso(ms(row.created_at)),
  };
}

const SELECT_BOOKING = 'SELECT b.*, u.username FROM bookings b JOIN users u ON u.id = b.user_id';

// Các ca GPU của user giao với [from, to) — dùng tính hạn mức
async function userGpuBookings(q, userId, from, to) {
  const { rows } = await q.query(
    `SELECT * FROM bookings WHERE user_id = $1 AND use_gpu
       AND status = ANY($2::booking_status[]) AND start_at < $4 AND end_at > $3`,
    [userId, [...ACTIVE_LIST, 'completed'], new Date(from), new Date(to)],
  );
  return rows.map(toRule);
}

async function createBooking(ctx, user, body) {
  const { cfg } = ctx;
  const now = ctx.clock.now().getTime();
  const { start, end } = validateBookingTimes(body.start, body.end, now, cfg);

  const img = await ctx.db.query('SELECT 1 FROM images WHERE name = $1 AND enabled', [body.image]);
  if (!img.rowCount) throw new ApiError(400, 'IMAGE_NOT_ALLOWED', 'Image không nằm trong danh sách cho phép', { image: body.image });

  const range = portRange(user.slot_index, cfg);
  const ports = [...new Set(body.ports || [])];
  const outside = ports.filter((p) => !range || p < range.from || p > range.to);
  if (outside.length) throw new ApiError(400, 'PORT_NOT_ALLOWED', 'Cổng phải nằm trong dải của bạn', { ports: outside, allowed: range });

  const candidate = { userId: user.id, start, end, useGpu: body.use_gpu };
  return tx(ctx.db, async (q) => {
    await q.query('SELECT pg_advisory_xact_lock($1)', [BOOKING_LOCK]);
    const { rows } = await q.query(
      'SELECT * FROM bookings WHERE status = ANY($1::booking_status[]) AND start_at < $3 AND end_at > $2',
      [ACTIVE_LIST, new Date(start), new Date(end)],
    );
    const conflict = findConflict(rows.map(toRule), candidate, cfg);
    if (conflict) throw conflictError(conflict);

    if (candidate.useGpu) {
      const from = weekStartOf(start, cfg.timezone);
      const to = addWeek(weekStartOf(end - 1, cfg.timezone), cfg.timezone);
      if (checkGpuQuota(await userGpuBookings(q, user.id, from, to), candidate, now, cfg)) throw conflictError('GPU_QUOTA_EXCEEDED');
    }

    const inserted = await q.query(
      `INSERT INTO bookings (user_id, start_at, end_at, use_gpu, image, ports) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user.id, new Date(start), new Date(end), candidate.useGpu, body.image, ports],
    );
    const row = { ...inserted.rows[0], username: user.username };
    await q.query('INSERT INTO audit_log (actor_id, action, target, details) VALUES ($1, $2, $3, $4)',
      [user.id, 'booking.create', `booking:${row.id}`, { start: toVnIso(start), end: toVnIso(end), use_gpu: candidate.useGpu }]);
    return toApi(row);
  });
}

// Đọc ca kèm khóa dòng và kiểm quyền — REQ-BK-07
async function lockOwned(q, user, id) {
  const { rows } = await q.query(`${SELECT_BOOKING} WHERE b.id = $1 FOR UPDATE OF b`, [id]);
  const row = rows[0];
  if (!row) throw err.notFound();
  if (row.user_id !== user.id && user.role !== 'admin') throw err.forbidden();
  return row;
}

// Chuyển trạng thái có kiểm tra — REQ-BK-08, REQ-SC-07
async function transition(ctx, user, id, { from, to, action, extraCheck }) {
  return tx(ctx.db, async (q) => {
    await q.query('SELECT pg_advisory_xact_lock($1)', [BOOKING_LOCK]);
    const row = await lockOwned(q, user, id);
    if (!from.includes(row.status)) throw err.invalidState();
    if (extraCheck) extraCheck(row);
    const updated = await q.query('UPDATE bookings SET status = $2 WHERE id = $1 RETURNING *', [id, to]);
    await q.query('INSERT INTO audit_log (actor_id, action, target, details) VALUES ($1, $2, $3, $4)',
      [user.id, action, `booking:${id}`, { from: row.status, to }]);
    return toApi({ ...updated.rows[0], username: row.username });
  });
}

const cancelBooking = (ctx, user, id) =>
  transition(ctx, user, id, { from: ['scheduled'], to: 'cancelled', action: 'booking.cancel' });

// Scheduler (M3) dừng container rồi chuyển completed
const endBooking = (ctx, user, id) =>
  transition(ctx, user, id, { from: ['running', 'exited'], to: 'stopping', action: 'booking.end' });

// Scheduler (M3) tạo lại container với đúng cấu hình cũ
const restartBooking = (ctx, user, id) =>
  transition(ctx, user, id, {
    from: ['exited'],
    to: 'starting',
    action: 'booking.restart',
    extraCheck: (row) => {
      if (ctx.clock.now() >= row.end_at) throw err.invalidState('Ca đã hết giờ');
    },
  });

async function getBooking(ctx, user, id) {
  const { rows } = await ctx.db.query(`${SELECT_BOOKING} WHERE b.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw err.notFound();
  if (row.user_id !== user.id && user.role !== 'admin') throw err.forbidden();
  return toApi(row);
}

// Ca của chính user; admin thêm ?all=1 để xem tất cả
async function listBookings(ctx, user, query) {
  const params = [];
  const where = [];
  if (!(user.role === 'admin' && query.all === '1')) {
    params.push(user.id);
    where.push(`b.user_id = $${params.length}`);
  }
  const from = query.from ? parseDateOrInstant(query.from, ctx.cfg.timezone) : null;
  const to = query.to ? parseDateOrInstant(query.to, ctx.cfg.timezone) : null;
  if ((query.from && from === null) || (query.to && to === null)) throw err.validation('from/to không hợp lệ');
  if (from !== null) { params.push(new Date(from)); where.push(`b.end_at > $${params.length}`); }
  if (to !== null) { params.push(new Date(to)); where.push(`b.start_at < $${params.length}`); }
  const { rows } = await ctx.db.query(
    `${SELECT_BOOKING} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.start_at`, params);
  return rows.map(toApi);
}

// Lịch theo giờ — REQ-UI-02: các đoạn liên tiếp có cùng số phiên và cùng trạng thái GPU
async function calendar(ctx, query) {
  const tz = ctx.cfg.timezone;
  const from = parseDateOrInstant(query.from, tz);
  const to = parseDateOrInstant(query.to, tz);
  if (from === null || to === null || to <= from) throw err.validation('Cần from < to (ngày YYYY-MM-DD hoặc thời điểm có múi giờ)');
  if (to - from > (ctx.cfg.bookingHorizonMs + 24 * HOUR)) throw err.validation('Khoảng thời gian quá dài');
  const { rows } = await ctx.db.query(
    'SELECT * FROM bookings WHERE status = ANY($1::booking_status[]) AND start_at < $3 AND end_at > $2',
    [ACTIVE_LIST, new Date(from), new Date(to)],
  );
  const bookings = rows.map(toRule);
  const segments = [];
  let h = DateTime.fromMillis(from, { zone: tz }).startOf('hour');
  while (h.toMillis() < to) {
    const s = h.toMillis();
    const next = h.plus({ hours: 1 });
    const e = Math.min(next.toMillis(), to);
    const here = bookings.filter((b) => b.start < e && s < b.end);
    const seg = { sessions: here.length, gpu_taken: here.some((b) => b.useGpu) };
    const last = segments[segments.length - 1];
    if (last && last.sessions === seg.sessions && last.gpu_taken === seg.gpu_taken) last.endMs = e;
    else segments.push({ startMs: s, endMs: e, ...seg });
    h = next;
  }
  return segments.map((x) => ({ start: toVnIso(x.startMs), end: toVnIso(x.endMs), sessions: x.sessions, gpu_taken: x.gpu_taken }));
}

// REQ-UI-04: giờ GPU tuần hiện tại
async function gpuQuotaOf(ctx, user) {
  const tz = ctx.cfg.timezone;
  const week = weekStartOf(ctx.clock.now().getTime(), tz);
  const used = usedInWeek(await userGpuBookings(ctx.db, user.id, week, addWeek(week, tz)), week, tz);
  const round = (x) => Math.round((x / HOUR) * 100) / 100;
  return {
    week_start: toVnIso(week),
    limit_hours: round(ctx.cfg.gpuWeeklyQuotaMs),
    used_hours: round(used),
    remaining_hours: round(Math.max(0, ctx.cfg.gpuWeeklyQuotaMs - used)),
  };
}

// --- Image cho phép — REQ-BK-10, REQ-CT-06 ---
async function listImages(ctx, { all = false } = {}) {
  const { rows } = await ctx.db.query(`SELECT name, enabled FROM images ${all ? '' : 'WHERE enabled'} ORDER BY name`);
  return all ? rows : rows.map((r) => ({ name: r.name }));
}

async function setImages(ctx, actor, names) {
  return tx(ctx.db, async (q) => {
    for (const name of names) {
      await q.query('INSERT INTO images (name, enabled) VALUES ($1, true) ON CONFLICT (name) DO UPDATE SET enabled = true', [name]);
    }
    await q.query('UPDATE images SET enabled = false WHERE NOT (name = ANY($1::text[]))', [names]);
    await q.query('INSERT INTO audit_log (actor_id, action, target, details) VALUES ($1, $2, $3, $4)',
      [actor.id, 'images.set', 'images', { names }]);
    const { rows } = await q.query('SELECT name, enabled FROM images ORDER BY name');
    return rows;
  });
}

module.exports = {
  createBooking,
  cancelBooking,
  endBooking,
  restartBooking,
  getBooking,
  listBookings,
  calendar,
  gpuQuotaOf,
  listImages,
  setImages,
};
