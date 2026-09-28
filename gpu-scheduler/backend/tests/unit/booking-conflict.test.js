// Giới hạn đồng thời — REQ-BK-02, REQ-BK-03, REQ-BK-04, REQ-BK-09
const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults: cfg } = require('../../src/config');
const { findConflict } = require('../../src/booking/conflict');

const at = (h) => Date.UTC(2026, 9, 6, h - 7, 0, 0); // giờ h ngày 06/10 giờ VN
const bk = (userId, from, to, useGpu = false, status = 'scheduled') => ({ userId, start: at(from), end: at(to), useGpu, status });
const cand = (from, to, useGpu = false, userId = 99) => ({ userId, start: at(from), end: at(to), useGpu });

test('BK-T07 có 1 ca không GPU chồng, đặt ca không GPU → hợp lệ', () => {
  assert.equal(findConflict([bk(1, 8, 10)], cand(9, 11), cfg), null);
});

test('BK-T08 có 1 ca GPU chồng, đặt ca không GPU → hợp lệ', () => {
  assert.equal(findConflict([bk(1, 8, 10, true)], cand(9, 11), cfg), null);
});

test('BK-T10 A 08–10, B 08–10, đặt 09–11 → SLOT_FULL', () => {
  assert.equal(findConflict([bk(1, 8, 10), bk(2, 8, 10)], cand(9, 11), cfg), 'SLOT_FULL');
});

test('BK-T11 A 08–10, B 10–12, đặt 09–11 → hợp lệ', () => {
  assert.equal(findConflict([bk(1, 8, 10), bk(2, 10, 12)], cand(9, 11), cfg), null);
});

test('BK-T12 A 08–10, B 09–11, đặt 09–10 → SLOT_FULL', () => {
  assert.equal(findConflict([bk(1, 8, 10), bk(2, 9, 11)], cand(9, 10), cfg), 'SLOT_FULL');
  // Chồng ở giữa khoảng mới, không chỉ tại start
  assert.equal(findConflict([bk(1, 8, 12), bk(2, 10, 11)], cand(9, 12), cfg), 'SLOT_FULL');
});

test('BK-T13 ca GPU 08–10, đặt ca GPU 10–12 (kề nhau) → hợp lệ', () => {
  assert.equal(findConflict([bk(1, 8, 10, true)], cand(10, 12, true), cfg), null);
  assert.equal(findConflict([bk(1, 10, 12, true)], cand(8, 10, true), cfg), null);
});

test('BK-T15 ca cancelled/completed/failed không tính vào xung đột', () => {
  const dead = ['cancelled', 'completed', 'failed'].flatMap((s, i) => [bk(i + 1, 8, 10, true, s), bk(i + 10, 8, 10, false, s)]);
  assert.equal(findConflict(dead, cand(8, 10, true), cfg), null);
  // Ca exited vẫn giữ chỗ tới hết giờ
  assert.equal(findConflict([bk(1, 8, 10, true, 'exited')], cand(8, 10, true), cfg), 'GPU_BUSY');
});

test('BK-T29 A 08–10 GPU, B 08–10 không GPU, đặt ca GPU 08–10 → GPU_BUSY (ưu tiên hơn SLOT_FULL)', () => {
  assert.equal(findConflict([bk(1, 8, 10, true), bk(2, 8, 10)], cand(8, 10, true), cfg), 'GPU_BUSY');
});

test('cùng user chồng thời gian → USER_OVERLAP (hỗ trợ BK-T14)', () => {
  assert.equal(findConflict([bk(99, 8, 10)], cand(9, 11), cfg), 'USER_OVERLAP');
  assert.equal(findConflict([bk(99, 8, 10)], cand(10, 11), cfg), null);
});
