// M7 — Dashboard. docs/20-test-cases/dashboard.md
const { test, expect } = require('@playwright/test');
const { vn, reset, setNow, loginAs, seedUser, seedBooking, seedStorage } = require('./helpers');

const ME = 'vietnh@vimaru.edu.vn';
const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGH8qvvZ3m4Kx8wWkZ1m9s0kq3m0k6Y0cCz2W4b9Qp2d vietnh@laptop';

test.beforeEach(async ({ page }) => {
  await reset(page);
});

// Mở hộp thoại đặt ca và chọn giá trị
async function openBooking(page) {
  await page.getByRole('button', { name: 'Đặt ca', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Đặt ca' })).toBeVisible();
  return page.getByRole('dialog', { name: 'Đặt ca' });
}
async function fillBooking(dlg, { date, from, to, gpu }) {
  if (date) await dlg.getByLabel('Ngày').selectOption(date);
  if (from !== undefined) await dlg.getByLabel('Từ giờ').selectOption(String(from));
  if (to !== undefined) await dlg.getByLabel('Đến giờ').selectOption(String(to));
  if (gpu !== undefined) await dlg.getByRole('radio', { name: gpu ? /^Có/ : /^Không/ }).check({ force: true });
}
const submit = (dlg) => dlg.getByRole('button', { name: 'Xác nhận đặt ca' });

test('UI-T01 hộp thoại đặt ca bắt buộc chọn "Dùng GPU", không chọn sẵn; bấm xác nhận khi chưa chọn → báo lỗi, không gửi request', async ({ page }) => {
  await loginAs(page, ME);
  await page.goto('/');
  const dlg = await openBooking(page);
  const radios = dlg.getByRole('radio');
  await expect(radios).toHaveCount(2);
  for (const r of await radios.all()) await expect(r).not.toBeChecked();
  // Không còn chọn image hay nhập cổng
  await expect(dlg.getByLabel(/Image/)).toHaveCount(0);
  await expect(dlg.getByLabel(/Cổng/)).toHaveCount(0);

  const posts = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/bookings')) posts.push(r); });
  await fillBooking(dlg, { date: '2026-10-06', from: 8, to: 10 });
  await submit(dlg).click();
  await expect(dlg.getByRole('alert').filter({ hasText: 'Hãy chọn có dùng GPU hay không' })).toBeVisible();
  await expect(dlg.getByRole('radiogroup')).toHaveAttribute('aria-invalid', 'true');
  expect(posts).toHaveLength(0);
});

test('UI-T02 lịch hiện khối ca có username và nhãn GPU; ca của mình nổi bật; khung đủ 2 phiên không bấm được; bấm khoảng trống mở hộp thoại điền sẵn', async ({ page }) => {
  await seedUser(page, 'hoanglm@vimaru.edu.vn');
  await seedUser(page, 'tranthu@vimaru.edu.vn');
  await seedBooking(page, { email: 'hoanglm@vimaru.edu.vn', start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00'), use_gpu: true });
  await seedBooking(page, { email: 'tranthu@vimaru.edu.vn', start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00') });
  await loginAs(page, ME);
  await seedBooking(page, { email: ME, start: vn('2026-10-06T12:00:00'), end: vn('2026-10-06T15:00:00') });
  await page.goto('/');

  const day = page.locator('.cal-col[data-day="2026-10-06"]');
  const hoang = day.locator('.cal-block', { hasText: 'hoanglm' });
  await expect(hoang).toBeVisible();
  await expect(hoang).toContainText('GPU');
  await expect(day.locator('.cal-block', { hasText: 'tranthu' })).not.toContainText('GPU');
  const mine = day.locator('.cal-block', { hasText: 'vietnh' });
  await expect(mine).toHaveClass(/mine/);
  await expect(mine).toContainText('12:00 – 15:00');

  const cell = (h) => page.locator(`.cal-cell[data-day="2026-10-06"][data-hour="${h}"]`);
  await expect(cell(8)).toBeDisabled();
  await expect(cell(9)).toBeDisabled();
  await expect(cell(12)).toBeEnabled(); // mới 1/2 phiên
  await expect(page.locator('.cal-cell[data-day="2026-10-05"][data-hour="8"]')).toBeDisabled(); // đã qua

  await cell(16).click();
  const dlg = page.getByRole('dialog', { name: 'Đặt ca' });
  await expect(dlg.getByLabel('Ngày')).toHaveValue('2026-10-06');
  await expect(dlg.getByLabel('Từ giờ')).toHaveValue('16');
});

test('UI-T03 mỗi lỗi 409/400 hiện thông báo tiếng Việt riêng', async ({ page }) => {
  await seedUser(page, 'a@vimaru.edu.vn');
  await seedUser(page, 'b@vimaru.edu.vn');
  await seedBooking(page, { email: 'a@vimaru.edu.vn', start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00'), use_gpu: true });
  await seedBooking(page, { email: 'a@vimaru.edu.vn', start: vn('2026-10-06T14:00:00'), end: vn('2026-10-06T16:00:00') });
  await seedBooking(page, { email: 'b@vimaru.edu.vn', start: vn('2026-10-06T14:00:00'), end: vn('2026-10-06T16:00:00') });
  await loginAs(page, ME);
  await seedBooking(page, { email: ME, start: vn('2026-10-07T08:00:00'), end: vn('2026-10-07T10:00:00') });
  await seedBooking(page, { email: ME, start: vn('2026-10-08T00:00:00'), end: vn('2026-10-08T05:00:00'), use_gpu: true });
  await seedBooking(page, { email: ME, start: vn('2026-10-09T00:00:00'), end: vn('2026-10-09T05:00:00'), use_gpu: true });
  await page.goto('/');
  const dlg = await openBooking(page);

  const expectError = async (booking, code, text) => {
    await fillBooking(dlg, booking);
    await submit(dlg).click();
    await expect(dlg.locator(`#form-error [data-code="${code}"]`)).toContainText(text);
  };
  await expectError({ date: '2026-10-06', from: 8, to: 10, gpu: true }, 'GPU_BUSY', 'đã có người dùng GPU');
  await expectError({ date: '2026-10-06', from: 14, to: 15, gpu: false }, 'SLOT_FULL', 'đã đủ 2 phiên');
  await expectError({ date: '2026-10-07', from: 9, to: 10, gpu: false }, 'USER_OVERLAP', 'đã có một ca khác');
  await expectError({ date: '2026-10-10', from: 8, to: 10, gpu: true }, 'GPU_QUOTA_EXCEEDED', 'hết 10 giờ GPU');
  // Server đã qua 10:00 trong khi trang vẫn cho chọn 10:00 → IN_PAST
  const res = await page.request.post('/__test/clock', { data: { now: '2026-10-05T10:30:00+07:00' } });
  expect(res.ok()).toBeTruthy();
  await expectError({ date: '2026-10-05', from: 10, to: 11, gpu: false }, 'INVALID_TIME', 'Giờ này đã qua');
});

test('UI-T05 thanh trên hiện username; trang Kết nối hiện dung lượng; không trang nào hiện giờ GPU còn lại hay dải cổng', async ({ page }) => {
  const user = await loginAs(page, ME);
  await seedStorage(page, ME, 12);
  await page.goto('/');
  await expect(page.locator('.user-chip')).toContainText(user.username);
  await page.goto('/#/ket-noi');
  await expect(page.getByTestId('storage')).toContainText('12');
  await expect(page.getByTestId('storage')).toContainText('100 GiB');
  for (const route of ['/#/', '/#/ca', '/#/ket-noi']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const text = await page.locator('#main').innerText();
    expect(text, route).not.toMatch(/giờ GPU còn lại|Dải cổng|dải cổng|10000|10099/);
  }
});

test('UI-T06 hủy ca scheduled và kết thúc sớm ca running từ giao diện', async ({ page }) => {
  await loginAs(page, ME);
  const s = await seedBooking(page, { email: ME, start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00') });
  const r = await seedBooking(page, { email: ME, start: vn('2026-10-05T09:00:00'), end: vn('2026-10-05T11:00:00'), use_gpu: true, status: 'running' });
  await page.goto('/#/ca');

  await page.locator(`[data-booking="${s.id}"]`).getByRole('button', { name: 'Hủy ca' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hủy ca' }).click();
  await expect(page.locator(`[data-booking="${s.id}"]`)).toContainText('Đã hủy');

  await page.locator(`[data-booking="${r.id}"]`).getByRole('button', { name: 'Kết thúc sớm' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Kết thúc ca' }).click();
  await expect(page.locator(`[data-booking="${r.id}"]`)).toContainText('Đang dừng');
});

test('UI-T07 có nút "Đăng nhập bằng Google"; tài khoản pending thấy màn hình chờ duyệt, không thấy chức năng đặt ca', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google' })).toBeVisible();
  await expect(page.getByText('@vimaru.edu.vn')).toBeVisible();

  await loginAs(page, 'moi@vimaru.edu.vn', { status: 'pending' });
  // Cookie được gắn từ ngoài nên phải tải lại trang (đăng nhập qua Google thì app tự khởi động lại)
  await page.reload();
  await expect(page.getByTestId('pending-title')).toHaveText('Tài khoản đang chờ duyệt');
  await expect(page.getByRole('button', { name: 'Đặt ca', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);
});

test('UI-T08 màn hình mật khẩu lần đầu: sao chép, cảnh báo, "Tôi đã lưu"; tải lại → không còn mật khẩu', async ({ page }) => {
  await loginAs(page, ME, { ack: false });
  await page.goto('/');
  await expect(page.getByTestId('ssh-password')).toHaveText(/^\S{16}$/);
  await expect(page.getByRole('alert')).toContainText('chỉ hiển thị một lần');
  await expect(page.getByRole('button', { name: 'Sao chép mật khẩu' })).toBeVisible();
  const ack = page.getByRole('button', { name: 'Tôi đã lưu' });
  await expect(ack).toBeDisabled();
  await page.getByLabel('Tôi đã lưu mật khẩu ở nơi an toàn').check();
  await ack.click();
  await expect(page.getByRole('heading', { name: 'Lịch', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Lịch', exact: true })).toBeVisible();
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
  // Không còn tab Image
  await expect(page.getByRole('tab', { name: 'Image' })).toHaveCount(0);

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.clock.setFixedTime(new Date('2026-10-05T09:20:00+07:00'));
  await loginAs(other, ME);
  await other.goto('/#/quan-tri');
  await expect(other.getByRole('heading', { name: 'Lịch', exact: true })).toBeVisible();
  await expect(other.getByRole('link', { name: 'Quản trị' })).toHaveCount(0);
  await ctx.close();
});

test.describe('trình duyệt ở New York', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('UI-T10 trình duyệt America/New_York: vẫn hiện giờ VN kèm (GMT+7) và dòng nhắc; đặt 05/10 09–11 gửi +07:00', async ({ page }) => {
    await setNow(page, '2026-10-05T08:20:00+07:00'); // = 04/10 21:20 ở New York
    await loginAs(page, ME);
    await page.goto('/');
    await expect(page.getByTestId('tz-note')).toContainText('giờ Việt Nam (GMT+7)');
    await expect(page.locator('.cal-col.today')).toHaveAttribute('data-day', '2026-10-05');
    const dlg = await openBooking(page);
    await fillBooking(dlg, { date: '2026-10-05', from: 9, to: 11, gpu: false });
    await expect(dlg.locator('#summary')).toContainText('05/10 09:00 – 11:00 (GMT+7)');
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/bookings')),
      submit(dlg).click(),
    ]);
    const body = req.postDataJSON();
    expect(body.start).toBe('2026-10-05T09:00:00+07:00');
    expect(body.end).toBe('2026-10-05T11:00:00+07:00');
    await expect(page.getByRole('status')).toContainText('Đã đặt ca 05/10 09:00 – 11:00 (GMT+7)');
  });
});

test('UI-T11 chỉ chọn giờ tròn; 22:00 → 02:00 có tóm tắt +1 ngày; kết thúc 24:00 gửi 00:00 hôm sau; 09:20 không chọn được 09:00', async ({ page }) => {
  await loginAs(page, ME);
  await page.goto('/');
  const dlg = await openBooking(page);
  const from = dlg.getByLabel('Từ giờ');
  const labels = await from.locator('option').allTextContents();
  expect(labels).toHaveLength(24);
  for (const l of labels) expect(l).toMatch(/^\d{2}:00$/);
  await expect(from.locator('option[value="9"]')).toBeDisabled();
  await expect(from.locator('option[value="10"]')).toBeEnabled();
  await expect(from).toHaveValue('10');

  await fillBooking(dlg, { from: 22, to: 26 });
  await expect(dlg.getByLabel('Đến giờ').locator('option[value="26"]')).toHaveText('02:00 (+1 ngày)');
  await expect(dlg.locator('#summary')).toContainText('05/10 22:00 – 06/10 02:00 (GMT+7), 4 giờ');

  await fillBooking(dlg, { to: 24, gpu: false });
  await expect(dlg.locator('#summary')).toContainText('05/10 22:00 – 24:00 (GMT+7), 2 giờ');
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/bookings')),
    submit(dlg).click(),
  ]);
  expect(req.postDataJSON().end).toBe('2026-10-06T00:00:00+07:00');
});

test('UI-T12 trang Kết nối có ~/.ssh/config cho VS Code và lệnh ssh, có nút sao chép; chưa có key thì nhắc, thêm key thì hết nhắc', async ({ page }) => {
  const user = await loginAs(page, ME);
  await page.goto('/#/ket-noi');
  const cfg = page.getByTestId('ssh-config');
  await expect(cfg).toContainText('Host vmu');
  await expect(cfg).toContainText(`User ${user.username}`);
  await expect(cfg).toContainText(`ProxyCommand ssh -T ${user.username}@gpu.vimaru.edu.vn vmu-connect`);
  await expect(page.getByTestId('ssh-command')).toHaveText(`ssh ${user.username}@gpu.vimaru.edu.vn`);
  await expect(page.getByRole('button', { name: 'Sao chép cấu hình VS Code' })).toBeVisible();
  await expect(page.getByTestId('no-key-warning')).toBeVisible();

  await page.getByLabel(/Thêm SSH key/).fill(KEY);
  await page.getByRole('button', { name: 'Thêm key' }).click();
  await expect(page.getByRole('status')).toContainText('Đã thêm SSH key');
  await expect(page.getByTestId('no-key-warning')).toHaveCount(0);
  await expect(page.getByRole('row', { name: /vietnh@laptop/ })).toBeVisible();
});

test('UI-T13 390px: lịch xem từng ngày, có nút chuyển ngày, không cuộn ngang; 1920px: lịch dàn hết chiều rộng', async ({ page }) => {
  await loginAs(page, ME);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.cal-col')).toHaveCount(1);
  await expect(page.locator('.cal-col')).toHaveAttribute('data-day', '2026-10-05');
  await page.getByRole('button', { name: 'Ngày sau' }).click();
  await expect(page.locator('.cal-col')).toHaveAttribute('data-day', '2026-10-06');
  // Không trang nào cuộn ngang ở 390px
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const route of ['/#/ca', '/#/ket-noi']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    expect(await overflow(), route).toBeLessThanOrEqual(0);
  }
  await page.goto('/');

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.reload();
  await expect(page.locator('.cal-col')).toHaveCount(8);
  const box = await page.locator('.cal').boundingBox();
  expect(box.width).toBeGreaterThan(1920 - 248 - 120); // trừ thanh bên và lề
});
