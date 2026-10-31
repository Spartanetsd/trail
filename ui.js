// MOBILITY ZERO — ui.js
// Дрібні інструменти інтерфейсу: екранування, іконки, тости, нижній аркуш, поля вводу.

import { toNum, clamp, fmtNum } from './engine.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const reducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ───────── Шляхи в обʼєкті налаштувань ───────── */
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

/* ───────── Іконки (контурні, 24×24) ───────── */
const P = {
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  compare: '<path d="M5 20V11M12 20V5M19 20v-7"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  savings: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M14.6 9.3c-.5-.8-1.5-1.3-2.6-1.3-1.5 0-2.6.8-2.6 1.9 0 2.6 5.4 1.3 5.4 4.1 0 1.1-1.2 2-2.8 2-1.2 0-2.3-.5-2.8-1.4"/>',
  settings: '<path d="M5 7h9M18 7h1M5 17h3M12 17h7"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  swap: '<path d="M7 4v14M3.5 14.5 7 18l3.5-3.5M17 20V6M13.5 9.5 17 6l3.5 3.5"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16"/>',
  map: '<path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2z"/><path d="M9 4v14M15 6v14"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  down: '<path d="m6 9.5 6 6 6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>',
  warn: '<path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  spark: '<path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2z"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19h14"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  brush: '<path d="M14.5 4.5 19.5 9.5 11 18l-5 .5.5-5z"/><path d="m12.5 6.5 5 5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
};
export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
}

/* ───────── Тост ───────── */
let toastTimer = 0;
export function toast(message, { action = null, onAction = null, ms = 3200 } = {}) {
  const el = $('#toast');
  if (!el) return;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast-btn">${esc(action)}</button>` : ''}`;
  el.classList.add('show');
  const btn = el.querySelector('.toast-btn');
  if (btn && onAction) btn.addEventListener('click', () => { el.classList.remove('show'); onAction(); }, { once: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? Math.max(ms, 5500) : ms);
}

/* ───────── Нижній аркуш (dialog) ───────── */
let sheetCtl = null;
export function openSheet({ title, render, onAction, onChange, onInput, onClose, wide = false }) {
  const dlg = $('#sheet');
  const body = $('#sheet-body');
  const titleEl = $('#sheet-title');
  closeSheetSilently();
  titleEl.textContent = title;
  dlg.classList.toggle('wide', wide);
  const ctl = {
    refresh() { body.innerHTML = render(); },
    close() { if (dlg.open) dlg.close(); },
    body,
  };
  const click = (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t || !body.contains(t)) return;
    onAction?.(t.dataset.act, t, ev, ctl);
  };
  const change = (ev) => onChange?.(ev.target, ev, ctl);
  const input = (ev) => onInput?.(ev.target, ev, ctl);
  body.addEventListener('click', click);
  body.addEventListener('change', change);
  body.addEventListener('input', input);
  sheetCtl = {
    ctl,
    cleanup() {
      body.removeEventListener('click', click);
      body.removeEventListener('change', change);
      body.removeEventListener('input', input);
      onClose?.();
    },
  };
  ctl.refresh();
  if (!dlg.open) dlg.showModal();
  body.scrollTop = 0;
  return ctl;
}
function closeSheetSilently() { if (sheetCtl) { const c = sheetCtl; sheetCtl = null; c.cleanup(); } }
export function closeSheet() { const dlg = $('#sheet'); if (dlg?.open) dlg.close(); }
export function initSheet() {
  const dlg = $('#sheet');
  dlg.addEventListener('close', () => closeSheetSilently());
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });
  $('#sheet-close').addEventListener('click', () => dlg.close());
}

/* ───────── Поля вводу ───────── */
// Числове поле: text + inputmode, щоб на iPhone працювала кома.
export function numField({ bind, label, value, unit = '', min = 0, max = 1e9, step = 'any', int = false, hint = '', assumption = false, id }) {
  const fid = id || `f-${bind.replace(/\W/g, '-')}`;
  return `<div class="field">
    <label for="${fid}">${esc(label)}${assumption ? '<span class="tag-assume" title="Стартове припущення — змініть на своє"><span class="sr-only">, стартове припущення</span></span>' : ''}</label>
    <div class="input-wrap">
      <input id="${fid}" type="text" inputmode="${int ? 'numeric' : 'decimal'}" autocomplete="off" enterkeyhint="done"
        data-bind="${esc(bind)}" data-kind="num" data-min="${min}" data-max="${max}" data-int="${int ? 1 : 0}" data-step="${step}"
        value="${esc(fmtInput(value))}">
      ${unit ? `<span class="unit">${esc(unit)}</span>` : ''}
    </div>
    ${hint ? `<p class="hint">${hint}</p>` : ''}
    <p class="field-msg" aria-live="polite"></p>
  </div>`;
}
export function textField({ bind, label, value, placeholder = '', max = 200, id, hint = '' }) {
  const fid = id || `f-${bind.replace(/\W/g, '-')}`;
  return `<div class="field">
    <label for="${fid}">${esc(label)}</label>
    <div class="input-wrap"><input id="${fid}" type="text" data-bind="${esc(bind)}" data-kind="text" maxlength="${max}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></div>
    ${hint ? `<p class="hint">${hint}</p>` : ''}
  </div>`;
}
export function switchRow({ bind, label, checked, hint = '', id }) {
  const fid = id || `f-${bind.replace(/\W/g, '-')}`;
  return `<div class="switch-row">
    <label for="${fid}"><span>${esc(label)}</span>${hint ? `<small>${hint}</small>` : ''}</label>
    <input id="${fid}" class="switch" type="checkbox" role="switch" data-bind="${esc(bind)}" data-kind="bool" ${checked ? 'checked' : ''}>
  </div>`;
}
export function selectField({ bind, label, value, options, id, hint = '' }) {
  const fid = id || `f-${bind.replace(/\W/g, '-')}`;
  return `<div class="field">
    <label for="${fid}">${esc(label)}</label>
    <div class="input-wrap select-wrap"><select id="${fid}" data-bind="${esc(bind)}" data-kind="select">
      ${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}
    </select>${icon('down', 'select-ico')}</div>
    ${hint ? `<p class="hint">${hint}</p>` : ''}
  </div>`;
}
export function fmtInput(v) {
  if (typeof v !== 'number') return v ?? '';
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

// Читає значення поля за його data-атрибутами. Повертає { value, corrected } або null, якщо значення некоректне.
export function readField(el, previous) {
  const kind = el.dataset.kind;
  if (kind === 'bool') return { value: el.checked };
  if (kind === 'text') return { value: el.value.trim() };
  if (kind === 'select') return { value: el.value };
  if (kind === 'num' || kind === 'range') {
    const raw = toNum(el.value, NaN);
    if (!Number.isFinite(raw)) return { value: previous, invalid: true };
    const min = toNum(el.dataset.min, -Infinity), max = toNum(el.dataset.max, Infinity);
    let v = clamp(raw, min, max);
    if (el.dataset.int === '1') v = Math.round(v);
    return { value: v, corrected: v !== raw };
  }
  return null;
}

export function setFieldMsg(el, text, tone = 'warn') {
  const msg = el.closest('.field')?.querySelector('.field-msg');
  if (!msg) return;
  msg.textContent = text || '';
  msg.dataset.tone = tone;
}

/* ───────── Анімація чисел ───────── */
export function countUp(root = document) {
  if (reducedMotion()) return;
  for (const el of $$('[data-count]', root)) {
    const to = toNum(el.dataset.count, 0);
    const digits = Number(el.dataset.digits || 0);
    const suffix = el.dataset.suffix || '';
    const t0 = performance.now(), dur = 650;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - (1 - k) ** 3;
      el.textContent = `${fmtNum(to * e, digits)}${suffix}`;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/* ───────── Файли ───────── */
export async function shareOrDownload(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export const DOW_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
export const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
export const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
export function humanDate(str, withDow = false) {
  const [y, m, d] = str.split('-').map(Number);
  const base = `${d} ${MONTHS_GEN[m - 1]}`;
  if (!withDow) return base;
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return `${DOW_SHORT[dow]}, ${base}`;
}
export const shortDate = (str) => `${str.slice(8, 10)}.${str.slice(5, 7)}`;
