// Тесты TZ_DEBTS_FIX: долг клиента = отгрузки − оплаты; оплаты гасят самые старые отгрузки (FIFO);
// возраст долга и просрочка — только по неоплаченному. Одинаково на Главной, в Клиентах, Команде, Проблемах.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";
import { day } from "./fixtures/sample.js";

let env, api;
const tok = {};
const login = async (l, p) => (await api("POST", "/api/auth/login", { body: { login: l, password: p } })).body.token;
const send = (entity, body) => api("POST", `/api/sync/1c/${entity}`, { agent: true, body });
const range = `from=${day(-6)}&to=${day(0)}`;

before(async () => {
  env = await startEnv();
  api = env.api;
  tok.owner = await login(OWNER.login, OWNER.password);
  await api("POST", "/api/users", { token: tok.owner, body: { login: "zhas", name: "Жасулан", role: "tp", password: "Passw0rd1", manager1c: "Жасулан" } });
  tok.zhas = await login("zhas", "Passw0rd1");
  await send("clients", { rows: [
    { code: "К-1", name: "Маг Азат", manager: "Жасулан" },     // пример из ТЗ
    { code: "К-2", name: "Маг Айда", manager: "Жасулан" },     // переплата — долга нет
    { code: "К-3", name: "Маг Акенже", manager: "Жасулан" },   // начальный остаток гасится первым
    { code: "К-4", name: "Маг Береке", manager: "Другой ТП" },
  ] });
  const r = await send("debts", { rows: [
    // К-1: отгрузки 100 000 (40 дн.), 50 000 (25 дн.), 30 000 (5 дн.); оплаты −120 000 отдельными документами
    { client: "К-1", docDate: day(-40), docName: "Реализация 1", amount: 100000 },
    { client: "К-1", docDate: day(-25), docName: "Реализация 2", amount: 50000 },
    { client: "К-1", docDate: day(-5), docName: "Реализация 3", amount: 30000 },
    { client: "К-1", docDate: day(-20), docName: "ПКО 11", amount: -70000 },
    { client: "К-1", docDate: day(-3), docName: "ПКО 12", amount: -50000 },
    // К-2: отгрузка 20 000, оплата 25 000 — переплата
    { client: "К-2", docDate: day(-30), docName: "Реализация 4", amount: 20000 },
    { client: "К-2", docDate: day(-2), docName: "ПКО 13", amount: -25000 },
    // К-3: начальный остаток 10 000 без документа + отгрузка 8 000 (3 дн.); оплата 12 000
    { client: "К-3", docDate: null, docName: "", amount: 10000 },
    { client: "К-3", docDate: day(-3), docName: "Реализация 5", amount: 8000 },
    { client: "К-3", docDate: day(-1), docName: "ПКО 14", amount: -12000 },
    // К-4: без оплат, 60 дней
    { client: "К-4", docDate: day(-60), docName: "Реализация 6", amount: 7000 },
  ] });
  assert.equal(r.status, 200, r.raw);
});
after(async () => { await env?.stop(); });

test("неоплаченные части документов: оплаты гасят самые старые отгрузки", async () => {
  const { rows } = await env.pool.query("SELECT client_code, doc_name, amount::float AS amount FROM onec_debts_open ORDER BY client_code, doc_name");
  assert.deepEqual(rows.map((r) => [r.client_code, r.doc_name, r.amount]), [
    ["К-1", "Реализация 2", 30000], // 100 000 и 20 000 из 50 000 погашены
    ["К-1", "Реализация 3", 30000],
    ["К-3", "Реализация 5", 6000], // начальный остаток погашен первым
    ["К-4", "Реализация 6", 7000],
  ]);
});

test("Клиенты: долг = отгрузки − оплаты, переплата — без долга, возраст по неоплаченному", async () => {
  const c = await api("GET", `/api/clients?${range}`, { token: tok.owner });
  assert.equal(c.status, 200, c.raw);
  const by = Object.fromEntries(c.body.items.map((x) => [x.code, x]));
  assert.equal(by["К-1"].debt, 60000);
  assert.equal(by["К-1"].overdue, 30000, "просрочено только то, что старше 14 дней и не оплачено");
  assert.equal(by["К-2"].debt, 0, "переплата — долга нет");
  assert.equal(by["К-3"].debt, 6000);
  assert.equal(by["К-3"].overdue, 0, "начальный остаток погашен — просрочки нет");
  assert.equal(c.body.summary.debt, 73000);
  const ag = c.body.summary.aging;
  assert.equal(ag.reduce((s, x) => s + x.amount, 0), 73000, "сумма по возрасту = долгу");
  assert.ok(!ag.some((x) => /без документа/.test(x.label)), "начальный остаток погашен");
});

test("Главная, Команда, Проблемы — те же суммы", async () => {
  const d = await api("GET", `/api/dashboard?${range}`, { token: tok.owner });
  assert.equal(d.body.debts.total, 73000);
  assert.equal(d.body.debts.overdue, 37000);
  assert.equal(d.body.debts.clients, 3);
  const t = await api("GET", `/api/team?${range}`, { token: tok.owner });
  const zh = t.body.items.find((x) => x.name === "Жасулан" || x.manager === "Жасулан");
  assert.ok(zh, JSON.stringify(t.body.items.map((x) => x.name || x.manager)));
  assert.equal(zh.debt, 66000, "ТП: сумма его клиентов");
  assert.equal(zh.overdue, 30000);
  const p = await api("GET", "/api/problems", { token: tok.owner });
  assert.match(p.body.items.find((x) => x.code === "overdue").title, /37 000/);
  const my = await api("GET", `/api/clients?${range}`, { token: tok.zhas });
  assert.equal(my.body.summary.debt, 66000, "ТП видит долг своих клиентов");
});
