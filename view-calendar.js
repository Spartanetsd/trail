// MOBILITY TRAIL — view-calendar.js
// Календар транспортних рішень: типи днів, пензель, робочі блоки, теплова карта, проїзні за планом.

import * as E from './engine.js';
import { esc, icon, openSheet, closeSheet, toast, numField, selectField, readField, MONTHS, DOW_SHORT, humanDate, shortDate } from './ui.js';
import { heatColor } from './charts.js';
import { openLogTrip, purchasesHTML, signed, badge } from './sheets.js';

const cv = { offset: 0, brush: null, heat: false };
const CELL_CODE = { eco: 'ECO', comfort: 'COMF', auto: 'AUTO', taxi: 'TAXI', flex: 'FLEX', best: 'BEST', off: 'вих.', away: 'поза' };
const TYPE_ORDER = ['eco', 'comfort', 'auto', 'taxi', 'flex', 'best', 'off', 'away'];

function shownMonth(app) {
  const d = E.parseDate(E.monthStart(app.today()));
  d.setMonth(d.getMonth() + cv.offset);
  const from = E.fmtDate(d);
  return { from, to: E.monthEnd(from) };
}

export default {
  mount(app, root) {
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act]');
      if (!t || !root.contains(t)) return;
      const a = t.dataset.act;
      if (a === 'prev') { cv.offset -= 1; this.render(app, root); }
      else if (a === 'next') { cv.offset += 1; this.render(app, root); }
      else if (a === 'today') { cv.offset = 0; this.render(app, root); }
      else if (a === 'brush') { const b = t.dataset.type || null; cv.brush = cv.brush === b ? null : b; this.render(app, root); }
      else if (a === 'day') {
        const date = t.dataset.date;
        if (cv.brush) {
          app.update((st) => {
            if (cv.brush === 'reset') { const e = st.calendar[date]; if (e) { delete e.type; if (!Object.keys(e).length) delete st.calendar[date]; } }
            else st.calendar[date] = { ...(st.calendar[date] || {}), type: cv.brush };
          });
        } else openDay(app, date);
      }
      else if (a === 'block') openBlock(app);
      else if (a === 'clear') clearMonth(app);
      else if (a === 'heat') { cv.heat = !cv.heat; this.render(app, root); }
    });
  },
  render(app, root) { root.innerHTML = html(app); },
};

function html(app) {
  const s = app.s;
  const { from, to } = shownMonth(app);
  const d0 = E.parseDate(from);
  const today = app.today();
  const cmp = E.compareModes(s, app.cal, app.hist, { from, to });
  const plan = cmp.plan;
  const max = Math.max(0, ...plan.days.map((d) => d.decision || 0));
  const logged = new Set(app.hist.filter((r) => r.kind === 'trip').map((r) => r.date));
  const first = E.isoDow(from);

  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="cal-day blank" aria-hidden="true"></span>');
  for (const d of plan.days) {
    const n = Number(d.date.slice(8));
    const label = `${humanDate(d.date, true)}: ${E.MODE_INFO[d.type].name}${d.trip ? `, ${E.fmtUAH(d.decision)}` : ''}${logged.has(d.date) ? ', поїздку записано' : ''}`;
    const style = [`--c:var(--m-${d.type})`, cv.heat && d.trip ? heatColor(d.decision, max) : ''].filter(Boolean).join(';');
    cells.push(`<button type="button" class="cal-day ${d.type}${d.trip ? ' trip' : ''}${d.date === today ? ' today' : ''}${d.date < today ? ' past' : ''}" data-act="day" data-date="${d.date}" style="${style}" aria-label="${esc(label)}">
      <span class="d">${n}</span>${logged.has(d.date) ? '<span class="logged" aria-hidden="true"></span>' : ''}
      ${cv.heat && d.trip ? `<span class="v">${E.fmtNum(d.decision)} ₴</span>` : `<span class="t">${CELL_CODE[d.type]}</span>`}
    </button>`);
  }

  const byType = {};
  for (const d of plan.days) if (d.trip) byType[d.type] = (byType[d.type] || 0) + 1;
  const monthHist = app.hist.filter((r) => r.date >= from && r.date <= to);
  const tripsLogged = monthHist.filter((r) => r.kind === 'trip');
  const spent = tripsLogged.reduce((a, r) => a + r.cost, 0) + monthHist.filter((r) => r.kind === 'pass').reduce((a, r) => a + r.price, 0);
  const brushNote = cv.brush ? (cv.brush === 'reset' ? 'Пензель: торкайтеся днів, щоб повернути їх до розкладу.' : `Пензель: торкайтеся днів, щоб позначити «${E.MODE_INFO[cv.brush].name}».`) : 'Торкніться дня, щоб змінити тип або записати фактичну поїздку.';

  return `<h1 class="page-title">Календар</h1>
  <p class="page-sub">Плануйте робочі блоки — вигідність проїзних перераховується автоматично.</p>
  <div class="card" style="margin-top:14px">
    <div class="cal-head">
      <button type="button" class="icon-btn" data-act="prev" aria-label="Попередній місяць">${icon('left')}</button>
      <h2>${MONTHS[d0.getMonth()]} ${d0.getFullYear()}</h2>
      <button type="button" class="icon-btn" data-act="next" aria-label="Наступний місяць">${icon('right')}</button>
    </div>
    <div class="chips scroll" role="toolbar" aria-label="Пензель для днів">
      <button type="button" class="chip" data-act="brush" aria-pressed="${cv.brush === null}">${icon('check')}Перегляд</button>
      ${TYPE_ORDER.map((t) => `<button type="button" class="chip" data-act="brush" data-type="${t}" aria-pressed="${cv.brush === t}"><span class="dotc" style="--c:var(--m-${t})"></span>${esc(E.MODE_INFO[t].code)}</button>`).join('')}
      <button type="button" class="chip" data-act="brush" data-type="reset" aria-pressed="${cv.brush === 'reset'}">Як у розкладі</button>
    </div>
    <p class="brush-note" aria-live="polite">${esc(brushNote)}</p>
    <div class="cal-dows" aria-hidden="true">${DOW_SHORT.map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="cal-grid${cv.heat ? ' heat' : ''}">${cells.join('')}</div>
    <div class="switch-row" style="margin-top:10px"><label for="heat-sw"><span>Теплова карта витрат</span><small>Замість типу дня — його вартість за планом. Чим насиченіший колір, тим дорожчий день.</small></label><input id="heat-sw" class="switch" type="checkbox" role="switch" data-act="heat" ${cv.heat ? 'checked' : ''}></div>
    <div class="cal-legend">${TYPE_ORDER.map((t) => `<span><i style="--c:var(--m-${t})"></i>${CELL_CODE[t]} — ${esc(E.MODE_INFO[t].name)}</span>`).join('')}</div>
  </div>
  <div class="row wrap" style="margin-bottom:12px">
    <button type="button" class="btn primary" data-act="block">${icon('calendar')}Запланувати блок</button>
    <button type="button" class="btn ghost" data-act="clear">Скинути місяць</button>
    ${cv.offset !== 0 ? `<button type="button" class="btn ghost" data-act="today">До сьогодні</button>` : ''}
  </div>

  <section class="card" aria-labelledby="cal-sum">
    <h2 class="card-title" id="cal-sum">Підсумок місяця за планом</h2>
    <div style="margin-top:8px">
      <div class="kv"><span>Днів поїздок</span><b>${plan.tripDays}${Object.keys(byType).length ? ` (${Object.entries(byType).map(([k, v]) => `${E.MODE_INFO[k].code} ${v}`).join(', ')})` : ''}</b></div>
      <div class="kv"><span>Вартість за планом</span><b>${E.fmtUAH(plan.totals.decision)}</b></div>
      <div class="kv"><span>Із них гроші з кишені</span><b>${E.fmtUAH(plan.totals.cash)}</b></div>
      <div class="kv"><span>Прогноз економії проти авто</span><b class="${plan.vsCar >= 0 ? 'good' : 'bad'}">${signed(plan.vsCar)}</b></div>
      <div class="kv"><span>Записано поїздок</span><b>${tripsLogged.length}</b></div>
      <div class="kv"><span>Фактично витрачено</span><b>${E.fmtUAH(spent)}</b></div>
    </div>
    ${plan.tripDays > 0 && plan.coverableTotal + plan.ownedUsed > 0 ? `<div class="card-title" style="margin-top:16px">Проїзні для цього плану</div>
      <div class="kv"><span>Разові квитки</span><b>${E.fmtUAH(plan.strategies.singles)}</b></div>
      <div class="kv total"><span>Оптимально</span><b>${E.fmtUAH(plan.strategies.optimal)}</b></div>
      ${plan.ownedSunk > 0 ? `<div class="kv"><span>Уже куплені проїзні</span><b>${E.fmtUAH(plan.ownedSunk)}</b></div>` : ''}
      ${purchasesHTML(plan.purchases)}` : ''}
  </section>`;
}

function openDay(app, date) {
  openSheet({
    title: humanDate(date, true),
    render: () => {
      const s = app.s;
      const type = E.resolveDayType(date, s, app.cal);
      const override = app.cal[date]?.type;
      const p = E.computePeriod(s, app.cal, app.hist, { from: date, to: date }).days[0];
      const recs = app.hist.filter((r) => r.date === date);
      const eligible = E.resolveEligible(date, s, app.cal);
      return `<div class="chips">${TYPE_ORDER.map((t) => `<button type="button" class="chip" data-act="type" data-type="${t}" aria-pressed="${type === t}"><span class="dotc" style="--c:var(--m-${t})"></span>${esc(E.MODE_INFO[t].name)}</button>`).join('')}</div>
      ${override ? '<button type="button" class="link-btn" data-act="type" data-type="reset">Повернути як у розкладі</button>' : '<p class="small dim">Тип дня — за вашим розкладом робочих днів.</p>'}
      ${s.benefit.enabled ? `<div class="switch-row"><label for="day-elig"><span>Поїздка відповідає умовам пільги</span><small>Позначайте лише поїздки, що відповідають умовам закону.</small></label><input id="day-elig" class="switch" type="checkbox" role="switch" data-act="elig" ${eligible ? 'checked' : ''}></div>` : ''}
      <div class="card flat">
        ${p.trip ? `<div class="row">${badge(p.type)}<b>${esc(p.title)}</b></div>
          <div class="kv" style="margin-top:6px"><span>За планом</span><b>${E.fmtUAH(p.decision, 2)}</b></div>
          <div class="kv"><span>Гроші з кишені</span><b>${E.fmtUAH(p.cash, 2)}</b></div>
          <div class="kv"><span>Час у дорозі</span><b>${E.fmtMin(p.minutes)}</b></div>
          <p class="hint">Для одного дня без урахування проїзних, які окупаються лише на кількох днях.</p>` : `<p class="muted">У цей день поїздок не заплановано.</p>`}
      </div>
      <div class="card flat"><div class="card-title">Фактичні записи</div>
        ${recs.length ? recs.map((r) => `<div class="hist-item"><span class="mode-badge s-${r.kind === 'pass' ? 'best' : r.mode}">${r.kind === 'pass' ? 'ПРОЇЗНИЙ' : esc(E.MODE_INFO[r.mode]?.code || 'ІНШЕ')}</span><div class="hist-main"><b>${esc(r.kind === 'pass' ? `${r.type === 'weekly' ? 'Тижневий' : 'Місячний'} × ${r.persons}` : r.label || 'Поїздка')}</b><small>${r.kind === 'trip' && r.fromBank ? 'з банку комфорту' : r.note ? esc(r.note) : ''}</small></div><div class="hist-amt">${E.fmtUAH(r.kind === 'pass' ? r.price : r.cost, 2)}</div><button type="button" class="icon-btn" data-act="del" data-id="${esc(r.id)}" aria-label="Видалити запис">${icon('trash')}</button></div>`).join('') : '<p class="small muted" style="margin-top:6px">Ще немає записів за цей день.</p>'}
      </div>
      <button type="button" class="btn primary block" data-act="log">${icon('plus')}Записати фактичну поїздку</button>`;
    },
    onAction: (act, el, ev, ctl) => {
      if (act === 'type') {
        const t = el.dataset.type;
        app.update((st) => {
          const e = { ...(st.calendar[date] || {}) };
          if (t === 'reset') delete e.type; else e.type = t;
          if (Object.keys(e).length) st.calendar[date] = e; else delete st.calendar[date];
        });
        ctl.refresh();
      } else if (act === 'elig') {
        app.update((st) => { st.calendar[date] = { ...(st.calendar[date] || {}), eligible: el.checked }; });
        ctl.refresh();
      } else if (act === 'del') {
        const id = el.dataset.id;
        const removed = app.hist.find((r) => r.id === id);
        app.update((st) => { st.history = st.history.filter((r) => r.id !== id); });
        ctl.refresh();
        toast('Запис видалено', { action: 'Повернути', onAction: () => app.update((st) => { st.history.push(removed); }) });
      } else if (act === 'log') {
        const t = E.resolveDayType(date, app.s, app.cal);
        openLogTrip(app, { date, mode: ['eco', 'comfort', 'auto', 'taxi', 'flex'].includes(t) ? t : 'eco' });
      }
    },
  });
}

function openBlock(app) {
  const s = app.s;
  const { from, to } = shownMonth(app);
  const start = app.today() > from && app.today() <= to ? app.today() : from;
  const f = { start, inDays: 5, awayDays: 9, mode: s.trip.defaultMode, until: to, weekendsOff: true };
  const preview = () => {
    const blocks = [];
    const cycle = Math.max(1, f.inDays + f.awayDays);
    let d = f.start, guard = 0;
    while (d <= f.until && guard++ < 60) {
      const end = E.addDays(d, f.inDays - 1);
      if (f.inDays > 0) blocks.push(`${shortDate(d)}–${shortDate(end > f.until ? f.until : end)}`);
      d = E.addDays(d, cycle);
    }
    return blocks;
  };
  openSheet({
    title: 'Робочий блок',
    render: () => {
      const blocks = preview();
      return `<p class="muted small">Наприклад: 5 днів у Дніпрі, потім 9 поза містом (разом 2 тижні). Повторюється до вказаної дати.</p>
      <div class="grid-2">
        <div class="field"><label for="bl-start">Початок</label><div class="input-wrap"><input id="bl-start" type="date" data-f="start" value="${esc(f.start)}"></div></div>
        <div class="field"><label for="bl-until">Повторювати до</label><div class="input-wrap"><input id="bl-until" type="date" data-f="until" value="${esc(f.until)}"></div></div>
        ${numField({ bind: 'f.inDays', label: 'У Дніпрі', value: f.inDays, unit: 'дн.', min: 0, max: 60, int: true, id: 'bl-in' })}
        ${numField({ bind: 'f.awayDays', label: 'Поза містом', value: f.awayDays, unit: 'дн.', min: 0, max: 60, int: true, id: 'bl-away' })}
      </div>
      ${selectField({ bind: 'f.mode', label: 'Як їздити в робочі дні блоку', value: f.mode, options: E.PLAN_MODES.map((m) => [m, `${E.MODE_INFO[m].code} — ${E.MODE_INFO[m].name}`]), id: 'bl-mode' })}
      <div class="switch-row"><label for="bl-we"><span>Вихідні в блоці — без поїздок</span><small>За вашим розкладом робочих днів.</small></label><input id="bl-we" class="switch" type="checkbox" role="switch" data-f="weekendsOff" ${f.weekendsOff ? 'checked' : ''}></div>
      <div class="callout">${icon('calendar')}<span>${blocks.length ? `У Дніпрі: ${blocks.join(', ')}.` : 'Немає днів у Дніпрі — збільште «У Дніпрі».'}</span></div>
      <div class="sheet-actions"><button type="button" class="btn primary" data-act="apply">Застосувати</button><button type="button" class="btn" data-act="cancel">Скасувати</button></div>`;
    },
    onChange: (el, ev, ctl) => {
      if (el.dataset.f) {
        if (el.type === 'checkbox') f[el.dataset.f] = el.checked;
        else if (E.isDateStr(el.value)) f[el.dataset.f] = el.value;
      } else if (el.dataset.bind) {
        const k = el.dataset.bind.replace('f.', '');
        const r = readField(el, f[k]);
        if (r && !r.invalid) f[k] = r.value;
      }
      ctl.refresh();
    },
    onAction: (act) => {
      if (act === 'cancel') { closeSheet(); return; }
      if (act !== 'apply') return;
      if (f.until < f.start) { toast('Дата «до» раніша за початок'); return; }
      const cycle = Math.max(1, f.inDays + f.awayDays);
      const before = JSON.stringify(app.cal);
      app.update((st) => {
        for (const d of E.dateRange(f.start, f.until)) {
          const pos = E.dayDiff(f.start, d) % cycle;
          let type;
          if (pos < f.inDays) type = f.weekendsOff && !st.settings.trip.workDays.includes(E.isoDow(d)) ? 'off' : f.mode;
          else type = 'away';
          st.calendar[d] = { ...(st.calendar[d] || {}), type };
        }
      });
      closeSheet();
      toast('Блок заплановано', { action: 'Скасувати', onAction: () => app.update((st) => { st.calendar = JSON.parse(before); }) });
    },
  });
}

function clearMonth(app) {
  const { from, to } = shownMonth(app);
  const before = JSON.stringify(app.cal);
  let n = 0;
  app.update((st) => {
    for (const d of Object.keys(st.calendar)) {
      if (d >= from && d <= to) { delete st.calendar[d]; n += 1; }
    }
  });
  toast(n ? 'Місяць повернуто до розкладу' : 'У цьому місяці не було змін', n ? { action: 'Повернути', onAction: () => app.update((st) => { st.calendar = JSON.parse(before); }) } : {});
}

