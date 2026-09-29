const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('../helpers/app');

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
    t.req('POST', '/api/bookings', u.cookie, { start, end, use_gpu, ...extra });
  const count = async () => (await t.db.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n;
  async function insertBooking(u, start, end, useGpu, status, actual = {}) {
    const { rows } = await t.db.query(
      `INSERT INTO bookings (user_id, start_at, end_at, use_gpu, status, actual_start_at, actual_end_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [u.id, start, end, useGpu, status, actual.start ?? null, actual.end ?? null],
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

  // Lặp nhiều khung giờ để tăng khả năng hai transaction thực sự chen nhau.
  // Luân phiên cặp (A, B) / (C, D): mỗi người thắng tối đa 3 lần × 2 giờ = 6 giờ < 10 giờ GPU/tuần,
  // để lỗi trả về chỉ có thể là GPU_BUSY chứ không phải GPU_QUOTA_EXCEEDED.
  test('BK-T19 2 request đồng thời tranh cùng khung GPU → đúng 1 thành công, 1 GPU_BUSY', async () => {
    for (let day = 6; day <= 11; day++) {
      const d = String(day).padStart(2, '0');
      const [u1, u2] = day % 2 ? [A, B] : [C, D];
      const results = await Promise.all([
        book(u1, vn(`2026-10-${d}T08:00:00`), vn(`2026-10-${d}T10:00:00`), true),
        book(u2, vn(`2026-10-${d}T08:00:00`), vn(`2026-10-${d}T10:00:00`), true),
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
    const res = await t.req('POST', '/api/bookings', A.cookie, { start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00') });
    assert.equal(res.statusCode, 400);
    assert.equal(code(res), 'VALIDATION_ERROR');
    const str = await t.req('POST', '/api/bookings', A.cookie, { start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00'), use_gpu: 'true' });
    assert.equal(str.statusCode, 400);
    assert.equal(code(str), 'VALIDATION_ERROR');
  });

  test('BK-T41 gửi thêm image và ports → vẫn 201, ca không có hai trường này', async () => {
    const res = await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'), false, { image: 'ubuntu:latest', ports: [22, 10001] });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().image, undefined);
    assert.equal(res.json().ports, undefined);
  });

  test('BK-T42 GET /calendar: ca của mọi người kèm username, use_gpu, status, mine; có completed, không có cancelled/failed; quá 8 ngày hoặc quá 28 ngày trước → 400', async () => {
    const a = (await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'), true)).json();
    const b = (await book(B, vn('2026-10-06T09:00:00'), vn('2026-10-06T12:00:00'))).json();
    const done = await insertBooking(C, vn('2026-10-05T06:00:00'), vn('2026-10-05T08:00:00'), false, 'completed');
    await insertBooking(C, vn('2026-10-06T13:00:00'), vn('2026-10-06T14:00:00'), false, 'cancelled');
    await insertBooking(D, vn('2026-10-06T15:00:00'), vn('2026-10-06T16:00:00'), false, 'failed');
    const res = await t.req('GET', '/api/calendar?from=2026-10-05&to=2026-10-13', A.cookie);
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json(), [
      { id: done, start: '2026-10-05T06:00:00+07:00', end: '2026-10-05T08:00:00+07:00', username: 'c', use_gpu: false, status: 'completed', mine: false },
      { id: a.id, start: '2026-10-06T08:00:00+07:00', end: '2026-10-06T10:00:00+07:00', username: 'a', use_gpu: true, status: 'scheduled', mine: true },
      { id: b.id, start: '2026-10-06T09:00:00+07:00', end: '2026-10-06T12:00:00+07:00', username: 'b', use_gpu: false, status: 'scheduled', mine: false },
    ]);
    const tooLong = await t.req('GET', '/api/calendar?from=2026-10-05&to=2026-10-14', A.cookie);
    assert.equal(tooLong.statusCode, 400);
    assert.equal(code(tooLong), 'VALIDATION_ERROR');
    const tooOld = await t.req('GET', '/api/calendar?from=2026-09-06&to=2026-09-13', A.cookie);
    assert.equal(tooOld.statusCode, 400);
    const ok28 = await t.req('GET', '/api/calendar?from=2026-09-07&to=2026-09-14', A.cookie);
    assert.equal(ok28.statusCode, 200);
  });

  test('BK-T43 POST /bookings/check: từng quy tắc khớp với kết quả POST /bookings, không tạo ca', async () => {
    const check = (u, start, end, use_gpu) => t.req('POST', '/api/bookings/check', u.cookie, { start: vn(start), end: vn(end), use_gpu });
    const rules = (res) => Object.fromEntries(res.json().checks.map((c) => [c.rule, c.ok ? true : c.ok === null ? null : c.code]));
    // Hợp lệ
    let r = await check(A, '2026-10-06T08:00:00', '2026-10-06T10:00:00', true);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().ok, true);
    assert.deepEqual(rules(r), { TIME: true, USER_OVERLAP: true, CAPACITY: true, GPU_QUOTA: true });
    assert.equal(await count(), 0, 'check đã tạo ca');
    // Dựng tình huống
    assert.equal((await book(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T10:00:00'), true)).statusCode, 201);
    assert.equal((await book(B, vn('2026-10-06T14:00:00'), vn('2026-10-06T16:00:00'))).statusCode, 201);
    assert.equal((await book(C, vn('2026-10-06T14:00:00'), vn('2026-10-06T16:00:00'))).statusCode, 201);
    await insertBooking(D, vn('2026-10-07T00:00:00'), vn('2026-10-07T05:00:00'), true, 'scheduled');
    await insertBooking(D, vn('2026-10-08T00:00:00'), vn('2026-10-08T05:00:00'), true, 'scheduled');
    const cases = [
      [B, '2026-10-06T09:00:00', '2026-10-06T11:00:00', true, 'CAPACITY', 'GPU_BUSY'],
      [D, '2026-10-06T15:00:00', '2026-10-06T16:00:00', false, 'CAPACITY', 'SLOT_FULL'],
      [A, '2026-10-06T09:00:00', '2026-10-06T11:00:00', false, 'USER_OVERLAP', 'USER_OVERLAP'],
      [D, '2026-10-09T08:00:00', '2026-10-09T10:00:00', true, 'GPU_QUOTA', 'GPU_QUOTA_EXCEEDED'],
    ];
    for (const [u, s1, e1, gpu, rule, errCode] of cases) {
      r = await check(u, s1, e1, gpu);
      assert.equal(r.json().ok, false, errCode);
      assert.equal(rules(r)[rule], errCode, errCode);
      const real = await book(u, vn(s1), vn(e1), gpu);
      assert.equal(real.statusCode, 409, errCode);
      assert.equal(code(real), errCode);
    }
    // Giờ trong quá khứ: TIME lỗi, các quy tắc khác chưa kiểm
    r = await check(A, '2026-10-05T08:00:00', '2026-10-05T09:00:00', false);
    const time = r.json().checks.find((c) => c.rule === 'TIME');
    assert.deepEqual({ ok: time.ok, code: time.code, reason: time.reason }, { ok: false, code: 'INVALID_TIME', reason: 'IN_PAST' });
    assert.deepEqual(rules(r), { TIME: 'INVALID_TIME', USER_OVERLAP: null, CAPACITY: null, GPU_QUOTA: null });
    assert.equal(code(await book(A, vn('2026-10-05T08:00:00'), vn('2026-10-05T09:00:00'), false)), 'INVALID_TIME');
    // Thiếu use_gpu → 400
    const bad = await t.req('POST', '/api/bookings/check', A.cookie, { start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00') });
    assert.equal(bad.statusCode, 400);
  });

  test('BK-T44 GET /me có gpu_quota tuần hiện tại: tính ca GPU đã đặt và giờ thực dùng của ca completed', async () => {
    await insertBooking(A, vn('2026-10-06T08:00:00'), vn('2026-10-06T11:00:00'), true, 'scheduled');
    await insertBooking(A, vn('2026-10-05T00:00:00'), vn('2026-10-05T04:00:00'), true, 'completed', { start: vn('2026-10-05T00:00:00'), end: vn('2026-10-05T01:00:00') });
    await insertBooking(A, vn('2026-10-07T08:00:00'), vn('2026-10-07T12:00:00'), false, 'scheduled');
    await insertBooking(A, vn('2026-10-12T08:00:00'), vn('2026-10-12T12:00:00'), true, 'scheduled'); // tuần sau
    const me = (await t.req('GET', '/api/me', A.cookie)).json();
    assert.deepEqual(me.gpu_quota, { week_start: '2026-10-05T00:00:00+07:00', limit_hours: 10, used_hours: 4, remaining_hours: 6 });
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
