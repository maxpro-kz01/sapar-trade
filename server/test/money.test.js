// Тесты ТЗ финансов v1.2: ТП клиентов из мобильного агента (E), долги без документа (F),
// деньги, движение по статьям, расходы и чистая прибыль (B).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";
import { sample, day } from "./fixtures/sample.js";

let env, api, defaultGroup;
const tok = {};
const login = async (l, p) => (await api("POST", "/api/auth/login", { body: { login: l, password: p } })).body.token;
const send = (entity, body) => api("POST", `/api/sync/1c/${entity}`, { agent: true, body });
const range = `from=${day(-6)}&to=${day(0)}`;

const clients = [
  { code: "К-001", name: "Магазин «Айгерим»", manager: "" },
  { code: "К-002", name: "Магазин «Береке»", manager: "" },
  { code: "К-003", name: "Магазин «Самал»", manager: "" },
  { code: "К-004", name: "Магазин «Нур»", manager: "Директор Сам" }, // менеджер из карточки 1С главнее
  { code: "К-005", name: "Магазин «Дана»", manager: "" },
];
const agents = [
  { client: "К-001", agent: "Сулейменова Аида Сериковна", source: "agent", docs: 5, lastDay: day(-3) },
  { client: "К-001", agent: "Эрматұлы Жұмабек ", source: "agent", docs: 2, lastDay: day(-1) },
  { client: "К-002", agent: "Эрматұлы  Жұмабек", source: "agent", docs: 3, lastDay: day(-10) }, // ничья по документам —
  { client: "К-002", agent: "Сулейменова Аида Сериковна", source: "agent", docs: 3, lastDay: day(-2) }, // побеждает последний
  { client: "К-003", agent: "сулейменова аида сериковна", source: "contract", docs: 0 }, // договор назван именем ТП
  { client: "К-004", agent: "Эрматұлы Жұмабек", source: "agent", docs: 9, lastDay: day(-1) },
  { client: "К-005", agent: "бд", source: "contract", docs: 0 }, // договор не похож на ТП
  { client: "К-005", agent: "", source: "agent", docs: 4, lastDay: day(-1) }, // пустой агент — пропускаем
];

before(async () => {
  env = await startEnv();
  api = env.api;
  ({ defaultGroup } = await import("../src/services/money.js"));
  tok.owner = await login(OWNER.login, OWNER.password);
  const mk = async (l, role, m) => {
    await api("POST", "/api/users", { token: tok.owner, body: { login: l, name: l, role, password: "Passw0rd1", manager1c: m } });
    tok[l] = await login(l, "Passw0rd1");
  };
  await mk("aida", "tp", "Сулейменова Аида Сериковна");
  await mk("dir", "director"); await mk("buh", "accountant"); await mk("adm", "admin"); await mk("sklad", "warehouse");
  for (const e of ["products", "warehouses", "prices", "stock"]) await send(e, { rows: sample[e] });
  await send("clients", { rows: clients });
  for (const e of ["sales", "cost"]) await send(e, { from: day(-5), to: day(0), rows: sample[e] });
});
after(async () => { await env?.stop(); });

const managers = async () => Object.fromEntries((await env.pool.query("SELECT code, manager FROM onec_clients")).rows.map((r) => [r.code, r.manager]));

// ---------- E. ТП клиентов ----------
test("ТП клиента: больше реализаций, при равенстве — последняя; договор; карточка 1С главнее", async () => {
  const r = await send("client_agents", { rows: agents });
  assert.equal(r.status, 200, r.raw);
  assert.equal(r.body.rows, 7, "пустой агент пропущен");
  const m = await managers();
  assert.equal(m["К-001"], "Сулейменова Аида Сериковна");
  assert.equal(m["К-002"], "Сулейменова Аида Сериковна", "ничья → у кого последняя реализация");
  assert.equal(m["К-003"], "Сулейменова Аида Сериковна", "по имени договора, без учёта регистра");
  assert.equal(m["К-004"], "Директор Сам");
  assert.equal(m["К-005"], null);
});

test("ТП клиента сохраняется после новой загрузки клиентов", async () => {
  await send("clients", { rows: clients });
  assert.equal((await managers())["К-001"], "Сулейменова Аида Сериковна");
});

test("список ТП из 1С для выбора при создании сотрудника", async () => {
  const r = await api("GET", "/api/users/agents-1c", { token: tok.owner });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.map((x) => x.name), ["Директор Сам", "Сулейменова Аида Сериковна"]);
  assert.equal(r.body[1].clients, 3);
  assert.equal((await api("GET", "/api/users/agents-1c", { token: tok.aida })).status, 403);
});

test("ТП видит своих клиентов по мобильному агенту", async () => {
  const r = await api("GET", "/api/clients", { token: tok.aida });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.items.map((x) => x.code).sort(), ["К-001", "К-002", "К-003"]);
});

// ---------- F. Долги без документа ----------
test("долг без документа — просрочен и в отдельной группе возраста", async () => {
  await send("debts", { rows: [
    { client: "К-001", docDate: day(-2), docName: "Реализация 1", amount: 10000 },
    { client: "К-001", docDate: day(-45), docName: "Реализация 2", amount: 20000 },
    { client: "К-002", docDate: day(-100), docName: "Реализация 3", amount: 30000 },
    { client: "К-003", docDate: null, docName: "", amount: 40000 },
  ] });
  const d = await api("GET", `/api/dashboard?${range}`, { token: tok.owner });
  assert.equal(d.body.debts.overdue, 90000, "45 и 100 дней + без документа");
  const c = await api("GET", `/api/clients?${range}`, { token: tok.owner });
  const ag = Object.fromEntries(c.body.summary.aging.map((x) => [x.label, x.amount]));
  assert.equal(ag["0–7 дней"], 10000);
  assert.equal(ag["31–60 дней"], 20000);
  assert.equal(ag["больше 90 дней"], 30000);
  assert.equal(ag["без документа (старые)"], 40000);
  const p = await api("GET", "/api/problems", { token: tok.owner });
  assert.ok(p.body.items.some((x) => x.code === "overdue" && x.lvl === "red"));
});

// ---------- B. Деньги ----------
test("группы статей по умолчанию", () => {
  assert.equal(defaultGroup("Деньги в пути ", "Выбытие", true, true), "transfer");
  assert.equal(defaultGroup("Зачисление кассовой выручки на расчетный счет", "Выбытие", false, true), "transfer");
  assert.equal(defaultGroup("Поступление денежных средств с расчетного счета", "Поступление", true, false), "transfer");
  assert.equal(defaultGroup("Оплата поставщику", "Выбытие", false, true), "supplier");
  assert.equal(defaultGroup("Погашение займов", "Выбытие", false, true), "loan");
  assert.equal(defaultGroup("1Оплата покупателя", "Поступление", true, false), "customer");
  assert.equal(defaultGroup("Оплата платежной картой", "Поступление", true, false), "customer");
  assert.equal(defaultGroup("Расходы Сапар", "Выбытие", false, true), "expense");
  assert.equal(defaultGroup("ГСМ", null, false, true), "expense");
  assert.equal(defaultGroup("Возврат денежных средств подотчетником", "Поступление", true, false), "income_other");
  assert.equal(defaultGroup("", null, true, true), "none");
});

const FLOW = [
  { dt: day(-1), account: "Основная касса", article: "1Оплата покупателя", dir: "Приход", amount: 500000 },
  { dt: day(0), account: "Сапар трейд касспий", article: "1Оплата покупателя", dir: "Приход", amount: 300000 },
  { dt: day(-1), account: "Сапар трейд касспий", article: "Оплата поставщику", dir: "Расход", amount: 400000 },
  { dt: day(-1), account: "Основная касса", article: "Деньги в пути ", dir: "Расход", amount: 200000 },
  { dt: day(-1), account: "Сапар трейд касспий", article: "Деньги в пути", dir: "Приход", amount: 200000 },
  { dt: day(-1), account: "Основная касса", article: "Выплаты по заработной плате", dir: "Расход", amount: 30000 },
  { dt: day(0), account: "Основная касса", article: "Расходы Сапар", dir: "Расход", amount: 15000 },
  { dt: day(0), account: "Основная касса", article: "ГСМ", dir: "Расход", amount: 6000 },
  { dt: day(0), account: "Основная касса", article: "ГСМ", dir: "Приход", amount: 1000 }, // возврат по статье расходов
  { dt: day(0), account: "Основная касса", article: "Новая статья", dir: "Расход", amount: 2000 },
  { dt: day(0), account: "Основная касса", article: "", dir: "Расход", amount: 700 },
];

test("загрузка денег: остатки, статьи, движение", async () => {
  assert.equal((await send("cash", { rows: [
    { account: "Основная касса", kind: "Наличные", amount: -26856049.51 },
    { account: "Сапар трейд касспий", kind: "Безналичные", amount: 13272017.1 },
    { account: "Депозит ИП Сапар", kind: "Безналичные", amount: 6711556 },
  ] })).status, 200);
  assert.equal((await send("cf_articles", { rows: [
    { name: "1Оплата покупателя", kind: "Поступление", activity: "Операционная деятельность" },
    { name: "Оплата поставщику", kind: "Выбытие" }, { name: "Деньги в пути ", kind: "Выбытие" },
    { name: "Выплаты по заработной плате", kind: "Выбытие" }, { name: "Расходы Сапар", kind: "Выбытие" }, { name: "ГСМ", kind: "Выбытие" },
  ] })).status, 200);
  const bad = await send("cashflow", { from: day(-6), to: day(0), rows: [{ dt: day(-20), account: "К", article: "ГСМ", dir: "Расход", amount: 1 }] });
  assert.equal(bad.status, 400, "строка вне периода");
  assert.equal((await send("cashflow", { from: day(-6), to: day(0), rows: [{ dt: day(0), account: "К", article: "ГСМ", dir: "Туда", amount: 1 }] })).status, 400);
  const r = await send("cashflow", { from: day(-6), to: day(0), rows: FLOW });
  assert.equal(r.status, 200, r.raw);
  const g = Object.fromEntries((await env.pool.query("SELECT article, grp FROM cf_article_groups")).rows.map((x) => [x.article, x.grp]));
  assert.deepEqual(g, { "1Оплата покупателя": "customer", "Оплата поставщику": "supplier", "Деньги в пути": "transfer",
    "Выплаты по заработной плате": "expense", "Расходы Сапар": "expense", "ГСМ": "expense", "Новая статья": "expense", "": "none" });
});

test("деньги: владелец и бухгалтер видят всё, директор — только поступления", async () => {
  const o = await api("GET", `/api/money?${range}`, { token: tok.owner });
  assert.equal(o.status, 200, o.raw);
  assert.equal(o.body.balances.accounts.length, 3);
  assert.equal(o.body.balances.negative, 1);
  assert.equal(o.body.balances.total, Math.round((-26856049.51 + 13272017.1 + 6711556) * 100) / 100);
  assert.equal(o.body.received.total, 800000);
  assert.equal(o.body.flow.in, 801000, "переводы между счетами не считаются");
  assert.equal(o.body.flow.out, 453700);
  assert.equal(o.body.flow.transfers, 200000);
  assert.equal(o.body.flow.daily.reduce((s, d) => s + d.out, 0), 453700);
  assert.equal(o.body.flow.byGroup.find((x) => x.grp === "expense").out, 53000);

  const b = await api("GET", `/api/money?${range}`, { token: tok.buh });
  assert.equal(b.status, 200);
  assert.ok(b.body.balances && b.body.flow);
  const d = await api("GET", `/api/money?${range}`, { token: tok.dir });
  assert.equal(d.status, 200);
  assert.equal(d.body.received.total, 800000);
  assert.equal(d.body.balances, undefined);
  assert.equal(d.body.flow, undefined);
  for (const u of ["aida", "sklad", "adm"]) assert.equal((await api("GET", `/api/money?${range}`, { token: tok[u] })).status, 403, u);
});

test("P&L: расходы и чистая прибыль (только владелец)", async () => {
  const f = await api("GET", `/api/finance?${range}`, { token: tok.owner });
  assert.equal(f.status, 200, f.raw);
  // валовая: выручка 78000 − себестоимость 59000 = 19000; расходы 30000+15000+6000−1000+2000 = 52000
  assert.equal(f.body.totals.gross, 19000);
  assert.equal(f.body.totals.expenses, 52000);
  assert.equal(f.body.totals.net, -33000);
  assert.equal(f.body.expenses[0].article, "Выплаты по заработной плате");
  assert.equal(f.body.months.length, 6);
  assert.equal(f.body.months.at(-1).expenses, 52000);
  assert.equal(f.body.notYet, undefined);
  for (const u of ["dir", "buh"]) assert.equal((await api("GET", `/api/finance?${range}`, { token: tok[u] })).status, 403, u);
});

test("статьи: владелец меняет группу, повторная загрузка её не сбрасывает", async () => {
  const l = await api("GET", "/api/cf-articles", { token: tok.owner });
  assert.equal(l.status, 200);
  const n = l.body.items.find((x) => x.article === "Новая статья");
  assert.equal(n.isNew, true);
  assert.equal(n.out30, 2000);
  assert.equal((await api("PUT", "/api/cf-articles", { token: tok.dir, body: { article: "Расходы Сапар", grp: "loan" } })).status, 403);
  assert.equal((await api("PUT", "/api/cf-articles", { token: tok.owner, body: { article: "Расходы Сапар", grp: "плохая" } })).status, 400);
  assert.equal((await api("PUT", "/api/cf-articles", { token: tok.owner, body: { article: "Нет такой", grp: "loan" } })).status, 404);
  const p = await api("PUT", "/api/cf-articles", { token: tok.owner, body: { article: "Новая статья", grp: "loan" } });
  assert.equal(p.status, 200);
  await send("cashflow", { from: day(-6), to: day(0), rows: FLOW });
  await send("cf_articles", { rows: [{ name: "Новая статья", kind: "Выбытие" }] });
  const f = await api("GET", `/api/finance?${range}`, { token: tok.owner });
  assert.equal(f.body.totals.expenses, 50000, "статья ушла из расходов");
  const after = (await api("GET", "/api/cf-articles", { token: tok.owner })).body.items.find((x) => x.article === "Новая статья");
  assert.equal(after.grp, "loan");
  assert.equal(after.manual, true);
});

test("статус синхронизации: новые выгрузки не делают данные «устаревшими»", async () => {
  const s = await api("GET", "/api/sync/status", { token: tok.owner });
  const ca = s.body.items.find((x) => x.entity === "client_agents");
  assert.ok(ca.lastOk);
});
