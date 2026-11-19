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
  for (const [l, role, m] of [["dir", "director"], ["tp1", "tp", "Ахметов Ержан"], ["sv1", "supervisor", "Ахметов Ержан, Иванов Пётр"], ["sklad", "warehouse"], ["buh", "accountant"], ["adm", "admin"], ["drv", "driver"]]) {
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
  assert.ok(/"gross"/.test(d.raw) && /"marginPct"/.test(d.raw), "директор видит и валовую прибыль");
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
  assert.ok(/"gross"/.test(dt.raw) && /"marginPct"/.test(dt.raw));
  const tp = await api("GET", `/api/team?from=${mStart}&to=${day(0)}`, { token: tok.tp1 });
  assert.deepEqual(tp.body.items.map((x) => x.manager), ["Ахметов Ержан"]);
  assert.ok(!/"marginPct"/.test(tp.raw));
  const sv = await api("GET", `/api/team?from=${mStart}&to=${day(0)}`, { token: tok.sv1 });
  assert.equal(sv.status, 200, sv.raw);
  assert.equal(sv.body.items.length, 2);
  assert.equal((await api("GET", `/api/team?${range}`, { token: tok.sklad })).status, 403);
  assert.equal((await api("GET", `/api/team?${range}`, { token: tok.buh })).status, 403);
});

test("личный план ТП: только свой, без чужих и без редактирования", async () => {
  const month = day(0).slice(0, 7);
  await api("PUT", "/api/plans", { token: tok.dir, body: { month, items: [{ manager: "Ахметов Ержан", amount: 100000 }, { manager: "Иванов Пётр", amount: 50000 }] } });
  const mp = await api("GET", "/api/my-plan", { token: tok.tp1 });
  assert.equal(mp.status, 200, mp.raw);
  assert.equal(mp.body.canPick, false);
  assert.equal(mp.body.months.length, 2);
  const cur = mp.body.months[0];
  assert.equal(cur.month, month);
  assert.equal(cur.plan, 100000, "план только Ахметова, без плана Иванова");
  assert.equal(Math.round((cur.done + cur.left - cur.over) * 100) / 100, 100000);
  assert.equal(mp.body.clients.total, 2);
  assert.ok(!/Иванов/.test(mp.raw), "чужой ТП не виден");
  // параметр manager для ТП игнорируется: чужой план получить нельзя
  const peek = await api("GET", "/api/my-plan?manager=" + encodeURIComponent("Иванов Пётр"), { token: tok.tp1 });
  assert.equal(peek.body.months[0].plan, 100000);
  // владелец и директор выбирают ТП
  const own = await api("GET", "/api/my-plan", { token: tok.owner });
  assert.equal(own.body.canPick, true);
  assert.ok(own.body.managers.includes("Иванов Пётр"));
  const iv = await api("GET", "/api/my-plan?manager=" + encodeURIComponent("Иванов Пётр"), { token: tok.dir });
  assert.equal(iv.body.months[0].plan, 50000);
  assert.equal((await api("GET", "/api/my-plan?manager=Нет", { token: tok.dir })).status, 404);
  assert.equal((await api("GET", "/api/my-plan", { token: tok.sklad })).status, 403);
  // план меньше выручки → «сверх плана»
  await api("PUT", "/api/plans", { token: tok.dir, body: { month, items: [{ manager: "Ахметов Ержан", amount: 1 }] } });
  const ov = await api("GET", "/api/my-plan", { token: tok.tp1 });
  assert.equal(ov.body.months[0].left, 0);
});

test("финансы: владелец и директор", async () => {
  const f = await api("GET", `/api/finance?${range}`, { token: tok.owner });
  assert.equal(f.status, 200);
  assert.equal(f.body.totals.gross, 19000);
  assert.ok(f.body.groups.length >= 2);
  assert.equal((await api("GET", `/api/finance?${range}`, { token: tok.dir })).status, 200);
  for (const u of ["buh", "tp1", "sklad"]) assert.equal((await api("GET", `/api/finance?${range}`, { token: tok[u] })).status, 403, u);
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

test("задачи водителю-экспедитору: видит только свою, меняет статус, чужую не видит", async () => {
  const staff = await api("GET", "/api/staff", { token: tok.dir });
  const drv = staff.body.find((x) => x.name === "drv");
  const c = await api("POST", "/api/tasks", { token: tok.dir, body: { title: "Заехать на склад за паллетами", assigneeId: drv.id, priority: "Средний" } });
  assert.equal(c.status, 201, c.raw);
  const mine = await api("GET", "/api/tasks", { token: tok.drv });
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.map((x) => x.id), [c.body.id]);
  assert.equal((await api("GET", "/api/tasks", { token: tok.sklad })).body.some((x) => x.id === c.body.id), false);
  assert.equal((await api("PATCH", `/api/tasks/${c.body.id}`, { token: tok.drv, body: { status: "Выполнена" } })).status, 200);
  assert.equal((await api("POST", "/api/tasks", { token: tok.drv, body: { title: "сам себе" } })).status, 403, "водитель задач не ставит");
});

test("задачи: ставят владелец, директор и администратор — друг другу и всем; остальные только исполняют", async () => {
  const staff = (await api("GET", "/api/staff", { token: tok.owner })).body;
  const id = (n) => (n === "owner" ? staff.find((x) => x.role === "owner") : staff.find((x) => x.name === n)).id;
  const mk = (who, to) => api("POST", "/api/tasks", { token: tok[who], body: { title: `от ${who} для ${to}`, assigneeId: id(to) } });
  for (const [a, b] of [["owner", "adm"], ["owner", "dir"], ["dir", "adm"], ["adm", "dir"], ["adm", "owner"], ["dir", "owner"], ["adm", "tp1"]])
    assert.equal((await mk(a, b)).status, 201, `${a} -> ${b}`);
  for (const w of ["tp1", "sv1", "sklad", "buh"]) assert.equal((await mk(w, "tp1")).status, 403, `${w} не должен ставить задачи`);
  const seen = await api("GET", "/api/tasks", { token: tok.adm });
  assert.ok(seen.body.some((t) => t.title === "от dir для adm") && !seen.body.some((t) => t.title === "от owner для dir"), "оператор видит только свои задачи (поставленные им и ему), чужие — нет");
});

test("журнал действий — владелец и директор", async () => {
  assert.equal((await api("GET", "/api/audit", { token: tok.owner })).status, 200);
  assert.equal((await api("GET", "/api/audit", { token: tok.dir })).status, 200);
  assert.equal((await api("GET", "/api/audit", { token: tok.buh })).status, 403);
});
