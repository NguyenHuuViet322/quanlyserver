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
      start: '2026-10-06T08:00:00+07:00', end: '2026-10-06T10:00:00+07:00', use_gpu: false,
    });
    assert.equal(res.statusCode, 403);
    assert.equal(code(res), 'ACCOUNT_PENDING');
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

    // Sửa lỗi rồi duyệt lại → thành công
    t.system.clearFailures();
    const again = await approve(u.id);
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().user.status, 'active');
    assert.equal(again.json().user.ports, undefined);
  });

  test('US-T29 xóa user rồi duyệt user mới → UID mới lớn hơn mọi UID đã cấp, UID cũ không bị dùng lại', async () => {
    const users = [];
    for (let i = 1; i <= 3; i++) users.push(await activeUser(`s${i}@vimaru.edu.vn`));
    const del = await t.req('DELETE', `/api/admin/users/${users[1].id}`, admin);
    assert.equal(del.statusCode, 200);
    const fresh = await activeUser('moi3@vimaru.edu.vn');
    const oldUids = users.map((u) => u.uid);
    assert.ok(!oldUids.includes(fresh.uid), 'UID bị tái sử dụng');
    assert.ok(fresh.uid > Math.max(...oldUids));
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

  test('US-T32 từ chối pending → rejected, không tạo user Linux; đăng nhập → 403 ACCOUNT_REJECTED; từ chối active → 409; duyệt lại rejected → active', async () => {
    const u = await pendingUser('tuchoi@vimaru.edu.vn');
    const res = await t.req('POST', `/api/admin/users/${u.id}/reject`, admin);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().user.status, 'rejected');
    assert.ok(!t.system.state.users.has('tuchoi'));
    const login = await t.login('tuchoi@vimaru.edu.vn');
    assert.equal(login.res.statusCode, 403);
    assert.equal(code(login.res), 'ACCOUNT_REJECTED');
    const active = await activeUser('dangdung@vimaru.edu.vn');
    const bad = await t.req('POST', `/api/admin/users/${active.id}/reject`, admin);
    assert.equal(bad.statusCode, 409);
    assert.equal(code(bad), 'INVALID_STATE');
    const again = await approve(u.id);
    assert.equal(again.statusCode, 200, again.body);
    assert.equal(again.json().user.status, 'active');
    assert.ok(t.system.state.users.has('tuchoi'));
  });

  test('US-T33 admin cấp lại mật khẩu SSH: response không có mật khẩu; user thấy mật khẩu mới ở /me/password; pending → 409; user thường → 403', async () => {
    const u = await activeUser('quenmk@vimaru.edu.vn');
    const { cookie } = await t.login('quenmk@vimaru.edu.vn');
    await t.req('POST', '/api/me/password/ack', cookie);
    const before = t.system.state.users.get('quenmk').password;
    const res = await t.req('POST', `/api/admin/users/${u.id}/password-reset`, admin);
    assert.equal(res.statusCode, 200, res.body);
    const after = t.system.state.users.get('quenmk');
    assert.notEqual(after.password, before);
    assert.equal(after.mustChange, true);
    assert.ok(!res.body.includes(after.password), 'admin thấy mật khẩu');
    const shown = await t.req('GET', '/api/me/password', cookie);
    assert.equal(shown.statusCode, 200);
    assert.equal(shown.json().password, after.password);
    const p = await pendingUser('chua@vimaru.edu.vn');
    const bad = await t.req('POST', `/api/admin/users/${p.id}/password-reset`, admin);
    assert.equal(bad.statusCode, 409);
    const forbidden = await t.req('POST', `/api/admin/users/${u.id}/password-reset`, cookie);
    assert.equal(forbidden.statusCode, 403);
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
    const { rows } = await t.db.query(
      `INSERT INTO bookings (user_id, start_at, end_at, use_gpu, status, actual_start_at) VALUES
        ($1, '2026-10-05T08:00:00+07:00', '2026-10-05T11:00:00+07:00', true, 'running', '2026-10-05T08:00:10+07:00'),
        ($1, '2026-10-07T08:00:00+07:00', '2026-10-07T10:00:00+07:00', false, 'scheduled', NULL)
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
