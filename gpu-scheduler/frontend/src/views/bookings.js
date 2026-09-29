// Ca của tôi — REQ-UI-06, UI-11, UI-13, REQ-MN-01, MN-02, MN-04 (docs/giao-dien.md mục 2)
import { get, post, api } from '../api.js';
import { esc, icon, toast, statusTag, confirmDialog, openDialog, withBusy, errorMessage, fmtGiB } from '../ui.js';
import { dateKey, addDays, fmtTime, fmtDate } from '../time.js';
import { connectGuideHtml } from './connect-guide.js';

const LIVE = ['starting', 'running', 'exited', 'stopping'];
const SAMPLE_MS = 5000;
const MAX_SAMPLES = 60; // 5 phút gần nhất

export async function renderBookings(view, ctx) {
  const all = await get('/bookings');
  const active = all.find((b) => LIVE.includes(b.status)) || null;
  const guide = await connectGuideHtml(ctx.state);
  const rows = [...all].sort((a, b) => new Date(b.start) - new Date(a.start));

  view.innerHTML = `<div class="stack">
    ${active ? activePanel(active, guide.html) : `
      <section class="card card-pad stack" data-testid="connect-guide" aria-labelledby="h-guide">
        <div class="row-between"><div class="row">${icon('terminal')}<h2 id="h-guide">Hướng dẫn kết nối</h2></div>
          <span class="subtle">Hiện không có ca nào đang chạy</span></div>
        ${guide.html}
      </section>`}
    <section class="card" aria-labelledby="h-list">
      <div class="card-head"><h2 id="h-list">Danh sách ca <span class="subtle num">(${all.length})</span></h2>
        <a class="btn btn-primary btn-sm" href="#/">${icon('plus', 'icon-sm')}Đặt ca mới</a></div>
      ${rows.length ? `<div class="table-wrap"><table class="bookings-table">
        <thead><tr><th>Mã ca</th><th>Ngày</th><th>Thời gian</th><th>GPU</th><th>Trạng thái</th><th><span class="sr-only">Thao tác</span></th></tr></thead>
        <tbody>${rows.map(row).join('')}</tbody></table></div>`
    : `<div class="empty">${icon('calendar')}<p>Bạn chưa đặt ca nào.</p></div>`}
    </section>
  </div>`;
  guide.bind(view);
  if (active) setupActive(view, active);

  // Gán lại mỗi lần vẽ (không cộng dồn bộ xử lý)
  view.onclick = async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const b = all.find((x) => String(x.id) === btn.dataset.id);
    const act = btn.dataset.act;
    try {
      if (act === 'cancel') {
        if (!(await confirmDialog({ title: `Hủy ca #${b.id}?`, message: `Hủy ca <strong>${esc(dayLabel(b.start))} ${esc(timeRange(b))}</strong>. Khung giờ sẽ được nhường cho người khác ngay.`, confirmText: 'Hủy ca', danger: true }))) return;
        await withBusy(btn, () => post(`/bookings/${b.id}/cancel`));
        toast('Đã hủy ca');
      } else if (act === 'end') {
        if (!(await confirmDialog({ title: 'Kết thúc sớm?', message: 'Container sẽ nhận tín hiệu dừng và có 120 giây để lưu dữ liệu. Dữ liệu trong <code>/workspace</code> được giữ nguyên.', confirmText: 'Kết thúc ca', danger: true }))) return;
        await withBusy(btn, () => post(`/bookings/${b.id}/end`));
        toast('Đang dừng ca');
      } else if (act === 'restart') {
        await withBusy(btn, () => post(`/bookings/${b.id}/restart`));
        toast('Container sẽ được khởi động lại trong vòng 1 phút');
      } else if (act === 'logs') {
        return showLogs(b);
      } else if (act === 'reason') {
        return showReason(b);
      }
      await renderBookings(view, ctx);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
}

// ---- Bảng ca ----
function dayLabel(iso) {
  const k = dateKey(iso);
  const today = dateKey(new Date());
  if (k === today) return 'Hôm nay';
  if (k === addDays(today, -1)) return 'Hôm qua';
  if (k === addDays(today, 1)) return 'Ngày mai';
  return fmtDate(iso);
}
function timeRange(b) {
  const end = fmtTime(b.end);
  const nextDay = dateKey(b.start) !== dateKey(new Date(new Date(b.end).getTime() - 1));
  return `${fmtTime(b.start)} – ${end === '00:00' ? '24:00' : end}${nextDay && end !== '00:00' ? ' (+1)' : ''}`;
}
function rowActions(b) {
  const out = [];
  if (b.status === 'scheduled') out.push(`<button class="btn btn-danger btn-sm" data-act="cancel" data-id="${b.id}">${icon('x', 'icon-sm')}Hủy ca</button>`);
  if (b.exit_reason === 'OOM' || b.status === 'failed') out.push(`<button class="btn btn-secondary btn-sm" data-act="reason" data-id="${b.id}">${icon('info', 'icon-sm')}Xem lý do</button>`);
  if (!['scheduled', 'cancelled'].includes(b.status)) out.push(`<button class="btn btn-ghost btn-sm" data-act="logs" data-id="${b.id}">${icon('file', 'icon-sm')}Xem log</button>`);
  return out.join('');
}
const row = (b) => `
  <tr data-booking="${b.id}">
    <td class="num"><strong>#${b.id}</strong></td>
    <td>${esc(dayLabel(b.start))}</td>
    <td class="num">${esc(timeRange(b))}</td>
    <td>${b.use_gpu ? `<span class="gpu-yes">${icon('gpu', 'icon-sm')}Có</span>` : '<span class="subtle">Không</span>'}</td>
    <td>${statusTag(b.status, b.exit_reason)}</td>
    <td><div class="actions">${rowActions(b)}</div></td>
  </tr>`;

// ---- Khối ca đang hoạt động (REQ-UI-13) ----
function remaining(endIso) {
  const mins = Math.max(0, Math.floor((new Date(endIso) - Date.now()) / 60000));
  return `Còn ${String(Math.floor(mins / 60)).padStart(2, '0')} giờ ${String(mins % 60).padStart(2, '0')} phút`;
}

function activePanel(b, guideHtml) {
  const buttons = [];
  if (b.status === 'exited') buttons.push(`<button class="btn btn-primary btn-sm" data-act="restart" data-id="${b.id}">${icon('play', 'icon-sm')}Khởi động lại</button>`);
  buttons.push(`<button class="btn btn-secondary btn-sm" data-act="open-log">${icon('file', 'icon-sm')}Mở nhật ký</button>`);
  if (['running', 'exited'].includes(b.status)) buttons.push(`<button class="btn btn-danger btn-sm" data-act="end" data-id="${b.id}">${icon('stop', 'icon-sm')}Kết thúc sớm</button>`);
  const note = b.status === 'exited'
    ? `<div class="alert alert-warning">${icon('info')}<span>${b.exit_reason === 'OOM' ? 'Container bị dừng vì vượt giới hạn RAM (OOM). Giảm batch size hoặc dữ liệu nạp vào bộ nhớ rồi khởi động lại.' : 'Container đã thoát trước giờ và không tự khởi động lại. Bạn có thể khởi động lại trong thời gian ca.'}</span></div>`
    : b.status === 'starting' ? `<div class="alert alert-info">${icon('clock')}<span>Máy đang được khởi động, thường mất dưới 1 phút.</span></div>` : '';
  return `
    <section class="card active-session" data-testid="active-session" aria-labelledby="h-active">
      <div class="active-head">
        <div class="stack-sm">
          <div class="row"><h2 id="h-active">Ca đang hoạt động <span class="num">#${b.id}</span></h2>${statusTag(b.status, b.exit_reason)}</div>
          <p class="muted num">Kết thúc lúc ${esc(fmtTime(b.end))} · <strong id="remaining">${esc(remaining(b.end))}</strong></p>
        </div>
        <div class="actions">${buttons.join('')}</div>
      </div>
      <div class="resources">
        <span class="res">${icon('gpu', 'icon-sm')}${b.use_gpu ? 'RTX 5090 (1 GPU)' : 'Không dùng GPU'}</span>
        <span class="res">${icon('box', 'icon-sm')}<span id="res-ram" class="num">—/28 GiB RAM</span></span>
        <span class="res">${icon('cpu', 'icon-sm')}<span id="res-cpu" class="num">— lõi CPU</span></span>
      </div>
      ${note}
      <div class="tabs" role="tablist" aria-label="Chi tiết ca">
        <button role="tab" id="t-mon" aria-controls="p-mon" aria-selected="true">Giám sát tài nguyên</button>
        <button role="tab" id="t-guide" aria-controls="p-guide" aria-selected="false" tabindex="-1">Hướng dẫn kết nối</button>
        <button role="tab" id="t-log" aria-controls="p-log" aria-selected="false" tabindex="-1">Nhật ký container</button>
      </div>
      <div class="tab-panels">
        <div role="tabpanel" id="p-mon" aria-labelledby="t-mon">
          <div class="chart-wrap">
            <div class="chart-legend"><span><i class="swatch l-cpu"></i>CPU</span><span><i class="swatch l-ram"></i>RAM</span>${b.use_gpu ? '<span><i class="swatch l-gpu"></i>GPU</span>' : ''}
              <span class="subtle" id="chart-note">Cập nhật mỗi 5 giây</span></div>
            <svg class="chart" data-testid="metrics-chart" data-samples="0" viewBox="0 0 600 180" role="img" aria-label="Biểu đồ CPU, RAM${b.use_gpu ? ', GPU' : ''} theo thời gian"></svg>
            <div class="chart-values" id="chart-values" aria-live="polite"></div>
          </div>
        </div>
        <div role="tabpanel" id="p-guide" aria-labelledby="t-guide" hidden>${guideHtml}</div>
        <div role="tabpanel" id="p-log" aria-labelledby="t-log" hidden>
          <div class="log-box" data-testid="container-log">
            <div class="row-between"><span class="subtle">Container <code>${esc(b.container_name || `vmu-bk-${b.id}`)}</code></span>
              <button class="btn btn-ghost btn-sm" id="log-refresh">${icon('refresh', 'icon-sm')}Làm mới</button></div>
            <pre class="log" id="log-text">Đang tải…</pre>
          </div>
        </div>
      </div>
    </section>`;
}

function setupActive(view, b) {
  const panel = view.querySelector('[data-testid="active-session"]');
  const tabs = [...panel.querySelectorAll('[role=tab]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panel.querySelector(`#${t.getAttribute('aria-controls')}`).hidden = !on;
    }
    if (tab.id === 't-log') loadLog();
  };
  tabs.forEach((t, i) => {
    t.onclick = () => select(t);
    t.onkeydown = (ev) => {
      const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus();
      select(next);
    };
  });
  panel.querySelector('[data-act="open-log"]').onclick = (ev) => { ev.stopPropagation(); select(panel.querySelector('#t-log')); };

  const logText = panel.querySelector('#log-text');
  async function loadLog() {
    try {
      const text = await api('GET', `/bookings/${b.id}/logs?tail=500`);
      logText.textContent = text || '(chưa có dòng log nào)';
      logText.scrollTop = logText.scrollHeight;
    } catch (e) {
      logText.textContent = e.code === 'NOT_FOUND' ? '(chưa có dòng log nào)' : errorMessage(e);
    }
  }
  panel.querySelector('#log-refresh').onclick = (ev) => { ev.stopPropagation(); loadLog(); };

  // Biểu đồ: mỗi 5 giây một mẫu, dừng khi rời trang
  const chart = panel.querySelector('[data-testid="metrics-chart"]');
  const samples = [];
  const draw = () => {
    // viewBox theo kích thước thật để nét và điểm không bị kéo giãn
    const W = Math.max(200, Math.round(chart.clientWidth || 600));
    const H = 180;
    chart.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const x = (i) => 4 + (i / (MAX_SAMPLES - 1)) * (W - 8);
    const y = (pct) => H - (Math.min(100, Math.max(0, pct)) / 100) * (H - 8) - 4;
    const line = (key, cls) => {
      const pts = samples.map((s, i) => (s[key] == null ? null : `${x(MAX_SAMPLES - samples.length + i).toFixed(1)},${y(s[key]).toFixed(1)}`)).filter(Boolean);
      if (!pts.length) return '';
      return pts.length === 1
        ? `<circle class="${cls}" cx="${pts[0].split(',')[0]}" cy="${pts[0].split(',')[1]}" r="3"/>`
        : `<polyline class="${cls}" points="${pts.join(' ')}"/>`;
    };
    const grid = [25, 50, 75].map((p) => `<line class="grid" x1="0" x2="${W}" y1="${y(p)}" y2="${y(p)}"/>`).join('');
    chart.innerHTML = `${grid}${line('cpu', 'l-cpu')}${line('ram', 'l-ram')}${line('gpu', 'l-gpu')}`;
    chart.dataset.samples = String(samples.length);
  };
  const values = panel.querySelector('#chart-values');
  async function sample() {
    if (!panel.isConnected) { clearInterval(timer); return; }
    panel.querySelector('#remaining').textContent = remaining(b.end);
    if (b.status !== 'running') {
      panel.querySelector('#chart-note').textContent = 'Chỉ có số liệu khi container đang chạy';
      return;
    }
    try {
      const m = await get(`/bookings/${b.id}/metrics`);
      if (!panel.isConnected) return;
      const cpuPct = m.cpus ? m.cpu_percent / m.cpus : m.cpu_percent;
      const ramPct = (m.mem_bytes / m.mem_limit_bytes) * 100;
      samples.push({ cpu: cpuPct, ram: ramPct, gpu: m.gpu ? m.gpu.util_percent : null });
      if (samples.length > MAX_SAMPLES) samples.shift();
      draw();
      panel.querySelector('#res-ram').textContent = `${fmtGiB(m.mem_bytes)}/${fmtGiB(m.mem_limit_bytes)} GiB RAM`;
      if (m.cpus) panel.querySelector('#res-cpu').textContent = `${m.cpus} lõi CPU`;
      values.innerHTML = `
        <span><strong class="num">${cpuPct.toFixed(0)}%</strong> CPU</span>
        <span><strong class="num">${fmtGiB(m.mem_bytes)} GiB</strong> RAM</span>
        ${m.gpu ? `<span><strong class="num">${m.gpu.util_percent}%</strong> GPU · ${fmtGiB(m.gpu.mem_used_bytes)}/${fmtGiB(m.gpu.mem_total_bytes)} GiB VRAM</span>` : ''}`;
    } catch (e) {
      panel.querySelector('#chart-note').textContent = errorMessage(e);
    }
  }
  const timer = setInterval(sample, SAMPLE_MS);
  sample();
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

function showReason(b) {
  const oom = b.exit_reason === 'OOM';
  const { el, close } = openDialog({
    title: `Lý do dừng ca #${b.id}`,
    body: oom
      ? `<div class="stack"><div class="alert alert-danger">${icon('alert')}<span><strong>Hết RAM (OOM).</strong> Chương trình dùng vượt giới hạn 28 GiB RAM của phiên nên bị hệ thống dừng.</span></div>
         <ul class="compact"><li>Giảm batch size hoặc số worker của DataLoader.</li><li>Đọc dữ liệu theo từng phần thay vì nạp hết vào RAM.</li><li>Lưu checkpoint thường xuyên để chạy tiếp được.</li></ul></div>`
      : `<div class="alert alert-danger">${icon('alert')}<span>Ca không khởi chạy được. Xem log để biết chi tiết, hoặc báo quản trị viên.</span></div>`,
    foot: '<button class="btn btn-secondary" id="to-log">Xem log</button><button class="btn btn-primary" data-close>Đóng</button>',
  });
  el.querySelector('#to-log').onclick = () => { close(); showLogs(b); };
}
