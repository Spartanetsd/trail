// MOBILITY ZERO — view-compare.js
// Порівняння: режими, фінансовий калькулятор, графіки, «Що, якщо?», порадник.

import * as E from './engine.js';
import { esc, icon, numField, selectField, readField, setFieldMsg, setPath, getPath, fmtInput, MONTHS, humanDate } from './ui.js';
import { barsHTML, segmentedHTML, scatterChart, lineChart, legendHTML, miniHeatHTML } from './charts.js';
import { openModeDetail, signed, MODE_ORDER, purchasesHTML } from './sheets.js';
import { TONE_ICON } from './assistant.js';

const cs = {
  period: 'month', monthOffset: 0, from: '', to: '',
  source: 'calendar', manualDays: 20, awayWeeks: 0, taxiTrips: 0,
  scenario: { ...E.SCENARIO_DEFAULT }, beVar: 'days',
};
let lastModel = null;
let scTimer = 0;

const PERIODS = [['day', 'День'], ['week', 'Тиждень'], ['month', 'Місяць'], ['custom', 'Період']];

function shiftMonth(date, k) {
  const d = E.parseDate(E.monthStart(date));
  d.setMonth(d.getMonth() + k);
  return E.fmtDate(d);
}
function baseMonth(app) { const m = shiftMonth(app.today(), cs.monthOffset); return { from: E.monthStart(m), to: E.monthEnd(m) }; }
function selRange(app) {
  if (cs.period === 'week') return app.weekRange();
  if (cs.period === 'custom') {
    const from = E.isDateStr(cs.from) ? cs.from : app.today();
    let to = E.isDateStr(cs.to) && cs.to >= from ? cs.to : E.addDays(from, 29);
    if (E.dayDiff(from, to) > 365) to = E.addDays(from, 365);
    return { from, to };
  }
  return baseMonth(app);
}
function optFor(app, range) {
  if (cs.source !== 'manual') return { ...range };
  const t = E.synthDayTypes(app.s, range.from, range.to, cs.manualDays, cs.awayWeeks, app.s.trip.defaultMode);
  return { ...range, dayTypes: t.types, synthUsed: t.used };
}
function rangeText(r) { return r.from === r.to ? humanDate(r.from) : `${humanDate(r.from)} – ${humanDate(r.to)}`; }
function periodLabel(app) {
  if (cs.period === 'day') return 'день';
  if (cs.period === 'week') return 'тиждень';
  if (cs.period === 'month') { const d = E.parseDate(baseMonth(app).from); return `${MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()}`; }
  return 'період';
}

function compute(app) {
  const s = app.s;
  const dayRec = E.recommend(s, { state: { ...E.DEFAULT_STATE }, eligible: s.benefit.enabled && s.benefit.defaultEligible });
  const mRange = baseMonth(app);
  const month = E.compareModes(s, app.cal, app.hist, optFor(app, mRange));
  const wR = app.weekRange();
  const weekTypes = E.synthDayTypes(s, wR.from, wR.to, s.trip.workDays.length, 0, s.trip.defaultMode).types;
  const week = E.compareModes(s, app.cal, app.hist, { ...wR, dayTypes: weekTypes, ignoreOwned: true });
  const range = cs.period === 'day' ? { from: app.today(), to: app.today() } : selRange(app);
  const sel = cs.period === 'month' ? month : cs.period === 'day' ? null : E.compareModes(s, app.cal, app.hist, optFor(app, range));
  return { dayRec, mRange, month, week, range, sel };
}

export default {
  mount(app, root) {
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act]');
      if (!t || !root.contains(t)) return;
      const a = t.dataset.act;
      if (a === 'period') { cs.period = t.dataset.p; this.render(app, root); }
      else if (a === 'month-prev') { cs.monthOffset -= 1; this.render(app, root); }
      else if (a === 'month-next') { cs.monthOffset += 1; this.render(app, root); }
      else if (a === 'source') { cs.source = t.dataset.src; this.render(app, root); }
      else if (a === 'jump') document.getElementById(t.dataset.to)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      else if (a === 'mode-detail') openDetail(app, t.dataset.mode);
      else if (a === 'sc-toggle') { const k = t.dataset.k; cs.scenario[k] = !cs.scenario[k]; t.setAttribute('aria-pressed', String(cs.scenario[k])); refreshWhatIf(app, root); }
      else if (a === 'sc-reset') { cs.scenario = { ...E.SCENARIO_DEFAULT }; this.render(app, root); root.querySelector('#cmp-whatif')?.scrollIntoView({ block: 'start' }); }
      else if (a === 'sc-preset') { cs.scenario.fuelPct = 20; this.render(app, root); root.querySelector('#cmp-whatif')?.scrollIntoView({ block: 'start' }); }
      else if (a === 'be-var') { cs.beVar = t.dataset.v; refreshWhatIf(app, root); for (const b of root.querySelectorAll('[data-act="be-var"]')) b.setAttribute('aria-pressed', String(b.dataset.v === cs.beVar)); }
      else if (a === 'go') app.go(t.dataset.tab);
    });
    root.addEventListener('change', (ev) => {
      const el = ev.target;
      if (el.dataset.bind) {
        const prev = getPath(app.s, el.dataset.bind);
        const r = readField(el, prev);
        if (!r) return;
        if (r.invalid) { setFieldMsg(el, 'Введіть число'); el.value = fmtInput(prev); return; }
        setFieldMsg(el, r.corrected ? `Виправлено до ${fmtInput(r.value)}` : '');
        if (el.dataset.kind === 'num') el.value = fmtInput(r.value);
        app.update((st) => setPath(st.settings, el.dataset.bind, r.value), { render: false });
        refreshOutputs(app, root);
      } else if (el.dataset.cs) {
        const key = el.dataset.cs;
        if (key === 'from' || key === 'to') { cs[key] = el.value; refreshOutputs(app, root); return; }
        const r = readField(el, cs[key]);
        if (!r || r.invalid) { el.value = fmtInput(cs[key]); return; }
        cs[key] = r.value;
        el.value = fmtInput(r.value);
        refreshOutputs(app, root);
      }
    });
    root.addEventListener('input', (ev) => {
      const el = ev.target;
      if (el.dataset.sc) {
        const v = Number(el.value);
        cs.scenario[el.dataset.sc] = v;
        el.style.setProperty('--p', `${((v - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100}%`);
        const out = root.querySelector(`[data-sc-out="${el.dataset.sc}"]`);
        if (out) out.textContent = scLabel(el.dataset.sc, v);
        clearTimeout(scTimer);
        scTimer = setTimeout(() => refreshWhatIf(app, root), 140);
      }
    });
  },

  render(app, root) {
    root.innerHTML = shell(app);
    refreshOutputs(app, root);
  },
  onResize(app, root) { if (lastModel) drawCharts(app, root, lastModel); },
};

function shell(app) {
  const s = app.s;
  const mR = baseMonth(app);
  const md = E.parseDate(mR.from);
  const routes = s.transit.routes.filter((r) => r.enabled && r.segments.length && E.isPureTransit(r));
  const routeOpts = [['auto', 'Автоматично'], ...routes.map((r) => {
    const boards = r.segments.filter((g) => E.FARE_MODES.includes(g.mode)).length;
    return [r.id, `${r.name} — ${boards - 1 > 0 ? `${boards - 1} ${E.plural(boards - 1, ['пересадка', 'пересадки', 'пересадок'])}` : 'без пересадок'}`];
  })];
  const sc = cs.scenario;
  const slider = (k, label, min, max, step) => `<div class="range-row"><div class="row"><label for="sc-${k}">${esc(label)}</label><b data-sc-out="${k}">${esc(scLabel(k, sc[k]))}</b></div>
    <input id="sc-${k}" type="range" min="${min}" max="${max}" step="${step}" value="${sc[k]}" data-sc="${k}" style="--p:${((sc[k] - min) / (max - min)) * 100}%"></div>`;
  const tog = (k, label) => `<button type="button" class="chip" data-act="sc-toggle" data-k="${k}" aria-pressed="${!!sc[k]}">${esc(label)}</button>`;

  return `<h1 class="page-title">Порівняння</h1>
  <div class="sticky-chips">
    <div class="chips scroll" role="navigation" aria-label="Розділи порівняння">
      <button type="button" class="chip" data-act="jump" data-to="cmp-modes">Режими</button>
      <button type="button" class="chip" data-act="jump" data-to="cmp-calc">Калькулятор</button>
      <button type="button" class="chip" data-act="jump" data-to="cmp-charts">Графіки</button>
      <button type="button" class="chip" data-act="jump" data-to="cmp-whatif">Що, якщо?</button>
      <button type="button" class="chip" data-act="jump" data-to="cmp-tips">Порадник</button>
    </div>
  </div>

  <div class="seg" role="group" aria-label="Період">${PERIODS.map(([p, l]) => `<button type="button" data-act="period" data-p="${p}" aria-pressed="${cs.period === p}">${l}</button>`).join('')}</div>
  ${cs.period === 'month' ? `<div class="cal-head" style="margin-top:12px"><button type="button" class="icon-btn" data-act="month-prev" aria-label="Попередній місяць">${icon('left')}</button><h2>${MONTHS[md.getMonth()]} ${md.getFullYear()}</h2><button type="button" class="icon-btn" data-act="month-next" aria-label="Наступний місяць">${icon('right')}</button></div>` : ''}
  ${cs.period === 'custom' ? `<div class="grid-2" style="margin-top:12px">
    <div class="field"><label for="cmp-from">З</label><div class="input-wrap"><input id="cmp-from" type="date" data-cs="from" value="${esc(selRange(app).from)}"></div></div>
    <div class="field"><label for="cmp-to">По</label><div class="input-wrap"><input id="cmp-to" type="date" data-cs="to" value="${esc(selRange(app).to)}"></div></div></div>` : ''}
  ${cs.period !== 'day' ? `<div class="row between" style="margin-top:12px"><span class="small muted">Дні поїздок</span><div class="seg" style="min-width:230px" role="group" aria-label="Звідки брати дні поїздок">
    <button type="button" data-act="source" data-src="calendar" aria-pressed="${cs.source === 'calendar'}">З календаря</button>
    <button type="button" data-act="source" data-src="manual" aria-pressed="${cs.source === 'manual'}">Вручну</button></div></div>` : ''}
  ${cs.source === 'manual' && cs.period !== 'day' ? `<div class="grid-2" style="margin-top:12px">
    ${numFieldCs('manualDays', 'Днів поїздок', cs.manualDays, 'дн.', 0, 366, true)}
    ${numFieldCs('awayWeeks', 'Тижнів поза Дніпром', cs.awayWeeks, 'тиж.', 0, 52, true)}</div>
    <p class="hint">Відсутність рахується з кінця періоду, поїздки — у ваші робочі дні.</p>` : ''}

  <h2 class="section-title" id="cmp-modes">Режими<small id="cmp-modes-sub"></small></h2>
  <div class="card"><div id="cmp-bars"></div></div>

  <h2 class="section-title" id="cmp-calc">Фінансовий калькулятор<small>Зміни тут зберігаються в налаштуваннях і одразу перераховують усе.</small></h2>
  <div class="card">
    <div class="card-title">Поїздки</div>
    <div class="grid-2" style="margin-top:10px">
      ${numField({ bind: 'trip.passengers', label: 'Пасажирів', value: s.trip.passengers, unit: 'ос.', min: 1, max: 8, int: true, id: 'c-pass' })}
      ${numField({ bind: 'car.distanceKm', label: 'Відстань в один бік', value: s.car.distanceKm, unit: 'км', max: 500, assumption: true, id: 'c-km' })}
      ${numFieldCs('taxiTrips', 'Поїздок таксі за період', cs.taxiTrips, 'шт.', 0, 200, true)}
    </div>
    ${selectField({ bind: 'transit.ecoRoute', label: 'Маршрут ECO (визначає пересадки)', value: s.transit.ecoRoute || 'auto', options: routeOpts, id: 'c-eco' })}
  </div>
  <div class="card">
    <div class="card-title">Автомобіль</div>
    <div class="grid-2" style="margin-top:10px">
      ${numField({ bind: 'car.consumption', label: 'Витрата', value: s.car.consumption, unit: 'л/100', max: 40, assumption: true, id: 'c-cons' })}
      ${numField({ bind: 'car.fuelPrice', label: 'Ціна бензину', value: s.car.fuelPrice, unit: '₴/л', max: 1000, assumption: true, id: 'c-fuel' })}
      ${numField({ bind: 'car.wearPerKm', label: 'Знос', value: s.car.wearPerKm, unit: '₴/км', max: 100, assumption: true, id: 'c-wear' })}
      ${numField({ bind: 'car.parkingPerHour', label: 'Паркування', value: s.car.parkingPerHour, unit: '₴/год', max: 2000, assumption: true, id: 'c-park' })}
      ${numField({ bind: 'car.parkingHours', label: 'Годин паркування', value: s.car.parkingHours, unit: 'год', max: 24, id: 'c-hours' })}
    </div>
  </div>
  <div class="card">
    <div class="card-title">Таксі та громадський транспорт</div>
    <div class="grid-2" style="margin-top:10px">
      ${numField({ bind: 'taxi.price', label: 'Таксі в один бік', value: s.taxi.price, unit: '₴', max: 20000, assumption: true, id: 'c-taxi' })}
      ${numField({ bind: 'transit.fares.tram', label: 'Квиток (трамвай)', value: s.transit.fares.tram, unit: '₴', max: 1000, assumption: true, id: 'c-tram' })}
      ${numField({ bind: 'transit.passes.weeklyPrice', label: 'Тижневий проїзний', value: s.transit.passes.weeklyPrice, unit: '₴/ос.', max: 20000, assumption: true, id: 'c-week' })}
      ${numField({ bind: 'transit.passes.monthlyPrice', label: 'Місячний проїзний', value: s.transit.passes.monthlyPrice, unit: '₴/ос.', max: 50000, assumption: true, id: 'c-month' })}
    </div>
    <p class="hint">Ціни тролейбуса, метро, маршруток, а також маршрути й пересадки — у «Налаштуваннях».</p>
  </div>
  <div id="cmp-calc-out"></div>

  <h2 class="section-title" id="cmp-charts">Графіки</h2>
  <div class="card"><div class="card-title">Структура витрат авто</div><p class="card-sub" id="cmp-car-sub"></p><div id="cmp-car" style="margin-top:12px"></div></div>
  <div class="card"><div class="card-title">Матриця «Комфорт / Вартість»</div><p class="card-sub">Один день туди-назад у звичайному стані.</p><div id="cmp-scatter" style="margin-top:8px"></div></div>
  <div class="card"><div class="card-title">Теплова карта витрат за місяць</div><p class="card-sub" id="cmp-heat-sub"></p><div id="cmp-heat" style="margin-top:12px"></div></div>
  <div class="card"><div class="row between"><div><div class="card-title">Накопичена економія</div><p class="card-sub">Факт і прогноз — у вкладці «Економія».</p></div><button type="button" class="btn small" data-act="go" data-tab="savings">Відкрити</button></div></div>

  <h2 class="section-title" id="cmp-whatif">Що, якщо?<small>Сценарій не змінює ваші налаштування. Порівняння — за ${esc(periodLabelMonth(app))}.</small></h2>
  <div class="card">
    <div class="chips">${tog('freeParking', 'Паркування безкоштовне')}${tog('onePassenger', 'Один пасажир замість двох')}${tog('noPasses', 'Без проїзних')}${tog('passOwned', 'Проїзний уже придбано')}${tog('traffic', 'Сильні затори')}${tog('winter', 'Зимова витрата пального')}</div>
    <div style="margin-top:10px">
      ${slider('fuelPct', 'Ціна бензину', -30, 60, 5)}
      ${slider('taxiPct', 'Ціна таксі', -50, 50, 5)}
      ${slider('ptSlowPct', 'Час у громадському транспорті', 0, 100, 5)}
      ${slider('daysCut', 'Робочих днів менше на', 0, 15, 1)}
    </div>
    <div class="row wrap" style="margin-top:8px"><button type="button" class="btn small" data-act="sc-preset">Бензин +20 %</button><button type="button" class="btn small ghost" data-act="sc-reset">Скинути сценарій</button></div>
  </div>
  <div id="cmp-whatif-out"></div>
  <div class="card">
    <div class="card-title">Де один транспорт стає вигіднішим за інший</div>
    <div class="chips scroll" style="margin:10px calc(-1 * var(--gutter)) 6px">${Object.entries(E.BREAKEVEN_VARS).map(([k, v]) => `<button type="button" class="chip" data-act="be-var" data-v="${k}" aria-pressed="${cs.beVar === k}">${esc(v.label)}</button>`).join('')}</div>
    <div id="cmp-be-legend"></div><div id="cmp-be"></div><ul class="insights" id="cmp-be-text" style="margin-top:10px"></ul>
  </div>

  <h2 class="section-title" id="cmp-tips">Порадник ZERO<small>Поради рахуються з ваших налаштувань і календаря.</small></h2>
  <div class="card"><ul class="insights" id="cmp-tips-list"></ul></div>`;
}

const signedNum = (v) => `${v > 0.5 ? '+' : v < -0.5 ? '−' : ''}${E.fmtNum(Math.abs(v))}`;

function periodLabelMonth(app) { const d = E.parseDate(baseMonth(app).from); return `${MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()}`; }

function numFieldCs(key, label, value, unit, min, max, int) {
  return `<div class="field"><label for="cs-${key}">${esc(label)}</label><div class="input-wrap"><input id="cs-${key}" type="text" inputmode="numeric" data-cs="${key}" data-kind="num" data-min="${min}" data-max="${max}" data-int="${int ? 1 : 0}" value="${esc(fmtInput(value))}"><span class="unit">${esc(unit)}</span></div></div>`;
}

function scLabel(k, v) {
  if (k === 'fuelPct' || k === 'taxiPct') return v === 0 ? 'без змін' : `${v > 0 ? '+' : '−'}${Math.abs(v)} %`;
  if (k === 'ptSlowPct') return v === 0 ? 'без змін' : `+${v} %`;
  if (k === 'daysCut') return v === 0 ? 'без змін' : `${v} ${E.plural(v, ['день', 'дні', 'днів'])}`;
  return String(v);
}

function refreshOutputs(app, root) {
  const m = compute(app);
  lastModel = m;
  const s = app.s;
  const rep = m.sel;
  const pl = periodLabel(app);

  // Режими (гістограма вартості)
  const sub = root.querySelector('#cmp-modes-sub');
  if (cs.period === 'day') {
    sub.textContent = 'Один день туди-назад у звичайному стані. Натисніть на режим, щоб побачити деталі за місяць.';
    const items = MODE_ORDER.filter((k) => m.dayRec.modes[k]).map((k) => {
      const o = m.dayRec.modes[k];
      return { key: k, label: E.MODE_INFO[k].code, sub: o.title, value: o.cost.decision, cls: `s-${k}`, badge: k !== 'zero' && m.dayRec.best && o.key === m.dayRec.best.key ? 'ZERO' : '' };
    }).filter((it) => it.key !== 'zero' || !MODE_ORDER.slice(0, 5).some((k) => m.dayRec.modes[k]?.key === m.dayRec.best?.key));
    root.querySelector('#cmp-bars').innerHTML = barsHTML(items.sort((a, b) => a.value - b.value));
  } else {
    sub.textContent = `${rangeText(m.range)}: ${rep.plan.tripDays} ${E.plural(rep.plan.tripDays, ['день', 'дні', 'днів'])} поїздок${cs.source === 'manual' ? ' (вручну)' : ' за календарем'}. Ваш план: ${E.fmtUAH(rep.plan.totals.decision)}.`;
    const zeroKey = m.dayRec.best?.key;
    const items = MODE_ORDER.map((k) => {
      const r = rep.modes[k];
      const o = m.dayRec.modes[k];
      return { key: k, label: E.MODE_INFO[k].code, sub: o ? o.title : 'недоступно', value: r.totals.decision, cls: `s-${k}`, badge: k !== 'zero' && o && o.key === zeroKey ? 'ZERO' : '' };
    }).filter((it) => it.key !== 'zero' || !MODE_ORDER.slice(0, 5).some((k) => m.dayRec.modes[k]?.key === zeroKey));
    root.querySelector('#cmp-bars').innerHTML = barsHTML(items.sort((a, b) => a.value - b.value)) + (rep.plan.tripDays === 0 ? '<p class="small muted" style="margin-top:8px">У цьому періоді немає днів поїздок — перевірте календар або увімкніть «Вручну».</p>' : '');
  }

  // Калькулятор: таблиці
  const P = s.trip.passengers;
  const dayOf = (k) => m.dayRec.modes[k];
  const rowsA = MODE_ORDER.filter((k) => k !== 'zero' && dayOf(k)).map((k) => {
    const d = dayOf(k).cost.decision;
    return `<tr><th scope="row">${E.MODE_INFO[k].code}</th><td>${E.fmtNum(d / 2)}</td><td>${E.fmtNum(d)}</td><td>${E.fmtNum(m.week.modes[k].totals.decision)}</td><td class="hl">${E.fmtNum(m.month.modes[k].totals.decision)}</td></tr>`;
  }).join('');
  const per = rep || m.month;
  const rowsB = MODE_ORDER.filter((k) => k !== 'zero').map((k) => {
    const r = per.modes[k];
    return `<tr><th scope="row">${E.MODE_INFO[k].code}</th><td class="hl">${E.fmtNum(r.totals.decision)}</td><td class="${r.vsCar >= 0 ? 'good' : 'bad'}">${signedNum(r.vsCar)}</td><td class="${r.vsTaxi >= 0 ? 'good' : 'bad'}">${signedNum(r.vsTaxi)}</td><td>${E.fmtNum(r.totals.minutes / 60, 1)}</td></tr>`;
  }).join('');
  const auto = per.modes.auto.totals;
  const eco = per.modes.eco;
  const months = Math.max(1, E.dayDiff(per.plan.from, per.plan.to) + 1) / 30.4375;
  const fixed = s.car.fixedMonthly * months;
  // ECO + N поїздок таксі: таксі замінює відрізки ГТ; заощаджені квитки — лише якщо проїзні не купуються.
  let mixed = '';
  if (cs.taxiTrips > 0 && dayOf('eco') && dayOf('taxi')) {
    const leg = dayOf('eco').there;
    const covers = s.transit.passes.covers;
    const legSingles = leg.fares.reduce((a, f) => a + f.fare, 0) * P;
    const legUncov = leg.fares.filter((f) => !covers.includes(f.mode)).reduce((a, f) => a + f.fare, 0) * P;
    const saved = eco.purchases.length ? legUncov : legSingles;
    const taxiLeg = dayOf('taxi').there.cost;
    const total = eco.totals.decision + cs.taxiTrips * (taxiLeg - saved);
    mixed = `<div class="kv"><span>ECO + ${cs.taxiTrips} ${E.plural(cs.taxiTrips, ['поїздка', 'поїздки', 'поїздок'])} таксі</span><b>${E.fmtUAH(total)}</b></div>
      <div class="kv"><span>Таксі «зʼїсть» з економії проти авто</span><b>${E.fmtUAH(total - eco.totals.decision)}</b></div>`;
  }
  root.querySelector('#cmp-calc-out').innerHTML = `
    <div class="card"><div class="card-title">Вартість за режимами</div><p class="card-sub">День — один день туди-назад, разові квитки. Тиждень — ${s.trip.workDays.length} робочих днів. Місяць — ${esc(periodLabelMonth(app))}${cs.source === 'manual' ? ', вручну' : ', за календарем'}.</p>
      <div class="table-wrap" style="margin-top:8px"><table class="table"><thead><tr><th>₴</th><th>Поїздка*</th><th>День</th><th>Тиждень</th><th>Місяць</th></tr></thead><tbody>${rowsA}</tbody></table></div>
      <p class="hint">* одна поїздка в один бік, у середньому: денна вартість ÷ 2. Проїзні враховано як куплені на строк, а не як доплату до кожної поїздки.</p></div>
    <div class="card"><div class="card-title">Підсумок за ${esc(pl)}</div><p class="card-sub">${esc(rangeText(cs.period === 'day' ? m.mRange : m.range))}${cs.period === 'day' ? ' (місяць)' : ''}. Години — час у дорозі.</p>
      <div class="table-wrap" style="margin-top:8px"><table class="table"><thead><tr><th>₴</th><th>Разом</th><th>Проти авто</th><th>Проти таксі</th><th>Год</th></tr></thead><tbody>${rowsB}</tbody></table></div>
      <div style="margin-top:10px">
        <div class="kv"><span>ECO: економія на одного пасажира</span><b class="good">${signed(eco.vsCarPerPassenger)}</b></div>
        <div class="kv"><span>AUTO швидше за ECO на</span><b>${E.fmtNum(Math.max(0, per.modes.auto.hoursVsEco), 1)} год</b></div>
        ${mixed}
      </div></div>
    <div class="card"><div class="card-title">Авто: гранична вартість і володіння</div><p class="card-sub">Авто одне на всіх: пальне й паркування не множаться на пасажирів.</p>
      <div style="margin-top:8px">
        <div class="kv"><span>Пальне (${E.fmtNum(auto.liters, 1)} л)</span><b>${E.fmtUAH(auto.fuel, 2)}</b></div>
        <div class="kv"><span>Паркування</span><b>${E.fmtUAH(auto.parking, 2)}</b></div>
        <div class="kv"><span>Гроші з кишені</span><b>${E.fmtUAH(auto.cash, 2)}</b></div>
        <div class="kv"><span>Знос і амортизація (${E.fmtNum(s.car.wearPerKm, 2)} ₴/км)</span><b>${E.fmtUAH(auto.wear, 2)}</b></div>
        <div class="kv total"><span>Гранична вартість поїздок</span><b>${E.fmtUAH(auto.economic, 2)}</b></div>
        <div class="kv"><span>Фіксовані витрати за період</span><b>${E.fmtUAH(fixed, 2)}</b></div>
        <div class="kv total"><span>Повна вартість володіння</span><b>${E.fmtUAH(auto.economic + fixed, 2)}</b></div>
      </div>
      <p class="hint">Фіксовані витрати (страховка, ТО, стоянка біля дому) не залежать від поїздок, тому в порівнянні режимів їх не враховано. ${s.car.fixedMonthly > 0 ? '' : 'Зараз вони дорівнюють 0 — додайте їх у «Налаштуваннях → Авто».'}</p></div>
    ${per.plan.tripDays > 0 ? `<div class="card"><div class="card-title">Проїзні за вашим планом</div>
      <div class="kv"><span>Лише разові квитки</span><b>${E.fmtUAH(per.plan.strategies.singles)}</b></div>
      <div class="kv"><span>Тижневі там, де вигідно</span><b>${E.fmtUAH(per.plan.strategies.weekly)}</b></div>
      <div class="kv"><span>Місячні там, де вигідно</span><b>${E.fmtUAH(per.plan.strategies.monthly)}</b></div>
      <div class="kv total"><span>Оптимальна комбінація</span><b>${E.fmtUAH(per.plan.strategies.optimal)}</b></div>
      ${per.plan.ownedSunk > 0 ? `<div class="kv"><span>Уже сплачено за проїзні</span><b>${E.fmtUAH(per.plan.ownedSunk)}</b></div>` : ''}
      ${purchasesHTML(per.plan.purchases)}</div>` : ''}`;

  // Порадник
  root.querySelector('#cmp-tips-list').innerHTML = app.insights().map((t) => `<li class="insight" data-tone="${t.tone}">${icon(TONE_ICON[t.tone])}<span>${esc(t.text)}</span></li>`).join('') || '<li class="insight">Порад поки немає.</li>';

  drawCharts(app, root, m);
  refreshWhatIf(app, root);
}

function drawCharts(app, root, m) {
  const s = app.s;
  const per = m.sel || m.month;
  const a = per.modes.auto.totals;
  const months = Math.max(1, E.dayDiff(per.plan.from, per.plan.to) + 1) / 30.4375;
  const parts = [
    { label: 'Пальне', value: a.fuel, cls: 's-fuel' },
    { label: 'Знос і амортизація', value: a.wear, cls: 's-wear' },
    { label: 'Паркування', value: a.parking, cls: 's-park' },
  ];
  if (s.car.fixedMonthly > 0) parts.push({ label: 'Фіксовані (не залежать від поїздок)', value: s.car.fixedMonthly * months, cls: 's-fixed' });
  root.querySelector('#cmp-car-sub').textContent = `Якби всі ${per.modes.auto.tripDays} днів поїздок були на авто.`;
  root.querySelector('#cmp-car').innerHTML = segmentedHTML(parts, { fmt: (v) => E.fmtUAH(v), ariaLabel: 'Структура витрат авто' });

  const pts = ['eco', 'comfort', 'auto', 'taxi', 'flex'].filter((k) => m.dayRec.modes[k]).map((k) => ({ label: E.MODE_INFO[k].code, cost: m.dayRec.modes[k].cost.decision, comfort: m.dayRec.modes[k].comfort, cls: `s-${k}` }));
  scatterChart(root.querySelector('#cmp-scatter'), pts);

  const mm = m.month.plan;
  const first = E.isoDow(mm.from);
  root.querySelector('#cmp-heat-sub').textContent = `${periodLabelMonth(app)}: за вашим планом, ${E.fmtUAH(mm.totals.decision)} разом. Проїзні розподілено між днями, які вони покривають.`;
  root.querySelector('#cmp-heat').innerHTML = miniHeatHTML(mm.days.map((d) => ({ date: d.date, value: d.decision || 0, trip: d.trip, type: d.type })), { firstDow: first });
}

function refreshWhatIf(app, root) {
  const out = root.querySelector('#cmp-whatif-out');
  if (!out) return;
  const s = app.s;
  const sc = E.applyScenario(s, cs.scenario);
  const mR = baseMonth(app);
  const base = lastModel?.month || E.compareModes(s, app.cal, app.hist, optFor(app, mR));
  const scen = E.compareModes(sc.settings, app.cal, app.hist, { ...optFor(app, mR), ...sc.periodOpt });
  const stBase = { ...E.DEFAULT_STATE };
  const recBase = E.recommend(s, { state: stBase });
  const recSc = E.recommend(sc.settings, { state: { ...stBase, ...(cs.scenario.traffic ? { traffic: true } : {}) }, passPersons: cs.scenario.passOwned ? sc.settings.trip.passengers : 0 });
  const rows = ['eco', 'comfort', 'auto', 'taxi', 'flex'].map((k) => {
    const b = base.modes[k].totals.decision, n = scen.modes[k].totals.decision, d = n - b;
    return `<tr><th scope="row">${E.MODE_INFO[k].code}</th><td>${E.fmtNum(b)}</td><td class="hl">${E.fmtNum(n)}</td><td class="${d > 0.5 ? 'bad' : d < -0.5 ? 'good' : ''}">${signedNum(d)}</td></tr>`;
  }).join('');
  const changed = Object.entries(cs.scenario).some(([k, v]) => v !== E.SCENARIO_DEFAULT[k]);
  out.innerHTML = `<div class="card">
    <div class="card-title">${changed ? 'Результат сценарію' : 'Оберіть зміну вище'}</div>
    <p class="card-sub">Місяць: ${scen.plan.tripDays} ${E.plural(scen.plan.tripDays, ['день', 'дні', 'днів'])} поїздок${cs.scenario.passOwned ? `, уже сплачено за проїзні ${E.fmtUAH(scen.modes.eco.ownedSunk)}` : ''}.</p>
    <div class="table-wrap" style="margin-top:8px"><table class="table"><thead><tr><th>₴ за місяць</th><th>Зараз</th><th>Сценарій</th><th>Різниця</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="kv" style="margin-top:6px"><span>ZERO сьогодні обрав би</span><b>${esc(recBase.best?.title || '—')}${recSc.best && recBase.best && recSc.best.key !== recBase.best.key ? ` → ${esc(recSc.best.title)}` : ''}</b></div>
  </div>`;

  // Точки беззбитковості
  const be = E.breakEven(sc.settings, app.cal, app.hist, { variable: cs.beVar, ...mR, periodOpt: cs.beVar === 'days' ? { ...sc.periodOpt, daysCut: 0 } : sc.periodOpt });
  const series = be.lines.map((ln) => ({ key: ln.key, label: ln.label, cls: `s-${ln.mode}`, dashed: ln.dashed, values: ln.values }));
  const lbl = Object.fromEntries(be.lines.map((l) => [l.key, l.label]));
  // Для «днів поїздок» показуємо головне: коли проїзний окупається, і де міняються місцями інші режими.
  const meaningful = be.crossings.filter((c) => c.x > be.meta.min + 1e-6
    && !(cs.beVar === 'days' && [c.a, c.b].includes('eco-monthly') && ![c.a, c.b].includes('eco-singles')));
  const markers = meaningful.slice(0, 4).map((c) => ({ x: c.x, y: c.y, label: `≈${E.fmtNum(c.x, c.x % 1 ? 1 : 0)}` }));
  root.querySelector('#cmp-be-legend').innerHTML = legendHTML(series.map((x) => ({ label: x.label, cls: x.cls, dashed: x.dashed })));
  const box = root.querySelector('#cmp-be');
  lineChart(box, series, {
    xs: be.xs,
    xLabel: (i, full) => `${full ? `${be.meta.label}: ` : ''}${E.fmtNum(be.xs[i], be.meta.step % 1 ? 1 : 0)} ${be.meta.unit}`,
    markers, height: 220, minSpan: 100, aria: `Вартість за місяць залежно від: ${be.meta.label}`,
  });
  const txt = meaningful.slice(0, 5).map((c) => {
    const A = lbl[c.cheaperAfter], B = lbl[c.cheaperAfter === c.a ? c.b : c.a];
    let t;
    if (cs.beVar === 'days') t = `З ${Math.floor(c.x) + 1}-го дня поїздок на місяць «${A}» вигідніше за «${B}».`;
    else if (cs.beVar === 'fuel') t = `Якщо бензин дорожчий за ${E.fmtNum(c.x, 1)} ₴/л, «${A}» вигідніше за «${B}».`;
    else if (cs.beVar === 'parking') t = `Якщо паркування довше ${E.fmtNum(c.x, 1)} год, «${A}» вигідніше за «${B}».`;
    else if (cs.beVar === 'taxi') t = `Якщо таксі дорожче за ${E.fmtNum(c.x, 0)} ₴ в один бік, «${A}» вигідніше за «${B}».`;
    else t = `Якщо пасажирів більше ${E.fmtNum(c.x, 1)}, «${A}» вигідніше за «${B}».`;
    return `<li class="insight" data-tone="money">${icon('bolt')}<span>${esc(t)}</span></li>`;
  });
  root.querySelector('#cmp-be-text').innerHTML = txt.join('') || `<li class="insight" data-tone="info">${icon('info')}<span>У цьому діапазоні лінії не перетинаються: порядок вигідності не змінюється.</span></li>`;
}

function openDetail(app, mode) {
  const m = lastModel || compute(app);
  const rep = (m.sel || m.month).modes[mode];
  const isDay = cs.period === 'day';
  openModeDetail(app, {
    mode, report: rep,
    label: isDay ? periodLabelMonth(app) : periodLabel(app),
    rangeText: rangeText(isDay ? m.mRange : m.range),
    includeWear: app.s.car.includeWear,
  });
}
