const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('../helpers/app');

const vn = (s) => `${s}+07:00`;

describe('M6 — Thông báo', () => {
  let t;
  let A;
  let B;
  let ids; // id thông báo của A theo kind

  beforeEach(async () => {
    t = await createTestApp({ now: vn('2026-10-05T12:00:00') });
    const admin = await t.adminCookie('quantri@vimaru.edu.vn');
    const approve = async (email) => {
      const { body } = await t.login(email);
      const res = await t.req('POST', `/api/admin/users/${body.user.id}/approve`, admin);
      assert.equal(res.statusCode, 200, res.body);
      return { ...res.json().user, cookie: (await t.login(email)).cookie };
    };
    A = await approve('a@vimaru.edu.vn');
    B = await approve('b@vimaru.edu.vn');
    // Thông báo của A, cũ → mới
    const rows = [
      ['SOFT_QUOTA', null, 'Thư mục vượt 80 GiB', '2026-10-05T08:00:00'],
      ['START_FAILED', 41, 'Không khởi chạy được ca #41', '2026-10-05T09:00:00'],
      ['OOM', 42, 'Ca #42 bị OOM', '2026-10-05T10:00:00'],
      ['END_WARNING', 42, 'Ca của bạn kết thúc lúc 11:00 (GMT+7). Hãy lưu checkpoint.', '2026-10-05T10:45:00'],
    ];
    await t.db.query(`INSERT INTO images (name) VALUES ('img')`);
    for (const id of [41, 42]) {
      await t.db.query(
        `INSERT INTO bookings (id, user_id, start_at, end_at, use_gpu, image, status) VALUES ($1, $2, $3, $4, true, 'img', 'completed')`,
        [id, A.id, vn('2026-10-05T09:00:00'), vn('2026-10-05T11:00:00')]);
    }
    ids = {};
    for (const [kind, bookingId, message, at] of rows) {
      const r = await t.db.query(
        'INSERT INTO notifications (user_id, booking_id, kind, message, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [A.id, bookingId, kind, message, vn(at)]);
      ids[kind] = r.rows[0].id;
    }
    await t.db.query(`INSERT INTO notifications (user_id, kind, message) VALUES ($1, 'SOFT_QUOTA', 'của B')`, [B.id]);
  });
  afterEach(async () => { await t.close(); });

  const list = async (u, qs = '') => {
    const res = await t.req('GET', `/api/notifications${qs}`, u.cookie);
    assert.equal(res.statusCode, 200, res.body);
    return res.json();
  };

  test('MN-T06 GET /notifications: đủ 4 loại, mới nhất trước, đủ trường, unread_count, ?unread=1, ?limit=2', async () => {
    const r = await list(A);
    assert.equal(r.unread_count, 4);
    assert.deepEqual(r.items.map((n) => n.kind), ['END_WARNING', 'OOM', 'START_FAILED', 'SOFT_QUOTA']);
    const warn = r.items[0];
    assert.deepEqual(warn, {
      id: ids.END_WARNING,
      kind: 'END_WARNING',
      booking_id: 42,
      message: 'Ca của bạn kết thúc lúc 11:00 (GMT+7). Hãy lưu checkpoint.',
      created_at: '2026-10-05T10:45:00+07:00',
      read_at: null,
    });
    assert.equal(r.items[3].booking_id, null);

    await t.db.query('UPDATE notifications SET read_at = now() WHERE id = $1', [ids.OOM]);
    const unread = await list(A, '?unread=1');
    assert.deepEqual(unread.items.map((n) => n.kind), ['END_WARNING', 'START_FAILED', 'SOFT_QUOTA']);
    assert.equal(unread.unread_count, 3);

    const limited = await list(A, '?limit=2');
    assert.equal(limited.items.length, 2);
    assert.equal(limited.unread_count, 3);
  });

  test('MN-T07 B không thấy thông báo của A; B đánh dấu đã đọc thông báo của A → 404, thông báo vẫn chưa đọc', async () => {
    const r = await list(B);
    assert.deepEqual(r.items.map((n) => n.message), ['của B']);
    const res = await t.req('POST', `/api/notifications/${ids.OOM}/read`, B.cookie);
    assert.equal(res.statusCode, 404);
    assert.equal(res.json().error.code, 'NOT_FOUND');
    assert.equal((await list(A)).unread_count, 4);
    // read-all của B không ảnh hưởng A
    assert.equal((await t.req('POST', '/api/notifications/read-all', B.cookie)).statusCode, 204);
    assert.equal((await list(A)).unread_count, 4);
  });

  test('MN-T08 đánh dấu một thông báo, rồi tất cả, đã đọc', async () => {
    const res = await t.req('POST', `/api/notifications/${ids.END_WARNING}/read`, A.cookie);
    assert.equal(res.statusCode, 204);
    let r = await list(A);
    assert.equal(r.unread_count, 3);
    assert.equal(r.items[0].read_at, '2026-10-05T12:00:00+07:00');

    assert.equal((await t.req('POST', '/api/notifications/read-all', A.cookie)).statusCode, 204);
    r = await list(A);
    assert.equal(r.unread_count, 0);
    assert.ok(r.items.every((n) => n.read_at));
    // Thông báo đã đọc từ trước giữ nguyên thời điểm đọc
    assert.equal(r.items[0].read_at, '2026-10-05T12:00:00+07:00');
  });
});
