// MOBILITY ZERO — assistant.js
// Локальний порадник на правилах. Кожна порада — результат обчислень із поточних налаштувань.

import { fmtGrn, fmtMin, fmtNum, plural, optName, SEGMENT_MODES, addDays, weekStart, resolveDayType, PLAN_MODES, carCosts, makeCtx, vehicles, departureFor, isCoverable, stopAdvice, adviceText, joinOr, taxiTariffTip } from './engine.js';
import { humanDate } from './ui.js';

const TONE_ORDER = { warn: 0, money: 1, good: 2, info: 3 };

export function buildInsights({ s, rec, month, passPlan, bankNow, weekProjected, today, cal, leaks = [], budget = null }) {
  const out = [];
  const add = (id, tone, text, priority = 5) => out.push({ id, tone, text, priority });
  const best = rec?.best;
  const m = rec?.modes || {};
  const st = rec?.ctx?.state || {};

  if (st.tired) add('tired', 'warn', 'Під час сильної втоми краще обрати транспорт без самостійного керування.', 0);

  if (best?.unconfirmed) {
    const r = best.legs.find((l) => l.kind === 'route' && !l.confirmed);
    add('unconfirmed', 'warn', `Маршрут «${r?.label || best.title}» ще не перевірено. Звірте зупинки й інтервали в D-transport і позначте його як перевірений.`, 1);
  }

  if (best && m.auto) {
    const diff = m.auto.cost.decision - best.cost.decision;
    if (best.key !== m.auto.key && diff >= 1) add('car-diff', 'money', `Сьогодні поїздка автомобілем обійдеться дорожче на ${fmtGrn(diff)}, ніж ${optName(best, m)}.`, 2);
    else if (best.key === m.auto.key && m.eco) add('car-best', 'money', `Сьогодні авто — найкращий баланс за вашими пріоритетами, хоча ECO дешевше на ${fmtGrn(m.auto.cost.decision - m.eco.cost.decision)}.`, 2);
  }

  // Найбільший «витік» грошей (проїзні й пальне мають власні поради нижче)
  const leak = leaks.find((l) => !['pass', 'fuel'].includes(l.id));
  if (leak) add(`leak-${leak.id}`, 'money', leak.text, 1.5);

  // Бюджет на транспорт
  if (budget && budget.budget > 0) {
    if (budget.over) add('budget-over', 'warn', `За планом транспорт цього місяця коштуватиме ${fmtGrn(budget.forecast)} — на ${fmtGrn(budget.overBy)} більше за бюджет ${fmtGrn(budget.budget)}.`, 1);
    else if (budget.perDay != null) add('budget-ok', 'good', `У бюджеті на транспорт лишається ${fmtGrn(budget.left)}: ≈ ${fmtGrn(budget.perDay)} на кожен запланований день поїздки.`, 6);
  }

  if (best) {
    const dep = departureFor(s, best);
    if (dep) add('depart', 'info', `Щоб прибути до ${dep.arrive}, виходьте о ${dep.time}: ${fmtMin(dep.minutes)} у дорозі й ${dep.buffer} хв запасу.`, 4);
  }

  // Таксі сьогодні: інший тариф, якщо поспішаєте чи з багажем
  if (best && best.legs.some((l) => l.kind === 'taxi')) {
    const tt = taxiTariffTip(s, st);
    if (tt) add('taxi-tariff', 'info', `${st.hurry ? 'Поспішаєте' : 'З багажем'}: тариф ${tt.tariff.name} дорожчий лише на ${fmtGrn(tt.extra)} за поїздку — ${tt.why}.`, 2.6);
  }

  // На зупинці: не чекати один номер, і що робити, якщо першим прийде інший.
  const leg = best?.there?.kind === 'route' ? best.there : null;
  if (leg) {
    const multi = leg.steps.find((x) => x.kind === 'ride' && x.n > 1);
    if (multi) add('first-come', 'good', `Не чекайте один номер: ${multi.from ? `на «${multi.from}» ` : ''}сідайте в перший — ${joinOr(multi.lines)}. Очікування ≈${fmtMin(multi.wait)} замість ≈${fmtMin(multi.wait1)}.`, 2.5);
    const adv = stopAdvice(s, best.spec.there.id, rec.ctx);
    let tip = null;
    for (const a of adv) for (const x of a.alts) if (!tip && ['take', 'hurry'].includes(x.verdict)) tip = { a, x };
    if (tip) {
      const t = adviceText(tip.x, s.trip.passengers);
      add('stop-alt', 'info', `На «${tip.a.stop}», якщо першим прийде ${joinOr(tip.x.lines)}, — ${t}.`, 3.5);
    }
  }

  // Проїзні за цього графіка — лише на майбутні дні
  const plan = passPlan;
  if (plan && plan.tripDays > 0 && plan.coverableTotal > 0) {
    const { singles, optimal } = plan.strategies;
    const when = plan.label || 'За цього графіка';
    if (optimal < singles - 0.5) {
      const w = plan.purchases.filter((p) => p.type === 'weekly').length;
      const mo = plan.purchases.filter((p) => p.type === 'monthly').length;
      const what = [mo ? (mo === 1 ? 'місячний проїзний' : `${mo} місячних проїзних`) : '', w ? `${w} ${plural(w, ['тижневий проїзний', 'тижневі проїзні', 'тижневих проїзних'])}` : ''].filter(Boolean).join(' і ');
      const first = plan.purchases[0];
      add('pass-buy', 'money', `${when} за цього графіка ${what} вигідніше за разові квитки: ${fmtGrn(optimal)} проти ${fmtGrn(singles)}. Перша купівля — ${humanDate(first.start)}.`, 2);
    } else {
      add('pass-skip', 'money', `${when} за цього графіка разові квитки не дорожчі за проїзні: ${fmtGrn(singles)} на всіх.`, 3);
    }
  }
  if (m.eco) {
    const covers = s.transit.passes.covers;
    const perDay = m.eco.legs.reduce((a, l) => a + l.fares.filter((f) => isCoverable(f, covers)).reduce((x, f) => x + f.fare, 0), 0);
    if (perDay > 0 && s.transit.passes.weeklyPrice > 0) {
      const ratio = s.transit.passes.weeklyPrice / perDay;
      const nDays = Number.isInteger(Math.round(ratio * 1e6) / 1e6) ? Math.round(ratio) + 1 : Math.ceil(ratio);
      if (nDays <= 7) add('pass-week', 'info', `Тижневий проїзний окупається з ${nDays}-го дня поїздок на тиждень${nDays === 6 ? ': за п’ять робочих днів він коштує стільки ж, як разові квитки' : ''}.`, 5);
    }
    const uncovered = [...new Set(m.eco.legs.flatMap((l) => l.fares.filter((f) => !isCoverable(f, covers)).map((f) => (f.special ? `${SEGMENT_MODES[f.mode].label.toLowerCase()} за окремим тарифом` : SEGMENT_MODES[f.mode].label.toLowerCase()))))];
    if (uncovered.length && covers.length) add('pass-cover', 'info', `Проїзний не покриває: ${uncovered.join(', ')} — ці посадки оплачуються разовими квитками.`, 6);
  }

  // Банк комфорту
  if (bankNow) {
    if (bankNow.overspent) add('bank-over', 'warn', `Бюджет комфорту перевитрачено на ${fmtGrn(-bankNow.balance)}. Наступні заощадження спершу покриють цю різницю.`, 1);
    else if (bankNow.taxiTrips >= 1) add('bank-now', 'good', `У банку комфорту ${fmtGrn(bankNow.balance)} — вистачить на ${bankNow.taxiTrips} ${plural(bankNow.taxiTrips, ['поїздку', 'поїздки', 'поїздок'])} таксі.`, 3);
  }
  if (weekProjected && weekProjected.gross > 0) {
    const veh = vehicles(s.trip.passengers, s.taxi.capacity);
    const n = s.taxi.price > 0 ? Math.floor((weekProjected.gross * s.bank.pct) / 100 / (s.taxi.price * veh)) : 0;
    if (n >= 1) add('bank-week', 'good', `${n} ${plural(n, ['поїздка', 'поїздки', 'поїздок'])} таксі на тиждень ${n === 1 ? 'вкладається' : 'вкладаються'} у ваш бюджет комфорту (${fmtNum(s.bank.pct)} % від прогнозованої економії).`, 4);
  }

  // Паркування та час
  if (best && m.auto && best.key !== m.auto.key) {
    const parking = m.auto.cost.parking;
    const diff = m.auto.cost.decision - best.cost.decision;
    if (parking > 0 && diff > 0) {
      const after = diff - parking;
      add('parking', 'info', after > 0
        ? `Якщо паркування безкоштовне, різниця між авто та ${optName(best, m)} скорочується з ${fmtGrn(diff)} до ${fmtGrn(after)} на день.`
        : `Якщо паркування безкоштовне, авто стає дешевшим за ${optName(best, m)} на ${fmtGrn(-after)} на день.`, 5);
    }
  }
  if (m.auto && m.eco) {
    const saved = m.eco.minutes - m.auto.minutes;
    const extra = m.auto.cost.decision - m.eco.cost.decision;
    if (saved > 5 && extra > 0) {
      const hv = s.trip.hourValue || 0;
      if (hv > 0) {
        const worth = hv * s.trip.passengers * (saved / 60);
        add('hour-value', worth > extra ? 'info' : 'money', worth > extra
          ? `З урахуванням ціни вашого часу (${fmtGrn(hv)}/год) авто окупається: ${fmtMin(saved)} у дорозі менше варті ${fmtGrn(worth)}, а доплата — ${fmtGrn(extra)}.`
          : `Навіть з ціною вашого часу (${fmtGrn(hv)}/год) ECO вигідніше: ${fmtMin(saved)}, зекономлені авто, варті ${fmtGrn(worth)}, а доплата — ${fmtGrn(extra)}.`, 4);
      } else add('time-price', 'info', `Авто економить ${fmtMin(saved)} на день, але кожна зекономлена година коштує ${fmtGrn(extra / (saved / 60))}.`, 5);
    }
  }

  // Пільга
  if (s.benefit.enabled) {
    if (rec?.ctx?.eligible) add('benefit-on', 'info', `Пільгу враховано для ${s.benefit.persons} ${plural(s.benefit.persons, ['особи', 'осіб', 'осіб'])}. Застосовуйте її лише до поїздок, що відповідають умовам закону.`, 4);
    else add('benefit-off', 'info', 'Пільгу сьогодні не враховано: поїздку не позначено як таку, що відповідає умовам.', 6);
  }

  // Наступний тиждень поза містом
  if (today && cal) {
    const nextMon = addDays(weekStart(today), 7);
    const days = Array.from({ length: 7 }, (_, i) => addDays(nextMon, i));
    const types = days.map((d) => resolveDayType(d, s, cal));
    if (types.some((t) => t === 'away') && !types.some((t) => PLAN_MODES.includes(t))) add('away-next', 'good', 'Наступного тижня ви поза Дніпром — тижневий проїзний на цей тиждень не потрібен.', 3);
  }

  // Ціна бензину та зима
  if (month?.modes?.auto && month.modes.auto.tripDays > 0) {
    const fuel = month.modes.auto.totals.fuel;
    if (fuel > 0) add('fuel-10', 'info', `Кожні +10 % до ціни бензину додають ${fmtGrn(fuel * 0.1)} на місяць, якщо їздити авто в усі дні поїздок.`, 7);
  }
  if (today && [10, 11, 0, 1, 2].includes(Number(today.slice(5, 7)) - 1) && !s.car.winter) {
    const c = carCosts(s, makeCtx(), 2);
    add('winter', 'info', `Зимовий режим авто вимкнено. Якщо взимку витрата зростає, увімкніть його: +${fmtNum(s.car.winterExtraPct)} % до пального — це ${fmtGrn(c.fuel * s.car.winterExtraPct / 100)} на день.`, 8);
  }

  return out.sort((a, b) => (a.priority - b.priority) || (TONE_ORDER[a.tone] - TONE_ORDER[b.tone]));
}

export const TONE_ICON = { warn: 'warn', money: 'savings', good: 'spark', info: 'info' };
