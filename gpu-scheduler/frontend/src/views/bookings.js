// Ca của tôi — REQ-UI-06, REQ-MN-01, REQ-MN-02, REQ-MN-04
import { get, post, api } from '../api.js';
import { esc, icon, toast, statusTag, gpuTag, confirmDialog, openDialog, withBusy, errorMessage, fmtGiB } from '../ui.js';
import { fmtRange, relative, fmtTime } from '../time.js';

const LIVE = ['starting', 'running', 'exited', 'stopping'];

export async function renderBookings(view) {
  const all = await get('/bookings');
  const now = new Date();
  const live = all.filter((b) => LIVE.includes(b.status));
  const upcoming = all.filter((b) => b.status === 'scheduled');
  const past = all.filter((b) => !LIVE.includes(b.status) && b.status !== 'scheduled').reverse();

  const actions = (b) => {
    const out = [];
    if (b.status === 'scheduled') out.push(`<button class="btn btn-danger btn-sm" data-act="cancel" data-id="${b.id}">${icon('x', 'icon-sm')}Hủy ca</button>`);
    if (b.status === 'running') out.push(`<button class="btn btn-secondary btn-sm" data-act="metrics" data-id="${b.id}">${icon('chart', 'icon-sm')}Số liệu</button>`);
    if (b.status === 'exited') out.push(`<button class="btn btn-secondary btn-sm" data-act="restart" data-id="${b.id}">${icon('play', 'icon-sm')}Khởi động lại</button>`);
    if (['running', 'exited'].includes(b.status)) out.push(`<button class="btn btn-danger btn-sm" data-act="end" data-id="${b.id}">${icon('stop', 'icon-sm')}Kết thúc sớm</button>`);
    if (b.status !== 'scheduled' && b.status !== 'cancelled') out.push(`<button class="btn btn-ghost btn-sm" data-act="logs" data-id="${b.id}">${icon('file', 'icon-sm')}Log</button>`);
    return out.join('');
  };
  const row = (b) => `
    <div class="booking" data-booking="${b.id}">
      <div class="stack-sm">
        <div class="booking-time">${esc(fmtRange(b.start, b.end))}</div>
        <div class="booking-meta">${statusTag(b.status)}${gpuTag(b.use_gpu)}
          ${b.status === 'scheduled' ? `<span>${esc(relative(b.start, now))}</span>` : ''}
          ${b.status === 'completed' && b.use_gpu ? `<span class="num">${b.gpu_hours_used} giờ GPU</span>` : ''}</div>
        ${b.exit_reason === 'OOM' ? `<div class="alert alert-danger">${icon('alert')}<span>Container bị dừng vì vượt giới hạn RAM (OOM). Giảm batch size hoặc dữ liệu nạp vào bộ nhớ rồi khởi động lại.</span></div>` : ''}
        ${b.status === 'exited' && b.exit_reason !== 'OOM' ? `<div class="alert alert-warning">${icon('info')}<span>Container đã thoát trước giờ và không tự khởi động lại. Bạn có thể khởi động lại trong thời gian ca.</span></div>` : ''}
        ${b.status === 'failed' ? `<div class="alert alert-danger">${icon('alert')}<span>Ca không khởi chạy được. Xem log để biết lý do.</span></div>` : ''}
      </div>
      <div class="actions">${actions(b)}</div>
    </div>`;
  const section = (title, list, empty, id) => `
    <section class="card" aria-labelledby="${id}">
      <div class="card-head"><h2 id="${id}">${title} <span class="subtle num">(${list.length})</span></h2></div>
      ${list.length ? list.map(row).join('') : `<div class="empty">${icon('calendar')}<p>${empty}</p></div>`}
    </section>`;

  view.innerHTML = `<div class="stack">
    <div class="row-between"><p class="muted">Kết thúc sớm hoặc hủy ca để nhường tài nguyên cho người khác.</p>
      <a class="btn btn-primary" href="#/lich">${icon('plus')}Đặt ca mới</a></div>
    ${section('Đang chạy', live, 'Không có ca nào đang chạy.', 'h-live')}
    ${section('Sắp tới', upcoming, 'Chưa có ca nào sắp tới.', 'h-up')}
    ${section('Đã kết thúc', past.slice(0, 30), 'Chưa có lịch sử.', 'h-past')}
  </div>`;

  // Gán lại mỗi lần vẽ (không cộng dồn bộ xử lý)
  view.onclick = async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    const b = all.find((x) => String(x.id) === id);
    const act = btn.dataset.act;
    try {
      if (act === 'cancel') {
        if (!(await confirmDialog({ title: 'Hủy ca?', message: `Hủy ca <strong>${esc(fmtRange(b.start, b.end))}</strong>. Khung giờ sẽ được nhường cho người khác ngay.`, confirmText: 'Hủy ca', danger: true }))) return;
        await withBusy(btn, () => post(`/bookings/${id}/cancel`));
        toast('Đã hủy ca');
      } else if (act === 'end') {
        if (!(await confirmDialog({ title: 'Kết thúc sớm?', message: 'Container sẽ nhận tín hiệu dừng và có 120 giây để lưu dữ liệu. Dữ liệu trong <code>/workspace</code> được giữ nguyên.', confirmText: 'Kết thúc ca', danger: true }))) return;
        await withBusy(btn, () => post(`/bookings/${id}/end`));
        toast('Đang dừng ca');
      } else if (act === 'restart') {
        await withBusy(btn, () => post(`/bookings/${id}/restart`));
        toast('Container sẽ được khởi động lại trong vòng 1 phút');
      } else if (act === 'logs') {
        return showLogs(b);
      } else if (act === 'metrics') {
        return showMetrics(b);
      }
      await renderBookings(view);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
}

async function showLogs(b) {
  const { el } = openDialog({ title: `Log ca #${b.id}`, wide: true, body: '<pre class="log" aria-live="polite">Đang tải…</pre>' });
  const pre = el.querySelector('pre');
  try {
    const text = await api('GET', `/bookings/${b.id}/logs?tail=2000`);
    pre.textContent = text || '(trống)';
    pre.scrollTop = pre.scrollHeight;
  } catch (e) {
    pre.textContent = e.code === 'NOT_FOUND' ? 'Chưa có log (hoặc log đã quá 30 ngày và bị dọn).' : errorMessage(e);
  }
}

async function showMetrics(b) {
  const { el } = openDialog({
    title: `Số liệu ca #${b.id}`,
    body: '<div id="m" aria-live="polite" class="stack"><div class="skeleton" style="height:96px"></div></div>',
    foot: `<button class="btn btn-secondary" id="m-refresh">${icon('refresh', 'icon-sm')}Làm mới</button>`,
  });
  const box = el.querySelector('#m');
  const bar = (label, ic, value, pct, sub) => `<div class="stack-sm"><div class="row-between"><span class="stat-label">${icon(ic)}${label}</span><strong class="num">${value}</strong></div>
    ${pct == null ? '' : `<div class="meter ${pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : ''}"><span style="width:${Math.min(100, pct)}%"></span></div>`}${sub ? `<span class="subtle">${sub}</span>` : ''}</div>`;
  const load = async () => {
    try {
      const m = await get(`/bookings/${b.id}/metrics`);
      box.innerHTML = [
        bar('CPU', 'cpu', `${m.cpu_percent.toFixed(0)}%`, null, '100% = 1 luồng CPU'),
        bar('RAM', 'box', `${fmtGiB(m.mem_bytes)} / ${fmtGiB(m.mem_limit_bytes)} GiB`, (m.mem_bytes / m.mem_limit_bytes) * 100, 'Vượt giới hạn sẽ bị dừng (OOM)'),
        m.gpu ? bar('GPU', 'gpu', `${m.gpu.util_percent}% · ${fmtGiB(m.gpu.mem_used_bytes)}/${fmtGiB(m.gpu.mem_total_bytes)} GiB VRAM`, m.gpu.util_percent, null) : '',
        `<p class="subtle">Đo lúc ${esc(fmtTime(m.sampled_at))}</p>`,
      ].join('');
    } catch (e) {
      box.innerHTML = `<div class="alert alert-warning">${icon('info')}<span>${esc(errorMessage(e))}</span></div>`;
    }
  };
  el.querySelector('#m-refresh').onclick = (ev) => withBusy(ev.currentTarget, load);
  await load();
}
