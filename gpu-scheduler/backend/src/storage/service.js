// M5 — Lưu trữ: đọc quota định kỳ, cảnh báo vượt soft quota. REQ-ST-02, REQ-ST-05.
// ctx = { db, system, clock, cfg }
const { DateTime } = require('luxon');
const { toVnIso } = require('../time');

// Chạy mỗi 5 phút trong Scheduler
async function refreshStorage(ctx) {
  const { db, cfg } = ctx;
  const now = ctx.clock.now();
  const report = new Map((await ctx.system.readQuotas()).map((q) => [q.projectId, q]));
  const { rows } = await db.query(
    `SELECT id, linux_uid, over_soft_since FROM users WHERE status IN ('active', 'locked') AND linux_uid IS NOT NULL`);
  for (const u of rows) {
    const q = report.get(u.linux_uid);
    if (!q) continue;
    const over = q.softBytes > 0 && q.usedBytes > q.softBytes;
    let since = u.over_soft_since;
    if (over && !since) {
      since = now;
      const deadline = DateTime.fromMillis(now.getTime() + cfg.userQuotaGraceMs, { zone: cfg.timezone });
      await db.query('INSERT INTO notifications (user_id, kind, message) VALUES ($1, $2, $3)', [
        u.id,
        'SOFT_QUOTA',
        `Thư mục của bạn đã vượt ${Math.round(q.softBytes / 1024 ** 3)} GiB. Hãy dọn dẹp trước ${deadline.toFormat('dd/MM/yyyy HH:mm')} (GMT${deadline.toFormat('Z')}), sau thời điểm đó sẽ không ghi thêm được.`,
      ]);
    } else if (!over) {
      since = null;
    }
    await db.query(
      `UPDATE users SET storage_used_bytes = $2, storage_soft_bytes = $3, storage_hard_bytes = $4,
         storage_checked_at = $5, over_soft_since = $6 WHERE id = $1`,
      [u.id, q.usedBytes, q.softBytes, q.hardBytes, now, since],
    );
  }
}

// Trường storage trong GET /me — REQ-UI-05
function storageOf(user, cfg) {
  const since = user.over_soft_since;
  return {
    used_bytes: user.storage_used_bytes ?? null,
    soft_bytes: user.storage_soft_bytes ?? cfg.userQuotaSoftBytes,
    hard_bytes: user.storage_hard_bytes ?? cfg.userQuotaHardBytes,
    over_soft_since: since ? toVnIso(since) : null,
    grace_deadline: since ? toVnIso(since.getTime() + cfg.userQuotaGraceMs) : null,
    checked_at: user.storage_checked_at ? toVnIso(user.storage_checked_at) : null,
  };
}

module.exports = { refreshStorage, storageOf };
