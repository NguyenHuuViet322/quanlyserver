const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('../helpers/app');

const IMAGE = 'vmu/pytorch:2.8-cuda12.8';
const vn = (s) => `${s}+07:00`;

describe('M2 — Đặt lịch', () => {
  let t;
  let admin;
  let A;
  let B;
  let C;
  let D;

  // Đồng hồ: Thứ Hai 05/10/2026, 09:20 giờ VN
  beforeEach(async () => {
    t = await createTestApp({ now: '2026-10-05T09:20:00+07:00' });
    // Admin (bootstrap, còn pending) duyệt A–D trước để A nhận dải cổng 10000–10099, rồi tự duyệt mình
    admin = await t.adminCookie('quantri@vimaru.edu.vn');
    await t.db.query('INSERT INTO images (name) VALUES ($1)', [IMAGE]);
    const approve = async (email) => {
      const { body } = await t.login(email);
      const res = await t.req('POST', `/api/admin/users/${body.user.id}/approve`, admin);
      assert.equal(res.statusCode, 200, res.body);
      return { ...res.json().user, cookie: (await t.login(email)).cookie };
    };
    A = await approve('a@vimaru.edu.vn');
    B = await approve('b@vimaru.edu.vn');
    C = await approve('c@vimaru.edu.vn');
    D = await approve('d@vimaru.edu.vn');
    await approve('quantri@vimaru.edu.vn');
  });
  afterEach(async () => { await t.close(); });

  const code = (res) => res.json().error?.code;
  const book = (u, start, end, use_gpu = false, extra = {}) =>
    t.req('POST', '/api/bookings', u.cookie, { start, end, use_gpu, image: IMAGE, ...extra });
  const count = async () => (await t.db.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n;
  async function insertBooking(u, start, end, useGpu, status, actual = {}) {
    const { rows } = await t.db.query(
      `INSERT INTO bookings (user_id, start_at, end_at, use_gpu, image, status, actual_start_at, actual_end_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [u.id, start, end, useGpu, IMAGE, status, actual.start ?? null, actual.end ?? null],
    );
    return rows[0].id;
  }

  test('BK-T01 server trống, đặt ca hợp lệ → 201, scheduled', async () => {
    const res = await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T11:00:00'), true);
    assert.equal(res.statusCode, 201, res.body);
    const b = res.json();
    assert.equal(b.status, 'scheduled');
    assert.equal(b.user, 'a');
    assert.equal(b.use_gpu, true);
    assert.equal(b.start, '2026-10-06T08:00:00+07:00');
    assert.equal(b.end, '2026-10-06T11:00:00+07:00');
    assert.equal(b.container_name, `vmu-bk-${b.id}`);
  });

  test('BK-T09 có ca GPU 08–10 của A, B đặt ca GPU 09–11 → 409 GPU_BUSY, không có bản ghi mới', async () => {
    assert.equal((await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'), true)).statusCode, 201);
    const before = await count();
    const res = await book(B, vn('2026-10-06T09:00:00'), vn('2026-10-06T11:00:00'), true);
    assert.equal(res.statusCode, 409);
    assert.equal(code(res), 'GPU_BUSY');
    assert.equal(await count(), before);
  });

  test('BK-T14 user A có 08–10, A đặt 09–11 → 409 USER_OVERLAP', async () => {
    assert.equal((await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'))).statusCode, 201);
    const res = await book(A, vn('2026-10-06T09:00:00'), vn('2026-10-06T11:00:00'));
    assert.equal(res.statusCode, 409);
    assert.equal(code(res), 'USER_OVERLAP');
  });

  test('BK-T16 đã có 10 giờ GPU trong tuần, đặt ca GPU sau now + 24h → 409 GPU_QUOTA_EXCEEDED', async () => {
    await insertBooking(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T13:00:00'), true, 'scheduled');
    await insertBooking(A, vn('2026-10-07T08:00:00'), vn('2026-10-07T13:00:00'), true, 'scheduled');
    const res = await book(A, vn('2026-10-08T08:00:00'), vn('2026-10-08T10:00:00'), true);
    assert.equal(res.statusCode, 409);
    assert.equal(code(res), 'GPU_QUOTA_EXCEEDED');
  });

  test('BK-T17 đã hết hạn mức, đặt ca GPU bắt đầu trước now + 24h → 201', async () => {
    await insertBooking(A, vn('2026-10-06T12:00:00'), vn('2026-10-06T17:00:00'), true, 'scheduled');
    await insertBooking(A, vn('2026-10-07T08:00:00'), vn('2026-10-07T13:00:00'), true, 'scheduled');
    const res = await book(A, vn('2026-10-05T20:00:00'), vn('2026-10-05T22:00:00'), true);
    assert.equal(res.statusCode, 201, res.body);
  });

  // Lặp nhiều khung giờ để tăng khả năng hai transaction thực sự chen nhau
  test('BK-T19 2 request đồng thời tranh cùng khung GPU → đúng 1 thành công, 1 GPU_BUSY', async () => {
    for (let day = 6; day <= 11; day++) {
      const d = String(day).padStart(2, '0');
      const results = await Promise.all([
        book(A, vn(`2026-10-${d}T08:00:00`), vn(`2026-10-${d}T10:00:00`), true),
        book(B, vn(`2026-10-${d}T08:00:00`), vn(`2026-10-${d}T10:00:00`), true),
      ]);
      assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409], `ngày ${d}`);
      assert.equal(code(results.find((r) => r.statusCode === 409)), 'GPU_BUSY');
    }
    assert.equal(await count(), 6);
  });

  test('BK-T20 3 request đồng thời vào khung còn 1 chỗ → đúng 1 thành công', async () => {
    for (let day = 6; day <= 11; day++) {
      const d = String(day).padStart(2, '0');
      const slot = [vn(`2026-10-${d}T08:00:00`), vn(`2026-10-${d}T10:00:00`)];
      assert.equal((await book(A, ...slot)).statusCode, 201);
      const results = await Promise.all([B, C, D].map((u) => book(u, ...slot)));
      assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409, 409], `ngày ${d}`);
      for (const r of results.filter((x) => x.statusCode === 409)) assert.equal(code(r), 'SLOT_FULL');
    }
    assert.equal(await count(), 12);
  });

  test('BK-T21 B hủy / kết thúc sớm / khởi động lại ca của A → 403 FORBIDDEN', async () => {
    const id = (await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'))).json().id;
    for (const action of ['cancel', 'end', 'restart']) {
      const res = await t.req('POST', `/api/bookings/${id}/${action}`, B.cookie);
      assert.equal(res.statusCode, 403, action);
      assert.equal(code(res), 'FORBIDDEN', action);
    }
  });

  test('BK-T30 admin hủy ca scheduled của A → 200, cancelled', async () => {
    const id = (await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'))).json().id;
    const res = await t.req('POST', `/api/bookings/${id}/cancel`, admin);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'cancelled');
  });

  test('BK-T27 hủy ca không tồn tại → 404 NOT_FOUND', async () => {
    const res = await t.req('POST', '/api/bookings/999999/cancel', A.cookie);
    assert.equal(res.statusCode, 404);
    assert.equal(code(res), 'NOT_FOUND');
  });

  test('BK-T22 hủy ca scheduled → cancelled; đặt lại ngay đúng khung → 201', async () => {
    const id = (await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'), true)).json().id;
    const res = await t.req('POST', `/api/bookings/${id}/cancel`, A.cookie);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'cancelled');
    assert.equal((await book(B, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'), true)).statusCode, 201);
  });

  test('BK-T26 hủy ca completed → 409 INVALID_STATE', async () => {
    const id = await insertBooking(A, vn('2026-10-05T06:00:00'), vn('2026-10-05T08:00:00'), false, 'completed');
    const res = await t.req('POST', `/api/bookings/${id}/cancel`, A.cookie);
    assert.equal(res.statusCode, 409);
    assert.equal(code(res), 'INVALID_STATE');
  });

  test('BK-T25 thiếu use_gpu → 400 VALIDATION_ERROR', async () => {
    const res = await t.req('POST', '/api/bookings', A.cookie, { start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00'), image: IMAGE });
    assert.equal(res.statusCode, 400);
    assert.equal(code(res), 'VALIDATION_ERROR');
    const str = await t.req('POST', '/api/bookings', A.cookie, { start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00'), image: IMAGE, use_gpu: 'true' });
    assert.equal(str.statusCode, 400);
    assert.equal(code(str), 'VALIDATION_ERROR');
  });

  test('BK-T31 image ngoài danh sách → 400 IMAGE_NOT_ALLOWED', async () => {
    const res = await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'), false, { image: 'ubuntu:latest' });
    assert.equal(res.statusCode, 400);
    assert.equal(code(res), 'IMAGE_NOT_ALLOWED');
  });

  test('BK-T32 user dải 10000–10099 xin cổng 10100 → 400 PORT_NOT_ALLOWED; cổng 10099 → 201', async () => {
    assert.deepEqual(A.ports, { from: 10000, to: 10099 });
    const bad = await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'), false, { ports: [10001, 10100] });
    assert.equal(bad.statusCode, 400);
    assert.equal(code(bad), 'PORT_NOT_ALLOWED');
    const ok = await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'), false, { ports: [10099] });
    assert.equal(ok.statusCode, 201, ok.body);
    assert.deepEqual(ok.json().ports, [10099]);
  });

  test('BK-T33 start không có múi giờ → 400 INVALID_TIME, reason MISSING_TIMEZONE', async () => {
    const res = await book(A, '2026-10-05T09:00:00', '2026-10-05T11:00:00');
    assert.equal(res.statusCode, 400);
    assert.equal(code(res), 'INVALID_TIME');
    assert.equal(res.json().error.details.reason, 'MISSING_TIMEZONE');
  });

  test('BK-T34 đặt bằng giờ UTC → response giờ VN; đặt lại cùng khung bằng +07:00 → USER_OVERLAP', async () => {
    const res = await book(A, '2026-10-06T01:00:00Z', '2026-10-06T04:00:00Z');
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().start, '2026-10-06T08:00:00+07:00');
    assert.equal(res.json().end, '2026-10-06T11:00:00+07:00');
    const again = await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T11:00:00'));
    assert.equal(again.statusCode, 409);
    assert.equal(code(again), 'USER_OVERLAP');
  });

  test('BK-T37 hết 10 giờ GPU tuần này (now = Thứ Sáu): Chủ nhật 23–24 → GPU_QUOTA_EXCEEDED; Thứ Hai 00–01 → 201', async () => {
    t.clock.set('2026-10-09T10:00:00+07:00');
    await insertBooking(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T13:00:00'), true, 'completed', { start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T13:00:00') });
    await insertBooking(A, vn('2026-10-07T08:00:00'), vn('2026-10-07T13:00:00'), true, 'completed', { start: vn('2026-10-07T08:00:00'), end: vn('2026-10-07T13:00:00') });
    const sunday = await book(A, vn('2026-10-11T23:00:00'), vn('2026-10-12T00:00:00'), true);
    assert.equal(sunday.statusCode, 409);
    assert.equal(code(sunday), 'GPU_QUOTA_EXCEEDED');
    const monday = await book(A, vn('2026-10-12T00:00:00'), vn('2026-10-12T01:00:00'), true);
    assert.equal(monday.statusCode, 201, monday.body);
  });
});
