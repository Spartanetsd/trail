// MOBILITY ZERO — charts.js
// Легкі SVG/HTML-графіки без бібліотек: лінії з перехрестям, сегментована смуга, матриця, теплова карта.

import { fmtNum, fmtUAH, clamp } from './engine.js';
import { esc } from './ui.js';

export function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (max === min) { max = min + 1; }
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function fmtAxis(v) {
  const a = Math.abs(v);
  if (a >= 10000) return `${fmtNum(v / 1000, a >= 100000 ? 0 : 1)} тис.`;
  return fmtNum(v, a < 10 && Math.abs(v % 1) > 1e-9 ? 1 : 0);
}

/* ───────── Лінійний графік (кілька серій, перехрестя, позначки) ───────── */
// series: [{ key, label, cls, values: number[], dashed? }]
// opts: { xs, xLabel(i) -> string, height, yFmt, markers: [{x, y, label}], xValueToPos? }
export function lineChart(container, series, opts) {
  const W = Math.max(280, Math.round(container.clientWidth || 340));
  const H = opts.height || 210;
  const pad = { l: 46, r: 14, t: 16, b: 28 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const n = opts.xs.length;
  const all = series.flatMap((s) => s.values.filter(Number.isFinite));
  let yMinRaw = Math.min(0, ...all), yMaxRaw = Math.max(0, ...all);
  if (yMaxRaw - yMinRaw < (opts.minSpan || 0)) yMaxRaw = yMinRaw + opts.minSpan;
  const ticks = niceTicks(yMinRaw, yMaxRaw, 4);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const xNumeric = typeof opts.xs[0] === 'number';
  const x0 = xNumeric ? opts.xs[0] : 0, x1 = xNumeric ? opts.xs[n - 1] : n - 1;
  const X = (i) => pad.l + (n <= 1 ? iw / 2 : ((xNumeric ? opts.xs[i] : i) - x0) / (x1 - x0 || 1) * iw);
  const Xv = (v) => pad.l + (v - x0) / (x1 - x0 || 1) * iw;
  const Y = (v) => pad.t + ih - (v - yMin) / (yMax - yMin || 1) * ih;
  const yFmt = opts.yFmt || fmtAxis;

  let svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.aria || 'Графік')}">`;
  for (const t of ticks) {
    svg += `<line class="grid${t === 0 ? ' base' : ''}" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t)}" y2="${Y(t)}"/>`;
    svg += `<text class="ax" x="${pad.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(yFmt(t))}</text>`;
  }
  const xl = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  for (const i of xl) {
    svg += `<text class="ax" x="${X(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(opts.xLabel(i))}</text>`;
  }
  for (const s of series) {
    let d = '', started = false;
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) { started = false; return; }
      d += `${started ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      started = true;
    });
    if (d) svg += `<path class="ln ${s.cls}${s.dashed ? ' dashed' : ''}" d="${d}"/>`;
    const last = lastFinite(s.values);
    if (last >= 0 && s.endDot !== false) svg += `<circle class="dot ${s.cls}" cx="${X(last)}" cy="${Y(s.values[last])}" r="4"/>`;
  }
  for (const m of opts.markers || []) {
    const cx = Xv(m.x), cy = Y(m.y);
    svg += `<circle class="mark" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5"/>`;
    if (m.label) {
      const anchor = cx > W - 80 ? 'end' : cx < pad.l + 40 ? 'start' : 'middle';
      svg += `<text class="mark-lbl" x="${cx.toFixed(1)}" y="${(cy - 10).toFixed(1)}" text-anchor="${anchor}">${esc(m.label)}</text>`;
    }
  }
  svg += `<line class="xhair" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" visibility="hidden"/>`;
  svg += series.map((s) => `<circle class="xdot ${s.cls}" r="4" visibility="hidden"/>`).join('');
  svg += `<rect class="hit" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="transparent" tabindex="0" aria-label="Перегляд значень: стрілки ліворуч і праворуч"/>`;
  svg += '</svg>';
  container.innerHTML = `<div class="chart-box">${svg}<div class="chart-tip" hidden></div></div>`;

  const root = container.querySelector('.chart-box');
  const svgEl = root.querySelector('svg');
  const tip = root.querySelector('.chart-tip');
  const hair = svgEl.querySelector('.xhair');
  const dots = [...svgEl.querySelectorAll('.xdot')];
  const hit = svgEl.querySelector('.hit');
  let idx = -1;
  const show = (i) => {
    idx = clamp(i, 0, n - 1);
    const x = X(idx);
    hair.setAttribute('x1', x); hair.setAttribute('x2', x); hair.setAttribute('visibility', 'visible');
    series.forEach((s, k) => {
      const v = s.values[idx];
      if (Number.isFinite(v)) { dots[k].setAttribute('cx', x); dots[k].setAttribute('cy', Y(v)); dots[k].setAttribute('visibility', 'visible'); }
      else dots[k].setAttribute('visibility', 'hidden');
    });
    tip.replaceChildren();
    const head = document.createElement('div');
    head.className = 'tip-head';
    head.textContent = opts.xLabel(idx, true);
    tip.appendChild(head);
    for (const s of [...series].sort((a, b) => (b.values[idx] ?? -Infinity) - (a.values[idx] ?? -Infinity))) {
      const v = s.values[idx];
      if (!Number.isFinite(v)) continue;
      const row = document.createElement('div');
      row.className = 'tip-row';
      const key = document.createElement('i');
      key.className = `key ${s.cls}${s.dashed ? ' dashed' : ''}`;
      const val = document.createElement('b');
      val.textContent = (opts.tipFmt || fmtUAH)(v);
      const lbl = document.createElement('span');
      lbl.textContent = s.label;
      row.append(key, val, lbl);
      tip.appendChild(row);
    }
    tip.hidden = false;
    const box = root.getBoundingClientRect();
    const scale = box.width / W;
    const tw = tip.offsetWidth;
    let left = x * scale + 12;
    if (left + tw > box.width - 4) left = x * scale - tw - 12;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = '6px';
  };
  const hide = () => { hair.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); tip.hidden = true; };
  const fromEvent = (ev) => {
    const r = svgEl.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(X(i) - px); if (d < bd) { bd = d; best = i; } }
    return best;
  };
  hit.addEventListener('pointermove', (ev) => show(fromEvent(ev)));
  hit.addEventListener('pointerdown', (ev) => show(fromEvent(ev)));
  hit.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hide(); });
  hit.addEventListener('focus', () => show(idx < 0 ? n - 1 : idx));
  hit.addEventListener('blur', hide);
  hit.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') { show(idx + 1); ev.preventDefault(); }
    if (ev.key === 'ArrowLeft') { show(idx - 1); ev.preventDefault(); }
    if (ev.key === 'Escape') hide();
  });
}

function lastFinite(arr) { for (let i = arr.length - 1; i >= 0; i--) if (Number.isFinite(arr[i])) return i; return -1; }

export function legendHTML(items) {
  return `<ul class="legend">${items.map((it) => `<li><i class="key ${it.cls}${it.dashed ? ' dashed' : ''}${it.shape === 'rect' ? ' rect' : ''}"></i>${esc(it.label)}</li>`).join('')}</ul>`;
}

/* ───────── Горизонтальні смуги вартості ───────── */
// items: [{ key, label, sub, value, cls, badge }]
export function barsHTML(items, { fmt = fmtUAH, action = 'mode-detail' } = {}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return `<div class="bars" role="list">${items.map((it) => {
    const w = Math.max(1.5, (it.value / max) * 100);
    return `<button type="button" class="bar-row" role="listitem" data-act="${action}" data-mode="${esc(it.key)}" aria-label="${esc(`${it.label}: ${fmt(it.value)}`)}">
      <span class="bar-lbl"><b>${esc(it.label)}</b>${it.badge ? `<em class="badge-zero">${esc(it.badge)}</em>` : ''}<small>${esc(it.sub || '')}</small></span>
      <span class="bar-track"><span class="bar-fill ${it.cls}" style="width:${w.toFixed(2)}%"></span></span>
      <span class="bar-val">${esc(fmt(it.value))}</span>
    </button>`;
  }).join('')}</div>`;
}

/* ───────── Сегментована смуга (структура витрат) ───────── */
// parts: [{ label, value, cls }]
export function segmentedHTML(parts, { fmt = (v) => fmtUAH(v, 0), ariaLabel = 'Структура' } = {}) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  if (total <= 0) return '<p class="muted small">Немає витрат для відображення.</p>';
  const segs = parts.filter((p) => p.value > 0).map((p) => {
    const share = p.value / total;
    const pct = Math.round(share * 100);
    return `<span class="seg-part ${p.cls}" style="flex:${share.toFixed(4)} 1 0" tabindex="0" aria-label="${esc(`${p.label}: ${fmt(p.value)}, ${pct}%`)}" title="${esc(`${p.label}: ${fmt(p.value)} (${pct}%)`)}">${share >= 0.16 ? `<span>${pct}%</span>` : ''}</span>`;
  }).join('');
  return `<div class="segbar" role="img" aria-label="${esc(ariaLabel)}">${segs}</div>
  <ul class="legend legend-rows">${parts.map((p) => `<li><i class="key rect ${p.cls}"></i><span>${esc(p.label)}</span><b>${esc(fmt(p.value))}</b><small>${total > 0 ? Math.round((Math.max(0, p.value) / total) * 100) : 0}%</small></li>`).join('')}</ul>`;
}

/* ───────── Матриця «Комфорт / Вартість» ───────── */
// pts: [{ label, cost, comfort, cls, minutes }]
export function scatterChart(container, pts, { height = 230 } = {}) {
  const W = Math.max(280, Math.round(container.clientWidth || 340));
  const H = height;
  const pad = { l: 40, r: 18, t: 22, b: 34 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const xt = niceTicks(0, Math.max(10, ...pts.map((p) => p.cost)), 4);
  const xMax = xt[xt.length - 1];
  const yt = [0, 25, 50, 75, 100];
  const X = (v) => pad.l + (v / xMax) * iw;
  const Y = (v) => pad.t + ih - (v / 100) * ih;
  let svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Матриця комфорт і вартість">`;
  for (const t of yt) svg += `<line class="grid${t === 0 ? ' base' : ''}" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${pad.l - 8}" y="${Y(t) + 4}" text-anchor="end">${t}</text>`;
  for (const t of xt) svg += `<text class="ax" x="${X(t)}" y="${H - 14}" text-anchor="middle">${esc(fmtAxis(t))}</text>`;
  svg += `<text class="ax-title" x="${W - pad.r}" y="${H - 1}" text-anchor="end">Вартість за день, ₴</text>`;
  svg += `<text class="ax-title" x="${pad.l}" y="12" text-anchor="start">Комфорт, бали (краще — ліворуч угорі)</text>`;
  // обʼєднуємо точки, що збігаються
  const groups = [];
  for (const p of pts) {
    const g = groups.find((q) => Math.abs(X(q.cost) - X(p.cost)) < 10 && Math.abs(Y(q.comfort) - Y(p.comfort)) < 10);
    if (g) g.labels.push(p.label); else groups.push({ ...p, labels: [p.label] });
  }
  // Підписи без накладань: пробуємо праворуч, ліворуч, над і під точкою.
  const placed = groups.map((g) => ({ x: X(g.cost) - 7, y: Y(g.comfort) - 7, w: 14, h: 14 }));
  const hits = (r) => placed.some((p) => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y)
    || r.x < pad.l - 6 || r.x + r.w > W || r.y < 14 || r.y + r.h > pad.t + ih + 4;
  for (const g of groups.sort((a, b) => b.comfort - a.comfort)) {
    const cx = X(g.cost), cy = Y(g.comfort);
    const text = g.labels.join(', ');
    const tw = text.length * 6.7 + 4;
    const cands = [
      { x: cx + 11, y: cy + 4, a: 'start', box: { x: cx + 10, y: cy - 9, w: tw, h: 16 } },
      { x: cx - 11, y: cy + 4, a: 'end', box: { x: cx - 10 - tw, y: cy - 9, w: tw, h: 16 } },
      { x: cx, y: cy - 12, a: 'middle', box: { x: cx - tw / 2, y: cy - 25, w: tw, h: 16 } },
      { x: cx, y: cy + 20, a: 'middle', box: { x: cx - tw / 2, y: cy + 8, w: tw, h: 16 } },
    ];
    const c = cands.find((k) => !hits(k.box)) || cands[0];
    placed.push(c.box);
    svg += `<g class="pt" tabindex="0" aria-label="${esc(`${text}: ${fmtUAH(g.cost)}, комфорт ${Math.round(g.comfort)}`)}">
      <circle class="pt-hit" cx="${cx}" cy="${cy}" r="14"/>
      <circle class="dot ${g.cls}" cx="${cx}" cy="${cy}" r="6"/>
      <text class="pt-lbl" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" text-anchor="${c.a}">${esc(text)}</text>
    </g>`;
  }
  svg += '</svg>';
  container.innerHTML = `<div class="chart-box">${svg}</div>`;
}

/* ───────── Теплова карта місяця ───────── */
// days: [{ date, value, trip, type }]; firstDow: 0 = понеділок
export function heatColor(value, max) {
  if (!(value > 0) || !(max > 0)) return '';
  const k = clamp(value / max, 0, 1);
  return `--heat:${(0.14 + 0.78 * k).toFixed(3)}`;
}
export function miniHeatHTML(days, { firstDow, fmt = fmtUAH }) {
  const max = Math.max(0, ...days.map((d) => d.value));
  const blanks = Array.from({ length: firstDow }, () => '<span class="hm-cell blank" aria-hidden="true"></span>').join('');
  const cells = days.map((d) => {
    const lbl = `${Number(d.date.slice(8))}: ${d.trip ? fmt(d.value) : d.type === 'away' ? 'не в Дніпрі' : 'без поїздок'}`;
    return `<span class="hm-cell${d.trip ? ' on' : ''}${d.type === 'away' ? ' away' : ''}" style="${heatColor(d.value, max)}" title="${esc(lbl)}" role="img" aria-label="${esc(lbl)}"></span>`;
  }).join('');
  return `<div class="hm-grid">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((d) => `<span class="hm-dow">${d}</span>`).join('')}${blanks}${cells}</div>
  <div class="hm-scale"><span>менше</span><i></i><span>більше (макс. ${esc(fmt(max))})</span></div>`;
}

/* ───────── Кільце оцінки ───────── */
export function scoreRing(score, { size = 64, stroke = 5, label = 'бал.' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = clamp(score, 0, 100);
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
    <circle class="ring-val" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - v / 100)).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" class="ring-num">${Math.round(v)}</text>
  </svg><span class="sr-only">${Math.round(v)} ${label}</span>`;
}

export function progressHTML(value, goal, cls = 'fill-good') {
  const k = goal > 0 ? clamp(value / goal, 0, 1) : 0;
  return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(k * 100)}"><span class="${cls}" style="width:${(k * 100).toFixed(1)}%"></span></div>`;
}
