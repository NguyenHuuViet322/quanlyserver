// Dashboard VMU GPU Server — SPA thuần, định tuyến bằng hash (#/lich …) để có deep link.
import { get, post, ApiError } from './api.js';
import { esc, icon, toast } from './ui.js';
import { TZ_LABEL, browserIsVN, fmtDateTime, relative } from './time.js';
import { renderLogin, renderPending, renderFirstPassword } from './views/auth.js';
import { renderCalendar } from './views/calendar.js';
import { renderBookings } from './views/bookings.js';
import { renderConnect } from './views/connect.js';
import { renderAdmin } from './views/admin.js';

const root = document.getElementById('app');

export const state = { config: null, me: null };

const ROUTES = {
  '': { title: 'Lịch', icon: 'calendar', render: renderCalendar },
  ca: { title: 'Ca của tôi', icon: 'list', render: renderBookings },
  'ket-noi': { title: 'Kết nối', icon: 'terminal', render: renderConnect },
  'quan-tri': { title: 'Quản trị', icon: 'shield', render: renderAdmin, admin: true },
};

const routeKey = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || '');
export const navigate = (key) => { location.hash = `#/${key}`; };

export async function refreshMe() {
  state.me = await get('/me');
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
    await refreshMe();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return renderLogin(root, boot);
    if (e instanceof ApiError && e.code === 'ACCOUNT_LOCKED') return renderLogin(root, boot, 'Tài khoản của bạn đã bị khóa. Liên hệ quản trị viên.');
    root.innerHTML = `<div class="center-screen"><div class="card auth-card"><p>${esc(e.message)}</p>
      <button class="btn btn-primary" id="retry">Thử lại</button></div></div>`;
    document.getElementById('retry').onclick = boot;
    return;
  }
  if (state.me.status === 'pending') return renderPending(root, state.me);
  // Mật khẩu SSH chưa được xác nhận đã lưu → bắt buộc xem trước (REQ-US-10, REQ-UI-08)
  try {
    const { password } = await get('/me/password');
    return renderFirstPassword(root, state.me, password, () => { renderShell(); route(); });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  }
  renderShell();
  route();
}

function renderShell() {
  const me = state.me;
  const nav = Object.entries(ROUTES)
    .filter(([, r]) => !r.admin || me.role === 'admin')
    .map(([key, r]) => `<a href="#/${key}" data-route="${key}">${icon(r.icon)}<span>${r.title}</span></a>`)
    .join('');
  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar" aria-label="Điều hướng chính">
        <a class="brand" href="#/"><img src="/assets/icon.svg" alt="" width="40" height="40">
          <div><strong>VMU GPU Server</strong><span>Đại học Hàng hải Việt Nam</span></div></a>
        <nav class="nav">${nav}</nav>
        <div class="sidebar-foot"><span class="tz">${icon('globe', 'icon-sm')} Giờ Việt Nam (${TZ_LABEL})</span></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <h1 id="page-title"></h1>
          <div class="topbar-actions">
            <div class="icon-btn-wrap">
              <button class="btn btn-ghost btn-icon" id="bell" aria-haspopup="true" aria-expanded="false" aria-label="Thông báo">${icon('bell')}</button>
              <span class="badge-count" id="bell-count" hidden></span>
              <div class="popover" id="notif-pop" hidden></div>
            </div>
            <div class="user-chip">
              ${me.avatar_url ? `<img src="${esc(me.avatar_url)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${esc(me.username[0].toUpperCase())}</span>`}
              <span>${esc(me.username)}</span>
            </div>
            <button class="btn btn-ghost btn-icon" id="logout" aria-label="Đăng xuất" title="Đăng xuất">${icon('logout')}</button>
          </div>
        </header>
        <main class="content" id="main" tabindex="-1">
          ${browserIsVN() ? '' : `<div class="tz-note" role="note" data-testid="tz-note">${icon('globe')}<span>Mọi giờ trên trang là <strong>giờ Việt Nam (${TZ_LABEL})</strong>, không theo múi giờ máy của bạn.</span></div>`}
          <div id="storage-alert"></div>
          <div id="view"></div>
        </main>
      </div>
    </div>`;
  // Ảnh Google không tải được → chữ cái đầu của username
  const avatar = root.querySelector('.user-chip img');
  if (avatar) avatar.onerror = () => avatar.replaceWith(Object.assign(document.createElement('span'), { className: 'avatar', textContent: me.username[0].toUpperCase() }));
  document.getElementById('logout').onclick = async () => {
    await post('/auth/logout').catch(() => {});
    location.hash = '';
    boot();
  };
  setupNotifications();
}

async function route() {
  const key = routeKey();
  const r = ROUTES[key] && (!ROUTES[key].admin || state.me.role === 'admin') ? ROUTES[key] : ROUTES[''];
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.route === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.getElementById('page-title').textContent = r.title;
  document.title = `${r.title} · VMU GPU Server`;
  const view = document.getElementById('view');
  view.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  try {
    await r.render(view, { state, refreshMe, navigate });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return boot();
    view.innerHTML = `<div class="alert alert-danger" role="alert">${icon('alert')}<div>${esc(e.message)}
      <div><button class="btn btn-secondary btn-sm" id="retry-view">Thử lại</button></div></div></div>`;
    document.getElementById('retry-view').onclick = route;
  }
  renderStorageAlert();
  document.getElementById('main').focus({ preventScroll: true });
}

// REQ-ST-02: chỉ hiện khi đã vượt soft quota
function renderStorageAlert() {
  const s = state.me?.storage;
  const box = document.getElementById('storage-alert');
  if (!box) return;
  box.innerHTML = s?.over_soft_since
    ? `<div class="alert alert-danger banner" role="alert">${icon('disk')}<span>Thư mục của bạn đã vượt ${Math.round(s.soft_bytes / 1024 ** 3)} GiB. Hãy dọn dẹp trước <strong class="num">${esc(fmtDateTime(s.grace_deadline))} (${TZ_LABEL})</strong>, sau đó sẽ không ghi thêm được.</span></div>`
    : '';
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

async function setupNotifications() {
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
    pop.hidden = !open;
    bell.setAttribute('aria-expanded', String(open));
    if (open) render(await load());
  };
  document.addEventListener('click', (ev) => {
    if (!pop.hidden && !ev.target.closest('.icon-btn-wrap')) {
      pop.hidden = true;
      bell.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !pop.hidden) { pop.hidden = true; bell.setAttribute('aria-expanded', 'false'); bell.focus(); }
  });
  load().catch(() => {});
  clearInterval(setupNotifications.timer);
  setupNotifications.timer = setInterval(() => load().catch(() => {}), 60_000);
}

window.addEventListener('hashchange', () => { if (state.me && state.me.status === 'active' && document.getElementById('view')) route(); });
window.addEventListener('unhandledrejection', (ev) => {
  if (ev.reason instanceof ApiError) { toast(ev.reason.message, 'error'); ev.preventDefault(); }
});

boot();
