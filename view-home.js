// MOBILITY ZERO — view-home.js
// Головна: «проїзний квиток дня» з рекомендацією, ранковий вибір, ключові цифри й порадник.

import * as E from './engine.js';
import { esc, icon, countUp, humanDate, isIOS, isStandalone, deviceFlag } from './ui.js';
import { scoreRing } from './charts.js';
import { badge, modeOf, legStrip, boardLines, backLine, openMorning, openAlternatives, openRoute, openLogTrip, signed } from './sheets.js';
import { TONE_ICON } from './assistant.js';

let issued = false;
let swapAnim = null;

const FOR_WHOM = { 1: 'для вас', 2: 'для двох', 3: 'для трьох', 4: 'для чотирьох' };
const forWhom = (p) => FOR_WHOM[p] || `на ${p} осіб`;

export default {
  mount(app, root) {
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act]');
      if (!t || !root.contains(t)) return;
      const act = t.dataset.act;
      if (act === 'swap') {
        swapAnim = app.s.route.swapped;
        app.update((st) => { st.settings.route.swapped = !st.settings.route.swapped; });
      } else if (act === 'theme') {
        app.setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
      } else if (act === 'morning') openMorning(app);
      else if (act === 'alts') openAlternatives(app);
      else if (act === 'route' || act === 'nav') openRoute(app);
      else if (act === 'log') { const r = app.rec(); openLogTrip(app, { date: app.today(), mode: modeOf(r, r.best) === 'zero' ? 'eco' : modeOf(r, r.best) }); }
      else if (act === 'go') app.go(t.dataset.tab, { anchor: t.dataset.anchor || null });
      else if (act === 'a2hs-hide') { deviceFlag('a2hs-hidden', true); t.closest('.a2hs')?.remove(); }
    });
  },

  render(app, root) {
    root.innerHTML = html(app);
    if (swapAnim !== null) {
      const b = root.querySelector('.swap-btn');
      if (b) { b.classList.toggle('spin', swapAnim); void b.offsetWidth; b.classList.toggle('spin', !swapAnim); }
      swapAnim = null;
    }
    if (!issued) { countUp(root); issued = true; }
  },
};

function html(app) {
  const s = app.s;
  const rec = app.rec();
  const best = rec.best;
  const { from, to } = E.routeEnds(s);
  const today = app.today();
  const type = app.todayType();
  const off = type === 'off' || type === 'away';
  const theme = document.documentElement.dataset.theme;
  const loggedToday = app.hist.some((r) => r.kind === 'trip' && r.date === today);

  let h = `<header class="topline">
    <div><div class="wordmark">MOBILITY ZERO</div><p class="tagline">Твоя свобода пересування</p></div>
    <button type="button" class="icon-btn" data-act="theme" aria-label="${theme === 'light' ? 'Увімкнути темну тему' : 'Увімкнути світлу тему'}">${icon(theme === 'light' ? 'moon' : 'sun')}</button>
  </header>
  <div class="route-pill">
    <div class="route-end"><small>Звідки</small><b title="${esc(from.address)}">${esc(from.label)}</b></div>
    <button type="button" class="icon-btn swap-btn${s.route.swapped ? ' spin' : ''}" data-act="swap" aria-label="Поміняти точки місцями">${icon('swap')}</button>
    <div class="route-end to"><small>Куди</small><b title="${esc(to.address)}">${esc(to.label)}</b></div>
  </div>`;

  if (!navigator.onLine) h += `<div class="callout" style="margin-bottom:12px">${icon('info')}<span>Ви офлайн. Усі розрахунки працюють, недоступні лише зовнішні карти.</span></div>`;
  if (off) h += `<div class="callout" style="margin-bottom:12px">${icon('calendar')}<span>Сьогодні за календарем: <b>${esc(E.MODE_INFO[type].name)}</b>. Якщо все ж їдете — ось найкращий варіант.</span></div>`;

  if (!best) {
    h += `<div class="card empty"><b>Немає жодного доступного варіанта</b>Увімкніть маршрут громадського транспорту або перевірте ціни в налаштуваннях.<div style="margin-top:12px"><button type="button" class="btn primary" data-act="go" data-tab="settings">Відкрити налаштування</button></div></div>`;
    return h;
  }

  const mode = modeOf(rec, best);
  const ex = rec.explanation;
  const dep = E.departureFor(s, best);
  const rt = rec.ctx.state.roundTrip !== false;
  const car = rec.modes.auto, eco = rec.modes.eco;
  let third = '';
  if (best.isCar && eco) {
    third = `<div class="metric"><small>Дорожче за ECO на</small><b>${E.fmtUAH(best.cost.decision - eco.cost.decision)}</b></div>`;
  } else if (car) {
    const sv = car.cost.decision - best.cost.decision;
    third = `<div class="metric"><small>Економія проти авто</small><b class="${sv >= 0 ? 'good' : 'bad'}">${signed(sv)}</b></div>`;
  }
  const why = `${ex.reasons[0]?.text || ''}${ex.tradeoff ? `. ${ex.tradeoff}` : ''}.`;

  h += `<article class="pass${issued ? '' : ' issue'}" aria-labelledby="pass-title">
    <div class="pass-main">
      <div class="pass-top">
        <div>
          <p class="pass-kicker">${off ? 'Якщо поїдете сьогодні' : 'Оптимальний транспорт сьогодні'}</p>
          <div class="pass-badges">${badge(mode)}${best.unconfirmed ? '<span class="tag-approx">орієнтовно</span>' : ''}${rec.ctx.eligible ? '<span class="tag-approx" style="color:var(--emerald);border-color:var(--emerald)">пільга</span>' : ''}</div>
        </div>
        <div class="ring-wrap">${scoreRing(best.total)}<small>оцінка зі 100</small></div>
      </div>
      <h1 class="pass-title${best.title.length > 16 ? ' long' : ''}" id="pass-title">${esc(best.title)}</h1>
      ${legStrip(best.there, s)}
      ${boardLines(best.there, s, rec.ctx.state)}
      ${backLine(best)}
      <div class="pass-metrics">
        <div class="metric"><small>Орієнтовний час</small><b>${E.fmtMin(best.oneWay)}</b></div>
        <div class="metric"><small>Вартість ${forWhom(s.trip.passengers)}</small><b data-count="${best.cost.decision.toFixed(2)}" data-suffix=" ₴">${E.fmtUAH(best.cost.decision)}</b></div>
        ${third}
      </div>
      <p class="pass-why">${icon('spark')}<span>${esc(why)}</span></p>
    </div>
    <div class="pass-stub">
      ${dep ? `<div class="depart"><b>Вихід о ${dep.time}</b><span>прибуття до ${dep.arrive}, запас ${dep.buffer} хв</span></div>` : ''}
      <div class="pass-actions">
        <button type="button" class="btn" data-act="alts">Інші варіанти</button>
        <button type="button" class="btn primary" data-act="route">${icon('route')}Маршрут</button>
      </div>
    </div>
  </article>
  <button type="button" class="cta-morning" data-act="morning">${icon('sun')}Як краще їхати сьогодні?</button>`;

  const week = app.week();
  const month = app.month();
  const bank = app.bank();
  const fit = (t) => (t.length > 7 ? ' long' : '');
  const wk = E.fmtUAH(week.totals.decision), mo = signed(month.plan.vsCar), bk = E.fmtUAH(bank.balance);
  h += `<div class="tiles">
    <button type="button" class="tile" data-act="go" data-tab="calendar"><small>Цей тиждень</small><b class="${fit(wk)}">${wk}</b><span>${week.tripDays} ${E.plural(week.tripDays, ['день', 'дні', 'днів'])} поїздок</span></button>
    <button type="button" class="tile" data-act="go" data-tab="compare"><small>Економія місяця</small><b class="${month.plan.vsCar >= 0 ? 'good' : 'bad'}${fit(mo)}">${mo}</b><span>за планом</span></button>
    <button type="button" class="tile" data-act="go" data-tab="savings"><small>Банк комфорту</small><b class="${bank.balance < 0 ? 'bad' : ''}${fit(bk)}">${bk}</b><span>${bank.taxiTrips > 0 ? `≈ ${bank.taxiTrips} таксі` : 'на таксі'}</span></button>
  </div>`;

  const tips = app.insights().filter((t) => t.id !== 'depart').slice(0, 3);
  if (tips.length) {
    h += `<section class="card" aria-labelledby="tips-title">
      <div class="card-head"><h2 class="card-title" id="tips-title">Порадник ZERO</h2><button type="button" class="link-btn" data-act="go" data-tab="compare" data-anchor="cmp-tips">Усі поради</button></div>
      <ul class="insights">${tips.map((t) => `<li class="insight" data-tone="${t.tone}">${icon(TONE_ICON[t.tone])}<span>${esc(t.text)}</span></li>`).join('')}</ul>
    </section>`;
  }

  // Safari на iPhone: одноразова підказка встановити на початковий екран (дані не зітруться, працює як застосунок).
  if (isIOS() && !isStandalone() && !deviceFlag('a2hs-hidden')) {
    h += `<div class="callout a2hs" style="margin-bottom:12px">${icon('plus')}<span><b>Додайте ZERO на початковий екран</b> — на весь екран, офлайн, і дані не зітруться. «Поділитися» → «На початковий екран» (рос. «На экран „Домой“»). <button type="button" class="link-btn" data-act="a2hs-hide">Сховати</button></span></div>`;
  }
  h += `<section class="card"><div class="today-strip">
    <div><small class="dim">${esc(humanDate(today, true))}</small><br><b>За планом: ${esc(E.MODE_INFO[type].name)}</b>${loggedToday ? '<br><small class="good">Поїздку вже записано</small>' : ''}</div>
    <button type="button" class="btn small" data-act="log">${icon('plus')}Записати поїздку</button>
  </div></section>
  <p class="note-box">Ціни, час і тарифи — ваші орієнтовні значення з налаштувань, а не живі дані. Оцінка порівнює варіанти між собою і не є ймовірністю.</p>`;
  return h;
}
