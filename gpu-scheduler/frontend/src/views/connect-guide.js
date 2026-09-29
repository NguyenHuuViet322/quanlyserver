// Hướng dẫn kết nối SSH / VS Code — REQ-UI-11, REQ-CT-11. Dùng trong trang Ca của tôi.
import { get } from '../api.js';
import { esc, icon, copyText } from '../ui.js';

export async function connectGuideHtml(state) {
  const keys = await get('/me/ssh-keys').catch(() => []);
  const host = state.config?.ssh_host || 'gpu.vimaru.edu.vn';
  const u = state.me.username;
  const sshCmd = `ssh ${u}@${host}`;
  const sshConfig = `Host vmu\n  HostName ${host}\n  User ${u}\n  ProxyCommand ssh -T ${u}@${host} vmu-connect`;
  const html = `
    <div class="guide stack">
      ${keys.length ? '' : `<div class="alert alert-warning" data-testid="no-key-warning">${icon('key')}<span>Bạn chưa có SSH key. VS Code cần key để vào máy — thêm ở trang <a href="#/tai-khoan">Tài khoản &amp; Key</a>.</span></div>`}
      <div class="stack-sm">
        <p class="label-strong">Terminal nhanh <span class="subtle">(mật khẩu hoặc key)</span></p>
        <div class="codebox"><code data-testid="ssh-command">${esc(sshCmd)}</code>
          <button class="btn btn-ghost btn-sm" data-copy="cmd" aria-label="Sao chép lệnh SSH">${icon('copy', 'icon-sm')}</button></div>
      </div>
      <div class="stack-sm">
        <p class="label-strong">VS Code Remote-SSH <span class="subtle">— dán vào <code>~/.ssh/config</code> trên máy bạn, rồi Connect to Host → <code>vmu</code></span></p>
        <div class="codebox multi"><pre data-testid="ssh-config">${esc(sshConfig)}</pre>
          <button class="btn btn-ghost btn-sm" data-copy="config" aria-label="Sao chép cấu hình VS Code">${icon('copy', 'icon-sm')}</button></div>
      </div>
      <p class="subtle">Jupyter / TensorBoard: VS Code tự mở cổng, hoặc <code>ssh -L 8888:localhost:8888 vmu</code>. Chép file (<code>sftp</code>, <code>scp</code>, <code>rsync</code>) dùng được cả khi không có ca.</p>
    </div>`;
  const bind = (scope) => {
    scope.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = () => copyText(b.dataset.copy === 'cmd' ? sshCmd : sshConfig);
    });
  };
  return { html, bind };
}
