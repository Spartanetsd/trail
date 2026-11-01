// MOBILITY TRAIL — store.js
// Стартові налаштування, схема даних, збереження в localStorage, експорт / імпорт JSON.

import { toNum, clamp, isDateStr, parseHM, fmtHM, PLAN_MODES, DAY_TYPES, FARE_MODES, SEGMENT_MODES, DEFAULT_STATE } from './engine.js';

export const STORAGE_KEY = 'mobility-trail:v1';
export const SCHEMA = 'mobility-trail';
// Попередня назва застосунку (до 1.4). Потрібна лише для того, щоб перенести збережені дані
// й приймати старі резервні копії; після перенесення старі записи видаляються.
const LEGACY = { prefix: 'mobility-zero:', key: 'mobility-zero:v1', schema: 'mobility-zero', mode: 'zero' };
export const SCHEMA_VERSION = 1;
export const APP_VERSION = '1.4.0';
// Ревізія стартових значень. Коли вона зростає, збережені дані з незмінними старими значеннями оновлюються.
export const DEFAULTS_REV = 3;
export const ROUTES_SOURCE = 'D-transport, 01.11.2026';
export const TAXI_SOURCE = 'Bolt, 01.11.2026, 05:01';

// Тарифи таксі в один бік (скріншоти Bolt користувача; «Send» — доставка посилок, для поїздок не потрібен).
export function defaultTariffs() {
  return [
    { id: 'bolt', name: 'Bolt', price: 189, note: 'звичайні поїздки' },
    { id: 'priority', name: 'Priority', price: 199, note: 'авто знайдуть швидше' },
    { id: 'pet', name: 'Pet', price: 209, note: 'поїздки з тваринами' },
    { id: 'comfort', name: 'Comfort', price: 229, note: 'просторіші авто' },
    { id: 'business', name: 'Business', price: 259, note: 'бізнес-клас' },
  ];
}

// Основна ціна таксі (taxi.price) і ціна обраного тарифу завжди однакові.
// before — знімок до зміни: так зрозуміло, що саме змінили — тариф, основну ціну чи ціну тарифу.
export function taxiSnapshot(s) {
  const sel = (s.taxi.tariffs || []).find((t) => t.id === s.taxi.tariff);
  return { price: s.taxi.price, tariff: s.taxi.tariff, sel: sel ? sel.price : null };
}
export function syncTaxi(s, before = null) {
  const sel = (s.taxi.tariffs || []).find((t) => t.id === s.taxi.tariff);
  if (!sel) { if (s.taxi.tariff) s.taxi.tariff = ''; return; }
  if (!before || s.taxi.tariff !== before.tariff) s.taxi.price = sel.price;
  else if (s.taxi.price !== before.price) sel.price = s.taxi.price;
  else if (sel.price !== before.sel) s.taxi.price = sel.price;
}

/* ───────────────────────── Стартові дані ───────────────────────── */

// Маршрути з D-transport (скріншоти користувача, 01.11.2026). Час руху й пішки — з D-transport;
// очікування одного номера (8 хв) — припущення: уточніть уранці.
const seg = (mode, line, from, to, stops, walkMin, rideMin, price = 0) => ({ mode, line, from, to, stops, walkMin, waitMin: 8, rideMin, price });
const t15 = () => seg('tram', '15', 'вул. Олександра Кошиця', 'Залізничний вокзал', 8, 3, 13);
export function defaultRoutes() {
  const r = (id, name, walkEndMin, segments) => ({ id, name, enabled: true, confirmed: true, src: ROUTES_SOURCE, walkEndMin, segments });
  return [
    r('r1', 'Трамвай 15 → 1', 6, [t15(), seg('tram', '1', 'Залізничний вокзал', 'вул. Січових Стрільців', 8, 1, 14)]),
    r('r2', 'Маршрутка 157А / 146А', 6, [seg('bus', '157А, 146А', 'вул. Володимира Самодриги', 'Кельнський бульвар', 15, 4, 25)]),
    r('r3', 'Маршрутка 90 / 75К → трамвай 1', 6, [
      seg('bus', '90, 75К', 'вул. Володимира Самодриги', 'Залізничний вокзал', 8, 4, 14),
      seg('tram', '1', 'Залізничний вокзал', 'вул. Січових Стрільців', 8, 2, 14),
    ]),
    r('r4', 'Маршрутка 90 → тролейбус 4', 6, [
      seg('bus', '90', 'вул. Володимира Самодриги', 'вул. Аудиторна', 4, 4, 6),
      seg('trolley', '4', 'вул. Аудиторна', 'Кельнський бульвар', 12, 0, 22),
    ]),
    r('r5', 'Трамвай 15 → Ретро', 8, [t15(), seg('tram', 'Ретро', 'Залізничний вокзал', 'вул. Центральна', 7, 1, 12, 15)]),
  ];
}

// Стартові маршрути версій 1.0–1.1 — лише щоб розпізнати незмінені дані під час оновлення.
export function legacyRoutesV1() {
  return [
    { id: 'r1', name: 'Трамвай №15', enabled: true, confirmed: false, walkEndMin: 7, segments: [{ mode: 'tram', line: '15', walkMin: 8, waitMin: 8, rideMin: 32, price: 0 }] },
    { id: 'r2', name: 'Трамвай №1 + тролейбус №4', enabled: false, confirmed: false, walkEndMin: 5, segments: [{ mode: 'tram', line: '1', walkMin: 6, waitMin: 8, rideMin: 18, price: 0 }, { mode: 'trolley', line: '4', walkMin: 5, waitMin: 9, rideMin: 14, price: 0 }] },
    { id: 'r3', name: 'Метро + тролейбус №4', enabled: false, confirmed: false, walkEndMin: 5, segments: [{ mode: 'metro', line: 'М', walkMin: 12, waitMin: 5, rideMin: 10, price: 0 }, { mode: 'trolley', line: '4', walkMin: 6, waitMin: 9, rideMin: 14, price: 0 }] },
  ];
}

export function defaultSettings() {
  return {
    route: {
      a: { label: 'Кошиця, 2', address: 'вулиця Олександра Кошиця, 2, Дніпро', coords: '', confirmed: false },
      b: { label: 'Самарського, 10', address: 'вулиця Якова Самарського, 10, Дніпро', coords: '', confirmed: false },
      swapped: false,
    },
    trip: { passengers: 2, arriveBy: '08:30', returnDefault: true, defaultMode: 'best', workDays: [0, 1, 2, 3, 4], hourValue: 0 },
    car: {
      name: 'Opel Astra H 1.6 (2006)', distanceKm: 7, consumption: 9, fuelPrice: 89.38, wearPerKm: 3,
      parkingPerHour: 18, parkingHours: 6, driveMin: 20, parkWalkMin: 6, fixedMonthly: 0, capacity: 5,
      winter: false, winterExtraPct: 15, trafficFuelPct: 15, includeWear: true, freeParkWalkMin: 0,
    },
    taxi: { price: 189, waitMin: 7, rideMin: 20, capacity: 4, tariff: 'bolt', tariffs: defaultTariffs(), src: TAXI_SOURCE },
    transit: {
      fares: { tram: 10, trolley: 10, bus: 25, metro: 10 },
      passes: { weeklyPrice: 100, monthlyPrice: 410, covers: ['tram'], weeklyType: 'rolling', monthlyType: 'calendar' },
      routes: defaultRoutes(),
      ecoRoute: 'auto',
    },
    flex: { there: 'taxi', back: 'r1' },
    benefit: { enabled: false, persons: 2, modes: ['tram', 'trolley', 'metro', 'bus'], defaultEligible: false },
    weights: { cost: 45, comfort: 25, speed: 20, reliability: 10 },
    bank: { pct: 30, weeklyGoal: 700, monthlyGoal: 3000, baseline: 'carFull', monthlyBudget: 0, rate: 0, goalName: '', goalAmount: 0 },
    misc: { trafficFactor: 1.6, ptSlowPct: 0 },
    ui: { theme: 'dark' },
    rev: DEFAULTS_REV,
  };
}

export function defaultState() {
  const now = new Date().toISOString();
  return {
    schema: SCHEMA, version: SCHEMA_VERSION,
    settings: defaultSettings(),
    calendar: {},
    history: [],
    today: { date: '', flags: { ...DEFAULT_STATE }, eligible: null },
    meta: { created: now, updated: now },
  };
}

/* ───────────────────────── Схема та нормалізація ───────────────────────── */

const N = (min, max, int = false) => ({ t: 'num', min, max, int });
const B = () => ({ t: 'bool' });
const S = (max) => ({ t: 'str', max });
const E = (values) => ({ t: 'enum', values });
const SET = (values) => ({ t: 'set', values });
const TIME = () => ({ t: 'time' });
const DAYS = () => ({ t: 'days' });

const POINT = { label: S(60), address: S(200), coords: S(60), confirmed: B() };
const SETTINGS_SCHEMA = {
  route: { a: POINT, b: POINT, swapped: B() },
  trip: { passengers: N(1, 8, true), arriveBy: TIME(), returnDefault: B(), defaultMode: E(PLAN_MODES), workDays: DAYS(), hourValue: N(0, 100000) },
  car: {
    name: S(60), distanceKm: N(0, 500), consumption: N(0, 40), fuelPrice: N(0, 1000), wearPerKm: N(0, 100),
    parkingPerHour: N(0, 2000), parkingHours: N(0, 24), driveMin: N(1, 600), parkWalkMin: N(0, 120),
    fixedMonthly: N(0, 1e6), capacity: N(1, 9, true), winter: B(), winterExtraPct: N(0, 100), trafficFuelPct: N(0, 100), includeWear: B(), freeParkWalkMin: N(0, 60),
  },
  taxi: { price: N(0, 20000), waitMin: N(0, 120), rideMin: N(1, 600), capacity: N(1, 8, true), tariff: S(24), tariffs: { t: 'tariffs' }, src: S(60) },
  transit: {
    fares: { tram: N(0, 1000), trolley: N(0, 1000), bus: N(0, 1000), metro: N(0, 1000) },
    passes: { weeklyPrice: N(0, 20000), monthlyPrice: N(0, 50000), covers: SET(FARE_MODES), weeklyType: E(['rolling', 'calendar']), monthlyType: E(['calendar', 'rolling30']) },
    routes: { t: 'routes' },
    ecoRoute: S(40),
  },
  flex: { there: S(40), back: S(40) },
  benefit: { enabled: B(), persons: N(0, 8, true), modes: SET(FARE_MODES), defaultEligible: B() },
  weights: { cost: N(0, 100), comfort: N(0, 100), speed: N(0, 100), reliability: N(0, 100) },
  bank: { pct: N(0, 100), weeklyGoal: N(0, 1e7), monthlyGoal: N(0, 1e7), baseline: E(['carFull', 'carCash']), monthlyBudget: N(0, 1e7), rate: N(0, 100), goalName: S(60), goalAmount: N(0, 1e9) },
  misc: { trafficFactor: N(1, 4), ptSlowPct: N(0, 300) },
  ui: { theme: E(['dark', 'light', 'system']) },
  rev: N(0, 1000, true),
};

const ROUTE_LIMIT = 12, SEG_LIMIT = 6;
const SEG_MODES = Object.keys(SEGMENT_MODES);

function normField(spec, value, def, path, warn) {
  switch (spec.t) {
    case 'num': {
      if (value === undefined) return def;
      const n = toNum(value, NaN);
      if (!Number.isFinite(n)) { warn(path, 'не число — повернуто стандартне значення'); return def; }
      let v = clamp(n, spec.min, spec.max);
      if (spec.int) v = Math.round(v);
      if (v !== n) warn(path, `виправлено до ${v}`);
      return v;
    }
    case 'bool':
      if (value === undefined) return def;
      if (typeof value !== 'boolean') { warn(path, 'очікувалось так/ні'); return def; }
      return value;
    case 'str':
      if (value === undefined) return def;
      if (typeof value !== 'string') { warn(path, 'очікувався текст'); return def; }
      return value.slice(0, spec.max);
    case 'enum':
      if (value === undefined) return def;
      if (!spec.values.includes(value)) { warn(path, 'невідоме значення'); return def; }
      return value;
    case 'set':
      if (value === undefined) return def;
      if (!Array.isArray(value)) { warn(path, 'очікувався список'); return def; }
      return [...new Set(value.filter((x) => spec.values.includes(x)))];
    case 'time': {
      if (value === undefined) return def;
      const m = parseHM(value);
      if (m == null) { warn(path, 'очікувався час ГГ:ХХ'); return def; }
      return fmtHM(m);
    }
    case 'days':
      if (value === undefined) return def;
      if (!Array.isArray(value)) { warn(path, 'очікувався список днів'); return def; }
      return [...new Set(value.map((x) => Math.round(toNum(x, -1))).filter((x) => x >= 0 && x <= 6))].sort();
    case 'routes':
      return normRoutes(value, def, path, warn);
    case 'tariffs':
      return normTariffs(value, def, path, warn);
    default:
      return def;
  }
}

function normObject(schema, value, def, path, warn) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (value !== undefined && src !== value) warn(path, 'очікувався обʼєкт');
  const out = {};
  for (const [k, spec] of Object.entries(schema)) {
    const p = path ? `${path}.${k}` : k;
    if (spec.t) out[k] = normField(spec, src[k], def[k], p, warn);
    else out[k] = normObject(spec, src[k], def[k], p, warn);
  }
  return out;
}

const SEG_SCHEMA = { mode: E(SEG_MODES), line: S(40), from: S(60), to: S(60), stops: N(0, 99, true), walkMin: N(0, 120), waitMin: N(0, 120), rideMin: N(0, 600), price: N(0, 20000) };
const SEG_DEFAULT = { mode: 'tram', line: '', from: '', to: '', stops: 0, walkMin: 5, waitMin: 8, rideMin: 15, price: 0 };
const ROUTE_SCHEMA = { id: S(40), name: S(60), enabled: B(), confirmed: B(), src: S(60), walkEndMin: N(0, 120) };

function normRoutes(value, def, path, warn) {
  if (value === undefined) return def;
  if (!Array.isArray(value)) { warn(path, 'очікувався список маршрутів'); return def; }
  const out = [];
  const ids = new Set();
  value.slice(0, ROUTE_LIMIT).forEach((r, i) => {
    if (!r || typeof r !== 'object') { warn(`${path}[${i}]`, 'маршрут пропущено'); return; }
    const base = normObject(ROUTE_SCHEMA, r, { id: `r${i + 1}`, name: `Маршрут ${i + 1}`, enabled: true, confirmed: false, src: '', walkEndMin: 5 }, `${path}[${i}]`, warn);
    let id = base.id.trim() || `r${i + 1}`;
    while (ids.has(id)) id = `${id}_`;
    ids.add(id);
    const segs = Array.isArray(r.segments) ? r.segments.slice(0, SEG_LIMIT) : [];
    base.id = id;
    base.segments = segs.map((g, j) => normObject(SEG_SCHEMA, g, SEG_DEFAULT, `${path}[${i}].segments[${j}]`, warn));
    out.push(base);
  });
  return out;
}

const TARIFF_SCHEMA = { id: S(24), name: S(30), price: N(0, 20000), note: S(60) };
function normTariffs(value, def, path, warn) {
  if (value === undefined) return def;
  if (!Array.isArray(value)) { warn(path, 'очікувався список тарифів'); return def; }
  const out = [], ids = new Set();
  value.slice(0, 8).forEach((t, i) => {
    if (!t || typeof t !== 'object') { warn(`${path}[${i}]`, 'тариф пропущено'); return; }
    const x = normObject(TARIFF_SCHEMA, t, { id: `t${i + 1}`, name: '', price: 0, note: '' }, `${path}[${i}]`, warn);
    if (!x.name.trim()) { warn(`${path}[${i}]`, 'тариф без назви — пропущено'); return; }
    let id = x.id.trim() || `t${i + 1}`;
    while (ids.has(id)) id = `${id}_`;
    ids.add(id); x.id = id;
    out.push(x);
  });
  return out;
}

export function normalizeSettings(raw, warn = () => {}) {
  const s = normObject(SETTINGS_SCHEMA, raw, defaultSettings(), 'settings', warn);
  s.benefit.persons = Math.min(s.benefit.persons, s.trip.passengers);
  // Обраний тариф має існувати, а його ціна — збігатися з основною ціною таксі.
  const sel = s.taxi.tariffs.find((t) => t.id === s.taxi.tariff);
  if (!sel) s.taxi.tariff = '';
  else if (sel.price !== s.taxi.price) sel.price = s.taxi.price;
  return s;
}

const TRIP_MODES = [...PLAN_MODES, 'other'];

function normHistory(list, warn) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) { warn('history', 'очікувався список'); return []; }
  const out = [];
  list.slice(0, 5000).forEach((r, i) => {
    const p = `history[${i}]`;
    if (!r || typeof r !== 'object' || !isDateStr(r.date)) { warn(p, 'запис без коректної дати — пропущено'); return; }
    const id = typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : `h${i}_${r.date}`;
    if (r.kind === 'pass') {
      if (!['weekly', 'monthly'].includes(r.type) || !isDateStr(r.start) || !isDateStr(r.end) || r.end < r.start) { warn(p, 'некоректний проїзний — пропущено'); return; }
      out.push({ id, kind: 'pass', date: r.date, type: r.type, start: r.start, end: r.end, persons: Math.round(clamp(toNum(r.persons, 1), 1, 8)), price: clamp(toNum(r.price, 0), 0, 100000), note: typeof r.note === 'string' ? r.note.slice(0, 200) : '' });
      return;
    }
    if (r.kind !== 'trip') { warn(p, 'невідомий тип запису — пропущено'); return; }
    out.push({
      id, kind: 'trip', date: r.date,
      mode: TRIP_MODES.includes(r.mode) ? r.mode : 'other',
      label: typeof r.label === 'string' ? r.label.slice(0, 80) : '',
      cost: clamp(toNum(r.cost, 0), 0, 100000),
      wear: clamp(toNum(r.wear, 0), 0, 100000),
      baseCash: clamp(toNum(r.baseCash, 0), 0, 100000),
      baseFull: clamp(toNum(r.baseFull, 0), 0, 100000),
      minutes: clamp(toNum(r.minutes, 0), 0, 1440),
      fromBank: r.fromBank === true,
      note: typeof r.note === 'string' ? r.note.slice(0, 200) : '',
    });
  });
  return out;
}

function normCalendar(cal, warn) {
  if (cal === undefined) return {};
  if (!cal || typeof cal !== 'object' || Array.isArray(cal)) { warn('calendar', 'очікувався обʼєкт'); return {}; }
  const out = {};
  for (const [date, v] of Object.entries(cal)) {
    if (!isDateStr(date) || !v || typeof v !== 'object') { warn(`calendar.${date}`, 'пропущено'); continue; }
    const e = {};
    if (DAY_TYPES.includes(v.type)) e.type = v.type;
    if (typeof v.eligible === 'boolean') e.eligible = v.eligible;
    if (Object.keys(e).length) out[date] = e;
  }
  return out;
}

function normToday(t) {
  const flags = { ...DEFAULT_STATE };
  if (t && typeof t === 'object' && t.flags && typeof t.flags === 'object') {
    for (const k of Object.keys(DEFAULT_STATE)) if (typeof t.flags[k] === 'boolean') flags[k] = t.flags[k];
  }
  return {
    date: t && isDateStr(t.date) ? t.date : '',
    flags,
    eligible: t && typeof t.eligible === 'boolean' ? t.eligible : null,
  };
}

// Оновлення старих збережених даних. Змінюємо лише ті значення, які людина не чіпала
// (дорівнюють старим стартовим), — власні ціни й маршрути залишаються як були.
const routeSig = (r) => JSON.stringify([r.id, r.name, r.walkEndMin, r.segments.map((g) => [g.mode, g.line, g.walkMin, g.waitMin, g.rideMin, g.price])]);
export function migrateSettings(s, rawRev, notes = []) {
  if (rawRev < 2) {
    if (s.car.parkingPerHour === 15) { s.car.parkingPerHour = 18; notes.push('паркування 18 ₴/год'); }
    if (s.transit.fares.bus === 20) { s.transit.fares.bus = 25; notes.push('маршрутка 25 ₴'); }
    const old = legacyRoutesV1();
    if (s.transit.routes.length === old.length && s.transit.routes.every((r, i) => routeSig(r) === routeSig(old[i]))) {
      s.transit.routes = defaultRoutes();
      if (s.transit.ecoRoute !== 'r1') s.transit.ecoRoute = 'auto';
      if (!['taxi', 'r1'].includes(s.flex.there)) s.flex.there = 'taxi';
      if (!['taxi', 'r1'].includes(s.flex.back)) s.flex.back = 'r1';
      notes.push('маршрути з D-transport');
    }
  }
  if (rawRev < 3) {
    // Тарифів до версії 1.3 не було. Стара стартова ціна 160 ₴ → тариф Bolt 189 ₴; власна ціна лишається «своєю».
    s.taxi.tariffs = defaultTariffs();
    const bolt = s.taxi.tariffs[0];
    if (s.taxi.price === 160) { s.taxi.tariff = bolt.id; syncTaxi(s); notes.push(`таксі Bolt ${bolt.price} ₴`); }
    else s.taxi.tariff = s.taxi.price === bolt.price ? bolt.id : ''; // уже вписана ціна Bolt — обираємо тариф Bolt
  }
  s.rev = DEFAULTS_REV;
  return notes;
}

// Режим автопідбору раніше мав іншу назву: переводимо її в BEST у налаштуваннях, календарі й історії.
function renameLegacyMode(src, notes) {
  let n = 0;
  const m = (v) => { if (v === LEGACY.mode) { n += 1; return 'best'; } return v; };
  const out = { ...src };
  const set = src.settings;
  if (set && typeof set === 'object' && !Array.isArray(set) && set.trip && typeof set.trip === 'object' && !Array.isArray(set.trip)) {
    out.settings = { ...set, trip: { ...set.trip, defaultMode: m(set.trip.defaultMode) } };
  }
  if (src.calendar && typeof src.calendar === 'object' && !Array.isArray(src.calendar)) {
    out.calendar = Object.fromEntries(Object.entries(src.calendar).map(([d, v]) => [d, v && typeof v === 'object' && !Array.isArray(v) && 'type' in v ? { ...v, type: m(v.type) } : v]));
  }
  if (Array.isArray(src.history)) out.history = src.history.map((r) => (r && typeof r === 'object' && r.mode === LEGACY.mode ? { ...r, mode: m(r.mode) } : r));
  if (n) notes.push('автопідбір тепер BEST');
  return out;
}

export function normalizeState(raw, warn = () => {}, notes = []) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? renameLegacyMode(raw, notes) : {};
  const st = defaultState();
  st.settings = normalizeSettings(src.settings, warn);
  if (src.settings && typeof src.settings === 'object' && !Array.isArray(src.settings)) {
    migrateSettings(st.settings, Math.floor(toNum(src.settings.rev, 1)), notes);
  }
  st.calendar = normCalendar(src.calendar, warn);
  st.history = normHistory(src.history, warn);
  st.today = normToday(src.today);
  if (src.meta && typeof src.meta === 'object') {
    if (typeof src.meta.created === 'string') st.meta.created = src.meta.created.slice(0, 40);
    if (typeof src.meta.updated === 'string') st.meta.updated = src.meta.updated.slice(0, 40);
  }
  return st;
}

/* ───────────────────────── localStorage ───────────────────────── */

export function loadState() {
  try {
    const ls = globalThis.localStorage;
    let raw = ls?.getItem(STORAGE_KEY);
    let legacy = false;
    if (!raw) { raw = ls?.getItem(LEGACY.key); legacy = !!raw; }
    copyLegacyUi();
    if (!raw) return { state: defaultState(), fresh: true, migrated: [], legacy: hasLegacy() };
    const migrated = legacy ? ['нова назва — MOBILITY TRAIL'] : [];
    return { state: normalizeState(JSON.parse(raw), undefined, migrated), fresh: false, migrated, legacy: legacy || hasLegacy() };
  } catch {
    return { state: defaultState(), fresh: true, error: true, migrated: [] };
  }
}

function legacyKeys() {
  const ls = globalThis.localStorage;
  const out = [];
  for (let i = 0; i < (ls?.length || 0); i++) { const k = ls.key(i); if (k && k.startsWith(LEGACY.prefix)) out.push(k); }
  return out;
}
function hasLegacy() { try { return legacyKeys().length > 0; } catch { return false; } }

// Дрібні налаштування пристрою (напр., приховані підказки) переносимо ще до першого показу екрана.
function copyLegacyUi() {
  try {
    const ls = globalThis.localStorage;
    for (const k of legacyKeys()) {
      const ui = k.slice(LEGACY.prefix.length);
      if (ui.startsWith('ui:') && ls.getItem(`mobility-trail:${ui}`) === null) ls.setItem(`mobility-trail:${ui}`, ls.getItem(k));
    }
  } catch { /* сховище недоступне — не страшно */ }
}
// Після того як дані збережено під новою назвою, старі записи прибираємо.
export function dropLegacy() {
  try {
    copyLegacyUi();
    for (const k of legacyKeys()) globalThis.localStorage.removeItem(k);
    return true;
  } catch { return false; }
}

export function saveState(state) {
  try {
    state.meta.updated = new Date().toISOString();
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearStorage() {
  try { globalThis.localStorage.removeItem(STORAGE_KEY); for (const k of legacyKeys()) globalThis.localStorage.removeItem(k); return true; } catch { return false; }
}

/* ───────────────────────── Експорт / імпорт ───────────────────────── */

export function exportJSON(state) {
  return JSON.stringify({
    schema: SCHEMA, version: SCHEMA_VERSION, app: 'MOBILITY TRAIL', appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: state.settings, calendar: state.calendar, history: state.history, today: state.today, meta: state.meta,
  }, null, 2);
}

// Перевірка резервної копії: критичні помилки блокують імпорт, дрібні — виправляються з попередженням.
export function validateImport(text) {
  const errors = [], warnings = [];
  let obj;
  try { obj = typeof text === 'string' ? JSON.parse(text) : text; } catch { return { ok: false, errors: ['Файл не є коректним JSON.'], warnings }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['Очікувався обʼєкт резервної копії MOBILITY TRAIL.'], warnings };
  if (obj.schema !== SCHEMA && obj.schema !== LEGACY.schema) errors.push('Це не резервна копія MOBILITY TRAIL (поле schema).');
  const v = toNum(obj.version, NaN);
  if (!Number.isInteger(v) || v < 1) errors.push('Невідома версія схеми.');
  else if (v > SCHEMA_VERSION) errors.push('Копію створено новішою версією застосунку — оновіть застосунок.');
  if (!obj.settings || typeof obj.settings !== 'object' || Array.isArray(obj.settings)) errors.push('Немає розділу settings.');
  if (obj.history !== undefined && !Array.isArray(obj.history)) errors.push('Розділ history має бути списком.');
  if (obj.calendar !== undefined && (typeof obj.calendar !== 'object' || Array.isArray(obj.calendar) || obj.calendar === null)) errors.push('Розділ calendar має бути обʼєктом.');
  if (errors.length) return { ok: false, errors, warnings };
  const migrated = [];
  const state = normalizeState(obj, (path, msg) => warnings.push(`${path}: ${msg}`), migrated);
  return {
    ok: true, errors, warnings, state, migrated,
    summary: { trips: state.history.filter((r) => r.kind === 'trip').length, passes: state.history.filter((r) => r.kind === 'pass').length, days: Object.keys(state.calendar).length },
  };
}

export function uid(prefix = 'id') {
  const rnd = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(2)).join('') : `${Math.random()}`.slice(2);
  return `${prefix}_${Date.now().toString(36)}_${Number(rnd.slice(0, 12)).toString(36)}`;
}
