// Sapar Trade — прототип. Модуль: Система управления: демо-данные Кызылорды, периоды, агрегаты, Score, проблемы
// Строки 2808–3045 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== MANAGEMENT SYSTEM (ТЗ V1.0) ============================== */
// Единая система управления Sapar Trade: дашборд владельца, продажи, ТП и супервайзеры,
// GPS-маршруты, водители, склад и dead stock, дебиторка, P&L, KPI/Score, проблемы,
// задачи, AI-ассистент, интеграция с 1С, RBAC, аудит и экспорт.
// ВАЖНО: это фронтенд с демо-данными. Реальные цифры приходят только после подключения
// Backend API к 1С; права (RBAC) на проде проверяются на сервере.

function mkRng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const DAY_MS = 86400000;
const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eod = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const addD = (d, n) => { const x = sod(d); x.setDate(x.getDate() + n); return x; };
const pctOf = (a, b) => (b ? (a / b) * 100 : 0);
const fp = (n, d = 1) => (isFinite(n) ? n.toFixed(d).replace(".", ",") : "0") + "%";
const shortMoney = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2).replace(".", ",") + " млрд ₸";
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " млн ₸";
  if (a >= 1e4) return Math.round(n / 1e3).toLocaleString("ru-RU") + " тыс ₸";
  return money(Math.round(n));
};

const ORDER_FLOW = ["Принят", "Передан на склад", "Комплектация", "Готов", "Загружен", "В пути", "Доставлен", "Частично доставлен", "Отказ", "Возврат", "Закрыт"];

const MG = (() => {
  const r = mkRng(20260929);
  const today = sod(new Date());
  const supervisors = [
    { id: "sv1", name: "Ерлан Мукашев", team: "Кызылорда — Центр" },
    { id: "sv2", name: "Айгерим Сейтова", team: "Кызылорда — Микрорайоны" },
  ];
  const TPN = ["Азамат Турсунов", "Данияр Омаров", "Нурсултан Абенов", "Мадина Касымова", "Руслан Жаксылыков", "Алия Бекова"];
  const TER = ["Центр", "Старый город", "Левобережье", "мкр. Шугыла", "мкр. Акмечеть", "пос. Тасбогет"];
  const tps = TPN.map((name, i) => ({
    id: "tp" + (i + 1), name, sv: i < 3 ? "sv1" : "sv2", territory: TER[i], route: "Маршрут №" + (i + 1),
    power: 0.72 + r() * 0.55, routeAdh: 0.72 + r() * 0.26, discipline: 0.7 + r() * 0.3,
    start: (8 + (r() < 0.3 ? 1 : 0)) + ":" + String(Math.floor(r() * 50)).padStart(2, "0"),
  }));
  const tpById = Object.fromEntries(tps.map((t) => [t.id, t]));

  const DAYS = 1120;
  const facts = [];
  for (let d = DAYS; d >= 0; d--) {
    const date = addD(today, -d);
    const wd = date.getDay();
    const wdF = wd === 0 ? 0.2 : wd === 6 ? 0.65 : 1;
    const season = 1 + 0.12 * Math.sin((date.getMonth() / 12) * Math.PI * 2);
    const growth = 1 + ((DAYS - d) / DAYS) * 0.22;
    tps.forEach((tp) => {
      const base = 610000 * tp.power * wdF * season * growth;
      const rev = Math.round((base * (0.78 + r() * 0.44)) / 100) * 100;
      const cost = Math.round(rev * (0.77 + r() * 0.05));
      const ret = Math.round(rev * (0.004 + r() * 0.034));
      const vPlan = wd === 0 ? 0 : 22;
      const vFact = Math.min(vPlan, Math.round(vPlan * tp.routeAdh * (0.95 + r() * 0.12)));
      const vEff = Math.round(vFact * (0.55 + r() * 0.35));
      facts.push({
        t: date.getTime(), tp: tp.id, rev, cost, ret, plan: Math.round(base * 1.05), vPlan, vFact, vEff,
        newCl: r() < 0.1 ? 1 : 0, km: vPlan ? Math.round(38 + r() * 55) : 0, sku: vPlan ? Math.round(9 + r() * 14) : 0,
        skuPlan: vPlan ? 22 : 0, cash: Math.round(rev * (0.86 + r() * 0.1)),
      });
    });
  }

  const EXP = [
    ["Зарплата", 9800000], ["Логистика", 3100000], ["Аренда", 2100000], ["Топливо", 2500000],
    ["Маркетинг", 1050000], ["Коммунальные", 620000], ["Банковские", 430000], ["Прочие", 780000],
  ];

  const SHOPS = ["Магазин Береке", "ТД Шапагат", "Дукен Азамат ИП", "Минимаркет Айсулу", "Супермаркет Арай", "Магазин Жулдыз",
    "Маркет Нур", "Дукен Самал", "ТД Алтын", "Магазин Бахыт", "Минимаркет Достык", "Маркет Керемет", "Магазин Асем",
    "ТД Береке-2", "Дукен Сарыарка", "Маркет Тумар", "Магазин Жанар", "Минимаркет Ак жол"];
  const STREETS = ["Желтоксан", "Айтеке би", "Токмагамбетова", "Абая", "Бокейхана", "Коркыт Ата", "Жахаева", "Муратбаева"];
  const clients = SHOPS.map((name, i) => {
    const tp = tps[i % tps.length];
    const debt = r() < 0.7 ? Math.round((r() * 950000 + 40000) / 1000) * 1000 : 0;
    const overdue = debt ? Math.floor(r() * r() * 95) : 0;
    const monthSales = Math.round((r() * 2600000 + 400000) / 1000) * 1000;
    return {
      id: "c" + (i + 1), name, tp: tp.id, sv: tp.sv, addr: "г. Кызылорда, ул. " + STREETS[i % STREETS.length] + ", " + (12 + i * 3),
      phone: "+7 70" + (1 + (i % 8)) + " " + (210 + i * 7) + " " + (10 + i) + " " + (30 + i),
      gps: (44.822 + r() * 0.05).toFixed(4) + ", " + (65.455 + r() * 0.075).toFixed(4),
      debt, overdue, monthSales, lastOrder: Math.floor(r() * r() * 26), avgOrder: Math.round(monthSales / (4 + r() * 6) / 100) * 100,
      ret: Math.round(monthSales * (0.005 + r() * 0.03)), sku: Math.round(10 + r() * 30), margin: 0.18 + r() * 0.07,
      status: i > 15 ? "new" : r() < 0.12 ? "lost" : "active",
      visits: Array.from({ length: 4 }, (_, k) => ({ d: dmy(addD(today, -(k * 7 + Math.floor(r() * 3)))), ok: r() < 0.75, sum: Math.round(r() * 350000 / 100) * 100 })),
    };
  });
  const payables = [
    { name: "ТОО «Сыр Дистрибуция»", sum: 4850000, due: 6 },
    { name: "ТОО «Фудмастер»", sum: 2140000, due: 12 },
    { name: "ТОО «Рахат»", sum: 1760000, due: 3 },
    { name: "ТОО «Хенкель Казахстан»", sum: 3320000, due: 18 },
  ];

  const prodMeta = {};
  PRODUCTS.forEach((p, i) => {
    const slow = i % 7 === 3 ? 95 : i % 7 === 5 ? 64 : i % 9 === 2 ? 34 : Math.floor(r() * 6);
    prodMeta[p.id] = {
      cost: Math.round(p.price * (0.72 + r() * 0.1)), avgDaily: slow > 25 ? 0 : +(1 + r() * 14).toFixed(1), lastMove: slow,
      inQ: Math.round(r() * 300), outQ: Math.round(r() * 280), retQ: Math.round(r() * 12), brak: Math.round(r() * 5), wo: Math.round(r() * 4),
      peresort: r() < 0.1 ? Math.round(r() * 3) : 0, expiring: r() < 0.15 ? Math.round(r() * 20) : 0,
    };
  });

  const deliveries = clients.slice(0, 7).map((c, i) => {
    const total = Math.round((r() * 480000 + 60000) / 100) * 100;
    return { id: "НК-" + (5210 + i), client: c.name, addr: c.addr, total, pay: i % 3 === 0 ? "bank" : i % 4 === 1 ? "debt" : "cash", status: i < 2 ? "Доставлен" : i === 2 ? "В пути" : "Загружен", collected: i < 2 ? total : 0 };
  });

  return { today, supervisors, tps, tpById, facts, EXP, clients, payables, prodMeta, deliveries };
})();

const MG_PERIODS = [["today", "Сегодня"], ["yesterday", "Вчера"], ["week", "Эта неделя"], ["lweek", "Прошлая неделя"], ["month", "Этот месяц"],
  ["lmonth", "Прошлый месяц"], ["quarter", "Квартал"], ["year", "Этот год"], ["lyear", "Прошлый год"], ["custom", "Свои даты"]];

function mgRange(id, custom) {
  const now = new Date(); const t = sod(now);
  const mon = addD(t, -((t.getDay() + 6) % 7));
  const shift = (a, b, days) => ({ from: a, to: b, pf: addD(a, -days), pt: new Date(b.getTime() - days * DAY_MS) });
  const monthBack = (d, k) => { const x = new Date(d); const day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() - k); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(day, last)); return x; };
  switch (id) {
    case "today": return shift(t, now, 1);
    case "yesterday": return shift(addD(t, -1), eod(addD(t, -1)), 1);
    case "week": return shift(mon, now, 7);
    case "lweek": return shift(addD(mon, -7), eod(addD(mon, -1)), 7);
    case "month": { const f = new Date(t.getFullYear(), t.getMonth(), 1); return { from: f, to: now, pf: monthBack(f, 1), pt: eod(monthBack(t, 1)) }; }
    case "lmonth": { const f = new Date(t.getFullYear(), t.getMonth() - 1, 1); const e = eod(new Date(t.getFullYear(), t.getMonth(), 0)); return { from: f, to: e, pf: new Date(t.getFullYear(), t.getMonth() - 2, 1), pt: eod(new Date(t.getFullYear(), t.getMonth() - 1, 0)) }; }
    case "quarter": { const q = Math.floor(t.getMonth() / 3) * 3; const f = new Date(t.getFullYear(), q, 1); return { from: f, to: now, pf: monthBack(f, 3), pt: eod(monthBack(t, 3)) }; }
    case "year": { const f = new Date(t.getFullYear(), 0, 1); return { from: f, to: now, pf: new Date(t.getFullYear() - 1, 0, 1), pt: eod(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate())) }; }
    case "lyear": return { from: new Date(t.getFullYear() - 1, 0, 1), to: eod(new Date(t.getFullYear() - 1, 11, 31)), pf: new Date(t.getFullYear() - 2, 0, 1), pt: eod(new Date(t.getFullYear() - 2, 11, 31)) };
    default: {
      const f = sod(custom.from), e = eod(custom.to); const len = Math.max(1, Math.round((e - f) / DAY_MS));
      return { from: f, to: e, pf: addD(f, -len), pt: new Date(e.getTime() - len * DAY_MS) };
    }
  }
}

function mgAgg(from, to, f = {}) {
  const a = { rev: 0, cost: 0, ret: 0, plan: 0, vPlan: 0, vFact: 0, vEff: 0, newCl: 0, km: 0, sku: 0, skuPlan: 0, cash: 0, days: 0 };
  const fs = from.getTime(), ts = to.getTime();
  for (const x of MG.facts) {
    if (x.t < fs || x.t > ts) continue;
    if (f.tp && x.tp !== f.tp) continue;
    if (f.sv && MG.tpById[x.tp].sv !== f.sv) continue;
    a.rev += x.rev; a.cost += x.cost; a.ret += x.ret; a.plan += x.plan; a.vPlan += x.vPlan; a.vFact += x.vFact; a.vEff += x.vEff;
    a.newCl += x.newCl; a.km += x.km; a.sku += x.sku; a.skuPlan += x.skuPlan; a.cash += x.cash;
  }
  a.netRev = a.rev - a.ret;
  a.cogs = a.rev ? a.cost * (a.netRev / a.rev) : 0;
  a.gross = a.netRev - a.cogs;
  a.margin = pctOf(a.gross, a.netRev);
  a.opexBy = MG.EXP.map(([k]) => [k, 0]);
  const endT = Math.min(ts, Date.now());
  for (let d = sod(from); d.getTime() <= endT; d = addD(d, 1)) {
    a.days++;
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    MG.EXP.forEach(([, m], i) => { a.opexBy[i][1] += m / dim; });
  }
  a.opex = a.opexBy.reduce((s, x) => s + x[1], 0);
  a.ebitda = a.gross - a.opex;
  a.tax = Math.max(0, a.ebitda * 0.2);
  a.net = a.ebitda - a.tax;
  a.netMargin = pctOf(a.net, a.netRev);
  a.planPct = pctOf(a.netRev, a.plan);
  a.effPct = pctOf(a.vEff, a.vFact);
  a.routePct = pctOf(a.vFact, a.vPlan);
  a.retPct = pctOf(a.ret, a.rev);
  a.avgCheck = a.vEff ? a.netRev / a.vEff : 0;
  return a;
}

function mgSeries(from, to, f) {
  const days = Math.max(1, Math.round((Math.min(to, Date.now()) - from) / DAY_MS) + 1);
  const step = days <= 31 ? 1 : days <= 120 ? 7 : 30;
  const out = [];
  for (let d = sod(from); d.getTime() <= Math.min(to.getTime(), Date.now()); d = addD(d, step)) {
    const e = eod(addD(d, step - 1));
    const a = mgAgg(d, e > to ? to : e, f);
    out.push({ label: step === 30 ? String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getFullYear()).slice(2) : d.getDate() + "." + String(d.getMonth() + 1).padStart(2, "0"), v: a.netRev });
  }
  return out;
}

const DEFAULT_WEIGHTS = { plan: 35, visit: 20, route: 15, ret: 10, debt: 10, sku: 5, disc: 5 };
function tpScore(tp, a, w) {
  const debtCl = MG.clients.filter((c) => c.tp === tp.id);
  const debtOk = debtCl.length ? debtCl.filter((c) => c.overdue <= 7).length / debtCl.length : 1;
  const parts = {
    plan: Math.min(1, a.planPct / 100), visit: Math.min(1, a.effPct / 80), route: Math.min(1, a.routePct / 100),
    ret: Math.max(0, 1 - a.retPct / 5), debt: debtOk, sku: Math.min(1, a.skuPlan ? a.sku / a.skuPlan : 0), disc: tp.discipline,
  };
  const total = Object.values(w).reduce((s, x) => s + Number(x), 0) || 1;
  const score = Object.keys(w).reduce((s, k) => s + parts[k] * Number(w[k]), 0) / total * 100;
  return { score: Math.round(score), parts };
}

function agingBuckets(list) {
  const b = [["В срок", 0, 0], ["1–7 дней", 1, 7], ["8–14 дней", 8, 14], ["15–30 дней", 15, 30], ["31–60 дней", 31, 60], ["60+ дней", 61, 9999]];
  return b.map(([label, lo, hi]) => ({ label, sum: list.filter((c) => c.debt && c.overdue >= lo && c.overdue <= hi).reduce((s, c) => s + c.debt, 0) }));
}

function stockView(warehouse) {
  return warehouse.map((p) => {
    const m = MG.prodMeta[p.id] || { cost: Math.round(p.price * 0.78), avgDaily: 2, lastMove: 0, inQ: 0, outQ: 0, retQ: 0, brak: 0, wo: 0, peresort: 0, expiring: 0 };
    const cover = m.avgDaily ? Math.floor(p.stock / m.avgDaily) : 999;
    return { ...p, ...m, cover, sumSale: p.stock * p.price, sumCost: p.stock * m.cost };
  });
}

function mgProblems(role, warehouse) {
  const now = new Date();
  const m = mgAgg(new Date(now.getFullYear(), now.getMonth(), 1), now);
  const list = [];
  const fin = MG_ROLES[role].fin;
  if (m.planPct < 95) list.push({ lvl: "red", text: "Отставание от плана продаж: выполнено " + fp(m.planPct), tab: "sales", who: ["owner", "director", "supervisor"] });
  const lm = mgAgg(new Date(now.getFullYear(), now.getMonth() - 1, 1), eod(new Date(now.getFullYear(), now.getMonth(), 0)));
  if (m.retPct > lm.retPct) list.push({ lvl: "yellow", text: "Рост возвратов: " + fp(m.retPct) + " против " + fp(lm.retPct) + " в прошлом месяце", tab: "sales", who: ["owner", "director", "supervisor"] });
  const over60 = MG.clients.filter((c) => c.overdue > 60);
  if (over60.length) list.push({ lvl: "red", text: "Просрочка более 60 дней — клиентов: " + over60.length + ", сумма " + shortMoney(over60.reduce((s, c) => s + c.debt, 0)), tab: "clients", who: ["owner", "director", "supervisor", "accountant", "financier"] });
  const late = MG.clients.filter((c) => c.overdue > 14 && c.overdue <= 60);
  if (late.length) list.push({ lvl: "yellow", text: "Задержка оплаты 15–60 дней — клиентов: " + late.length, tab: "clients", who: ["owner", "director", "supervisor", "accountant", "financier", "tp"] });
  MG.tps.forEach((tp) => { if (tp.routeAdh < 0.8) list.push({ lvl: "yellow", text: tp.name + ": выполнение маршрута ниже 80%", tab: "team", who: ["owner", "director", "supervisor"] }); });
  const lostDr = FLEET.filter((d) => d.lostSignal);
  if (lostDr.length) list.push({ lvl: "red", text: "Экспедитор без сигнала GPS более 5 мин: " + lostDr.map((d) => d.name).join(", "), tab: "fleet", who: ["owner", "director"] });
  list.push({ lvl: "yellow", text: "Незавершённые доставки: " + MG.deliveries.filter((d) => !["Доставлен", "Закрыт"].includes(d.status)).length, tab: "home", who: ["owner", "director", "driver"] });
  const sv = stockView(warehouse);
  const low = sv.filter((p) => p.cover < 7);
  if (low.length) list.push({ lvl: "red", text: "Низкий остаток (меньше 7 дней продаж): " + low.length + " SKU", tab: "stock", who: ["owner", "director", "warehouse"] });
  const dead = sv.filter((p) => p.lastMove >= 30);
  if (dead.length) list.push({ lvl: "yellow", text: "Dead stock (нет движения 30+ дней): " + dead.length + " SKU", tab: "stock", who: ["owner", "director", "warehouse"] });
  if (m.margin < 21) list.push({ lvl: "red", text: "Маржа ниже целевой: " + fp(m.margin), tab: "sales", who: ["owner", "director"] });
  if (fin === "full" && m.netMargin < 5) list.push({ lvl: "red", text: "Чистая рентабельность ниже 5%: " + fp(m.netMargin), tab: "finance", who: ["owner"] });
  if (fin === "full") list.push({ lvl: "green", text: "Валовая прибыль за месяц: " + shortMoney(m.gross), tab: "finance", who: ["owner"] });
  list.push({ lvl: "green", text: "Новых клиентов за месяц: " + m.newCl, tab: "clients", who: ["owner", "director", "supervisor"] });
  return list.filter((p) => p.who.includes(role));
}

