// MOBILITY ZERO — store.js
// Стартові налаштування, схема даних, збереження в localStorage, експорт / імпорт JSON.

import { toNum, clamp, isDateStr, parseHM, fmtHM, PLAN_MODES, DAY_TYPES, FARE_MODES, SEGMENT_MODES, DEFAULT_STATE } from './engine.js';

export const STORAGE_KEY = 'mobility-zero:v1';
export const SCHEMA = 'mobility-zero';
export const SCHEMA_VERSION = 1;
export const APP_VERSION = '1.0.0';

/* ───────────────────────── Стартові дані ───────────────────────── */

export function defaultRoutes() {
  return [
    {
      id: 'r1', name: 'Трамвай №15', enabled: true, confirmed: false, walkEndMin: 7,
      segments: [{ mode: 'tram', line: '15', walkMin: 8, waitMin: 8, rideMin: 32, price: 0 }],
    },
    {
      id: 'r2', name: 'Трамвай №1 + тролейбус №4', enabled: false, confirmed: false, walkEndMin: 5,
      segments: [
        { mode: 'tram', line: '1', walkMin: 6, waitMin: 8, rideMin: 18, price: 0 },
        { mode: 'trolley', line: '4', walkMin: 5, waitMin: 9, rideMin: 14, price: 0 },
      ],
    },
    {
      id: 'r3', name: 'Метро + тролейбус №4', enabled: false, confirmed: false, walkEndMin: 5,
      segments: [
        { mode: 'metro', line: 'М', walkMin: 12, waitMin: 5, rideMin: 10, price: 0 },
        { mode: 'trolley', line: '4', walkMin: 6, waitMin: 9, rideMin: 14, price: 0 },
      ],
    },
  ];
}

export function defaultSettings() {
  return {
    route: {
      a: { label: 'Кошиця, 2', address: 'вулиця Олександра Кошиця, 2, Дніпро', coords: '', confirmed: false },
      b: { label: 'Самарського, 10', address: 'вулиця Якова Самарського, 10, Дніпро', coords: '', confirmed: false },
      swapped: false,
    },
    trip: { passengers: 2, arriveBy: '08:30', returnDefault: true, defaultMode: 'zero', workDays: [0, 1, 2, 3, 4] },
    car: {
      name: 'Opel Astra H 1.6 (2006)', distanceKm: 7, consumption: 9, fuelPrice: 89.38, wearPerKm: 3,
      parkingPerHour: 15, parkingHours: 6, driveMin: 20, parkWalkMin: 6, fixedMonthly: 0, capacity: 5,
      winter: false, winterExtraPct: 15, trafficFuelPct: 15, includeWear: true,
    },
    taxi: { price: 160, waitMin: 7, rideMin: 20, capacity: 4 },
    transit: {
      fares: { tram: 10, trolley: 10, bus: 20, metro: 10 },
      passes: { weeklyPrice: 100, monthlyPrice: 410, covers: ['tram'], weeklyType: 'rolling', monthlyType: 'calendar' },
      routes: defaultRoutes(),
      ecoRoute: 'auto',
    },
    flex: { there: 'taxi', back: 'r1' },
    benefit: { enabled: false, persons: 2, modes: ['tram', 'trolley', 'metro', 'bus'], defaultEligible: false },
    weights: { cost: 45, comfort: 25, speed: 20, reliability: 10 },
    bank: { pct: 30, weeklyGoal: 700, monthlyGoal: 3000, baseline: 'carFull' },
    misc: { trafficFactor: 1.6, ptSlowPct: 0 },
    ui: { theme: 'dark' },
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
  trip: { passengers: N(1, 8, true), arriveBy: TIME(), returnDefault: B(), defaultMode: E(PLAN_MODES), workDays: DAYS() },
  car: {
    name: S(60), distanceKm: N(0, 500), consumption: N(0, 40), fuelPrice: N(0, 1000), wearPerKm: N(0, 100),
    parkingPerHour: N(0, 2000), parkingHours: N(0, 24), driveMin: N(1, 600), parkWalkMin: N(0, 120),
    fixedMonthly: N(0, 1e6), capacity: N(1, 9, true), winter: B(), winterExtraPct: N(0, 100), trafficFuelPct: N(0, 100), includeWear: B(),
  },
  taxi: { price: N(0, 20000), waitMin: N(0, 120), rideMin: N(1, 600), capacity: N(1, 8, true) },
  transit: {
    fares: { tram: N(0, 1000), trolley: N(0, 1000), bus: N(0, 1000), metro: N(0, 1000) },
    passes: { weeklyPrice: N(0, 20000), monthlyPrice: N(0, 50000), covers: SET(FARE_MODES), weeklyType: E(['rolling', 'calendar']), monthlyType: E(['calendar', 'rolling30']) },
    routes: { t: 'routes' },
    ecoRoute: S(40),
  },
  flex: { there: S(40), back: S(40) },
  benefit: { enabled: B(), persons: N(0, 8, true), modes: SET(FARE_MODES), defaultEligible: B() },
  weights: { cost: N(0, 100), comfort: N(0, 100), speed: N(0, 100), reliability: N(0, 100) },
  bank: { pct: N(0, 100), weeklyGoal: N(0, 1e7), monthlyGoal: N(0, 1e7), baseline: E(['carFull', 'carCash']) },
  misc: { trafficFactor: N(1, 4), ptSlowPct: N(0, 300) },
  ui: { theme: E(['dark', 'light', 'system']) },
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

const SEG_SCHEMA = { mode: E(SEG_MODES), line: S(12), walkMin: N(0, 120), waitMin: N(0, 120), rideMin: N(0, 600), price: N(0, 20000) };
const SEG_DEFAULT = { mode: 'tram', line: '', walkMin: 5, waitMin: 8, rideMin: 15, price: 0 };
const ROUTE_SCHEMA = { id: S(40), name: S(60), enabled: B(), confirmed: B(), walkEndMin: N(0, 120) };

function normRoutes(value, def, path, warn) {
  if (value === undefined) return def;
  if (!Array.isArray(value)) { warn(path, 'очікувався список маршрутів'); return def; }
  const out = [];
  const ids = new Set();
  value.slice(0, ROUTE_LIMIT).forEach((r, i) => {
    if (!r || typeof r !== 'object') { warn(`${path}[${i}]`, 'маршрут пропущено'); return; }
    const base = normObject(ROUTE_SCHEMA, r, { id: `r${i + 1}`, name: `Маршрут ${i + 1}`, enabled: true, confirmed: false, walkEndMin: 5 }, `${path}[${i}]`, warn);
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

export function normalizeSettings(raw, warn = () => {}) {
  const s = normObject(SETTINGS_SCHEMA, raw, defaultSettings(), 'settings', warn);
  s.benefit.persons = Math.min(s.benefit.persons, s.trip.passengers);
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

export function normalizeState(raw, warn = () => {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const st = defaultState();
  st.settings = normalizeSettings(src.settings, warn);
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
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return { state: defaultState(), fresh: true };
    return { state: normalizeState(JSON.parse(raw)), fresh: false };
  } catch {
    return { state: defaultState(), fresh: true, error: true };
  }
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
  try { globalThis.localStorage.removeItem(STORAGE_KEY); return true; } catch { return false; }
}

/* ───────────────────────── Експорт / імпорт ───────────────────────── */

export function exportJSON(state) {
  return JSON.stringify({
    schema: SCHEMA, version: SCHEMA_VERSION, app: 'MOBILITY ZERO', appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: state.settings, calendar: state.calendar, history: state.history, today: state.today, meta: state.meta,
  }, null, 2);
}

// Перевірка резервної копії: критичні помилки блокують імпорт, дрібні — виправляються з попередженням.
export function validateImport(text) {
  const errors = [], warnings = [];
  let obj;
  try { obj = typeof text === 'string' ? JSON.parse(text) : text; } catch { return { ok: false, errors: ['Файл не є коректним JSON.'], warnings }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['Очікувався обʼєкт резервної копії MOBILITY ZERO.'], warnings };
  if (obj.schema !== SCHEMA) errors.push('Це не резервна копія MOBILITY ZERO (поле schema).');
  const v = toNum(obj.version, NaN);
  if (!Number.isInteger(v) || v < 1) errors.push('Невідома версія схеми.');
  else if (v > SCHEMA_VERSION) errors.push('Копію створено новішою версією застосунку — оновіть застосунок.');
  if (!obj.settings || typeof obj.settings !== 'object' || Array.isArray(obj.settings)) errors.push('Немає розділу settings.');
  if (obj.history !== undefined && !Array.isArray(obj.history)) errors.push('Розділ history має бути списком.');
  if (obj.calendar !== undefined && (typeof obj.calendar !== 'object' || Array.isArray(obj.calendar) || obj.calendar === null)) errors.push('Розділ calendar має бути обʼєктом.');
  if (errors.length) return { ok: false, errors, warnings };
  const state = normalizeState(obj, (path, msg) => warnings.push(`${path}: ${msg}`));
  return {
    ok: true, errors, warnings, state,
    summary: { trips: state.history.filter((r) => r.kind === 'trip').length, passes: state.history.filter((r) => r.kind === 'pass').length, days: Object.keys(state.calendar).length },
  };
}

export function uid(prefix = 'id') {
  const rnd = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(2)).join('') : `${Math.random()}`.slice(2);
  return `${prefix}_${Date.now().toString(36)}_${Number(rnd.slice(0, 12)).toString(36)}`;
}
