// MOBILITY TRAIL — sheets.js
// Спільні нижні аркуші: ранковий вибір, альтернативи, маршрут, запис поїздки, купівля проїзного, деталі режиму.

import * as E from './engine.js';
import { esc, icon, openSheet, closeSheet, toast, numField, humanDate, shortDate, readField, setFieldMsg, fmtInput, copyText } from './ui.js';
import { scoreRing } from './charts.js';
import { uid } from './store.js';

export const NAMED = ['eco', 'comfort', 'auto', 'taxi', 'flex'];
export const MODE_ORDER = ['eco', 'comfort', 'auto', 'taxi', 'flex', 'best'];

export function modeOf(rec, opt) {
  if (!opt) return null;
  for (const m of NAMED) if (rec.modes[m] && rec.modes[m].key === opt.key) return m;
  return 'best';
}
export const badge = (mode) => `<span class="mode-badge s-${mode}">${esc(E.MODE_INFO[mode]?.code || mode)}</span>`;

export function legsLine(opt, roundTrip = true) {
  if (!opt) return '';
  if (!opt.back) return `В один бік: <b>${esc(opt.there.label)}</b>`;
  if (opt.there.label === opt.back.label) return `Туди й назад: <b>${esc(opt.there.label)}</b>`;
  return `Туди: <b>${esc(opt.there.label)}</b>, назад: <b>${esc(opt.back.label)}</b>`;
}

/* ───────── Лінії, смуга маршруту, «сідайте в перший» ───────── */
// Кольори як у D-transport: трамвай червоний, автобус помаранчевий, тролейбус синій.
const LINE_CLS = { tram: 'l-tram', trolley: 'l-trolley', bus: 'l-bus', metro: 'l-metro', taxi: 'l-taxi', walk: 'l-walk' };
const MODE_ICON = { tram: 'tram', trolley: 'trolley', bus: 'bus', metro: 'metro', taxi: 'taxi', walk: 'walk' };
export const modeWord = (m) => (E.SEGMENT_MODES[m]?.label || '').split(' /')[0];
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

export function lineBadge(mode, text, withIcon = false) {
  return `<span class="line ${LINE_CLS[mode] || 'l-walk'}">${withIcon ? icon(MODE_ICON[mode] || 'route') : ''}${esc(text)}</span>`;
}
const setBadge = (st) => `<span class="line ${LINE_CLS[st.mode] || 'l-walk'}">${icon(MODE_ICON[st.mode] || 'route')}${st.lines.length ? st.lines.map(esc).join('<i>/</i>') : esc(modeWord(st.mode))}</span>`;
const chip = (ic, text, cls = '') => `<span class="line l-walk ${cls}">${icon(ic)}${esc(text)}</span>`;
export const linesOr = (mode, lines) => lines.map((l, i) => `${i ? (i === lines.length - 1 ? ' або ' : ', ') : ''}${lineBadge(mode, l)}`).join('');

// Смуга маршруту як в Apple Maps: пішки › номери › пішки. Кілька номерів в одному блоці — будь-який підходить.
export function legStrip(leg, s) {
  if (!leg) return '';
  const parts = [], aria = [];
  const walk = (m) => { if (m >= 0.5) { parts.push(chip('walk', E.fmtNum(Math.round(m)))); aria.push(`пішки ${E.fmtMin(m)}`); } };
  if (leg.kind === 'route') {
    for (const st of leg.steps) {
      walk(st.walk);
      if (st.kind === 'walk') continue;
      parts.push(setBadge(st));
      aria.push(`${modeWord(st.mode).toLowerCase()} ${E.joinOr(st.lines)}`.trim());
    }
    walk(leg.walkEnd);
  } else if (leg.kind === 'car') {
    parts.push(chip('car', E.fmtMin(leg.ride), 'is-car')); aria.push(`авто ${E.fmtMin(leg.ride)}`);
    parts.push(chip('parking', leg.free ? 'безкоштовно' : `${E.fmtNum(s.car.parkingPerHour)} ₴/год`, 'is-park')); aria.push(leg.free ? 'безкоштовна стоянка' : `паркування ${E.fmtNum(s.car.parkingPerHour)} гривень за годину`);
    walk(leg.walk);
  } else if (leg.kind === 'taxi') {
    parts.push(chip('taxi', E.fmtMin(leg.ride), 'is-taxi')); aria.push(`таксі ${E.fmtMin(leg.ride)}`);
  }
  return `<div class="strip" role="img" aria-label="${esc(cap(aria.join(', ')))}">${parts.join('<span class="strip-sep" aria-hidden="true">›</span>')}</div>`;
}

// Чек під сумою: з чого вона складається, щоб було видно, що за що (і що таксі — ціна в один бік).
export function receiptLine(o, s) {
  const r = E.costReceipt(o, s);
  if (!r || r.items.length < 2) return '';
  const txt = r.items.map((x, i) => `${i ? x.label : cap(x.label)} ${E.fmtUAH(x.value)}`).join(' + ');
  return `<p class="receipt">${esc(txt)} = <b>${E.fmtUAH(r.total)}</b></p>`;
}

// Головна інструкція: на яку зупинку йти і в які номери сідати; для таксі — тариф, для авто — паркування.
export function boardLines(leg, s = null, st = null) {
  if (!leg) return '';
  if (leg.kind === 'taxi' && s) {
    const tip = E.taxiTariffTip(s, st || E.DEFAULT_STATE);
    return `<p class="board">${icon('taxi')}<span><b>${esc(leg.tariff ? leg.tariff.name : 'Таксі')}</b> · подача ≈${E.fmtMin(leg.wait)} · ${E.fmtUAH(leg.cost)} в один бік${leg.vehicles > 1 ? ` (${leg.vehicles} авто)` : ''}</span></p>`
      + (tip ? `<p class="board first">${icon('spark')}<span>${st?.hurry ? 'Поспішаєте?' : 'З багажем?'} Тариф <b>${esc(tip.tariff.name)}</b>: +${E.fmtGrn(tip.extra)} за поїздку, зате ${esc(tip.why)}</span></p>` : '');
  }
  if (leg.kind === 'car' && s) {
    const veh = E.vehicles(s.trip.passengers, s.car.capacity);
    const park = s.car.parkingPerHour * s.car.parkingHours * veh;
    return leg.free
      ? `<p class="board">${icon('parking')}<span>Безкоштовна стоянка · далі ${E.fmtMin(s.car.freeParkWalkMin)} пішки</span></p>`
      : `<p class="board">${icon('parking')}<span>Паркування ${E.fmtNum(s.car.parkingHours)} год × ${E.fmtNum(s.car.parkingPerHour)} ₴ = <b>${E.fmtUAH(park)}</b></span></p>`;
  }
  if (leg.kind !== 'route') return '';
  const first = leg.steps.find((x) => x.kind === 'ride');
  if (!first) return '';
  const multi = leg.steps.find((x) => x.kind === 'ride' && x.n > 1);
  let h = '';
  if (first.from) h += `<p class="board">${icon('pin')}<span><b>${esc(first.from)}</b> · ${E.fmtMin(first.walk)} пішки</span></p>`;
  if (multi) {
    const where = multi !== first && multi.from ? `На «${esc(multi.from)}» сідайте` : 'Сідайте';
    h += `<p class="board first">${icon('spark')}<span>${where} в перший, що прийде: ${linesOr(multi.mode, multi.lines)}</span></p>`;
  }
  return h;
}

/* ───────── Маршрут покроково ───────── */
export function openRoute(app, opt = null) {
  openSheet({ title: 'Маршрут', render: () => routeHTML(app, opt || app.rec().best), onAction: (act) => routeAction(app, act) });
}

function routeHTML(app, o) {
  const s = app.s, rec = app.rec();
  if (!o) return '<div class="empty"><b>Немає варіантів</b>Перевірте маршрути в налаштуваннях.</div>';
  const P = s.trip.passengers;
  const rt = !!o.back;
  const dep = E.departureFor(s, o);
  const mode = modeOf(rec, o);
  let h = `<div class="trip-head"><div class="row wrap">${badge(mode)}${o.unconfirmed ? '<span class="tag-approx">орієнтовно</span>' : ''}</div>
    <h3>${esc(o.title)}</h3>
    <p class="muted small">${E.fmtMin(o.oneWay)} в один бік · ${E.fmtUAH(o.cost.decision)} ${rt ? 'туди й назад' : 'в один бік'}${P > 1 ? ` ${E.forGroup(P)}` : ''}${dep ? ` · вихід о <b>${dep.time}</b>, прибуття до ${dep.arrive}` : ''}</p></div>
  ${legSteps(app, o.there, o.spec.there, rec.ctx)}`;
  if (o.back) {
    // Дорога назад: ті самі номери у зворотному порядку, зупинки й поради — для напрямку додому.
    const sBack = { ...s, route: { ...s.route, swapped: !s.route.swapped } };
    const r = o.spec.back.type === 'route' ? E.routesById(s)[o.spec.back.id] : null;
    const backLeg = r ? E.transitLeg(r, sBack, rec.ctx) : o.back;
    const same = E.specKey({ there: o.spec.there, back: null }) === E.specKey({ there: o.spec.back, back: null });
    h += `<details class="more back"><summary>Як їхати назад${same ? '' : `: ${esc(o.back.label)}`} · ${E.fmtMin(backLeg.minutes)}</summary>
      ${legStrip(backLeg, sBack)}${legSteps(app, backLeg, o.spec.back, rec.ctx, sBack)}
      ${backLeg.kind === 'route' ? '<p class="note-box">Назад — ті самі номери у зворотному порядку; зупинки зазвичай на протилежному боці вулиці. Звірте в D-transport.</p>' : ''}</details>`;
  }
  const k = o.there.kind;
  const note = k === 'route'
    ? `${o.there.src ? `Маршрут, зупинки, час руху й пішки — ${esc(o.there.src)}. ` : ''}Очікування на зупинках — ваше припущення: живих розкладів застосунок не бачить.`
    : k === 'taxi'
      ? `Ціна й подача — з налаштувань${s.taxi.src && E.selectedTariff(s) ? ` (${esc(s.taxi.src)})` : ''}. Реальна ціна в Bolt залежить від часу, погоди й попиту — гляньте її перед замовленням.`
      : 'Пальне, знос і паркування — з налаштувань авто. Заторів застосунок не бачить: у години пік закладайте більший запас.';
  h += `<div class="card-title">${k === 'taxi' ? 'Подивитися дорогу' : 'Відкрити в навігаторі'}</div>${navButtons(app, o, { copy: k !== 'taxi' })}
  <p class="note-box">${note}</p>`;
  return h;
}

function legSteps(app, leg, spec, ctx, sDir = null) {
  const s = sDir || app.s, P = s.trip.passengers;
  const { to } = E.routeEnds(s);
  const items = [];
  const walkItem = (min, text) => `<li class="step walk"><span class="step-dot">${icon('walk')}</span><div class="step-body"><b>${E.fmtMin(min)} пішки</b><small>${esc(text)}</small></div></li>`;
  if (leg.kind === 'route') {
    const advice = spec.type === 'route' ? E.stopAdvice(s, spec.id, ctx) : [];
    leg.steps.forEach((st, k) => {
      if (st.walk >= 0.5) items.push(walkItem(st.walk, k === 0 ? `до зупинки «${st.from || 'посадки'}»` : `пересадка${st.from ? ` до «${st.from}»` : ''}`));
      if (st.kind === 'walk') return;
      items.push(rideItem(st, advice.find((a) => a.k === k), P, st.walk < 0.5));
    });
    items.push(`<li class="step end"><span class="step-dot">${icon('flag')}</span><div class="step-body"><b>${leg.walkEnd >= 0.5 ? `${E.fmtMin(leg.walkEnd)} пішки` : 'Ви на місці'}</b><small>до «${esc(to.address)}»</small></div></li>`);
  } else if (leg.kind === 'car') {
    const c = E.carCosts(s, ctx, 1, !!leg.free);
    items.push(`<li class="step l-car"><span class="step-dot">${icon('car')}</span><div class="step-body"><b>Авто: ≈${E.fmtMin(leg.ride)}</b><small>${E.fmtNum(s.car.distanceKm, 1)} км · пальне ≈${E.fmtUAH(c.fuel)} в один бік</small></div></li>`);
    const park = s.car.parkingPerHour * s.car.parkingHours * c.vehicles;
    items.push(`<li class="step l-park"><span class="step-dot">${icon('parking')}</span><div class="step-body"><b>${leg.free ? 'Безкоштовна стоянка' : `Паркування: ${E.fmtNum(s.car.parkingHours)} год × ${E.fmtNum(s.car.parkingPerHour)} ₴ = ${E.fmtUAH(park)}`}</b><small>${leg.free ? 'Паркування 0 ₴ — трохи далі від роботи' : 'Платне паркування на весь робочий день'}</small></div></li>`);
    items.push(`<li class="step end"><span class="step-dot">${icon('flag')}</span><div class="step-body"><b>${E.fmtMin(leg.walk)} пішки</b><small>до «${esc(to.address)}»</small></div></li>`);
  } else if (leg.kind === 'taxi') {
    const t = leg.tariff;
    const tip = E.taxiTariffTip(s, ctx.state);
    const others = (s.taxi.tariffs || []).filter((x) => x.id !== s.taxi.tariff);
    items.push(`<li class="step l-taxi"><span class="step-dot">${icon('taxi')}</span><div class="step-body">
      <b>${t ? `Викличте ${esc(t.name)}` : 'Викличте таксі'}: подача ≈${E.fmtMin(leg.wait)}</b>
      <small>У дорозі ≈${E.fmtMin(leg.ride)} · ${E.fmtUAH(leg.cost)} в один бік${leg.vehicles > 1 ? ` (${leg.vehicles} авто)` : ' за авто на всіх'}</small>
      ${tip ? `<div class="alt-box"><p class="alt-title">Сьогодні може бути краще</p><div class="alt v-take"><span class="alt-lines"><span class="line l-walk">${esc(tip.tariff.name)}</span></span><span>+${E.fmtGrn(tip.extra)} за поїздку, зате ${esc(tip.why)}</span></div></div>` : ''}
      ${others.length ? `<small class="tariffs">Інші тарифи: ${others.map((x) => `${esc(x.name)} ${E.fmtUAH(x.price)}`).join(' · ')}</small>` : ''}
      <div class="step-actions">${copyButton(app, 'taxi')}<button type="button" class="link-btn" data-act="go-taxi">Змінити тариф</button></div>
    </div></li>`);
    items.push(`<li class="step end"><span class="step-dot">${icon('flag')}</span><div class="step-body"><b>Ви на місці</b><small>«${esc(to.address)}»</small></div></li>`);
  }
  return `<ol class="steps">${items.join('')}</ol>`;
}

function rideItem(st, adv, P, showStop = true) {
  if (st.kind === 'taxi') {
    return `<li class="step l-taxi"><span class="step-dot">${icon('taxi')}</span><div class="step-body"><b>Таксі${st.to ? ` до «${esc(st.to)}»` : ''}</b><small>Подача ≈${E.fmtMin(st.wait)} · у дорозі ≈${E.fmtMin(st.ride)} · ${E.fmtUAH(st.cost)}</small></div></li>`;
  }
  const many = st.n > 1;
  const head = many ? 'Сідайте в перший, що прийде' : `Сідайте в ${modeWord(st.mode).toLowerCase()}${st.lines[0] ? ` ${esc(st.lines[0])}` : ''}`;
  const wait = many
    ? `Очікування ≈${E.fmtMin(st.wait)}: підходить будь-який із ${st.n} номерів (один номер — ≈${E.fmtMin(st.wait1)})`
    : `Очікування ≈${E.fmtMin(st.wait)}`;
  const ride = [st.stops ? `${st.stops} ${E.plural(st.stops, ['зупинка', 'зупинки', 'зупинок'])}` : '', `≈${E.fmtMin(st.ride)}`, st.to ? `до «${esc(st.to)}»` : ''].filter(Boolean).join(' · ');
  const full = st.fare * P;
  const fare = st.fare > 0
    ? `${E.fmtUAH(st.fare)} за посадку${st.special ? ' — окремий тариф, проїзний не діє' : ''}${st.cost < full - 0.005 ? ` · сплачуєте ${E.fmtUAH(st.cost)}${P > 1 ? ` ${E.forGroup(P)}` : ''} (пільга або проїзний)` : ''}`
    : 'Безоплатно';
  const alts = adv && adv.alts.length ? `<div class="alt-box"><p class="alt-title">Якщо першим прийде інший номер</p>
    ${adv.alts.map((a) => `<div class="alt v-${a.verdict}"><span class="alt-lines">${a.lines.map((l) => lineBadge(a.mode, l)).join('')}</span><span>${esc(cap(E.adviceText(a, P)))}<i>${esc(a.next)}</i></span></div>`).join('')}</div>` : '';
  return `<li class="step ${LINE_CLS[st.mode] || ''}"><span class="step-dot">${icon(MODE_ICON[st.mode] || 'route')}</span><div class="step-body">
    <div class="step-lines">${st.lines.map((l) => lineBadge(st.mode, l)).join('')}</div>
    <b>${head}</b>
    ${st.from && showStop ? `<small>Зупинка «${esc(st.from)}»</small>` : ''}
    <small>${wait}</small>
    <small>${ride}</small>
    <small>${fare}</small>
    ${alts}
  </div></li>`;
}

// Лише те, що потрібно для цього способу: ГТ — карти й D-transport, авто — карти й Waze, таксі — карти й адреса для Bolt.
export function navButtons(app, opt, { copy = true } = {}) {
  const k = opt?.there?.kind;
  const l = E.navLinks(app.s, k === 'route' || !k ? 'transit' : 'driving');
  const a = (href, label, ic) => `<a class="btn small" href="${esc(href)}" target="_blank" rel="noopener">${icon(ic)}${esc(label)}</a>`;
  const items = [a(l.google, 'Google Maps', 'map'), a(l.apple, 'Apple Maps', 'map')];
  if (k === 'car') items.push(a(l.waze, 'Waze', 'route'));
  else if (k !== 'taxi') items.push(a(l.dtransport, 'D-transport', 'route'));
  if (copy) items.push(copyButton(app, k));
  return `<div class="nav-links">${items.join('')}</div>`;
}
const copyButton = (app, kind) => `<button type="button" class="btn small" data-act="copy-dest">${icon('copy')}${kind === 'taxi' && E.selectedTariff(app.s) ? 'Адреса для Bolt' : 'Скопіювати адресу'}</button>`;

// Адреса призначення в буфер — щоб вставити в Bolt, D-transport чи будь-яку карту.
export function copyDest(app) {
  const { to } = E.routeEnds(app.s);
  copyText(to.address).then((ok) => toast(ok ? `Скопійовано: ${to.address}` : 'Не вдалося скопіювати — виділіть адресу в налаштуваннях'));
}
// Дії, спільні для аркушів маршруту.
function routeAction(app, act) {
  if (act === 'copy-dest') copyDest(app);
  else if (act === 'go-taxi') { closeSheet(); app.go('settings', { anchor: 'set-taxi' }); }
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
      else if (act === 'route') openRoute(app);
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
    ${legStrip(best.there, app.s)}
    ${boardLines(best.there, app.s, flags)}
    ${backLine(best)}
    <div class="pass-metrics">
      <div class="metric"><small>${rt ? 'Туди й назад' : 'В один бік'}</small><b>${E.fmtUAH(best.cost.decision)}</b></div>
      <div class="metric"><small>Час в один бік</small><b>${E.fmtMin(best.oneWay)}</b></div>
      <div class="metric"><small>Вихід о</small><b>${dep ? dep.time : '—'}</b></div>
    </div>
    ${receiptLine(best, app.s)}
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
      <p class="small muted" style="margin-top:4px">${E.fmtUAH(a.cost.decision)} ${rt ? 'туди й назад' : 'в один бік'}, ${E.fmtMin(a.oneWay)} в один бік. ${dc >= 1 ? `Дорожче на ${E.fmtGrn(dc)}` : dc <= -1 ? `Дешевше на ${E.fmtGrn(-dc)}` : 'Та сама ціна'}${Math.abs(dm) >= 1 ? `, ${dm > 0 ? 'довше' : 'швидше'} на ${E.fmtMin(Math.abs(dm))} ${rt ? 'туди й назад' : ''}`.trimEnd() : ''}.</p></div>
      <div class="rank-score"><b>${Math.round(a.total)}</b><small>балів</small></div></div></div>`;
  }
  html += `<button type="button" class="btn block" data-act="route">${icon('route')}Маршрут покроково</button>
  <div class="sheet-actions"><button type="button" class="btn primary" data-act="log">${icon('check')}Записати поїздку</button><button type="button" class="btn" data-act="alts">Усі варіанти</button></div>`;
  return html;
}

// Коротко про зворотний шлях, якщо він інший або його немає.
export function backLine(o) {
  if (!o) return '';
  if (!o.back) return '<p class="pass-legs">Лише в один бік</p>';
  if (o.back.label === o.there.label && o.back.kind === o.there.kind) return '';
  return `<p class="pass-legs">Назад: <b>${esc(o.back.label)}</b></p>`;
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
      if (act === 'route') openRoute(app, app.rec().options.find((o) => o.key === el.dataset.key) || null);
      if (act === 'preset') { app.applyPreset(el.dataset.k); ctl.refresh(); }
    },
  });
}

function altsHTML(app, open) {
  const rec = app.rec();
  if (!rec.best) return '<div class="empty"><b>Немає варіантів</b>Перевірте маршрути в налаштуваннях.</div>';
  const items = rec.ranking.map((r) => ({ mode: r.mode, opt: r.opt }));
  if (rec.bestMode === null || !items.some((i) => i.opt.key === rec.best.key)) items.unshift({ mode: 'best', opt: rec.best });
  items.sort((a, b) => b.opt.total - a.opt.total);
  const w = rec.weights;
  const rt = rec.ctx.state.roundTrip !== false;
  return `${presetChips(app)}
  <p class="muted small">Оцінка 0–100 — зважена сума чотирьох критеріїв за вашими пріоритетами з урахуванням сьогоднішнього стану. Це порівняння варіантів між собою, а не ймовірність і не прогноз.</p>
  <div class="weights-sum" aria-hidden="true">${E.WEIGHT_KEYS.map((k) => `<span class="w-${k}" style="flex:${w[k].toFixed(3)}"></span>`).join('')}</div>
  <p class="small dim">${E.WEIGHT_KEYS.map((k) => `${E.WEIGHT_LABELS[k]} ${Math.round(w[k] * 100)} %`).join(', ')}</p>
  <ul class="rank">${items.map((it, i) => {
    const o = it.opt;
    const isOpen = open.has(o.key);
    const isBest = rec.best && o.key === rec.best.key;
    return `<li class="rank-item${i === 0 ? ' top' : ''}">
      <button type="button" class="rank-btn" data-act="toggle" data-key="${esc(o.key)}" aria-expanded="${isOpen}">
        <span class="rank-pos">${i + 1}</span>
        <span class="rank-main"><b>${esc(E.MODE_INFO[it.mode].code)}${isBest ? ' <span class="badge-best">найкраще</span>' : ''}</b><small>${esc(o.title)} · ${E.fmtUAH(o.cost.decision)} ${rt ? 'туди й назад' : 'в один бік'} · ${E.fmtMin(o.oneWay)} в один бік</small></span>
        <span class="rank-score"><b>${Math.round(o.total)}</b><small>балів</small></span>
      </button>
      ${isOpen ? `<div class="contrib">
        ${E.WEIGHT_KEYS.map((k) => `<div class="contrib-row"><span>${E.WEIGHT_LABELS[k]}</span><div class="progress"><span class="wfill w-${k}" style="width:${o.scores[k].toFixed(1)}%"></span></div><b>${fmtPts(o.contrib[k])}</b></div>`).join('')}
        ${legStrip(o.there, app.s)}
        <div class="kv"><span>Шлях</span><b>${legsLine(o, rt)}</b></div>
        ${costRows(o)}
        <div class="kv"><span>Час у дорозі ${rt ? 'за день' : ''}</span><b>${E.fmtMin(o.minutes)}</b></div>
        <div class="kv"><span>Пересадок</span><b>${o.transfers}</b></div>
        <div class="kv"><span>Пішки та очікування</span><b>${E.fmtMin(o.outdoor)}</b></div>
        <div class="kv"><span>Комфорт / надійність</span><b>${Math.round(o.comfort)} / ${Math.round(o.reliability)}</b></div>
        <button type="button" class="btn small" data-act="route" data-key="${esc(o.key)}" style="margin-top:8px">${icon('route')}Маршрут покроково</button>
      </div>` : ''}
    </li>`;
  }).join('')}</ul>
  <details class="more"><summary>Як рахується оцінка</summary>
    <div class="note-box">
      <p><b>Економія</b> і <b>швидкість</b>: найдешевший (найшвидший) варіант отримує 100 балів, інші — пропорційно відставанню. Щоб дрібна різниця не перетворювалась на величезну, розмах шкали не менший за половину максимального значення.</p>
      <p style="margin-top:8px"><b>Комфорт</b>: базовий рівень виду транспорту (метро 68, трамвай 62, тролейбус 58, автобус 50, авто 76, таксі 88) мінус пересадки (−7 кожна), очікування й ходьба (більше в негоду), тиснява, багаж, втома (за кермом −28).</p>
      <p style="margin-top:8px"><b>Надійність</b>: базовий рівень (метро 93, трамвай 80, тролейбус 74, автобус 66, авто 84, таксі 78) мінус пересадки, довгі інтервали, затори, негода, втома за кермом і −10, якщо маршрут ще не перевірено. Кожен запасний номер на тій самій зупинці додає +3 (до +6). Ранкова поїздка важить 65 %, вечірня 35 %.</p>
      <p style="margin-top:8px"><b>Кілька номерів на зупинці</b>: ви сідаєте в перший, що прийде, тож чекаєте менше. Якщо один номер у середньому чекати 8 хв, то будь-який із двох — ≈5 хв, із трьох — 4 хв, із чотирьох — ≈3 хв (модель 2w/(n+1) для незалежних номерів зі схожим інтервалом).</p>
      <p style="margin-top:8px"><b>Стан</b>: «Поспішаю» додає 20 п.п. швидкості й 12 п.п. надійності, «Втомився» — 18 п.п. комфорту, багаж — 8, негода — 6. Після цього ваги знову нормуються до 100 %.</p>
    </div>
  </details>
  <button type="button" class="btn block" data-act="nav">${icon('map')}Відкрити маршрут у навігаторі</button>`;
}
const fmtPts = (v) => `${E.fmtNum(v, 1)}`;

// Пресети пріоритетів — одне торкання замість чотирьох повзунків.
export function presetChips(app) {
  const cur = E.presetOf(app.s.weights);
  return `<div class="chips" role="group" aria-label="Пріоритети">${Object.entries(E.WEIGHT_PRESETS).map(([k, p]) => `<button type="button" class="chip" data-act="preset" data-k="${k}" aria-pressed="${cur === k}">${esc(p.label)}</button>`).join('')}</div>`;
}

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
      <p class="note-box">Відкриється зовнішній застосунок. Живих даних про рух, затори чи розклади застосунок не отримує: час у розрахунках — ваші орієнтовні значення з налаштувань. D-transport відкривається через App Store, бо офіційної схеми посилань на конкретний маршрут у нього немає.</p>
      ${!E.parseCoords(from.coords) || !E.parseCoords(to.coords) ? '<div class="callout warn">' + icon('warn') + '<span>Якщо карта знаходить адресу під іншою назвою, вставте точні координати точки в «Налаштуваннях → Маршрут». Тоді навігатори відкриватимуть саме її.</span></div>' : ''}`;
    },
    onAction: (act) => routeAction(app, act),
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
  const a = rec.modes.auto;
  const car = a ? { cash: a.cost.cash, economic: a.cost.economic, wear: a.cost.wear } : E.carCosts(s, E.makeCtx(), 2);
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
