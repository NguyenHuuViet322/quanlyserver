// Tài khoản & Key — REQ-UI-16, REQ-US-11, US-12, US-13, REQ-ST-02 (docs/giao-dien.md mục 3)
import { get, post, del } from '../api.js';
import { esc, icon, toast, confirmDialog, openDialog, withBusy, errorMessage, copyText, fmtGiB } from '../ui.js';
import { fmtDateFull, TZ_LABEL, fmtDateTime } from '../time.js';

function storageLevel(s) {
  if (s.used_bytes == null) return 'ok';
  if (s.used_bytes >= s.hard_bytes) return 'full';
  if (s.used_bytes >= s.soft_bytes) return 'warn';
  return 'ok';
}

export async function renderAccount(view, ctx) {
  const [me, keys] = await Promise.all([ctx.refreshMe(), get('/me/ssh-keys')]);
  const s = me.storage || {};
  const pct = s.used_bytes != null ? Math.min(100, (s.used_bytes / s.hard_bytes) * 100) : 0;
  const level = storageLevel(s);
  const softGiB = Math.round((s.soft_bytes || 0) / 1024 ** 3);
  const levelNote = {
    ok: '',
    warn: `<div class="alert alert-warning">${icon('alert')}<span>Đã vượt ${softGiB} GiB — hãy dọn dẹp bớt dữ liệu${s.grace_deadline ? ` trước <strong class="num">${esc(fmtDateTime(s.grace_deadline))} (${TZ_LABEL})</strong>` : ''}, quá hạn sẽ không ghi thêm được.</span></div>`,
    full: `<div class="alert alert-danger">${icon('alert')}<span>Đã đầy — hiện không ghi được thêm dữ liệu. Hãy xóa bớt hoặc tải kết quả về máy.</span></div>`,
  }[level];

  view.innerHTML = `
    <div class="account-grid">
      <div class="stack">
        <section class="card card-pad stack" aria-labelledby="h-disk" data-testid="storage" data-level="${level}">
          <div class="row">${icon('disk')}<h2 id="h-disk">Dung lượng lưu trữ</h2></div>
          <p class="num storage-figure"><strong>${fmtGiB(s.used_bytes)}</strong> <span class="muted">/ ${fmtGiB(s.hard_bytes)} GiB</span></p>
          <div class="meter meter-lg ${level === 'full' ? 'danger' : level}"><span style="width:${pct}%"></span></div>
          ${levelNote}
          <p class="subtle">Thư mục <code>/workspace</code> của bạn. Máy chủ <strong>không sao lưu</strong> dữ liệu — hãy tự tải kết quả quan trọng về máy bằng SFTP (<code>sftp</code>, <code>scp</code>, <code>rsync</code>, WinSCP), dùng được cả khi không có ca.</p>
        </section>

        <section class="card card-pad stack-sm" aria-labelledby="h-pass">
          <div class="row">${icon('lock')}<h2 id="h-pass">Mật khẩu SSH</h2></div>
          <p class="subtle">Dùng cho <code>ssh ${esc(me.username)}@${esc(ctx.state.config?.ssh_host || 'gpu.vimaru.edu.vn')}</code>. Quên mật khẩu thì tạo lại; mật khẩu cũ hết hiệu lực ngay.</p>
          <div><button class="btn btn-secondary" id="reset">${icon('refresh', 'icon-sm')}Tạo lại mật khẩu SSH ngẫu nhiên</button></div>
        </section>
      </div>

      <section class="card" aria-labelledby="h-keys" id="keys">
        <div class="card-head"><div class="row">${icon('key')}<h2 id="h-keys">SSH Key</h2></div><span class="subtle num">${keys.length} key</span></div>
        <div class="card-body stack">
          ${keys.length ? `<ul class="key-list">${keys.map((k) => `
            <li><div class="stack-sm key-info"><strong>${esc(k.name)}</strong>
              <span class="subtle"><code>${esc(k.fingerprint)}</code> · thêm ngày ${esc(fmtDateFull(k.created_at))}</span></div>
              <button class="btn btn-danger btn-sm" data-del="${k.id}" aria-label="Xóa key ${esc(k.name)}">${icon('trash', 'icon-sm')}Xóa</button></li>`).join('')}</ul>`
    : `<p class="muted">Chưa có key nào. VS Code Remote-SSH cần key để kết nối.</p>`}
          <form class="stack-sm key-form" id="key-form" novalidate>
            <div class="field"><label for="key-name">Tên gợi nhớ</label>
              <input class="input" id="key-name" maxlength="60" placeholder="vd Laptop cá nhân" autocomplete="off"></div>
            <div class="field"><label for="key">Khóa public</label>
              <textarea class="textarea" id="key" rows="3" placeholder="ssh-ed25519 AAAAC3Nza… ten@may" aria-describedby="key-help key-err" spellcheck="false"></textarea>
              <p class="help" id="key-help">Nội dung file <code>~/.ssh/id_ed25519.pub</code>. Chưa có key? Chạy <code>ssh-keygen -t ed25519</code> trên máy của bạn.</p>
              <div id="key-err"></div></div>
            <div><button class="btn btn-primary" id="add-key" type="submit">${icon('plus', 'icon-sm')}Thêm SSH Key</button></div>
          </form>
        </div>
      </section>
    </div>`;

  view.querySelector('#reset').onclick = async (ev) => {
    if (!(await confirmDialog({ title: 'Tạo lại mật khẩu SSH?', message: 'Mật khẩu hiện tại sẽ hết hiệu lực ngay.', confirmText: 'Tạo lại' }))) return;
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
    const name = view.querySelector('#key-name').value.trim();
    const errBox = view.querySelector('#key-err');
    errBox.innerHTML = '';
    ta.removeAttribute('aria-invalid');
    try {
      await withBusy(view.querySelector('#add-key'), () => post('/me/ssh-keys', { public_key: ta.value.trim(), ...(name && { name }) }));
      toast('Đã thêm SSH key');
      await renderAccount(view, ctx);
    } catch (e) {
      ta.setAttribute('aria-invalid', 'true');
      errBox.innerHTML = `<p class="error-text" role="alert">${icon('alert', 'icon-sm')}${esc(errorMessage(e))}</p>`;
      ta.focus();
    }
  };

  view.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmDialog({ title: 'Xóa SSH key?', message: 'Máy dùng key này sẽ không kết nối được nữa.', confirmText: 'Xóa', danger: true }))) return;
      try {
        await del(`/me/ssh-keys/${b.dataset.del}`);
        toast('Đã xóa key');
        await renderAccount(view, ctx);
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    };
  });
}
