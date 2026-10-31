// MOBILITY ZERO — sheets.js
// Спільні нижні аркуші: ранковий вибір, альтернативи, маршрут, запис поїздки, купівля проїзного, деталі режиму.

import * as E from './engine.js';
import { esc, icon, openSheet, closeSheet, toast, numField, humanDate, shortDate, readField, setFieldMsg, fmtInput } from './ui.js';
import { scoreRing } from './charts.js';
import { uid } from './store.js';

export const NAMED = ['eco', 'comfort', 'auto', 'taxi', 'flex'];
export const MODE_ORDER = ['eco', 'comfort', 'auto', 'taxi', 'flex', 'zero'];

export function modeOf(rec, opt) {
  if (!opt) return null;
  for (const m of NAMED) if (rec.modes[m] && rec.modes[m].key === opt.key) return m;
  return 'zero';
}
export const badge = (mode) => `<span class="mode-badge s-${mode}">${esc(E.MODE_INFO[mode]?.code || mode)}</span>`;

export function legsLine(opt, roundTrip = true) {
  if (!opt) return '';
  if (!opt.back) return `В один бік: <b>${esc(opt.there.label)}</b>`;
  if (opt.there.label === opt.back.label) return `Туди й назад: <b>${esc(opt.there.label)}</b>`;
  return `Туди: <b>${esc(opt.there.label)}</b>, назад: <b>${esc(opt.back.label)}</b>`;
}

export function navButtons(app, opt) {
  const kind = E.legNavKind(opt?.there);
  const l = E.navLinks(app.s, kind);
  const a = (href, label, ic) => `<a class="btn small" href="${esc(href)}" target="_blank" rel="noopener">${icon(ic)}${esc(label)}</a>`;
  return `<div class="nav-links">
    ${a(l.google, 'Google Maps', 'map')}
    ${a(l.apple, 'Apple Maps', 'map')}
    ${kind === 'transit' ? a(l.dtransport, 'D-transport', 'route') : a(l.waze, 'Waze', 'route')}
    ${kind === 'transit' ? a(E.navLinks(app.s, 'driving').waze, 'Waze', 'route') : a(l.dtransport, 'D-transport', 'route')}
  </div>`;
}

/* ───────── Ранковий вибір ───────── */
const STATE_CHIPS = [
  ['tired', 'Втомився'], ['hurry', 'Поспішаю'], ['badWeather', 'Погана погода'], ['luggage', 'Є важкий багаж'],
  ['traffic', 'Сильні затори'], ['crowded', 'Тиснява в транспорті'],
];

export function openMorning(app) {
  openSheet({
    title: 'Як краще їхати сьогодні?',
    render: () => morningHTML(app),
    onAction: (act, el, ev, ctl) => {
      if (act === 'flag') {
        const k = el.dataset.flag;
        const cur = app.todayFlags();
        if (k === 'normal') app.setTodayFlags(Object.fromEntries(STATE_CHIPS.map(([key]) => [key, false])));
        else app.setTodayFlags({ [k]: !cur[k] });
        ctl.refresh();
      } else if (act === 'eligible') {
        app.setTodayEligible(!app.todayEligible());
        ctl.refresh();
      } else if (act === 'log') {
        const rec = app.rec();
        openLogTrip(app, { date: app.today(), mode: modeOf(rec, rec.best) });
      } else if (act === 'alts') openAlternatives(app);
    },
  });
}

function morningHTML(app) {
  const flags = app.todayFlags();
  const rec = app.rec();
  const best = rec.best;
  const anyState = STATE_CHIPS.some(([k]) => flags[k]);
  const chip = (k, label, on, act = 'flag') => `<button type="button" class="chip" data-act="${act}" data-flag="${k}" aria-pressed="${on}">${esc(label)}</button>`;
  let html = `<p class="muted small">Позначте свій стан. Погоду, затори й тисняву вводите ви — застосунок не бере їх з інтернету. Результат оновлюється одразу.</p>
  <div class="state-grid">
    ${chip('normal', 'Нормальний стан', !anyState)}
    ${STATE_CHIPS.map(([k, l]) => chip(k, l, !!flags[k])).join('')}
    ${chip('roundTrip', 'Потрібна зворотна поїздка', flags.roundTrip !== false)}
    ${app.s.benefit.enabled ? chip('eligible', 'Поїздка відповідає умовам пільги', app.todayEligible(), 'eligible') : ''}
  </div>`;
  if (!best) return `${html}<div class="empty"><b>Немає доступних варіантів</b>Додайте маршрут громадського транспорту або перевірте налаштування.</div>`;
  const mode = modeOf(rec, best);
  const dep = E.departureFor(app.s, best);
  const ex = rec.explanation;
  const rt = flags.roundTrip !== false;
  html += `<div class="result-hero">
    <div class="row between"><div class="row wrap">${badge(mode)}${best.unconfirmed ? '<span class="tag-approx">орієнтовно</span>' : ''}</div>
      <div class="ring-wrap">${scoreRing(best.total, { size: 52, stroke: 4 })}</div></div>
    <h3>${esc(best.title)}</h3>
    <p class="pass-legs">${legsLine(best, rt)}</p>
    <div class="pass-metrics">
      <div class="metric"><small>Вартість ${rt ? 'за день' : 'поїздки'}</small><b>${E.fmtUAH(best.cost.decision)}</b></div>
      <div class="metric"><small>Час в один бік</small><b>${E.fmtMin(best.oneWay)}</b></div>
      <div class="metric"><small>Вихід о</small><b>${dep ? dep.time : '—'}</b></div>
    </div>
    ${dep ? `<p class="small muted" style="margin-top:8px">Прибуття до ${dep.arrive}, запас ${dep.buffer} хв на непередбачене.</p>` : ''}
  </div>
  <div class="card flat">
    <div class="card-title">Чому саме так</div>
    <ul class="insights" style="margin-top:8px">
      ${ex.reasons.map((r) => `<li class="insight" data-tone="good">${icon('check')}<span>${esc(r.text)}</span></li>`).join('')}
      ${ex.tradeoff ? `<li class="insight" data-tone="info">${icon('info')}<span>${esc(ex.tradeoff)}</span></li>` : ''}
      ${ex.notes.map((n) => `<li class="insight" data-tone="${n.tone}">${icon(n.tone === 'warn' ? 'warn' : 'info')}<span>${esc(n.text)}</span></li>`).join('')}
    </ul>
  </div>`;
  if (rec.alt) {
    const a = rec.alt;
    const dc = a.cost.decision - best.cost.decision, dm = a.minutes - best.minutes;
    html += `<div class="card flat"><div class="card-sub">Найкраща альтернатива</div>
      <div class="row between" style="margin-top:6px"><div><div class="row">${badge(rec.altMode)}<b>${esc(a.title)}</b></div>
      <p class="small muted" style="margin-top:4px">${E.fmtUAH(a.cost.decision)}, ${E.fmtMin(a.oneWay)} в один бік. ${dc >= 1 ? `Дорожче на ${E.fmtGrn(dc)}` : dc <= -1 ? `Дешевше на ${E.fmtGrn(-dc)}` : 'Та сама ціна'}${Math.abs(dm) >= 1 ? `, ${dm > 0 ? 'довше' : 'швидше'} на ${E.fmtMin(Math.abs(dm))} ${rt ? 'за день' : ''}` : ''}.</p></div>
      <div class="rank-score"><b>${Math.round(a.total)}</b><small>балів</small></div></div></div>`;
  }
  html += `<div class="card-title" style="margin-top:18px">Маршрут у навігаторі</div>${navButtons(app, best)}
  <div class="sheet-actions"><button type="button" class="btn primary" data-act="log">${icon('check')}Записати поїздку</button><button type="button" class="btn" data-act="alts">Усі варіанти</button></div>`;
  return html;
}

/* ───────── Альтернативи ───────── */
export function openAlternatives(app) {
  const open = new Set();
  openSheet({
    title: 'Усі варіанти на сьогодні',
    render: () => altsHTML(app, open),
    onAction: (act, el, ev, ctl) => {
      if (act === 'toggle') { const k = el.dataset.key; if (open.has(k)) open.delete(k); else open.add(k); ctl.refresh(); }
      if (act === 'nav') openNav(app);
    },
  });
}

function altsHTML(app, open) {
  const rec = app.rec();
  if (!rec.best) return '<div class="empty"><b>Немає варіантів</b>Перевірте маршрути в налаштуваннях.</div>';
  const items = rec.ranking.map((r) => ({ mode: r.mode, opt: r.opt }));
  if (rec.bestMode === null || !items.some((i) => i.opt.key === rec.best.key)) items.unshift({ mode: 'zero', opt: rec.best });
  items.sort((a, b) => b.opt.total - a.opt.total);
  const w = rec.weights;
  const rt = rec.ctx.state.roundTrip !== false;
  return `<p class="muted small">Оцінка 0–100 — зважена сума чотирьох критеріїв за вашими пріоритетами з урахуванням сьогоднішнього стану. Це порівняння варіантів між собою, а не ймовірність і не прогноз.</p>
  <div class="weights-sum" aria-hidden="true">${E.WEIGHT_KEYS.map((k) => `<span class="w-${k}" style="flex:${w[k].toFixed(3)}"></span>`).join('')}</div>
  <p class="small dim">${E.WEIGHT_KEYS.map((k) => `${E.WEIGHT_LABELS[k]} ${Math.round(w[k] * 100)} %`).join(', ')}</p>
  <ul class="rank">${items.map((it, i) => {
    const o = it.opt;
    const isOpen = open.has(o.key);
    const zeroPick = rec.best && o.key === rec.best.key;
    return `<li class="rank-item${i === 0 ? ' top' : ''}">
      <button type="button" class="rank-btn" data-act="toggle" data-key="${esc(o.key)}" aria-expanded="${isOpen}">
        <span class="rank-pos">${i + 1}</span>
        <span class="rank-main"><b>${esc(E.MODE_INFO[it.mode].code)}${zeroPick ? ' <span class="badge-zero">ZERO обирає</span>' : ''}</b><small>${esc(o.title)}, ${E.fmtUAH(o.cost.decision)}, ${E.fmtMin(o.oneWay)} в один бік</small></span>
        <span class="rank-score"><b>${Math.round(o.total)}</b><small>балів</small></span>
      </button>
      ${isOpen ? `<div class="contrib">
        ${E.WEIGHT_KEYS.map((k) => `<div class="contrib-row"><span>${E.WEIGHT_LABELS[k]}</span><div class="progress"><span class="wfill w-${k}" style="width:${o.scores[k].toFixed(1)}%"></span></div><b>${fmtPts(o.contrib[k])}</b></div>`).join('')}
        <div class="kv"><span>Шлях</span><b>${legsLine(o, rt)}</b></div>
        ${costRows(o)}
        <div class="kv"><span>Час у дорозі ${rt ? 'за день' : ''}</span><b>${E.fmtMin(o.minutes)}</b></div>
        <div class="kv"><span>Пересадок</span><b>${o.transfers}</b></div>
        <div class="kv"><span>Пішки та очікування</span><b>${E.fmtMin(o.outdoor)}</b></div>
        <div class="kv"><span>Комфорт / надійність</span><b>${Math.round(o.comfort)} / ${Math.round(o.reliability)}</b></div>
      </div>` : ''}
    </li>`;
  }).join('')}</ul>
  <details class="more"><summary>Як рахується оцінка</summary>
    <div class="note-box">
      <p><b>Економія</b> і <b>швидкість</b>: найдешевший (найшвидший) варіант отримує 100 балів, інші — пропорційно відставанню. Щоб дрібна різниця не перетворювалась на величезну, розмах шкали не менший за половину максимального значення.</p>
      <p style="margin-top:8px"><b>Комфорт</b>: базовий рівень виду транспорту (метро 68, трамвай 62, тролейбус 58, автобус 50, авто 76, таксі 88) мінус пересадки (−7 кожна), очікування й ходьба (більше в негоду), тиснява, багаж, втома (за кермом −28).</p>
      <p style="margin-top:8px"><b>Надійність</b>: базовий рівень (метро 93, трамвай 80, тролейбус 74, автобус 66, авто 84, таксі 78) мінус пересадки, довгі інтервали, затори, негода, втома за кермом і −10, якщо маршрут ще не перевірено. Ранкова поїздка важить 65 %, вечірня 35 %.</p>
      <p style="margin-top:8px"><b>Стан</b>: «Поспішаю» додає 20 п.п. швидкості й 12 п.п. надійності, «Втомився» — 18 п.п. комфорту, багаж — 8, негода — 6. Після цього ваги знову нормуються до 100 %.</p>
    </div>
  </details>
  <button type="button" class="btn block" data-act="nav">${icon('map')}Відкрити маршрут у навігаторі</button>`;
}
const fmtPts = (v) => `${E.fmtNum(v, 1)}`;

export function costRows(o) {
  const c = o.cost;
  let h = '';
  if (c.transit > 0 || o.legs.some((l) => l.kind === 'route')) h += `<div class="kv"><span>Квитки ГТ</span><b>${E.fmtUAH(c.transit, 2)}</b></div>`;
  if (c.taxi > 0) h += `<div class="kv"><span>Таксі</span><b>${E.fmtUAH(c.taxi, 2)}</b></div>`;
  if (o.isCar) {
    h += `<div class="kv"><span>Пальне (${E.fmtNum(c.liters, 2)} л)</span><b>${E.fmtUAH(c.fuel, 2)}</b></div>`;
    h += `<div class="kv"><span>Паркування</span><b>${E.fmtUAH(c.parking, 2)}</b></div>`;
    h += `<div class="kv"><span>Знос і амортизація</span><b>${E.fmtUAH(c.wear, 2)}</b></div>`;
    h += `<div class="kv"><span>Гроші з кишені</span><b>${E.fmtUAH(c.cash, 2)}</b></div>`;
  }
  h += `<div class="kv total"><span>Разом для рішення</span><b>${E.fmtUAH(c.decision, 2)}</b></div>`;
  return h;
}

/* ───────── Навігація ───────── */
export function openNav(app) {
  openSheet({
    title: 'Маршрут у навігаторі',
    render: () => {
      const rec = app.rec();
      const { from, to } = E.routeEnds(app.s);
      return `<div class="kv"><span>Звідки</span><b>${esc(from.address)}</b></div>
      <div class="kv"><span>Куди</span><b>${esc(to.address)}</b></div>
      ${navButtons(app, rec.best)}
      <p class="note-box">Відкриється зовнішній застосунок. Живих даних про рух, затори чи розклади MOBILITY ZERO не отримує: час у розрахунках — ваші орієнтовні значення з налаштувань. D-transport відкривається через App Store, бо офіційної схеми посилань на конкретний маршрут у нього немає.</p>
      ${!E.parseCoords(from.coords) || !E.parseCoords(to.coords) ? '<div class="callout warn">' + icon('warn') + '<span>Якщо карта знаходить адресу під іншою назвою, вставте точні координати точки в «Налаштуваннях → Маршрут». Тоді навігатори відкриватимуть саме її.</span></div>' : ''}`;
    },
  });
}

/* ───────── Запис фактичної поїздки ───────── */
const TRIP_MODES = [...NAMED, 'other'];
const TRIP_LABEL = { eco: 'ECO — ГТ', comfort: 'COMFORT — ГТ і таксі', auto: 'AUTO — авто', taxi: 'TAXI — таксі', flex: 'FLEX — своя', other: 'Інше' };

function plannedFor(app, date, mode) {
  const s = app.s;
  const ctx = { state: { ...E.DEFAULT_STATE }, eligible: E.resolveEligible(date, s, app.cal), passPersons: E.passPersonsOn(date, app.hist, s.trip.passengers) };
  const rec = E.recommend(s, ctx);
  const opt = mode === 'other' ? null : rec.modes[mode];
  const car = E.carCosts(s, E.makeCtx(), 2);
  return { opt, car, title: opt ? opt.title : 'Інше' };
}

export function openLogTrip(app, { date, mode = 'eco' } = {}) {
  const f = { date: date || app.today(), mode: TRIP_MODES.includes(mode) ? mode : 'eco', cost: 0, minutes: 0, fromBank: mode === 'taxi', note: '', touched: false };
  const prefill = () => {
    const p = plannedFor(app, f.date, f.mode);
    if (!f.touched) { f.cost = p.opt ? Math.round(p.opt.cost.cash * 100) / 100 : 0; f.minutes = p.opt ? Math.round(p.opt.minutes) : 0; }
    return p;
  };
  prefill();
  openSheet({
    title: 'Записати поїздку',
    render: () => {
      const p = plannedFor(app, f.date, f.mode);
      const wear = f.mode === 'auto' ? p.car.wear : 0;
      const base = app.s.bank.baseline === 'carCash' ? p.car.cash : p.car.economic;
      const spentCmp = app.s.bank.baseline === 'carCash' ? f.cost : f.cost + wear;
      const sav = base - spentCmp;
      return `<div class="grid-2">
        <div class="field"><label for="lt-date">Дата</label><div class="input-wrap"><input id="lt-date" type="date" data-bind="f.date" data-kind="text" value="${esc(f.date)}"></div></div>
        <div class="field"><label for="lt-mode">Як їхали</label><div class="input-wrap select-wrap"><select id="lt-mode" data-bind="f.mode" data-kind="select">${TRIP_MODES.map((m) => `<option value="${m}" ${m === f.mode ? 'selected' : ''}>${esc(TRIP_LABEL[m])}</option>`).join('')}</select>${icon('down', 'select-ico')}</div></div>
      </div>
      ${p.opt ? `<p class="small muted">За планом: ${esc(p.title)}, ${E.fmtUAH(p.opt.cost.cash, 2)} готівкою, ${E.fmtMin(p.opt.minutes)} у дорозі.</p>` : ''}
      <div class="grid-2">
        ${numField({ bind: 'f.cost', label: 'Сплачено фактично', value: f.cost, unit: '₴', max: 100000, id: 'lt-cost' })}
        ${numField({ bind: 'f.minutes', label: 'Час у дорозі за день', value: f.minutes, unit: 'хв', max: 1440, int: true, id: 'lt-min' })}
      </div>
      ${f.mode === 'auto' ? `<p class="hint">До сплаченого автоматично додається знос ${E.fmtUAH(wear, 2)} — так порівняння з авто чесне.</p>` : ''}
      <div class="switch-row"><label for="lt-bank"><span>Оплатити з банку комфорту</span><small>Вартість спишеться з бюджету комфорту й не піде в економію.</small></label><input id="lt-bank" class="switch" type="checkbox" role="switch" data-bind="f.fromBank" data-kind="bool" ${f.fromBank ? 'checked' : ''}></div>
      <div class="field"><label for="lt-note">Нотатка</label><div class="input-wrap"><input id="lt-note" type="text" maxlength="200" data-bind="f.note" data-kind="text" value="${esc(f.note)}" placeholder="Напр., дощ, їхали з речами"></div></div>
      <div class="callout">${icon('info')}<span>${f.fromBank ? `Буде списано з банку комфорту: <b>${E.fmtUAH(f.cost, 2)}</b>.` : `Авто того дня коштувало б ${E.fmtUAH(base, 2)} (${app.s.bank.baseline === 'carCash' ? 'лише готівка' : 'із зносом'}). Фактична економія: <b class="${sav >= 0 ? 'good' : 'bad'}">${sav >= 0 ? '+' : '−'}${E.fmtUAH(Math.abs(sav), 2)}</b>.`}</span></div>
      <div class="sheet-actions"><button type="button" class="btn primary" data-act="save">${icon('check')}Зберегти поїздку</button><button type="button" class="btn" data-act="cancel">Скасувати</button></div>`;
    },
    onChange: (el, ev, ctl) => {
      const key = el.dataset.bind?.replace(/^f\./, '');
      if (!key) return;
      const r = readField(el, f[key]);
      if (!r) return;
      if (key === 'date' && !E.isDateStr(r.value)) { toast('Вкажіть коректну дату'); return; }
      f[key] = r.value;
      if (key === 'cost' || key === 'minutes') { f.touched = true; if (r.corrected) setFieldMsg(el, `Виправлено до ${fmtInput(r.value)}`); }
      if (key === 'mode') { f.touched = false; f.fromBank = f.mode === 'taxi'; }
      if (key === 'mode' || key === 'date') prefill();
      ctl.refresh();
    },
    onAction: (act) => {
      if (act === 'cancel') { closeSheet(); return; }
      if (act !== 'save') return;
      const p = plannedFor(app, f.date, f.mode);
      const recd = {
        id: uid('t'), kind: 'trip', date: f.date, mode: f.mode, label: p.title,
        cost: Math.max(0, f.cost), wear: f.mode === 'auto' ? p.car.wear : 0,
        baseCash: p.car.cash, baseFull: p.car.economic, minutes: Math.max(0, f.minutes), fromBank: !!f.fromBank, note: f.note,
      };
      app.update((st) => { st.history.push(recd); });
      closeSheet();
      toast(`Поїздку збережено: ${humanDate(f.date)}`);
    },
  });
}

/* ───────── Купівля проїзного ───────── */
// Типова дата початку: календарний місячний у останні дні місяця — з 1-го числа наступного,
// календарний тижневий у вихідні — з наступного понеділка.
function defaultPassStart(app, type) {
  const t = app.today();
  const p = app.s.transit.passes;
  if (type === 'monthly' && p.monthlyType === 'calendar') return Number(t.slice(8)) >= 25 ? E.addDays(E.monthEnd(t), 1) : E.monthStart(t);
  if (type === 'weekly' && p.weeklyType === 'calendar') return E.isoDow(t) >= 5 ? E.addDays(E.weekEnd(t), 1) : E.weekStart(t);
  return t;
}

export function openPassPurchase(app, { type = 'weekly', start } = {}) {
  const s = app.s;
  const f = { type, start: start || defaultPassStart(app, type), startTouched: !!start, persons: s.trip.passengers, price: 0, touched: false };
  const unit = () => (f.type === 'weekly' ? s.transit.passes.weeklyPrice : s.transit.passes.monthlyPrice);
  const refreshPrice = () => { if (!f.touched) f.price = unit() * f.persons; };
  refreshPrice();
  openSheet({
    title: 'Купівля проїзного',
    render: () => {
      const end = E.passWindowEnd(f.type, f.start, s.transit.passes);
      return `<div class="seg" role="group" aria-label="Тип проїзного">
        <button type="button" data-act="type" data-type="weekly" aria-pressed="${f.type === 'weekly'}">Тижневий</button>
        <button type="button" data-act="type" data-type="monthly" aria-pressed="${f.type === 'monthly'}">Місячний</button>
      </div>
      <div class="grid-2">
        <div class="field"><label for="pp-start">Діє з</label><div class="input-wrap"><input id="pp-start" type="date" data-bind="f.start" data-kind="text" value="${esc(f.start)}"></div></div>
        ${numField({ bind: 'f.persons', label: 'Скільком людям', value: f.persons, unit: 'ос.', min: 1, max: 8, int: true, id: 'pp-persons' })}
      </div>
      ${numField({ bind: 'f.price', label: 'Сплачено разом', value: f.price, unit: '₴', max: 100000, id: 'pp-price' })}
      <div class="callout">${icon('info')}<span>Діє ${humanDate(f.start)} – ${humanDate(end)}. Покриває: ${s.transit.passes.covers.map((m) => E.SEGMENT_MODES[m].label.toLowerCase()).join(', ') || 'нічого (змініть у налаштуваннях)'}. Ціна потрапить у витрати один раз — у день купівлі, а поїздки в цей період рахуються як уже оплачені.</span></div>
      <div class="sheet-actions"><button type="button" class="btn primary" data-act="save">${icon('check')}Зберегти проїзний</button><button type="button" class="btn" data-act="cancel">Скасувати</button></div>`;
    },
    onAction: (act, el, ev, ctl) => {
      if (act === 'type') { f.type = el.dataset.type; if (!f.startTouched) f.start = defaultPassStart(app, f.type); refreshPrice(); ctl.refresh(); return; }
      if (act === 'cancel') { closeSheet(); return; }
      if (act === 'save') {
        const end = E.passWindowEnd(f.type, f.start, s.transit.passes);
        app.update((st) => { st.history.push({ id: uid('p'), kind: 'pass', date: f.start, type: f.type, start: f.start, end, persons: f.persons, price: f.price, note: '' }); });
        closeSheet();
        toast(`Проїзний збережено: ${shortDate(f.start)}–${shortDate(end)}`);
      }
    },
    onChange: (el, ev, ctl) => {
      const key = el.dataset.bind?.replace(/^f\./, '');
      if (!key) return;
      const r = readField(el, f[key]);
      if (!r) return;
      if (key === 'start' && !E.isDateStr(r.value)) { toast('Вкажіть коректну дату'); return; }
      f[key] = r.value;
      if (key === 'price') f.touched = true;
      if (key === 'start') f.startTouched = true;
      if (key === 'persons') refreshPrice();
      ctl.refresh();
    },
  });
}

/* ───────── Деталі режиму за період ───────── */
export function openModeDetail(app, { mode, report, label, rangeText, includeWear }) {
  const t = report.totals;
  const P = app.s.trip.passengers;
  openSheet({
    title: `${E.MODE_INFO[mode].code} за ${label}`,
    render: () => `<p class="muted small">${esc(E.MODE_INFO[mode].name)}. ${esc(rangeText)}, ${report.tripDays} ${E.plural(report.tripDays, ['день', 'дні', 'днів'])} поїздок.</p>
      ${report.unavailable ? `<div class="callout warn">${icon('warn')}<span>Частина днів без розрахунку: режим недоступний (немає увімкненого маршруту або FLEX не налаштовано).</span></div>` : ''}
      <div class="card flat">
        ${t.transit > 0.005 ? `<div class="kv"><span>Громадський транспорт</span><b>${E.fmtUAH(t.transit, 2)}</b></div>` : ''}
        ${t.taxi > 0.005 ? `<div class="kv"><span>Таксі</span><b>${E.fmtUAH(t.taxi, 2)}</b></div>` : ''}
        ${t.fuel > 0.005 ? `<div class="kv"><span>Пальне (${E.fmtNum(t.liters, 1)} л, ${E.fmtNum(t.km, 0)} км)</span><b>${E.fmtUAH(t.fuel, 2)}</b></div>` : ''}
        ${t.parking > 0.005 ? `<div class="kv"><span>Паркування</span><b>${E.fmtUAH(t.parking, 2)}</b></div>` : ''}
        <div class="kv"><span>Гроші з кишені</span><b>${E.fmtUAH(t.cash, 2)}</b></div>
        ${t.wear > 0.005 ? `<div class="kv"><span>Знос і амортизація</span><b>${E.fmtUAH(t.wear, 2)}</b></div>` : ''}
        <div class="kv total"><span>${includeWear ? 'Для порівняння' : 'Для порівняння (без зносу)'}</span><b>${E.fmtUAH(t.decision, 2)}</b></div>
      </div>
      <div class="card flat">
        <div class="kv"><span>Економія проти авто</span><b class="${report.vsCar >= 0 ? 'good' : 'bad'}">${signed(report.vsCar)}</b></div>
        <div class="kv"><span>Економія проти таксі</span><b class="${report.vsTaxi >= 0 ? 'good' : 'bad'}">${signed(report.vsTaxi)}</b></div>
        <div class="kv"><span>На одного пасажира (з ${P})</span><b>${signed(report.vsCarPerPassenger)}</b></div>
        <div class="kv"><span>Час у дорозі</span><b>${E.fmtHours(t.minutes)}</b></div>
        <div class="kv"><span>Різниця в часі з ECO</span><b>${Math.abs(report.hoursVsEco) < 0.05 ? '0 год' : report.hoursVsEco > 0 ? `на ${E.fmtNum(report.hoursVsEco, 1)} год менше` : `на ${E.fmtNum(-report.hoursVsEco, 1)} год більше`}</b></div>
      </div>
      ${t.transit > 0 || report.strategies.singles > 0 ? `<div class="card flat"><div class="card-title">Квитки чи проїзні</div>
        <div class="kv"><span>Лише разові</span><b>${E.fmtUAH(report.strategies.singles)}</b></div>
        <div class="kv"><span>Разові + тижневі</span><b>${E.fmtUAH(report.strategies.weekly)}</b></div>
        <div class="kv"><span>Разові + місячні</span><b>${E.fmtUAH(report.strategies.monthly)}</b></div>
        <div class="kv total"><span>Оптимально</span><b>${E.fmtUAH(report.strategies.optimal)}</b></div>
        ${purchasesHTML(report.purchases)}</div>` : ''}`,
  });
}

export function purchasesHTML(list) {
  if (!list.length) return '<p class="small muted" style="margin-top:8px">Проїзні купувати не варто — разові квитки не дорожчі.</p>';
  return `<div style="margin-top:8px">${list.map((p) => `<div class="purchase"><b>${p.type === 'weekly' ? 'Тижневий' : 'Місячний'} × ${p.persons}</b><b class="num">${E.fmtUAH(p.price * p.persons)}</b><small>${humanDate(p.start)} – ${humanDate(p.end)}, покриває ${p.days} ${E.plural(p.days, ['день', 'дні', 'днів'])} поїздок</small></div>`).join('')}</div>`;
}

export const signed = (v) => `${v > 0.005 ? '+' : v < -0.005 ? '−' : ''}${E.fmtUAH(Math.abs(v))}`;
