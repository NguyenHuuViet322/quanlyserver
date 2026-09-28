const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('../helpers/app');

const GiB = 1024 ** 3;
const DAY = 24 * 3600 * 1000;

describe('M1 — Tài khoản, duyệt, phân quyền', () => {
  let t;
  let admin;
  beforeEach(async () => {
    t = await createTestApp();
    admin = await t.adminCookie();
  });
  afterEach(async () => { await t.close(); });

  const code = (res) => res.json().error?.code;
  const approve = (id) => t.req('POST', `/api/admin/users/${id}/approve`, admin);
  async function pendingUser(email) {
    return (await t.login(email)).body.user;
  }
  async function activeUser(email) {
    const u = await pendingUser(email);
    const res = await approve(u.id);
    assert.equal(res.statusCode, 200, res.body);
    return res.json().user;
  }

  test('US-T10 username không hợp lệ → duyệt trả 400 INVALID_USERNAME, không tạo tài khoản Linux', async () => {
    const emails = [
      '1abc@vimaru.edu.vn', // bắt đầu bằng số
      'ab+c@vimaru.edu.vn', // ký tự ngoài a-z0-9._-
      `${'a'.repeat(33)}@vimaru.edu.vn`, // dài hơn 32
      'root@vimaru.edu.vn', // tên hệ thống
      'docker@vimaru.edu.vn',
    ];
    for (const email of emails) {
      const u = await pendingUser(email);
      assert.equal(u.status, 'pending', email);
      const res = await approve(u.id);
      assert.equal(res.statusCode, 400, email);
      assert.equal(code(res), 'INVALID_USERNAME', email);
    }
    assert.equal(t.system.state.users.size, 0);
    assert.equal(t.system.state.homes.size, 0);
  });

  test('US-T11 đăng nhập lần đầu → pending; POST /bookings → 403 ACCOUNT_PENDING', async () => {
    const { body, cookie } = await t.login('moi@vimaru.edu.vn');
    assert.equal(body.user.status, 'pending');
    const res = await t.req('POST', '/api/bookings', cookie, {
      start: '2026-10-06T08:00:00+07:00', end: '2026-10-06T10:00:00+07:00', use_gpu: false, image: 'vmu/pytorch:2.8-cuda12.8',
    });
    assert.equal(res.statusCode, 403);
    assert.equal(code(res), 'ACCOUNT_PENDING');
  });

  test('US-T13 user thứ i nhận dải 10000+100(i−1)..+99, không trùng; user thứ 30 nhận 12900–12999', async () => {
    const ranges = [];
    for (let i = 1; i <= 30; i++) {
      const u = await activeUser(`user${String(i).padStart(2, '0')}@vimaru.edu.vn`);
      assert.deepEqual(u.ports, { from: 10000 + 100 * (i - 1), to: 10000 + 100 * (i - 1) + 99 }, `user ${i}`);
      ranges.push(u.ports);
    }
    assert.deepEqual(ranges[29], { from: 12900, to: 12999 });
    const starts = new Set(ranges.map((r) => r.from));
    assert.equal(starts.size, 30);
  });

  test('US-T14 đã đủ 30 user active, duyệt thêm → 409 USER_LIMIT_REACHED', async () => {
    for (let i = 1; i <= 30; i++) await activeUser(`u${i}@vimaru.edu.vn`);
    const extra = await pendingUser('thua@vimaru.edu.vn');
    const res = await approve(extra.id);
    assert.equal(res.statusCode, 409);
    assert.equal(code(res), 'USER_LIMIT_REACHED');
    assert.ok(!t.system.state.users.has('thua'));
  });

  test('US-T15 đặt quota lỗi → 500 PROVISIONING_FAILED, rollback sạch, user vẫn pending', async () => {
    const u = await pendingUser('loi@vimaru.edu.vn');
    t.system.failOn('setProjectQuota');
    const res = await approve(u.id);
    assert.equal(res.statusCode, 500);
    assert.equal(code(res), 'PROVISIONING_FAILED');
    assert.equal(t.system.state.users.size, 0, 'còn user Linux');
    assert.equal(t.system.state.homes.size, 0, 'còn thư mục');
    assert.equal(t.system.state.quotas.size, 0, 'còn quota');
    const list = (await t.req('GET', '/api/admin/users?status=pending', admin)).json();
    assert.ok(list.some((x) => x.id === u.id && x.status === 'pending'));

    // Sửa lỗi rồi duyệt lại → thành công, nhận dải cổng đầu tiên
    t.system.clearFailures();
    const again = await approve(u.id);
    assert.equal(again.statusCode, 200);
    assert.deepEqual(again.json().user.ports, { from: 10000, to: 10099 });
  });

  test('US-T29 xóa user có slot 3, duyệt user mới → nhận lại dải 10200–10299 nhưng UID mới', async () => {
    const users = [];
    for (let i = 1; i <= 3; i++) users.push(await activeUser(`s${i}@vimaru.edu.vn`));
    const third = users[2];
    assert.deepEqual(third.ports, { from: 10200, to: 10299 });
    const del = await t.req('DELETE', `/api/admin/users/${third.id}`, admin);
    assert.equal(del.statusCode, 200);

    const fresh = await activeUser('moi3@vimaru.edu.vn');
    assert.deepEqual(fresh.ports, { from: 10200, to: 10299 });
    const uids = users.map((u) => t.system.state.users.get(u.username)?.uid ?? null);
    const freshUid = t.system.state.users.get('moi3').uid;
    assert.ok(!uids.includes(freshUid), 'UID bị tái sử dụng');
    assert.ok(freshUid > Math.max(...users.map((u) => u.uid)));
  });

  // Không đặt tên bắt đầu bằng US-T12: US-T12 là test system, chỉ tick khi chạy trên server thật.
  test('[hỗ trợ US-T12] duyệt → gọi đúng các bước tạo user Linux, thư mục, quota 80/100 GiB', async () => {
    const u = await activeUser('vietnh@vimaru.edu.vn');
    const sys = t.system.state.users.get('vietnh');
    assert.ok(sys, 'không có user Linux');
    assert.equal(t.system.state.homes.get('vietnh'), sys.uid);
    assert.deepEqual(t.system.state.quotas.get(sys.uid), { soft: 80 * GiB, hard: 100 * GiB, path: '/data/users/vietnh' });
    assert.equal(u.status, 'active');
  });

  test('US-T24 user thường gọi GET /admin/users → 403 FORBIDDEN', async () => {
    await activeUser('thuong@vimaru.edu.vn');
    const { cookie } = await t.login('thuong@vimaru.edu.vn');
    const res = await t.req('GET', '/api/admin/users', cookie);
    assert.equal(res.statusCode, 403);
    assert.equal(code(res), 'FORBIDDEN');
  });

  test('US-T30 admin gọi GET /admin/users → 200', async () => {
    await pendingUser('p@vimaru.edu.vn');
    const res = await t.req('GET', '/api/admin/users', admin);
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.json()));
    assert.ok(res.json().some((u) => u.email === 'p@vimaru.edu.vn'));
  });

  test('US-T25 khóa user → 403 ACCOUNT_LOCKED, ca scheduled → cancelled, ca running → stopping → completed', async () => {
    const u = await activeUser('khoa@vimaru.edu.vn');
    const { cookie: oldCookie } = await t.login('khoa@vimaru.edu.vn');
    await t.db.query(`INSERT INTO images (name) VALUES ('vmu/pytorch:2.8-cuda12.8') ON CONFLICT DO NOTHING`);
    const { rows } = await t.db.query(
      `INSERT INTO bookings (user_id, start_at, end_at, use_gpu, image, status, actual_start_at) VALUES
        ($1, '2026-10-05T08:00:00+07:00', '2026-10-05T11:00:00+07:00', true, 'vmu/pytorch:2.8-cuda12.8', 'running', '2026-10-05T08:00:10+07:00'),
        ($1, '2026-10-07T08:00:00+07:00', '2026-10-07T10:00:00+07:00', false, 'vmu/pytorch:2.8-cuda12.8', 'scheduled', NULL)
       RETURNING id, status`, [u.id]);
    const [running, scheduled] = rows;

    const res = await t.req('POST', `/api/admin/users/${u.id}/lock`, admin);
    assert.equal(res.statusCode, 200);

    const relogin = await t.login('khoa@vimaru.edu.vn');
    assert.equal(relogin.res.statusCode, 403);
    assert.equal(code(relogin.res), 'ACCOUNT_LOCKED');
    const withOld = await t.req('GET', '/api/me', oldCookie);
    assert.equal(withOld.statusCode, 403);
    assert.equal(code(withOld), 'ACCOUNT_LOCKED');
    assert.equal(t.system.state.users.get('khoa').locked, true);

    const status = async (id) => (await t.db.query('SELECT status FROM bookings WHERE id = $1', [id])).rows[0].status;
    assert.equal(await status(scheduled.id), 'cancelled');
    assert.equal(await status(running.id), 'stopping');

    // Scheduler (M3) hoàn tất việc dừng
    const { runTick } = require('../../src/scheduler/tick');
    const { createFakeDocker } = require('../helpers/fake-docker');
    await runTick({ db: t.db, docker: createFakeDocker(), clock: t.clock });
    assert.equal(await status(running.id), 'completed');
  });

  test('US-T26 xóa user → dữ liệu còn, purge_after = now + 30 ngày; purge ở +31 ngày → dữ liệu bị xóa', async () => {
    const u = await activeUser('xoa@vimaru.edu.vn');
    const res = await t.req('DELETE', `/api/admin/users/${u.id}`, admin);
    assert.equal(res.statusCode, 200);
    assert.ok(t.system.state.homes.has('xoa'), 'dữ liệu bị xóa ngay');
    const { rows } = await t.db.query('SELECT status, purge_after FROM users WHERE id = $1', [u.id]);
    assert.equal(rows[0].status, 'deleted');
    assert.equal(rows[0].purge_after.getTime(), t.clock.now().getTime() + 30 * DAY);

    const { purgeDeletedUsers } = require('../../src/users/service');
    t.clock.advance(29 * DAY);
    await purgeDeletedUsers({ db: t.db, system: t.system, clock: t.clock });
    assert.ok(t.system.state.homes.has('xoa'), 'xóa quá sớm');

    t.clock.advance(2 * DAY);
    await purgeDeletedUsers({ db: t.db, system: t.system, clock: t.clock });
    assert.ok(!t.system.state.homes.has('xoa'));
    assert.deepEqual(t.system.state.purged, ['xoa']);
  });
});
