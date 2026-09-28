// M6 — Giám sát & log. REQ-MN-01..03.
const fs = require('node:fs/promises');
const path = require('node:path');
const { err } = require('../errors');
const { toVnIso, parseDateOrInstant } = require('../time');

async function ownedBooking(ctx, user, id) {
  const { rows } = await ctx.db.query('SELECT * FROM bookings WHERE id = $1', [id]);
  const b = rows[0];
  if (!b) throw err.notFound();
  if (b.user_id !== user.id && user.role !== 'admin') throw err.forbidden();
  return b;
}

async function readFileOrNull(p) {
  try {
    return await fs.readFile(p, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

// REQ-MN-02: log đã lưu (các lần chạy trước) + log trực tiếp nếu container còn tồn tại
async function bookingLogs(ctx, user, id, tail) {
  const b = await ownedBooking(ctx, user, id);
  let text = await readFileOrNull(path.join(ctx.cfg.logDir, `${b.id}.log`));
  if (ctx.docker && ['running', 'exited', 'stopping'].includes(b.status)) {
    const state = await ctx.docker.inspect(`vmu-bk-${b.id}`);
    if (state) text = (text || '') + (await ctx.docker.logs(`vmu-bk-${b.id}`));
  }
  if (text === null) throw err.notFound();
  const n = Number(tail);
  if (Number.isInteger(n) && n > 0) {
    const lines = text.replace(/\n$/, '').split('\n');
    text = `${lines.slice(-n).join('\n')}\n`;
  }
  return text;
}

// REQ-MN-01: số liệu của phiên đang chạy, đọc trực tiếp khi gọi
async function bookingMetrics(ctx, user, id) {
  const b = await ownedBooking(ctx, user, id);
  if (b.status !== 'running' || !ctx.docker) throw err.invalidState('Ca không có phiên đang chạy');
  const s = await ctx.docker.stats(`vmu-bk-${b.id}`);
  if (!s) throw err.invalidState('Container không chạy');
  const gpu = b.use_gpu ? await ctx.docker.gpuStats() : null;
  return {
    cpu_percent: s.cpuPercent,
    mem_bytes: s.memBytes,
    mem_limit_bytes: s.memLimitBytes,
    gpu: gpu && { util_percent: gpu.utilPercent, mem_used_bytes: gpu.memUsedBytes, mem_total_bytes: gpu.memTotalBytes },
    sampled_at: toVnIso(ctx.clock.now()),
  };
}

// Chạy hằng ngày (vmu-purge.timer): xóa log của ca đã kết thúc quá LOG_RETENTION
async function purgeOldLogs(ctx) {
  const cutoff = new Date(ctx.clock.now().getTime() - ctx.cfg.logRetentionMs);
  const { rows } = await ctx.db.query(
    `SELECT id FROM bookings WHERE status IN ('completed', 'failed', 'cancelled')
       AND coalesce(actual_end_at, end_at) < $1`, [cutoff]);
  let removed = 0;
  for (const r of rows) {
    try {
      await fs.unlink(path.join(ctx.cfg.logDir, `${r.id}.log`));
      removed++;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  return removed;
}

// REQ-MN-03
async function listAudit(ctx, query) {
  const params = [];
  const where = [];
  const from = query.from ? parseDateOrInstant(query.from, ctx.cfg.timezone) : null;
  const to = query.to ? parseDateOrInstant(query.to, ctx.cfg.timezone) : null;
  if ((query.from && from === null) || (query.to && to === null)) throw err.validation('from/to không hợp lệ');
  if (from !== null) { params.push(new Date(from)); where.push(`a.created_at >= $${params.length}`); }
  if (to !== null) { params.push(new Date(to)); where.push(`a.created_at < $${params.length}`); }
  const { rows } = await ctx.db.query(
    `SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT 1000`, params);
  return rows.map((r) => ({
    id: r.id,
    actor: r.username || 'system',
    action: r.action,
    target: r.target,
    details: r.details,
    created_at: toVnIso(r.created_at),
  }));
}

module.exports = { bookingLogs, bookingMetrics, purgeOldLogs, listAudit };
