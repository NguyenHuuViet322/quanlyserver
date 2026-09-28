// REQ-BK-01: hợp lệ thời gian của ca, theo đúng thứ tự trong SPEC.
const { ApiError } = require('../errors');
const { parseInstant, isWholeHour } = require('../time');

const invalid = (reason) => new ApiError(400, 'INVALID_TIME', 'Thời gian ca không hợp lệ', { reason });

// startStr, endStr: chuỗi ISO từ API; nowMs: thời điểm hiện tại. Trả về { start, end } (epoch ms).
function validateBookingTimes(startStr, endStr, nowMs, cfg) {
  const start = parseInstant(startStr);
  const end = parseInstant(endStr);
  if (start === 'MISSING_TIMEZONE' || end === 'MISSING_TIMEZONE') throw invalid('MISSING_TIMEZONE');
  if (start === null || end === null) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'start/end phải là thời điểm ISO 8601 có múi giờ');
  }
  if (!isWholeHour(start, cfg.timezone) || !isWholeHour(end, cfg.timezone)) throw invalid('NOT_ALIGNED');
  if (end <= start) throw invalid('END_BEFORE_START');
  if (end - start > cfg.slotMaxMs) throw invalid('TOO_LONG');
  if (start < nowMs) throw invalid('IN_PAST');
  if (start > nowMs + cfg.bookingHorizonMs) throw invalid('BEYOND_HORIZON');
  return { start, end };
}

module.exports = { validateBookingTimes };
