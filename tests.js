// MOBILITY ZERO — tests.js
// Перевірочні тести фінансового модуля. Працюють у браузері (tests.html) і в Node: `node tests.js`.

import * as E from './engine.js';
import { defaultSettings, defaultState, normalizeState, exportJSON, validateImport } from './store.js';

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
function eq(a, b, msg = '') { if (a !== b) throw new Error(`${msg} очікувалось ${JSON.stringify(b)}, отримано ${JSON.stringify(a)}`); }
function near(a, b, tol = 0.01, msg = '') { if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg} очікувалось ≈${b}, отримано ${a}`); }
function ok(cond, msg = 'умова не виконана') { if (!cond) throw new Error(msg); }

const S = (patch) => { const s = defaultSettings(); if (patch) patch(s); return s; };
const rec = (s, state = {}, extra = {}) => E.recommend(s, { state, ...extra });
const NOV = { from: '2026-11-01', to: '2026-11-30' };
const CAR_FUEL = 14 * 0.09 * 89.38; // 112.6188
const CAR_FULL = CAR_FUEL + 42 + 90;  // 244.6188

/* ── Автомобіль ── */
test('Авто за день: пальне, знос, паркування окремо', () => {
  const c = E.carCosts(S(), E.makeCtx(), 2);
  near(c.fuel, CAR_FUEL, 1e-6, 'пальне');
  near(c.wear, 42, 1e-9, 'знос');
  near(c.parking, 90, 1e-9, 'паркування');
  near(c.cash, CAR_FUEL + 90, 1e-6, 'готівка');
  near(c.economic, CAR_FULL, 1e-6, 'повна вартість');
});
test('Двоє в одному авто: пальне й паркування не множаться на пасажирів', () => {
  const one = E.carCosts(S((s) => { s.trip.passengers = 1; }), E.makeCtx(), 2);
  const two = E.carCosts(S(), E.makeCtx(), 2);
  near(one.economic, two.economic, 1e-9);
});
test('Пасажирів більше, ніж місць: друга машина', () => {
  const c = E.carCosts(S((s) => { s.trip.passengers = 6; }), E.makeCtx(), 2);
  eq(c.vehicles, 2);
  near(c.parking, 180, 1e-9);
});
test('Витрата 12 л/100 км', () => {
  const c = E.carCosts(S((s) => { s.car.consumption = 12; }), E.makeCtx(), 2);
  near(c.fuel, 14 * 0.12 * 89.38, 1e-6);
});
test('Безкоштовне паркування', () => {
  near(rec(S((s) => { s.car.parkingPerHour = 0; })).modes.auto.cost.decision, CAR_FULL - 90, 1e-6);
});
test('Без зносу в порівнянні — рахується лише готівка', () => {
  near(rec(S((s) => { s.car.includeWear = false; })).modes.auto.cost.decision, CAR_FUEL + 90, 1e-6);
});
test('Зимова витрата +15 %', () => {
  near(E.carCosts(S((s) => { s.car.winter = true; }), E.makeCtx(), 2).fuel, CAR_FUEL * 1.15, 1e-6);
});

/* ── Громадський транспорт і таксі ── */
test('ECO на двох туди-назад = 4 квитки', () => near(rec(S()).modes.eco.cost.decision, 40, 1e-9));
test('ECO для однієї людини = 2 квитки', () => near(rec(S((s) => { s.trip.passengers = 1; })).modes.eco.cost.decision, 20, 1e-9));
test('Таксі на двох — одне спільне', () => near(rec(S()).modes.taxi.cost.decision, 320, 1e-9));
test('Таксі на п’ятьох — дві машини', () => near(rec(S((s) => { s.trip.passengers = 5; })).modes.taxi.cost.decision, 640, 1e-9));
test('COMFORT = ГТ туди + таксі назад', () => near(rec(S()).modes.comfort.cost.decision, 20 + 160, 1e-9));
test('Економія ECO проти авто ≈ 205 ₴', () => { const r = rec(S()); near(r.modes.auto.cost.decision - r.modes.eco.cost.decision, CAR_FULL - 40, 1e-6); });
test('Поїздка лише в один бік', () => {
  const r = rec(S(), { roundTrip: false });
  near(r.modes.eco.cost.decision, 20, 1e-9);
  eq(r.modes.comfort, null, 'COMFORT');
});
test('Пересадка: дві посадки оплачуються окремо', () => {
  const s = S((x) => { x.transit.routes[1].enabled = true; });
  const o = E.evaluateOption({ there: { type: 'route', id: 'r2' }, back: { type: 'route', id: 'r2' } }, s, E.makeCtx());
  near(o.cost.decision, 80, 1e-9);
  eq(o.transfers, 2);
});

/* ── Пільга ── */
test('Пільга вимкнена — квитки оплачуються навіть з позначкою', () => near(rec(S(), {}, { eligible: true }).modes.eco.cost.decision, 40, 1e-9));
test('Пільга увімкнена, поїздку не підтверджено — оплачується', () => near(rec(S((s) => { s.benefit.enabled = true; })).modes.eco.cost.decision, 40, 1e-9));
test('Пільга увімкнена й підтверджена — 0 ₴', () => near(rec(S((s) => { s.benefit.enabled = true; }), {}, { eligible: true }).modes.eco.cost.decision, 0, 1e-9));
test('Пільга лише для однієї людини', () => near(rec(S((s) => { s.benefit.enabled = true; s.benefit.persons = 1; }), {}, { eligible: true }).modes.eco.cost.decision, 20, 1e-9));
test('Пільга не діє на таксі', () => near(rec(S((s) => { s.benefit.enabled = true; }), {}, { eligible: true }).modes.comfort.cost.decision, 160, 1e-9));

/* ── Проїзні ── */
test('Діючий проїзний: покриті поїздки сьогодні без доплати', () => near(rec(S(), {}, { passPersons: 2 }).modes.eco.cost.decision, 0, 1e-9));
test('Проїзний на трамвай не покриває тролейбус', () => {
  const s = S((x) => { x.transit.routes[1].enabled = true; });
  const o = E.evaluateOption({ there: { type: 'route', id: 'r2' }, back: { type: 'route', id: 'r2' } }, s, E.makeCtx({ passPersons: 2 }));
  near(o.cost.decision, 40, 1e-9);
});
test('DP: при рівній ціні обираються разові квитки', () => {
  const d = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
  const r = E.passDP(d, [20, 20, 20, 20, 20], { weekly: 100, windowEnd: (t, x) => E.addDays(x, 6) });
  near(r.total, 100, 1e-9); eq(r.purchases.length, 0);
});
test('DP: 6 поїздок на тиждень — тижневий вигідніший', () => {
  const d = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];
  const r = E.passDP(d, [20, 20, 20, 20, 20, 20], { weekly: 100, windowEnd: (t, x) => E.addDays(x, 6) });
  near(r.total, 100, 1e-9); eq(r.purchases.length, 1);
});
test('Місяць ECO щодня (21 день): місячний проїзний 410 ₴/особу', () => {
  const p = E.computePeriod(S(), {}, [], { ...NOV, forceMode: 'eco' });
  eq(p.tripDays, 21);
  near(p.strategies.singles, 840, 1e-9, 'разові');
  near(p.strategies.optimal, 820, 1e-9, 'оптимально');
  near(p.totals.transit, 820, 1e-9, 'без подвійного врахування');
  eq(p.purchases.length, 1); eq(p.purchases[0].type, 'monthly'); eq(p.purchases[0].persons, 2);
});
test('Вартість проїзного розподілено між днями без втрат', () => {
  const p = E.computePeriod(S(), {}, [], { ...NOV, forceMode: 'eco' });
  near(p.days.reduce((a, d) => a + d.transit, 0), 820, 1e-6);
});
test('Двоє ECO, два тижні поза Дніпром', () => {
  const cal = {}; for (const d of E.dateRange('2026-11-16', '2026-11-29')) cal[d] = { type: 'away' };
  const p = E.computePeriod(S(), cal, [], { ...NOV, forceMode: 'eco' });
  eq(p.tripDays, 11);
  near(p.totals.transit, 440, 1e-9);
  eq(p.purchases.length, 0, 'проїзні не потрібні');
});
test('Субота як додатковий день — тижневий проїзний', () => {
  const p = E.computePeriod(S(), { '2026-11-07': { type: 'eco' } }, [], { from: '2026-11-02', to: '2026-11-08', forceMode: 'eco' });
  near(p.strategies.singles, 240, 1e-9); near(p.strategies.optimal, 200, 1e-9);
});
test('Проїзний діє лише частину місяця (з 16.11)', () => {
  const hist = [{ id: 'p', kind: 'pass', date: '2026-11-16', type: 'monthly', start: '2026-11-16', end: '2026-11-30', persons: 2, price: 820 }];
  const p = E.computePeriod(S(), {}, hist, { ...NOV, forceMode: 'eco' });
  near(p.totals.transit, 400, 1e-9, '10 днів до 16.11 разовими');
  near(p.ownedSunk, 820, 1e-9, 'вже сплачено');
});
test('Частина днів трамвай, частина таксі', () => {
  const cal = {};
  const workdays = (a, b) => E.dateRange(a, b).filter((d) => E.isoDow(d) < 5);
  for (const d of workdays('2026-11-02', '2026-11-13')) cal[d] = { type: 'eco' };
  for (const d of workdays('2026-11-16', '2026-11-30')) cal[d] = { type: 'taxi' };
  const p = E.computePeriod(S(), cal, [], NOV);
  near(p.totals.transit, 400, 1e-9); near(p.totals.taxi, 11 * 320, 1e-9); near(p.totals.decision, 400 + 3520, 1e-9);
});
test('Двоє авто весь місяць: готівка та повна вартість', () => {
  const p = E.computePeriod(S(), {}, [], { ...NOV, forceMode: 'auto' });
  near(p.totals.cash, 21 * (CAR_FUEL + 90), 1e-6); near(p.totals.economic, 21 * CAR_FULL, 1e-6);
});
test('Одна людина ГТ місяць', () => near(E.computePeriod(S((s) => { s.trip.passengers = 1; }), {}, [], { ...NOV, forceMode: 'eco' }).totals.transit, 410, 1e-9));
test('Без проїзних: лише разові', () => near(E.computePeriod(S(), {}, [], { ...NOV, forceMode: 'eco', noPasses: true }).totals.transit, 840, 1e-9));
test('Проїзний уже придбано: граничні витрати 0, сплачене окремо', () => {
  const p = E.computePeriod(S(), {}, [], { ...NOV, forceMode: 'eco', assumeOwnedAll: true });
  near(p.totals.transit, 0, 1e-9); near(p.ownedSunk, 820, 1e-9);
});
test('Порівняння режимів: економія проти авто й таксі', () => {
  const c = E.compareModes(S(), {}, [], NOV);
  near(c.modes.eco.vsCar, 21 * CAR_FULL - 820, 1e-6);
  near(c.modes.eco.vsTaxi, 21 * 320 - 820, 1e-6);
  near(c.modes.eco.vsCarPerPassenger, (21 * CAR_FULL - 820) / 2, 1e-6);
});
test('Години: 110 хв × 21 день = 38,5 год', () => {
  const p = E.computePeriod(S(), {}, [], { ...NOV, forceMode: 'eco' });
  near(p.totals.minutes, 110 * 21, 1e-6); eq(E.fmtHours(p.totals.minutes), '38,5 год');
});
test('«Що, якщо»: бензин +20 %', () => {
  const { settings } = E.applyScenario(S(), { ...E.SCENARIO_DEFAULT, fuelPct: 20 });
  near(E.carCosts(settings, E.makeCtx(), 2).fuel, CAR_FUEL * 1.2, 1e-6);
});
test('«Що, якщо»: робочих днів менше на 5', () => {
  const { settings, periodOpt } = E.applyScenario(S(), { ...E.SCENARIO_DEFAULT, daysCut: 5 });
  eq(E.computePeriod(settings, {}, [], { ...NOV, ...periodOpt }).tripDays, 16);
});
test('Точка беззбитковості: місячний вигідніший з ~20,5 дня', () => {
  const be = E.breakEven(S(), {}, [], { variable: 'days', ...NOV });
  const x = be.crossings.find((c) => [c.a, c.b].includes('eco-singles') && [c.a, c.b].includes('eco-monthly'));
  ok(x, 'перетин не знайдено'); near(x.x, 20.5, 0.01); eq(x.cheaperAfter, 'eco-monthly');
});
test('Перетин ліній', () => {
  const c = E.findCrossings([0, 1, 2, 3], [{ key: 'a', values: [0, 10, 20, 30] }, { key: 'b', values: [15, 15, 15, 15] }]);
  eq(c.length, 1); near(c[0].x, 1.5, 1e-9);
});

/* ── Оцінка й рекомендація ── */
test('Ваги нормуються до 100 %', () => {
  const w = E.normalizeWeights({ cost: 45, comfort: 25, speed: 20, reliability: 10 });
  near(w.cost, 0.45, 1e-9); near(Object.values(w).reduce((a, b) => a + b, 0), 1, 1e-9);
  const z = E.normalizeWeights({ cost: 0, comfort: 0, speed: 0, reliability: 0 });
  near(z.cost, 0.25, 1e-9);
  near(Object.values(E.effectiveWeights({ cost: 45, comfort: 25, speed: 20, reliability: 10 }, { hurry: true, tired: true })).reduce((a, b) => a + b, 0), 1, 1e-9);
});
test('Оцінки в межах 0–100', () => {
  for (const st of [{}, { tired: true, badWeather: true, luggage: true, traffic: true, crowded: true, hurry: true }]) {
    for (const o of rec(S(), st).options) {
      for (const v of [o.total, ...Object.values(o.scores)]) ok(v >= 0 && v <= 100, `оцінка ${v}`);
    }
  }
});
test('За замовчуванням ZERO обирає трамвай', () => { const r = rec(S()); eq(r.best.key, 'r:r1|r:r1'); eq(r.bestMode, 'eco'); });
test('Втома: рекомендація без самостійного керування', () => ok(!rec(S(), { tired: true }).best.isCar));
test('Втома + негода + багаж → таксі', () => eq(rec(S(), { tired: true, badWeather: true, luggage: true }).best.key, 'taxi|taxi'));
test('Поспіх → авто', () => eq(rec(S(), { hurry: true }).best.key, 'car|car'));
test('Пояснення містить причину', () => { const r = rec(S()); ok(r.explanation.reasons.length > 0); ok(/Найдешевший/.test(r.explanation.reasons[0].text)); });
test('Немає увімкнених маршрутів ГТ — ECO недоступний, решта працює', () => {
  const r = rec(S((s) => { s.transit.routes.forEach((x) => { x.enabled = false; }); s.flex.back = 'taxi'; }));
  eq(r.modes.eco, null); ok(r.modes.auto && r.modes.taxi && r.best);
});

/* ── Числа ── */
test('Числа: кома, пробіли, сміття, межі', () => {
  near(E.toNum('89,38'), 89.38, 1e-9); near(E.toNum(' 1 200,5 '), 1200.5, 1e-9);
  eq(E.toNum('', 7), 7); eq(E.toNum('abc', 3), 3); eq(E.toNum('12,5,3', 0), 0);
  eq(E.num('-5', 0, 100, 1), 0); eq(E.num('150', 0, 100, 1), 100);
});
test('Нормалізація некоректних налаштувань', () => {
  const warns = [];
  const st = normalizeState({ settings: { trip: { passengers: 99 }, car: { fuelPrice: 'abc', distanceKm: -3 } } }, (p, m) => warns.push(p + m));
  eq(st.settings.trip.passengers, 8); eq(st.settings.car.fuelPrice, 89.38); eq(st.settings.car.distanceKm, 0);
  ok(warns.length >= 3);
});
test('Нуль кілометрів: авто коштує лише паркування', () => near(rec(S((s) => { s.car.distanceKm = 0; })).modes.auto.cost.decision, 90, 1e-9));

/* ── Банк комфорту ── */
const trip = (date, cost, baseFull, extra = {}) => ({ id: date + cost, kind: 'trip', date, mode: 'eco', cost, wear: 0, baseCash: baseFull - 42, baseFull, minutes: 110, fromBank: false, ...extra });
test('Банк комфорту: 2400 ₴ × 30 % = 720 ₴ на таксі, 1680 ₴ чистої економії', () => {
  const b = E.bankSummary([trip('2026-11-02', 40, 2440)], S());
  near(b.gross, 2400, 1e-9); near(b.reserved, 720, 1e-9); near(b.balance, 720, 1e-9); near(b.net, 1680, 1e-9); eq(b.taxiTrips, 4);
});
test('Банк комфорту: перевитрата помітна, економія не подвоюється', () => {
  const b = E.bankSummary([trip('2026-11-02', 40, 2440), trip('2026-11-03', 900, 0, { mode: 'taxi', fromBank: true })], S());
  near(b.spent, 900, 1e-9); near(b.balance, -180, 1e-9); ok(b.overspent); near(b.net, 1500, 1e-9);
});
test('Купівля проїзного зменшує фактичну економію', () => {
  const b = E.bankSummary([trip('2026-11-02', 0, 244.6), { id: 'p', kind: 'pass', date: '2026-11-02', type: 'weekly', start: '2026-11-02', end: '2026-11-08', persons: 2, price: 200 }], S());
  near(b.gross, 44.6, 1e-9);
});
test('Прогноз окремо від факту: записаний день не прогнозується', () => {
  const hist = [trip('2026-11-02', 40, CAR_FULL)];
  const pr = E.projectedSavings(S(), {}, hist, { ...NOV, today: '2026-11-01' });
  eq(pr.days, 20);
  near(E.bankSummary(hist, S()).gross, CAR_FULL - 40, 1e-6);
});

/* ── Резервна копія ── */
test('Експорт → імпорт відновлює дані', () => {
  const raw = defaultState();
  raw.history.push(trip('2026-11-02', 40, 244.6));
  raw.calendar['2026-11-03'] = { type: 'taxi' };
  raw.settings.car.fuelPrice = 92.5;
  const st = normalizeState(raw);
  const v = validateImport(exportJSON(st));
  ok(v.ok, v.errors.join(';'));
  eq(JSON.stringify(v.state.settings), JSON.stringify(st.settings));
  eq(JSON.stringify(v.state.history), JSON.stringify(st.history));
  eq(JSON.stringify(v.state.calendar), JSON.stringify(st.calendar));
});
test('Імпорт відхиляє чужі й пошкоджені файли', () => {
  ok(!validateImport('{oops').ok);
  ok(!validateImport('[]').ok);
  ok(!validateImport(JSON.stringify({ schema: 'other', version: 1, settings: {} })).ok);
  ok(!validateImport(JSON.stringify({ schema: 'mobility-zero', version: 99, settings: {} })).ok);
  ok(!validateImport(JSON.stringify({ schema: 'mobility-zero', version: 1, settings: {}, history: 'x' })).ok);
});
test('Імпорт пропускає зіпсовані записи з попередженням', () => {
  const v = validateImport(JSON.stringify({ schema: 'mobility-zero', version: 1, settings: {}, history: [{ kind: 'trip', date: 'вчора' }, trip('2026-11-02', 40, 244)] }));
  ok(v.ok); eq(v.state.history.length, 1); ok(v.warnings.length >= 1);
});

/* ── Навігація ── */
test('Координати та посилання на карти', () => {
  const c = E.parseCoords('48.4647, 35.0462'); near(c.lat, 48.4647, 1e-9);
  near(E.parseCoords('48,4647 35,0462').lng, 35.0462, 1e-9);
  eq(E.parseCoords('abc'), null);
  const l = E.navLinks(S());
  ok(l.google.startsWith('https://www.google.com/maps/dir/?api=1&origin='));
  ok(l.apple.includes('dirflg=r'));
  const sw = E.navLinks(S((s) => { s.route.swapped = true; }));
  ok(sw.google.includes(encodeURIComponent('вулиця Якова Самарського, 10, Дніпро') + '&destination='));
});

/* ── Запуск ── */
export function runAll() {
  const results = [];
  for (const c of cases) {
    try { c.fn(); results.push({ name: c.name, ok: true }); } catch (e) { results.push({ name: c.name, ok: false, error: e.message }); }
  }
  return results;
}

if (typeof window === 'undefined' && typeof process !== 'undefined') {
  const res = runAll();
  for (const r of res) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n    ${r.error}`}`);
  const failed = res.filter((r) => !r.ok).length;
  console.log(`\n${res.length - failed}/${res.length} тестів пройдено`);
  process.exitCode = failed ? 1 : 0;
}
