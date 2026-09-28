#!/usr/bin/env node
// Chạy thử Dashboard trên máy local (KHÔNG dùng cho production):
//   - backend thật, CSDL riêng vmu_dev (xóa sạch mỗi lần chạy), đồng hồ thật
//   - Google, hệ thống Linux, Docker là bản giả (không cần server GPU)
//   - Scheduler chạy mỗi 60 giây với Docker giả: ca tự bắt đầu/kết thúc theo giờ
//   - Đăng nhập nhanh tại /__dev (nút Google không hoạt động khi chạy thử)
// Dùng: npm run dev   → http://127.0.0.1:4174/__dev
const path = require('node:path');
const { buildApp } = require('../backend/src/app');
const { createDb, resetSchema } = require('../backend/src/db');
const { loadConfig } = require('../backend/src/config');
const users = require('../backend/src/users/service');
const { runTick, reconcile } = require('../backend/src/scheduler/tick');
const { createFakeGoogle } = require('../backend/tests/helpers/google');
const { createFakeSystem } = require('../backend/tests/helpers/fake-system');
const { createFakeDocker } = require('../backend/tests/helpers/fake-docker');

const PORT = Number(process.env.DEV_PORT || 4174);
const DATABASE_URL = process.env.DEV_DATABASE_URL || 'postgres://postgres:test@localhost:55432/vmu_dev';
const HOUR = 3600 * 1000;
const GiB = 1024 ** 3;

const ACCOUNTS = [
  { email: 'quantri@vimaru.edu.vn', name: 'Quản trị viên', role: 'admin', note: 'Admin: duyệt/khóa tài khoản, image, nhật ký' },
  { email: 'vietnh@vimaru.edu.vn', name: 'Nguyễn Hữu Việt', note: 'Người dùng có ca đang chạy, lịch sử, thông báo' },
  { email: 'hoanglm@vimaru.edu.vn', name: 'Lê Minh Hoàng', note: 'Đã vượt 80 GiB (có cảnh báo dọn dẹp)' },
  { email: 'tranthu@vimaru.edu.vn', name: 'Trần Thu', note: 'Người dùng thường' },
  { email: 'phamb@vimaru.edu.vn', name: 'Phạm Bình', ack: false, note: 'Vừa được duyệt: thấy màn hình mật khẩu lần đầu' },
  { email: 'nguyenvana@vimaru.edu.vn', name: 'Nguyễn Văn A', status: 'pending', note: 'Đang chờ duyệt' },
];

async function main() {
  const db = createDb(DATABASE_URL);
  await resetSchema(db);
  const google = await createFakeGoogle();
  const system = createFakeSystem();
  const docker = createFakeDocker();
  const clock = { now: () => new Date() };
  const config = { passwordEncKey: 'c'.repeat(64), sshHost: 'gpu.vimaru.edu.vn', dashboardUrl: `http://127.0.0.1:${PORT}` };
  const cfg = loadConfig(config);
  const ctx = { db, system, docker, clock, cfg };

  const app = await buildApp({
    db, system, docker, clock, config,
    google: { clientId: google.clientId, jwks: google.jwks },
    staticDir: path.resolve(__dirname, '../frontend/src'),
  });

  // ---- Dữ liệu mẫu ----
  const byEmail = {};
  for (const a of ACCOUNTS) {
    const u = await users.upsertFromGoogle(ctx, {
      sub: `dev-${a.email}`, email: a.email, name: a.name,
      avatarUrl: null,
    });
    if (a.role === 'admin') await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [u.id]);
    if (a.status !== 'pending') {
      await users.approveUser(ctx, null, u.id);
      if (a.ack !== false) await db.query('UPDATE users SET pending_password_enc = NULL WHERE id = $1', [u.id]);
    }
    byEmail[a.email] = (await db.query('SELECT * FROM users WHERE id = $1', [u.id])).rows[0];
  }

  // Mốc giờ tròn hiện tại (giờ VN = UTC+7, không có giờ mùa hè nên làm tròn theo giờ UTC là đúng)
  const h0 = Math.floor(Date.now() / HOUR) * HOUR;
  const at = (hours) => new Date(h0 + hours * HOUR);
  // Mốc 00:00 giờ VN của ngày mai
  const vnMidnight = (dayOffset) => {
    const d = new Date(Date.now() + 7 * HOUR);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset) - 7 * HOUR;
  };
  const day = (offset, hour) => new Date(vnMidnight(offset) + hour * HOUR);
  const book = async (email, start, end, useGpu, status = 'scheduled', extra = {}) => {
    const ended = status === 'completed';
    await db.query(
      `INSERT INTO bookings (user_id, start_at, end_at, use_gpu, status, actual_start_at, actual_end_at, exit_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [byEmail[email].id, start, end, useGpu, status,
        status === 'running' || ended ? start : null, ended ? (extra.actualEnd || end) : null, extra.exitReason || null]);
  };
  // Đang chạy
  await book('vietnh@vimaru.edu.vn', at(-1), at(2), true, 'running');
  await book('hoanglm@vimaru.edu.vn', at(-1), at(1), false, 'running');
  // Sắp tới
  await book('vietnh@vimaru.edu.vn', day(1, 9), day(1, 12), false);
  await book('tranthu@vimaru.edu.vn', day(1, 13), day(1, 17), true);
  await book('hoanglm@vimaru.edu.vn', day(2, 8), day(2, 12), true);
  await book('tranthu@vimaru.edu.vn', day(2, 8), day(2, 10), false);
  await book('vietnh@vimaru.edu.vn', day(3, 20), day(4, 2), true); // qua nửa đêm
  // Lịch sử
  await book('vietnh@vimaru.edu.vn', day(-1, 8), day(-1, 11), true, 'completed');
  await book('vietnh@vimaru.edu.vn', day(-2, 14), day(-2, 18), true, 'completed', { exitReason: 'OOM', actualEnd: day(-2, 15) });
  await book('vietnh@vimaru.edu.vn', day(-1, 19), day(-1, 21), false, 'cancelled');

  // Dung lượng
  system.state.usage.set(byEmail['vietnh@vimaru.edu.vn'].linux_uid, Math.round(23.4 * GiB));
  system.state.usage.set(byEmail['hoanglm@vimaru.edu.vn'].linux_uid, Math.round(86.2 * GiB));
  system.state.usage.set(byEmail['tranthu@vimaru.edu.vn'].linux_uid, Math.round(4.1 * GiB));
  await require('../backend/src/storage/service').refreshStorage(ctx);

  // Thông báo
  const note = (email, kind, message, minutesAgo) => db.query(
    'INSERT INTO notifications (user_id, kind, message, created_at) VALUES ($1, $2, $3, $4)',
    [byEmail[email].id, kind, message, new Date(Date.now() - minutesAgo * 60000)]);
  await note('vietnh@vimaru.edu.vn', 'OOM', 'Ca hôm kia: tiến trình vượt giới hạn RAM và bị dừng (OOM)', 60 * 30);
  await note('vietnh@vimaru.edu.vn', 'END_WARNING', 'Ca hôm qua của bạn kết thúc lúc 11:00 (GMT+7). Hãy lưu checkpoint.', 60 * 20);

  // Container giả cho ca đang chạy, rồi chạy Scheduler mỗi 60 giây
  const schedEnv = { db, docker, clock, cfg: { ...cfg, logDir: path.join(require('node:os').tmpdir(), 'vmu-dev-logs') }, host: { cpuThreads: 32 } };
  await reconcile(schedEnv);
  for (const c of docker.containers.values()) c.logs += 'Epoch 1/10  loss=0.812\nEpoch 2/10  loss=0.604\nEpoch 3/10  loss=0.471\n';
  setInterval(() => runTick(schedEnv).catch((e) => console.error('tick lỗi:', e.message)), cfg.schedulerTickMs);

  // ---- Đăng nhập nhanh ----
  app.get('/__dev', async (req, reply) => {
    const rows = ACCOUNTS.map((a) => `<a class="acc" href="/__dev/login/${encodeURIComponent(a.email)}">
      <strong>${a.name}</strong><span>${a.email}</span><em>${a.note}</em></a>`).join('');
    reply.type('text/html; charset=utf-8').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>Chạy thử · VMU GPU Server</title>
      <link rel="stylesheet" href="/styles.css"><style>
      .acc{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border:1px solid var(--border);border-radius:10px;text-decoration:none;color:var(--text);text-align:left}
      .acc:hover{border-color:var(--brand);background:var(--brand-softer)} .acc span{font-size:14px;color:var(--text-muted)} .acc em{font-size:13px;font-style:normal;color:var(--brand-strong)}
      </style></head><body><div class="center-screen"><div class="card auth-card stack" style="width:min(520px,100%)">
      <img class="logo" src="/assets/icon.svg" alt="" width="72" height="72" style="margin:0 auto"><h1>Chạy thử Dashboard</h1>
      <p class="muted">Dữ liệu giả, đồng hồ thật. Chọn tài khoản để đăng nhập (thay cho Google).</p>${rows}</div></div></body></html>`);
  });
  app.get('/__dev/login/:email', async (req, reply) => {
    const u = (await db.query('SELECT * FROM users WHERE email = $1', [req.params.email])).rows[0];
    if (!u) return reply.redirect('/__dev');
    const s = await users.createSession(ctx, u.id);
    reply.setCookie('sid', s.token, { httpOnly: true, secure: false, sameSite: 'lax', path: '/', expires: s.expires });
    return reply.redirect('/');
  });

  await app.listen({ host: '127.0.0.1', port: PORT });
  console.log(`\nDashboard chạy thử: http://127.0.0.1:${PORT}/__dev\n(Ctrl+C để dừng)\n`);
}

main().catch((e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Cổng ${PORT} đang bận: có thể "npm run dev" đang chạy ở cửa sổ khác. Hãy tắt nó, hoặc chạy với DEV_PORT=4175.`);
  } else if (['ECONNREFUSED', 'ECONNRESET', '3D000', '57P03'].includes(e.code)) {
    // 3D000: chưa có CSDL vmu_dev; 57P03: PostgreSQL đang khởi động
    console.error('Không kết nối được CSDL vmu_dev. Hãy chạy "npm run db:test" trước (lệnh này chờ PostgreSQL sẵn sàng).');
  } else {
    console.error(e);
  }
  process.exit(1);
});
