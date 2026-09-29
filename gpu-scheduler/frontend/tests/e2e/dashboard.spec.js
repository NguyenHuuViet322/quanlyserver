// M7 — Dashboard theo docs/giao-dien.md. Test case: docs/20-test-cases/dashboard.md
const { test, expect } = require('@playwright/test');
const { vn, reset, setNow, loginAs, seedUser, seedBooking, seedStorage } = require('./helpers');

const ME = 'vietnh@vimaru.edu.vn';
const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGH8qvvZ3m4Kx8wWkZ1m9s0kq3m0k6Y0cCz2W4b9Qp2d vietnh@laptop';

test.beforeEach(async ({ page }) => {
  await reset(page);
});

// ---- Hộp thoại đặt ca ----
async function openBooking(page) {
  await page.getByRole('button', { name: 'Đặt ca mới' }).click();
  const dlg = page.getByRole('dialog', { name: 'Đặt ca mới' });
  await expect(dlg).toBeVisible();
  return dlg;
}
async function fillBooking(dlg, { date, from, to, gpu }) {
  if (date) await dlg.getByLabel('Ngày').selectOption(date);
  if (from !== undefined) await dlg.getByLabel('Từ giờ').selectOption(String(from));
  if (to !== undefined) await dlg.getByLabel('Đến giờ').selectOption(String(to));
  if (gpu !== undefined) await dlg.getByRole('switch', { name: 'Sử dụng GPU RTX 5090' }).setChecked(gpu);
}
const submit = (dlg) => dlg.getByRole('button', { name: 'Xác nhận đặt ca' });
const checkRow = (dlg, rule) => dlg.locator(`[data-testid="checks"] [data-rule="${rule}"]`);

test('UI-T01 công tắc GPU mặc định tắt; xác nhận khi chưa bật → use_gpu false, bật → true', async ({ page }) => {
  await loginAs(page, ME);
  await page.goto('/');
  let dlg = await openBooking(page);
  const sw = dlg.getByRole('switch', { name: 'Sử dụng GPU RTX 5090' });
  await expect(sw).not.toBeChecked();
  await fillBooking(dlg, { date: '2026-10-06', from: 8, to: 10 });
  await expect(dlg.locator('#summary')).toContainText('không dùng GPU');
  await expect(submit(dlg)).toBeEnabled();
  let [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/bookings')),
    submit(dlg).click(),
  ]);
  expect(req.postDataJSON().use_gpu).toBe(false);

  dlg = await openBooking(page);
  await fillBooking(dlg, { date: '2026-10-07', from: 8, to: 10, gpu: true });
  await expect(dlg.locator('#summary')).toContainText('có GPU');
  await expect(submit(dlg)).toBeEnabled();
  [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/bookings')),
    submit(dlg).click(),
  ]);
  expect(req.postDataJSON().use_gpu).toBe(true);
});

test('UI-T02 chú giải, kiểu khối, tooltip, chọn tuần (xem lại tối đa 4 tuần), khung đầy, bấm khoảng trống', async ({ page }) => {
  await seedUser(page, 'hoanglm@vimaru.edu.vn');
  await seedUser(page, 'tranthu@vimaru.edu.vn');
  await seedBooking(page, { email: 'hoanglm@vimaru.edu.vn', start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00'), use_gpu: true });
  await seedBooking(page, { email: 'tranthu@vimaru.edu.vn', start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00') });
  await seedBooking(page, { email: 'tranthu@vimaru.edu.vn', start: vn('2026-10-02T13:00:00'), end: vn('2026-10-02T15:00:00'), status: 'completed' });
  await loginAs(page, ME);
  await seedBooking(page, { email: ME, start: vn('2026-10-06T12:00:00'), end: vn('2026-10-06T15:00:00') });
  await page.goto('/');

  const legend = page.getByTestId('cal-legend');
  for (const t of ['Ca của bạn', 'Ca GPU người khác', 'Ca CPU người khác', 'Đã qua']) await expect(legend).toContainText(t);

  const day = page.locator('.cal-col[data-day="2026-10-06"]');
  const hoang = day.locator('.cal-block', { hasText: 'hoanglm' });
  await expect(hoang).toHaveClass(/other-gpu/);
  await expect(hoang).toContainText('GPU');
  await expect(hoang).toHaveAttribute('title', 'hoanglm · Trạng thái: Sắp tới | Loại: Có GPU');
  await expect(day.locator('.cal-block', { hasText: 'tranthu' })).toHaveClass(/other-cpu/);
  await expect(day.locator('.cal-block', { hasText: 'tranthu' })).toHaveAttribute('title', /Loại: Không GPU/);
  await expect(day.locator('.cal-block', { hasText: 'vietnh' })).toHaveClass(/mine/);

  const cell = (h) => page.locator(`.cal-cell[data-day="2026-10-06"][data-hour="${h}"]`);
  await expect(cell(8)).toBeDisabled();
  await expect(cell(12)).toBeEnabled();

  // Chọn tuần
  await expect(page.getByTestId('week-range')).toHaveText('05/10 – 12/10/2026');
  await expect(page.getByRole('button', { name: 'Tuần sau' })).toBeDisabled();
  await page.getByRole('button', { name: 'Tuần trước' }).click();
  await expect(page.getByTestId('week-range')).toHaveText('28/09 – 05/10/2026');
  const past = page.locator('.cal-col[data-day="2026-10-02"] .cal-block', { hasText: 'tranthu' });
  await expect(past).toHaveAttribute('title', /Trạng thái: Hoàn thành/);
  await expect(page.locator('.cal-cell[data-day="2026-10-02"][data-hour="20"]')).toBeDisabled(); // quá khứ: chỉ xem
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Tuần trước' }).click();
  await expect(page.getByRole('button', { name: 'Tuần trước' })).toBeDisabled();
  await page.getByRole('button', { name: 'Tuần sau' }).click();
  await expect(page.getByRole('button', { name: 'Tuần trước' })).toBeEnabled();

  // Về tuần hiện tại, bấm khoảng trống
  await page.goto('/');
  await page.locator('.cal-cell[data-day="2026-10-06"][data-hour="16"]').click();
  const dlg = page.getByRole('dialog', { name: 'Đặt ca mới' });
  await expect(dlg.getByLabel('Ngày')).toHaveValue('2026-10-06');
  await expect(dlg.getByLabel('Từ giờ')).toHaveValue('16');
});

test('UI-T03 dòng kiểm tra hiện lý do tiếng Việt cho từng lỗi; mất chỗ ngay trước khi xác nhận → lỗi từ server', async ({ page }) => {
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

  const expectRow = async (booking, rule, text) => {
    await fillBooking(dlg, booking);
    await expect(checkRow(dlg, rule)).toHaveAttribute('data-ok', 'false');
    await expect(checkRow(dlg, rule)).toContainText(text);
    await expect(submit(dlg)).toBeDisabled();
  };
  await expectRow({ date: '2026-10-06', from: 8, to: 10, gpu: true }, 'CAPACITY', 'đã có người dùng GPU');
  await expectRow({ date: '2026-10-06', from: 14, to: 15, gpu: false }, 'CAPACITY', 'đã đủ 2 phiên');
  await expectRow({ date: '2026-10-07', from: 9, to: 10, gpu: false }, 'USER_OVERLAP', 'đã có một ca khác');
  await expectRow({ date: '2026-10-10', from: 8, to: 10, gpu: true }, 'GPU_QUOTA', 'hết 10 giờ GPU');
  // Server đã qua 10:00 trong khi trang vẫn cho chọn 10:00
  expect((await page.request.post('/__test/clock', { data: { now: '2026-10-05T10:30:00+07:00' } })).ok()).toBeTruthy();
  await fillBooking(dlg, { date: '2026-10-05', to: 13, gpu: false });
  await fillBooking(dlg, { from: 11 });
  await fillBooking(dlg, { from: 10 });
  await expect(checkRow(dlg, 'TIME')).toHaveAttribute('data-ok', 'false');
  await expect(checkRow(dlg, 'TIME')).toContainText('Giờ này đã qua');

  // Khung hợp lệ nhưng người khác đặt mất ngay trước khi bấm xác nhận
  // (đã hết 10 giờ GPU tuần này → chọn khung GPU trong 24 giờ tới, được phép theo REQ-BK-05)
  await fillBooking(dlg, { date: '2026-10-05', from: 18, to: 19, gpu: true });
  await expect(submit(dlg)).toBeEnabled();
  await seedBooking(page, { email: 'b@vimaru.edu.vn', start: vn('2026-10-05T18:00:00'), end: vn('2026-10-05T19:00:00'), use_gpu: true });
  await submit(dlg).click();
  await expect(dlg.locator('#form-error [data-code="GPU_BUSY"]')).toContainText('đã có người dùng GPU');
});

test('UI-T05 menu tài khoản: họ tên, email, dung lượng nhỏ, Đổi mật khẩu SSH, Đăng xuất; không trang nào hiện dải cổng', async ({ page }) => {
  await loginAs(page, ME);
  await seedStorage(page, ME, 12);
  await page.goto('/');
  await page.getByRole('button', { name: 'Tài khoản của tôi' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toContainText('VIETNH');
  await expect(menu).toContainText(ME);
  await expect(menu.getByTestId('profile-storage')).toContainText('12 / 100 GiB');
  await expect(menu.getByRole('menuitem', { name: 'Đăng xuất' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Đổi mật khẩu SSH' }).click();
  await expect(page).toHaveURL(/#\/tai-khoan/);
  await expect(page.getByRole('heading', { name: 'Tài khoản & Key', level: 1 })).toBeVisible();
  for (const route of ['/#/', '/#/ca', '/#/tai-khoan']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    expect(await page.locator('body').innerText(), route).not.toMatch(/Dải cổng|dải cổng|10000–|10099/);
  }
});

test('UI-T06 hủy ca scheduled trong bảng và kết thúc sớm ca đang chạy', async ({ page }) => {
  await loginAs(page, ME);
  const s = await seedBooking(page, { email: ME, start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00') });
  await seedBooking(page, { email: ME, start: vn('2026-10-05T09:00:00'), end: vn('2026-10-05T11:00:00'), use_gpu: true, status: 'running' });
  await page.goto('/#/ca');

  await page.locator(`tr[data-booking="${s.id}"]`).getByRole('button', { name: 'Hủy ca' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hủy ca' }).click();
  await expect(page.locator(`tr[data-booking="${s.id}"]`)).toContainText('Đã hủy');

  await page.getByTestId('active-session').getByRole('button', { name: 'Kết thúc sớm' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Kết thúc ca' }).click();
  await expect(page.getByTestId('active-session')).toContainText('Đang dừng');
});

test('UI-T07 có nút "Đăng nhập bằng Google"; tài khoản pending thấy màn hình chờ duyệt, không thấy chức năng đặt ca', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Đăng nhập bằng Google' })).toBeVisible();
  await expect(page.getByText('@vimaru.edu.vn')).toBeVisible();

  await loginAs(page, 'moi@vimaru.edu.vn', { status: 'pending' });
  // Cookie được gắn từ ngoài nên phải tải lại trang (đăng nhập qua Google thì app tự khởi động lại)
  await page.reload();
  await expect(page.getByTestId('pending-title')).toHaveText('Tài khoản đang chờ duyệt');
  await expect(page.getByRole('button', { name: 'Đặt ca mới' })).toHaveCount(0);
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
  await expect(page.getByRole('heading', { name: 'Lịch đặt ca', level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Lịch đặt ca', level: 1 })).toBeVisible();
  await expect(page.getByTestId('ssh-password')).toHaveCount(0);
});

test('UI-T09 tab Duyệt (Duyệt / Từ chối), Quản lý (Khóa / Xóa / Cấp lại mật khẩu), Nhật ký có bộ lọc; user thường không vào được', async ({ page, browser }) => {
  await seedUser(page, 'cho@vimaru.edu.vn', { status: 'pending' });
  await seedUser(page, 'tuchoi@vimaru.edu.vn', { status: 'pending' });
  await seedUser(page, 'khoa@vimaru.edu.vn');
  await seedUser(page, 'quenmk@vimaru.edu.vn');
  await loginAs(page, 'quantri@vimaru.edu.vn', { role: 'admin' });
  await page.goto('/#/quan-tri');

  // Duyệt tài khoản
  await expect(page.getByRole('tab', { name: 'Duyệt tài khoản' })).toHaveAttribute('aria-selected', 'true');
  const pendingRow = page.locator('tr', { hasText: 'cho@vimaru.edu.vn' });
  await expect(pendingRow).toContainText('CHO');
  await pendingRow.getByRole('button', { name: 'Duyệt' }).click();
  await expect(page.getByRole('status')).toContainText('Đã duyệt cho');
  await page.locator('tr', { hasText: 'tuchoi@vimaru.edu.vn' }).getByRole('button', { name: 'Từ chối' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Từ chối' }).click();
  await expect(page.getByRole('status')).toContainText('Đã từ chối tuchoi');
  await expect(page.locator('tr', { hasText: 'tuchoi@vimaru.edu.vn' })).toHaveCount(0);

  // Quản lý người dùng
  await page.getByRole('tab', { name: 'Quản lý người dùng' }).click();
  await page.locator('tr', { hasText: 'quenmk@vimaru.edu.vn' }).getByRole('button', { name: 'Cấp lại mật khẩu SSH' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cấp lại' }).click();
  await expect(page.getByRole('status')).toContainText('Đã cấp lại mật khẩu cho quenmk');
  await page.locator('tr', { hasText: 'khoa@vimaru.edu.vn' }).getByRole('button', { name: 'Khóa' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Khóa' }).click();
  await expect(page.locator('tr', { hasText: 'khoa@vimaru.edu.vn' })).toContainText('Đã khóa');
  await page.locator('tr', { hasText: 'khoa@vimaru.edu.vn' }).getByRole('button', { name: 'Xóa' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xóa tài khoản' }).click();
  await expect(page.locator('tr', { hasText: 'khoa@vimaru.edu.vn' })).toContainText('Đã xóa');
  await expect(page.locator('tr', { hasText: 'tuchoi@vimaru.edu.vn' })).toContainText('Đã từ chối');

  // Nhật ký có bộ lọc
  await page.getByRole('tab', { name: 'Nhật ký' }).click();
  await page.getByLabel('Người dùng').fill('cho');
  await page.getByRole('button', { name: 'Lọc' }).click();
  const rows = page.locator('[data-testid="audit-table"] tbody tr');
  await expect(rows.first()).toContainText('Duyệt tài khoản');
  for (const r of await rows.all()) await expect(r).toContainText(/cho|user:/);
  await page.getByLabel('Người dùng').fill('');
  await page.getByLabel('Loại sự kiện').selectOption('user.reject');
  await page.getByRole('button', { name: 'Lọc' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Từ chối tài khoản');

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.clock.setFixedTime(new Date('2026-10-05T09:20:00+07:00'));
  await loginAs(other, ME);
  await other.goto('/#/quan-tri');
  await expect(other.getByRole('heading', { name: 'Lịch đặt ca', level: 1 })).toBeVisible();
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
    await fillBooking(dlg, { date: '2026-10-05', from: 9, to: 11 });
    await expect(dlg.locator('#summary')).toContainText('05/10 09:00 – 11:00 (GMT+7)');
    await expect(submit(dlg)).toBeEnabled();
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

  await fillBooking(dlg, { to: 24 });
  await expect(dlg.locator('#summary')).toContainText('05/10 22:00 – 24:00 (GMT+7), 2 giờ');
  await expect(submit(dlg)).toBeEnabled();
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/bookings')),
    submit(dlg).click(),
  ]);
  expect(req.postDataJSON().end).toBe('2026-10-06T00:00:00+07:00');
});

test('UI-T12 trang Ca của tôi có hướng dẫn kết nối (kể cả khi không có ca); chưa có key thì nhắc', async ({ page }) => {
  const user = await loginAs(page, ME);
  await page.goto('/#/ca');
  const guide = page.getByTestId('connect-guide');
  await expect(guide.getByTestId('ssh-command')).toHaveText(`ssh ${user.username}@gpu.vimaru.edu.vn`);
  const cfg = guide.getByTestId('ssh-config');
  await expect(cfg).toContainText('Host vmu');
  await expect(cfg).toContainText(`User ${user.username}`);
  await expect(cfg).toContainText(`ProxyCommand ssh -T ${user.username}@gpu.vimaru.edu.vn vmu-connect`);
  await expect(guide.getByRole('button', { name: 'Sao chép lệnh SSH' })).toBeVisible();
  await expect(guide.getByRole('button', { name: 'Sao chép cấu hình VS Code' })).toBeVisible();
  await expect(guide.getByTestId('no-key-warning')).toBeVisible();
  expect((await page.request.post('/api/me/ssh-keys', { data: { name: 'Laptop', public_key: KEY } })).status()).toBe(201);
  await page.reload();
  await expect(page.getByTestId('connect-guide').getByTestId('no-key-warning')).toHaveCount(0);
});

test('UI-T13 390px: lịch xem từng ngày, không trang nào cuộn ngang; 1920px: lịch dàn hết chiều rộng', async ({ page }) => {
  await loginAs(page, ME);
  // Có ca đang chạy và bảng ca để kiểm tra cả khối ca và bảng trên màn hình hẹp
  await seedBooking(page, { email: ME, start: vn('2026-10-05T09:00:00'), end: vn('2026-10-05T11:00:00'), use_gpu: true, status: 'running' });
  await seedBooking(page, { email: ME, start: vn('2026-10-06T22:00:00'), end: vn('2026-10-07T02:00:00'), use_gpu: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.cal-col')).toHaveCount(1);
  await expect(page.locator('.cal-col')).toHaveAttribute('data-day', '2026-10-05');
  await page.getByRole('button', { name: 'Ngày sau' }).click();
  await expect(page.locator('.cal-col')).toHaveAttribute('data-day', '2026-10-06');
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const route of ['/#/ca', '/#/tai-khoan']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    expect(await overflow(), route).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.locator('.cal-col')).toHaveCount(8);
  const box = await page.locator('.cal').boundingBox();
  expect(box.width).toBeGreaterThan(1920 - 120);
});

test('UI-T14 "Hạn mức GPU: 4/10 giờ"; tới 9 giờ thì chuyển màu cảnh báo', async ({ page }) => {
  await loginAs(page, ME);
  await seedBooking(page, { email: ME, start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T12:00:00'), use_gpu: true });
  await page.goto('/');
  const badge = page.getByTestId('gpu-quota');
  await expect(badge).toHaveText('Hạn mức GPU: 4/10 giờ');
  await expect(badge).not.toHaveClass(/warn/);
  await seedBooking(page, { email: ME, start: vn('2026-10-07T08:00:00'), end: vn('2026-10-07T13:00:00'), use_gpu: true });
  await page.reload();
  await expect(badge).toHaveText('Hạn mức GPU: 9/10 giờ');
  await expect(badge).toHaveClass(/warn/);
});

test('UI-T15 khối ca đang chạy: mã ca, giờ kết thúc, còn lại, tài nguyên, 3 tab; biểu đồ thêm mẫu sau 5 giây; ca exited có Khởi động lại', async ({ page }) => {
  await loginAs(page, ME);
  const r = await seedBooking(page, { email: ME, start: vn('2026-10-05T09:00:00'), end: vn('2026-10-05T11:00:00'), use_gpu: true, status: 'running' });
  await page.goto('/#/ca');
  const panel = page.getByTestId('active-session');
  await expect(panel).toContainText(`#${r.id}`);
  await expect(panel).toContainText('Kết thúc lúc 11:00');
  await expect(panel).toContainText('Còn 01 giờ 40 phút');
  await expect(panel).toContainText('RTX 5090 (1 GPU)');
  await expect(panel).toContainText('/28 GiB RAM');
  await expect(panel).toContainText('15 lõi CPU');
  for (const tab of ['Giám sát tài nguyên', 'Hướng dẫn kết nối', 'Nhật ký container']) await expect(panel.getByRole('tab', { name: tab })).toBeVisible();

  const chart = panel.getByTestId('metrics-chart');
  await expect(chart).toHaveAttribute('data-samples', '1');
  await expect(chart).toHaveAttribute('data-samples', '2', { timeout: 8000 });

  await panel.getByRole('tab', { name: 'Nhật ký container' }).click();
  await expect(panel.getByTestId('container-log')).toContainText(`vmu-bk-${r.id}`);
  await panel.getByRole('tab', { name: 'Hướng dẫn kết nối' }).click();
  await expect(panel.getByTestId('ssh-command')).toBeVisible();

  // Ca exited → Khởi động lại
  await reset(page);
  await loginAs(page, ME);
  await seedBooking(page, { email: ME, start: vn('2026-10-05T09:00:00'), end: vn('2026-10-05T11:00:00'), status: 'exited' });
  await page.goto('/#/ca');
  await page.reload(); // cùng URL chỉ khác hash thì goto không tải lại trang
  await expect(page.getByTestId('active-session').getByRole('button', { name: 'Khởi động lại' })).toBeVisible();
});

test('UI-T16 hộp thoại hiện 4 dòng kiểm tra; khung GPU bận → khóa nút xác nhận; đổi lại → bấm được', async ({ page }) => {
  await seedUser(page, 'a@vimaru.edu.vn');
  await seedBooking(page, { email: 'a@vimaru.edu.vn', start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T10:00:00'), use_gpu: true });
  await loginAs(page, ME);
  await page.goto('/');
  const dlg = await openBooking(page);
  await fillBooking(dlg, { date: '2026-10-06', from: 8, to: 10 });
  for (const rule of ['TIME', 'USER_OVERLAP', 'CAPACITY', 'GPU_QUOTA']) await expect(checkRow(dlg, rule)).toHaveAttribute('data-ok', 'true');
  await expect(checkRow(dlg, 'TIME')).toContainText('Khung giờ hợp lệ');
  await expect(checkRow(dlg, 'CAPACITY')).toContainText('Còn chỗ trên máy');
  await expect(submit(dlg)).toBeEnabled();
  await fillBooking(dlg, { gpu: true });
  await expect(checkRow(dlg, 'CAPACITY')).toHaveAttribute('data-ok', 'false');
  await expect(submit(dlg)).toBeDisabled();
  await fillBooking(dlg, { gpu: false });
  await expect(checkRow(dlg, 'CAPACITY')).toHaveAttribute('data-ok', 'true');
  await expect(submit(dlg)).toBeEnabled();
});

test('UI-T17 còn 15 phút → popup đếm ngược; "Đã hiểu" đóng và không hiện lại', async ({ page }) => {
  await loginAs(page, ME);
  await seedBooking(page, { email: ME, start: vn('2026-10-05T09:00:00'), end: vn('2026-10-05T11:00:00'), status: 'running' });
  await setNow(page, '2026-10-05T10:45:00+07:00');
  await page.goto('/');
  const popup = page.getByTestId('end-warning');
  await expect(popup).toContainText('SẮP HẾT CA (Còn 15:00)');
  await expect(popup).toContainText('kết thúc lúc 11:00');
  await page.clock.setFixedTime(new Date('2026-10-05T10:45:01+07:00'));
  await expect(popup).toContainText('Còn 14:59');
  await popup.getByRole('button', { name: 'Đã hiểu' }).click();
  await expect(popup).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('end-warning')).toHaveCount(0);
});

test('UI-T18 thẻ dung lượng đổi màu theo ngưỡng 80/100 GiB và luôn nhắc tự sao lưu', async ({ page }) => {
  await loginAs(page, ME);
  const card = page.getByTestId('storage');
  for (const [gib, level, text] of [[50, 'ok', '50 / 100 GiB'], [85, 'warn', 'dọn dẹp'], [100, 'full', 'không ghi được']]) {
    await seedStorage(page, ME, gib);
    await page.goto('/#/tai-khoan');
    await page.reload();
    await expect(card).toHaveAttribute('data-level', level);
    await expect(card).toContainText(text);
    await expect(card).toContainText('không sao lưu');
    await expect(card).toContainText('SFTP');
  }
});

test('UI-T19 bảng ca: mã ca, Hôm nay/Hôm qua, GPU, nhãn trạng thái và thao tác đúng trạng thái', async ({ page }) => {
  await loginAs(page, ME);
  const up = await seedBooking(page, { email: ME, start: vn('2026-10-05T20:00:00'), end: vn('2026-10-05T22:00:00'), use_gpu: true });
  const done = await seedBooking(page, { email: ME, start: vn('2026-10-04T08:00:00'), end: vn('2026-10-04T12:00:00'), use_gpu: true, status: 'completed' });
  const oom = await seedBooking(page, { email: ME, start: vn('2026-09-26T14:00:00'), end: vn('2026-09-26T18:00:00'), status: 'completed', exit_reason: 'OOM' });
  const cancel = await seedBooking(page, { email: ME, start: vn('2026-09-27T08:00:00'), end: vn('2026-09-27T09:00:00'), status: 'cancelled' });
  await page.goto('/#/ca');
  const row = (b) => page.locator(`tr[data-booking="${b.id}"]`);
  await expect(row(up)).toContainText(`#${up.id}`);
  await expect(row(up)).toContainText('20:00 – 22:00');
  await expect(row(up)).toContainText('Hôm nay');
  await expect(row(up)).toContainText('Có');
  await expect(row(up).locator('.tag')).toHaveText('Sắp tới');
  await expect(row(up).locator('.tag')).toHaveClass(/tag-brand/);
  await expect(row(up).getByRole('button', { name: 'Hủy ca' })).toBeVisible();
  await expect(row(done)).toContainText('Hôm qua');
  await expect(row(done).locator('.tag')).toHaveText('Hoàn thành');
  await expect(row(done).getByRole('button', { name: 'Xem log' })).toBeVisible();
  await expect(row(oom)).toContainText('26/09');
  await expect(row(oom)).toContainText('Không');
  await expect(row(oom).locator('.tag')).toHaveText('Dừng do hết RAM');
  await expect(row(oom).locator('.tag')).toHaveClass(/tag-danger/);
  await expect(row(oom).getByRole('button', { name: 'Xem lý do' })).toBeVisible();
  await expect(row(cancel).locator('.tag')).toHaveText('Đã hủy');
  await expect(row(cancel).locator('.tag')).toHaveClass(/tag-danger/);
});

test('UI-T20 bấm vào khối ca → xem chi tiết; giờ còn chỗ thì "Đặt ca lúc HH:00" mở hộp thoại điền sẵn', async ({ page }) => {
  await seedUser(page, 'hoanglm@vimaru.edu.vn');
  await seedUser(page, 'tranthu@vimaru.edu.vn');
  await seedBooking(page, { email: 'hoanglm@vimaru.edu.vn', start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T12:00:00'), use_gpu: true });
  await seedBooking(page, { email: 'tranthu@vimaru.edu.vn', start: vn('2026-10-06T08:00:00'), end: vn('2026-10-06T09:00:00') });
  await loginAs(page, ME);
  await page.goto('/');
  const block = page.locator('.cal-col[data-day="2026-10-06"] .cal-block', { hasText: 'hoanglm' });

  // Bấm vào phần 10:00 của ca 08–12 (giờ đó chỉ có 1 phiên → còn chỗ)
  const box = await block.boundingBox();
  const hourPx = box.height / 4;
  await block.click({ position: { x: 10, y: hourPx * 2.5 } });
  let info = page.getByRole('dialog', { name: 'Ca của hoanglm' });
  await expect(info).toContainText('06/10 08:00 – 12:00 (GMT+7)');
  await expect(info).toContainText('Có GPU');
  await expect(info).toContainText('Sắp tới');
  await info.getByRole('button', { name: 'Đặt ca lúc 10:00' }).click();
  const dlg = page.getByRole('dialog', { name: 'Đặt ca mới' });
  await expect(dlg.getByLabel('Ngày')).toHaveValue('2026-10-06');
  await expect(dlg.getByLabel('Từ giờ')).toHaveValue('10');
  await dlg.getByRole('button', { name: 'Hủy bỏ' }).click();

  // Bấm vào phần 08:00 (đã đủ 2 phiên) → chỉ xem, không có nút đặt ca
  await block.click({ position: { x: 10, y: hourPx * 0.5 } });
  info = page.getByRole('dialog', { name: 'Ca của hoanglm' });
  await expect(info).toBeVisible();
  await expect(info.getByRole('button', { name: /Đặt ca lúc/ })).toHaveCount(0);
});
