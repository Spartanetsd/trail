// MOBILITY ZERO — view-savings.js
// Економія: фактична й прогнозована (окремо), банк комфорту, цілі, графік накопичення, історія.

import * as E from './engine.js';
import { esc, icon, toast, numField, readField, setFieldMsg, setPath, getPath, fmtInput, humanDate, countUp } from './ui.js';
import { lineChart, legendHTML, progressHTML, scoreRing } from './charts.js';
import { openLogTrip, openPassPurchase, signed } from './sheets.js';

let limit = 40;
let pctTimer = 0;

export default {
  mount(app, root) {
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act]');
      if (!t || !root.contains(t)) return;
      const a = t.dataset.act;
      if (a === 'log') openLogTrip(app, { date: app.today(), mode: 'eco' });
      else if (a === 'pass') openPassPurchase(app);
      else if (a === 'more') { limit += 40; this.render(app, root); }
      else if (a === 'del') {
        const id = t.dataset.id;
        const removed = app.hist.find((r) => r.id === id);
        app.update((st) => { st.history = st.history.filter((r) => r.id !== id); });
        toast('Запис видалено', { action: 'Повернути', onAction: () => app.update((st) => { st.history.push(removed); }) });
      }
    });
    root.addEventListener('input', (ev) => {
      const el = ev.target;
      if (el.id !== 'bank-pct') return;
      const v = Number(el.value);
      el.style.setProperty('--p', `${v}%`);
      root.querySelector('#bank-pct-out').textContent = `${v} %`;
      clearTimeout(pctTimer);
      pctTimer = setTimeout(() => {
        app.update((st) => { st.settings.bank.pct = v; }, { render: false });
        root.querySelector('#bank-out').innerHTML = bankRows(app);
      }, 60);
    });
    root.addEventListener('change', (ev) => {
      const el = ev.target;
      if (!el.dataset.bind) return;
      const prev = getPath(app.s, el.dataset.bind);
      const r = readField(el, prev);
      if (!r) return;
      if (r.invalid) { setFieldMsg(el, 'Введіть число'); el.value = fmtInput(prev); return; }
      app.update((st) => setPath(st.settings, el.dataset.bind, r.value));
    });
  },
  render(app, root) {
    root.innerHTML = html(app);
    drawChart(app, root);
    countUp(root);
  },
  onResize(app, root) { drawChart(app, root); },
};

function windowNet(app, from, to) { return E.bankSummary(app.hist, app.s, { from, to }); }

function html(app) {
  const s = app.s;
  const b = app.bank();
  const today = app.today();
  const mR = app.monthRange(), wR = app.weekRange();
  const pm = app.projMonth(), pw = app.projWeek();
  const mNet = windowNet(app, mR.from, mR.to);
  const wNet = windowNet(app, wR.from, wR.to);
  const goalK = s.bank.monthlyGoal > 0 ? Math.max(0, mNet.net) / s.bank.monthlyGoal * 100 : 0;
  const basisTxt = s.bank.baseline === 'carCash' ? 'проти авто (лише готівка)' : 'проти авто (із зносом)';

  return `<h1 class="page-title">Економія</h1>
  <p class="page-sub">Банк комфорту — віртуальний облік, а не банківський рахунок.</p>

  <section class="card" style="margin-top:14px" aria-labelledby="vault-t">
    <div class="vault">
      <div class="ring-wrap">${scoreRing(goalK, { size: 84, stroke: 6, label: '% місячної мети' })}<small>% мети місяця</small></div>
      <div class="vault-figure">
        <small id="vault-t">Чиста економія за весь час</small>
        <b class="${b.net < 0 ? 'bad' : ''}" data-count="${b.net.toFixed(2)}" data-suffix=" ₴">${E.fmtUAH(b.net)}</b>
        <span>Фактично, ${basisTxt}, після резерву на комфорт.</span>
      </div>
    </div>
    <div class="split">
      <div><small>Фактично зекономлено</small><b class="${b.gross >= 0 ? 'good' : 'bad'}">${signed(b.gross)}</b><span>${b.trips} ${E.plural(b.trips, ['запис', 'записи', 'записів'])} поїздок</span></div>
      <div class="proj"><small>Прогноз до кінця місяця</small><b>${signed(pm.gross)}</b><span>ще не зекономлено, ${pm.days} ${E.plural(pm.days, ['день', 'дні', 'днів'])}</span></div>
    </div>
  </section>

  <section class="card" aria-labelledby="bank-t">
    <h2 class="card-title" id="bank-t">Банк комфорту</h2>
    <p class="card-sub">Частина фактичної економії відкладається на таксі у важкі дні.</p>
    <div class="range-row" style="margin-top:8px">
      <div class="row"><label for="bank-pct">Бюджет комфорту</label><b id="bank-pct-out">${s.bank.pct} %</b></div>
      <input id="bank-pct" type="range" min="0" max="100" step="5" value="${s.bank.pct}" style="--p:${s.bank.pct}%">
    </div>
    <div id="bank-out">${bankRows(app)}</div>
  </section>

  <section class="card" aria-labelledby="goals-t">
    <h2 class="card-title" id="goals-t">Цілі</h2>
    <div class="goal"><div class="row"><span>Цей тиждень</span><b>${E.fmtUAH(wNet.net)} з ${E.fmtUAH(s.bank.weeklyGoal)}</b></div>${progressHTML(wNet.net, s.bank.weeklyGoal)}<p class="hint">Прогноз до кінця тижня: ще ${signed(pw.gross * (1 - s.bank.pct / 100))} чистої економії.</p></div>
    <div class="goal"><div class="row"><span>Цей місяць</span><b>${E.fmtUAH(mNet.net)} з ${E.fmtUAH(s.bank.monthlyGoal)}</b></div>${progressHTML(mNet.net, s.bank.monthlyGoal)}<p class="hint">Прогноз до кінця місяця: ще ${signed(pm.gross * (1 - s.bank.pct / 100))} чистої економії.</p></div>
    <div class="grid-2" style="margin-top:12px">
      ${numField({ bind: 'bank.weeklyGoal', label: 'Мета на тиждень', value: s.bank.weeklyGoal, unit: '₴', max: 1e7, id: 'g-week' })}
      ${numField({ bind: 'bank.monthlyGoal', label: 'Мета на місяць', value: s.bank.monthlyGoal, unit: '₴', max: 1e7, id: 'g-month' })}
    </div>
  </section>

  <section class="card" aria-labelledby="line-t">
    <h2 class="card-title" id="line-t">Накопичена економія за місяць</h2>
    <p class="card-sub">Суцільна лінія — факт із записаних поїздок, пунктир — прогноз за календарем.</p>
    <div id="sav-legend" style="margin-top:10px"></div>
    <div id="sav-chart"></div>
    <details class="more"><summary>Показати таблицею</summary><div id="sav-table"></div></details>
  </section>

  <h2 class="section-title">Історія поїздок<small>Фактичні записи. Прогноз сюди не потрапляє.</small></h2>
  <div class="row wrap" style="margin-bottom:12px">
    <button type="button" class="btn primary" data-act="log">${icon('plus')}Записати поїздку</button>
    <button type="button" class="btn" data-act="pass">${icon('plus')}Купівля проїзного</button>
  </div>
  <section class="card">${historyHTML(app, today)}</section>
  <p class="note-box">Економія рахується ${basisTxt}: скільки коштувала б та сама поїздка власним авто за налаштуваннями на момент запису. Поїздки, оплачені з банку комфорту, в економію не входять — їхня вартість списується з бюджету комфорту. Купівля проїзного зменшує економію один раз, у день купівлі.</p>`;
}

function bankRows(app) {
  const s = app.s;
  const b = E.bankSummary(app.hist, s);
  const pm = app.projMonth();
  const projAdd = Math.max(0, pm.gross) * s.bank.pct / 100;
  return `<div class="kv"><span>Відкладено (${s.bank.pct} % від економії)</span><b>${E.fmtUAH(b.reserved)}</b></div>
    <div class="kv"><span>Витрачено з банку</span><b>${E.fmtUAH(b.spent)}</b></div>
    <div class="kv total"><span>Доступно на таксі</span><b class="${b.overspent ? 'bad' : 'good'}">${E.fmtUAH(b.balance)}</b></div>
    <div class="kv"><span>Це поїздок таксі в один бік</span><b>${b.taxiTrips} × ${E.fmtUAH(b.taxiPrice)}</b></div>
    <div class="kv"><span>Чиста економія</span><b>${E.fmtUAH(b.net)}</b></div>
    ${b.overspent ? `<div class="callout warn" style="margin-top:10px">${icon('warn')}<span>Перевитрата ${E.fmtUAH(-b.balance)}: на комфорт витрачено більше, ніж відкладено.</span></div>` : ''}
    <p class="hint">За прогнозом до кінця місяця бюджет комфорту поповниться ще на ${E.fmtUAH(projAdd)} — ці гроші ще не зекономлені.</p>`;
}

function drawChart(app, root) {
  const s = app.s;
  const { from, to } = app.monthRange();
  const today = app.today();
  const dates = E.dateRange(from, to);
  const act = E.actualSeries(app.hist, s, from, to);
  const proj = app.projMonth().series;
  const projBy = new Map(proj.map((p) => [p.date, p.value]));
  const ti = dates.indexOf(today);
  const actual = [], projected = [];
  let cum = 0;
  dates.forEach((d, i) => {
    cum += act[i].value;
    actual.push(i <= ti ? cum : NaN);
  });
  let pc = ti > 0 ? actual[ti - 1] : 0;
  dates.forEach((d, i) => {
    if (i < ti - 1) { projected.push(NaN); return; }
    if (i === ti - 1) { projected.push(actual[i]); return; }
    pc += (act[i].value || 0) + (projBy.get(d) || 0);
    projected.push(pc);
  });
  const series = [
    { key: 'actual', label: 'Фактично', cls: 's-actual', values: actual },
    { key: 'proj', label: 'Прогноз', cls: 's-proj', dashed: true, values: projected },
  ];
  const empty = actual.every((v) => !Number.isFinite(v) || Math.abs(v) < 0.005) && projected.every((v) => !Number.isFinite(v) || Math.abs(v) < 0.005);
  if (empty) {
    root.querySelector('#sav-legend').innerHTML = '';
    root.querySelector('#sav-chart').innerHTML = '<div class="empty"><b>Поки що нічого показати</b>Запишіть першу поїздку або заплануйте дні поїздок у календарі — тут зʼявиться крива економії.</div>';
  } else {
    root.querySelector('#sav-legend').innerHTML = legendHTML(series.map((x) => ({ label: x.label, cls: x.cls, dashed: x.dashed })));
    lineChart(root.querySelector('#sav-chart'), series, {
      xs: dates.map((_, i) => i),
      xLabel: (i, full) => (full ? humanDate(dates[i], true) : humanDate(dates[i])),
      height: 200, minSpan: 100, aria: 'Накопичена економія за місяць',
    });
  }
  root.querySelector('#sav-table').innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>День</th><th>Факт</th><th>Прогноз</th></tr></thead><tbody>${dates.map((d, i) => `<tr><th scope="row">${humanDate(d)}</th><td>${Number.isFinite(actual[i]) ? E.fmtUAH(actual[i]) : '—'}</td><td>${Number.isFinite(projected[i]) && i >= ti ? E.fmtUAH(projected[i]) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}

function historyHTML(app, today) {
  const s = app.s;
  const list = [...app.hist].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (!list.length) return `<div class="empty"><b>Ще немає записів</b>Записуйте фактичні поїздки — так ви побачите реальну, а не прогнозовану економію.</div>`;
  let h = '';
  let lastDate = '';
  for (const r of list.slice(0, limit)) {
    if (r.date !== lastDate) { h += `<p class="hist-day">${esc(humanDate(r.date, true))}${r.date === today ? ', сьогодні' : ''}</p>`; lastDate = r.date; }
    if (r.kind === 'pass') {
      h += `<div class="hist-item"><span class="mode-badge s-zero">ПРОЇЗНИЙ</span><div class="hist-main"><b>${r.type === 'weekly' ? 'Тижневий' : 'Місячний'} × ${r.persons}</b><small>${humanDate(r.start)} – ${humanDate(r.end)}</small></div><div class="hist-amt">${E.fmtUAH(r.price, 2)}<small class="bad">−${E.fmtUAH(r.price)}</small></div><button type="button" class="icon-btn" data-act="del" data-id="${esc(r.id)}" aria-label="Видалити запис">${icon('trash')}</button></div>`;
    } else {
      const sv = E.recordSavings(r, s.bank.baseline);
      h += `<div class="hist-item"><span class="mode-badge s-${r.mode === 'other' ? 'zero' : r.mode}">${esc(E.MODE_INFO[r.mode]?.code || 'ІНШЕ')}</span><div class="hist-main"><b>${esc(r.label || 'Поїздка')}</b><small>${r.fromBank ? 'з банку комфорту' : esc(r.note || (r.minutes ? E.fmtMin(r.minutes) : ''))}</small></div><div class="hist-amt">${E.fmtUAH(r.cost, 2)}<small class="${r.fromBank ? '' : sv >= 0 ? 'good' : 'bad'}">${r.fromBank ? 'банк' : signed(sv)}</small></div><button type="button" class="icon-btn" data-act="del" data-id="${esc(r.id)}" aria-label="Видалити запис">${icon('trash')}</button></div>`;
    }
  }
  if (list.length > limit) h += `<button type="button" class="btn block" data-act="more" style="margin-top:10px">Показати ще</button>`;
  return h;
}
