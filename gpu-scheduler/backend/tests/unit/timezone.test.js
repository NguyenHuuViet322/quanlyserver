// REQ-BK-12: kết quả mọi quy tắc thời gian không phụ thuộc TZ của tiến trình.
// Test tự chạy lại cùng một bộ tình huống trong 3 tiến trình con có TZ khác nhau rồi so sánh.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SRC = path.resolve(__dirname, '../../src');

// Chạy trong tiến trình con; in JSON kết quả
const SCRIPT = `
const { defaults: cfg } = require(${JSON.stringify(path.join(SRC, 'config'))});
const { validateBookingTimes } = require(${JSON.stringify(path.join(SRC, 'booking/rules'))});
const { splitByWeek } = require(${JSON.stringify(path.join(SRC, 'booking/quota'))});
const { toVnIso } = require(${JSON.stringify(path.join(SRC, 'time'))});
const now = new Date('2026-10-05T09:20:00+07:00').getTime();
const cases = [
  ['2026-10-06T10:00:00+07:00', '2026-10-06T09:00:00+07:00'],
  ['2026-10-04T08:00:00+07:00', '2026-10-04T10:00:00+07:00'],
  ['2026-10-06T08:00:00+07:00', '2026-10-06T17:00:00+07:00'],
  ['2026-10-06T09:00:00+07:00', '2026-10-06T09:30:00+07:00'],
  ['2026-10-06T09:10:00+07:00', '2026-10-06T11:00:00+07:00'],
  ['2026-10-12T10:00:00+07:00', '2026-10-12T11:00:00+07:00'],
  ['2026-10-06T11:00:00+09:00', '2026-10-06T13:00:00+09:00'],
  ['2026-10-06T09:00:00+05:30', '2026-10-06T11:00:00+05:30'],
  ['2026-10-06T22:00:00+07:00', '2026-10-07T02:00:00+07:00'],
  ['2026-10-06T00:00:00+07:00', '2026-10-06T02:00:00+07:00'],
  ['2026-10-06T09:00:00', '2026-10-06T10:00:00'],
];
const out = cases.map(([s, e]) => {
  try { const r = validateBookingTimes(s, e, now, cfg); return ['OK', toVnIso(r.start), toVnIso(r.end)]; }
  catch (x) { return [x.details && x.details.reason]; }
});
out.push(splitByWeek(new Date('2026-10-11T22:00:00+07:00').getTime(), new Date('2026-10-12T02:00:00+07:00').getTime(), cfg.timezone));
process.stdout.write(JSON.stringify(out));
`;

const EXPECTED = [
  ['END_BEFORE_START'],
  ['IN_PAST'],
  ['TOO_LONG'],
  ['NOT_ALIGNED'],
  ['NOT_ALIGNED'],
  ['BEYOND_HORIZON'],
  ['OK', '2026-10-06T09:00:00+07:00', '2026-10-06T11:00:00+07:00'],
  ['NOT_ALIGNED'],
  ['OK', '2026-10-06T22:00:00+07:00', '2026-10-07T02:00:00+07:00'],
  ['OK', '2026-10-06T00:00:00+07:00', '2026-10-06T02:00:00+07:00'],
  ['MISSING_TIMEZONE'],
  [
    { weekStart: Date.UTC(2026, 9, 4, 17), ms: 2 * 3600 * 1000 },
    { weekStart: Date.UTC(2026, 9, 11, 17), ms: 2 * 3600 * 1000 },
  ],
];

test('BK-T38 các quy tắc thời gian cho kết quả giống hệt với TZ = UTC, Asia/Ho_Chi_Minh, America/New_York', () => {
  for (const tz of ['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York']) {
    const r = spawnSync(process.execPath, ['-e', SCRIPT], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, `TZ=${tz}: ${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout), EXPECTED, `TZ=${tz}`);
  }
});
