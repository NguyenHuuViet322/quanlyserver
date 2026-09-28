// Quản trị — REQ-UI-09, REQ-US-07, REQ-US-15, REQ-US-16, REQ-MN-03
import { get, post, del } from '../api.js';
import { esc, icon, toast, confirmDialog, withBusy, errorMessage } from '../ui.js';
import { fmtDateTime } from '../time.js';

const USER_STATUS = {
  pending: ['Chờ duyệt', 'tag-warning'],
  active: ['Đang hoạt động', 'tag-success'],
  locked: ['Đã khóa', 'tag-danger'],
  deleted: ['Đã xóa', 'tag-neutral'],
};
const ACTION_LABEL = {
  'booking.create': 'Đặt ca', 'booking.cancel': 'Hủy ca', 'booking.end': 'Kết thúc sớm', 'booking.restart': 'Khởi động lại',
  'user.approve': 'Duyệt tài khoản', 'user.lock': 'Khóa tài khoản', 'user.unlock': 'Mở khóa', 'user.delete': 'Xóa tài khoản',
  'user.purge': 'Xóa hẳn dữ liệu', 'user.password_reset': 'Cấp lại mật khẩu', 'user.promote_admin': 'Cấp quyền admin', 
};

export async function renderAdmin(view, ctx) {
  const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab') || 'users';
  view.innerHTML = `
    <div class="tabs" role="tablist" aria-label="Quản trị">
      ${[['users', 'Tài khoản'], ['audit', 'Nhật ký']].map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" data-tab="${k}">${l}</button>`).join('')}
    </div>
    <div id="tab-panel" role="tabpanel"></div>`;
  view.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => { location.hash = `#/quan-tri?tab=${b.dataset.tab}`; };
  });
  const panel = view.querySelector('#tab-panel');
  if (tab === 'audit') return renderAudit(panel);
  return renderUsers(panel, ctx);
}

async function renderUsers(panel, ctx, filter = 'pending') {
  const users = await get('/admin/users');
  const counts = Object.fromEntries(Object.keys(USER_STATUS).map((s) => [s, users.filter((u) => u.status === s).length]));
  const list = users.filter((u) => u.status === filter);
  const active = counts.active + counts.locked;

  panel.innerHTML = `
    <section class="card" aria-labelledby="h-users">
      <div class="card-head"><div><h2 id="h-users">Tài khoản</h2><p class="subtle num">${active}/30 tài khoản đang được cấp phát</p></div>
        <div class="row" role="group" aria-label="Lọc theo trạng thái">
          ${Object.entries(USER_STATUS).map(([s, [l]]) => `<button class="btn btn-sm ${s === filter ? 'btn-primary' : 'btn-secondary'}" data-filter="${s}" aria-pressed="${s === filter}">${l} <span class="num">(${counts[s]})</span></button>`).join('')}
        </div></div>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Người dùng</th><th>Tên đăng nhập</th><th>Trạng thái</th><th><span class="sr-only">Thao tác</span></th></tr></thead>
        <tbody>${list.map((u) => `<tr data-user="${u.id}">
          <td><strong>${esc(u.name)}</strong>${u.role === 'admin' ? ' <span class="tag tag-brand">Admin</span>' : ''}<div class="subtle">${esc(u.email)}</div></td>
          <td class="num"><code>${esc(u.username)}</code></td>
          <td><span class="tag ${USER_STATUS[u.status][1]}">${USER_STATUS[u.status][0]}</span></td>
          <td><div class="actions">
            ${u.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-act="approve" data-id="${u.id}">${icon('check', 'icon-sm')}Duyệt</button>` : ''}
            ${u.status === 'active' && u.id !== ctx.state.me.id ? `<button class="btn btn-secondary btn-sm" data-act="lock" data-id="${u.id}">${icon('lock', 'icon-sm')}Khóa</button>` : ''}
            ${u.status === 'locked' ? `<button class="btn btn-secondary btn-sm" data-act="unlock" data-id="${u.id}">${icon('unlock', 'icon-sm')}Mở khóa</button>` : ''}
            ${u.status !== 'deleted' && u.id !== ctx.state.me.id ? `<button class="btn btn-danger btn-sm" data-act="delete" data-id="${u.id}">${icon('trash', 'icon-sm')}Xóa</button>` : ''}
          </div></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">${icon('user')}<p>Không có tài khoản nào ở trạng thái này.</p></div>`}
    </section>`;

  panel.querySelectorAll('[data-filter]').forEach((b) => { b.onclick = () => renderUsers(panel, ctx, b.dataset.filter); });
  panel.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = async () => {
      const u = users.find((x) => String(x.id) === b.dataset.id);
      const act = b.dataset.act;
      const confirmCfg = {
        lock: { title: `Khóa ${u.username}?`, message: 'Người dùng không đăng nhập Dashboard/SSH được, các ca sắp tới bị hủy và phiên đang chạy bị dừng.', confirmText: 'Khóa', danger: true },
        delete: { title: `Xóa ${u.username}?`, message: 'Tài khoản bị khóa và giải phóng dải cổng. Dữ liệu được giữ 30 ngày rồi mới xóa hẳn.', confirmText: 'Xóa tài khoản', danger: true },
      }[act];
      if (confirmCfg && !(await confirmDialog(confirmCfg))) return;
      try {
        if (act === 'delete') await withBusy(b, () => del(`/admin/users/${u.id}`));
        else await withBusy(b, () => post(`/admin/users/${u.id}/${act}`));
        toast({ approve: `Đã duyệt ${u.username}`, lock: `Đã khóa ${u.username}`, unlock: `Đã mở khóa ${u.username}`, delete: `Đã xóa ${u.username}` }[act]);
        await renderUsers(panel, ctx, filter);
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    };
  });
}

async function renderAudit(panel) {
  const rows = await get('/admin/audit');
  panel.innerHTML = `
    <section class="card" aria-labelledby="h-audit">
      <div class="card-head"><h2 id="h-audit">Nhật ký thao tác</h2><span class="subtle">1000 dòng mới nhất</span></div>
      ${rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Thời điểm</th><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td class="num">${esc(fmtDateTime(r.created_at))}</td><td><code>${esc(r.actor)}</code></td>
          <td>${esc(ACTION_LABEL[r.action] || r.action)}</td><td class="num"><code>${esc(r.target)}</code></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="empty">${icon('file')}<p>Chưa có thao tác nào.</p></div>`}
    </section>`;
}
