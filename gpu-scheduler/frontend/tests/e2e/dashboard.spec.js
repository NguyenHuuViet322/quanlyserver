// M7 — Dashboard. docs/20-test-cases/dashboard.md
const { test, expect } = require('@playwright/test');
const { vn, reset, setNow, loginAs, seedUser, seedBooking, seedStorage } = require('./helpers');

const ME = 'vietnh@vimaru.edu.vn';

test.beforeEach(async ({ page }) => {
  await reset(page);
});

// Chọn giá trị trong form đặt ca
async function fillBooking(page, { date, from, to, gpu }) {
  if (date) await page.getByLabel('Ngày').selectOption(date);
  if (from !== undefined) await page.getByLabel('Từ giờ').selectOption(String(from));
  if (to !== undefined) await page.getByLabel('Đến giờ').selectOption(String(to));
  if (gpu !== undefined) await page.getByRole('radio', { name: gpu ? /^Có/ : /^Không/ }).check({ force: true });
}

test('UI-T01 form đặt ca bắt buộc chọn "Dùng GPU", không chọn sẵn; bấm Đặt khi chưa chọn → báo lỗi, không gửi request', async ({ page }) => {
  await loginAs(page, ME);
  await page.goto('/#/lich');
  const radios = page.getByRole('radio');
  await expect(radios).toHaveCount(2);
  for (const r of await radios.all()) await expect(r).not.toBeChecked();

  const posts = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/bookings')) posts.push(r); });
  await fillBooking(page, { date: '2026-10-06', from: 8, to: 10 });
  await page.getByRole('button', { name: 'Đặt ca' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Hãy chọn có dùng GPU hay không' })).toBeVisible();
  await expect(page.getByRole('radiogroup')).toHaveAttribute('aria-invalid', 'true');
  expect(posts).toHaveLength(0);
});

test('UI-T02 lịch phân biệt khung đã đủ 2 phiên và khung đã có ca GPU', async ({ page }) => {
  await seedUser(page, 'a@vimaru.edu.vn');
  await seedUser(page, 'b@vimaru.edu.vn');
  await seedBooking(page, { email: 'a@vimaru.edu.vn', start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00'), use_gpu: true });
  await seedBooking(page, { email: 'b@vimaru.edu.vn', start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00') });
  await seedBooking(page, { email: 'b@vimaru.edu.vn', start: vn('2026-10-06T12:00:00'), end: vn('2026-10-06T13:00:00') });
  await loginAs(page, ME);
  await page.goto('/#/lich');

  const cell = (h) => page.locator(`.slot[data-day="2026-10-06"][data-hour="${h}"]`);
  await expect(cell(8)).toContainText('Đầy');
  await expect(cell(8)).toContainText('GPU');
  await expect(cell(8)).toBeDisabled();
  await expect(cell(8)).toHaveAttribute('aria-label', /đã đủ phiên, GPU đã có người dùng/);
  await expect(cell(12)).toContainText('1/2');
  await expect(cell(12)).not.toContainText('GPU');
  await expect(cell(12)).toBeEnabled();
  await expect(cell(14)).toContainText('Trống');
  // Giờ đã qua hôm nay không bấm được
  await expect(page.locator('.slot[data-day="2026-10-05"][data-hour="8"]')).toBeDisabled();
});

test('UI-T03 mỗi lỗi 409/400 hiện thông báo tiếng Việt riêng', async ({ page }) => {
  await seedUser(page, 'a@vimaru.edu.vn');
  await seedUser(page, 'b@vimaru.edu.vn');
  await seedBooking(page, { email: 'a@vimaru.edu.vn', start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00'), use_gpu: true });
  await seedBooking(page, { email: 'a@vimaru.edu.vn', start: vn('2026-10-06T14:00:00'), end: vn('2026-10-06T16:00:00') });
  await seedBooking(page, { email: 'b@vimaru.edu.vn', start: vn('2026-10-06T14:00:00'), end: vn('2026-10-06T16:00:00') });
  await loginAs(page, ME);
  await seedBooking(page, { email: ME, start: vn('2026-10-07T08:00:00'), end: vn('2026-10-07T10:00:00') });
  // 10 giờ GPU trong tuần
  await seedBooking(page, { email: ME, start: vn('2026-10-08T00:00:00'), end: vn('2026-10-08T05:00:00'), use_gpu: true });
  await seedBooking(page, { email: ME, start: vn('2026-10-09T00:00:00'), end: vn('2026-10-09T05:00:00'), use_gpu: true });
  await page.goto('/#/lich');

  const expectError = async (booking, code, text) => {
    await fillBooking(page, booking);
    await page.getByRole('button', { name: 'Đặt ca' }).click();
    const alert = page.locator(`#form-error [data-code="${code}"]`);
    await expect(alert).toContainText(text);
  };
  await expectError({ date: '2026-10-06', from: 8, to: 10, gpu: true }, 'GPU_BUSY', 'đã có người dùng GPU');
  await expectError({ date: '2026-10-06', from: 14, to: 15, gpu: false }, 'SLOT_FULL', 'đã đủ 2 phiên');
  await expectError({ date: '2026-10-07', from: 9, to: 10, gpu: false }, 'USER_OVERLAP', 'đã có một ca khác');
  await expectError({ date: '2026-10-10', from: 8, to: 10, gpu: true }, 'GPU_QUOTA_EXCEEDED', 'hết 10 giờ GPU');
  // Server đã qua 10:00 trong khi trang vẫn cho chọn 10:00 → IN_PAST
  await call(page, '2026-10-05T10:30:00+07:00');
  await expectError({ date: '2026-10-05', from: 10, to: 11, gpu: false }, 'INVALID_TIME', 'Giờ này đã qua');

  async function call(p, iso) {
    const res = await p.request.post('/__test/clock', { data: { now: iso } });
    expect(res.ok()).toBeTruthy();
  }
});

test('UI-T04 hiển thị giờ GPU còn lại trong tuần, đúng với GET /me', async ({ page }) => {
  await loginAs(page, ME);
  await seedBooking(page, { email: ME, start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T11:00:00'), use_gpu: true });
  await page.goto('/#/');
  const tile = page.getByTestId('gpu-quota');
  await expect(tile).toContainText('7');
  await expect(tile).toContainText('/ 10 giờ');
  const me = await (await page.request.get('/api/me')).json();
  expect(me.gpu_quota.remaining_hours).toBe(7);
});

test('UI-T05 hiển thị username, dải cổng và dung lượng đã dùng / quota', async ({ page }) => {
  const user = await loginAs(page, ME);
  await seedStorage(page, ME, 12);
  await page.goto('/#/');
  await expect(page.getByText(`Tài khoản SSH ${user.username}`)).toBeVisible();
  await expect(page.getByTestId('ports')).toContainText(`${user.ports.from}–${user.ports.to}`);
  await expect(page.getByTestId('storage')).toContainText('12');
  await expect(page.getByTestId('storage')).toContainText('/ 100 GiB');
  await expect(page.locator('.user-chip')).toContainText(user.username);
});

test('UI-T06 hủy ca scheduled và kết thúc sớm ca running từ giao diện', async ({ page }) => {
  await loginAs(page, ME);
  const s = await seedBooking(page, { email: ME, start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00') });
  const r = await seedBooking(page, { email: ME, start: vn('2026-10-05T09:00:00'), end: vn('2026-10-05T11:00:00'), use_gpu: true, status: 'running' });
  await page.goto('/#/ca');

  const scheduled = page.locator(`[data-booking="${s.id}"]`);
  await scheduled.getByRole('button', { name: 'Hủy ca' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hủy ca' }).click();
  await expect(page.locator(`[data-booking="${s.id}"]`)).toContainText('Đã hủy');

  const running = page.locator(`[data-booking="${r.id}"]`);
  await running.getByRole('button', { name: 'Kết thúc sớm' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Kết thúc ca' }).click();
  await expect(page.locator(`[data-booking="${r.id}"]`)).toContainText('Đang dừng');
});

test('UI-T07 có nút "Đăng nhập bằng Google"; tài khoản pending thấy màn hình chờ duyệt, không thấy form đặt ca', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google' })).toBeVisible();
  await expect(page.getByText('@vimaru.edu.vn')).toBeVisible();

  await loginAs(page, 'moi@vimaru.edu.vn', { status: 'pending' });
  // Cookie được gắn từ ngoài nên phải tải lại trang (đăng nhập qua Google thì app tự khởi động lại)
  await page.goto('/#/lich');
  await page.reload();
  await expect(page.getByTestId('pending-title')).toHaveText('Tài khoản đang chờ duyệt');
  await expect(page.getByRole('button', { name: 'Đặt ca' })).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);
});

test('UI-T08 màn hình mật khẩu lần đầu: sao chép, cảnh báo, "Tôi đã lưu"; tải lại → không còn mật khẩu', async ({ page }) => {
  await loginAs(page, ME, { ack: false });
  await page.goto('/');
  const secret = page.getByTestId('ssh-password');
  await expect(secret).toHaveText(/^\S{16}$/);
  await expect(page.getByRole('alert')).toContainText('chỉ hiển thị một lần');
  await expect(page.getByRole('button', { name: 'Sao chép mật khẩu' })).toBeVisible();
  const ack = page.getByRole('button', { name: 'Tôi đã lưu' });
  await expect(ack).toBeDisabled();
  await page.getByLabel('Tôi đã lưu mật khẩu ở nơi an toàn').check();
  await ack.click();
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  await expect(page.getByTestId('ssh-password')).toHaveCount(0);
});

test('UI-T09 admin duyệt, khóa, xóa tài khoản; user thường không vào được trang quản trị', async ({ page, browser }) => {
  await seedUser(page, 'cho@vimaru.edu.vn', { status: 'pending' });
  await seedUser(page, 'khoa@vimaru.edu.vn');
  await loginAs(page, 'quantri@vimaru.edu.vn', { role: 'admin' });
  await page.goto('/#/quan-tri');

  await page.locator('tr', { hasText: 'cho@vimaru.edu.vn' }).getByRole('button', { name: 'Duyệt' }).click();
  await expect(page.getByRole('status')).toContainText('Đã duyệt cho');

  await page.getByRole('button', { name: /^Đang hoạt động/ }).click();
  await page.locator('tr', { hasText: 'khoa@vimaru.edu.vn' }).getByRole('button', { name: 'Khóa' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Khóa' }).click();
  await expect(page.getByRole('status')).toContainText('Đã khóa khoa');

  await page.getByRole('button', { name: /^Đã khóa/ }).click();
  await page.locator('tr', { hasText: 'khoa@vimaru.edu.vn' }).getByRole('button', { name: 'Xóa' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa tài khoản' }).click();
  await page.getByRole('button', { name: /^Đã xóa/ }).click();
  await expect(page.locator('tr', { hasText: 'khoa@vimaru.edu.vn' })).toContainText('Đã xóa');

  // User thường: không có mục Quản trị, vào #/quan-tri bị đưa về Tổng quan
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.clock.setFixedTime(new Date('2026-10-05T09:20:00+07:00'));
  await loginAs(other, ME);
  await other.goto('/#/quan-tri');
  await expect(other.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  await expect(other.getByRole('link', { name: 'Quản trị' })).toHaveCount(0);
  await ctx.close();
});

test.describe('trình duyệt ở New York', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('UI-T10 trình duyệt America/New_York: vẫn hiện giờ VN kèm (GMT+7) và dòng nhắc; đặt 05/10 09–11 gửi +07:00', async ({ page }) => {
    await setNow(page, '2026-10-05T08:20:00+07:00'); // = 04/10 21:20 ở New York
    await loginAs(page, ME);
    await page.goto('/#/lich');
    await expect(page.getByTestId('tz-note')).toContainText('giờ Việt Nam (GMT+7)');
    await expect(page.locator('.cal-h.today')).toContainText('05/10');
    await fillBooking(page, { date: '2026-10-05', from: 9, to: 11, gpu: false });
    await expect(page.locator('#summary')).toContainText('05/10 09:00 – 11:00 (GMT+7)');
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/bookings')),
      page.getByRole('button', { name: 'Đặt ca' }).click(),
    ]);
    const body = req.postDataJSON();
    expect(body.start).toBe('2026-10-05T09:00:00+07:00');
    expect(body.end).toBe('2026-10-05T11:00:00+07:00');
    await expect(page.getByRole('status')).toContainText('Đã đặt ca 05/10 09:00 – 11:00 (GMT+7)');
  });
});

test('UI-T11 chỉ chọn giờ tròn; 22:00 → 02:00 có tóm tắt +1 ngày; kết thúc 24:00 gửi 00:00 hôm sau; 09:20 không chọn được 09:00', async ({ page }) => {
  await loginAs(page, ME);
  await page.goto('/#/lich');
  const from = page.getByLabel('Từ giờ');
  // Mọi lựa chọn đều là giờ tròn
  const labels = await from.locator('option').allTextContents();
  expect(labels).toHaveLength(24);
  for (const l of labels) expect(l).toMatch(/^\d{2}:00$/);
  // 09:20 hôm nay: 09:00 bị khóa, sớm nhất là 10:00
  await expect(from.locator('option[value="9"]')).toBeDisabled();
  await expect(from.locator('option[value="10"]')).toBeEnabled();
  await expect(from).toHaveValue('10');

  await fillBooking(page, { from: 22, to: 26 });
  await expect(page.getByLabel('Đến giờ').locator('option[value="26"]')).toHaveText('02:00 (+1 ngày)');
  await expect(page.locator('#summary')).toContainText('05/10 22:00 – 06/10 02:00 (GMT+7), 4 giờ');

  await fillBooking(page, { to: 24, gpu: false });
  await expect(page.locator('#summary')).toContainText('05/10 22:00 – 24:00 (GMT+7), 2 giờ');
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/bookings')),
    page.getByRole('button', { name: 'Đặt ca' }).click(),
  ]);
  expect(req.postDataJSON().end).toBe('2026-10-06T00:00:00+07:00');
});
