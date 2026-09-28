// Tài khoản & SSH — REQ-US-12, REQ-US-13, REQ-UI-05
import { get, post, del } from '../api.js';
import { esc, icon, toast, confirmDialog, openDialog, withBusy, errorMessage, copyText } from '../ui.js';
import { fmtDateFull } from '../time.js';

export async function renderAccount(view, { state }) {
  const me = state.me;
  const keys = await get('/me/ssh-keys');
  const host = state.config?.ssh_host || 'máy chủ';

  view.innerHTML = `<div class="grid grid-2">
    <section class="card card-pad stack" aria-labelledby="h-profile">
      <h2 id="h-profile">Thông tin</h2>
      <div class="row">${me.avatar_url ? `<img class="avatar" style="width:56px;height:56px" src="${esc(me.avatar_url)}" alt="" referrerpolicy="no-referrer">` : ''}
        <div><strong>${esc(me.name)}</strong><p class="muted">${esc(me.email)}</p></div></div>
      <table><tbody>
        <tr><th scope="row">Tên đăng nhập SSH</th><td class="num"><strong>${esc(me.username)}</strong></td></tr>
        <tr><th scope="row">Dải cổng</th><td class="num">${me.ports.from}–${me.ports.to}</td></tr>
        <tr><th scope="row">Vai trò</th><td>${me.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}</td></tr>
      </tbody></table>
    </section>

    <section class="card card-pad stack" aria-labelledby="h-pass">
      <h2 id="h-pass">Mật khẩu SSH</h2>
      <p class="muted">Quên mật khẩu? Cấp lại mật khẩu mới: mật khẩu cũ hết hiệu lực ngay, mật khẩu mới chỉ hiển thị một lần và phải đổi ở lần SSH đầu.</p>
      <div><button class="btn btn-secondary" id="reset">${icon('refresh', 'icon-sm')}Cấp lại mật khẩu</button></div>
      <div class="codebox"><code>ssh ${esc(me.username)}@${esc(host)}</code></div>
    </section>

    <section class="card" aria-labelledby="h-keys" style="grid-column:1/-1">
      <div class="card-head"><div><h2 id="h-keys">SSH key</h2><p class="subtle">Khuyến nghị dùng key thay cho mật khẩu</p></div></div>
      <div class="card-body stack">
        ${keys.length ? `<div class="table-wrap"><table><thead><tr><th>Key</th><th>Fingerprint</th><th>Thêm ngày</th><th><span class="sr-only">Thao tác</span></th></tr></thead><tbody>
          ${keys.map((k) => `<tr><td><code>${esc(k.public_key.split(' ')[0])} …${esc(k.public_key.split(' ').slice(2).join(' '))}</code></td>
            <td class="num"><code>${esc(k.fingerprint)}</code></td><td class="num">${esc(fmtDateFull(k.created_at))}</td>
            <td><div class="actions"><button class="btn btn-danger btn-sm" data-del="${k.id}" aria-label="Xóa key ${esc(k.fingerprint)}">${icon('trash', 'icon-sm')}Xóa</button></div></td></tr>`).join('')}
        </tbody></table></div>` : `<div class="empty">${icon('key')}<p>Chưa có SSH key nào.</p></div>`}
        <form class="stack-sm" id="key-form" novalidate>
          <label for="key" class="label" style="font-weight:600;font-size:var(--fs-sm)">Thêm key (nội dung file <code>~/.ssh/id_ed25519.pub</code>)</label>
          <textarea class="textarea" id="key" rows="3" placeholder="ssh-ed25519 AAAAC3Nza… ten@may" aria-describedby="key-err" spellcheck="false"></textarea>
          <div id="key-err"></div>
          <div><button class="btn btn-primary" id="add-key" type="submit">${icon('plus', 'icon-sm')}Thêm key</button></div>
        </form>
      </div>
    </section>
  </div>`;

  view.querySelector('#reset').onclick = async (ev) => {
    if (!(await confirmDialog({ title: 'Cấp lại mật khẩu SSH?', message: 'Mật khẩu hiện tại sẽ hết hiệu lực ngay.', confirmText: 'Cấp lại' }))) return;
    try {
      const { password } = await withBusy(ev.currentTarget, () => post('/me/password/reset'));
      const { el, close } = openDialog({
        title: 'Mật khẩu SSH mới',
        body: `<div class="stack"><div class="alert alert-warning">${icon('alert')}<span><strong>Chỉ hiển thị một lần.</strong> Hãy lưu lại trước khi đóng.</span></div>
          <div class="secret num">${esc(password)}</div>
          <button class="btn btn-secondary btn-block" id="cp">${icon('copy')}Sao chép</button></div>`,
        foot: '<button class="btn btn-primary" id="ok">Tôi đã lưu</button>',
        onClose: () => post('/me/password/ack').catch(() => {}),
      });
      el.querySelector('#cp').onclick = () => copyText(password);
      el.querySelector('#ok').onclick = close;
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  view.querySelector('#key-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const ta = view.querySelector('#key');
    const errBox = view.querySelector('#key-err');
    errBox.innerHTML = '';
    ta.removeAttribute('aria-invalid');
    try {
      await withBusy(view.querySelector('#add-key'), () => post('/me/ssh-keys', { public_key: ta.value }));
      toast('Đã thêm SSH key');
      await renderAccount(view, { state });
    } catch (e) {
      ta.setAttribute('aria-invalid', 'true');
      errBox.innerHTML = `<p class="error-text" role="alert">${icon('alert', 'icon-sm')}${esc(errorMessage(e))}</p>`;
      ta.focus();
    }
  };

  view.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmDialog({ title: 'Xóa SSH key?', message: 'Máy dùng key này sẽ không SSH được nữa.', confirmText: 'Xóa', danger: true }))) return;
      try {
        await del(`/me/ssh-keys/${b.dataset.del}`);
        toast('Đã xóa key');
        await renderAccount(view, { state });
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    };
  });
}
