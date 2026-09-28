// Dựng app với CSDL PostgreSQL thật (xóa sạch schema mỗi lần), Google giả, hệ thống giả, đồng hồ giả.
const { buildApp } = require('../../src/app');
const { createDb, resetSchema } = require('../../src/db');
const { createFakeGoogle } = require('./google');
const { createFakeSystem } = require('./fake-system');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:test@localhost:55432/vmu_test';

function createClock(start = '2026-10-05T09:20:00+07:00') {
  let t = new Date(start).getTime();
  return {
    now: () => new Date(t),
    set: (iso) => { t = new Date(iso).getTime(); },
    advance: (ms) => { t += ms; },
  };
}

async function createTestApp({ config = {}, now } = {}) {
  const db = createDb(DATABASE_URL);
  await resetSchema(db);
  const google = await createFakeGoogle();
  const system = createFakeSystem();
  const clock = createClock(now);
  const app = await buildApp({
    db,
    system,
    clock,
    google: { clientId: google.clientId, jwks: google.jwks },
    config: { passwordEncKey: 'a'.repeat(64), ...config },
  });

  const cookieOf = (res) => {
    const c = [].concat(res.headers['set-cookie'] || []).find((s) => s.startsWith('sid='));
    return c && c.split(';')[0];
  };

  // Đăng nhập bằng email, trả về { res, cookie, body }
  async function login(email, claims = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/google', payload: { id_token: await google.sign({ email, ...claims }) } });
    return { res, cookie: cookieOf(res), body: res.json() };
  }

  // Tạo admin như lệnh promote-admin (tài khoản vẫn pending, được gọi API admin để tự duyệt mình)
  async function adminCookie(email = 'admin@vimaru.edu.vn') {
    const { body } = await login(email);
    await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [body.user.id]);
    return (await login(email)).cookie;
  }

  const req = (method, url, cookie, payload) => app.inject({ method, url, payload, headers: cookie ? { cookie } : {} });

  async function close() {
    await app.close();
    await db.end();
  }

  return { app, db, google, system, clock, login, adminCookie, req, close };
}

module.exports = { createTestApp, createClock, DATABASE_URL };
