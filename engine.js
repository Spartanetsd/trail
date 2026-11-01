// MOBILITY TRAIL — engine.js
// Розрахунковий рушій: без DOM і без сховища, тож його можна перевіряти тестами.
// Одиниці: гроші — гривні (₴), час — хвилини, відстань — кілометри, пальне — літри.

export const ENGINE_VERSION = '1.4.0';

/* ───────────────────────── Числа ───────────────────────── */

// Приймає число або рядок («89,38», « 1 200 »). Повертає fallback для порожнього / некоректного.
export function toNum(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string') return fallback;
  let s = value.replace(/[\s  ]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  if (s === '' || s === '-' || s === '.' || s === '-.') return fallback;
  if (!/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(s) && !/^-?\d+\.$/.test(s)) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

export function num(value, min = 0, max = Infinity, fallback = min) {
  return clamp(toNum(value, fallback), min, max);
}

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const NF = [0, 1, 2].map((d) => new Intl.NumberFormat('uk-UA', { minimumFractionDigits: d === 2 ? 2 : 0, maximumFractionDigits: d }));

export function fmtNum(n, digits = 0) {
  let x = Number.isFinite(n) ? n : 0;
  if (Math.abs(x) < 0.005) x = 0;
  return NF[clamp(digits, 0, 2)].format(x).replace('-', '−');
}
export const fmtUAH = (n, digits = 0) => `${fmtNum(n, digits)} ₴`;
export const fmtGrn = (n) => `${fmtNum(n, 0)} грн`;

export function fmtMin(m) {
  const t = Math.max(0, Math.round(Number.isFinite(m) ? m : 0));
  if (t < 60) return `${t} хв`;
  const h = Math.floor(t / 60), r = t % 60;
  return r ? `${h} год ${r} хв` : `${h} год`;
}
export const fmtHours = (min) => `${fmtNum((Number.isFinite(min) ? min : 0) / 60, 1)} год`;

export function plural(n, forms) {
  const a = Math.abs(Math.trunc(n)) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function parseHM(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
export function fmtHM(totalMin) {
  const t = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/* ───────────────────────── Дати (локальні, без часових поясів) ───────────────────────── */

export function parseDate(str) {
  if (typeof str !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
  return d;
}
export const isDateStr = (s) => parseDate(s) !== null;
export function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const todayStr = (now = new Date()) => fmtDate(now);
export function addDays(str, n) { const d = parseDate(str); d.setDate(d.getDate() + n); return fmtDate(d); }
export function dayDiff(a, b) {
  const da = parseDate(a), db = parseDate(b);
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
}
export const isoDow = (str) => (parseDate(str).getDay() + 6) % 7; // 0 = понеділок
export const monthStart = (str) => `${str.slice(0, 8)}01`;
export function monthEnd(str) { const d = parseDate(str); return fmtDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
export const weekStart = (str) => addDays(str, -isoDow(str));
export const weekEnd = (str) => addDays(str, 6 - isoDow(str));
const MONTH_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const MONTH_NOM = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
export const fmtDayMonth = (str) => `${Number(str.slice(8, 10))} ${MONTH_GEN[Number(str.slice(5, 7)) - 1]}`;
export const fmtMonthYear = (str) => `${MONTH_NOM[Number(str.slice(5, 7)) - 1]} ${str.slice(0, 4)}`;
export function addMonths(str, n) {
  const d = parseDate(str);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, last));
  return fmtDate(t);
}
export function dateRange(from, to, limit = 3700) {
  const out = [];
  if (!isDateStr(from) || !isDateStr(to) || from > to) return out;
  let d = from;
  while (d <= to && out.length < limit) { out.push(d); d = addDays(d, 1); }
  return out;
}

/* ───────────────────────── Довідники ───────────────────────── */

// Базові коефіцієнти моделі оцінювання (0–100). Це прозорі припущення, а не виміряні дані.
export const SEGMENT_MODES = {
  tram:    { label: 'Трамвай',             comfort: 62, reliability: 80, traffic: 0.35, variance: 0.15, fare: true },
  trolley: { label: 'Тролейбус',           comfort: 58, reliability: 74, traffic: 0.75, variance: 0.20, fare: true },
  bus:     { label: 'Автобус / маршрутка', comfort: 50, reliability: 66, traffic: 0.90, variance: 0.25, fare: true },
  metro:   { label: 'Метро',               comfort: 68, reliability: 93, traffic: 0.00, variance: 0.05, fare: true },
  walk:    { label: 'Пішки',               comfort: 70, reliability: 96, traffic: 0.00, variance: 0.05, fare: false },
  taxi:    { label: 'Таксі',               comfort: 88, reliability: 76, traffic: 1.00, variance: 0.20, fare: false },
};
export const FARE_MODES = ['tram', 'trolley', 'bus', 'metro'];

// Номери на одному відрізку: «157А, 146А», «157А або 146А», «157А / 146А» — будь-який підходить.
export function parseLines(str) {
  const out = [];
  for (const raw of String(str ?? '').split(/\s*(?:,|;|\/|\||\s+або\s+|\s+чи\s+)\s*/i)) {
    const t = raw.trim().slice(0, 12);
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

// Очікування на зупинці. w — скільки в середньому чекати ОДИН номер.
// Якщо підходять n незалежних номерів із подібним інтервалом, перший приходить за 2w/(n+1):
// два номери — ⅔ від w, три — ½, чотири — ⅖. Модель рівномірного руху, обережніша за «w/n».
export const waitAny = (w, n) => (n > 1 ? (2 * w) / (n + 1) : w);

// Окрема ціна посадки (напр., Ретро-трамвай) — спецтариф: звичайний проїзний її не покриває.
export function isCoverable(f, covers) {
  if (!f || f.special) return false;
  return covers instanceof Set ? covers.has(f.mode) : (covers || []).includes(f.mode);
}

export const PLAN_MODES = ['eco', 'comfort', 'auto', 'taxi', 'flex', 'best'];
export const DAY_TYPES = [...PLAN_MODES, 'off', 'away'];
export const MODE_INFO = {
  eco:     { code: 'ECO',     name: 'Громадський транспорт', hint: 'ГТ туди й назад' },
  comfort: { code: 'COMFORT', name: 'ГТ туди, таксі назад',  hint: 'ранок економно, вечір комфортно' },
  auto:    { code: 'AUTO',    name: 'Власний автомобіль',    hint: 'одне авто на всіх' },
  taxi:    { code: 'TAXI',    name: 'Таксі туди й назад',    hint: 'одне спільне таксі' },
  flex:    { code: 'FLEX',    name: 'Ваша комбінація',       hint: 'свій вибір на кожен напрямок' },
  best:    { code: 'BEST',    name: 'Автопідбір',            hint: 'найкраща комбінація за вагами' },
  off:     { code: 'Вихідний', name: 'Вихідний',            hint: 'без поїздок' },
  away:    { code: 'Не в Дніпрі', name: 'Не в Дніпрі',      hint: 'без поїздок містом' },
};

export const DEFAULT_STATE = Object.freeze({
  tired: false, hurry: false, badWeather: false, luggage: false, crowded: false, traffic: false, roundTrip: true,
});

/* ───────────────────────── Допоміжне ───────────────────────── */

export const vehicles = (people, capacity) => Math.max(1, Math.ceil(Math.max(1, people) / Math.max(1, capacity)));
export const joinOr = (arr) => (arr.length <= 1 ? arr[0] || '' : `${arr.slice(0, -1).join(', ')} або ${arr[arr.length - 1]}`);
const FOR_GROUP = { 2: 'на двох', 3: 'на трьох', 4: 'на чотирьох' };
export const forGroup = (P) => (P <= 1 ? '' : FOR_GROUP[P] || `на ${P} осіб`);
export const routesById = (s) => Object.fromEntries((s.transit.routes || []).map((r) => [r.id, r]));
export const isPureTransit = (route) => !!route && route.segments.length > 0 && route.segments.every((g) => g.mode !== 'taxi');

function trafficFactor(s, st, sens) {
  const T = st.traffic ? s.misc.trafficFactor : 1;
  return 1 + (T - 1) * sens;
}
const walkFactor = (st) => (st.luggage ? 1.25 : 1) * (st.badWeather ? 1.1 : 1);

// Скільки людей платять за посадку цього виду транспорту з урахуванням пільги та діючого проїзного.
// Пільговики рахуються «з кінця» списку пасажирів, власники проїзного — «з початку»,
// тож одна людина не звільняється двічі.
export function payersFor(mode, s, ctx, special = false) {
  const P = s.trip.passengers;
  const b = s.benefit;
  const B = b.enabled && ctx.eligible && b.modes.includes(mode) ? Math.min(b.persons, P) : 0;
  const K = !special && s.transit.passes.covers.includes(mode) ? Math.min(ctx.passPersons || 0, P) : 0;
  return Math.max(0, P - B - K);
}

/* ───────────────────────── Відрізки (legs) ───────────────────────── */

// Маршрути задаються в напрямку А → Б. Коли точки поміняно місцями (дорога додому),
// ті самі номери йдуть у зворотному порядку: зупинки «звідки/куди» міняються, ходьба зсувається.
// Сума часу й ціна від цього не змінюються — лише порядок кроків.
export function orientedSegments(route, swapped = false) {
  const segs = route.segments;
  if (!swapped || !segs.length) return { segments: segs, walkEndMin: route.walkEndMin };
  const n = segs.length;
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    const g = segs[k];
    out.push({ ...g, from: g.to || '', to: g.from || '', walkMin: k === n - 1 ? route.walkEndMin : segs[k + 1].walkMin });
  }
  return { segments: out, walkEndMin: segs[0].walkMin };
}

export function transitLeg(route, s, ctx) {
  const st = ctx.state, P = s.trip.passengers;
  const { segments, walkEndMin } = orientedSegments(route, !!s.route?.swapped);
  const wf = walkFactor(st);
  const ptSlow = 1 + (s.misc.ptSlowPct || 0) / 100;
  let walk = 0, wait = 0, ride = 0, boardings = 0, taxiSegs = 0, maxWait = 0, spare = 0;
  let wSum = 0, cAcc = 0, rAcc = 0, ptRide = 0, trafAcc = 0, variance = 0;
  let transitCost = 0, taxiCost = 0;
  const fares = [];
  const steps = [];
  for (const g of segments) {
    const m = SEGMENT_MODES[g.mode] || SEGMENT_MODES.tram;
    const gWalk = g.walkMin * wf;
    walk += gWalk;
    if (g.mode === 'walk') {
      walk += g.rideMin * wf;
      steps.push({ kind: 'walk', mode: 'walk', lines: [], n: 0, from: g.from || '', to: g.to || '', stops: 0, walk: gWalk + g.rideMin * wf, wait: 0, wait1: 0, ride: 0, fare: 0, cost: 0, special: false });
      continue;
    }
    const r = g.rideMin * trafficFactor(s, st, m.traffic) * (g.mode === 'taxi' ? 1 : ptSlow);
    const lines = parseLines(g.line);
    const n = Math.max(1, lines.length);
    let gw, fare = 0, cost = 0, special = false;
    if (g.mode === 'taxi') {
      gw = g.waitMin + (st.badWeather ? 3 : 0);
      taxiSegs += 1;
      cost = g.price * vehicles(P, s.taxi.capacity);
      fare = g.price;
      taxiCost += cost;
    } else {
      // Кілька номерів на зупинці: сідаємо в перший, що прийде, — чекаємо менше.
      gw = waitAny(g.waitMin, n);
      spare += n - 1;
      boardings += 1;
      ptRide += r;
      special = g.price > 0;
      fare = special ? g.price : s.transit.fares[g.mode] ?? 0;
      fares.push({ mode: g.mode, fare, special });
      cost = fare * payersFor(g.mode, s, ctx, special);
      transitCost += cost;
    }
    steps.push({ kind: g.mode === 'taxi' ? 'taxi' : 'ride', mode: g.mode, lines, n, from: g.from || '', to: g.to || '', stops: g.stops || 0, walk: gWalk, wait: gw, wait1: g.waitMin, ride: r, fare, cost, special });
    wait += gw;
    maxWait = Math.max(maxWait, gw);
    ride += r;
    wSum += r;
    cAcc += m.comfort * r;
    rAcc += m.reliability * r;
    trafAcc += m.traffic * r;
    variance += r * (m.variance + (st.traffic ? m.traffic * 0.15 : 0));
  }
  walk += walkEndMin * wf;
  const transfers = Math.max(0, boardings + taxiSegs - 1);
  const ptShare = wSum > 0 ? ptRide / wSum : 0;
  const trafShare = wSum > 0 ? trafAcc / wSum : 0;

  let comfort = (wSum > 0 ? cAcc / wSum : 70) - 7 * transfers;
  comfort -= wait * (st.badWeather ? 0.9 : 0.35);
  comfort -= st.badWeather ? walk * 0.6 : Math.max(0, walk - 10) * 0.3;
  if (st.crowded) comfort -= 12 * ptShare;
  if (st.luggage) comfort -= 8 * boardings + 0.4 * walk;
  if (st.tired) comfort -= 8 * ptShare + 0.2 * walk;

  let reliability = (wSum > 0 ? rAcc / wSum : 92) - 6 * transfers - (route.confirmed ? 0 : 10);
  reliability -= 0.6 * Math.max(0, maxWait - 6);
  // Запасні номери на тій самій зупинці: зірваний рейс одного номера вже не зриває поїздку.
  reliability += Math.min(6, 3 * spare);
  if (st.badWeather) reliability -= 4;
  if (st.traffic) reliability -= 18 * trafShare;

  const buffer = Math.max(2, Math.round(variance + 2 * transfers + (route.confirmed ? 0 : 4) + (st.traffic ? 3 : 0) + (st.badWeather ? 2 : 0)));
  return {
    kind: 'route', id: route.id, label: route.name, confirmed: !!route.confirmed, pure: taxiSegs === 0, src: route.src || '',
    minutes: walk + wait + ride, walk, wait, ride, boardings, transfers, spare,
    transitCost, taxiCost, cost: transitCost + taxiCost, fares, steps, walkEnd: walkEndMin * wf,
    comfort: clamp(comfort, 5, 98), reliability: clamp(reliability, 5, 98), buffer,
    outdoor: walk + wait,
  };
}

// Обраний тариф таксі (Bolt, Priority…) або null, якщо ціна своя.
export const selectedTariff = (s) => (s.taxi.tariffs || []).find((t) => t.id === s.taxi.tariff) || null;

// Підказка щодо тарифу під сьогоднішній стан: поспіх — Priority, багаж — Comfort.
export function taxiTariffTip(s, st = DEFAULT_STATE) {
  const list = s.taxi.tariffs || [];
  const by = (id) => list.find((t) => t.id === id);
  const base = s.taxi.price;
  const tip = (t, why) => (t && t.id !== s.taxi.tariff && t.price > base ? { tariff: t, extra: (t.price - base) * vehicles(s.trip.passengers, s.taxi.capacity), why } : null);
  return (st.hurry && tip(by('priority'), 'авто знайдуть швидше')) || (st.luggage && tip(by('comfort'), 'більше місця для речей')) || null;
}

export function taxiLeg(s, ctx) {
  const st = ctx.state, P = s.trip.passengers;
  const tariff = selectedTariff(s);
  const veh = vehicles(P, s.taxi.capacity);
  const wait = s.taxi.waitMin + (st.badWeather ? 3 : 0);
  const ride = s.taxi.rideMin * trafficFactor(s, st, 1);
  const cost = s.taxi.price * veh;
  const comfort = 88 - wait * (st.badWeather ? 0.5 : 0.25) - (st.traffic ? 6 : 0);
  const reliability = 78 - (st.badWeather ? 10 : 0) - (st.traffic ? 16 : 0) - Math.max(0, wait - 8) * 0.5;
  return {
    kind: 'taxi', id: 'taxi', label: tariff ? `Таксі ${tariff.name}` : 'Таксі', tariff, confirmed: true, pure: false,
    minutes: wait + ride, walk: 0, wait, ride, boardings: 0, transfers: 0,
    transitCost: 0, taxiCost: cost, cost, fares: [], vehicles: veh,
    comfort: clamp(comfort, 5, 98), reliability: clamp(reliability, 5, 98),
    buffer: Math.max(2, Math.round(ride * (0.2 + (st.traffic ? 0.15 : 0)) + wait * 0.3)),
    outdoor: 0,
  };
}

// free = true — авто ставимо на безкоштовну стоянку й доходимо пішки (паркування 0 ₴, більше ходьби).
export function carLeg(s, ctx, free = false) {
  const st = ctx.state;
  const drive = s.car.driveMin * trafficFactor(s, st, 1);
  const extra = free ? s.car.freeParkWalkMin || 0 : 0;
  const walk = s.car.parkWalkMin + extra + (st.badWeather ? 2 : 0);
  let comfort = 76 - (st.tired ? 28 : 0) - (st.traffic ? 12 : 0) - (st.badWeather ? 4 : 0) + (st.luggage ? 4 : 0);
  comfort -= extra * ((st.badWeather ? 0.6 : 0.2) + (st.luggage ? 0.4 : 0));
  const reliability = 84 - (st.traffic ? 18 : 0) - (st.badWeather ? 6 : 0) - (st.tired ? 12 : 0) - (extra > 0 ? 2 : 0);
  return {
    kind: 'car', id: free ? 'carfree' : 'car', label: free ? 'Авто + безкоштовна стоянка' : 'Авто', free, confirmed: true, pure: false,
    minutes: drive + walk, walk, wait: 0, ride: drive, boardings: 0, transfers: 0,
    transitCost: 0, taxiCost: 0, cost: 0, fares: [],
    comfort: clamp(comfort, 5, 98), reliability: clamp(reliability, 5, 98),
    buffer: Math.max(2, Math.round(drive * (0.18 + (st.traffic ? 0.17 : 0)) + 2)),
    outdoor: walk,
  };
}

// Витрати авто за день (legs = 2 туди-назад, 1 в один бік). Авто одне на компанію:
// пальне й паркування НЕ множаться на пасажирів (лише на кількість машин, якщо людей більше за місця).
export function carCosts(s, ctx, legs = 2, free = false) {
  const st = ctx.state || DEFAULT_STATE, P = s.trip.passengers;
  const veh = vehicles(P, s.car.capacity);
  const km = s.car.distanceKm * legs * veh;
  const factor = (s.car.winter ? 1 + s.car.winterExtraPct / 100 : 1) * (st.traffic ? 1 + s.car.trafficFuelPct / 100 : 1);
  const liters = km * (s.car.consumption / 100) * factor;
  const fuel = liters * s.car.fuelPrice;
  const wear = km * s.car.wearPerKm;
  const parking = free ? 0 : s.car.parkingPerHour * s.car.parkingHours * veh;
  return { km, liters, fuel, wear, parking, cash: fuel + parking, economic: fuel + parking + wear, vehicles: veh };
}

/* ───────────────────────── Варіанти поїздки ───────────────────────── */

const legKey = (sp) => (sp.type === 'route' ? `r:${sp.id}` : sp.type === 'car' && sp.free ? 'carfree' : sp.type);
export const specKey = (sp) => `${legKey(sp.there)}|${sp.back ? legKey(sp.back) : '-'}`;

function buildLeg(sp, s, ctx, byId) {
  if (sp.type === 'taxi') return taxiLeg(s, ctx);
  if (sp.type === 'car') return carLeg(s, ctx, !!sp.free);
  const r = byId[sp.id];
  return r && r.segments.length ? transitLeg(r, s, ctx) : null;
}

export function evaluateOption(spec, s, ctx, byId = routesById(s)) {
  const roundTrip = ctx.state.roundTrip !== false;
  const isCar = spec.there.type === 'car';
  if (isCar && spec.back && (spec.back.type !== 'car' || !!spec.back.free !== !!spec.there.free)) return null; // авто не можна «кинути» на півдорозі
  const there = buildLeg(spec.there, s, ctx, byId);
  const back = roundTrip && spec.back ? buildLeg(spec.back, s, ctx, byId) : null;
  if (!there || (roundTrip && spec.back && !back)) return null;
  const legs = back ? [there, back] : [there];

  let transit = 0, taxi = 0;
  for (const l of legs) { transit += l.transitCost; taxi += l.taxiCost; }
  const car = isCar ? carCosts(s, ctx, legs.length, !!spec.there.free) : { km: 0, liters: 0, fuel: 0, wear: 0, parking: 0 };
  const cash = transit + taxi + car.fuel + car.parking;
  const economic = cash + car.wear;
  const decision = s.car.includeWear ? economic : cash;

  const same = !back || legKey(spec.there) === legKey(spec.back);
  const title = same ? there.label : `${there.label} + ${back.label}`;
  return {
    key: specKey({ there: spec.there, back: back ? spec.back : null }),
    spec: { there: spec.there, back: back ? spec.back : null },
    there, back, legs, title, isCar,
    cost: { transit, taxi, fuel: car.fuel, wear: car.wear, parking: car.parking, liters: car.liters, km: car.km, cash, economic, decision },
    minutes: legs.reduce((a, l) => a + l.minutes, 0),
    oneWay: there.minutes,
    comfort: legs.reduce((a, l) => a + l.comfort, 0) / legs.length,
    reliability: back ? there.reliability * 0.65 + back.reliability * 0.35 : there.reliability,
    buffer: there.buffer,
    transfers: legs.reduce((a, l) => a + l.transfers, 0),
    outdoor: legs.reduce((a, l) => a + l.outdoor, 0),
    unconfirmed: legs.some((l) => l.kind === 'route' && !l.confirmed),
  };
}

/* ───────────────────────── Ваги та оцінка 0–100 ───────────────────────── */

export const WEIGHT_KEYS = ['cost', 'comfort', 'speed', 'reliability'];
export const WEIGHT_LABELS = { cost: 'Економія', comfort: 'Комфорт', speed: 'Швидкість', reliability: 'Надійність' };

// Готові набори пріоритетів: одне торкання замість чотирьох повзунків.
export const WEIGHT_PRESETS = {
  max: { label: 'Максимум економії', w: { cost: 70, comfort: 10, speed: 10, reliability: 10 } },
  balance: { label: 'Економія й комфорт', w: { cost: 45, comfort: 25, speed: 20, reliability: 10 } },
  comfort: { label: 'Комфорт', w: { cost: 25, comfort: 50, speed: 15, reliability: 10 } },
  time: { label: 'Час', w: { cost: 20, comfort: 15, speed: 45, reliability: 20 } },
};
export function presetOf(w) {
  const n = normalizeWeights(w);
  for (const [k, p] of Object.entries(WEIGHT_PRESETS)) {
    const q = normalizeWeights(p.w);
    if (WEIGHT_KEYS.every((key) => Math.abs(n[key] - q[key]) < 0.005)) return k;
  }
  return null;
}

export function normalizeWeights(w) {
  const vals = WEIGHT_KEYS.map((k) => Math.max(0, toNum(w?.[k], 0)));
  const sum = vals.reduce((a, b) => a + b, 0);
  const out = {};
  WEIGHT_KEYS.forEach((k, i) => { out[k] = sum > 0 ? vals[i] / sum : 0.25; });
  return out;
}

// Стан людини додає відсоткові пункти до ваг, після чого ваги знову нормуються до 100 %.
export const STATE_BUMPS = {
  hurry: { speed: 0.20, reliability: 0.12 },
  tired: { comfort: 0.18 },
  luggage: { comfort: 0.08 },
  badWeather: { comfort: 0.06 },
};
export function effectiveWeights(w, st = DEFAULT_STATE) {
  const n = normalizeWeights(w);
  for (const [flag, bump] of Object.entries(STATE_BUMPS)) {
    if (st[flag]) for (const [k, v] of Object.entries(bump)) n[k] += v;
  }
  return normalizeWeights(n);
}

// Лінійна шкала: найкраще значення = 100. Мінімальний «розмах» 50 % від максимуму,
// щоб дрібна різниця (напр., 100 ₴ проти 105 ₴) не перетворювалась на 100 проти 0 балів.
export function scaleScore(v, min, max) {
  const spread = Math.max(max - min, 0.5 * max, 1e-9);
  return clamp(100 * (1 - (v - min) / spread), 0, 100);
}

export function scoreOptions(options, weights) {
  if (!options.length) return options;
  const cs = options.map((o) => o.cost.decision), ts = options.map((o) => o.minutes);
  const cmin = Math.min(...cs), cmax = Math.max(...cs), tmin = Math.min(...ts), tmax = Math.max(...ts);
  for (const o of options) {
    o.scores = {
      cost: scaleScore(o.cost.decision, cmin, cmax),
      speed: scaleScore(o.minutes, tmin, tmax),
      comfort: o.comfort,
      reliability: o.reliability,
    };
    o.contrib = {};
    let total = 0;
    for (const k of WEIGHT_KEYS) { o.contrib[k] = weights[k] * o.scores[k]; total += o.contrib[k]; }
    o.total = clamp(total, 0, 100);
  }
  return options;
}

const byScore = (a, b) => (b.total - a.total) || (a.cost.decision - b.cost.decision) || (a.minutes - b.minutes);

/* ───────────────────────── Рекомендація ───────────────────────── */

export function makeCtx(input = {}) {
  return {
    state: { ...DEFAULT_STATE, ...(input.state || {}) },
    eligible: !!input.eligible,
    passPersons: Math.max(0, Math.floor(input.passPersons || 0)),
  };
}

function flexSpec(s, roundTrip, byId) {
  const leg = (v) => (v === 'taxi' ? { type: 'taxi' } : byId[v] && byId[v].segments.length ? { type: 'route', id: v } : null);
  const there = leg(s.flex.there);
  if (!there) return null;
  if (!roundTrip) return { there, back: null };
  const back = leg(s.flex.back);
  return back ? { there, back } : null;
}

export function recommend(s, ctxIn = {}) {
  const ctx = makeCtx(ctxIn);
  const byId = routesById(s);
  const roundTrip = ctx.state.roundTrip !== false;
  const enabled = s.transit.routes.filter((r) => r.enabled && r.segments.length);
  const legSpecs = [...enabled.map((r) => ({ type: 'route', id: r.id })), { type: 'taxi' }];
  const specs = [];
  const carSpecs = [{ type: 'car' }];
  if (s.car.freeParkWalkMin > 0) carSpecs.push({ type: 'car', free: true });
  if (roundTrip) {
    for (const a of legSpecs) for (const b of legSpecs) specs.push({ there: a, back: b });
    for (const c of carSpecs) specs.push({ there: c, back: c });
  } else {
    for (const a of legSpecs) specs.push({ there: a, back: null });
    for (const c of carSpecs) specs.push({ there: c, back: null });
  }
  const fSpec = flexSpec(s, roundTrip, byId);
  if (fSpec && !specs.some((sp) => specKey(sp) === specKey(fSpec))) specs.push(fSpec);

  const options = specs.map((sp) => evaluateOption(sp, s, ctx, byId)).filter(Boolean);
  const weights = effectiveWeights(s.weights, ctx.state);
  scoreOptions(options, weights);
  const find = (key) => options.find((o) => o.key === key) || null;

  const modes = {};
  const ecoCands = options.filter((o) => o.spec.there.type === 'route' && byId[o.spec.there.id]?.enabled && isPureTransit(byId[o.spec.there.id])
    && (!roundTrip || (o.spec.back?.type === 'route' && o.spec.back.id === o.spec.there.id)));
  const pref = s.transit.ecoRoute && s.transit.ecoRoute !== 'auto' ? s.transit.ecoRoute : null;
  modes.eco = (pref && ecoCands.find((o) => o.spec.there.id === pref)) || ecoCands.sort(byScore)[0] || null;
  modes.comfort = roundTrip && modes.eco ? find(specKey({ there: modes.eco.spec.there, back: { type: 'taxi' } })) : null;
  modes.auto = options.filter((o) => o.isCar).sort(byScore)[0] || null;
  modes.taxi = find(roundTrip ? 'taxi|taxi' : 'taxi|-');
  modes.flex = fSpec ? find(specKey(fSpec)) : null;
  const sorted = [...options].sort(byScore);
  modes.best = sorted[0] || null;

  const named = ['eco', 'comfort', 'auto', 'taxi', 'flex'];
  const modeOf = (o) => (o ? named.find((m) => modes[m] && modes[m].key === o.key) || null : null);
  const ranking = named.filter((m) => modes[m]).map((m) => ({ mode: m, opt: modes[m] })).sort((a, b) => byScore(a.opt, b.opt));
  const best = modes.best;
  const altEntry = ranking.find((r) => best && r.opt.key !== best.key) || null;
  const alt = altEntry ? altEntry.opt : null;
  const result = { ctx, weights, options, modes, best, bestMode: modeOf(best), alt, altMode: altEntry ? altEntry.mode : null, ranking, sorted };
  result.explanation = best ? explain(result, s) : { reasons: [], tradeoff: null, notes: [], close: false };
  return result;
}

// Назва варіанта для речення: «авто», «таксі» або «Трамвай №15».
export function optName(o, modes) {
  if (!o) return '';
  if (modes.auto && o.key === modes.auto.key) return 'авто';
  if (modes.taxi && o.key === modes.taxi.key) return 'таксі';
  return `«${o.title}»`;
}

function explain(res, s) {
  const { best, alt, options, weights, modes, ctx } = res;
  const st = ctx.state;
  const reasons = [], notes = [];
  let tradeoff = null;
  const cheapest = [...options].sort((a, b) => a.cost.decision - b.cost.decision)[0];
  const fastest = [...options].sort((a, b) => a.minutes - b.minutes)[0];
  const period = st.roundTrip !== false ? 'за день' : 'за поїздку';

  if (cheapest && best.key === cheapest.key) reasons.push({ k: 'cost', text: `Найдешевший варіант: ${fmtGrn(best.cost.decision)} ${period}` });
  if (fastest && best.key === fastest.key) reasons.push({ k: 'speed', text: `Найшвидший: ${fmtMin(best.oneWay)} в один бік` });

  if (alt) {
    const an = optName(alt, modes);
    const diffs = WEIGHT_KEYS.map((k) => ({ k, d: weights[k] * (best.scores[k] - alt.scores[k]) })).sort((a, b) => b.d - a.d);
    for (const { k, d } of diffs) {
      if (d < 0.5 || reasons.some((r) => r.k === k) || reasons.length >= 3) continue;
      if (k === 'cost') {
        const dc = alt.cost.decision - best.cost.decision;
        if (dc >= 1) reasons.push({ k, text: `Дешевше на ${fmtGrn(dc)} ${period}, ніж ${an}` });
      } else if (k === 'speed') {
        const dm = alt.minutes - best.minutes;
        if (dm >= 1) reasons.push({ k, text: `На ${fmtMin(dm)} менше в дорозі, ніж ${an}` });
      } else if (k === 'comfort') {
        let text = `Комфортніше, ніж ${an}`;
        if (best.transfers < alt.transfers) text = `Менше пересадок, ніж ${an}`;
        else if (st.tired && alt.isCar && !best.isCar) text = `Не треба кермувати самому, на відміну від ${an}`;
        else if (best.outdoor + 5 < alt.outdoor) text = `Менше часу на вулиці, ніж ${an}`;
        reasons.push({ k, text });
      } else if (k === 'reliability') {
        let why = 'передбачуваніший час прибуття';
        if (best.transfers < alt.transfers) why = 'менше пересадок — менше ризику запізнитись';
        else if (alt.unconfirmed && !best.unconfirmed) why = 'маршрут перевірений, а не орієнтовний';
        reasons.push({ k, text: `${why[0].toUpperCase()}${why.slice(1)}` });
      }
    }
    const worst = diffs[diffs.length - 1];
    if (worst && worst.d < -0.5) {
      // Якщо альтернативу вже названо в причині, вдруге її не повторюємо.
      const than = reasons[0]?.text.includes(an) ? '' : `, ніж ${an}`;
      if (worst.k === 'cost') tradeoff = `Але дорожче на ${fmtGrn(best.cost.decision - alt.cost.decision)}${than}`;
      if (worst.k === 'speed') tradeoff = `Але довше на ${fmtMin(best.minutes - alt.minutes)} за ${st.roundTrip !== false ? 'день' : 'поїздку'}${than}`;
      if (worst.k === 'comfort') tradeoff = `Але менш комфортно${than}`;
      if (worst.k === 'reliability') tradeoff = `Але вищий ризик запізнення${than}`;
    }
    const gap = best.total - alt.total;
    res.close = gap < 3;
    const g1 = Math.round(gap * 10) / 10;
    const pts = Number.isInteger(g1) ? plural(g1, ['бал', 'бали', 'балів']) : 'бала';
    if (gap < 3) notes.push({ tone: 'info', text: `Відрив від ${an} лише ${fmtNum(g1, 1)} ${pts} — обидва варіанти прийнятні` });
  }
  if (!reasons.length) reasons.push({ k: 'total', text: `Найкращий баланс ваших пріоритетів: ${Math.round(best.total)} зі 100` });

  if (st.tired && !best.isCar) notes.push({ tone: 'good', text: 'Ви втомлені — обрано варіант без самостійного керування' });
  if (st.tired && best.isCar) notes.push({ tone: 'warn', text: 'Ви позначили втому: за кермом будьте уважні або оберіть таксі' });
  if (best.unconfirmed) notes.push({ tone: 'warn', text: 'Маршрут орієнтовний: перевірте зупинки й інтервали в D-transport' });
  const multi = best.there.kind === 'route' ? best.there.steps.find((x) => x.kind === 'ride' && x.n > 1) : null;
  if (multi) notes.push({ tone: 'good', text: `Не чекайте один номер: сідайте в перший із ${joinOr(multi.lines)} — очікування ≈${fmtMin(multi.wait)} замість ≈${fmtMin(multi.wait1)}` });
  if (ctx.eligible && s.benefit.enabled && best.legs.some((l) => l.kind === 'route')) notes.push({ tone: 'info', text: 'Пільгу враховано, бо ви підтвердили відповідність поїздки умовам' });
  if (ctx.passPersons > 0 && best.legs.some((l) => l.fares.some((f) => isCoverable(f, s.transit.passes.covers)))) notes.push({ tone: 'info', text: 'Діє придбаний проїзний: покриті посадки вже оплачені' });
  if (st.badWeather && best.outdoor > 15) notes.push({ tone: 'warn', text: `Погана погода: близько ${fmtMin(best.outdoor)} пішки й на зупинках` });
  const tt = best.legs.some((l) => l.kind === 'taxi') ? taxiTariffTip(s, st) : null;
  if (tt) notes.push({ tone: 'info', text: `Тариф ${tt.tariff.name} дорожчий лише на ${fmtGrn(tt.extra)} за поїздку — ${tt.why}` });
  return { reasons, tradeoff, notes, close: !!res.close };
}

/* ───────────────────────── На зупинці: «а якщо першим прийде інший номер?» ───────────────────────── */

const normStop = (x) => String(x || '').toLowerCase().replace(/[«»"'’ʼ`]/g, '').replace(/\s+/g, ' ').trim();

// Час і гроші від моменту посадки на відрізку k (без очікування на ньому) до точки Б.
function remainderFrom(leg, k) {
  let t = leg.steps[k].ride, cost = 0;
  for (let j = k + 1; j < leg.steps.length; j++) { const x = leg.steps[j]; t += x.walk + x.wait + x.ride; }
  for (let j = k; j < leg.steps.length; j++) cost += leg.steps[j].cost;
  return { t: t + leg.walkEnd, cost };
}

// Що робити, коли на зупинці першим приходить номер з іншого маршруту.
// Порівнюємо: «сісти зараз і їхати далі тим маршрутом» проти «дочекатися свого номера».
// Вердикт: take — сідайте; hurry — швидше, але дорожче; cheaper — дешевше, але довше; skip — не варто.
export function stopAdvice(s, routeOrId, ctxIn = {}) {
  const ctx = makeCtx(ctxIn);
  const byId = routesById(s);
  const route = typeof routeOrId === 'string' ? byId[routeOrId] : routeOrId;
  if (!route || !route.segments.length) return [];
  const leg = transitLeg(route, s, ctx);
  const others = s.transit.routes.filter((r) => r.enabled && r.segments.length && r.id !== route.id).map((r) => ({ r, leg: transitLeg(r, s, ctx) }));
  const hv = s.trip.hourValue || 0, P = s.trip.passengers;
  const out = [];
  leg.steps.forEach((st, k) => {
    if (st.kind !== 'ride') return;
    const here = normStop(st.from);
    if (!here) return;
    const mine = new Set(st.lines.map((x) => x.toLowerCase()));
    const cur = remainderFrom(leg, k);
    const stay = st.wait + cur.t;
    const best = new Map();
    for (const o of others) {
      o.leg.steps.forEach((x, j) => {
        if (x.kind !== 'ride' || normStop(x.from) !== here) return;
        const rem = remainderFrom(o.leg, j);
        const saved = stay - rem.t, dCost = rem.cost - cur.cost;
        const after = o.leg.steps.slice(j + 1).filter((y) => y.kind === 'ride' || y.kind === 'taxi');
        const next = after.length ? `далі ${after.map((y) => `${SEGMENT_MODES[y.mode].label.split(' /')[0].toLowerCase()} ${y.lines.join('/')}`.trim()).join(', ')}` : `до «${x.to || 'кінцевої'}»`;
        for (const ln of x.lines) {
          const key = ln.toLowerCase();
          if (mine.has(key)) continue;
          const prev = best.get(key);
          if (!prev || saved > prev.saved + 0.5 || (Math.abs(saved - prev.saved) <= 0.5 && dCost < prev.dCost)) {
            best.set(key, { line: ln, mode: x.mode, routeId: o.r.id, routeName: o.r.name, next, saved, dCost });
          }
        }
      });
    }
    if (!best.size) return;
    const groups = new Map();
    for (const a of best.values()) {
      const faster = a.saved >= 1, slower = a.saved <= -1, pricier = a.dCost > 0.5, cheaper = a.dCost < -0.5;
      let verdict;
      if (!slower && !pricier) verdict = 'take';
      else if (faster && pricier) verdict = hv > 0 ? ((a.saved / 60) * hv * P >= a.dCost ? 'take' : 'costly') : ctx.state.hurry ? 'take' : 'hurry';
      else if (slower && cheaper) verdict = 'cheaper';
      else verdict = 'skip';
      const gk = `${a.routeId}|${verdict}`;
      const g = groups.get(gk) || { ...a, lines: [], verdict };
      g.lines.push(a.line);
      groups.set(gk, g);
    }
    const rank = { take: 0, hurry: 1, cheaper: 2, costly: 3, skip: 4 };
    const alts = [...groups.values()].sort((a, b) => (rank[a.verdict] - rank[b.verdict]) || (b.saved - a.saved)).slice(0, 4);
    out.push({ k, stop: st.from, lines: st.lines, n: st.n, wait: st.wait, wait1: st.wait1, transfer: k > 0, alts });
  });
  return out;
}

// Коротка порада для однієї альтернативи. P — кількість пасажирів (сума — на всіх).
export function adviceText(a, P = 1) {
  const who = forGroup(P) ? ` ${forGroup(P)}` : '';
  const faster = `≈${fmtMin(a.saved)} швидше`;
  switch (a.verdict) {
    case 'take': {
      if (a.dCost > 0.5) return `сідайте: ${faster}, +${fmtGrn(a.dCost)}${who}`;
      const parts = [];
      if (a.saved >= 1) parts.push(faster);
      if (a.dCost < -0.5) parts.push(`на ${fmtGrn(-a.dCost)} дешевше${who}`);
      return parts.length ? `сідайте: ${parts.join(' і ')}` : 'сідайте: це не гірше';
    }
    case 'hurry': return `сідайте, якщо поспішаєте: ${faster}, але +${fmtGrn(a.dCost)}${who}`;
    case 'cheaper': return `можна, якщо не поспішаєте: на ${fmtGrn(-a.dCost)} дешевше${who}, але довше ≈${fmtMin(-a.saved)}`;
    case 'costly': return `не варто за ціною вашої години: ${faster}, але +${fmtGrn(a.dCost)}${who}`;
    default: return `не варто: ${a.saved <= -1 ? `довше ≈${fmtMin(-a.saved)}` : 'не швидше'}${a.dCost > 0.5 ? `, +${fmtGrn(a.dCost)}${who}` : ''}`;
  }
}

/* ───────────────────────── Календар, пільга, проїзні ───────────────────────── */

export function resolveDayType(date, s, cal) {
  const o = cal?.[date];
  if (o && DAY_TYPES.includes(o.type)) return o.type;
  return s.trip.workDays.includes(isoDow(date)) ? s.trip.defaultMode : 'off';
}

export function resolveEligible(date, s, cal) {
  if (!s.benefit.enabled) return false;
  const o = cal?.[date];
  if (o && typeof o.eligible === 'boolean') return o.eligible;
  return !!s.benefit.defaultEligible;
}

export function passWindowEnd(type, start, passes) {
  if (type === 'weekly') return passes.weeklyType === 'calendar' ? weekEnd(start) : addDays(start, 6);
  if (type === 'monthly') return passes.monthlyType === 'rolling30' ? addDays(start, 29) : monthEnd(start);
  return start;
}

export const ownedPasses = (hist) => (hist || []).filter((r) => r.kind === 'pass' && isDateStr(r.start) && isDateStr(r.end));

export function passPersonsOn(date, hist, P) {
  let n = 0;
  for (const p of ownedPasses(hist)) if (p.start <= date && date <= p.end) n += p.persons;
  return Math.min(P, n);
}

// Оптимальна купівля проїзних для ОДНІЄЇ людини (динамічне програмування).
// dates — відсортовані дні з покривними поїздками; demand[i] — вартість разових квитків того дня.
// На кожному непокритому дні: разові квитки, або тижневий, або місячний від цього дня.
export function passDP(dates, demand, { weekly = null, monthly = null, windowEnd }) {
  const n = dates.length;
  const best = new Array(n + 1).fill(0);
  const choice = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let bc = demand[i] + best[i + 1];
    let ch = { kind: 'single' };
    for (const [type, price] of [['weekly', weekly], ['monthly', monthly]]) {
      if (price == null) continue;
      const end = windowEnd(type, dates[i]);
      let j = i;
      while (j < n && dates[j] <= end) j++;
      const c = price + best[j];
      if (c < bc - 1e-9) { bc = c; ch = { kind: type, start: dates[i], end, next: j }; }
    }
    best[i] = bc;
    choice[i] = ch;
  }
  const purchases = [];
  let singles = 0;
  for (let i = 0; i < n;) {
    const ch = choice[i];
    if (ch.kind === 'single') { singles += demand[i]; i += 1; continue; }
    purchases.push({ type: ch.kind, start: ch.start, end: ch.end, price: ch.kind === 'weekly' ? weekly : monthly, days: dates.slice(i, ch.next) });
    i = ch.next;
  }
  return { total: best[0], purchases, singles };
}

/* ───────────────────────── Період (тиждень, місяць, довільний) ───────────────────────── */

// Синтетичний розклад для ручного режиму калькулятора: останні awayWeeks тижнів — «Не в Дніпрі»,
// далі перші tripDays робочих днів отримують режим mode.
export function synthDayTypes(s, from, to, tripDays, awayWeeks = 0, mode = s.trip.defaultMode) {
  const dates = dateRange(from, to);
  const types = {};
  const awayFrom = awayWeeks > 0 ? dates[Math.max(0, dates.length - awayWeeks * 7)] : null;
  let left = Math.max(0, Math.floor(tripDays));
  const avail = dates.filter((d) => !(awayFrom && d >= awayFrom));
  for (const d of dates) types[d] = awayFrom && d >= awayFrom ? 'away' : 'off';
  for (const d of avail) if (left > 0 && s.trip.workDays.includes(isoDow(d))) { types[d] = mode; left -= 1; }
  for (const d of avail) if (left > 0 && types[d] === 'off') { types[d] = mode; left -= 1; }
  return { types, used: Math.floor(tripDays) - left };
}

export function computePeriod(s, cal, hist, opt = {}) {
  const dates = dateRange(opt.from, opt.to);
  const P = s.trip.passengers;
  const B0 = s.benefit.enabled ? Math.min(s.benefit.persons, P) : 0;
  const covers = new Set(s.transit.passes.covers);
  const noPasses = !!opt.noPasses;
  const owned = noPasses || opt.ignoreOwned ? [] : ownedPasses(hist);
  const baseState = { ...DEFAULT_STATE, ...(opt.state || {}), roundTrip: true };
  const byId = routesById(s);
  const recCache = new Map();
  const specFor = (type, eligible, covered) => {
    const key = `${eligible}|${covered}`;
    if (!recCache.has(key)) recCache.set(key, recommend(s, { state: baseState, eligible, passPersons: covered }));
    return recCache.get(key).modes[type] || null;
  };

  const days = dates.map((date) => {
    let type = opt.dayTypes ? opt.dayTypes[date] || 'off' : resolveDayType(date, s, cal);
    if (opt.forceMode && PLAN_MODES.includes(type)) type = opt.forceMode;
    return { date, type, trip: PLAN_MODES.includes(type) };
  });
  if (opt.daysCut > 0) {
    let cut = Math.floor(opt.daysCut);
    for (let i = days.length - 1; i >= 0 && cut > 0; i--) if (days[i].trip) { days[i].type = 'off'; days[i].trip = false; cut -= 1; }
  }

  const coverable = Array.from({ length: P }, () => []);
  const uncoverable = new Array(P).fill(0);
  let ownedUsed = 0;
  for (const d of days) {
    Object.assign(d, { transit: 0, taxi: 0, fuel: 0, wear: 0, parking: 0, liters: 0, km: 0, minutes: 0, title: '', unavailable: false });
    if (!d.trip) continue;
    d.eligible = resolveEligible(d.date, s, cal);
    d.covered = opt.assumeOwnedAll ? P : passPersonsFrom(owned, d.date, P);
    const option = specFor(d.type, d.eligible, d.covered);
    if (!option) { d.unavailable = true; d.trip = false; continue; }
    const ctx = makeCtx({ state: baseState, eligible: d.eligible, passPersons: d.covered });
    const ev = evaluateOption(option.spec, s, ctx, byId);
    d.title = ev.title; d.key = ev.key;
    d.taxi = ev.cost.taxi; d.fuel = ev.cost.fuel; d.wear = ev.cost.wear; d.parking = ev.cost.parking;
    d.liters = ev.cost.liters; d.km = ev.cost.km; d.minutes = ev.minutes;
    for (let i = 0; i < P; i++) {
      const benefitPerson = i >= P - B0;
      const ownedCover = i < d.covered;
      let cov = 0, unc = 0;
      for (const l of ev.legs) for (const f of l.fares) {
        if (benefitPerson && d.eligible && s.benefit.modes.includes(f.mode)) continue;
        if (isCoverable(f, covers)) { if (ownedCover) ownedUsed += f.fare; else cov += f.fare; } else unc += f.fare;
      }
      uncoverable[i] += unc;
      d.transit += unc;
      if (cov > 0) coverable[i].push({ date: d.date, demand: cov, day: d });
    }
  }

  const windowEnd = (type, start) => passWindowEnd(type, start, s.transit.passes);
  const W = noPasses ? null : s.transit.passes.weeklyPrice;
  const M = noPasses ? null : s.transit.passes.monthlyPrice;
  const strat = { singles: 0, weekly: 0, monthly: 0, optimal: 0 };
  const purchases = [];
  let coverableTotal = 0, personsWithDemand = 0;
  const uncoverableTotal = uncoverable.reduce((a, b) => a + b, 0);
  for (let i = 0; i < P; i++) {
    const ds = coverable[i].map((x) => x.date), dm = coverable[i].map((x) => x.demand);
    const sum = dm.reduce((a, b) => a + b, 0);
    coverableTotal += sum;
    if (sum > 0) personsWithDemand += 1;
    strat.singles += sum + uncoverable[i];
    strat.weekly += passDP(ds, dm, { weekly: W, windowEnd }).total + uncoverable[i];
    strat.monthly += passDP(ds, dm, { monthly: M, windowEnd }).total + uncoverable[i];
    const opt_ = passDP(ds, dm, { weekly: W, monthly: M, windowEnd });
    strat.optimal += opt_.total + uncoverable[i];
    const inPass = new Set();
    for (const pu of opt_.purchases) {
      const share = pu.price / pu.days.length;
      for (const dd of pu.days) inPass.add(dd);
      for (const x of coverable[i]) if (pu.days.includes(x.date)) x.day.transit += share;
      purchases.push({ ...pu, person: i });
    }
    for (const x of coverable[i]) if (!inPass.has(x.date)) x.day.transit += x.demand;
  }

  const strategy = opt.strategy && strat[opt.strategy] != null ? opt.strategy : 'optimal';
  const totals = { transit: 0, taxi: 0, fuel: 0, wear: 0, parking: 0, liters: 0, km: 0, minutes: 0, cash: 0, economic: 0, decision: 0 };
  for (const d of days) {
    d.cash = d.transit + d.taxi + d.fuel + d.parking;
    d.economic = d.cash + d.wear;
    d.decision = s.car.includeWear ? d.economic : d.cash;
    for (const k of ['transit', 'taxi', 'fuel', 'wear', 'parking', 'liters', 'km', 'minutes']) totals[k] += d[k] || 0;
  }
  // Якщо обрано іншу стратегію, ніж оптимальна — змінюється лише рядок «громадський транспорт».
  const transitAdj = strat[strategy] - strat.optimal;
  totals.transit += transitAdj;
  totals.cash = totals.transit + totals.taxi + totals.fuel + totals.parking;
  totals.economic = totals.cash + totals.wear;
  totals.decision = s.car.includeWear ? totals.economic : totals.cash;

  const tripDays = days.filter((d) => d.trip).length;
  const sunk = opt.assumeOwnedAll ? s.transit.passes.monthlyPrice * P : ownedSunk(owned, opt.from, opt.to);
  return {
    from: opt.from, to: opt.to, days, tripDays, totals, strategies: strat, strategy,
    purchases: groupPurchases(purchases), ownedUsed, ownedSunk: sunk,
    coverableTotal, uncoverableTotal, personsWithDemand,
    perPassenger: totals.decision / Math.max(1, P),
    unavailable: days.some((d) => d.unavailable),
  };
}

function passPersonsFrom(owned, date, P) {
  let n = 0;
  for (const p of owned) if (p.start <= date && date <= p.end) n += p.persons;
  return Math.min(P, n);
}
function ownedSunk(owned, from, to) {
  return owned.filter((p) => p.end >= from && p.start <= to).reduce((a, p) => a + (p.price || 0), 0);
}
function groupPurchases(list) {
  const map = new Map();
  for (const p of list) {
    const k = `${p.type}|${p.start}|${p.end}`;
    if (!map.has(k)) map.set(k, { type: p.type, start: p.start, end: p.end, price: p.price, persons: 0, days: p.days.length });
    const g = map.get(k);
    g.persons += 1;
    g.days = Math.max(g.days, p.days.length);
  }
  return [...map.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

// Порівняння режимів за період: «а якби всі дні поїздок були ECO / AUTO / …».
export function compareModes(s, cal, hist, opt = {}) {
  const out = { plan: computePeriod(s, cal, hist, opt), modes: {} };
  for (const m of PLAN_MODES) out.modes[m] = computePeriod(s, cal, hist, { ...opt, forceMode: m });
  const base = out.modes.auto.totals.decision, taxiBase = out.modes.taxi.totals.decision;
  const ecoMin = out.modes.eco.totals.minutes;
  for (const r of [out.plan, ...Object.values(out.modes)]) {
    r.vsCar = base - r.totals.decision;
    r.vsTaxi = taxiBase - r.totals.decision;
    r.hoursVsEco = (ecoMin - r.totals.minutes) / 60;
    r.vsCarPerPassenger = r.vsCar / Math.max(1, s.trip.passengers);
  }
  return out;
}

/* ───────────────────────── Банк комфорту ───────────────────────── */

// Економія однієї записаної поїздки проти авто. Порівнюємо в однаковій базі:
// «повна вартість» (із зносом) або «лише готівка».
export function recordSavings(rec, basis = 'carFull') {
  if (rec.kind !== 'trip') return 0;
  return basis === 'carCash' ? rec.baseCash - rec.cost : rec.baseFull - (rec.cost + (rec.wear || 0));
}

// Віртуальний облік. Поїздки, оплачені «з банку комфорту», не додаються до економії —
// їхня вартість списується з бюджету комфорту. Купівля проїзного зменшує економію.
export function bankSummary(hist, s, range = {}) {
  let saved = 0, spent = 0, passes = 0, trips = 0;
  for (const r of hist || []) {
    if (range.from && r.date < range.from) continue;
    if (range.to && r.date > range.to) continue;
    if (r.kind === 'pass') { passes += r.price || 0; continue; }
    if (r.kind !== 'trip') continue;
    trips += 1;
    if (r.fromBank) spent += r.cost;
    else saved += recordSavings(r, s.bank.baseline);
  }
  return bankMath(saved - passes, spent, s, { saved, passes, trips });
}

export function bankMath(gross, spent, s, extra = {}) {
  const pct = clamp(s.bank.pct, 0, 100) / 100;
  const reserved = Math.max(0, gross) * pct;
  const balance = reserved - spent;
  const net = gross - Math.max(reserved, spent);
  const taxiPrice = s.taxi.price * vehicles(s.trip.passengers, s.taxi.capacity);
  const taxiTrips = balance > 0 && taxiPrice > 0 ? Math.floor(balance / taxiPrice + 1e-9) : 0;
  return { ...extra, gross, spent, reserved, balance, net, taxiTrips, taxiPrice, overspent: balance < -0.005 };
}

// Прогноз (ще НЕ отримані гроші): запланованi дні від сьогодні до кінця періоду, для яких
// ще немає запису фактичної поїздки.
export function projectedSavings(s, cal, hist, { from, to, today }) {
  const start = today > from ? today : from;
  if (start > to) return { gross: 0, days: 0, series: [] };
  const logged = new Set((hist || []).filter((r) => r.kind === 'trip').map((r) => r.date));
  const plan = computePeriod(s, cal, hist, { from: start, to });
  const car = carBaseline(s);
  const base = s.bank.baseline === 'carCash' ? car.cash : car.economic;
  let gross = 0, days = 0;
  const series = [];
  for (const d of plan.days) {
    if (!d.trip || logged.has(d.date)) { series.push({ date: d.date, value: 0 }); continue; }
    const cost = s.bank.baseline === 'carCash' ? d.cash : d.economic;
    const v = base - cost;
    gross += v; days += 1;
    series.push({ date: d.date, value: v });
  }
  return { gross, days, series };
}

// Накопичена фактична економія по днях (для лінійного графіка).
export function actualSeries(hist, s, from, to) {
  const byDate = new Map();
  for (const r of hist || []) {
    if (r.date < from || r.date > to) continue;
    let v = 0;
    if (r.kind === 'pass') v = -(r.price || 0);
    else if (r.kind === 'trip' && !r.fromBank) v = recordSavings(r, s.bank.baseline);
    byDate.set(r.date, (byDate.get(r.date) || 0) + v);
  }
  return dateRange(from, to).map((d) => ({ date: d, value: byDate.get(d) || 0 }));
}

/* ───────────────────────── «Що, якщо?» ───────────────────────── */

export const SCENARIO_DEFAULT = Object.freeze({
  fuelPct: 0, freeParking: false, taxiPct: 0, onePassenger: false, noPasses: false,
  passOwned: false, traffic: false, winter: false, ptSlowPct: 0, daysCut: 0,
});

export function applyScenario(s, sc = SCENARIO_DEFAULT) {
  const t = structuredCloneSafe(s);
  if (sc.fuelPct) t.car.fuelPrice = s.car.fuelPrice * (1 + sc.fuelPct / 100);
  if (sc.freeParking) t.car.parkingPerHour = 0;
  if (sc.taxiPct) {
    const k = Math.max(0, 1 + sc.taxiPct / 100);
    t.taxi.price = s.taxi.price * k;
    for (const r of t.transit.routes) for (const g of r.segments) if (g.mode === 'taxi') g.price *= k;
  }
  if (sc.onePassenger) { t.trip.passengers = 1; t.benefit.persons = Math.min(t.benefit.persons, 1); }
  if (sc.winter) t.car.winter = true;
  if (sc.ptSlowPct) t.misc.ptSlowPct = (s.misc.ptSlowPct || 0) + sc.ptSlowPct;
  const periodOpt = {
    noPasses: !!sc.noPasses,
    assumeOwnedAll: !!sc.passOwned && !sc.noPasses,
    state: sc.traffic ? { traffic: true } : {},
    daysCut: Math.max(0, Math.floor(sc.daysCut || 0)),
  };
  return { settings: t, periodOpt };
}

function structuredCloneSafe(o) {
  return typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o));
}

/* ───────────────────────── Точки беззбитковості ───────────────────────── */

export const BREAKEVEN_VARS = {
  days:       { label: 'Днів поїздок на місяць', unit: 'дн.', min: 0, max: 23, step: 1 },
  fuel:       { label: 'Ціна бензину', unit: '₴/л', min: 40, max: 160, step: 5 },
  parking:    { label: 'Години паркування', unit: 'год', min: 0, max: 12, step: 1 },
  taxi:       { label: 'Ціна таксі в один бік', unit: '₴', min: 60, max: 400, step: 20 },
  passengers: { label: 'Кількість пасажирів', unit: 'осіб', min: 1, max: 6, step: 1 },
};

export function breakEven(s, cal, hist, { variable = 'days', from, to, modes = ['eco', 'comfort', 'auto', 'taxi'], periodOpt: po = {} }) {
  const periodOpt = { ignoreOwned: true, ...po };
  const v = BREAKEVEN_VARS[variable] || BREAKEVEN_VARS.days;
  const xs = [];
  for (let x = v.min; x <= v.max + 1e-9; x += v.step) xs.push(round2(x));
  const byDays = variable === 'days';
  const lines = byDays
    ? [
      { key: 'eco-singles', mode: 'eco', label: 'ECO, разові квитки', dashed: false, values: [] },
      { key: 'eco-monthly', mode: 'eco', label: 'ECO, місячний проїзний', dashed: true, values: [] },
      ...modes.filter((m) => m !== 'eco').map((m) => ({ key: m, mode: m, label: MODE_INFO[m].code, dashed: false, values: [] })),
    ]
    : modes.map((m) => ({ key: m, mode: m, label: MODE_INFO[m].code, dashed: false, values: [] }));
  const workdays = dateRange(from, to).filter((d) => s.trip.workDays.includes(isoDow(d))).length;
  for (const x of xs) {
    const t = structuredCloneSafe(s);
    let days = workdays;
    if (variable === 'fuel') t.car.fuelPrice = x;
    if (variable === 'parking') t.car.parkingHours = x;
    if (variable === 'taxi') {
      const k = s.taxi.price > 0 ? x / s.taxi.price : 1;
      t.taxi.price = x;
      for (const r of t.transit.routes) for (const g of r.segments) if (g.mode === 'taxi') g.price *= k;
    }
    if (variable === 'passengers') { t.trip.passengers = x; t.benefit.persons = Math.min(t.benefit.persons, x); }
    if (byDays) days = x;
    const dayTypes = synthDayTypes(t, from, to, days, 0, 'eco').types;
    for (const ln of lines) {
      if (ln.key === 'eco-singles' || ln.key === 'eco-monthly') continue;
      ln.values.push(computePeriod(t, cal, hist, { from, to, dayTypes, forceMode: ln.mode, ...periodOpt }).totals.decision);
    }
    if (byDays) {
      const eco = computePeriod(t, cal, hist, { from, to, dayTypes, forceMode: 'eco', ...periodOpt });
      lines[0].values.push(eco.strategies.singles);
      lines[1].values.push(eco.uncoverableTotal + eco.personsWithDemand * t.transit.passes.monthlyPrice);
    }
  }
  return { variable, meta: v, xs, lines, crossings: findCrossings(xs, lines) };
}

export function findCrossings(xs, lines) {
  const out = [];
  for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
    const A = lines[a].values, B = lines[b].values;
    let lastIdx = -1, lastD = 0;
    for (let k = 0; k < xs.length; k++) {
      const d = A[k] - B[k];
      if (Math.abs(d) < 1e-9) continue;
      if (lastIdx >= 0 && Math.sign(d) !== Math.sign(lastD)) {
        let x, y;
        if (k - lastIdx > 1) { x = xs[lastIdx + 1]; y = A[lastIdx + 1]; }
        else {
          const t = lastD / (lastD - d);
          x = xs[lastIdx] + (xs[k] - xs[lastIdx]) * t;
          y = A[lastIdx] + (A[k] - A[lastIdx]) * t;
        }
        out.push({ a: lines[a].key, b: lines[b].key, x, y, cheaperAfter: d < 0 ? lines[a].key : lines[b].key });
      }
      lastIdx = k; lastD = d;
    }
  }
  return out;
}

/* ───────────────────────── Навігація ───────────────────────── */

export function parseCoords(str) {
  const raw = String(str || '').trim().replace(/;/g, ' ');
  if (!raw) return null;
  let parts;
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(raw)) parts = raw.split(',');
  else parts = raw.split(/\s+/).map((p) => p.replace(',', '.'));
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]), lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function haversineKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const DNIPRO_CENTER = { lat: 48.4647, lng: 35.0462 };
export const DTRANSPORT_URL = 'https://apps.apple.com/app/id1500439110';

export function routeEnds(s) {
  const { a, b, swapped } = s.route;
  return swapped ? { from: b, to: a } : { from: a, to: b };
}

const pointQuery = (p) => { const c = parseCoords(p.coords); return c ? `${c.lat},${c.lng}` : p.address; };

// Документовані формати: Google Maps URLs (api=1), Apple Map Links (saddr/daddr/dirflg), Waze deep links (ul).
export function navLinks(s, kind = 'transit') {
  const { from, to } = routeEnds(s);
  const o = encodeURIComponent(pointQuery(from)), d = encodeURIComponent(pointQuery(to));
  const gMode = { transit: 'transit', driving: 'driving', walking: 'walking' }[kind] || 'transit';
  const aMode = { transit: 'r', driving: 'd', walking: 'w' }[kind] || 'r';
  const tc = parseCoords(to.coords);
  return {
    google: `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=${gMode}`,
    apple: `https://maps.apple.com/?saddr=${o}&daddr=${d}&dirflg=${aMode}`,
    waze: tc ? `https://waze.com/ul?ll=${tc.lat},${tc.lng}&navigate=yes` : `https://waze.com/ul?q=${d}&navigate=yes`,
    dtransport: DTRANSPORT_URL,
  };
}

export function checkPointLinks(p) {
  const q = encodeURIComponent(pointQuery(p));
  return { google: `https://www.google.com/maps/search/?api=1&query=${q}`, apple: `https://maps.apple.com/?q=${q}` };
}

export function legNavKind(leg) {
  if (!leg) return 'transit';
  return leg.kind === 'route' ? 'transit' : 'driving';
}

export function departureFor(s, option) {
  const arrive = parseHM(s.trip.arriveBy);
  if (arrive == null || !option) return null;
  const total = option.oneWay + option.buffer;
  return { time: fmtHM(arrive - total), arrive: fmtHM(arrive), buffer: option.buffer, minutes: option.oneWay };
}

/* ───────────────────────── Максимальна економія ───────────────────────── */

// Базова вартість авто для обліку економії: той варіант, який обрав би AUTO у звичайний день.
export function carBaseline(s) {
  const a = recommend(s, { state: { ...DEFAULT_STATE } }).modes.auto;
  if (a) return { cash: a.cost.cash, economic: a.cost.economic, wear: a.cost.wear, title: a.title };
  const c = carCosts(s, makeCtx(), 2);
  return { cash: c.cash, economic: c.economic, wear: c.wear, title: 'Авто' };
}

// «Куди тікають гроші» — інверсія за Мангером: не «як заробити», а «де саме ми переплачуємо».
// Дивимось на 30 днів уперед за календарем і рахуємо, скільки дає кожна дія.
export function findLeaks(s, cal, hist, { today }) {
  const from = today, to = addDays(today, 29);
  const plan = computePeriod(s, cal, hist, { from, to });
  const out = [];
  const perYear = 365 / 30;
  const ecoOk = !!recommend(s, { state: { ...DEFAULT_STATE } }).modes.eco;
  const types = Object.fromEntries(plan.days.map((d) => [d.date, d.type]));
  const swap = (pred) => {
    if (!ecoOk) return null;
    const t = { ...types };
    let n = 0;
    for (const d of plan.days) if (d.trip && pred(d)) { t[d.date] = 'eco'; n += 1; }
    if (!n) return null;
    const alt = computePeriod(s, cal, hist, { from, to, dayTypes: t });
    if (alt.unavailable) return null;
    return { n, saving: plan.totals.decision - alt.totals.decision };
  };
  // Дрібниці не показуємо: фокус лише на тому, що реально помітно в гаманці.
  const add = (id, monthly, text, action = null, min = 20) => { if (monthly >= min) out.push({ id, monthly, yearly: monthly * perYear, text, action }); };
  const dn = (n) => `${n} ${plural(n, ['день', 'дні', 'днів'])}`;
  const isCarDay = (d) => typeof d.key === 'string' && d.key.startsWith('car');
  const carDays = plan.days.filter((d) => d.trip && isCarDay(d));

  const car = swap(isCarDay);
  if (car) add('car-days', car.saving, `${dn(car.n)} на авто за планом. Якщо їхати ECO, за 30 днів залишиться на ${fmtGrn(car.saving)} більше.`, { tab: 'calendar', label: 'Змінити план' });
  const taxi = swap((d) => d.taxi > 0);
  if (taxi) add('taxi-days', taxi.saving, `${dn(taxi.n)} із таксі за планом ${plural(taxi.n, ['коштує', 'коштують', 'коштують'])} на ${fmtGrn(taxi.saving)} більше, ніж ECO. Залиште таксі для важких днів — їх оплачує банк комфорту.`, { tab: 'calendar', label: 'Змінити план' });
  const parking = carDays.reduce((a, d) => a + d.parking, 0);
  if (parking > 0 && !(s.car.freeParkWalkMin > 0)) add('parking', parking, `Паркування — ${fmtGrn(parking)} за ${dn(carDays.length)} авто. Знайдіть безкоштовне місце за кілька хвилин пішки й укажіть його в налаштуваннях авто — ця витрата зникне.`, { tab: 'settings', anchor: 'set-car', label: 'Налаштувати авто' });
  // Дешевший маршрут ГТ з урахуванням проїзних: напр., маршрутка щодня проти трамвая з місячним проїзним.
  const routeDays = plan.days.filter((d) => d.trip && typeof d.key === 'string' && /^r:([^|]+)\|(r:\1|-)$/.test(d.key));
  if (routeDays.length) {
    const count = new Map();
    for (const d of routeDays) { const id = d.key.slice(2).split('|')[0]; count.set(id, (count.get(id) || 0) + 1); }
    const curId = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const byId = routesById(s);
    let bestAlt = null;
    for (const r of s.transit.routes.filter((x) => x.enabled && x.segments.length && isPureTransit(x))) {
      if (count.size === 1 && r.id === curId) continue;
      const s2 = structuredCloneSafe(s);
      s2.transit.ecoRoute = r.id;
      const t = { ...types };
      for (const d of routeDays) t[d.date] = 'eco';
      const alt = computePeriod(s2, cal, hist, { from, to, dayTypes: t });
      if (alt.unavailable) continue;
      const saving = plan.totals.decision - alt.totals.decision;
      if (!bestAlt || saving > bestAlt.saving + 1e-9) bestAlt = { r, saving, alt };
    }
    if (bestAlt) {
      const perDay = (bestAlt.alt.totals.minutes - plan.totals.minutes) / routeDays.length;
      const withPass = bestAlt.alt.purchases.length > 0 && !plan.purchases.length;
      const time = perDay >= 1 ? `, але +${fmtMin(perDay)} у дорозі щодня` : perDay <= -1 ? ` і ще на ${fmtMin(-perDay)} швидше щодня` : '';
      add('route', bestAlt.saving, `«${bestAlt.r.name}»${withPass ? ' з проїзними' : ''} замість «${byId[curId]?.name || 'поточного маршруту'}»: за 30 днів на ${fmtGrn(bestAlt.saving)} менше${time}.`,
        withPass ? { tab: 'savings', act: 'pass', type: bestAlt.alt.purchases[0].type, label: 'Записати купівлю проїзного' } : { tab: 'savings', act: 'eco-route', id: bestAlt.r.id, label: `Обрати «${bestAlt.r.name}»` });
    }
  }
  const S = plan.strategies;
  if (plan.purchases.length && S.singles - S.optimal >= 1) {
    const f = plan.purchases[0];
    add('pass', S.singles - S.optimal, `Проїзний замість разових квитків: ${fmtGrn(S.singles)} → ${fmtGrn(S.optimal)} за 30 днів. Перша купівля — ${fmtDayMonth(f.start)}.`, { tab: 'savings', act: 'pass', type: f.type, label: 'Записати купівлю' });
  }
  const mFrom = monthStart(today), mTo = monthEnd(today);
  const ecoPaid = (hist || []).filter((r) => r.kind === 'trip' && r.mode === 'eco' && r.date >= mFrom && r.date <= mTo).reduce((a, r) => a + r.cost, 0);
  const passBought = (hist || []).some((r) => r.kind === 'pass' && r.end >= mFrom && r.start <= mTo);
  const monthPass = s.transit.passes.monthlyPrice * s.trip.passengers;
  if (!passBought && monthPass > 0 && ecoPaid > monthPass) add('singles-paid', ecoPaid - monthPass, `Цього місяця на разові квитки вже витрачено ${fmtGrn(ecoPaid)}, а місячні проїзні на всіх коштували б ${fmtGrn(monthPass)}. Наступного місяця купуйте проїзний на початку.`);
  const liters = carDays.reduce((a, d) => a + d.liters, 0);
  if (liters > 0 && s.car.fuelPrice > 0) add('fuel', liters * 2, `Кожні 2 ₴/л знижки на пальне — мінус ${fmtGrn(liters * 2)} за 30 днів (${fmtNum(liters, 0)} л за планом). Заправляйтесь там, де дешевше, і користуйтесь знижками АЗС.`, null, 50);
  const b = bankSummary(hist, s);
  if (b.overspent) add('bank-over', -b.balance, `Банк комфорту перевитрачено на ${fmtGrn(-b.balance)}. Поки економія не покриє різницю, обирайте ECO.`, { tab: 'savings', label: 'Банк комфорту' });
  return out.sort((x, y) => y.monthly - x.monthly);
}

// Річний ефект і велика мета: «спершу заплати собі» — відкладайте чисту економію щомісяця.
export function wealthPlan(s, cal, hist, { today }) {
  const from = today, to = addDays(today, 29);
  const cmp = compareModes(s, cal, hist, { from, to });
  const monthly = cmp.plan.vsCar * (30.4375 / 30);
  const pct = clamp(s.bank.pct, 0, 100) / 100;
  const net = monthly > 0 ? monthly * (1 - pct) : monthly;
  const r = Math.max(0, s.bank.rate || 0) / 100 / 12;
  const fv = (m, n) => (r > 0 ? (m * ((1 + r) ** n - 1)) / r : m * n);
  const have = Math.max(0, bankSummary(hist, s).net);
  const goal = s.bank.goalAmount || 0;
  let months = null, tooFar = false;
  if (goal > 0) {
    const need = goal - have;
    if (need <= 0) months = 0;
    else if (net > 0) months = r > 0 ? Math.ceil(Math.log((need * r) / net + 1) / Math.log(1 + r)) : Math.ceil(need / net);
    // Понад 50 років — це не план, а мрія: не показуємо фантастичних дат.
    if (months != null && (!Number.isFinite(months) || months > 600)) { months = null; tooFar = true; }
  }
  return {
    monthlyGross: monthly, monthlyNet: net, year: fv(net, 12), five: fv(net, 60), ten: fv(net, 120),
    rate: s.bank.rate || 0, have, goal, months, tooFar, eta: months != null ? addMonths(today, months) : null, tripDays: cmp.plan.tripDays,
  };
}

// Бюджет на транспорт (метод конвертів): факт місяця + план на решту днів.
export function budgetStatus(s, cal, hist, { today }) {
  const budget = s.bank.monthlyBudget || 0;
  const from = monthStart(today), to = monthEnd(today);
  let spent = 0;
  for (const r of hist || []) {
    if (r.date < from || r.date > to) continue;
    if (r.kind === 'trip') spent += r.cost;
    else if (r.kind === 'pass') spent += r.price || 0;
  }
  const logged = new Set((hist || []).filter((r) => r.kind === 'trip').map((r) => r.date));
  const plan = computePeriod(s, cal, hist, { from: today, to });
  let planned = 0, daysLeft = 0;
  for (const d of plan.days) if (d.trip && !logged.has(d.date)) { planned += d.cash; daysLeft += 1; }
  const forecast = spent + planned;
  const left = budget - spent;
  return { budget, spent, planned, forecast, left, daysLeft, perDay: daysLeft > 0 ? left / daysLeft : null, over: budget > 0 && forecast > budget + 0.5, overBy: forecast - budget };
}
