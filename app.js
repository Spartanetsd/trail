// MOBILITY TRAIL — app.js
// Контролер: стан, збереження, перемикання вкладок, кеш розрахунків, тема, service worker.

import * as E from './engine.js';
import { loadState, saveState, normalizeState, taxiSnapshot, syncTaxi, dropLegacy, STORAGE_KEY, APP_VERSION } from './store.js';
import { $, $$, toast, initSheet, isIOS } from './ui.js';
import { buildInsights } from './assistant.js';
import home from './view-home.js';
import compare from './view-compare.js';
import calendar from './view-calendar.js';
import savings from './view-savings.js';
import settings from './view-settings.js';

const VIEWS = { home, compare, calendar, savings, settings };
const boot = loadState();
let saveTimer = 0;
let storageWarned = false;

export const app = {
  state: boot.state,
  version: 1,
  tab: 'home',
  cache: new Map(),
  dirty: new Set(Object.keys(VIEWS)),
  appVersion: APP_VERSION,

  get s() { return this.state.settings; },
  get cal() { return this.state.calendar; },
  get hist() { return this.state.history; },

  memo(key, fn) {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key);
  },

  // Усі зміни стану йдуть сюди: кеш скидається, дані зберігаються, вкладки позначаються «застарілими».
  update(mutator, { render = true } = {}) {
    const s0 = this.state.settings;
    const taxi0 = taxiSnapshot(s0);
    mutator(this.state);
    const s = this.state.settings;
    s.benefit.persons = Math.min(s.benefit.persons, s.trip.passengers);
    // Основна ціна таксі й ціна обраного тарифу змінюються разом. Якщо налаштування замінили цілком — беремо ціну тарифу.
    syncTaxi(s, s === s0 ? taxi0 : null);
    this.version += 1;
    this.cache.clear();
    this.persistSoon();
    for (const k of Object.keys(VIEWS)) this.dirty.add(k);
    if (render) this.renderActive();
  },
  persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => this.persistNow(), 120);
  },
  persistNow() {
    clearTimeout(saveTimer);
    const ok = saveState(this.state);
    if (!ok && !storageWarned) {
      storageWarned = true;
      toast('Браузер не дозволив зберегти дані. Вимкніть приватний режим або зробіть експорт у «Налаштуваннях».', { ms: 6000 });
    }
    return ok;
  },
  replaceState(next) {
    this.state = next;
    this.update(() => {}, { render: false });
    this.applyTheme();
    this.renderActive();
  },

  /* ───── Сьогодні ───── */
  today() { return E.todayStr(); },
  todayFlags() {
    const t = this.state.today;
    if (t.date !== this.today()) return { ...E.DEFAULT_STATE, roundTrip: this.s.trip.returnDefault };
    return t.flags;
  },
  ensureToday(st) {
    const d = this.today();
    if (st.today.date !== d) st.today = { date: d, flags: { ...E.DEFAULT_STATE, roundTrip: st.settings.trip.returnDefault }, eligible: null };
  },
  setTodayFlags(patch) {
    this.update((st) => { this.ensureToday(st); Object.assign(st.today.flags, patch); }, { render: false });
  },
  todayEligible() {
    if (!this.s.benefit.enabled) return false;
    const t = this.state.today;
    if (t.date === this.today() && typeof t.eligible === 'boolean') return t.eligible;
    return E.resolveEligible(this.today(), this.s, this.cal);
  },
  setTodayEligible(v) {
    this.update((st) => { this.ensureToday(st); st.today.eligible = !!v; }, { render: false });
  },
  todayCtx() {
    return { state: this.todayFlags(), eligible: this.todayEligible(), passPersons: E.passPersonsOn(this.today(), this.hist, this.s.trip.passengers) };
  },
  rec() { return this.memo('rec', () => E.recommend(this.s, this.todayCtx())); },
  todayType() { return E.resolveDayType(this.today(), this.s, this.cal); },

  /* ───── Періоди ───── */
  monthRange(date = this.today()) { return { from: E.monthStart(date), to: E.monthEnd(date) }; },
  weekRange(date = this.today()) { return { from: E.weekStart(date), to: E.weekEnd(date) }; },
  month() { return this.memo('month', () => E.compareModes(this.s, this.cal, this.hist, this.monthRange())); },
  week() { return this.memo('week', () => E.computePeriod(this.s, this.cal, this.hist, this.weekRange())); },
  bank() { return this.memo('bank', () => E.bankSummary(this.hist, this.s)); },
  projMonth() { return this.memo('projMonth', () => E.projectedSavings(this.s, this.cal, this.hist, { ...this.monthRange(), today: this.today() })); },
  projWeek() { return this.memo('projWeek', () => E.projectedSavings(this.s, this.cal, this.hist, { ...this.weekRange(), today: this.today() })); },
  // Порада щодо проїзних дивиться вперед: від сьогодні до кінця місяця, а в останній тиждень — на наступний місяць.
  passHorizon() {
    const t = this.today();
    const end = E.monthEnd(t);
    if (E.dayDiff(t, end) < 7) { const nx = E.addDays(end, 1); return { from: nx, to: E.monthEnd(nx), label: 'Наступного місяця' }; }
    return { from: t, to: end, label: 'До кінця місяця' };
  },
  passPlan() { return this.memo('passPlan', () => ({ ...E.computePeriod(this.s, this.cal, this.hist, this.passHorizon()), label: this.passHorizon().label })); },
  leaks() { return this.memo('leaks', () => E.findLeaks(this.s, this.cal, this.hist, { today: this.today() })); },
  wealth() { return this.memo('wealth', () => E.wealthPlan(this.s, this.cal, this.hist, { today: this.today() })); },
  budget() { return this.memo('budget', () => E.budgetStatus(this.s, this.cal, this.hist, { today: this.today() })); },
  insights() {
    return this.memo('insights', () => buildInsights({
      s: this.s, rec: this.rec(), month: this.month(), passPlan: this.passPlan(), bankNow: this.bank(), weekProjected: this.projWeek(), today: this.today(), cal: this.cal,
      leaks: this.leaks(), budget: this.budget(),
    }));
  },
  applyPreset(key) {
    const p = E.WEIGHT_PRESETS[key];
    if (!p) return;
    this.update((st) => { st.settings.weights = { ...p.w }; }, { render: false });
    this.dirty.add(this.tab);
  },

  /* ───── Вкладки ───── */
  go(tab, { anchor = null, focus = false } = {}) {
    if (!VIEWS[tab]) tab = 'home';
    const changed = tab !== this.tab;
    this.tab = tab;
    for (const [k] of Object.entries(VIEWS)) {
      const sec = $(`#view-${k}`);
      sec.hidden = k !== tab;
    }
    for (const b of $$('.dock-btn')) {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    if (this.dirty.has(tab) || changed) this.renderActive();
    if (changed) {
      try { history.replaceState(null, '', `#${tab}`); } catch { /* file:// */ }
      if (!anchor) window.scrollTo({ top: 0 });
    }
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
    if (focus) $('#views').focus({ preventScroll: true });
  },
  renderActive() {
    const v = VIEWS[this.tab];
    v.render(this, $(`#view-${this.tab}`));
    this.dirty.delete(this.tab);
  },

  /* ───── Тема ───── */
  applyTheme() {
    let t = this.s.ui.theme;
    if (t === 'system') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#edf0f5' : '#06080c');
  },
  setTheme(theme) {
    this.update((st) => { st.settings.ui.theme = theme; }, { render: false });
    this.applyTheme();
    this.renderActive();
  },
};

/* ───────── Запуск ───────── */
// Safari на iPhone: :active (натискання з відгуком) працює лише за наявності touchstart-слухача;
// нижня панель ховається, поки відкрита екранна клавіатура — як у застосунках iPhone.
// Клавіатуру визначаємо за тим, що видима область стала нижчою: так док не зникає на iPad
// з фізичною клавіатурою чи на комп’ютері, де екранної клавіатури немає.
function touchPolish() {
  document.addEventListener('touchstart', () => {}, { passive: true });
  const vv = window.visualViewport;
  if (!vv) return;
  const typing = (el) => !!el?.matches?.('input:not([type=checkbox]):not([type=range]):not([type=file]), textarea, select');
  const check = () => {
    const open = typing(document.activeElement) && window.innerHeight - vv.height * vv.scale > 140;
    document.documentElement.classList.toggle('kb-open', open);
  };
  vv.addEventListener('resize', check);
  document.addEventListener('focusin', () => setTimeout(check, 350));
  document.addEventListener('focusout', () => setTimeout(check, 80));
}

function start() {
  touchPolish();
  initSheet();
  // Зміни, зроблені в аркуші (стан ранку, пріоритети), одразу видно на екрані під ним.
  $('#sheet').addEventListener('close', () => { if (app.dirty.has(app.tab)) app.renderActive(); });
  app.applyTheme();
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (app.s.ui.theme === 'system') app.applyTheme(); });

  for (const [k, v] of Object.entries(VIEWS)) v.mount?.(app, $(`#view-${k}`));
  $('.dock').addEventListener('click', (ev) => {
    const b = ev.target.closest('.dock-btn');
    if (b) app.go(b.dataset.tab, { focus: true });
  });

  const initial = (location.hash || '').replace('#', '');
  app.go(VIEWS[initial] ? initial : 'home');

  // Новий день — новий стан і нова рекомендація.
  let lastDay = app.today();
  const tick = () => {
    if (app.today() !== lastDay) { lastDay = app.today(); app.cache.clear(); for (const k of Object.keys(VIEWS)) app.dirty.add(k); app.renderActive(); }
  };
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') app.persistNow(); else tick();
  });
  window.addEventListener('pagehide', () => app.persistNow());
  // Дані змінили в іншій вкладці — беремо новіші, щоб не перезаписати їх старими при закритті цієї.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      app.state = normalizeState(JSON.parse(e.newValue));
      app.version += 1;
      app.cache.clear();
      for (const k of Object.keys(VIEWS)) app.dirty.add(k);
      app.applyTheme();
      app.renderActive();
    } catch { /* пошкоджений запис з іншої вкладки ігноруємо */ }
  });

  let resizeTimer = 0;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; VIEWS[app.tab].onResize?.(app, $(`#view-${app.tab}`)); } }, 200);
  });
  window.addEventListener('online', () => VIEWS[app.tab] === home && app.renderActive());
  window.addEventListener('offline', () => VIEWS[app.tab] === home && app.renderActive());

  registerSW();
  // Просимо браузер не стирати дані автоматично (Safari 17+, Chrome). Відмова нічого не ламає.
  try { navigator.storage?.persist?.()?.catch?.(() => {}); } catch { /* немає Storage API */ }
  if (boot.error) toast('Збережені дані пошкоджені — відкрито стартові налаштування.', { ms: 5000 });
  else if (boot.migrated?.length) {
    const saved = app.persistNow();
    if (saved && boot.legacy) dropLegacy();
    toast(`Оновлено до ${APP_VERSION}: ${boot.migrated.join(', ')}.`, { ms: 7000 });
  } else if (boot.legacy && app.persistNow()) dropLegacy();
  window.__APP_READY = true;
  window.__APP = app;
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;
  let requested = false;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // iPhone тримає застосунок у пам’яті днями: перевіряємо нову версію, коли його знову відкривають (не частіше ніж раз на 30 хв).
    let lastCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 30 * 60000) return;
      lastCheck = Date.now();
      reg.update().catch(() => {});
    });
    const offer = (w) => toast('Доступна нова версія MOBILITY TRAIL', {
      action: 'Оновити',
      onAction: () => { requested = true; w.postMessage({ type: 'SKIP_WAITING' }); },
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(() => { /* офлайн-режим недоступний — застосунок працює далі */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (requested) location.reload(); });
}

start();
