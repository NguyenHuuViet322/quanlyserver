// Đăng nhập, chờ duyệt, mật khẩu lần đầu — REQ-UI-07, REQ-UI-08
import { post } from '../api.js';
import { esc, icon, GOOGLE_G, toast, copyText, errorMessage } from '../ui.js';
import { state } from '../app.js';

const card = (inner) => `<div class="center-screen"><div class="card auth-card"><div class="brand-stripe" style="margin:-40px -32px 32px;border-radius:14px 14px 0 0"></div>${inner}</div></div>`;

// Google Identity Services: nếu tải được thì vẽ nút chính thức; nút của trang luôn hiển thị (không phụ thuộc mạng ngoài)
function loadGsi() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.id) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.append(s);
    setTimeout(() => resolve(false), 5000);
  });
}

export function renderLogin(root, onDone, notice = '') {
  document.title = 'Đăng nhập · VMU GPU Server';
  root.innerHTML = card(`
    <img class="logo" src="/assets/icon.svg" alt="Logo Đại học Hàng hải Việt Nam" width="88" height="88">
    <h1>VMU GPU Server</h1>
    <p class="lead">Đặt lịch sử dụng máy chủ GPU RTX 5090 của trường</p>
    ${notice ? `<div class="alert alert-danger" role="alert" style="margin-bottom:24px;text-align:left">${icon('alert')}<span>${esc(notice)}</span></div>` : ''}
    <div id="login-error" role="alert"></div>
    <button class="btn btn-secondary btn-block google-btn" id="google-login" type="button">${GOOGLE_G}<span>Đăng nhập bằng Google</span></button>
    <div class="gsi-slot" id="gsi" aria-hidden="true" style="display:none"></div>
    ${state.config?.dev_login ? `<a class="btn btn-primary btn-block" href="/__dev" style="margin-top:12px">${icon('user')}Chạy thử: chọn tài khoản mẫu</a>
      <p class="subtle" style="margin-top:8px">Đang chạy thử trên máy local: Google là bản giả, hãy dùng tài khoản mẫu.</p>` : ''}
    <p class="foot">Chỉ dùng email <strong>@vimaru.edu.vn</strong>. Tài khoản mới cần quản trị viên duyệt.</p>`);

  const errBox = root.querySelector('#login-error');
  const btn = root.querySelector('#google-login');

  async function handleCredential(resp) {
    try {
      await post('/auth/google', { id_token: resp.credential });
      onDone();
    } catch (e) {
      const msg = e.code === 'DOMAIN_NOT_ALLOWED' ? 'Chỉ chấp nhận tài khoản @vimaru.edu.vn. Hãy chọn đúng tài khoản trường.'
        : e.code === 'ACCOUNT_LOCKED' ? 'Tài khoản của bạn đã bị khóa. Liên hệ quản trị viên.'
          : e.code === 'EMAIL_NOT_VERIFIED' ? 'Email Google của bạn chưa được xác minh.'
            : errorMessage(e);
      errBox.innerHTML = `<div class="alert alert-danger" style="margin-bottom:16px;text-align:left">${icon('alert')}<span>${esc(msg)}</span></div>`;
    }
  }

  btn.onclick = async () => {
    const clientId = state.config?.google_client_id;
    if (!clientId || !(await loadGsi())) {
      errBox.innerHTML = `<div class="alert alert-warning" style="margin-bottom:16px;text-align:left">${icon('alert')}<span>Không tải được dịch vụ đăng nhập Google. Kiểm tra kết nối mạng rồi thử lại.</span></div>`;
      return;
    }
    // hd chỉ để Google gợi ý tài khoản trường; backend mới là nơi kiểm tra (REQ-US-03)
    window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential, hd: 'vimaru.edu.vn', ux_mode: 'popup' });
    window.google.accounts.id.prompt((n) => {
      if (n.isNotDisplayed?.() || n.isSkippedMoment?.()) {
        // Trình duyệt chặn One Tap → dùng nút chính thức của Google
        const slot = root.querySelector('#gsi');
        slot.style.display = 'flex';
        slot.removeAttribute('aria-hidden');
        btn.hidden = true;
        window.google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'vi', width: 320 });
      }
    });
  };
}

export function renderPending(root, me) {
  document.title = 'Chờ duyệt · VMU GPU Server';
  root.innerHTML = card(`
    <img class="logo" src="/assets/icon.svg" alt="" width="88" height="88">
    <h1 data-testid="pending-title">Tài khoản đang chờ duyệt</h1>
    <p class="lead">Xin chào <strong>${esc(me.name)}</strong>. Quản trị viên sẽ duyệt tài khoản <strong>${esc(me.email)}</strong>.
      Sau khi được duyệt, bạn đăng nhập lại để nhận mật khẩu SSH.</p>
    <div class="row" style="justify-content:center">
      <button class="btn btn-primary" id="recheck">${icon('refresh')}Kiểm tra lại</button>
      <button class="btn btn-ghost" id="logout">Đăng xuất</button>
    </div>`);
  root.querySelector('#recheck').onclick = () => location.reload();
  root.querySelector('#logout').onclick = async () => { await post('/auth/logout').catch(() => {}); location.reload(); };
}

export function renderFirstPassword(root, me, password, onDone) {
  document.title = 'Mật khẩu SSH · VMU GPU Server';
  const host = state.config?.ssh_host || 'máy chủ';
  root.innerHTML = card(`
    <div style="text-align:left" class="stack">
      <div class="row">${icon('key')}<h1 style="font-size:var(--fs-lg)">Mật khẩu SSH của bạn</h1></div>
      <div class="alert alert-warning" role="alert">${icon('alert')}
        <span><strong>Mật khẩu chỉ hiển thị một lần.</strong> Hãy lưu vào trình quản lý mật khẩu trước khi tiếp tục. Lần SSH đầu tiên bạn sẽ phải đổi mật khẩu.</span></div>
      <div class="secret num" data-testid="ssh-password">${esc(password)}</div>
      <button class="btn btn-secondary btn-block" id="copy">${icon('copy')}Sao chép mật khẩu</button>
      <div class="stack-sm"><p class="subtle">Đăng nhập:</p>
        <div class="codebox"><code>ssh ${esc(me.username)}@${esc(host)}</code></div></div>
      <label class="row" style="gap:10px;align-items:flex-start">
        <input type="checkbox" id="saved" style="width:20px;height:20px;margin-top:2px">
        <span>Tôi đã lưu mật khẩu ở nơi an toàn</span></label>
      <button class="btn btn-primary btn-block" id="ack" disabled>Tôi đã lưu</button>
    </div>`);
  root.querySelector('#copy').onclick = () => copyText(password);
  const ack = root.querySelector('#ack');
  root.querySelector('#saved').onchange = (ev) => { ack.disabled = !ev.target.checked; };
  ack.onclick = async () => {
    await post('/me/password/ack');
    toast('Đã xác nhận. Mật khẩu sẽ không hiển thị lại.');
    onDone();
  };
}
