// MOBILITY ZERO — view-settings.js
// Налаштування: адреси, поїздки, авто, таксі, ГТ і маршрути, проїзні, пільга, пріоритети, банк, тема, дані.

import * as E from './engine.js';
import { exportJSON, validateImport, clearStorage, defaultState, defaultSettings, uid, APP_VERSION } from './store.js';
import { esc, icon, numField, textField, switchRow, selectField, readField, setFieldMsg, setPath, getPath, fmtInput, toast, openSheet, closeSheet, shareOrDownload, copyText, DOW_SHORT, humanDate } from './ui.js';
import { openPassPurchase } from './sheets.js';

let wTimer = 0;
const SEG_OPTIONS = Object.entries(E.SEGMENT_MODES).map(([k, v]) => [k, v.label]);

export default {
  mount(app, root) {
    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act]');
      if (!t || !root.contains(t)) return;
      onAction(app, root, t.dataset.act, t, this);
    });
    root.addEventListener('change', (ev) => {
      const el = ev.target;
      if (el.id === 'import-file') { importFile(app, el); return; }
      if (!el.dataset.bind) return;
      const path = el.dataset.bind;
      const prev = getPath(app.s, path);
      let r;
      if (el.dataset.kind === 'time') {
        const m = E.parseHM(el.value);
        if (m == null) { setFieldMsg(el, 'Формат часу ГГ:ХХ'); el.value = prev; return; }
        r = { value: E.fmtHM(m) };
      } else {
        r = readField(el, prev);
        if (!r) return;
        if (r.invalid) { setFieldMsg(el, 'Введіть число, напр. 89,38'); el.value = fmtInput(prev); return; }
      }
      if (/\.coords$/.test(path)) {
        const v = String(r.value);
        const c = E.parseCoords(v);
        if (v && !c) { setFieldMsg(el, 'Формат: 48.4647, 35.0462'); return; }
        setFieldMsg(el, c && E.haversineKm(c, E.DNIPRO_CENTER) > 60 ? 'Точка далеко від Дніпра — перевірте координати.' : '');
      } else setFieldMsg(el, r.corrected ? `Виправлено до ${fmtInput(r.value)}` : '');
      if (el.dataset.kind === 'num') el.value = fmtInput(r.value);
      app.update((st) => setPath(st.settings, path, r.value), { render: false });
      if (path === 'ui.theme') app.applyTheme();
      if (el.dataset.rerender) this.render(app, root);
    });
    root.addEventListener('input', (ev) => {
      const el = ev.target;
      if (!el.dataset.weight && el.id !== 'set-bank-pct') return;
      const v = Number(el.value);
      el.style.setProperty('--p', `${v}%`);
      if (el.id === 'set-bank-pct') {
        root.querySelector('#set-bank-pct-out').textContent = `${v} %`;
        clearTimeout(wTimer);
        wTimer = setTimeout(() => app.update((st) => { st.settings.bank.pct = v; }, { render: false }), 80);
        return;
      }
      const k = el.dataset.weight;
      clearTimeout(wTimer);
      app.state.settings.weights[k] = v;
      paintWeights(app, root);
      wTimer = setTimeout(() => app.update(() => {}, { render: false }), 120);
    });
  },

  render(app, root) {
    const activeId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : null;
    root.innerHTML = html(app);
    paintWeights(app, root);
    if (activeId) { const el = document.getElementById(activeId); if (el) el.focus({ preventScroll: true }); }
  },
};

function paintWeights(app, root) {
  const w = E.normalizeWeights(app.s.weights);
  const bar = root.querySelector('#w-bar');
  if (bar) bar.innerHTML = E.WEIGHT_KEYS.map((k) => `<span class="w-${k}" style="flex:${w[k].toFixed(4)}"></span>`).join('');
  for (const k of E.WEIGHT_KEYS) {
    const o = root.querySelector(`#w-out-${k}`);
    if (o) o.textContent = `${Math.round(w[k] * 100)} %`;
  }
}

function chipSet(path, values, current, labelOf) {
  return `<div class="chips">${values.map((v) => `<button type="button" class="chip" data-act="toggle-set" data-path="${path}" data-val="${v}" aria-pressed="${current.includes(v)}">${esc(labelOf(v))}</button>`).join('')}</div>`;
}

function html(app) {
  const s = app.s;
  const nav = [['set-route', 'Маршрут'], ['set-trip', 'Поїздки'], ['set-car', 'Авто'], ['set-taxi', 'Таксі'], ['set-transit', 'Транспорт'], ['set-passes', 'Проїзні'], ['set-benefit', 'Пільга'], ['set-weights', 'Пріоритети'], ['set-bank', 'Банк'], ['set-look', 'Вигляд'], ['set-data', 'Дані']];
  const ca = E.parseCoords(s.route.a.coords), cb = E.parseCoords(s.route.b.coords);
  const straight = ca && cb ? E.haversineKm(ca, cb) : null;
  const passes = app.hist.filter((r) => r.kind === 'pass').sort((a, b) => (a.start < b.start ? 1 : -1));
  const routeIds = s.transit.routes.map((r) => [r.id, `${r.name}${r.enabled ? '' : ' (вимкнено)'}`]);
  const fareModes = E.FARE_MODES;
  const modeLabel = (m) => E.SEGMENT_MODES[m].label;

  const point = (key, title) => {
    const p = s.route[key];
    const l = E.checkPointLinks(p);
    return `<div class="route-card"><div class="card-title">${title}</div>
      <div class="stack" style="margin-top:10px">
        ${textField({ bind: `route.${key}.label`, label: 'Коротка назва на головній', value: p.label, max: 60 })}
        ${textField({ bind: `route.${key}.address`, label: 'Повна адреса для карт', value: p.address, max: 200 })}
        ${textField({ bind: `route.${key}.coords`, label: 'Координати (необовʼязково)', value: p.coords, max: 60, placeholder: '48.4647, 35.0462', hint: 'Якщо карта показує іншу назву вулиці, скопіюйте координати правильної точки з карти — навігатори відкриватимуть саме її.' })}
        <div class="row wrap"><a class="btn small" href="${esc(l.google)}" target="_blank" rel="noopener">${icon('pin')}Google Maps</a><a class="btn small" href="${esc(l.apple)}" target="_blank" rel="noopener">${icon('pin')}Apple Maps</a></div>
        ${switchRow({ bind: `route.${key}.confirmed`, label: 'Точку підтверджено мною', checked: p.confirmed, hint: 'Позначте після перевірки на карті.' })}
      </div></div>`;
  };

  const routeCard = (r, i) => {
    const leg = E.transitLeg(r, s, E.makeCtx());
    const boards = r.segments.filter((g) => E.FARE_MODES.includes(g.mode)).length;
    return `<div class="route-card${r.enabled ? '' : ' disabled'}">
      <div class="row between"><div class="card-title">${esc(r.name || 'Маршрут')}</div>${r.confirmed ? '<span class="mode-badge s-eco">ПЕРЕВІРЕНО</span>' : '<span class="tag-approx">орієнтовно</span>'}</div>
      <p class="small muted" style="margin-top:4px">${r.segments.length ? `≈ ${E.fmtMin(leg.minutes)} в один бік, ${boards} ${E.plural(boards, ['посадка', 'посадки', 'посадок'])}, ${E.fmtUAH(leg.cost)} ${s.trip.passengers > 1 ? `на ${s.trip.passengers} осіб` : ''} разовими` : 'Додайте хоча б один відрізок.'}</p>
      <div class="stack" style="margin-top:10px">
        ${textField({ bind: `transit.routes.${i}.name`, label: 'Назва', value: r.name, max: 60, id: `rt-${i}-name` }).replace('data-kind="text"', 'data-kind="text" data-rerender="1"')}
        ${switchRow({ bind: `transit.routes.${i}.enabled`, label: 'Використовувати в розрахунках', checked: r.enabled, id: `rt-${i}-en` }).replace('data-kind="bool"', 'data-kind="bool" data-rerender="1"')}
        ${switchRow({ bind: `transit.routes.${i}.confirmed`, label: 'Перевірено мною', checked: r.confirmed, hint: 'Зупинки, пересадки та інтервали звірені в D-transport або на місці.', id: `rt-${i}-ok` }).replace('data-kind="bool"', 'data-kind="bool" data-rerender="1"')}
      </div>
      ${r.segments.map((g, j) => `<div class="seg-row">
        ${selectField({ bind: `transit.routes.${i}.segments.${j}.mode`, label: `Відрізок ${j + 1}`, value: g.mode, options: SEG_OPTIONS, id: `rt-${i}-${j}-mode` }).replace('data-kind="select"', 'data-kind="select" data-rerender="1"')}
        ${textField({ bind: `transit.routes.${i}.segments.${j}.line`, label: '№ лінії', value: g.line, max: 12, id: `rt-${i}-${j}-line` }).replace('data-kind="text"', 'data-kind="text" data-rerender="1"')}
        <div class="grid-3">
          ${segNum(i, j, 'walkMin', 'Пішки до', g.walkMin)}
          ${segNum(i, j, 'waitMin', 'Чекати', g.waitMin)}
          ${segNum(i, j, 'rideMin', g.mode === 'walk' ? 'Іти' : 'Їхати', g.rideMin)}
        </div>
        ${g.mode === 'taxi' ? numField({ bind: `transit.routes.${i}.segments.${j}.price`, label: 'Ціна таксі на цьому відрізку', value: g.price, unit: '₴', max: 20000, id: `rt-${i}-${j}-price` }).replace('data-kind="num"', 'data-kind="num" data-rerender="1"') : ''}
        <div class="seg-tools"><button type="button" class="link-btn" data-act="seg-del" data-i="${i}" data-j="${j}">Видалити відрізок</button></div>
      </div>`).join('')}
      ${numField({ bind: `transit.routes.${i}.walkEndMin`, label: 'Від останньої зупинки пішки', value: r.walkEndMin, unit: 'хв', max: 120, id: `rt-${i}-end` }).replace('data-kind="num"', 'data-kind="num" data-rerender="1"')}
      <div class="row wrap" style="margin-top:10px">
        ${r.segments.length < 6 ? `<button type="button" class="btn small" data-act="seg-add" data-i="${i}">${icon('plus')}Відрізок</button>` : ''}
        <button type="button" class="btn small danger" data-act="route-del" data-i="${i}">${icon('trash')}Видалити маршрут</button>
      </div>
    </div>`;
  };

  return `<h1 class="page-title">Налаштування</h1>
  <div class="sticky-chips"><div class="chips scroll" role="navigation" aria-label="Розділи налаштувань">${nav.map(([id, l]) => `<button type="button" class="chip" data-act="jump" data-to="${id}">${l}</button>`).join('')}</div></div>
  <div class="callout" style="margin-bottom:6px">${icon('info')}<span>Ціни й тривалості — стартові припущення. Помаранчева крапка <span class="tag-assume" aria-hidden="true"></span> біля поля нагадує перевірити значення. Дані зберігаються лише на цьому пристрої.</span></div>

  <h2 class="section-title" id="set-route">Маршрут</h2>
  ${point('a', 'Точка А — звідки')}
  ${point('b', 'Точка Б — куди')}
  <div class="row wrap" style="margin-top:10px"><button type="button" class="btn" data-act="swap">${icon('swap')}Поміняти місцями</button></div>
  ${straight != null ? `<div class="callout" style="margin-top:10px">${icon('route')}<span>По прямій між точками ${E.fmtNum(straight, 1)} км. Дорогою зазвичай більше — орієнтовно ${E.fmtNum(straight * 1.3, 1)} км. <button type="button" class="link-btn" data-act="apply-dist" data-km="${(straight * 1.3).toFixed(1)}">Застосувати</button></span></div>` : ''}

  <h2 class="section-title" id="set-trip">Поїздки</h2>
  <div class="card"><div class="grid-2">
    ${numField({ bind: 'trip.passengers', label: 'Пасажирів зазвичай', value: s.trip.passengers, unit: 'ос.', min: 1, max: 8, int: true })}
    <div class="field"><label for="f-trip-arriveBy">Бажаний час прибуття</label><div class="input-wrap"><input id="f-trip-arriveBy" type="time" data-bind="trip.arriveBy" data-kind="time" value="${esc(s.trip.arriveBy)}"></div><p class="field-msg"></p></div>
  </div>
  <div style="margin-top:12px">${selectField({ bind: 'trip.defaultMode', label: 'Режим робочого дня в календарі', value: s.trip.defaultMode, options: E.PLAN_MODES.map((m) => [m, `${E.MODE_INFO[m].code} — ${E.MODE_INFO[m].name}`]) })}</div>
  <p class="field-label" style="margin:14px 2px 8px;font-size:13px;font-weight:600;color:var(--ink-2)">Робочі дні</p>
  ${chipSet('trip.workDays', [0, 1, 2, 3, 4, 5, 6], s.trip.workDays, (d) => DOW_SHORT[d])}
  <div style="margin-top:8px">${switchRow({ bind: 'trip.returnDefault', label: 'Зазвичай потрібна зворотна поїздка', checked: s.trip.returnDefault })}</div></div>

  <h2 class="section-title" id="set-car">Автомобіль</h2>
  <div class="card">
    ${textField({ bind: 'car.name', label: 'Модель', value: s.car.name, max: 60 })}
    <div class="grid-2" style="margin-top:12px">
      ${numField({ bind: 'car.distanceKm', label: 'Відстань в один бік', value: s.car.distanceKm, unit: 'км', max: 500, assumption: true })}
      ${numField({ bind: 'car.consumption', label: 'Витрата', value: s.car.consumption, unit: 'л/100', max: 40, assumption: true })}
      ${numField({ bind: 'car.fuelPrice', label: 'Ціна бензину', value: s.car.fuelPrice, unit: '₴/л', max: 1000, assumption: true })}
      ${numField({ bind: 'car.wearPerKm', label: 'Знос і амортизація', value: s.car.wearPerKm, unit: '₴/км', max: 100, assumption: true })}
      ${numField({ bind: 'car.parkingPerHour', label: 'Паркування', value: s.car.parkingPerHour, unit: '₴/год', max: 2000, assumption: true })}
      ${numField({ bind: 'car.parkingHours', label: 'Годин паркування', value: s.car.parkingHours, unit: 'год', max: 24 })}
      ${numField({ bind: 'car.driveMin', label: 'Їхати в один бік', value: s.car.driveMin, unit: 'хв', min: 1, max: 600, assumption: true })}
      ${numField({ bind: 'car.parkWalkMin', label: 'Паркування й пішки', value: s.car.parkWalkMin, unit: 'хв', max: 120, assumption: true })}
      ${numField({ bind: 'car.capacity', label: 'Місць для пасажирів', value: s.car.capacity, unit: 'ос.', min: 1, max: 9, int: true })}
      ${numField({ bind: 'car.fixedMonthly', label: 'Фіксовані витрати', value: s.car.fixedMonthly, unit: '₴/міс', max: 1e6 })}
    </div>
    <p class="hint">Фіксовані витрати — страховка, ТО, стоянка біля дому. На вибір транспорту не впливають, лише на повну вартість володіння.</p>
    <div style="margin-top:8px">
      ${switchRow({ bind: 'car.includeWear', label: 'Враховувати знос у порівнянні', checked: s.car.includeWear, hint: 'Увімкнено — повна економічна вартість. Вимкнено — лише гроші з кишені (пальне й паркування).' })}
      ${switchRow({ bind: 'car.winter', label: 'Зимовий режим', checked: s.car.winter, hint: 'Додає зимову надбавку до витрати пального.' })}
    </div>
    <div class="grid-2" style="margin-top:8px">
      ${numField({ bind: 'car.winterExtraPct', label: 'Зимова надбавка', value: s.car.winterExtraPct, unit: '%', max: 100, assumption: true })}
      ${numField({ bind: 'car.trafficFuelPct', label: 'Надбавка в заторах', value: s.car.trafficFuelPct, unit: '%', max: 100, assumption: true })}
      ${numField({ bind: 'misc.trafficFactor', label: 'Затори: час ×', value: s.misc.trafficFactor, unit: '×', min: 1, max: 4, assumption: true })}
    </div>
    <p class="hint">Множник заторів діє на таксі й авто повністю, на тролейбус і автобус частково, на трамвай слабо, на метро — ні.</p>
  </div>

  <h2 class="section-title" id="set-taxi">Таксі</h2>
  <div class="card"><div class="grid-2">
    ${numField({ bind: 'taxi.price', label: 'Поїздка в один бік', value: s.taxi.price, unit: '₴', max: 20000, assumption: true })}
    ${numField({ bind: 'taxi.capacity', label: 'Місць у таксі', value: s.taxi.capacity, unit: 'ос.', min: 1, max: 8, int: true })}
    ${numField({ bind: 'taxi.waitMin', label: 'Очікування авто', value: s.taxi.waitMin, unit: 'хв', max: 120, assumption: true })}
    ${numField({ bind: 'taxi.rideMin', label: 'У дорозі', value: s.taxi.rideMin, unit: 'хв', min: 1, max: 600, assumption: true })}
  </div><p class="hint">Ціна — за одне спільне таксі на всіх пасажирів.</p></div>

  <h2 class="section-title" id="set-transit">Громадський транспорт<small>Ціна за одну посадку на одну людину.</small></h2>
  <div class="card"><div class="grid-2">
    ${fareModes.map((m) => numField({ bind: `transit.fares.${m}`, label: modeLabel(m), value: s.transit.fares[m], unit: '₴', max: 1000, assumption: true })).join('')}
  </div><p class="hint">За повідомленнями преси на березень 2026: трамвай, тролейбус і метро в Дніпрі — 10 ₴, маршрутки — 20 ₴. Перевірте актуальні тарифи перевізника.</p>
  <div style="margin-top:12px">${selectField({ bind: 'transit.ecoRoute', label: 'Маршрут для ECO', value: s.transit.ecoRoute || 'auto', options: [['auto', 'Автоматично'], ...s.transit.routes.filter((r) => r.enabled && E.isPureTransit(r)).map((r) => [r.id, r.name])] })}</div></div>
  <div class="callout warn">${icon('warn')}<span>Маршрути нижче — шаблони. MOBILITY ZERO не знає реальних розкладів, зупинок і пересадок: звірте їх у D-transport і позначте «Перевірено мною». Неперевірений маршрут позначається як орієнтовний і отримує нижчу надійність.</span></div>
  ${s.transit.routes.map(routeCard).join('')}
  <div class="row wrap" style="margin-top:12px">${s.transit.routes.length < 12 ? `<button type="button" class="btn" data-act="route-add">${icon('plus')}Додати маршрут</button>` : ''}<a class="btn" href="${E.DTRANSPORT_URL}" target="_blank" rel="noopener">${icon('route')}D-transport</a></div>
  <div class="card" style="margin-top:12px"><div class="card-title">FLEX — ваша комбінація</div><p class="card-sub">Оберіть спосіб на кожен напрямок.</p>
    <div class="grid-2" style="margin-top:10px">
      ${selectField({ bind: 'flex.there', label: 'Туди', value: s.flex.there, options: [['taxi', 'Таксі'], ...routeIds] })}
      ${selectField({ bind: 'flex.back', label: 'Назад', value: s.flex.back, options: [['taxi', 'Таксі'], ...routeIds] })}
    </div></div>

  <h2 class="section-title" id="set-passes">Проїзні<small>Ціна на одну людину. Проїзний — це квиток на строк, а не доплата до кожної поїздки.</small></h2>
  <div class="card"><div class="grid-2">
    ${numField({ bind: 'transit.passes.weeklyPrice', label: 'Тижневий', value: s.transit.passes.weeklyPrice, unit: '₴', max: 20000, assumption: true })}
    ${numField({ bind: 'transit.passes.monthlyPrice', label: 'Місячний', value: s.transit.passes.monthlyPrice, unit: '₴', max: 50000, assumption: true })}
    ${selectField({ bind: 'transit.passes.weeklyType', label: 'Тижневий діє', value: s.transit.passes.weeklyType, options: [['rolling', '7 днів від початку'], ['calendar', 'До неділі цього тижня']] })}
    ${selectField({ bind: 'transit.passes.monthlyType', label: 'Місячний діє', value: s.transit.passes.monthlyType, options: [['calendar', 'До кінця місяця'], ['rolling30', '30 днів від початку']] })}
  </div>
  <p style="margin:14px 2px 8px;font-size:13px;font-weight:600;color:var(--ink-2)">Що покриває проїзний</p>
  ${chipSet('transit.passes.covers', fareModes, s.transit.passes.covers, modeLabel)}
  <div class="card-title" style="margin-top:18px">Куплені проїзні</div>
  ${passes.length ? passes.map((p) => `<div class="hist-item"><span class="mode-badge s-zero">${p.type === 'weekly' ? 'ТИЖД.' : 'МІС.'}</span><div class="hist-main"><b>${humanDate(p.start)} – ${humanDate(p.end)}</b><small>${p.persons} ${E.plural(p.persons, ['особа', 'особи', 'осіб'])}</small></div><div class="hist-amt">${E.fmtUAH(p.price)}</div><button type="button" class="icon-btn" data-act="pass-del" data-id="${esc(p.id)}" aria-label="Видалити проїзний">${icon('trash')}</button></div>`).join('') : '<p class="small muted" style="margin-top:6px">Немає. Додайте купівлю — поїздки в період дії рахуватимуться як оплачені.</p>'}
  <button type="button" class="btn small" data-act="pass-add" style="margin-top:10px">${icon('plus')}Додати купівлю</button></div>

  <h2 class="section-title" id="set-benefit">Пільговий проїзд</h2>
  <div class="card">
    ${switchRow({ bind: 'benefit.enabled', label: 'Враховувати пільгу', checked: s.benefit.enabled, hint: 'Лише для поїздок, які ви позначили як такі, що відповідають умовам.', id: 'b-en' }).replace('data-kind="bool"', 'data-kind="bool" data-rerender="1"')}
    ${s.benefit.enabled ? `<div class="grid-2" style="margin-top:8px">${numField({ bind: 'benefit.persons', label: 'Скількох стосується', value: s.benefit.persons, unit: 'ос.', min: 0, max: s.trip.passengers, int: true })}</div>
    <p style="margin:14px 2px 8px;font-size:13px;font-weight:600;color:var(--ink-2)">Види транспорту</p>
    ${chipSet('benefit.modes', fareModes, s.benefit.modes, modeLabel)}
    <div style="margin-top:8px">${switchRow({ bind: 'benefit.defaultEligible', label: 'Робочі поїздки за замовчуванням відповідають умовам', checked: s.benefit.defaultEligible, hint: 'Увімкніть, лише якщо це справді так. Окремий день можна змінити в календарі, сьогоднішній — у ранковому виборі.' })}</div>` : ''}
    <p class="note-box">За текстом Закону України «Про Національну поліцію» (ст. 62, ч. 10, п. 7) поліцейський під час виконання поліцейських повноважень безоплатно користується громадським транспортом міського, приміського й місцевого сполучення, крім таксі. Застосунок умов не перевіряє і не радить, коли пільга застосовна. Чинну редакцію перевіряйте на zakon.rada.gov.ua.</p>
  </div>

  <h2 class="section-title" id="set-weights">Пріоритети ZERO<small>Ваги автоматично нормуються до 100 %.</small></h2>
  <div class="card">
    <div class="weights-sum" id="w-bar" aria-hidden="true"></div>
    ${E.WEIGHT_KEYS.map((k) => `<div class="range-row"><div class="row"><label for="w-${k}"><span class="wkey w-${k}" aria-hidden="true"></span>${E.WEIGHT_LABELS[k]}</label><b id="w-out-${k}"></b></div><input id="w-${k}" type="range" min="0" max="100" step="5" value="${s.weights[k]}" data-weight="${k}" style="--p:${s.weights[k]}%"></div>`).join('')}
    <button type="button" class="btn small ghost" data-act="w-reset" style="margin-top:8px">Повернути 45 / 25 / 20 / 10</button>
  </div>

  <h2 class="section-title" id="set-bank">Банк комфорту</h2>
  <div class="card">
    <div class="range-row"><div class="row"><label for="set-bank-pct">Бюджет комфорту</label><b id="set-bank-pct-out">${s.bank.pct} %</b></div><input id="set-bank-pct" type="range" min="0" max="100" step="5" value="${s.bank.pct}" style="--p:${s.bank.pct}%"></div>
    <div class="grid-2" style="margin-top:8px">
      ${numField({ bind: 'bank.weeklyGoal', label: 'Мета на тиждень', value: s.bank.weeklyGoal, unit: '₴', max: 1e7 })}
      ${numField({ bind: 'bank.monthlyGoal', label: 'Мета на місяць', value: s.bank.monthlyGoal, unit: '₴', max: 1e7 })}
    </div>
    <div style="margin-top:12px">${selectField({ bind: 'bank.baseline', label: 'Економію рахувати проти', value: s.bank.baseline, options: [['carFull', 'Авто з урахуванням зносу'], ['carCash', 'Авто: лише гроші з кишені']] })}</div>
  </div>

  <h2 class="section-title" id="set-look">Вигляд</h2>
  <div class="card"><div class="seg" role="group" aria-label="Тема">
    ${[['dark', 'Темна'], ['light', 'Світла'], ['system', 'Як у системі']].map(([v, l]) => `<button type="button" data-act="theme" data-theme="${v}" aria-pressed="${s.ui.theme === v}">${l}</button>`).join('')}
  </div></div>

  <h2 class="section-title" id="set-data">Дані та резервні копії</h2>
  <div class="card stack">
    <p class="small muted">${dataSummary(app, passes.length)} Усе лежить лише в цьому браузері.</p>
    <div class="row wrap"><button type="button" class="btn primary" data-act="export">${icon('download')}Експорт JSON</button><button type="button" class="btn" data-act="copy">${icon('copy')}Копіювати</button></div>
    <div class="row wrap"><label class="btn" for="import-file">${icon('upload')}Імпорт з файлу</label><input id="import-file" type="file" accept="application/json,.json" hidden><button type="button" class="btn" data-act="paste">Вставити текст</button></div>
    <div class="row wrap"><button type="button" class="btn ghost" data-act="reset-settings">Скинути налаштування</button><button type="button" class="btn danger" data-act="wipe">${icon('trash')}Видалити всі дані</button></div>
  </div>

  <h2 class="section-title">Про застосунок</h2>
  <div class="card">
    <div class="kv"><span>Версія</span><b>${APP_VERSION}</b></div>
    <div class="kv"><span>Перевірка формул</span><b><a href="tests.html" target="_blank" rel="noopener">Відкрити тести</a></b></div>
    <p class="note-box">MOBILITY ZERO рахує все локально, без сервера й платних сервісів. Живих розкладів, заторів, GPS чи тарифів він не отримує — лише ваші значення. Оцінка 0–100 порівнює варіанти за вашими пріоритетами і не є ймовірністю.</p>
  </div>`;
}

function dataSummary(app, nPasses) {
  const t = app.hist.filter((r) => r.kind === 'trip').length;
  const d = Object.keys(app.cal).length;
  return `Збережено: ${t} ${E.plural(t, ['поїздка', 'поїздки', 'поїздок'])}, ${nPasses} ${E.plural(nPasses, ['проїзний', 'проїзні', 'проїзних'])}, ${d} ${E.plural(d, ['зміна', 'зміни', 'змін'])} у календарі.`;
}

function segNum(i, j, key, label, value) {
  return numField({ bind: `transit.routes.${i}.segments.${j}.${key}`, label, value, unit: 'хв', max: key === 'rideMin' ? 600 : 120, id: `rt-${i}-${j}-${key}` }).replace('data-kind="num"', 'data-kind="num" data-rerender="1"');
}

function onAction(app, root, act, t, view) {
  const rerender = () => view.render(app, root);
  if (act === 'jump') { document.getElementById(t.dataset.to)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); return; }
  if (act === 'toggle-set') {
    const path = t.dataset.path;
    let val = t.dataset.val;
    if (path === 'trip.workDays') val = Number(val);
    app.update((st) => {
      const arr = getPath(st.settings, path);
      const next = arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
      setPath(st.settings, path, path === 'trip.workDays' ? next.sort((a, b) => a - b) : next);
    }, { render: false });
    t.setAttribute('aria-pressed', String(getPath(app.s, path).includes(val)));
    return;
  }
  if (act === 'swap') { app.update((st) => { st.settings.route.swapped = !st.settings.route.swapped; }, { render: false }); toast('Точки поміняно місцями'); return; }
  if (act === 'apply-dist') { const km = Number(t.dataset.km); app.update((st) => { st.settings.car.distanceKm = km; }, { render: false }); rerender(); toast(`Відстань авто: ${E.fmtNum(km, 1)} км`); return; }
  if (act === 'route-add') {
    app.update((st) => { st.settings.transit.routes.push({ id: uid('r'), name: 'Новий маршрут', enabled: false, confirmed: false, walkEndMin: 5, segments: [{ mode: 'tram', line: '', walkMin: 5, waitMin: 8, rideMin: 20, price: 0 }] }); }, { render: false });
    rerender(); return;
  }
  if (act === 'route-del') {
    const i = Number(t.dataset.i);
    const removed = app.s.transit.routes[i];
    app.update((st) => {
      st.settings.transit.routes.splice(i, 1);
      if (st.settings.transit.ecoRoute === removed.id) st.settings.transit.ecoRoute = 'auto';
      if (st.settings.flex.there === removed.id) st.settings.flex.there = 'taxi';
      if (st.settings.flex.back === removed.id) st.settings.flex.back = 'taxi';
    }, { render: false });
    rerender();
    toast('Маршрут видалено', { action: 'Повернути', onAction: () => { app.update((st) => { st.settings.transit.routes.splice(i, 0, removed); }, { render: false }); rerender(); } });
    return;
  }
  if (act === 'seg-add') {
    const i = Number(t.dataset.i);
    app.update((st) => { st.settings.transit.routes[i].segments.push({ mode: 'trolley', line: '', walkMin: 3, waitMin: 8, rideMin: 15, price: 0 }); }, { render: false });
    rerender(); return;
  }
  if (act === 'seg-del') {
    const i = Number(t.dataset.i), j = Number(t.dataset.j);
    app.update((st) => { st.settings.transit.routes[i].segments.splice(j, 1); }, { render: false });
    rerender(); return;
  }
  if (act === 'pass-add') { openPassPurchase(app); return; }
  if (act === 'pass-del') {
    const id = t.dataset.id;
    const removed = app.hist.find((r) => r.id === id);
    app.update((st) => { st.history = st.history.filter((r) => r.id !== id); }, { render: false });
    rerender();
    toast('Проїзний видалено', { action: 'Повернути', onAction: () => { app.update((st) => { st.history.push(removed); }, { render: false }); rerender(); } });
    return;
  }
  if (act === 'w-reset') { app.update((st) => { st.settings.weights = { cost: 45, comfort: 25, speed: 20, reliability: 10 }; }, { render: false }); rerender(); return; }
  if (act === 'theme') { app.setTheme(t.dataset.theme); return; }
  if (act === 'export') {
    const name = `mobility-zero-${app.today()}.json`;
    shareOrDownload(name, exportJSON(app.state)).then((r) => { if (r !== 'cancelled') toast(r === 'shared' ? 'Резервну копію передано' : `Файл ${name} збережено`); });
    return;
  }
  if (act === 'copy') { copyText(exportJSON(app.state)).then((ok) => toast(ok ? 'JSON скопійовано' : 'Не вдалося скопіювати — скористайтесь експортом')); return; }
  if (act === 'paste') { openPaste(app); return; }
  if (act === 'reset-settings') {
    confirmSheet({
      title: 'Скинути налаштування?', text: 'Адреси, ціни, маршрути й пріоритети повернуться до стартових. Історія поїздок і календар залишаться.', ok: 'Скинути налаштування',
      onOk: () => { app.update((st) => { st.settings = defaultSettings(); }, { render: false }); app.applyTheme(); rerender(); toast('Налаштування скинуто'); },
    });
    return;
  }
  if (act === 'wipe') {
    confirmSheet({
      title: 'Видалити всі дані?', text: 'Буде видалено налаштування, календар, історію поїздок і банк комфорту з цього пристрою. Дію не можна скасувати — спершу зробіть експорт, якщо дані потрібні.', ok: 'Видалити назавжди', danger: true,
      onOk: () => { clearStorage(); app.replaceState(defaultState()); app.persistNow(); toast('Усі дані видалено'); },
    });
  }
}

function confirmSheet({ title, text, ok, danger = false, onOk }) {
  openSheet({
    title,
    render: () => `<p class="muted">${esc(text)}</p><div class="sheet-actions"><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(ok)}</button><button type="button" class="btn" data-act="cancel">Скасувати</button></div>`,
    onAction: (act) => { if (act === 'ok') { closeSheet(); onOk(); } else closeSheet(); },
  });
}

function importFile(app, input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('Файл завеликий для резервної копії'); return; }
  const reader = new FileReader();
  reader.onload = () => reviewImport(app, String(reader.result || ''));
  reader.onerror = () => toast('Не вдалося прочитати файл');
  reader.readAsText(file);
}

function openPaste(app) {
  let text = '';
  openSheet({
    title: 'Імпорт з тексту',
    render: () => `<p class="muted small">Вставте вміст резервної копії JSON.</p><textarea class="input" id="paste-area" aria-label="JSON резервної копії">${esc(text)}</textarea><div class="sheet-actions"><button type="button" class="btn primary" data-act="check">Перевірити</button><button type="button" class="btn" data-act="cancel">Скасувати</button></div>`,
    onInput: (el) => { if (el.id === 'paste-area') text = el.value; },
    onAction: (act) => { if (act === 'check') reviewImport(app, text); else closeSheet(); },
  });
}

function reviewImport(app, text) {
  const v = validateImport(text);
  openSheet({
    title: v.ok ? 'Відновити з копії?' : 'Копію не прийнято',
    render: () => v.ok
      ? `<p class="muted">Знайдено ${v.summary.trips} ${E.plural(v.summary.trips, ['поїздку', 'поїздки', 'поїздок'])}, ${v.summary.passes} ${E.plural(v.summary.passes, ['проїзний', 'проїзні', 'проїзних'])} і ${v.summary.days} ${E.plural(v.summary.days, ['день', 'дні', 'днів'])} календаря. Поточні дані на цьому пристрої буде замінено.</p>
        ${v.warnings.length ? `<div class="callout warn">${icon('warn')}<span>Виправлено або пропущено ${v.warnings.length} ${E.plural(v.warnings.length, ['значення', 'значення', 'значень'])}:<br>${v.warnings.slice(0, 8).map(esc).join('<br>')}${v.warnings.length > 8 ? '<br>…' : ''}</span></div>` : '<p class="small good">Схема перевірена, помилок немає.</p>'}
        <div class="sheet-actions"><button type="button" class="btn primary" data-act="apply">Замінити дані</button><button type="button" class="btn" data-act="cancel">Скасувати</button></div>`
      : `<div class="callout warn">${icon('warn')}<span>${v.errors.map(esc).join('<br>')}</span></div><button type="button" class="btn block" data-act="cancel">Зрозуміло</button>`,
    onAction: (act) => {
      if (act === 'apply' && v.ok) { closeSheet(); app.replaceState(v.state); app.persistNow(); toast('Дані відновлено'); }
      else closeSheet();
    },
  });
}
