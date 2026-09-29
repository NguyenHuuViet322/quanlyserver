// Dashboard VMU GPU Server — SPA thuần, định tuyến bằng hash để có deep link. Bố cục theo docs/giao-dien.md.
import { get, post, ApiError } from './api.js';
import { esc, icon, toast, fmtGiB } from './ui.js';
import { TZ_LABEL, browserIsVN, fmtDateTime, fmtTime, relative } from './time.js';
import { renderLogin, renderPending, renderFirstPassword } from './views/auth.js';
import { renderCalendar } from './views/calendar.js';
import { renderBookings } from './views/bookings.js';
import { renderAccount } from './views/account.js';
import { renderAdmin } from './views/admin.js';

const root = document.getElementById('app');

export const state = { config: null, me: null };

const ROUTES = {
  '': { title: 'Lịch đặt ca', icon: 'calendar', render: renderCalendar },
  ca: { title: 'Ca của tôi', icon: 'list', render: renderBookings },
  'tai-khoan': { title: 'Tài khoản & Key', icon: 'key', render: renderAccount },
  'quan-tri': { title: 'Quản trị', icon: 'shield', render: renderAdmin, admin: true },
};

const routeKey = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || '');
export const navigate = (key) => { location.hash = `#/${key}`; };

export async function refreshMe() {
  state.me = await get('/me');
  renderProfile();
  renderStorageAlert();
  return state.me;
}

async function boot() {
  root.innerHTML = '<div class="center-screen"><div class="skeleton" style="width:220px;height:14px"></div></div>';
  try {
    state.config = await get('/config');
  } catch {
    state.config = {};
  }
  try {
    state.me = await get('/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return renderLogin(root, boot);
    if (e instanceof ApiError && e.code === 'ACCOUNT_LOCKED') return renderLogin(root, boot, 'Tài khoản của bạn đã bị khóa. Liên hệ quản trị viên.');
    if (e instanceof ApiError && e.code === 'ACCOUNT_REJECTED') return renderLogin(root, boot, 'Tài khoản của bạn đã bị từ chối. Liên hệ quản trị viên nếu đây là nhầm lẫn.');
    root.innerHTML = `<div class="center-screen"><div class="card auth-card"><p>${esc(e.message)}</p>
      <button class="btn btn-primary" id="retry">Thử lại</button></div></div>`;
    document.getElementById('retry').onclick = boot;
    return;
  }
  if (state.me.status === 'pending') return renderPending(root, state.me);
  // Mật khẩu SSH mới chưa được xác nhận đã lưu → bắt buộc xem trước (REQ-US-10, REQ-US-18, REQ-UI-08)
  try {
    const { password } = await get('/me/password');
    return renderFirstPassword(root, state.me, password, () => { renderShell(); route(); });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  }
  renderShell();
  route();
}

// ---- Khung trang: thanh điều hướng ngang trên cùng (REQ-UI-05) ----
function renderShell() {
  const me = state.me;
  const nav = Object.entries(ROUTES)
    .filter(([, r]) => !r.admin || me.role === 'admin')
    .map(([key, r]) => `<a href="#/${key}" data-route="${key}">${icon(r.icon, 'icon-sm')}<span>${r.title}</span></a>`)
    .join('');
  root.innerHTML = `
    <header class="topnav">
      <div class="topnav-inner">
        <a class="brand" href="#/"><img src="/assets/icon.svg" alt="" width="34" height="34"><strong>VMU GPU Server</strong></a>
        <nav class="nav" aria-label="Điều hướng chính">${nav}</nav>
        <div class="topnav-actions">
          <div class="menu-wrap">
            <button class="btn btn-ghost btn-icon" id="bell" aria-haspopup="true" aria-expanded="false" aria-label="Thông báo">${icon('bell')}</button>
            <span class="badge-count" id="bell-count" hidden></span>
            <div class="popover" id="notif-pop" hidden></div>
          </div>
          <div class="menu-wrap">
            <button class="profile-btn" id="profile-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Tài khoản của tôi">
              <span class="avatar" aria-hidden="true">${esc(me.username[0].toUpperCase())}</span>
              <span class="profile-name">${esc(me.username)}</span>${icon('chevron-down', 'icon-sm')}
            </button>
            <div class="popover profile-menu" id="profile-menu" role="menu" aria-label="Tài khoản" hidden></div>
          </div>
        </div>
      </div>
    </header>
    <main class="content" id="main" tabindex="-1">
      <h1 class="page-title" id="page-title"></h1>
      ${browserIsVN() ? '' : `<div class="tz-note" role="note" data-testid="tz-note">${icon('globe')}<span>Mọi giờ trên trang là <strong>giờ Việt Nam (${TZ_LABEL})</strong>, không theo múi giờ máy của bạn.</span></div>`}
      <div id="storage-alert"></div>
      <div id="view"></div>
    </main>
    <div id="end-warning-slot"></div>`;
  renderProfile();
  renderStorageAlert();
  setupMenus();
  setupNotifications();
  startEndWarningWatch();
}

function renderProfile() {
  const menu = document.getElementById('profile-menu');
  if (!menu || !state.me) return;
  const me = state.me;
  const s = me.storage || {};
  const pct = s.used_bytes != null ? Math.min(100, (s.used_bytes / s.hard_bytes) * 100) : 0;
  const level = s.used_bytes == null || s.used_bytes < s.soft_bytes ? '' : s.used_bytes >= s.hard_bytes ? 'danger' : 'warn';
  menu.innerHTML = `
    <div class="profile-head"><strong>${esc(me.name)}</strong><span class="subtle">${esc(me.email)}</span></div>
    <div class="profile-storage" data-testid="profile-storage">
      <div class="row-between"><span class="subtle">Dung lượng /workspace</span><span class="num">${fmtGiB(s.used_bytes)} / ${fmtGiB(s.hard_bytes)} GiB</span></div>
      <div class="meter ${level}"><span style="width:${pct}%"></span></div>
    </div>
    <a role="menuitem" href="#/tai-khoan" class="menu-item">${icon('lock', 'icon-sm')}Đổi mật khẩu SSH</a>
    <button role="menuitem" type="button" class="menu-item danger" id="logout">${icon('logout', 'icon-sm')}Đăng xuất</button>`;
  menu.querySelector('#logout').onclick = async () => {
    await post('/auth/logout').catch(() => {});
    location.hash = '';
    boot();
  };
}

const MENUS = [['bell', 'notif-pop'], ['profile-btn', 'profile-menu']];
function closeMenus(except) {
  for (const [b, p] of MENUS) {
    const pop = document.getElementById(p);
    if (!pop || p === except) continue;
    pop.hidden = true;
    document.getElementById(b).setAttribute('aria-expanded', 'false');
  }
}

function setupMenus() {
  const btn = document.getElementById('profile-btn');
  const menu = document.getElementById('profile-menu');
  btn.onclick = () => {
    const open = menu.hidden;
    closeMenus('profile-menu');
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  menu.addEventListener('click', (ev) => { if (ev.target.closest('a[role=menuitem]')) closeMenus(); });
  if (!setupMenus.bound) {
    setupMenus.bound = true;
    document.addEventListener('click', (ev) => { if (!ev.target.closest('.menu-wrap')) closeMenus(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMenus(); });
  }
}

// REQ-ST-02: dải cảnh báo chỉ khi đã vượt soft quota
function renderStorageAlert() {
  const s = state.me?.storage;
  const box = document.getElementById('storage-alert');
  if (!box) return;
  box.innerHTML = s?.over_soft_since
    ? `<div class="alert alert-danger banner" role="alert">${icon('disk')}<span>Thư mục của bạn đã vượt ${Math.round(s.soft_bytes / 1024 ** 3)} GiB. Hãy dọn dẹp trước <strong class="num">${esc(fmtDateTime(s.grace_deadline))} (${TZ_LABEL})</strong>, sau đó sẽ không ghi thêm được.</span></div>`
    : '';
}

async function route() {
  const key = routeKey();
  const r = ROUTES[key] && (!ROUTES[key].admin || state.me.role === 'admin') ? ROUTES[key] : ROUTES[''];
  const current = ROUTES[key] === r ? key : '';
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.route === current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.getElementById('page-title').textContent = r.title;
  document.title = `${r.title} · VMU GPU Server`;
  closeMenus();
  const view = document.getElementById('view');
  view.className = `view-${current || 'lich'}`;
  view.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  try {
    await r.render(view, { state, refreshMe, navigate });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return boot();
    view.innerHTML = `<div class="alert alert-danger" role="alert">${icon('alert')}<div>${esc(e.message)}
      <div><button class="btn btn-secondary btn-sm" id="retry-view">Thử lại</button></div></div></div>`;
    document.getElementById('retry-view').onclick = route;
  }
  document.getElementById('main').focus({ preventScroll: true });
}

// ---- Thông báo (chuông) ----
const KIND_ICON = { END_WARNING: 'clock', START_FAILED: 'alert', OOM: 'alert', SOFT_QUOTA: 'disk' };

export function notificationItems(items) {
  if (!items.length) return `<div class="empty">${icon('bell')}<p>Chưa có thông báo nào.</p></div>`;
  return items.map((n) => `
    <div class="notif k-${esc(n.kind)} ${n.read_at ? '' : 'unread'}">
      ${icon(KIND_ICON[n.kind] || 'info')}
      <div><p>${esc(n.message)}</p><time datetime="${esc(n.created_at)}" title="${esc(fmtDateTime(n.created_at))}">${esc(relative(n.created_at))}</time></div>
    </div>`).join('');
}

function setupNotifications() {
  const bell = document.getElementById('bell');
  const pop = document.getElementById('notif-pop');
  const count = document.getElementById('bell-count');
  const load = async () => {
    const data = await get('/notifications?limit=20');
    count.hidden = data.unread_count === 0;
    count.textContent = data.unread_count > 9 ? '9+' : String(data.unread_count);
    bell.setAttribute('aria-label', data.unread_count ? `Thông báo, ${data.unread_count} chưa đọc` : 'Thông báo');
    return data;
  };
  const render = (data) => {
    pop.innerHTML = `<div class="popover-head"><strong>Thông báo</strong>
      <button class="btn btn-ghost btn-sm" id="read-all" ${data.unread_count ? '' : 'disabled'}>Đánh dấu đã đọc</button></div>
      ${notificationItems(data.items)}`;
    pop.querySelector('#read-all').onclick = async () => {
      await post('/notifications/read-all');
      render(await load());
    };
  };
  bell.onclick = async () => {
    const open = pop.hidden;
    closeMenus('notif-pop');
    pop.hidden = !open;
    bell.setAttribute('aria-expanded', String(open));
    if (open) render(await load());
  };
  load().catch(() => {});
  clearInterval(setupNotifications.timer);
  setupNotifications.timer = setInterval(() => load().catch(() => {}), 60_000);
}

// ---- Popup sắp hết ca — REQ-UI-15: đếm ngược, "Đã hiểu" thì không hiện lại cho ca đó ----
const WARN_MS = 15 * 60 * 1000;
const dismissedKey = (id) => `vmu.endwarning.${id}`;
function isDismissed(id) {
  try { return localStorage.getItem(dismissedKey(id)) === '1'; } catch { return false; }
}
function dismiss(id) {
  try { localStorage.setItem(dismissedKey(id), '1'); } catch { /* chỉ nhớ trong phiên này */ }
}

function startEndWarningWatch() {
  let running = null;
  const shown = new Set(); // "Đã hiểu" trong phiên này, kể cả khi không ghi được localStorage
  const tick = () => {
    const box = document.getElementById('end-warning-slot');
    if (!box) return;
    const left = running ? new Date(running.end) - Date.now() : -1;
    if (!running || left <= 0 || left > WARN_MS || shown.has(running.id) || isDismissed(running.id)) {
      box.innerHTML = '';
      return;
    }
    const secs = Math.ceil(left / 1000);
    const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    const existing = box.querySelector('.countdown');
    if (existing) { existing.textContent = mmss; return; }
    const id = running.id;
    box.innerHTML = `<div class="end-warning" data-testid="end-warning" role="alertdialog" aria-labelledby="ew-title" aria-describedby="ew-desc">
      <div class="end-warning-icon">${icon('clock')}</div>
      <div class="stack-sm">
        <strong id="ew-title">SẮP HẾT CA (Còn <span class="countdown num">${mmss}</span>)</strong>
        <p id="ew-desc">Ca làm việc của bạn sẽ kết thúc lúc <strong class="num">${esc(fmtTime(running.end))}</strong>. Hãy lưu checkpoint ngay để không mất tiến trình.</p>
        <div><button class="btn btn-primary btn-sm" id="end-warning-ok">Đã hiểu</button></div>
      </div>
    </div>`;
    box.querySelector('#end-warning-ok').onclick = () => { shown.add(id); dismiss(id); box.innerHTML = ''; };
  };
  const refresh = async () => {
    try {
      const mine = await get('/bookings');
      running = mine.find((b) => b.status === 'running') || null;
    } catch { /* thử lại ở lần sau */ }
    tick();
  };
  clearInterval(startEndWarningWatch.poll);
  clearInterval(startEndWarningWatch.clock);
  startEndWarningWatch.poll = setInterval(refresh, 30_000);
  startEndWarningWatch.clock = setInterval(tick, 1000);
  refresh();
}

window.addEventListener('hashchange', () => { if (state.me && state.me.status === 'active' && document.getElementById('view')) route(); });
window.addEventListener('unhandledrejection', (ev) => {
  if (ev.reason instanceof ApiError) { toast(ev.reason.message, 'error'); ev.preventDefault(); }
});

boot();
