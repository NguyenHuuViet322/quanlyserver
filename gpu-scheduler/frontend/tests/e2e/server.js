// Server cho test e2e: backend thật + PostgreSQL test + Google/hệ thống/Docker giả + đồng hồ điều khiển được.
// Chỉ dùng cho Playwright (frontend/playwright.config.js). Các route /__test/* KHÔNG có trong backend thật.
const path = require('node:path');
const { buildApp } = require('../../../backend/src/app');
const { createDb, resetSchema } = require('../../../backend/src/db');
const { loadConfig } = require('../../../backend/src/config');
const users = require('../../../backend/src/users/service');
const { createFakeGoogle } = require('../../../backend/tests/helpers/google');
const { createFakeSystem } = require('../../../backend/tests/helpers/fake-system');
const { createFakeDocker } = require('../../../backend/tests/helpers/fake-docker');

const PORT = Number(process.env.E2E_PORT || 4173);
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:test@localhost:55432/vmu_test';
const DEFAULT_NOW = '2026-10-05T09:20:00+07:00';
const GiB = 1024 ** 3;

async function main() {
  const db = createDb(DATABASE_URL);
  await resetSchema(db);
  const google = await createFakeGoogle();
  const system = createFakeSystem();
  const docker = createFakeDocker();
  let now = new Date(DEFAULT_NOW).getTime();
  const clock = { now: () => new Date(now) };
  const config = { passwordEncKey: 'b'.repeat(64), sshHost: 'gpu.vimaru.edu.vn' };
  const ctx = { db, system, docker, clock, cfg: loadConfig(config) };

  const app = await buildApp({
    db, system, docker, clock, config,
    google: { clientId: google.clientId, jwks: google.jwks },
    staticDir: path.resolve(__dirname, '../../src'),
  });

  const userByEmail = async (email) => (await db.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];

  app.post('/__test/reset', async (req) => {
    await resetSchema(db);
    for (const m of [system.state.users, system.state.homes, system.state.quotas, system.state.usage, docker.containers]) m.clear();
    now = new Date(req.body?.now || DEFAULT_NOW).getTime();
    return { ok: true };
  });

  app.post('/__test/clock', async (req) => {
    now = new Date(req.body.now).getTime();
    return { ok: true };
  });

  // Tạo (hoặc lấy) user và trả cookie phiên. status: pending | active; role: user | admin; ack: đã lưu mật khẩu
  app.post('/__test/user', async (req) => {
    const { email, name = email.split('@')[0].toUpperCase(), status = 'active', role = 'user', ack = true } = req.body;
    const login = async () => app.inject({ method: 'POST', url: '/api/auth/google', payload: { id_token: await google.sign({ email, name }) } });
    let res = await login();
    let u = await userByEmail(email);
    if (role === 'admin') await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [u.id]);
    if (status === 'active' && u.status === 'pending') {
      await users.approveUser(ctx, null, u.id);
      if (ack) await db.query('UPDATE users SET pending_password_enc = NULL WHERE id = $1', [u.id]);
      res = await login();
    }
    u = await userByEmail(email);
    const sid = [].concat(res.headers['set-cookie']).find((c) => c.startsWith('sid=')).split(';')[0].slice(4);
    return { sid, user: users.publicUser(u, ctx.cfg) };
  });

  app.post('/__test/booking', async (req) => {
    const { email, start, end, use_gpu = false, status = 'scheduled', exit_reason = null } = req.body;
    const u = await userByEmail(email);
    const actual = status === 'completed' || status === 'running' ? start : null;
    const { rows } = await db.query(
      `INSERT INTO bookings (user_id, start_at, end_at, use_gpu, status, actual_start_at, actual_end_at, exit_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [u.id, start, end, use_gpu, status, actual, status === 'completed' ? end : null, exit_reason]);
    if (['running', 'exited'].includes(status)) docker.addContainer(`vmu-bk-${rows[0].id}`, rows[0].id, { running: status === 'running', cpus: 15 });
    return { id: rows[0].id };
  });

  app.post('/__test/storage', async (req) => {
    const u = await userByEmail(req.body.email);
    await db.query(
      `UPDATE users SET storage_used_bytes = $2, storage_soft_bytes = $3, storage_hard_bytes = $4, storage_checked_at = $5 WHERE id = $1`,
      [u.id, Math.round(req.body.used_gib * GiB), 80 * GiB, 100 * GiB, clock.now()]);
    return { ok: true };
  });

  app.post('/__test/notify', async (req) => {
    const u = await userByEmail(req.body.email);
    await db.query('INSERT INTO notifications (user_id, kind, message) VALUES ($1, $2, $3)', [u.id, req.body.kind, req.body.message]);
    return { ok: true };
  });

  await app.listen({ host: '127.0.0.1', port: PORT });
  console.log(`e2e server http://127.0.0.1:${PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
