// Сквозные тесты API на настоящем PostgreSQL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";
import { sample, day } from "./fixtures/sample.js";

let env, api, ownerToken;
const tokens = {};
const range = { from: day(-5), to: day(0) };

before(async () => {
  try { env = await startEnv(); } catch (e) { console.error("startEnv:", e); throw e; }
  api = env.api;
});
after(async () => { await env?.stop(); });

const login = async (login, password) => (await api("POST", "/api/auth/login", { body: { login, password } })).body.token;

test("health", async () => {
  const r = await api("GET", "/api/health");
  assert.equal(r.status, 200);
});

test("вход: неверный пароль → 401, верный → токен, /me", async () => {
  assert.equal((await api("POST", "/api/auth/login", { body: { login: "owner", password: "nope12345" } })).status, 401);
  assert.equal((await api("POST", "/api/auth/login", { body: { login: "ghost", password: "nope12345" } })).status, 401);
  const r = await api("POST", "/api/auth/login", { body: OWNER });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, "owner");
  ownerToken = r.body.token;
  const me = await api("GET", "/api/auth/me", { token: ownerToken });
  assert.equal(me.body.user.login, "owner");
  assert.ok(me.body.perms.includes("gross"));
  assert.equal(me.body.user.password_hash, undefined);
});

test("без токена и с мусорным токеном → 401", async () => {
  assert.equal((await api("GET", "/api/dashboard")).status, 401);
  assert.equal((await api("GET", "/api/dashboard", { token: "abc.def.ghi" })).status, 401);
});

test("владелец создаёт сотрудников; слабый пароль и дубль логина отклоняются", async () => {
  const mk = (b) => api("POST", "/api/users", { token: ownerToken, body: b });
  assert.equal((await mk({ login: "dir", name: "Директор", role: "director", password: "123" })).status, 400);
  for (const [loginName, role, manager1c] of [["dir", "director"], ["tp1", "tp", "Ахметов Ержан"], ["sklad", "warehouse"], ["drv", "driver"], ["buh", "accountant"], ["adm", "admin"]]) {
    const r = await mk({ login: loginName, name: loginName, role, password: "Passw0rd1", manager1c });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  assert.equal((await mk({ login: "dir", name: "x", role: "tp", password: "Passw0rd1" })).status, 409);
  for (const l of ["dir", "tp1", "sklad", "drv", "buh", "adm"]) tokens[l] = await login(l, "Passw0rd1");
});

test("админ не может создать владельца/директора и не видит их", async () => {
  const r = await api("POST", "/api/users", { token: tokens.adm, body: { login: "boss2", name: "x", role: "owner", password: "Passw0rd1" } });
  assert.equal(r.status, 403);
  const list = await api("GET", "/api/users", { token: tokens.adm });
  assert.ok(!list.body.some((u) => ["owner", "director"].includes(u.role)));
  assert.equal((await api("GET", "/api/users", { token: tokens.dir })).status, 403);
});

test("агент: без ключа и с неверным ключом → 401", async () => {
  assert.equal((await api("POST", "/api/sync/1c/products", { body: { rows: sample.products } })).status, 401);
  assert.equal((await api("POST", "/api/sync/1c/products", { agent: "wrong", body: { rows: sample.products } })).status, 401);
  assert.equal((await api("POST", "/api/sync/1c/products", { token: ownerToken, body: { rows: sample.products } })).status, 401);
});

test("агент: загрузка всех типов данных", async () => {
  for (const e of ["products", "warehouses", "clients", "prices", "stock", "debts"]) {
    const r = await api("POST", `/api/sync/1c/${e}`, { agent: true, body: { rows: sample[e] } });
    assert.equal(r.status, 200, `${e}: ${JSON.stringify(r.body)}`);
  }
  for (const e of ["sales", "cost"]) {
    const r = await api("POST", `/api/sync/1c/${e}`, { agent: true, body: { ...range, rows: sample[e] } });
    assert.equal(r.status, 200, `${e}: ${JSON.stringify(r.body)}`);
  }
  const { rows } = await env.pool.query("SELECT qty FROM onec_stock WHERE warehouse_code='000000002' AND product_code='00003'");
  assert.equal(rows[0].qty, 3, "дубли остатков складываются");
  const pr = await env.pool.query("SELECT price FROM onec_prices WHERE product_code='00002'");
  assert.equal(pr.rows[0].price, 4500.5, "цена «4 500,50» разобрана");
});

test("агент: ошибки данных → 400 и запись в журнал; пустой справочник не применяется", async () => {
  const bad = await api("POST", "/api/sync/1c/sales", { agent: true, body: { ...range, rows: [{ day: "вчера", product: "1", revenue: 1 }] } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.errors[0], /не дата/);
  const out = await api("POST", "/api/sync/1c/sales", { agent: true, body: { from: day(-1), to: day(-1), rows: [{ day: day(0), product: "1" }] } });
  assert.equal(out.status, 400);
  const empty = await api("POST", "/api/sync/1c/products", { agent: true, body: { rows: [] } });
  assert.equal(empty.status, 400);
  const n = await env.pool.query("SELECT count(*)::int AS n FROM onec_products");
  assert.equal(n.rows[0].n, 3, "товары не стёрты");
  assert.equal((await api("POST", "/api/sync/1c/hack", { agent: true, body: { rows: [] } })).status, 404);
  assert.equal((await api("POST", "/api/sync/1c/__proto__", { agent: true, body: { rows: [] } })).status, 404);
  const log = await env.pool.query("SELECT count(*)::int AS n FROM sync_runs WHERE ok = false");
  assert.ok(log.rows[0].n >= 3);
});

test("агент: продажи за период заменяются (перепроведение в 1С)", async () => {
  const d = day(0);
  const r = await api("POST", "/api/sync/1c/sales", { agent: true, body: { from: d, to: d, rows: [{ day: d, product: "00003", client: "К-003", qty: 5, revenue: 15000 }] } });
  assert.equal(r.status, 200);
  const { rows } = await env.pool.query("SELECT sum(revenue) AS s FROM onec_sales_daily");
  assert.equal(rows[0].s, 30000 + 18000 + 15000, "вчерашние строки не тронуты, сегодняшние заменены");
  // вернуть как было
  await api("POST", "/api/sync/1c/sales", { agent: true, body: { from: d, to: d, rows: sample.sales.filter((x) => x.day === d) } });
});

test("владелец: видит выручку, себестоимость, валовую и маржу", async () => {
  const r = await api("GET", `/api/dashboard?from=${range.from}&to=${range.to}`, { token: ownerToken });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const s = r.body.sales;
  assert.equal(s.revenue, 78000);
  assert.equal(s.cost, 59000);
  assert.equal(s.gross, 19000);
  assert.equal(s.marginPct, 24.4);
  assert.equal(r.body.stock.value, 10 * 15000 + 20 * 4500.5 + 3 * 3000);
  assert.equal(r.body.stock.priceType, "Оптовая");
  assert.equal(r.body.debts.total, 220000);
  assert.equal(r.body.debts.overdue, 100000);
  assert.ok(r.body.lastSync);
  assert.ok(r.body.topProducts[0].gross !== undefined);
});

test("директор: маржа % есть, себестоимости и валовой в тенге нет нигде", async () => {
  for (const path of [`/api/dashboard?from=${range.from}&to=${range.to}`, `/api/sales?group=product&from=${range.from}&to=${range.to}`, `/api/sales?group=day&from=${range.from}&to=${range.to}`]) {
    const r = await api("GET", path, { token: tokens.dir });
    assert.equal(r.status, 200);
    assert.ok(!/"(cost|gross|costTotal|grossTotal)"/.test(r.raw), `${path}: ${r.raw.slice(0, 300)}`);
    assert.ok(/"marginPct"/.test(r.raw), path);
  }
});

test("ТП: только свои клиенты (менеджер в 1С), без маржи и склада", async () => {
  const r = await api("GET", `/api/dashboard?from=${range.from}&to=${range.to}`, { token: tokens.tp1 });
  assert.equal(r.status, 200);
  assert.equal(r.body.sales.revenue, 48000, "К-001 + К-002 у Ахметова");
  assert.equal(r.body.debts.total, 150000);
  assert.equal(r.body.stock, undefined);
  assert.ok(!/"(cost|gross|marginPct)"/.test(r.raw));
  const c = await api("GET", `/api/clients?from=${range.from}&to=${range.to}`, { token: tokens.tp1 });
  assert.deepEqual(c.body.items.map((x) => x.code).sort(), ["К-001", "К-002"]);
  assert.equal((await api("GET", "/api/stock", { token: tokens.tp1 })).status, 403);
  assert.equal((await api("GET", "/api/sync/status", { token: tokens.tp1 })).status, 403);
});

test("ТП без привязки к менеджеру 1С не видит ничего чужого", async () => {
  await api("POST", "/api/users", { token: ownerToken, body: { login: "tp2", name: "tp2", role: "tp", password: "Passw0rd1" } });
  const t = await login("tp2", "Passw0rd1");
  const r = await api("GET", `/api/dashboard?from=${range.from}&to=${range.to}`, { token: t });
  assert.equal(r.body.sales.revenue, 0);
  assert.equal(r.body.debts.total, 0);
});

test("склад: только остатки; водитель: ничего", async () => {
  const st = await api("GET", "/api/stock", { token: tokens.sklad });
  assert.equal(st.status, 200);
  assert.equal(st.body.items.length, 3);
  assert.equal((await api("GET", "/api/sales", { token: tokens.sklad })).status, 403);
  assert.equal((await api("GET", "/api/clients", { token: tokens.sklad })).status, 403);
  const d = await api("GET", "/api/dashboard", { token: tokens.drv });
  assert.equal(d.status, 200);
  assert.equal(d.body.sales, undefined);
  assert.equal(d.body.stock, undefined);
  assert.equal(d.body.debts, undefined);
  assert.equal((await api("GET", "/api/stock", { token: tokens.drv })).status, 403);
});

test("бухгалтер: продажи и долги без маржи, статус синхронизации", async () => {
  const r = await api("GET", `/api/dashboard?from=${range.from}&to=${range.to}`, { token: tokens.buh });
  assert.equal(r.body.sales.revenue, 78000);
  assert.ok(!/"(cost|gross|marginPct)"/.test(r.raw));
  const s = await api("GET", "/api/sync/status", { token: tokens.buh });
  assert.equal(s.status, 200);
  assert.equal(s.body.items.length, 8);
  assert.equal(s.body.stale, false);
});

test("склад: поиск и фильтр по складу", async () => {
  const r = await api("GET", "/api/stock?q=" + encodeURIComponent("масло"), { token: ownerToken });
  assert.equal(r.body.items.length, 1);
  const w = await api("GET", "/api/stock?warehouse=000000002", { token: ownerToken });
  assert.equal(w.body.items.length, 1);
  assert.equal(w.body.warehouses.length, 2);
});

test("неверные даты → 400", async () => {
  assert.equal((await api("GET", "/api/dashboard?from=2026-13-01", { token: ownerToken })).status, 400);
  assert.equal((await api("GET", "/api/dashboard?from=2026-10-10&to=2026-10-01", { token: ownerToken })).status, 400);
  assert.equal((await api("GET", "/api/sales?group=hack", { token: ownerToken })).status, 400);
});

test("блокировка роли: заблокированный сотрудник теряет доступ сразу", async () => {
  const list = await api("GET", "/api/users", { token: ownerToken });
  const drv = list.body.find((u) => u.login === "drv");
  assert.equal((await api("PATCH", `/api/users/${drv.id}`, { token: ownerToken, body: { isActive: false } })).status, 200);
  assert.equal((await api("GET", "/api/auth/me", { token: tokens.drv })).status, 401);
  assert.equal((await api("POST", "/api/auth/login", { body: { login: "drv", password: "Passw0rd1" } })).status, 403);
});

test("смена пароля завершает старые сессии", async () => {
  const old = tokens.buh;
  const r = await api("POST", "/api/auth/password", { token: old, body: { oldPassword: "Passw0rd1", newPassword: "NewPassw0rd" } });
  assert.equal(r.status, 200);
  assert.equal((await api("GET", "/api/auth/me", { token: old })).status, 401);
  assert.equal((await api("GET", "/api/auth/me", { token: r.body.token })).status, 200);
});

test("5 неверных паролей → временная блокировка", async () => {
  for (let i = 0; i < 5; i++) await api("POST", "/api/auth/login", { body: { login: "sklad", password: "wrong-pass1" } });
  const r = await api("POST", "/api/auth/login", { body: { login: "sklad", password: "Passw0rd1" } });
  assert.equal(r.status, 429);
});

test("журнал действий пишется", async () => {
  const { rows } = await env.pool.query("SELECT action FROM audit_log");
  const acts = new Set(rows.map((r) => r.action));
  for (const a of ["login.ok", "login.fail", "user.create", "user.update", "password.change"]) assert.ok(acts.has(a), a);
});
