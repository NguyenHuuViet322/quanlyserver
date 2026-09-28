// Thời gian & múi giờ — docs/10-design/time.md, REQ-BK-11, REQ-BK-12.
// Module duy nhất quy đổi múi giờ. Phần còn lại của code chỉ dùng thời điểm UTC (epoch ms).
const { DateTime } = require('luxon');
const { defaults } = require('../config');

const TZ = defaults.timezone;
// Chuỗi ISO 8601 đầy đủ ngày + giờ và BẮT BUỘC có múi giờ (Z hoặc ±HH:MM)
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/i;
const ISO_ANY = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/;

// Trả về epoch ms; 'MISSING_TIMEZONE' nếu thiếu múi giờ; null nếu sai định dạng
function parseInstant(s) {
  if (typeof s !== 'string') return null;
  if (ISO_ANY.test(s)) return 'MISSING_TIMEZONE';
  if (!ISO_WITH_ZONE.test(s)) return null;
  const dt = DateTime.fromISO(s, { setZone: true });
  return dt.isValid ? dt.toMillis() : null;
}

const inZone = (ms, tz = TZ) => DateTime.fromMillis(ms, { zone: tz });

function isWholeHour(ms, tz = TZ) {
  const d = inZone(ms, tz);
  return d.minute === 0 && d.second === 0 && d.millisecond === 0;
}

// "2026-10-05T09:00:00+07:00"
function toVnIso(ms, tz = TZ) {
  if (ms === null || ms === undefined) return null;
  return inZone(ms instanceof Date ? ms.getTime() : ms, tz).toISO({ suppressMilliseconds: true });
}

// Thứ Hai 00:00 (theo tz) của tuần chứa ms
function weekStartOf(ms, tz = TZ) {
  return inZone(ms, tz).startOf('week').toMillis();
}

function addWeek(weekStart, tz = TZ) {
  return inZone(weekStart, tz).plus({ weeks: 1 }).toMillis();
}

// "2026-10-05" → 00:00 ngày đó theo tz; chuỗi có múi giờ → thời điểm đó
function parseDateOrInstant(s, tz = TZ) {
  if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = DateTime.fromISO(s, { zone: tz });
    return d.isValid ? d.toMillis() : null;
  }
  const v = parseInstant(s);
  return typeof v === 'number' ? v : null;
}

module.exports = { TZ, parseInstant, isWholeHour, toVnIso, weekStartOf, addWeek, parseDateOrInstant };
