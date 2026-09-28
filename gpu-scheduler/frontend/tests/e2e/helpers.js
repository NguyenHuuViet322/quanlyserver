// Tiện ích cho test e2e: dựng dữ liệu qua /__test/*, đăng nhập bằng cookie, cố định đồng hồ trình duyệt.
const { expect } = require('@playwright/test');

const NOW = '2026-10-05T09:20:00+07:00'; // Thứ Hai 05/10/2026, 09:20 giờ VN
const vn = (s) => `${s}+07:00`;

async function call(request, url, data) {
  const res = await request.post(url, { data });
  expect(res.ok(), `${url}: ${await res.text()}`).toBeTruthy();
  return res.json();
}

// Đặt lại CSDL, đồng hồ server và trình duyệt về cùng một thời điểm
async function reset(page, now = NOW) {
  await call(page.request, '/__test/reset', { now });
  await page.clock.setFixedTime(new Date(now));
}

async function setNow(page, now) {
  await call(page.request, '/__test/clock', { now });
  await page.clock.setFixedTime(new Date(now));
}

async function loginAs(page, email, opts = {}) {
  const { sid, user } = await call(page.request, '/__test/user', { email, ...opts });
  await page.context().addCookies([{ name: 'sid', value: sid, domain: '127.0.0.1', path: '/', httpOnly: true, secure: false }]);
  return user;
}

const seedUser = (page, email, opts = {}) => call(page.request, '/__test/user', { email, ...opts });
const seedBooking = (page, data) => call(page.request, '/__test/booking', data);
const seedStorage = (page, email, usedGib) => call(page.request, '/__test/storage', { email, used_gib: usedGib });

module.exports = { NOW, vn, reset, setNow, loginAs, seedUser, seedBooking, seedStorage };
