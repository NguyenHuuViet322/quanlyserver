// Quản trị — REQ-UI-09, REQ-US-07, US-15, US-16, US-17, US-18, REQ-MN-03 (docs/giao-dien.md mục 4)
import { get, post, del } from '../api.js';
import { esc, icon, toast, confirmDialog, withBusy, errorMessage } from '../ui.js';
import { fmtDateTime } from '../time.js';

const USER_STATUS = {
  pending: ['Chờ duyệt', 'tag-warning'],
  active: ['Đang hoạt động', 'tag-success'],
  locked: ['Đã khóa', 'tag-danger'],
  rejected: ['Đã từ chối', 'tag-neutral'],
  deleted: ['Đã xóa', 'tag-neutral'],
};
const ACTION_LABEL = {
  'booking.create': 'Đặt ca',
  'booking.cancel': 'Hủy ca',
  'booking.end': 'Kết thúc sớm',
  'booking.restart': 'Khởi động lại',
  'booking.start_failed': 'Ca không khởi chạy được',
  'booking.oom': 'Ca dừng do hết RAM',
  'user.approve': 'Duyệt tài khoản',
  'user.reject': 'Từ chối tài khoản',
  'user.lock': 'Khóa tài khoản',
  'user.unlock': 'Mở khóa',
  'user.delete': 'Xóa tài khoản',
  'user.purge': 'Xóa hẳn dữ liệu',
  'user.password_reset': 'Cấp lại mật khẩu',
  'user.promote_admin': 'Cấp quyền admin',
};
const TABS = [['pending', 'Duyệt tài khoản'], ['users', 'Quản lý người dùng'], ['audit', 'Nhật ký']];
const MAX_USERS = 30;

export async function renderAdmin(view, ctx) {
  let tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
  if (!TABS.some(([k]) => k === tab)) tab = 'pending';
  view.innerHTML = `
    <div class="tabs tabs-page" role="tablist" aria-label="Quản trị">
      ${TABS.map(([k, l]) => `<button role="tab" id="tab-${k}" aria-selected="${k === tab}" aria-controls="tab-panel" tabindex="${k === tab ? 0 : -1}" data-tab="${k}">${l}<span class="tab-count num" data-count="${k}"></span></button>`).join('')}
    </div>
    <div id="tab-panel" role="tabpanel" aria-labelledby="tab-${tab}"></div>`;
  view.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => { history.replaceState(null, '', `#/quan-tri?tab=${b.dataset.tab}`); renderAdmin(view, ctx); };
  });
  const panel = view.querySelector('#tab-panel');
  panel.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  if (tab === 'audit') return renderAudit(panel);
  return renderUsers(view, panel, ctx, tab);
}

async function renderUsers(view, panel, ctx, tab) {
  const users = await get('/admin/users');
  const pending = users.filter((u) => u.status === 'pending');
  const others = users.filter((u) => u.status !== 'pending');
  const provisioned = users.filter((u) => ['active', 'locked'].includes(u.status)).length;
  const countEl = view.querySelector('[data-count="pending"]');
  if (countEl) countEl.textContent = pending.length ? ` (${pending.length})` : '';
  const me = ctx.state.me;

  const userCell = (u) => `<td><div class="user-cell"><span class="avatar" aria-hidden="true">${esc(u.username[0].toUpperCase())}</span>
    <div><strong>${esc(u.name)}</strong>${u.role === 'admin' ? ' <span class="tag tag-brand">Admin</span>' : ''}<div class="subtle">${esc(u.email)}</div></div></div></td>`;

  if (tab === 'pending') {
    panel.innerHTML = `
      <section class="card" aria-labelledby="h-pending">
        <div class="card-head"><div><h2 id="h-pending">Tài khoản chờ duyệt</h2><p class="subtle num">${provisioned}/${MAX_USERS} tài khoản đang được cấp phát</p></div></div>
        ${pending.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Người dùng</th><th>Tên đăng nhập</th><th>Đăng ký lúc</th><th><span class="sr-only">Thao tác</span></th></tr></thead>
          <tbody>${pending.map((u) => `<tr data-user="${u.id}">${userCell(u)}
            <td class="num"><code>${esc(u.username)}</code></td>
            <td class="num">${u.created_at ? esc(fmtDateTime(u.created_at)) : '—'}</td>
            <td><div class="actions">
              <button class="btn btn-primary btn-sm" data-act="approve" data-id="${u.id}">${icon('check', 'icon-sm')}Duyệt</button>
              <button class="btn btn-danger btn-sm" data-act="reject" data-id="${u.id}">${icon('x', 'icon-sm')}Từ chối</button>
            </div></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">${icon('check')}<p>Không có tài khoản nào đang chờ duyệt.</p></div>`}
      </section>`;
  } else {
    panel.innerHTML = `
      <section class="card" aria-labelledby="h-users">
        <div class="card-head"><div><h2 id="h-users">Người dùng</h2><p class="subtle num">${provisioned}/${MAX_USERS} tài khoản đang được cấp phát</p></div></div>
        ${others.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Người dùng</th><th>Tên đăng nhập</th><th>Trạng thái</th><th><span class="sr-only">Thao tác</span></th></tr></thead>
          <tbody>${others.map((u) => {
    const self = u.id === me.id;
    const acts = [];
    if (u.status === 'active') acts.push(`<button class="btn btn-secondary btn-sm" data-act="password-reset" data-id="${u.id}">${icon('refresh', 'icon-sm')}Cấp lại mật khẩu SSH</button>`);
    if (u.status === 'active' && !self) acts.push(`<button class="btn btn-secondary btn-sm" data-act="lock" data-id="${u.id}">${icon('lock', 'icon-sm')}Khóa</button>`);
    if (u.status === 'locked') acts.push(`<button class="btn btn-secondary btn-sm" data-act="unlock" data-id="${u.id}">${icon('unlock', 'icon-sm')}Mở khóa</button>`);
    if (u.status === 'rejected') acts.push(`<button class="btn btn-secondary btn-sm" data-act="approve" data-id="${u.id}">${icon('check', 'icon-sm')}Duyệt lại</button>`);
    if (['active', 'locked'].includes(u.status) && !self) acts.push(`<button class="btn btn-danger btn-sm" data-act="delete" data-id="${u.id}">${icon('trash', 'icon-sm')}Xóa</button>`);
    return `<tr data-user="${u.id}">${userCell(u)}
            <td class="num"><code>${esc(u.username)}</code></td>
            <td><span class="tag ${USER_STATUS[u.status]?.[1] || 'tag-neutral'}">${USER_STATUS[u.status]?.[0] || esc(u.status)}</span></td>
            <td><div class="actions">${acts.join('')}</div></td></tr>`;
  }).join('')}</tbody></table></div>`
    : `<div class="empty">${icon('user')}<p>Chưa có người dùng nào.</p></div>`}
      </section>`;
  }

  panel.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = async () => {
      const u = users.find((x) => String(x.id) === b.dataset.id);
      const act = b.dataset.act;
      const confirmCfg = {
        reject: { title: `Từ chối ${u.username}?`, message: 'Người này sẽ không đăng nhập được. Có thể duyệt lại sau ở tab Quản lý người dùng.', confirmText: 'Từ chối', danger: true },
        'password-reset': { title: `Cấp lại mật khẩu SSH cho ${u.username}?`, message: 'Mật khẩu cũ hết hiệu lực ngay. Người dùng sẽ thấy mật khẩu mới ở lần mở Dashboard tiếp theo; quản trị viên không xem được mật khẩu.', confirmText: 'Cấp lại' },
        lock: { title: `Khóa ${u.username}?`, message: 'Người dùng không đăng nhập Dashboard/SSH được, các ca sắp tới bị hủy và phiên đang chạy bị dừng.', confirmText: 'Khóa', danger: true },
        delete: { title: `Xóa ${u.username}?`, message: 'Tài khoản bị khóa ngay. Dữ liệu được giữ 30 ngày rồi mới xóa hẳn.', confirmText: 'Xóa tài khoản', danger: true },
      }[act];
      if (confirmCfg && !(await confirmDialog(confirmCfg))) return;
      try {
        if (act === 'delete') await withBusy(b, () => del(`/admin/users/${u.id}`));
        else await withBusy(b, () => post(`/admin/users/${u.id}/${act}`));
        toast({
          approve: `Đã duyệt ${u.username}`,
          reject: `Đã từ chối ${u.username}`,
          'password-reset': `Đã cấp lại mật khẩu cho ${u.username}`,
          lock: `Đã khóa ${u.username}`,
          unlock: `Đã mở khóa ${u.username}`,
          delete: `Đã xóa ${u.username}`,
        }[act]);
        await renderUsers(view, panel, ctx, tab);
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    };
  });
}

async function renderAudit(panel, filter = { user: '', action: '', from: '', to: '' }) {
  // "Đến ngày" tính cả ngày đó: gửi 00:00 của ngày hôm sau
  const query = { ...filter, to: filter.to ? new Date(Date.parse(`${filter.to}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : '' };
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
  const rows = await get(`/admin/audit${qs ? `?${qs}` : ''}`);
  panel.innerHTML = `
    <section class="card" aria-labelledby="h-audit">
      <div class="card-head"><h2 id="h-audit">Nhật ký hệ thống</h2><span class="subtle">Tối đa 1000 dòng mới nhất</span></div>
      <form class="filter-bar" id="audit-filter">
        <div class="field"><label for="a-user">Người dùng</label><input class="input" id="a-user" value="${esc(filter.user)}" placeholder="vd vietnh" autocomplete="off"></div>
        <div class="field"><label for="a-action">Loại sự kiện</label>
          <select class="select" id="a-action"><option value="">Tất cả</option>
            <option value="booking." ${filter.action === 'booking.' ? 'selected' : ''}>Mọi sự kiện về ca</option>
            <option value="user." ${filter.action === 'user.' ? 'selected' : ''}>Mọi sự kiện về tài khoản</option>
            ${Object.entries(ACTION_LABEL).map(([k, l]) => `<option value="${k}" ${filter.action === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <div class="field"><label for="a-from">Từ ngày</label><input class="input" type="date" id="a-from" value="${esc(filter.from)}"></div>
        <div class="field"><label for="a-to">Đến ngày</label><input class="input" type="date" id="a-to" value="${esc(filter.to)}"></div>
        <div class="filter-actions"><button class="btn btn-primary" type="submit">${icon('check', 'icon-sm')}Lọc</button></div>
      </form>
      ${rows.length ? `<div class="table-wrap"><table data-testid="audit-table">
        <thead><tr><th>Thời điểm</th><th>Người thực hiện</th><th>Sự kiện</th><th>Đối tượng</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td class="num">${esc(fmtDateTime(r.created_at))}</td><td><code>${esc(r.actor)}</code></td>
          <td>${esc(ACTION_LABEL[r.action] || r.action)}</td><td class="num"><code>${esc(r.target)}</code>${r.details?.username ? ` <span class="subtle">${esc(r.details.username)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty" data-testid="audit-table">${icon('file')}<p>Không có sự kiện nào khớp bộ lọc.</p></div>`}
    </section>`;
  panel.querySelector('#audit-filter').onsubmit = async (ev) => {
    ev.preventDefault();
    const next = {
      user: panel.querySelector('#a-user').value.trim(),
      action: panel.querySelector('#a-action').value,
      from: panel.querySelector('#a-from').value,
      to: panel.querySelector('#a-to').value,
    };
    try {
      await renderAudit(panel, next);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
}
