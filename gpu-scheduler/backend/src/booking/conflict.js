// REQ-BK-02..04, REQ-BK-09: kiểm tra xung đột lịch. Hàm thuần, khoảng thời gian nửa mở [start, end).
const ACTIVE = new Set(['scheduled', 'starting', 'running', 'exited', 'stopping']);

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

// existing: [{ userId, start, end, useGpu, status }]; candidate: { userId, start, end, useGpu }
// Trả về null hoặc mã lỗi, theo thứ tự ưu tiên USER_OVERLAP → GPU_BUSY → SLOT_FULL (api.md)
function findConflict(existing, candidate, cfg) {
  const active = existing.filter((b) => ACTIVE.has(b.status) && overlaps(b, candidate));

  if (active.some((b) => b.userId === candidate.userId)) return 'USER_OVERLAP';

  if (candidate.useGpu) {
    const gpu = active.filter((b) => b.useGpu).length;
    if (gpu + 1 > cfg.maxGpuSessions) return 'GPU_BUSY';
  }

  // Số phiên chỉ tăng tại mốc bắt đầu của một ca, nên chỉ cần xét start của ca mới
  // và start của các ca hiện có nằm trong [start, end) của ca mới
  const points = [candidate.start, ...active.map((b) => b.start).filter((p) => p > candidate.start && p < candidate.end)];
  for (const p of points) {
    const n = active.filter((b) => b.start <= p && p < b.end).length;
    if (n + 1 > cfg.maxConcurrentSessions) return 'SLOT_FULL';
  }
  return null;
}

module.exports = { findConflict, overlaps, ACTIVE };
