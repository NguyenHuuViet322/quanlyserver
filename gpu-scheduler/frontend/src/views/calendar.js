// Lịch (trang chính) + hộp thoại đặt ca — REQ-UI-01, REQ-UI-02, REQ-UI-03, REQ-UI-10
import { get, post } from '../api.js';
import { esc, icon, toast, withBusy, errorMessage, openDialog } from '../ui.js';
import { TZ_LABEL, dateKey, addDays, vnInstant, toApiIso, fmtDate, fmtTime, weekdayShort, fmtRange, vnParts } from '../time.js';

const HOUR = 3600 * 1000;
const pad = (h) => String(h).padStart(2, '0');
const NARROW = window.matchMedia('(max-width: 760px)');

export async function renderCalendar(view, { state }) {
  const cfg = state.config || {};
  const days = (cfg.booking_horizon_days || 7) + 1; // hôm nay + 7 ngày
  const max = cfg.max_concurrent_sessions || 2;
  const today = dateKey(new Date());
  const dayKeys = Array.from({ length: days }, (_, i) => addDays(today, i));
  let bookings = [];
  let dayIndex = 0; // màn hình hẹp: xem từng ngày

  view.innerHTML = `
    <section class="card cal-card" aria-labelledby="h-cal">
      <div class="cal-toolbar">
        <div class="cal-title">
          <h2 id="h-cal">Lịch sử dụng máy</h2>
          <p class="subtle">Giờ Việt Nam (${TZ_LABEL}) · tối đa ${max} phiên cùng lúc, 1 phiên dùng GPU</p>
        </div>
        <div class="cal-legend" aria-hidden="true">
          <span><i class="swatch mine"></i>Ca của bạn</span>
          <span><i class="swatch other"></i>Người khác</span>
          <span><b class="gpu-chip">GPU</b>Có dùng GPU</span>
        </div>
        <div class="cal-nav" id="daynav" hidden>
          <button class="btn btn-ghost btn-icon" id="prev-day" aria-label="Ngày trước">${icon('chevron-left')}</button>
          <strong id="day-label" class="num"></strong>
          <button class="btn btn-ghost btn-icon" id="next-day" aria-label="Ngày sau">${icon('chevron-right')}</button>
        </div>
        <button class="btn btn-primary" id="book-btn">${icon('plus')}Đặt ca</button>
      </div>
      <div class="cal-scroll" id="cal-scroll"><div class="cal" id="cal"></div></div>
    </section>`;

  const $ = (id) => view.querySelector(`#${id}`);

  async function load() {
    bookings = (await get(`/calendar?from=${today}&to=${addDays(today, days)}`))
      .map((b) => ({ ...b, s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }));
    draw();
  }

  // Các ca chiếm giờ bắt đầu tại t
  const sessionsAt = (t) => bookings.filter((b) => b.s < t + HOUR && t < b.e);

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

  function draw() {
    const now = Date.now();
    const horizon = now + (cfg.booking_horizon_days || 7) * 24 * HOUR;
    const narrow = NARROW.matches;
    const shown = narrow ? [dayKeys[dayIndex]] : dayKeys;
    $('daynav').hidden = !narrow;
    if (narrow) {
      const d = vnInstant(dayKeys[dayIndex]);
      $('day-label').textContent = `${weekdayShort(d)} ${fmtDate(d)}${dayKeys[dayIndex] === today ? ' · hôm nay' : ''}`;
      $('prev-day').disabled = dayIndex === 0;
      $('next-day').disabled = dayIndex === days - 1;
    }

    const head = `<div class="cal-corner"></div>${shown.map((k) => {
      const d = vnInstant(k);
      return `<div class="cal-head ${k === today ? 'today' : ''}"><span>${weekdayShort(d)}</span><strong class="num">${fmtDate(d)}</strong></div>`;
    }).join('')}`;
    const hours = Array.from({ length: 24 }, (_, h) => `<div class="cal-hour num">${pad(h)}:00</div>`).join('');
    const cols = shown.map((k) => {
      const { d0, parts } = blocksOfDay(k);
      const cells = Array.from({ length: 24 }, (_, h) => {
        const t = d0 + h * HOUR;
        const past = t < now || t > horizon; // giờ đang diễn ra cũng không đặt được (Q9)
        const full = sessionsAt(t).length >= max;
        const label = `${weekdayShort(vnInstant(k))} ${fmtDate(vnInstant(k))} ${pad(h)}:00, ${full ? 'đã đủ phiên' : past ? 'đã qua' : 'còn trống, bấm để đặt ca'}`;
        return `<button type="button" class="cal-cell ${past ? 'past' : ''}" data-day="${k}" data-hour="${h}"
          ${past || full ? 'disabled' : ''} aria-label="${esc(label)}"></button>`;
      }).join('');
      const blocks = parts.map((p) => {
        const top = (((p.s - d0) / HOUR) * 100) / 24;
        const height = (((p.e - p.s) / HOUR) * 100) / 24;
        const pos = p.alone ? 'left:3px;right:3px' : p.lane === 0 ? 'left:3px;right:calc(50% + 1px)' : 'left:calc(50% + 1px);right:3px';
        const endLabel = fmtTime(new Date(p.e).toISOString()) === '00:00' ? '24:00' : fmtTime(new Date(p.e).toISOString());
        const range = `${fmtTime(new Date(p.s).toISOString())} – ${endLabel}`;
        const title = `${p.b.username}${p.b.use_gpu ? ' · GPU' : ''} · ${range}`;
        return `<div class="cal-block ${p.b.mine ? 'mine' : ''} ${p.b.use_gpu ? 'gpu' : ''} ${(p.e - p.s) <= HOUR ? 'short' : ''}"
          style="top:${top}%;height:calc(${height}% - 2px);${pos}" data-booking="${p.b.id}" title="${esc(title)}">
          <span class="who">${esc(p.b.username)}</span>
          <span class="when num">${p.b.use_gpu ? '<b class="gpu-chip">GPU</b>' : ''}<span>${esc(range)}</span></span></div>`;
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
    if (cell && header) $('cal-scroll').scrollTop = cell.offsetTop - header.offsetHeight;
  }

  const narrowDay = () => (NARROW.matches ? dayKeys[dayIndex] : today);
  $('cal').addEventListener('click', (ev) => {
    const c = ev.target.closest('.cal-cell');
    if (c && !c.disabled) openBookingDialog({ date: c.dataset.day, from: Number(c.dataset.hour) });
  });
  $('book-btn').onclick = () => openBookingDialog({ date: narrowDay() });
  $('prev-day').onclick = () => { dayIndex = Math.max(0, dayIndex - 1); draw(); };
  $('next-day').onclick = () => { dayIndex = Math.min(days - 1, dayIndex + 1); draw(); };
  NARROW.onchange = () => { if (view.querySelector('#cal')) draw(); };

  // ---- Hộp thoại đặt ca ----
  function openBookingDialog({ date = today, from = null }) {
    const maxHours = cfg.slot_max_hours || 8;
    const sel = { date, from, to: null };
    const { el, close } = openDialog({
      title: 'Đặt ca',
      body: `<form class="stack" id="book-form" novalidate>
        <div id="form-error" role="alert" aria-live="assertive"></div>
        <div class="field"><label for="f-date">Ngày</label>
          <select class="select" id="f-date">${dayKeys.map((k) => {
    const d = vnInstant(k);
    return `<option value="${k}">${weekdayShort(d)} ${fmtDate(d)}${k === today ? ' (hôm nay)' : ''}</option>`;
  }).join('')}</select></div>
        <div class="field-row">
          <div class="field"><label for="f-from">Từ giờ</label><select class="select num" id="f-from"></select></div>
          <div class="field"><label for="f-to">Đến giờ</label><select class="select num" id="f-to"></select></div>
        </div>
        <fieldset>
          <legend id="gpu-legend">Dùng GPU</legend>
          <div class="choice-group" id="gpu-group" role="radiogroup" aria-labelledby="gpu-legend">
            <label class="choice"><input type="radio" name="use_gpu" value="true">
              <span class="choice-box"><strong>${icon('gpu', 'icon-sm')}Có</strong><span>RTX 5090 · 10 giờ/tuần</span></span></label>
            <label class="choice"><input type="radio" name="use_gpu" value="false">
              <span class="choice-box"><strong>${icon('cpu', 'icon-sm')}Không</strong><span>Chạy code, xử lý dữ liệu</span></span></label>
          </div>
          <div id="gpu-hint"></div><div id="gpu-error"></div>
        </fieldset>
        <div class="summary" id="summary" aria-live="polite"></div>
      </form>`,
      foot: `<button class="btn btn-secondary" data-close type="button">Hủy</button>
             <button class="btn btn-primary" id="submit" type="submit" form="book-form">${icon('check')}Xác nhận đặt ca</button>`,
    });
    const q = (id) => el.querySelector(`#${id}`);
    const fDate = q('f-date');
    const fFrom = q('f-from');
    const fTo = q('f-to');
    fDate.value = sel.date;

    function fillFrom() {
      const now = Date.now();
      const horizon = now + (cfg.booking_horizon_days || 7) * 24 * HOUR;
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
    function summary() {
      if (sel.from === null) {
        q('summary').textContent = 'Ngày này không còn giờ để đặt. Hãy chọn ngày khác.';
        q('submit').disabled = true;
        return;
      }
      q('submit').disabled = false;
      const start = toApiIso(sel.date, sel.from);
      const end = toApiIso(sel.date, sel.to);
      const gpu = el.querySelector('input[name=use_gpu]:checked');
      q('summary').innerHTML = `<strong>${esc(fmtRange(start, end))}</strong>, ${sel.to - sel.from} giờ${gpu ? ` · ${gpu.value === 'true' ? 'có GPU' : 'không GPU'}` : ''}`;
      // Gợi ý (không chặn): khung đã có người khác dùng GPU
      const s = new Date(start).getTime();
      const e = new Date(end).getTime();
      const gpuTaken = bookings.some((b) => b.use_gpu && !b.mine && b.s < e && s < b.e);
      q('gpu-hint').innerHTML = gpuTaken ? `<p class="help">${icon('info', 'icon-sm')} Khung này đã có người dùng GPU, hãy chọn "Không" hoặc đổi giờ.</p>` : '';
    }

    fDate.onchange = () => { sel.date = fDate.value; sel.from = null; sel.to = null; fillFrom(); fillTo(); summary(); };
    fFrom.onchange = () => { sel.from = Number(fFrom.value); fillTo(); summary(); };
    fTo.onchange = () => { sel.to = Number(fTo.value); summary(); };
    el.querySelectorAll('input[name=use_gpu]').forEach((r) => r.addEventListener('change', () => {
      q('gpu-group').removeAttribute('aria-invalid');
      q('gpu-error').innerHTML = '';
      summary();
    }));

    q('book-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      q('form-error').innerHTML = '';
      const gpu = el.querySelector('input[name=use_gpu]:checked');
      if (!gpu) { // REQ-UI-01: bắt buộc chọn, không gửi request
        q('gpu-group').setAttribute('aria-invalid', 'true');
        q('gpu-error').innerHTML = `<p class="error-text" role="alert">${icon('alert', 'icon-sm')}Hãy chọn có dùng GPU hay không.</p>`;
        el.querySelector('input[name=use_gpu]').focus();
        return;
      }
      if (sel.from === null) return;
      await withBusy(q('submit'), async () => {
        try {
          const b = await post('/bookings', { start: toApiIso(sel.date, sel.from), end: toApiIso(sel.date, sel.to), use_gpu: gpu.value === 'true' });
          toast(`Đã đặt ca ${fmtRange(b.start, b.end)}`);
          close();
          await load();
        } catch (e) {
          q('form-error').innerHTML = `<div class="alert alert-danger" data-code="${esc(e.code)}">${icon('alert')}<span>${esc(errorMessage(e))}</span></div>`;
        }
      });
    });

    fillFrom(); fillTo(); summary();
    fFrom.focus();
  }

  await load();
  scrollToNow();
}
