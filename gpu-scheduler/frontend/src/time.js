// Thời gian trên Dashboard luôn là giờ Việt Nam, bất kể múi giờ trình duyệt — REQ-UI-10, docs/10-design/time.md
export const TZ = 'Asia/Ho_Chi_Minh';
export const TZ_LABEL = 'GMT+7';
const HOUR = 3600 * 1000;

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
});
const WEEKDAYS = { Mon: 'Thứ Hai', Tue: 'Thứ Ba', Wed: 'Thứ Tư', Thu: 'Thứ Năm', Fri: 'Thứ Sáu', Sat: 'Thứ Bảy', Sun: 'Chủ nhật' };
const WEEKDAYS_SHORT = { Mon: 'T2', Tue: 'T3', Wed: 'T4', Thu: 'T5', Fri: 'T6', Sat: 'T7', Sun: 'CN' };

// Các thành phần ngày giờ theo giờ VN
export function vnParts(date) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  return { y: p.year, m: p.month, d: p.day, h: Number(p.hour), min: p.minute, wd: p.weekday };
}

// "2026-10-05" (ngày theo giờ VN)
export const dateKey = (date) => {
  const p = vnParts(date);
  return `${p.y}-${p.m}-${p.d}`;
};

// Thời điểm 00:00 giờ VN của một ngày, + h giờ. Chuỗi gửi API luôn kèm +07:00 (dashboard.md)
export function vnInstant(key, hour = 0) {
  return new Date(new Date(`${key}T00:00:00+07:00`).getTime() + hour * HOUR);
}
export function toApiIso(key, hour) {
  const d = vnInstant(key, hour); // hour = 24 → 00:00 ngày hôm sau
  const p = vnParts(d);
  return `${p.y}-${p.m}-${p.d}T${String(p.h).padStart(2, '0')}:00:00+07:00`;
}
export const addDays = (key, n) => dateKey(vnInstant(key, 24 * n + 12));

export const fmtTime = (iso) => { const p = vnParts(iso); return `${String(p.h).padStart(2, '0')}:${p.min}`; };
export const fmtDate = (iso) => { const p = vnParts(iso); return `${p.d}/${p.m}`; };
export const fmtDateFull = (iso) => { const p = vnParts(iso); return `${p.d}/${p.m}/${p.y}`; };
export const fmtDateTime = (iso) => `${fmtTime(iso)} ${fmtDateFull(iso)}`;
export const weekday = (iso) => WEEKDAYS[vnParts(iso).wd];
export const weekdayShort = (iso) => WEEKDAYS_SHORT[vnParts(iso).wd];

// "05/10 22:00 – 06/10 02:00 (GMT+7)" — ngày kết thúc chỉ ghi khi khác ngày bắt đầu
export function fmtRange(startIso, endIso) {
  const sameDay = dateKey(startIso) === dateKey(new Date(new Date(endIso).getTime() - 1));
  const end = sameDay ? fmtTime(endIso) === '00:00' ? '24:00' : fmtTime(endIso) : `${fmtDate(endIso)} ${fmtTime(endIso)}`;
  return `${fmtDate(startIso)} ${fmtTime(startIso)} – ${end} (${TZ_LABEL})`;
}
export const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / HOUR;

export function relative(iso, now = new Date()) {
  const diff = (new Date(iso) - now) / 60000;
  const abs = Math.abs(diff);
  const f = (n, u) => (diff >= 0 ? `sau ${n} ${u}` : `${n} ${u} trước`);
  if (abs < 1) return 'vừa xong';
  if (abs < 60) return f(Math.round(abs), 'phút');
  if (abs < 60 * 24) return f(Math.round(abs / 60), 'giờ');
  return f(Math.round(abs / 60 / 24), 'ngày');
}

// Trình duyệt có đang ở giờ VN không (để hiện dòng nhắc)
export function browserIsVN() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === TZ || tz === 'Asia/Saigon') return true;
    return new Date().getTimezoneOffset() === -420;
  } catch {
    return false;
  }
}
