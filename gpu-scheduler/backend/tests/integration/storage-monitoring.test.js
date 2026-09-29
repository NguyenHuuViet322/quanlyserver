const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTestApp } = require('../helpers/app');
const { createFakeDocker } = require('../helpers/fake-docker');
const { defaults } = require('../../src/config');
const { runTick } = require('../../src/scheduler/tick');
const { refreshStorage } = require('../../src/storage/service');
const { purgeOldLogs } = require('../../src/monitoring/service');

const GiB = 1024 ** 3;
const DAY = 24 * 3600 * 1000;
const vn = (s) => `${s}+07:00`;

describe('M5, M6 — Lưu trữ, giám sát & log', () => {
  let t;
  let docker;
  let logDir;
  let admin;
  let A;

  beforeEach(async () => {
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmu-logs-'));
    docker = createFakeDocker();
    t = await createTestApp({ now: vn('2026-10-05T08:50:00'), config: { logDir }, docker });
    admin = await t.adminCookie('quantri@vimaru.edu.vn');
    const { body } = await t.login('a@vimaru.edu.vn');
    const res = await t.req('POST', `/api/admin/users/${body.user.id}/approve`, admin);
    A = { ...res.json().user, cookie: (await t.login('a@vimaru.edu.vn')).cookie };
    await t.req('POST', `/api/admin/users/${(await t.login('quantri@vimaru.edu.vn')).body.user.id}/approve`, admin);
  });
  afterEach(async () => {
    await t.close();
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  const ctx = () => ({ db: t.db, system: t.system, clock: t.clock, cfg: { ...defaults, logDir } });
  const tick = () => runTick({ db: t.db, docker, clock: t.clock, cfg: { ...defaults, logDir }, host: { cpuThreads: 32 } });
  const code = (res) => res.json().error?.code;
  async function book(start = '2026-10-05T09:00:00', end = '2026-10-05T11:00:00', use_gpu = true) {
    const res = await t.req('POST', '/api/bookings', A.cookie, { start: vn(start), end: vn(end), use_gpu });
    assert.equal(res.statusCode, 201, res.body);
    return res.json();
  }

  test('ST-T03 vượt 80 GiB → /me có over_soft_since, grace_deadline = +7 ngày; đúng 1 thông báo SOFT_QUOTA', async () => {
    t.system.state.usage.set(A.uid, 50 * GiB);
    await refreshStorage(ctx());
    let me = (await t.req('GET', '/api/me', A.cookie)).json();
    assert.equal(me.storage.used_bytes, 50 * GiB);
    assert.equal(me.storage.soft_bytes, 80 * GiB);
    assert.equal(me.storage.hard_bytes, 100 * GiB);
    assert.equal(me.storage.over_soft_since, null);
    assert.equal(me.storage.grace_deadline, null);

    t.system.state.usage.set(A.uid, 85 * GiB);
    await refreshStorage(ctx());
    t.clock.advance(5 * 60 * 1000);
    await refreshStorage(ctx()); // lần đọc sau không tạo thêm thông báo, không dời hạn
    me = (await t.req('GET', '/api/me', A.cookie)).json();
    assert.equal(me.storage.used_bytes, 85 * GiB);
    assert.equal(me.storage.over_soft_since, '2026-10-05T08:50:00+07:00');
    assert.equal(me.storage.grace_deadline, '2026-10-12T08:50:00+07:00');
    const n = (await t.db.query(`SELECT * FROM notifications WHERE kind = 'SOFT_QUOTA' AND user_id = $1`, [A.id])).rows;
    assert.equal(n.length, 1);
    assert.match(n[0].message, /12\/10\/2026 08:50/);

    // Dọn xuống dưới 80 GiB → hết cảnh báo
    t.system.state.usage.set(A.uid, 70 * GiB);
    await refreshStorage(ctx());
    me = (await t.req('GET', '/api/me', A.cookie)).json();
    assert.equal(me.storage.over_soft_since, null);
  });

  test('MN-T02 ca đã completed → GET /bookings/:id/logs trả log của container', async () => {
    const b = await book();
    t.clock.set(vn('2026-10-05T09:00:10'));
    await tick();
    docker.containers.get(`vmu-bk-${b.id}`).logs += 'epoch 1 loss=0.42\n';
    t.clock.set(vn('2026-10-05T11:00:00'));
    await tick();
    const res = await t.req('GET', `/api/bookings/${b.id}/logs`, A.cookie);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/plain/);
    assert.match(res.body, /epoch 1 loss=0\.42/);
    // Người khác không xem được
    const { body } = await t.login('b@vimaru.edu.vn');
    await t.req('POST', `/api/admin/users/${body.user.id}/approve`, admin);
    const other = await t.req('GET', `/api/bookings/${b.id}/logs`, (await t.login('b@vimaru.edu.vn')).cookie);
    assert.equal(other.statusCode, 403);
    // ?tail=N
    const tail = await t.req('GET', `/api/bookings/${b.id}/logs?tail=1`, A.cookie);
    assert.equal(tail.body.trim().split('\n').length, 1);
  });

  test('MN-T05 log quá 30 ngày bị dọn, API trả 404 NOT_FOUND', async () => {
    const b = await book();
    t.clock.set(vn('2026-10-05T09:00:10'));
    await tick();
    t.clock.set(vn('2026-10-05T11:00:00'));
    await tick();
    assert.equal((await t.req('GET', `/api/bookings/${b.id}/logs`, A.cookie)).statusCode, 200);

    t.clock.advance(29 * DAY);
    await purgeOldLogs(ctx());
    assert.equal((await t.req('GET', `/api/bookings/${b.id}/logs`, A.cookie)).statusCode, 200, 'dọn quá sớm');

    t.clock.advance(2 * DAY);
    await purgeOldLogs(ctx());
    assert.ok(!fs.existsSync(path.join(logDir, `${b.id}.log`)));
    // Đồng hồ đã qua 31 ngày > SESSION_TTL nên phải đăng nhập lại
    const cookie = (await t.login('a@vimaru.edu.vn')).cookie;
    const res = await t.req('GET', `/api/bookings/${b.id}/logs`, cookie);
    assert.equal(res.statusCode, 404);
    assert.equal(code(res), 'NOT_FOUND');
  });

  test('MN-T03 mọi thao tác quan trọng có audit (actor, thời gian, action, target); không dòng nào chứa mật khẩu', async () => {
    const secrets = [];
    // cấp lại mật khẩu, và mật khẩu ban đầu
    secrets.push((await t.req('GET', '/api/me/password', A.cookie)).json().password);
    secrets.push((await t.req('POST', '/api/me/password/reset', A.cookie)).json().password);
    // đặt, hủy
    const b1 = await book('2026-10-06T08:00:00', '2026-10-06T10:00:00');
    assert.equal((await t.req('POST', `/api/bookings/${b1.id}/cancel`, A.cookie)).statusCode, 200);
    // chạy, container thoát, khởi động lại, kết thúc sớm
    const b2 = await book();
    t.clock.set(vn('2026-10-05T09:00:10'));
    await tick();
    docker.exit(`vmu-bk-${b2.id}`);
    await tick();
    assert.equal((await t.req('POST', `/api/bookings/${b2.id}/restart`, A.cookie)).statusCode, 202);
    await tick();
    assert.equal((await t.req('POST', `/api/bookings/${b2.id}/end`, A.cookie)).statusCode, 202);
    // duyệt, khóa, xóa
    const { body } = await t.login('c@vimaru.edu.vn');
    await t.req('POST', `/api/admin/users/${body.user.id}/approve`, admin);
    await t.req('POST', `/api/admin/users/${body.user.id}/lock`, admin);
    await t.req('DELETE', `/api/admin/users/${body.user.id}`, admin);

    const res = await t.req('GET', '/api/admin/audit', admin);
    assert.equal(res.statusCode, 200);
    const rows = res.json();
    const actions = new Set(rows.map((r) => r.action));
    for (const a of ['booking.create', 'booking.cancel', 'booking.restart', 'booking.end', 'user.approve', 'user.lock', 'user.delete', 'user.password_reset']) {
      assert.ok(actions.has(a), `thiếu audit ${a}`);
    }
    for (const r of rows) {
      assert.ok(r.actor, `thiếu actor: ${JSON.stringify(r)}`);
      assert.match(r.created_at, /\+07:00$/);
      assert.ok(r.target);
    }
    const dump = JSON.stringify(rows) + JSON.stringify((await t.db.query('SELECT * FROM audit_log')).rows);
    for (const s of secrets) assert.ok(!dump.includes(s), 'audit chứa mật khẩu');
    // User thường không xem được
    assert.equal((await t.req('GET', '/api/admin/audit', A.cookie)).statusCode, 403);
  });

  test('MN-T09 metrics có cpus (số lõi được cấp), RAM, GPU util, VRAM dùng/tổng', async () => {
    const b = await book();
    t.clock.set(vn('2026-10-05T09:00:10'));
    await tick();
    const m = (await t.req('GET', `/api/bookings/${b.id}/metrics`, A.cookie)).json();
    assert.equal(m.cpus, 15);
    assert.equal(m.mem_limit_bytes, 28 * GiB);
    assert.ok(m.mem_bytes > 0);
    assert.deepEqual(Object.keys(m.gpu).sort(), ['mem_total_bytes', 'mem_used_bytes', 'util_percent']);
  });

  test('MN-T10 OOM và lỗi khởi chạy ghi audit (người thực hiện system); /admin/audit lọc theo user, action, from/to', async () => {
    // Ca 1 của A: khởi chạy lỗi
    docker.failOn('run');
    const b1 = await book('2026-10-05T09:00:00', '2026-10-05T10:00:00', false);
    t.clock.set(vn('2026-10-05T09:00:10'));
    await tick();
    docker.clearFailures();
    // Ca 2 của A: chạy rồi bị OOM
    const b2 = await book('2026-10-05T11:00:00', '2026-10-05T13:00:00', true);
    t.clock.set(vn('2026-10-05T11:00:10'));
    await tick();
    docker.exit(`vmu-bk-${b2.id}`, { oom: true });
    t.clock.set(vn('2026-10-05T11:05:00'));
    await tick();

    const audit = async (qs) => {
      const res = await t.req('GET', `/api/admin/audit${qs}`, admin);
      assert.equal(res.statusCode, 200, res.body);
      return res.json();
    };
    const all = await audit('');
    const failed = all.find((r) => r.action === 'booking.start_failed');
    const oom = all.find((r) => r.action === 'booking.oom');
    assert.ok(failed && oom, JSON.stringify(all.map((r) => r.action)));
    assert.equal(failed.actor, 'system');
    assert.equal(failed.target, `booking:${b1.id}`);
    assert.equal(oom.actor, 'system');
    assert.equal(oom.target, `booking:${b2.id}`);

    // Lọc theo user: gồm thao tác của A và sự kiện hệ thống trên ca của A
    const byA = await audit(`?user=${A.username}`);
    assert.ok(byA.some((r) => r.action === 'booking.oom'));
    assert.ok(byA.some((r) => r.action === 'booking.create'));
    assert.ok(byA.every((r) => r.actor === A.username || r.target.startsWith('booking:') || r.target === `user:${A.id}`));
    assert.ok(!byA.some((r) => r.action === 'user.approve' && r.target !== `user:${A.id}`));
    // Lọc theo action: đúng tên và tiền tố
    assert.deepEqual((await audit('?action=booking.oom')).map((r) => r.action), ['booking.oom']);
    const prefix = await audit('?action=booking.');
    assert.ok(prefix.length >= 4 && prefix.every((r) => r.action.startsWith('booking.')));
    // Lọc theo thời gian: tương lai → rỗng
    assert.deepEqual(await audit('?from=2030-01-01'), []);
  });

  test('[hỗ trợ MN-T01] GET /bookings/:id/metrics của phiên GPU đang chạy có CPU, RAM, GPU, sampled_at', async () => {
    const b = await book();
    t.clock.set(vn('2026-10-05T09:00:10'));
    await tick();
    const res = await t.req('GET', `/api/bookings/${b.id}/metrics`, A.cookie);
    assert.equal(res.statusCode, 200, res.body);
    const m = res.json();
    assert.equal(m.cpu_percent, 312.5);
    assert.equal(m.mem_bytes, 4 * GiB);
    assert.equal(m.mem_limit_bytes, 28 * GiB);
    assert.deepEqual(m.gpu, { util_percent: 97, mem_used_bytes: 20 * GiB, mem_total_bytes: 32 * GiB });
    assert.equal(m.sampled_at, '2026-10-05T09:00:10+07:00');
    // Phiên không chạy → 409 INVALID_STATE
    const b2 = await book('2026-10-06T08:00:00', '2026-10-06T10:00:00', false);
    const idle = await t.req('GET', `/api/bookings/${b2.id}/metrics`, A.cookie);
    assert.equal(idle.statusCode, 409);
  });
});
