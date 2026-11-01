// MOBILITY TRAIL — view-savings.js
// Економія: фактична й прогнозована (окремо), банк комфорту, цілі, графік накопичення, історія.

import * as E from './engine.js';
import { esc, icon, toast, numField, textField, readField, setFieldMsg, setPath, getPath, fmtInput, humanDate, countUp } from './ui.js';
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
      else if (a === 'leak-go') {
        if (t.dataset.do === 'pass') openPassPurchase(app, { type: t.dataset.type === 'monthly' ? 'monthly' : 'weekly' });
        else if (t.dataset.do === 'eco-route') {
          const id = t.dataset.id;
          const r = app.s.transit.routes.find((x) => x.id === id);
          if (!r) return;
          const prev = { eco: app.s.transit.ecoRoute, mode: app.s.trip.defaultMode };
          app.update((st) => { st.settings.transit.ecoRoute = id; if (st.settings.trip.defaultMode === 'best') st.settings.trip.defaultMode = 'eco'; });
          toast(`ECO — «${r.name}»${prev.mode === 'best' ? '; робочі дні в календарі — ECO' : ''}`, { action: 'Повернути', onAction: () => app.update((st) => { st.settings.transit.ecoRoute = prev.eco; st.settings.trip.defaultMode = prev.mode; }) });
        }
        else if (t.dataset.tab === 'savings') root.querySelector('#bank-t')?.scrollIntoView({ block: 'center' });
        else app.go(t.dataset.tab, { anchor: t.dataset.anchor || null });
      }
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
      if (r.corrected) setFieldMsg(el, `Виправлено до ${fmtInput(r.value)}`);
      const keepOpen = el.closest('details')?.open;
      app.update((st) => setPath(st.settings, el.dataset.bind, r.value));
      if (keepOpen) { const d = root.querySelector('#goals-edit'); if (d) d.open = true; }
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

  ${leaksHTML(app)}

  <section class="card" aria-labelledby="bank-t">
    <h2 class="card-title" id="bank-t">Банк комфорту</h2>
    <p class="card-sub">Частина фактичної економії відкладається на таксі у важкі дні.</p>
    <div class="range-row" style="margin-top:8px">
      <div class="row"><label for="bank-pct">Бюджет комфорту</label><b id="bank-pct-out">${s.bank.pct} %</b></div>
      <input id="bank-pct" type="range" min="0" max="100" step="5" value="${s.bank.pct}" style="--p:${s.bank.pct}%">
    </div>
    <div id="bank-out">${bankRows(app)}</div>
  </section>

  ${budgetHTML(app)}

  <section class="card" aria-labelledby="goals-t">
    <h2 class="card-title" id="goals-t">Цілі</h2>
    <div class="goal"><div class="row"><span>Цей тиждень</span><b>${E.fmtUAH(wNet.net)} з ${E.fmtUAH(s.bank.weeklyGoal)}</b></div>${progressHTML(wNet.net, s.bank.weeklyGoal)}<p class="hint">Прогноз до кінця тижня: ще ${signed(pw.gross * (1 - s.bank.pct / 100))} чистої економії.</p></div>
    <div class="goal"><div class="row"><span>Цей місяць</span><b>${E.fmtUAH(mNet.net)} з ${E.fmtUAH(s.bank.monthlyGoal)}</b></div>${progressHTML(mNet.net, s.bank.monthlyGoal)}<p class="hint">Прогноз до кінця місяця: ще ${signed(pm.gross * (1 - s.bank.pct / 100))} чистої економії.</p></div>
    ${wealthHTML(app)}
    <details class="more" id="goals-edit"><summary>Змінити цілі</summary>
      <div class="grid-2" style="margin-top:8px">
        ${numField({ bind: 'bank.weeklyGoal', label: 'Мета на тиждень', value: s.bank.weeklyGoal, unit: '₴', max: 1e7, id: 'g-week' })}
        ${numField({ bind: 'bank.monthlyGoal', label: 'Мета на місяць', value: s.bank.monthlyGoal, unit: '₴', max: 1e7, id: 'g-month' })}
        ${textField({ bind: 'bank.goalName', label: 'Велика мета', value: s.bank.goalName, max: 60, placeholder: 'Напр., подушка безпеки', id: 'g-name' })}
        ${numField({ bind: 'bank.goalAmount', label: 'Сума мети', value: s.bank.goalAmount, unit: '₴', max: 1e9, id: 'g-amount' })}
        ${numField({ bind: 'bank.rate', label: 'Ставка депозиту', value: s.bank.rate, unit: '% річних', max: 100, id: 'g-rate' })}
      </div>
      <p class="hint">Ставку вкажіть свою — застосунок її не знає. 0 — рахувати без відсотків.</p>
    </details>
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
      h += `<div class="hist-item"><span class="mode-badge s-best">ПРОЇЗНИЙ</span><div class="hist-main"><b>${r.type === 'weekly' ? 'Тижневий' : 'Місячний'} × ${r.persons}</b><small>${humanDate(r.start)} – ${humanDate(r.end)}</small></div><div class="hist-amt">${E.fmtUAH(r.price, 2)}<small class="bad">−${E.fmtUAH(r.price)}</small></div><button type="button" class="icon-btn" data-act="del" data-id="${esc(r.id)}" aria-label="Видалити запис">${icon('trash')}</button></div>`;
    } else {
      const sv = E.recordSavings(r, s.bank.baseline);
      h += `<div class="hist-item"><span class="mode-badge s-${r.mode === 'other' ? 'best' : r.mode}">${esc(E.MODE_INFO[r.mode]?.code || 'ІНШЕ')}</span><div class="hist-main"><b>${esc(r.label || 'Поїздка')}</b><small>${r.fromBank ? 'з банку комфорту' : esc(r.note || (r.minutes ? E.fmtMin(r.minutes) : ''))}</small></div><div class="hist-amt">${E.fmtUAH(r.cost, 2)}<small class="${r.fromBank ? '' : sv >= 0 ? 'good' : 'bad'}">${r.fromBank ? 'банк' : signed(sv)}</small></div><button type="button" class="icon-btn" data-act="del" data-id="${esc(r.id)}" aria-label="Видалити запис">${icon('trash')}</button></div>`;
    }
  }
  if (list.length > limit) h += `<button type="button" class="btn block" data-act="more" style="margin-top:10px">Показати ще</button>`;
  return h;
}

// «Куди тікають гроші»: що на 30 днів уперед дасть найбільше.
function leaksHTML(app) {
  const leaks = app.leaks();
  const body = leaks.length
    ? `<ul class="leaks">${leaks.slice(0, 5).map((l) => `<li class="leak">
        <div class="leak-head"><b>−${E.fmtUAH(l.monthly)}</b><small>за 30 днів, ≈ ${E.fmtUAH(l.yearly)} за рік</small></div>
        <p>${esc(l.text)}</p>
        ${l.action ? `<button type="button" class="btn small" data-act="leak-go" data-tab="${esc(l.action.tab || '')}" data-anchor="${esc(l.action.anchor || '')}" data-do="${esc(l.action.act || '')}" data-id="${esc(l.action.id || '')}" data-type="${esc(l.action.type || '')}">${esc(l.action.label)}</button>` : ''}
      </li>`).join('')}</ul>`
    : '<p class="small muted" style="margin-top:8px">Витоків не знайдено: за ваших налаштувань план на 30 днів уже найекономніший.</p>';
  return `<section class="card" aria-labelledby="leaks-t">
    <h2 class="card-title" id="leaks-t">Куди тікають гроші</h2>
    <p class="card-sub">Наступні 30 днів за календарем. Суми — прогноз, а не зекономлені гроші, і частково перетинаються.</p>
    ${body}
  </section>`;
}

// Бюджет на транспорт: фактично витрачене + план на решту місяця.
function budgetHTML(app) {
  const s = app.s;
  const b = app.budget();
  const field = numField({ bind: 'bank.monthlyBudget', label: 'Бюджет на місяць', value: s.bank.monthlyBudget, unit: '₴', max: 1e7, id: 'g-budget' });
  if (!(b.budget > 0)) {
    return `<section class="card" aria-labelledby="budget-t"><h2 class="card-title" id="budget-t">Бюджет на транспорт</h2>
      <p class="card-sub">Задайте ліміт — застосунок попередить, якщо план його перевищить.</p><div style="margin-top:10px">${field}</div></section>`;
  }
  return `<section class="card" aria-labelledby="budget-t">
    <h2 class="card-title" id="budget-t">Бюджет на транспорт</h2>
    <div class="goal"><div class="row"><span>Витрачено цього місяця</span><b>${E.fmtUAH(b.spent)} з ${E.fmtUAH(b.budget)}</b></div>${progressHTML(b.spent, b.budget, b.spent > b.budget ? 'fill-warn' : 'fill-blue')}</div>
    <div style="margin-top:10px">
      <div class="kv"><span>За планом до кінця місяця</span><b>${E.fmtUAH(b.planned)}</b></div>
      <div class="kv total"><span>Прогноз місяця</span><b class="${b.over ? 'bad' : 'good'}">${E.fmtUAH(b.forecast)}</b></div>
      <div class="kv"><span>Лишається в бюджеті</span><b class="${b.left < 0 ? 'bad' : ''}">${E.fmtUAH(b.left)}</b></div>
      ${b.perDay != null ? `<div class="kv"><span>На день поїздки (${b.daysLeft})</span><b>${E.fmtUAH(b.perDay)}</b></div>` : ''}
    </div>
    ${b.over ? `<div class="callout warn" style="margin-top:10px">${icon('warn')}<span>План перевищує бюджет на ${E.fmtUAH(b.overBy)}. Подивіться «Куди тікають гроші» вище.</span></div>` : ''}
    <details class="more"><summary>Змінити бюджет</summary><div style="margin-top:8px">${field}</div></details>
  </section>`;
}

// Велика мета й річний ефект: «спершу заплати собі» та складний відсоток.
function wealthHTML(app) {
  const s = app.s;
  const w = app.wealth();
  let goal = '';
  if (w.goal > 0) {
    const name = s.bank.goalName || 'Велика мета';
    let eta;
    if (w.months === 0) eta = 'Мету досягнуто — можна ставити наступну.';
    else if (w.tooFar) eta = 'За поточного темпу мета далі ніж за 50 років: збільште економію або розбийте мету на менші.';
    else if (w.months == null) eta = 'За поточним планом економії немає, тож мета не наближається.';
    else eta = `За поточним планом ≈ ${w.months} ${E.plural(w.months, ['місяць', 'місяці', 'місяців'])}, орієнтовно ${E.fmtMonthYear(w.eta)}.`;
    goal = `<div class="goal"><div class="row"><span>${esc(name)}</span><b>${E.fmtUAH(w.have)} з ${E.fmtUAH(w.goal)}</b></div>${progressHTML(w.have, w.goal)}<p class="hint">${esc(eta)}</p></div>`;
  }
  const rateTxt = w.rate > 0 ? `, ${E.fmtNum(w.rate, 1)} % річних` : '';
  return `${goal}
    <div style="margin-top:14px">
      <div class="kv"><span>Чиста економія на місяць</span><b class="${w.monthlyNet >= 0 ? 'good' : 'bad'}">${signed(w.monthlyNet)}</b></div>
      <div class="kv"><span>Відкладати рік${esc(rateTxt)}</span><b>${E.fmtUAH(w.year)}</b></div>
      <div class="kv"><span>5 років</span><b>${E.fmtUAH(w.five)}</b></div>
      <div class="kv"><span>10 років</span><b>${E.fmtUAH(w.ten)}</b></div>
    </div>
    <p class="hint">Прогноз за наступні 30 днів календаря, після резерву на комфорт. Це ще не зекономлені гроші.</p>`;
}
