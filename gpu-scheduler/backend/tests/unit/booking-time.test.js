// Hợp lệ thời gian — REQ-BK-01, REQ-BK-11, REQ-BK-12
const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults: cfg } = require('../../src/config');
const { validateBookingTimes } = require('../../src/booking/rules');

// Mọi mốc viết kèm +07:00 nên kết quả không phụ thuộc TZ của tiến trình
const vn = (s) => `${s}+07:00`;
const ms = (s) => new Date(vn(s)).getTime();
const NOW = ms('2026-10-05T09:20:00'); // Thứ Hai 05/10, 09:20 giờ VN

function reasonOf(start, end, now = NOW) {
  try {
    validateBookingTimes(start, end, now, cfg);
    return 'OK';
  } catch (e) {
    assert.equal(e.status, 400);
    assert.equal(e.code, 'INVALID_TIME');
    return e.details.reason;
  }
}

test('BK-T02 end ≤ start → INVALID_TIME END_BEFORE_START', () => {
  assert.equal(reasonOf(vn('2026-10-06T10:00:00'), vn('2026-10-06T09:00:00')), 'END_BEFORE_START');
  assert.equal(reasonOf(vn('2026-10-06T10:00:00'), vn('2026-10-06T10:00:00')), 'END_BEFORE_START');
});

test('BK-T03 start trong quá khứ → INVALID_TIME IN_PAST', () => {
  assert.equal(reasonOf(vn('2026-10-04T08:00:00'), vn('2026-10-04T10:00:00')), 'IN_PAST');
});

test('BK-T04 ca 9 giờ → TOO_LONG; đúng 8 giờ → hợp lệ', () => {
  assert.equal(reasonOf(vn('2026-10-06T08:00:00'), vn('2026-10-06T17:00:00')), 'TOO_LONG');
  assert.equal(reasonOf(vn('2026-10-06T08:00:00'), vn('2026-10-06T16:00:00')), 'OK');
});

test('BK-T24 09:00–09:30 → NOT_ALIGNED; start = end → END_BEFORE_START; 1 giờ → hợp lệ', () => {
  assert.equal(reasonOf(vn('2026-10-06T09:00:00'), vn('2026-10-06T09:30:00')), 'NOT_ALIGNED');
  assert.equal(reasonOf(vn('2026-10-06T09:00:00'), vn('2026-10-06T09:00:00')), 'END_BEFORE_START');
  assert.equal(reasonOf(vn('2026-10-06T09:00:00'), vn('2026-10-06T10:00:00')), 'OK');
});

test('BK-T05 mốc 09:10, 09:30, 09:00:30, 09:00:00.500 → NOT_ALIGNED', () => {
  for (const s of ['09:10:00', '09:30:00', '09:00:30', '09:00:00.500']) {
    assert.equal(reasonOf(vn(`2026-10-06T${s}`), vn('2026-10-06T11:00:00')), 'NOT_ALIGNED', s);
  }
});

test('BK-T06 start = now + 7 ngày + 1 giờ → BEYOND_HORIZON; đúng biên 7 ngày → hợp lệ', () => {
  const now = ms('2026-10-05T09:00:00');
  assert.equal(reasonOf(vn('2026-10-12T10:00:00'), vn('2026-10-12T11:00:00'), now), 'BEYOND_HORIZON');
  assert.equal(reasonOf(vn('2026-10-12T09:00:00'), vn('2026-10-12T10:00:00'), now), 'OK');
});

test('BK-T35 giờ tròn xét theo giờ VN sau quy đổi: 11:00+09:00 hợp lệ; 09:00+05:30 → NOT_ALIGNED', () => {
  assert.equal(reasonOf('2026-10-06T11:00:00+09:00', '2026-10-06T13:00:00+09:00'), 'OK');
  assert.equal(reasonOf('2026-10-06T09:00:00+05:30', '2026-10-06T11:00:00+05:30'), 'NOT_ALIGNED');
  // Cùng thời điểm, offset khác nhau → cùng kết quả
  const a = validateBookingTimes('2026-10-06T01:00:00Z', '2026-10-06T04:00:00Z', NOW, cfg);
  const b = validateBookingTimes(vn('2026-10-06T08:00:00'), vn('2026-10-06T11:00:00'), NOW, cfg);
  assert.deepEqual(a, b);
});

test('BK-T36 ca qua nửa đêm 22:00 – 02:00 (4 giờ) hợp lệ; 20:00 – 05:00 (9 giờ) → TOO_LONG', () => {
  assert.equal(reasonOf(vn('2026-10-06T22:00:00'), vn('2026-10-07T02:00:00')), 'OK');
  assert.equal(reasonOf(vn('2026-10-06T20:00:00'), vn('2026-10-07T05:00:00')), 'TOO_LONG');
});

test('BK-T39 now = 09:20: đặt 09–10 → IN_PAST; đặt 10–11 → hợp lệ', () => {
  assert.equal(reasonOf(vn('2026-10-05T09:00:00'), vn('2026-10-05T10:00:00')), 'IN_PAST');
  assert.equal(reasonOf(vn('2026-10-05T10:00:00'), vn('2026-10-05T11:00:00')), 'OK');
});

test('BK-T40 now = 23:30 ngày 05/10: đặt 00:00–02:00 ngày 06/10 → hợp lệ', () => {
  const now = ms('2026-10-05T23:30:00');
  assert.equal(reasonOf(vn('2026-10-06T00:00:00'), vn('2026-10-06T02:00:00'), now), 'OK');
  const r = validateBookingTimes(vn('2026-10-06T00:00:00'), vn('2026-10-06T02:00:00'), now, cfg);
  assert.equal(r.start, Date.UTC(2026, 9, 5, 17, 0, 0)); // 00:00 VN 06/10 = 17:00Z 05/10
});

test('thiếu múi giờ → INVALID_TIME MISSING_TIMEZONE (hỗ trợ BK-T33)', () => {
  assert.equal(reasonOf('2026-10-06T09:00:00', '2026-10-06T10:00:00'), 'MISSING_TIMEZONE');
  assert.equal(reasonOf(vn('2026-10-06T09:00:00'), '2026-10-06T10:00:00'), 'MISSING_TIMEZONE');
});
