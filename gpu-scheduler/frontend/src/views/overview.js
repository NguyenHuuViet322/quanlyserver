// Tổng quan — REQ-UI-04, REQ-UI-05
import { get } from '../api.js';
import { esc, icon, statusTag, gpuTag, fmtGiB, copyText } from '../ui.js';
import { fmtRange, fmtDateTime, relative, TZ_LABEL } from '../time.js';
import { notificationItems } from '../app.js';

export async function renderOverview(view, { state, refreshMe }) {
  const [me, bookings, notes] = await Promise.all([refreshMe(), get('/bookings'), get('/notifications?limit=5')]);
  const host = state.config?.ssh_host || 'máy chủ';
  const q = me.gpu_quota;
  const s = me.storage;
  const qPct = q ? Math.min(100, (q.used_hours / q.limit_hours) * 100) : 0;
  const sUsed = s.used_bytes ?? 0;
  const sPct = Math.min(100, (sUsed / s.hard_bytes) * 100);
  const overSoft = Boolean(s.over_soft_since);

  const now = new Date();
  const live = bookings.filter((b) => ['starting', 'running', 'exited', 'stopping'].includes(b.status));
  const upcoming = bookings.filter((b) => b.status === 'scheduled' && new Date(b.start) > now).slice(0, 3);

  view.innerHTML = `
    <div class="stack" style="--gap:24px">
      <div class="row-between">
        <div><h2 style="font-size:var(--fs-xl)">Xin chào, ${esc(me.name)}</h2>
          <p class="muted">Tài khoản SSH <strong class="num">${esc(me.username)}</strong> · dải cổng <strong class="num">${me.ports.from}–${me.ports.to}</strong></p></div>
        <a class="btn btn-primary" href="#/lich">${icon('plus')}Đặt ca mới</a>
      </div>

      <div class="grid grid-3">
        <section class="card stat" aria-labelledby="st-gpu" data-testid="gpu-quota">
          <span class="stat-label" id="st-gpu">${icon('gpu')}Giờ GPU còn lại tuần này</span>
          <span class="stat-value num">${q.remaining_hours}<small> / ${q.limit_hours} giờ</small></span>
          <div class="meter ${qPct >= 100 ? 'danger' : qPct >= 80 ? 'warn' : ''}" role="img" aria-label="Đã dùng ${q.used_hours} trên ${q.limit_hours} giờ"><span style="width:${qPct}%"></span></div>
          <span class="subtle">Đã dùng/đặt ${q.used_hours} giờ · tuần tính từ Thứ Hai 00:00</span>
        </section>

        <section class="card stat" aria-labelledby="st-disk" data-testid="storage">
          <span class="stat-label" id="st-disk">${icon('disk')}Dung lượng /workspace</span>
          <span class="stat-value num">${fmtGiB(s.used_bytes)}<small> / ${fmtGiB(s.hard_bytes)} GiB</small></span>
          <div class="meter ${overSoft ? 'danger' : sUsed > s.soft_bytes * 0.9 ? 'warn' : ''}" role="img" aria-label="Đã dùng ${fmtGiB(s.used_bytes)} trên ${fmtGiB(s.hard_bytes)} GiB"><span style="width:${sPct}%"></span></div>
          <span class="subtle">${s.checked_at ? `Cảnh báo ở ${fmtGiB(s.soft_bytes)} GiB · cập nhật ${esc(relative(s.checked_at))}` : 'Chưa có số liệu, cập nhật mỗi 5 phút'}</span>
        </section>

        <section class="card stat" aria-labelledby="st-port" data-testid="ports">
          <span class="stat-label" id="st-port">${icon('plug')}Dải cổng của bạn</span>
          <span class="stat-value num" style="font-size:var(--fs-xl)">${me.ports.from}–${me.ports.to}</span>
          <span class="subtle">Mở Jupyter/TensorBoard qua SSH tunnel, xem hướng dẫn bên dưới</span>
        </section>
      </div>

      ${overSoft ? `<div class="alert alert-danger" role="alert">${icon('alert')}<span>Thư mục của bạn đã vượt ${fmtGiB(s.soft_bytes)} GiB. Hãy dọn dẹp trước <strong class="num">${esc(fmtDateTime(s.grace_deadline))} (${TZ_LABEL})</strong>, sau thời điểm đó sẽ không ghi thêm được.</span></div>` : ''}

      <div class="grid grid-2">
        <section class="card" aria-labelledby="h-sessions">
          <div class="card-head"><h2 id="h-sessions">Ca đang chạy & sắp tới</h2><a class="btn btn-ghost btn-sm" href="#/ca">Xem tất cả</a></div>
          ${live.length + upcoming.length === 0
    ? `<div class="empty">${icon('calendar')}<p>Bạn chưa có ca nào sắp tới.</p><a class="btn btn-secondary" href="#/lich">Xem lịch trống</a></div>`
    : [...live, ...upcoming].map((b) => `
            <div class="booking"><div class="stack-sm">
              <div class="booking-time">${esc(fmtRange(b.start, b.end))}</div>
              <div class="booking-meta">${statusTag(b.status)}${gpuTag(b.use_gpu)}<span>${esc(b.image)}</span></div></div>
              <div class="subtle" style="align-self:center">${b.status === 'scheduled' ? esc(relative(b.start)) : ''}</div></div>`).join('')}
        </section>

        <section class="card" aria-labelledby="h-notes">
          <div class="card-head"><h2 id="h-notes">Thông báo gần đây</h2></div>
          ${notificationItems(notes.items)}
        </section>
      </div>

      <section class="card card-pad stack" aria-labelledby="h-ssh">
        <div class="row">${icon('terminal')}<h2 id="h-ssh">Kết nối vào máy</h2></div>
        <div class="grid grid-2">
          <div class="stack-sm"><p class="subtle">Khi đang có ca: SSH tự đưa bạn vào container của mình, tại <code>/workspace</code></p>
            <div class="codebox"><code id="ssh-cmd">ssh ${esc(me.username)}@${esc(host)}</code><button class="btn btn-ghost btn-sm" data-copy="ssh-cmd" aria-label="Sao chép lệnh SSH">${icon('copy', 'icon-sm')}</button></div></div>
          <div class="stack-sm"><p class="subtle">Mở cổng ${me.ports.from + 1} (vd Jupyter) trên máy của bạn</p>
            <div class="codebox"><code id="tunnel-cmd">ssh -L ${me.ports.from + 1}:localhost:${me.ports.from + 1} ${esc(me.username)}@${esc(host)}</code><button class="btn btn-ghost btn-sm" data-copy="tunnel-cmd" aria-label="Sao chép lệnh tunnel">${icon('copy', 'icon-sm')}</button></div></div>
        </div>
        <p class="subtle">Chép file (<code>sftp</code>, <code>scp</code>, <code>rsync</code>) dùng được cả khi không có ca. Máy chủ <strong>không sao lưu</strong> dữ liệu, hãy tự sao lưu kết quả quan trọng.</p>
      </section>
    </div>`;

  view.querySelectorAll('[data-copy]').forEach((b) => {
    b.onclick = () => copyText(document.getElementById(b.dataset.copy).textContent);
  });
}
