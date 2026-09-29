// Lịch đặt ca + hộp thoại "Đặt ca mới" — REQ-UI-01, UI-02, UI-03, UI-10, UI-12, UI-14 (docs/giao-dien.md mục 1)
import { get, post } from '../api.js';
import { esc, icon, toast, withBusy, errorMessage, openDialog, statusLabel } from '../ui.js';
import { TZ_LABEL, dateKey, addDays, vnInstant, toApiIso, fmtDate, fmtDateFull, fmtTime, weekdayShort, fmtRange, vnParts } from '../time.js';

const HOUR = 3600 * 1000;
const WEEKS_BACK = 4; // REQ-BK-14: xem lại tối đa 28 ngày
const pad = (h) => String(h).padStart(2, '0');
const NARROW = window.matchMedia('(max-width: 760px)');

export async function renderCalendar(view, { state, refreshMe }) {
  const cfg = state.config || {};
  const horizonDays = cfg.booking_horizon_days || 7;
  const days = horizonDays + 1; // hôm nay + 7 ngày
  const max = cfg.max_concurrent_sessions || 2;
  const today = dateKey(new Date());
  const bookableDays = Array.from({ length: days }, (_, i) => addDays(today, i));
  let week = 0; // 0 = tuần hiện tại, -1..-4 = các tuần trước
  let dayKeys = bookableDays;
  let dayIndex = 0; // màn hình hẹp: xem từng ngày
  let bookings = [];

  view.innerHTML = `
    <section class="card cal-card" aria-label="Lịch sử dụng máy">
      <div class="cal-toolbar">
        <div class="week-nav" role="group" aria-label="Chọn tuần">
          <div class="seg">
            <button class="seg-btn" id="prev-week" aria-label="Tuần trước">${icon('chevron-left', 'icon-sm')}</button>
            <button class="seg-btn seg-today" id="today-btn">Hôm nay</button>
            <button class="seg-btn" id="next-week" aria-label="Tuần sau">${icon('chevron-right', 'icon-sm')}</button>
          </div>
          <strong class="num week-range" id="week-range" data-testid="week-range" aria-live="polite"></strong>
        </div>
        <div class="day-nav" id="daynav" hidden>
          <button class="seg-btn" id="prev-day" aria-label="Ngày trước">${icon('chevron-left', 'icon-sm')}</button>
          <strong id="day-label" class="num"></strong>
          <button class="seg-btn" id="next-day" aria-label="Ngày sau">${icon('chevron-right', 'icon-sm')}</button>
        </div>
        <div class="cal-actions">
          <span class="quota-badge" id="gpu-quota" data-testid="gpu-quota"></span>
          <button class="btn btn-primary" id="book-btn">${icon('plus')}Đặt ca mới</button>
        </div>
      </div>
      <div class="cal-scroll" id="cal-scroll"><div class="cal" id="cal"></div></div>
      <div class="cal-foot">
        <div class="cal-legend" data-testid="cal-legend">
          <span><i class="swatch mine"></i>Ca của bạn</span>
          <span><i class="swatch other-gpu"></i>Ca GPU người khác</span>
          <span><i class="swatch other-cpu"></i>Ca CPU người khác</span>
          <span><i class="swatch past"></i>Đã qua</span>
        </div>
        <p class="subtle">Giờ Việt Nam (${TZ_LABEL}) · tối đa ${max} phiên cùng lúc, 1 phiên GPU · bấm ô trống để đặt nhanh</p>
      </div>
    </section>`;

  const $ = (id) => view.querySelector(`#${id}`);

  function renderQuota() {
    const q = state.me?.gpu_quota;
    const badge = $('gpu-quota');
    if (!q) { badge.hidden = true; return; }
    const used = Math.round(q.used_hours * 10) / 10;
    badge.textContent = `Hạn mức GPU: ${used}/${q.limit_hours} giờ`;
    badge.classList.toggle('warn', q.used_hours > q.limit_hours - 2);
    badge.title = 'Số giờ GPU đã dùng và đã đặt trong tuần này (từ Thứ Hai)';
  }

  async function load() {
    dayKeys = Array.from({ length: days }, (_, i) => addDays(today, week * 7 + i));
    bookings = (await get(`/calendar?from=${dayKeys[0]}&to=${addDays(dayKeys[0], days)}`))
      .map((b) => ({ ...b, s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }));
    draw();
  }

  // Các ca còn chiếm chỗ (đang hiệu lực) tại giờ bắt đầu t
  const liveAt = (t) => bookings.filter((b) => b.status !== 'completed' && b.s < t + HOUR && t < b.e);

  // Khối của một ngày: cắt theo ngày, xếp làn (tối đa 2), rộng hết cột nếu không chồng ai
  function blocksOfDay(key) {
    const d0 = vnInstant(key).getTime();
    const d1 = d0 + 24 * HOUR;
    const parts = bookings
      .filter((b) => b.s < d1 && d0 < b.e)
      .map((b) => ({ b, s: Math.max(b.s, d0), e: Math.min(b.e, d1) }))
      .sort((x, y) => x.s - y.s || x.b.id - y.b.id);
    const laneEnd = [];
    for (const p of parts) {
      let lane = laneEnd.findIndex((end) => end <= p.s);
      if (lane < 0) lane = laneEnd.length;
      laneEnd[lane] = p.e;
      p.lane = lane;
    }
    for (const p of parts) p.alone = !parts.some((q) => q !== p && q.s < p.e && p.s < q.e);
    return { d0, parts };
  }

  const endLabel = (ms) => { const t = fmtTime(new Date(ms).toISOString()); return t === '00:00' ? '24:00' : t; };

  function draw() {
    const now = Date.now();
    const horizon = now + horizonDays * 24 * HOUR;
    const narrow = NARROW.matches;
    dayIndex = Math.min(dayIndex, dayKeys.length - 1);
    const shown = narrow ? [dayKeys[dayIndex]] : dayKeys;

    $('week-range').textContent = `${fmtDate(vnInstant(dayKeys[0]))} – ${fmtDateFull(vnInstant(dayKeys[dayKeys.length - 1]))}`;
    $('prev-week').disabled = week <= -WEEKS_BACK;
    $('next-week').disabled = week >= 0;
    $('today-btn').disabled = week === 0 && (!narrow || dayIndex === 0);
    $('daynav').hidden = !narrow;
    if (narrow) {
      const d = vnInstant(dayKeys[dayIndex]);
      $('day-label').textContent = `${weekdayShort(d)} ${fmtDate(d)}${dayKeys[dayIndex] === today ? ' · hôm nay' : ''}`;
      $('prev-day').disabled = dayIndex === 0;
      $('next-day').disabled = dayIndex === dayKeys.length - 1;
    }

    const head = `<div class="cal-corner"><span>${TZ_LABEL}</span></div>${shown.map((k) => {
      const d = vnInstant(k);
      const wd = weekdayShort(d);
      const [dd, mm] = fmtDate(d).split('/');
      const cls = [k === today && 'today', k < today && 'past', (wd === 'T7' || wd === 'CN') && 'weekend'].filter(Boolean).join(' ');
      return `<div class="cal-head ${cls}"><span class="wd">${wd}</span><span class="dn num">${dd}<small>/${mm}</small></span></div>`;
    }).join('')}`;
    const nowPct = shown.includes(today) ? ((now - vnInstant(today).getTime()) / HOUR / 24) * 100 : null;
    const hours = Array.from({ length: 24 }, (_, h) => `<div class="cal-hour num"><span>${h ? `${pad(h)}:00` : ''}</span></div>`).join('')
      + (nowPct !== null && nowPct < 100 ? `<div class="cal-now-label num" style="top:${nowPct}%" aria-hidden="true">${fmtTime(new Date(now).toISOString())}</div>` : '');
    const cols = shown.map((k) => {
      const { d0, parts } = blocksOfDay(k);
      const cells = Array.from({ length: 24 }, (_, h) => {
        const t = d0 + h * HOUR;
        const past = t < now; // giờ đang diễn ra cũng không đặt được (Q9)
        const out = past || t > horizon;
        const full = liveAt(t).length >= max;
        const d = vnInstant(k);
        const label = `${weekdayShort(d)} ${fmtDate(d)} ${pad(h)}:00, ${past ? 'đã qua' : full ? 'đã đủ phiên' : out ? 'ngoài thời gian được đặt' : 'còn trống, bấm để đặt ca'}`;
        return `<button type="button" class="cal-cell ${past ? 'past' : ''}" data-day="${k}" data-hour="${h}" data-time="${pad(h)}:00"
          ${out || full ? 'disabled' : ''} aria-label="${esc(label)}"></button>`;
      }).join('');
      const blocks = parts.map((p) => {
        const top = (((p.s - d0) / HOUR) * 100) / 24;
        const height = (((p.e - p.s) / HOUR) * 100) / 24;
        const pos = p.alone ? 'left:6px;right:8px' : p.lane === 0 ? 'left:6px;right:calc(50% + 2px)' : 'left:calc(50% + 2px);right:8px';
        const range = `${fmtTime(new Date(p.s).toISOString())} – ${endLabel(p.e)}`;
        const kind = p.b.mine ? 'mine' : p.b.use_gpu ? 'other-gpu' : 'other-cpu';
        const title = `${p.b.username} · Trạng thái: ${statusLabel(p.b.status)} | Loại: ${p.b.use_gpu ? 'Có GPU' : 'Không GPU'}`;
        return `<div class="cal-block ${kind} ${p.b.e <= now ? 'done' : ''} ${(p.e - p.s) <= HOUR ? 'short' : ''}"
          style="top:calc(${top}% + 4px);height:calc(${height}% - 8px);${pos}" data-booking="${p.b.id}" data-day="${k}"
          role="button" tabindex="0" title="${esc(title)}" aria-label="${esc(`${title}, ${range}`)}">
          <span class="who"><span class="name">${esc(p.b.username)}</span></span>
          <span class="when num">${esc(range)}</span>
          <span class="type ${p.b.use_gpu ? 'gpu' : ''}">${p.b.use_gpu ? `${icon('gpu', 'icon-xs')}GPU RTX 5090` : `${icon('cpu', 'icon-xs')}Chỉ CPU`}</span></div>`;
      }).join('');
      const nowLine = k === today && now >= d0 && now < d0 + 24 * HOUR
        ? `<div class="cal-now" style="top:${(((now - d0) / HOUR) * 100) / 24}%" aria-hidden="true"></div>` : '';
      return `<div class="cal-col ${k === today ? 'today' : ''}" data-day="${k}">${cells}${blocks}${nowLine}</div>`;
    }).join('');

    const cal = $('cal');
    cal.style.gridTemplateColumns = `56px repeat(${shown.length}, minmax(0, 1fr))`;
    cal.innerHTML = `${head}<div class="cal-hours">${hours}</div>${cols}`;
  }

  function scrollToNow() {
    const h = Math.max(0, vnParts(new Date()).h - 1);
    const cell = view.querySelector(`.cal-cell[data-hour="${h}"]`);
    const header = view.querySelector('.cal-head');
    const box = $('cal-scroll');
    // offsetTop của ô tính theo cột (position: relative), nên đo theo vị trí thực trên màn hình
    if (cell && header) box.scrollTop += cell.getBoundingClientRect().top - box.getBoundingClientRect().top - header.offsetHeight;
  }

  const goWeek = async (delta) => {
    week = Math.max(-WEEKS_BACK, Math.min(0, week + delta));
    dayIndex = 0;
    await load();
  };
  $('prev-week').onclick = () => goWeek(-1);
  $('next-week').onclick = () => goWeek(1);
  $('today-btn').onclick = async () => { week = 0; dayIndex = 0; await load(); scrollToNow(); };
  $('cal').addEventListener('click', (ev) => {
    const block = ev.target.closest('.cal-block');
    if (block) {
      // Giờ được bấm trong khối (khối có thể dài nhiều giờ)
      const col = block.closest('.cal-col').getBoundingClientRect();
      const hour = Math.min(23, Math.max(0, Math.floor(((ev.clientY - col.top) / col.height) * 24)));
      return showBookingInfo(Number(block.dataset.booking), block.dataset.day, ev.detail === 0 ? null : hour);
    }
    const c = ev.target.closest('.cal-cell');
    if (c && !c.disabled) openBookingDialog({ date: c.dataset.day, from: Number(c.dataset.hour) });
  });
  $('cal').addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList.contains('cal-block')) { ev.preventDefault(); ev.target.click(); }
  });

  // Bấm vào một ca: xem ai đang dùng; nếu giờ đó còn chỗ thì đặt ca luôn
  function showBookingInfo(id, dayKey, hour) {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    const cell = hour === null ? null : view.querySelector(`.cal-cell[data-day="${dayKey}"][data-hour="${hour}"]`);
    const canBook = cell && !cell.disabled;
    const { el, close } = openDialog({
      title: b.mine ? 'Ca của bạn' : `Ca của ${b.username}`,
      body: `<dl class="info-list">
          <div><dt>Người dùng</dt><dd><strong>${esc(b.username)}</strong>${b.mine ? ' (bạn)' : ''}</dd></div>
          <div><dt>Thời gian</dt><dd class="num">${esc(fmtRange(b.start, b.end))}</dd></div>
          <div><dt>Loại</dt><dd>${b.use_gpu ? 'Có GPU (RTX 5090)' : 'Không GPU'}</dd></div>
          <div><dt>Trạng thái</dt><dd>${esc(statusLabel(b.status))}</dd></div>
        </dl>
        ${canBook ? `<p class="subtle">Lúc ${pad(hour)}:00 máy vẫn còn chỗ${b.use_gpu ? ' (không dùng GPU được vì ca này đã dùng GPU)' : ''}.</p>` : ''}`,
      foot: `${b.mine ? '<a class="btn btn-secondary" href="#/ca">Xem trong Ca của tôi</a>' : '<button class="btn btn-secondary" data-close>Đóng</button>'}
        ${canBook ? `<button class="btn btn-primary" id="book-here">${icon('plus', 'icon-sm')}Đặt ca lúc ${pad(hour)}:00</button>` : ''}`,
    });
    el.querySelector('a[href="#/ca"]')?.addEventListener('click', close);
    el.querySelector('#book-here')?.addEventListener('click', () => { close(); openBookingDialog({ date: dayKey, from: hour }); });
  }
  $('book-btn').onclick = () => {
    const d = NARROW.matches ? dayKeys[dayIndex] : today;
    openBookingDialog({ date: bookableDays.includes(d) ? d : today });
  };
  $('prev-day').onclick = () => { dayIndex = Math.max(0, dayIndex - 1); draw(); };
  $('next-day').onclick = () => { dayIndex = Math.min(dayKeys.length - 1, dayIndex + 1); draw(); };
  NARROW.onchange = () => { if (view.querySelector('#cal')) draw(); };

  // ---- Hộp thoại "Đặt ca mới" ----
  const CHECK_TEXT = {
    TIME: 'Khung giờ hợp lệ',
    USER_OVERLAP: 'Không trùng ca khác của bạn',
    CAPACITY: 'Còn chỗ trên máy',
    GPU_QUOTA: 'Trong hạn mức 10 giờ GPU/tuần',
  };

  function openBookingDialog({ date = today, from = null }) {
    const maxHours = cfg.slot_max_hours || 8;
    const sel = { date, from, to: null };
    const { el, close } = openDialog({
      title: 'Đặt ca mới',
      body: `<form class="stack" id="book-form" novalidate>
        <div class="field"><label for="f-date">Ngày</label>
          <select class="select" id="f-date">${bookableDays.map((k) => {
    const d = vnInstant(k);
    return `<option value="${k}">${weekdayShort(d)} ${fmtDate(d)}${k === today ? ' (hôm nay)' : ''}</option>`;
  }).join('')}</select></div>
        <div class="field-row">
          <div class="field"><label for="f-from">Từ giờ</label><select class="select num" id="f-from"></select></div>
          <div class="field"><label for="f-to">Đến giờ</label><select class="select num" id="f-to"></select></div>
        </div>
        <label class="switch-row" for="f-gpu">
          <span class="switch-text"><strong>${icon('gpu', 'icon-sm')}Sử dụng GPU RTX 5090</strong>
            <span class="subtle">Tắt nếu chỉ chạy code, xử lý dữ liệu — không tính vào hạn mức</span></span>
          <input type="checkbox" role="switch" class="switch" id="f-gpu">
        </label>
        <div class="summary" id="summary" aria-live="polite"></div>
        <ul class="checks" id="checks" data-testid="checks" aria-live="polite" aria-label="Kiểm tra điều kiện"></ul>
        <div id="form-error" role="alert"></div>
      </form>`,
      foot: `<button class="btn btn-secondary" data-close type="button">Hủy bỏ</button>
             <button class="btn btn-primary" id="submit" type="submit" form="book-form" disabled>${icon('check')}Xác nhận đặt ca</button>`,
    });
    const q = (id) => el.querySelector(`#${id}`);
    const fDate = q('f-date');
    const fFrom = q('f-from');
    const fTo = q('f-to');
    const fGpu = q('f-gpu');
    const submitBtn = q('submit');
    fDate.value = sel.date;
    let seq = 0;
    let checkTimer = null;
    let busy = false;
    let lastOk = false;

    function fillFrom() {
      const now = Date.now();
      const horizon = now + horizonDays * 24 * HOUR;
      fFrom.innerHTML = Array.from({ length: 24 }, (_, h) => {
        const t = vnInstant(sel.date, h).getTime();
        return `<option value="${h}" ${t < now || t > horizon ? 'disabled' : ''}>${pad(h)}:00</option>`;
      }).join('');
      const first = [...fFrom.options].find((o) => !o.disabled);
      if (sel.from === null || fFrom.options[sel.from]?.disabled) sel.from = first ? Number(first.value) : null;
      if (sel.from !== null) fFrom.value = String(sel.from);
    }
    function fillTo() {
      if (sel.from === null) { fTo.innerHTML = ''; return; }
      fTo.innerHTML = Array.from({ length: maxHours }, (_, i) => {
        const end = sel.from + i + 1;
        return `<option value="${end}">${end <= 24 ? `${pad(end)}:00` : `${pad(end - 24)}:00 (+1 ngày)`}</option>`;
      }).join('');
      if (sel.to === null || sel.to <= sel.from || sel.to > sel.from + maxHours) sel.to = sel.from + Math.min(2, maxHours);
      fTo.value = String(sel.to);
    }
    const body = () => ({ start: toApiIso(sel.date, sel.from), end: toApiIso(sel.date, sel.to), use_gpu: fGpu.checked });

    function renderChecks(result) {
      const list = q('checks');
      if (!result) {
        list.innerHTML = Object.entries(CHECK_TEXT).map(([rule, text]) => `<li data-rule="${rule}" data-ok="pending"><span class="dot"></span>${text}</li>`).join('');
        return;
      }
      list.innerHTML = result.checks.map((c) => {
        const text = c.ok === false
          ? errorMessage({ code: c.code, details: { reason: c.reason } })
          : c.ok === null ? `${CHECK_TEXT[c.rule]} — chưa kiểm được` : CHECK_TEXT[c.rule];
        const ic = c.ok === true ? icon('check', 'icon-sm') : c.ok === false ? icon('x', 'icon-sm') : '<span class="dot"></span>';
        return `<li data-rule="${c.rule}" data-ok="${c.ok === null ? 'unknown' : c.ok}">${ic}<span>${esc(text)}</span></li>`;
      }).join('');
    }
    const updateSubmit = () => { submitBtn.disabled = busy || !lastOk; };

    async function runCheck() {
      const my = ++seq;
      try {
        const result = await post('/bookings/check', body());
        if (my !== seq || !el.isConnected) return;
        lastOk = result.ok;
        renderChecks(result);
      } catch (e) {
        if (my !== seq) return;
        lastOk = false;
        q('checks').innerHTML = `<li data-ok="false">${icon('x', 'icon-sm')}<span>${esc(errorMessage(e))}</span></li>`;
      }
      updateSubmit();
    }

    function changed({ clearError = true } = {}) {
      if (clearError) q('form-error').innerHTML = '';
      seq++; // bỏ kết quả kiểm tra cũ đang chờ
      lastOk = false;
      updateSubmit();
      if (sel.from === null) {
        q('summary').textContent = 'Ngày này không còn giờ để đặt. Hãy chọn ngày khác.';
        q('checks').innerHTML = '';
        return;
      }
      const { start, end } = body();
      q('summary').innerHTML = `<strong>${esc(fmtRange(start, end))}</strong>, ${sel.to - sel.from} giờ · ${fGpu.checked ? 'có GPU' : 'không dùng GPU'}`;
      renderChecks(null);
      clearTimeout(checkTimer);
      checkTimer = setTimeout(runCheck, 150);
    }

    fDate.onchange = () => { sel.date = fDate.value; sel.from = null; sel.to = null; fillFrom(); fillTo(); changed(); };
    fFrom.onchange = () => { sel.from = Number(fFrom.value); fillTo(); changed(); };
    fTo.onchange = () => { sel.to = Number(fTo.value); changed(); };
    fGpu.onchange = () => changed();

    q('book-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (submitBtn.disabled || sel.from === null) return;
      q('form-error').innerHTML = '';
      busy = true;
      try {
        await withBusy(submitBtn, async () => {
          try {
            const b = await post('/bookings', body());
            toast(`Đã đặt ca ${fmtRange(b.start, b.end)}`);
            close();
            await Promise.all([load(), refreshMe().then(renderQuota)]);
          } catch (e) {
            // Người khác vừa đặt mất: báo lỗi của server và kiểm tra lại
            q('form-error').innerHTML = `<div class="alert alert-danger" data-code="${esc(e.code)}">${icon('alert')}<span>${esc(errorMessage(e))}</span></div>`;
            lastOk = false;
            runCheck();
          }
        });
      } finally {
        busy = false;
        updateSubmit();
      }
    });

    fillFrom(); fillTo(); changed();
    fFrom.focus();
  }

  renderQuota();
  await load();
  scrollToNow();
}
