// Tiện ích giao diện: escape HTML, icon SVG (nét 1.75, một bộ duy nhất), toast, hộp thoại, thông báo lỗi.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  gpu: '<rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="8" cy="12" r="2.2"/><circle cx="16" cy="12" r="2.2"/><path d="M6 17v3M18 17v3"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  disk: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/>',
  terminal: '<rect x="2.5" y="4" width="19" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2 2"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  hourglass: '<path d="M6 2h12M6 22h12M7 2v4l5 6 5-6V2M7 22v-4l5-6 5 6v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
};

export function icon(name, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

export const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

// ---- Toast (aria-live polite, tự ẩn sau 4 giây) ----
export function toast(message, kind = 'success') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
  box.append(el);
  setTimeout(() => el.remove(), 4000);
}

// ---- Hộp thoại dùng <dialog> (Esc để đóng, có nút đóng) ----
export function openDialog({ title, body, foot = '', wide = false, onClose }) {
  const d = document.createElement('dialog');
  if (wide) d.classList.add('wide');
  d.setAttribute('aria-labelledby', 'dlg-title');
  d.innerHTML = `
    <div class="dialog-head"><h2 id="dlg-title">${esc(title)}</h2>
      <button class="btn btn-ghost btn-icon" data-close aria-label="Đóng">${icon('x')}</button></div>
    <div class="dialog-body">${body}</div>
    ${foot ? `<div class="dialog-foot">${foot}</div>` : ''}`;
  document.body.append(d);
  const close = () => d.close();
  d.addEventListener('close', () => { d.remove(); onClose?.(); });
  d.addEventListener('click', (ev) => {
    if (ev.target === d || ev.target.closest('[data-close]')) close();
  });
  d.showModal();
  return { el: d, close };
}

export function confirmDialog({ title, message, confirmText, danger = false }) {
  return new Promise((resolve) => {
    let ok = false;
    const { el, close } = openDialog({
      title,
      body: `<p>${message}</p>`,
      foot: `<button class="btn btn-secondary" data-close>Không</button>
             <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-ok>${esc(confirmText)}</button>`,
      onClose: () => resolve(ok),
    });
    el.querySelector('[data-ok]').addEventListener('click', () => { ok = true; close(); });
    el.querySelector('[data-ok]').focus();
  });
}

// Nút đang xử lý: vô hiệu hóa + spinner, trả lại trạng thái cũ khi xong
export async function withBusy(btn, fn) {
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(btn.textContent.trim())}`;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = html;
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Đã sao chép');
  } catch {
    toast('Không sao chép được, hãy chọn và sao chép thủ công', 'error');
  }
}

// ---- Thông báo lỗi tiếng Việt — REQ-UI-03, docs/10-design/dashboard.md ----
const TIME_REASONS = {
  END_BEFORE_START: 'Giờ kết thúc phải sau giờ bắt đầu.',
  IN_PAST: 'Giờ này đã qua. Hãy chọn từ giờ tròn tiếp theo.',
  TOO_LONG: 'Mỗi ca dài tối đa 8 giờ.',
  NOT_ALIGNED: 'Chỉ đặt theo giờ tròn (vd 08:00, 09:00).',
  BEYOND_HORIZON: 'Chỉ đặt trước tối đa 7 ngày.',
  MISSING_TIMEZONE: 'Lỗi định dạng thời gian từ trình duyệt. Hãy tải lại trang.',
};

export function errorMessage(e) {
  switch (e.code) {
    case 'SLOT_FULL': return 'Khung giờ này đã đủ 2 phiên. Hãy chọn giờ khác.';
    case 'GPU_BUSY': return 'Khung giờ này đã có người dùng GPU. Bạn có thể đặt phiên không GPU hoặc chọn giờ khác.';
    case 'GPU_QUOTA_EXCEEDED': return 'Bạn đã dùng hết 10 giờ GPU tuần này. Bạn vẫn đặt được khung GPU còn trống trong 24 giờ tới.';
    case 'USER_OVERLAP': return 'Bạn đã có một ca khác trong khoảng thời gian này.';
    case 'INVALID_TIME': return TIME_REASONS[e.details?.reason] || 'Thời gian ca không hợp lệ.';
    case 'INVALID_STATE': return 'Thao tác không còn hợp lệ với trạng thái hiện tại của ca. Hãy tải lại trang.';
    case 'INVALID_SSH_KEY': return 'SSH key không đúng định dạng. Hãy dán nguyên dòng trong file .pub (vd bắt đầu bằng ssh-ed25519).';
    case 'INVALID_USERNAME': return 'Tên đăng nhập không hợp lệ (phải bắt đầu bằng chữ, chỉ gồm a-z 0-9 . _ -, tối đa 32 ký tự, không trùng tên hệ thống). Cần xử lý thủ công.';
    case 'USER_LIMIT_REACHED': return 'Đã đủ số tài khoản tối đa. Hãy xóa tài khoản không dùng trước khi duyệt thêm.';
    case 'PROVISIONING_FAILED': return 'Cấp phát tài khoản thất bại và đã được hoàn tác. Xem log máy chủ rồi thử lại.';
    case 'FORBIDDEN': return 'Bạn không có quyền thực hiện thao tác này.';
    case 'NOT_FOUND': return 'Không tìm thấy dữ liệu (có thể đã bị xóa).';
    case 'VALIDATION_ERROR': return 'Dữ liệu gửi lên chưa hợp lệ. Hãy kiểm tra lại các trường.';
    default: return e.message || 'Đã có lỗi xảy ra. Hãy thử lại.';
  }
}

// ---- Trạng thái ca ----
const STATUS = {
  scheduled: ['Đã đặt', 'tag-brand'],
  starting: ['Đang khởi chạy', 'tag-warning'],
  running: ['Đang chạy', 'tag-success'],
  exited: ['Đã dừng giữa chừng', 'tag-warning'],
  stopping: ['Đang dừng', 'tag-warning'],
  completed: ['Hoàn thành', 'tag-neutral'],
  cancelled: ['Đã hủy', 'tag-neutral'],
  failed: ['Lỗi', 'tag-danger'],
};
export function statusTag(status) {
  const [label, cls] = STATUS[status] || [status, 'tag-neutral'];
  return `<span class="tag ${cls}">${esc(label)}</span>`;
}
export const gpuTag = (useGpu) => (useGpu ? '<span class="tag tag-gpu">GPU</span>' : '<span class="tag tag-neutral">Không GPU</span>');

export const fmtGiB = (bytes) => (bytes == null ? '—' : (bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1));
