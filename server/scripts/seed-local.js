// Наполнить локальный сервер (npm run dev:local) правдоподобными данными «как из 1С» и создать сотрудников.
//   node scripts/seed-local.js [http://127.0.0.1:3999]
const B = process.argv[2] || "http://127.0.0.1:3999";
const K = "test-agent-key-0123456789";
const day = (o) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + o); return d.toISOString().slice(0, 10); };
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const names = [["Мука", "Цесна 50 кг"], ["Масло", "подсолнечное 5 л"], ["Сахар", "песок 50 кг"], ["Чай", "Пиала 250 г"], ["Порошок", "стиральный 3 кг"], ["Мыло", "хозяйственное"], ["Рис", "Кызылординский 25 кг"], ["Макароны", "Султан 5 кг"]];
const prods = Array.from({ length: 40 }, (_, i) => ({ code: String(i + 1).padStart(5, "0"), name: names[i % 8].join(" ") + " №" + (i + 1), group: i % 8 < 4 || i % 8 > 5 ? "Бакалея" : "Бытовая химия", unit: "шт", sku: "48700" + i }));
const shops = ["Айгерим", "Береке", "Самал", "Нур", "Жулдыз", "Арман", "Дана", "Асем"];
const clients = Array.from({ length: 25 }, (_, i) => ({ code: "К-" + String(i + 1).padStart(3, "0"), name: `Магазин «${shops[i % 8]}» ${i + 1}`, manager: i % 3 === 0 ? "Иванов Пётр" : "Ахметов Ержан", phone: "+7 701 000 00 " + String(i).padStart(2, "0"), address: "Кызылорда" }));
const sales = [], cost = [];
for (let d = -40; d <= 0; d++) for (let k = 0; k < 12; k++) {
  const p = prods[Math.floor(rnd() * prods.length)], c = clients[Math.floor(rnd() * clients.length)];
  const q = 1 + Math.floor(rnd() * 10), price = 1500 + Math.floor(rnd() * 12000);
  sales.push({ dt: day(d), product: p.code, client: c.code, qty: q, revenue: q * price });
  cost.push({ dt: day(d), product: p.code, qty: q, cost: Math.round(q * price * (0.7 + rnd() * 0.15)) });
}
const post = async (e, body) => {
  const r = await fetch(B + "/api/sync/1c/" + e, { method: "POST", headers: { "content-type": "application/json", "x-agent-key": K, "x-agent-host": "srv1c" }, body: JSON.stringify(body) });
  console.log(e.padEnd(11), r.status, (await r.text()).slice(0, 70));
};
await post("products", { rows: prods });
await post("warehouses", { rows: [{ code: "000000001", name: "Главный склад" }, { code: "000000002", name: "Шугыла" }, { code: "000000003", name: "Тасбогет" }] });
await post("clients", { rows: clients });
await post("prices", { rows: prods.map((p, i) => ({ product: p.code, priceType: "Оптовая", price: 1500 + i * 300 })).filter((_, i) => i !== 5) });
await post("stock", { rows: prods.flatMap((p, i) => [{ warehouse: "000000001", product: p.code, qty: ((i * 7) % 60) - 3 }, { warehouse: "00000000" + (2 + (i % 2)), product: p.code, qty: (i * 3) % 25 }]) });
await post("debts", { rows: clients.slice(0, 15).map((c, i) => ({ client: c.code, docDate: day(-(i * 3)), docName: "Реализация товаров 000" + i, amount: 20000 + i * 15000 })) });
await post("sales", { from: day(-40), to: day(0), rows: sales });
await post("cost", { from: day(-40), to: day(0), rows: cost });
// ТЗ финансов v1.2: ТП клиентов из мобильного агента, деньги и движение по статьям
await post("client_agents", { rows: clients.map((c, i) => ({ client: c.code, agent: i % 3 === 0 ? "Иванов Пётр" : "Ахметов Ержан", source: 1, docs: 3 + (i % 4), lastDay: day(-(i % 9)) })) });
await post("cash", { rows: [
  { account: "Основная касса", kind: "Наличные", amount: -2685604.51 }, { account: "Сапар трейд касспий", kind: "Безналичные", amount: 13272017.1 },
  { account: "Народный Банк", kind: "Безналичные", amount: 1650225.02 }, { account: "Депозит ИП Сапар", kind: "Безналичные", amount: 6711556 },
] });
const arts = [["1Оплата покупателя", "Поступление"], ["Оплата платежной картой", "Поступление"], ["Оплата поставщику", "Выбытие"], ["Деньги в пути", "Выбытие"],
  ["Выплаты по заработной плате", "Выбытие"], ["Расходы Сапар", "Выбытие"], ["ГСМ", "Выбытие"], ["Доставка", "Выбытие"], ["Ремонт машины", "Выбытие"], ["Услуги связи", "Выбытие"]];
await post("cf_articles", { rows: arts.map(([name, kind]) => ({ name, kind, activity: "Операционная деятельность" })) });
const flow = [];
for (let d = -40; d <= 0; d++) {
  flow.push({ dt: day(d), account: "Основная касса", article: "1Оплата покупателя", dir: "Приход", amount: 400000 + Math.round(rnd() * 300000) });
  flow.push({ dt: day(d), account: "Сапар трейд касспий", article: "Оплата платежной картой", dir: "Приход", amount: 200000 + Math.round(rnd() * 200000) });
  flow.push({ dt: day(d), account: "Сапар трейд касспий", article: "Оплата поставщику", dir: "Расход", amount: 450000 + Math.round(rnd() * 250000) });
  flow.push({ dt: day(d), account: "Основная касса", article: "Деньги в пути", dir: "Расход", amount: 150000 });
  flow.push({ dt: day(d), account: "Сапар трейд касспий", article: "Деньги в пути", dir: "Приход", amount: 150000 });
  flow.push({ dt: day(d), account: "Основная касса", article: "ГСМ", dir: "Расход", amount: 15000 + Math.round(rnd() * 10000) });
  if (d % 7 === 0) flow.push({ dt: day(d), account: "Основная касса", article: "Расходы Сапар", dir: "Расход", amount: 120000 });
  if (d % 15 === 0) flow.push({ dt: day(d), account: "Основная касса", article: "Выплаты по заработной плате", dir: "Расход", amount: 900000 });
  if (d % 5 === 0) flow.push({ dt: day(d), account: "Основная касса", article: "Доставка", dir: "Расход", amount: 60000 });
  if (d % 10 === 0) flow.push({ dt: day(d), account: "Основная касса", article: "Ремонт машины", dir: "Расход", amount: 45000 });
  if (d === -3) flow.push({ dt: day(d), account: "Основная касса", article: "", dir: "Расход", amount: 12000 });
}
await post("cashflow", { from: day(-40), to: day(0), rows: flow });

const login = async (l, p) => (await (await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: l, password: p }) })).json()).token;
const t = await login("owner", "Owner12345");
for (const [l, name, role, manager1c] of [["director", "Директор Асхат", "director"], ["tp1", "Ержан Ахметов", "tp", "Ахметов Ержан"], ["sklad", "Дамир (склад)", "warehouse"], ["adm", "Айгуль (администратор)", "admin"], ["drv1", "Серик Алимов", "driver"], ["drv2", "Бауржан Нуров", "driver"]]) {
  const r = await fetch(B + "/api/users", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + t }, body: JSON.stringify({ login: l, name, role, password: "Passw0rd1", manager1c }) });
  console.log("user", l, r.status);
}
