// Тесты системы управления: команда, план, финансы, проблемы, задачи, возраст долга, неликвид.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";
import { sample, day } from "./fixtures/sample.js";

let env, api;
const tok = {};
const range = `from=${day(-5)}&to=${day(0)}`;
const login = async (l, p) => (await api("POST", "/api/auth/login", { body: { login: l, password: p } })).body.token;

before(async () => {
  env = await startEnv();
  api = env.api;
  tok.owner = await login(OWNER.login, OWNER.password);
  for (const [l, role, m] of [["dir", "director"], ["tp1", "tp", "Ахметов Ержан"], ["sv1", "supervisor", "Ахметов Ержан, Иванов Пётр"], ["sklad", "warehouse"], ["buh", "accountant"]]) {
    await api("POST", "/api/users", { token: tok.owner, body: { login: l, name: l, role, password: "Passw0rd1", manager1c: m } });
    tok[l] = await login(l, "Passw0rd1");
  }
  for (const e of ["products", "warehouses", "clients", "prices", "stock", "debts"]) await api("POST", `/api/sync/1c/${e}`, { agent: true, body: { rows: sample[e] } });
  for (const e of ["sales", "cost"]) await api("POST", `/api/sync/1c/${e}`, { agent: true, body: { from: day(-5), to: day(0), rows: sample[e] } });
});
after(async () => { await env?.stop(); });

test("главная: прошлый период для сравнения", async () => {
  const r = await api("GET", `/api/dashboard?${range}`, { token: tok.owner });
  assert.equal(r.status, 200);
  assert.ok(r.body.prev && r.body.prev.period.to < day(-5));
  assert.equal(r.body.prev.revenue, 0);
});

test("продажи по группам и менеджерам; приблизительная маржа по менеджерам", async () => {
  const g = await api("GET", `/api/sales?group=group&${range}`, { token: tok.owner });
  assert.deepEqual(g.body.items.map((x) => x.name).sort(), ["Бакалея", "Бытовая химия"]);
  const m = await api("GET", `/api/sales?group=manager&${range}`, { token: tok.owner });
  const ah = m.body.items.find((x) => x.name === "Ахметов Ержан");
  assert.equal(ah.revenue, 48000);
  assert.equal(ah.cost, 38000, "себестоимость: 24000 + 14000 по единичной себестоимости");
  assert.equal(m.body.approxCost, true);
  const d = await api("GET", `/api/sales?group=manager&${range}`, { token: tok.dir });
  assert.ok(!/"(cost|gross)"/.test(d.raw) && /"marginPct"/.test(d.raw));
});

test("команда: рейтинг ТП, план и план/факт", async () => {
  const month = day(0).slice(0, 7);
  assert.equal((await api("PUT", "/api/plans", { token: tok.tp1, body: { month, items: [{ manager: "Ахметов Ержан", amount: 1 }] } })).status, 403);
  const s = await api("PUT", "/api/plans", { token: tok.dir, body: { month, items: [{ manager: "Ахметов Ержан", amount: 100000 }, { manager: "Иванов Пётр", amount: 50000 }] } });
  assert.equal(s.status, 200, s.raw);
  assert.equal((await api("PUT", "/api/plans", { token: tok.dir, body: { month, items: [{ manager: "X", amount: -5 }] } })).status, 400);
  const pl = await api("GET", `/api/plans?month=${month}`, { token: tok.owner });
  assert.equal(pl.body.items.find((x) => x.manager === "Ахметов Ержан").amount, 100000);

  const mStart = month + "-01";
  const t = await api("GET", `/api/team?from=${mStart}&to=${day(0)}`, { token: tok.owner });
  assert.equal(t.status, 200, t.raw);
  const ah = t.body.items.find((x) => x.manager === "Ахметов Ержан");
  assert.equal(ah.clientsTotal, 2);
  assert.equal(ah.debt, 150000);
  assert.equal(ah.user.name, "tp1");
  assert.ok(ah.plan > 0 && ah.plan <= 100000);
  assert.ok(ah.gross !== undefined);

  const dt = await api("GET", `/api/team?from=${mStart}&to=${day(0)}`, { token: tok.dir });
  assert.ok(!/"(cost|gross)"/.test(dt.raw) && /"marginPct"/.test(dt.raw));
  const tp = await api("GET", `/api/team?from=${mStart}&to=${day(0)}`, { token: tok.tp1 });
  assert.deepEqual(tp.body.items.map((x) => x.manager), ["Ахметов Ержан"]);
  assert.ok(!/"marginPct"/.test(tp.raw));
  const sv = await api("GET", `/api/team?from=${mStart}&to=${day(0)}`, { token: tok.sv1 });
  assert.equal(sv.status, 200, sv.raw);
  assert.equal(sv.body.items.length, 2);
  assert.equal((await api("GET", `/api/team?${range}`, { token: tok.sklad })).status, 403);
  assert.equal((await api("GET", `/api/team?${range}`, { token: tok.buh })).status, 403);
});

test("финансы: только владелец", async () => {
  const f = await api("GET", `/api/finance?${range}`, { token: tok.owner });
  assert.equal(f.status, 200);
  assert.equal(f.body.totals.gross, 19000);
  assert.ok(f.body.groups.length >= 2);
  for (const u of ["dir", "buh", "tp1", "sklad"]) assert.equal((await api("GET", `/api/finance?${range}`, { token: tok[u] })).status, 403, u);
});

test("клиенты: возраст долга и итоги", async () => {
  const c = await api("GET", `/api/clients?${range}`, { token: tok.owner });
  const a = c.body.summary.aging;
  assert.equal(c.body.summary.debt, 220000);
  assert.equal(a.find((x) => x.label === "0–7 дней").amount, 120000);
  assert.equal(a.find((x) => x.label === "больше 30 дней")?.amount ?? 0, 0);
  assert.equal(a.find((x) => x.label === "15–30 дней").amount, 100000);
  const tp = await api("GET", `/api/clients?${range}`, { token: tok.tp1 });
  assert.equal(tp.body.summary.debt, 150000);
});

test("склад: неликвид и итоги", async () => {
  const s = await api("GET", "/api/stock", { token: tok.sklad });
  assert.equal(s.status, 200);
  assert.equal(s.body.summary.negative, 0);
  assert.ok(s.body.summary.dead.length === 3);
  const d = await api("GET", "/api/stock?dead=60", { token: tok.sklad });
  assert.equal(d.body.items.length, 0, "все товары продавались за последние дни");
});

test("проблемы: по правам роли", async () => {
  const o = await api("GET", "/api/problems", { token: tok.owner });
  assert.equal(o.status, 200);
  assert.ok(o.body.items.some((x) => x.code === "overdue"));
  const sk = await api("GET", "/api/problems", { token: tok.sklad });
  assert.ok(!sk.body.items.some((x) => x.code === "overdue"), "склад не видит дебиторку");
});

test("задачи: создать, назначить, статус, комментарий, видимость", async () => {
  const staff = await api("GET", "/api/staff", { token: tok.dir });
  const tp1 = staff.body.find((x) => x.name === "tp1");
  assert.equal(staff.body[0].login, undefined);
  const c = await api("POST", "/api/tasks", { token: tok.dir, body: { title: "Погасить просрочку «Айгерим»", assigneeId: tp1.id, deadline: day(2), priority: "Высокий" } });
  assert.equal(c.status, 201, c.raw);
  assert.equal((await api("POST", "/api/tasks", { token: tok.dir, body: { title: " " } })).status, 400);
  const mine = await api("GET", "/api/tasks", { token: tok.tp1 });
  assert.equal(mine.body.length, 1);
  assert.equal((await api("GET", "/api/tasks", { token: tok.sklad })).body.length, 0, "чужие задачи не видны");
  assert.equal((await api("PATCH", `/api/tasks/${c.body.id}`, { token: tok.tp1, body: { status: "В работе" } })).status, 200);
  assert.equal((await api("PATCH", `/api/tasks/${c.body.id}`, { token: tok.tp1, body: { title: "другое" } })).status, 403);
  assert.equal((await api("PATCH", `/api/tasks/${c.body.id}`, { token: tok.sklad, body: { status: "Выполнена" } })).status, 404);
  assert.equal((await api("POST", `/api/tasks/${c.body.id}/comments`, { token: tok.tp1, body: { text: "Договорился на пятницу" } })).status, 201);
  const all = await api("GET", "/api/tasks", { token: tok.owner });
  const t = all.body.find((x) => x.id === c.body.id);
  assert.equal(t.status, "В работе");
  assert.equal(t.comments[0].text, "Договорился на пятницу");
});

test("журнал действий — только владелец", async () => {
  assert.equal((await api("GET", "/api/audit", { token: tok.owner })).status, 200);
  assert.equal((await api("GET", "/api/audit", { token: tok.dir })).status, 403);
});
