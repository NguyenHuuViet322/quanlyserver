// REQ-BK-05, REQ-BK-12: hạn mức giờ GPU theo tuần (Thứ Hai 00:00 giờ VN).
const { weekStartOf, addWeek } = require('../time');
const { ACTIVE } = require('./conflict');

// Chia [start, end) theo tuần: [{ weekStart, ms }]
function splitByWeek(start, end, tz) {
  const parts = [];
  let w = weekStartOf(start, tz);
  while (w < end) {
    const next = addWeek(w, tz);
    const ms = Math.min(end, next) - Math.max(start, w);
    if (ms > 0) parts.push({ weekStart: w, ms });
    w = next;
  }
  return parts;
}

// Khoảng thời gian GPU tính cho một ca: ca completed tính giờ thực dùng, ca hiệu lực tính đủ độ dài
function chargedInterval(b) {
  if (!b.useGpu) return null;
  if (b.status === 'completed') {
    if (b.actualStart == null || b.actualEnd == null) return null;
    return { start: b.actualStart, end: b.actualEnd };
  }
  return ACTIVE.has(b.status) ? { start: b.start, end: b.end } : null;
}

// Tổng ms GPU đã dùng/đặt trong tuần bắt đầu tại weekStart
function usedInWeek(bookings, weekStart, tz) {
  let total = 0;
  for (const b of bookings) {
    const iv = chargedInterval(b);
    if (!iv) continue;
    for (const p of splitByWeek(iv.start, iv.end, tz)) if (p.weekStart === weekStart) total += p.ms;
  }
  return total;
}

// userBookings: các ca của chính user đó; trả về null hoặc 'GPU_QUOTA_EXCEEDED'
function checkGpuQuota(userBookings, candidate, nowMs, cfg) {
  if (!candidate.useGpu) return null;
  if (candidate.start < nowMs + cfg.gpuQuotaFreeWindowMs) return null; // khung GPU trống trong 24 giờ tới
  for (const part of splitByWeek(candidate.start, candidate.end, cfg.timezone)) {
    if (usedInWeek(userBookings, part.weekStart, cfg.timezone) + part.ms > cfg.gpuWeeklyQuotaMs) return 'GPU_QUOTA_EXCEEDED';
  }
  return null;
}

module.exports = { splitByWeek, usedInWeek, checkGpuQuota };
