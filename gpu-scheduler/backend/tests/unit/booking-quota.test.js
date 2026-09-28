// Hạn mức GPU theo tuần — REQ-BK-05, REQ-BK-12
const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults: cfg } = require('../../src/config');
const { splitByWeek, checkGpuQuota } = require('../../src/booking/quota');

const ms = (s) => new Date(`${s}+07:00`).getTime();
const HOUR = 3600 * 1000;

test('BK-T18 đã hết hạn mức GPU, đặt ca không GPU → hợp lệ', () => {
  const now = ms('2026-10-05T09:20:00');
  const used = [
    { useGpu: true, status: 'scheduled', start: ms('2026-10-06T08:00:00'), end: ms('2026-10-06T13:00:00') },
    { useGpu: true, status: 'scheduled', start: ms('2026-10-07T08:00:00'), end: ms('2026-10-07T13:00:00') },
  ];
  const nonGpu = { useGpu: false, start: ms('2026-10-08T08:00:00'), end: ms('2026-10-08T12:00:00') };
  assert.equal(checkGpuQuota(used, nonGpu, now, cfg), null);
  const gpu = { ...nonGpu, useGpu: true };
  assert.equal(checkGpuQuota(used, gpu, now, cfg), 'GPU_QUOTA_EXCEEDED');
});

test('BK-T28 ca GPU Chủ nhật 22:00 – Thứ Hai 02:00 → 2 giờ tuần cũ, 2 giờ tuần mới; ranh giới = Chủ nhật 17:00 UTC', () => {
  const parts = splitByWeek(ms('2026-10-11T22:00:00'), ms('2026-10-12T02:00:00'), cfg.timezone);
  assert.deepEqual(parts, [
    { weekStart: ms('2026-10-05T00:00:00'), ms: 2 * HOUR },
    { weekStart: ms('2026-10-12T00:00:00'), ms: 2 * HOUR },
  ]);
  assert.equal(parts[1].weekStart, Date.UTC(2026, 9, 11, 17, 0, 0));
});

test('giờ thực dùng của ca completed, và cắt theo tuần khi kiểm hạn mức (hỗ trợ BK-T16, BK-T37)', () => {
  const now = ms('2026-10-09T10:00:00'); // Thứ Sáu
  // 10 giờ trong tuần 05–11/10; ca thứ hai kết thúc sớm nên chỉ tính giờ thực dùng
  const used = [
    { useGpu: true, status: 'completed', start: ms('2026-10-06T08:00:00'), end: ms('2026-10-06T16:00:00'), actualStart: ms('2026-10-06T08:00:00'), actualEnd: ms('2026-10-06T16:00:00') },
    { useGpu: true, status: 'completed', start: ms('2026-10-07T08:00:00'), end: ms('2026-10-07T16:00:00'), actualStart: ms('2026-10-07T08:00:00'), actualEnd: ms('2026-10-07T10:00:00') },
  ];
  const sunday = { useGpu: true, start: ms('2026-10-11T23:00:00'), end: ms('2026-10-12T00:00:00') };
  const monday = { useGpu: true, start: ms('2026-10-12T00:00:00'), end: ms('2026-10-12T01:00:00') };
  assert.equal(checkGpuQuota(used, sunday, now, cfg), 'GPU_QUOTA_EXCEEDED');
  assert.equal(checkGpuQuota(used, monday, now, cfg), null);
  // Trong 24 giờ tới thì được đặt vượt
  const soon = { useGpu: true, start: ms('2026-10-09T20:00:00'), end: ms('2026-10-09T22:00:00') };
  assert.equal(checkGpuQuota(used, soon, now, cfg), null);
});
