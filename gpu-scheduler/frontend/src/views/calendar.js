// Lịch & đặt ca — REQ-UI-01, REQ-UI-02, REQ-UI-03, REQ-UI-10
import { get, post } from '../api.js';
import { esc, icon, toast, withBusy, errorMessage } from '../ui.js';
import { TZ_LABEL, dateKey, addDays, vnInstant, toApiIso, fmtDate, weekdayShort, fmtRange } from '../time.js';

const HOUR = 3600 * 1000;
const pad = (h) => String(h).padStart(2, '0');

export async function renderCalendar(view, { state }) {
  const cfg = state.config || {};
  const days = (cfg.booking_horizon_days || 7) + 1; // hôm nay + 7 ngày
  const maxHours = cfg.slot_max_hours || 8;
  const today = dateKey(new Date());
  const dayKeys = Array.from({ length: days }, (_, i) => addDays(today, i));
  const images = await get('/images');
  const ports = state.me.ports;

  const sel = { date: today, from: null, to: null };

  view.innerHTML = `
    <div class="grid grid-main">
      <section class="card" aria-labelledby="h-cal">
        <div class="card-head">
          <div><h2 id="h-cal">Lịch sử dụng</h2><p class="subtle">Tối đa 2 phiên cùng lúc, trong đó tối đa 1 phiên dùng GPU · giờ Việt Nam (${TZ_LABEL})</p></div>
          <button class="btn btn-ghost btn-sm" id="reload" aria-label="Tải lại lịch">${icon('refresh', 'icon-sm')}Tải lại</button>
        </div>
        <div class="card-body stack">
          <div class="cal-legend" aria-hidden="true">
            <span><i class="swatch free"></i>Trống</span>
            <span><i class="swatch" style="background:#e4e7fd"></i>1/2 phiên</span>
            <span><i class="swatch" style="background:repeating-linear-gradient(135deg,#d9dce4 0 3px,#f0f1f5 3px 6px)"></i>Đầy</span>
            <span><b class="tag tag-gpu" style="padding:0 5px">GPU</b>Đã có người dùng GPU</span>
          </div>
          <div class="cal-scroll"><div class="cal" id="cal" style="grid-template-columns:56px repeat(${days}, minmax(88px, 1fr))" role="grid" aria-label="Lịch theo giờ"></div></div>
        </div>
      </section>

      <section class="card" aria-labelledby="h-book" id="book-card">
        <div class="card-head"><h2 id="h-book">Đặt ca</h2></div>
        <form class="card-body stack" id="book-form" novalidate>
          <div id="form-error" role="alert" aria-live="assertive"></div>
          <div class="field">
            <label for="f-date">Ngày <span class="req" aria-hidden="true">*</span></label>
            <select class="select" id="f-date" required>${dayKeys.map((k) => {
    const d = vnInstant(k);
    return `<option value="${k}">${weekdayShort(d)} ${fmtDate(d)}${k === today ? ' (hôm nay)' : ''}</option>`;
  }).join('')}</select>
          </div>
          <div class="field-row">
            <div class="field"><label for="f-from">Từ giờ <span class="req" aria-hidden="true">*</span></label>
              <select class="select num" id="f-from" required></select></div>
            <div class="field"><label for="f-to">Đến giờ <span class="req" aria-hidden="true">*</span></label>
              <select class="select num" id="f-to" required></select></div>
          </div>
          <fieldset>
            <legend id="gpu-legend">Dùng GPU <span class="req" aria-hidden="true">*</span></legend>
            <div class="choice-group" id="gpu-group" role="radiogroup" aria-labelledby="gpu-legend" aria-describedby="gpu-error">
              <label class="choice"><input type="radio" name="use_gpu" value="true">
                <span class="choice-box"><strong>${icon('gpu', 'icon-sm')}Có</strong><span>RTX 5090, tính vào 10 giờ/tuần</span></span></label>
              <label class="choice"><input type="radio" name="use_gpu" value="false">
                <span class="choice-box"><strong>${icon('cpu', 'icon-sm')}Không</strong><span>Tiền xử lý, chạy thử code</span></span></label>
            </div>
            <div id="gpu-error"></div>
          </fieldset>
          <div class="field">
            <label for="f-image">Image <span class="req" aria-hidden="true">*</span></label>
            <select class="select" id="f-image" required>${images.length ? images.map((i) => `<option>${esc(i.name)}</option>`).join('') : '<option value="">Chưa có image nào được cho phép</option>'}</select>
          </div>
          <div class="field">
            <label for="f-ports">Cổng cần mở</label>
            <input class="input num" id="f-ports" inputmode="numeric" autocomplete="off" placeholder="vd ${ports.from + 1}, ${ports.from + 6}" aria-describedby="ports-help">
            <p class="help" id="ports-help">Không bắt buộc. Trong dải ${ports.from}–${ports.to}, cách nhau bằng dấu phẩy.</p>
          </div>
          <div class="summary" id="summary" aria-live="polite"></div>
          <button class="btn btn-primary btn-block" type="submit" id="submit">${icon('check')}Đặt ca</button>
        </form>
      </section>
    </div>`;

  const $ = (id) => view.querySelector(`#${id}`);
  const fDate = $('f-date');
  const fFrom = $('f-from');
  const fTo = $('f-to');

  // Giờ bắt đầu: 00–23; hôm nay không chọn được giờ đã bắt đầu (Q9: đang 09:20 thì sớm nhất 10:00)
  function fillFrom() {
    const now = Date.now();
    const horizon = now + (cfg.booking_horizon_days || 7) * 24 * HOUR;
    fFrom.innerHTML = Array.from({ length: 24 }, (_, h) => {
      const t = vnInstant(sel.date, h).getTime();
      const disabled = t < now || t > horizon;
      return `<option value="${h}" ${disabled ? 'disabled' : ''}>${pad(h)}:00</option>`;
    }).join('');
    const first = [...fFrom.options].find((o) => !o.disabled);
    if (sel.from === null || fFrom.options[sel.from]?.disabled) sel.from = first ? Number(first.value) : null;
    if (sel.from !== null) fFrom.value = String(sel.from);
  }
  // Giờ kết thúc: 1–8 giờ sau giờ bắt đầu; qua nửa đêm ghi "(+1 ngày)"; 24:00 = 00:00 hôm sau
  function fillTo() {
    if (sel.from === null) { fTo.innerHTML = ''; return; }
    fTo.innerHTML = Array.from({ length: maxHours }, (_, i) => {
      const end = sel.from + i + 1;
      const label = end <= 24 ? `${pad(end)}:00` : `${pad(end - 24)}:00 (+1 ngày)`;
      return `<option value="${end}">${label}</option>`;
    }).join('');
    if (sel.to === null || sel.to <= sel.from || sel.to > sel.from + maxHours) sel.to = Math.min(sel.from + 2, sel.from + maxHours);
    fTo.value = String(sel.to);
  }
  function renderSummary() {
    const box = $('summary');
    if (sel.from === null) { box.textContent = 'Hôm nay không còn giờ trống để đặt. Hãy chọn ngày khác.'; return; }
    const start = toApiIso(sel.date, sel.from);
    const end = toApiIso(sel.date, sel.to);
    const gpu = view.querySelector('input[name=use_gpu]:checked');
    box.innerHTML = `<strong>${esc(fmtRange(start, end))}</strong>, ${sel.to - sel.from} giờ${gpu ? ` · ${gpu.value === 'true' ? 'có GPU' : 'không GPU'}` : ''}`;
    highlight();
  }

  let calData = [];
  async function loadCalendar() {
    const from = today;
    const to = addDays(today, days);
    calData = (await get(`/calendar?from=${from}&to=${to}`)).map((s) => ({ ...s, s: new Date(s.start).getTime(), e: new Date(s.end).getTime() }));
    drawCalendar();
  }
  function cellInfo(key, h) {
    const t = vnInstant(key, h).getTime();
    const seg = calData.find((x) => x.s <= t && t < x.e) || { sessions: 0, gpu_taken: false };
    return { t, ...seg };
  }
  function drawCalendar() {
    const now = Date.now();
    const horizon = now + (cfg.booking_horizon_days || 7) * 24 * HOUR;
    const max = cfg.max_concurrent_sessions || 2;
    let html = '<div class="cal-h" role="columnheader"></div>';
    html += dayKeys.map((k) => `<div class="cal-h ${k === today ? 'today' : ''}" role="columnheader">${weekdayShort(vnInstant(k))}<small>${fmtDate(vnInstant(k))}</small></div>`).join('');
    for (let h = 0; h < 24; h++) {
      html += `<div class="cal-hour" role="rowheader">${pad(h)}:00</div>`;
      for (const k of dayKeys) {
        const c = cellInfo(k, h);
        const past = c.t + HOUR <= now || c.t > horizon;
        const started = c.t < now; // giờ đang diễn ra: không đặt được (Q9)
        const full = c.sessions >= max;
        const cls = past || started ? 'past' : full ? 'full' : c.sessions ? 's1' : '';
        const label = full ? 'Đầy' : c.sessions ? `${c.sessions}/${max}` : past || started ? '' : '<span class="sr-only">Trống</span>';
        const aria = `${weekdayShort(vnInstant(k))} ${fmtDate(vnInstant(k))} ${pad(h)}:00, ${full ? 'đã đủ phiên' : c.sessions ? `${c.sessions} trên ${max} phiên` : 'trống'}${c.gpu_taken ? ', GPU đã có người dùng' : ''}`;
        html += `<button type="button" class="slot ${cls}" data-day="${k}" data-hour="${h}" data-sessions="${c.sessions}" data-gpu="${c.gpu_taken}"
          ${past || started || full ? 'disabled' : ''} aria-label="${esc(aria)}"><span>${label}</span>${c.gpu_taken ? '<span class="gpu">GPU</span>' : ''}</button>`;
      }
    }
    $('cal').innerHTML = html;
    highlight();
  }
  function highlight() {
    view.querySelectorAll('.slot.selected').forEach((b) => b.classList.remove('selected'));
    if (sel.from === null) return;
    for (let h = sel.from; h < sel.to; h++) {
      const key = h < 24 ? sel.date : addDays(sel.date, 1);
      const cell = view.querySelector(`.slot[data-day="${key}"][data-hour="${h % 24}"]`);
      cell?.classList.add('selected');
    }
  }

  $('cal').addEventListener('click', (ev) => {
    const b = ev.target.closest('.slot');
    if (!b || b.disabled) return;
    sel.date = b.dataset.day;
    sel.from = Number(b.dataset.hour);
    sel.to = null;
    fDate.value = sel.date;
    fillFrom(); fillTo(); renderSummary();
    if (window.matchMedia('(max-width: 1100px)').matches) $('book-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    fFrom.focus({ preventScroll: true });
  });
  fDate.onchange = () => { sel.date = fDate.value; sel.from = null; sel.to = null; fillFrom(); fillTo(); renderSummary(); };
  fFrom.onchange = () => { sel.from = Number(fFrom.value); fillTo(); renderSummary(); };
  fTo.onchange = () => { sel.to = Number(fTo.value); renderSummary(); };
  view.querySelectorAll('input[name=use_gpu]').forEach((r) => r.addEventListener('change', () => {
    $('gpu-group').removeAttribute('aria-invalid');
    $('gpu-error').innerHTML = '';
    renderSummary();
  }));
  $('reload').onclick = (ev) => withBusy(ev.currentTarget, loadCalendar);

  $('book-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('form-error').innerHTML = '';
    const gpu = view.querySelector('input[name=use_gpu]:checked');
    // REQ-UI-01: bắt buộc chọn GPU, không gửi request nếu chưa chọn
    if (!gpu) {
      $('gpu-group').setAttribute('aria-invalid', 'true');
      $('gpu-error').innerHTML = `<p class="error-text" role="alert">${icon('alert', 'icon-sm')}Hãy chọn có dùng GPU hay không.</p>`;
      view.querySelector('input[name=use_gpu]').focus();
      return;
    }
    if (sel.from === null) return;
    const rawPorts = $('f-ports').value.trim();
    const portList = rawPorts ? rawPorts.split(/[\s,;]+/).filter(Boolean).map(Number) : [];
    if (portList.some((p) => !Number.isInteger(p))) {
      $('form-error').innerHTML = `<div class="alert alert-danger">${icon('alert')}<span>Cổng phải là số, cách nhau bằng dấu phẩy.</span></div>`;
      $('f-ports').setAttribute('aria-invalid', 'true');
      $('f-ports').focus();
      return;
    }
    $('f-ports').removeAttribute('aria-invalid');
    const body = {
      start: toApiIso(sel.date, sel.from),
      end: toApiIso(sel.date, sel.to),
      use_gpu: gpu.value === 'true',
      image: $('f-image').value,
      ...(portList.length && { ports: portList }),
    };
    await withBusy($('submit'), async () => {
      try {
        const b = await post('/bookings', body);
        toast(`Đã đặt ca ${fmtRange(b.start, b.end)}`);
        view.querySelectorAll('input[name=use_gpu]').forEach((r) => { r.checked = false; });
        sel.to = null;
        await loadCalendar();
        fillFrom(); fillTo(); renderSummary();
      } catch (e) {
        $('form-error').innerHTML = `<div class="alert alert-danger" data-code="${esc(e.code)}">${icon('alert')}<span>${esc(errorMessage(e))}</span></div>`;
      }
    });
  });

  fillFrom(); fillTo();
  await loadCalendar();
  renderSummary();
}
