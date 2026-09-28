// Kết nối — REQ-UI-05, REQ-UI-11, REQ-US-12, REQ-US-13, REQ-CT-11
import { get, post, del } from '../api.js';
import { esc, icon, toast, confirmDialog, openDialog, withBusy, errorMessage, copyText, fmtGiB } from '../ui.js';
import { fmtDateFull } from '../time.js';

export async function renderConnect(view, ctx) {
  const { state, refreshMe } = ctx;
  const [me, keys] = await Promise.all([refreshMe(), get('/me/ssh-keys')]);
  const host = state.config?.ssh_host || 'gpu.vimaru.edu.vn';
  const u = me.username;
  const sshConfig = `Host vmu\n  HostName ${host}\n  User ${u}\n  ProxyCommand ssh -T ${u}@${host} vmu-connect`;
  const s = me.storage || {};
  const pct = s.used_bytes != null ? Math.min(100, (s.used_bytes / s.hard_bytes) * 100) : 0;

  view.innerHTML = `
    <div class="connect-grid">
      <div class="stack">
        <section class="card card-pad stack" aria-labelledby="h-vscode">
          <div class="row">${icon('code')}<h2 id="h-vscode">Kết nối bằng VS Code</h2></div>
          ${keys.length ? '' : `<div class="alert alert-warning" data-testid="no-key-warning">${icon('key')}<span>Bạn chưa có SSH key. VS Code cần key để vào máy, hãy thêm ở mục <a href="#keys">SSH key</a> bên dưới.</span></div>`}
          <ol class="steps">
            <li><strong>Thêm SSH key</strong> của máy bạn ở mục bên dưới (chỉ làm một lần).</li>
            <li><strong>Dán vào</strong> file <code>~/.ssh/config</code> trên máy bạn:
              <div class="codebox multi"><pre data-testid="ssh-config">${esc(sshConfig)}</pre>
                <button class="btn btn-ghost btn-sm" id="copy-config" aria-label="Sao chép cấu hình VS Code">${icon('copy', 'icon-sm')}</button></div></li>
            <li>Trong VS Code: <strong>Remote-SSH: Connect to Host…</strong> → chọn <code>vmu</code>. Cần có ca đang chạy.</li>
          </ol>
          <p class="subtle">Jupyter, TensorBoard chạy trong máy sẽ được VS Code tự mở cổng. Không dùng VS Code thì: <code>ssh -L 8888:localhost:8888 vmu</code>.</p>
        </section>

        <section class="card" aria-labelledby="h-keys" id="keys">
          <div class="card-head"><h2 id="h-keys">SSH key</h2></div>
          <div class="card-body stack">
            ${keys.length ? `<div class="table-wrap"><table><thead><tr><th>Key</th><th>Thêm ngày</th><th><span class="sr-only">Thao tác</span></th></tr></thead><tbody>
              ${keys.map((k) => {
    const [type, , ...comment] = k.public_key.split(' ');
    return `<tr><td><strong>${esc(comment.join(' ') || type)}</strong><div class="subtle"><code>${esc(k.fingerprint)}</code></div></td>
                <td class="num">${esc(fmtDateFull(k.created_at))}</td>
                <td><div class="actions"><button class="btn btn-danger btn-sm" data-del="${k.id}" aria-label="Xóa key ${esc(comment.join(' ') || k.fingerprint)}">${icon('trash', 'icon-sm')}Xóa</button></div></td></tr>`;
  }).join('')}</tbody></table></div>` : ''}
            <form class="stack-sm" id="key-form" novalidate>
              <label for="key" class="label-strong">Thêm SSH key <span class="subtle">(nội dung file <code>~/.ssh/id_ed25519.pub</code>)</span></label>
              <textarea class="textarea" id="key" rows="3" placeholder="ssh-ed25519 AAAAC3Nza… ten@may" aria-describedby="key-err key-help" spellcheck="false"></textarea>
              <p class="help" id="key-help">Chưa có key? Chạy <code>ssh-keygen -t ed25519</code> trên máy của bạn.</p>
              <div id="key-err"></div>
              <div><button class="btn btn-primary" id="add-key" type="submit">${icon('plus', 'icon-sm')}Thêm key</button></div>
            </form>
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card card-pad stack-sm" aria-labelledby="h-term">
          <div class="row">${icon('terminal')}<h2 id="h-term">Terminal nhanh</h2></div>
          <div class="codebox"><code data-testid="ssh-command">ssh ${esc(u)}@${esc(host)}</code>
            <button class="btn btn-ghost btn-sm" id="copy-ssh" aria-label="Sao chép lệnh SSH">${icon('copy', 'icon-sm')}</button></div>
          <p class="subtle">Dùng mật khẩu hoặc key. Có ca thì vào thẳng máy của bạn; không có ca vẫn chép file được bằng <code>sftp</code>, <code>scp</code>, <code>rsync</code>.</p>
        </section>

        <section class="card card-pad stack-sm" aria-labelledby="h-disk" data-testid="storage">
          <div class="row">${icon('disk')}<h2 id="h-disk">Dung lượng /workspace</h2></div>
          <p class="num"><strong style="font-size:var(--fs-xl)">${fmtGiB(s.used_bytes)}</strong> <span class="muted">/ ${fmtGiB(s.hard_bytes)} GiB</span></p>
          <div class="meter ${s.over_soft_since ? 'danger' : pct > 72 ? 'warn' : ''}"><span style="width:${pct}%"></span></div>
          <p class="subtle">Server không sao lưu dữ liệu, hãy tự sao lưu kết quả quan trọng.</p>
        </section>

        <section class="card card-pad stack-sm" aria-labelledby="h-pass">
          <div class="row">${icon('lock')}<h2 id="h-pass">Mật khẩu SSH</h2></div>
          <p class="subtle">Quên mật khẩu thì cấp lại; mật khẩu cũ hết hiệu lực ngay.</p>
          <div><button class="btn btn-secondary" id="reset">${icon('refresh', 'icon-sm')}Cấp lại mật khẩu</button></div>
        </section>

        <section class="card card-pad stack-sm" aria-labelledby="h-soft">
          <div class="row">${icon('box')}<h2 id="h-soft">Cài phần mềm</h2></div>
          <p class="subtle">Không có quyền root; mọi thứ cài vào <code>/workspace</code> đều còn ở ca sau:</p>
          <ul class="compact">
            <li><code>pip install …</code>, <code>conda create -n ml python=3.12</code></li>
            <li><code>conda install -c conda-forge ffmpeg gcc cmake nodejs</code></li>
            <li>Cần phần mềm cài bằng <code>apt</code>: nhờ quản trị viên thêm vào máy chung</li>
          </ul>
        </section>
      </div>
    </div>`;

  view.querySelector('#copy-config').onclick = () => copyText(sshConfig);
  view.querySelector('#copy-ssh').onclick = () => copyText(`ssh ${u}@${host}`);

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
      await renderConnect(view, ctx);
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
        await renderConnect(view, ctx);
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    };
  });
}
