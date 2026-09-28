// M1 — Người dùng & xác thực. ctx = { db, system, clock, cfg }
const crypto = require('node:crypto');
const { tx } = require('../db');
const { err } = require('../errors');
const { deriveUsername, usernameProblem } = require('./username');
const { generatePassword, encryptPassword, decryptPassword } = require('./password');
const { portRange } = require('./ports');
const { parseSshKey } = require('./ssh-key');
const { renderSshdUsers } = require('../system/sshd');

const ADMIN_LOCK = 1001; // khóa advisory cho các thao tác cấp phát tài khoản

function publicUser(row, cfg) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar_url: row.avatar_url,
    username: row.username,
    role: row.role,
    status: row.status,
    uid: row.linux_uid,
    ports: portRange(row.slot_index, cfg),
  };
}

async function audit(q, actorId, action, target, details = {}) {
  await q.query('INSERT INTO audit_log (actor_id, action, target, details) VALUES ($1, $2, $3, $4)', [actorId, action, target, details]);
}

// --- Đăng nhập & phiên — REQ-US-04, REQ-US-06 ---

async function upsertFromGoogle(ctx, profile) {
  const { rows } = await ctx.db.query(
    `INSERT INTO users (google_sub, email, name, avatar_url, username)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
     RETURNING *`,
    [profile.sub, profile.email, profile.name, profile.avatarUrl, deriveUsername(profile.email)],
  );
  const user = rows[0];
  if (user.status === 'locked' || user.status === 'deleted') throw err.accountLocked();
  return user;
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function createSession(ctx, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(ctx.clock.now().getTime() + ctx.cfg.sessionTtlMs);
  await ctx.db.query('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hashToken(token), userId, expires]);
  return { token, expires };
}

async function userFromSession(ctx, token) {
  if (!token) return null;
  const { rows } = await ctx.db.query(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = $1 AND s.expires_at > $2`,
    [hashToken(token), ctx.clock.now()],
  );
  return rows[0] || null;
}

async function deleteSession(ctx, token) {
  if (token) await ctx.db.query('DELETE FROM sessions WHERE id_hash = $1', [hashToken(token)]);
}

// Ghi lại cấu hình PermitOpen theo CSDL hiện tại (trong transaction đang mở) — REQ-CT-10
async function syncSshd(ctx, q) {
  const { rows } = await q.query(`SELECT username, status, slot_index FROM users ORDER BY slot_index NULLS LAST, id`);
  await ctx.system.writeSshdUsers({ content: renderSshdUsers(rows, ctx.cfg) });
}

// --- Duyệt & cấp phát — REQ-US-05, 07, 08, 09 ---

async function listUsers(ctx, status) {
  const { rows } = status
    ? await ctx.db.query('SELECT * FROM users WHERE status = $1 ORDER BY id', [status])
    : await ctx.db.query('SELECT * FROM users ORDER BY id');
  return rows.map((r) => publicUser(r, ctx.cfg));
}

// Chạy các bước hệ thống; lỗi ở bước nào thì hoàn tác các bước trước theo thứ tự ngược (docs/10-design/storage.md)
async function provision(system, steps) {
  const undo = [];
  try {
    for (const { run, revert } of steps) {
      await run();
      if (revert) undo.push(revert);
    }
  } catch (e) {
    for (const revert of undo.reverse()) {
      try { await revert(); } catch { /* đã cố hết sức; lỗi gốc quan trọng hơn */ }
    }
    throw e;
  }
  return undo;
}

async function approveUser(ctx, actorId, userId) {
  const { system, cfg } = ctx;
  return tx(ctx.db, async (q) => {
    await q.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_LOCK]);
    const { rows } = await q.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = rows[0];
    if (!user) throw err.notFound();
    if (user.status !== 'pending') throw err.invalidState('Chỉ duyệt được tài khoản đang chờ duyệt');
    const problem = usernameProblem(user.username, cfg);
    if (problem) throw err.invalidUsername(problem);

    const count = (await q.query(`SELECT count(*)::int AS n FROM users WHERE status IN ('active', 'locked')`)).rows[0].n;
    if (count >= cfg.maxUsers) throw err.userLimitReached(cfg.maxUsers);

    // Chỉ số cổng nhỏ nhất còn trống; UID luôn tăng, không tái sử dụng (kể cả user đã xóa)
    const slot = (await q.query(
      `SELECT min(i)::int AS s FROM generate_series(1, $1::int) i WHERE i NOT IN (SELECT slot_index FROM users WHERE slot_index IS NOT NULL)`,
      [cfg.maxUsers],
    )).rows[0].s;
    const uid = (await q.query('SELECT coalesce(max(linux_uid) + 1, $1::int)::int AS uid FROM users', [cfg.uidBase])).rows[0].uid;
    const username = user.username;
    const password = generatePassword(cfg.passwordLength);

    let undo;
    try {
      undo = await provision(system, [
        { run: () => system.createUser({ username, uid }), revert: () => system.deleteUser({ username }) },
        { run: () => system.createHome({ username, uid }), revert: () => system.removeHome({ username }) },
        {
          run: () => system.setProjectQuota({ username, uid, softBytes: cfg.userQuotaSoftBytes, hardBytes: cfg.userQuotaHardBytes }),
          revert: () => system.removeProjectQuota({ uid }),
        },
        { run: () => system.setPassword({ username, password, expireNow: true }) },
      ]);
    } catch {
      throw err.provisioningFailed();
    }

    try {
      const updated = await q.query(
        `UPDATE users SET status = 'active', linux_uid = $2, slot_index = $3, pending_password_enc = $4, approved_at = $5
         WHERE id = $1 RETURNING *`,
        [userId, uid, slot, encryptPassword(password, cfg.passwordEncKey), ctx.clock.now()],
      );
      await audit(q, actorId, 'user.approve', `user:${userId}`, { username, uid, slot });
      await syncSshd(ctx, q);
      return publicUser(updated.rows[0], cfg);
    } catch (e) {
      for (const revert of undo.reverse()) {
        try { await revert(); } catch { /* bỏ qua */ }
      }
      throw e;
    }
  });
}

// Ca của user bị khóa/xóa: ca chưa chạy → cancelled, ca đang chạy → stopping (Scheduler dừng container)
async function stopBookingsOf(q, userId) {
  await q.query(`UPDATE bookings SET status = 'cancelled' WHERE user_id = $1 AND status = 'scheduled'`, [userId]);
  await q.query(`UPDATE bookings SET status = 'stopping' WHERE user_id = $1 AND status IN ('starting', 'running', 'exited')`, [userId]);
}

// REQ-US-15
async function lockUser(ctx, actorId, userId) {
  return tx(ctx.db, async (q) => {
    const user = (await q.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
    if (!user) throw err.notFound();
    if (user.status !== 'active') throw err.invalidState('Chỉ khóa được tài khoản đang hoạt động');
    await ctx.system.lockUser({ username: user.username });
    const updated = await q.query(`UPDATE users SET status = 'locked' WHERE id = $1 RETURNING *`, [userId]);
    await stopBookingsOf(q, userId);
    await audit(q, actorId, 'user.lock', `user:${userId}`);
    return publicUser(updated.rows[0], ctx.cfg);
  });
}

async function unlockUser(ctx, actorId, userId) {
  return tx(ctx.db, async (q) => {
    const user = (await q.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
    if (!user) throw err.notFound();
    if (user.status !== 'locked') throw err.invalidState('Tài khoản không bị khóa');
    await ctx.system.unlockUser({ username: user.username });
    const updated = await q.query(`UPDATE users SET status = 'active' WHERE id = $1 RETURNING *`, [userId]);
    await audit(q, actorId, 'user.unlock', `user:${userId}`);
    return publicUser(updated.rows[0], ctx.cfg);
  });
}

// REQ-US-16: khóa, giải phóng chỉ số cổng, giữ dữ liệu tới purge_after
async function deleteUser(ctx, actorId, userId) {
  return tx(ctx.db, async (q) => {
    await q.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_LOCK]);
    const user = (await q.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
    if (!user) throw err.notFound();
    if (user.status === 'deleted') throw err.invalidState('Tài khoản đã bị xóa');
    if (user.linux_uid) await ctx.system.lockUser({ username: user.username });
    const now = ctx.clock.now();
    const updated = await q.query(
      `UPDATE users SET status = 'deleted', slot_index = NULL, pending_password_enc = NULL, deleted_at = $2, purge_after = $3
       WHERE id = $1 RETURNING *`,
      [userId, now, new Date(now.getTime() + ctx.cfg.deletedUserRetentionMs)],
    );
    await stopBookingsOf(q, userId);
    await audit(q, actorId, 'user.delete', `user:${userId}`);
    await syncSshd(ctx, q);
    return publicUser(updated.rows[0], ctx.cfg);
  });
}

// Chạy hằng ngày (vmu-purge.timer)
async function purgeDeletedUsers(ctx) {
  const { rows } = await ctx.db.query(
    `SELECT * FROM users WHERE status = 'deleted' AND purged_at IS NULL AND purge_after <= $1`,
    [ctx.clock.now()],
  );
  for (const user of rows) {
    if (user.linux_uid) await ctx.system.purgeUser({ username: user.username, uid: user.linux_uid });
    await ctx.db.query('UPDATE users SET purged_at = $2 WHERE id = $1', [user.id, ctx.clock.now()]);
    await audit(ctx.db, null, 'user.purge', `user:${user.id}`);
  }
  return rows.length;
}

// --- Mật khẩu — REQ-US-10..12 ---

async function getPendingPassword(ctx, user) {
  const { rows } = await ctx.db.query('SELECT pending_password_enc FROM users WHERE id = $1', [user.id]);
  const blob = rows[0]?.pending_password_enc;
  if (!blob) throw err.notFound();
  return decryptPassword(blob, ctx.cfg.passwordEncKey);
}

async function ackPassword(ctx, user) {
  await ctx.db.query('UPDATE users SET pending_password_enc = NULL WHERE id = $1', [user.id]);
}

async function resetPassword(ctx, user) {
  const password = generatePassword(ctx.cfg.passwordLength);
  await ctx.system.setPassword({ username: user.username, password, expireNow: true });
  await ctx.db.query('UPDATE users SET pending_password_enc = $2 WHERE id = $1', [user.id, encryptPassword(password, ctx.cfg.passwordEncKey)]);
  await audit(ctx.db, user.id, 'user.password_reset', `user:${user.id}`);
  return password;
}

// --- SSH key — REQ-US-13 ---

async function listSshKeys(ctx, user) {
  const { rows } = await ctx.db.query('SELECT id, public_key, fingerprint, created_at FROM ssh_keys WHERE user_id = $1 ORDER BY id', [user.id]);
  return rows;
}

async function syncAuthorizedKeys(ctx, q, user) {
  const { rows } = await q.query('SELECT public_key FROM ssh_keys WHERE user_id = $1 ORDER BY id', [user.id]);
  await ctx.system.setAuthorizedKeys({ username: user.username, keys: rows.map((r) => r.public_key) });
}

async function addSshKey(ctx, user, input) {
  const key = parseSshKey(input);
  return tx(ctx.db, async (q) => {
    const { rows } = await q.query(
      `INSERT INTO ssh_keys (user_id, public_key, fingerprint) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, fingerprint) DO UPDATE SET public_key = EXCLUDED.public_key
       RETURNING id, public_key, fingerprint, created_at`,
      [user.id, key.publicKey, key.fingerprint],
    );
    await syncAuthorizedKeys(ctx, q, user);
    return rows[0];
  });
}

async function removeSshKey(ctx, user, keyId) {
  return tx(ctx.db, async (q) => {
    const { rowCount } = await q.query('DELETE FROM ssh_keys WHERE id = $1 AND user_id = $2', [keyId, user.id]);
    if (!rowCount) throw err.notFound();
    await syncAuthorizedKeys(ctx, q, user);
  });
}

module.exports = {
  publicUser,
  upsertFromGoogle,
  createSession,
  userFromSession,
  deleteSession,
  listUsers,
  approveUser,
  lockUser,
  unlockUser,
  deleteUser,
  purgeDeletedUsers,
  getPendingPassword,
  ackPassword,
  resetPassword,
  listSshKeys,
  addSshKey,
  removeSshKey,
};
