// Тесты входа магазинов: телефон, регистрация, подбор из 1С, разделение токенов с сотрудниками.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";

let env, api, pool, normalizePhone;
let ownerTok;

before(async () => {
  env = await startEnv();
  api = env.api; pool = env.pool;
  ({ normalizePhone } = await import("../src/services/shop_auth.js"));
  ownerTok = (await api("POST", "/api/auth/login", { body: { login: OWNER.login, password: OWNER.password } })).body.token;
  await pool.query(`INSERT INTO onec_clients(code, name, manager, phone, address) VALUES
    ('C1', 'Магазин Нур', 'Ахметов Ержан', '8 (701) 123-45-67', 'ул. Абая 1'),
    ('C2', 'Магазин Дана', 'Ахметов Ержан', '+7 702 222 33 44', 'ул. Айтеке би 5')`);
});
after(async () => { await env?.stop(); });

test("телефон: все привычные записи → 7XXXXXXXXXX", () => {
  for (const v of ["8 701 123 45 67", "+7(701)123-45-67", "701 123 45 67", "87011234567", "7 701 123 45 67"]) assert.equal(normalizePhone(v), "77011234567", v);
  for (const v of ["123", "", null, "+1 202 555 0100", "8 701 123 45"]) assert.equal(normalizePhone(v), null, String(v));
});

test("магазин из 1С входит по номеру (запись в 1С в другом формате)", async () => {
  const r = await api("POST", "/api/shop/login", { body: { phone: "+7 701 123 45 67" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.shop.name, "Магазин Нур");
  assert.ok(r.body.token && r.body.refreshToken);
  const { rows: [s] } = await pool.query("SELECT client_code FROM shops WHERE phone = '77011234567'");
  assert.equal(s.client_code, "C1");
});

test("неизвестный номер → 404 и needRegister", async () => {
  const r = await api("POST", "/api/shop/login", { body: { phone: "+7 777 000 11 22" } });
  assert.equal(r.status, 404);
  assert.equal(r.body.needRegister, true);
});

test("плохой номер → 400", async () => {
  assert.equal((await api("POST", "/api/shop/login", { body: { phone: "123" } })).status, 400);
});

test("регистрация: нужны название и адрес; потом вход по номеру без кода", async () => {
  assert.equal((await api("POST", "/api/shop/register", { body: { phone: "+7 777 000 11 22", name: "А", address: "ул. 1" } })).status, 400);
  assert.equal((await api("POST", "/api/shop/register", { body: { phone: "+7 777 000 11 22", name: "Мини-маркет Заря", address: "" } })).status, 400);
  const r = await api("POST", "/api/shop/register", { body: { phone: "+7 777 000 11 22", name: "Мини-маркет Заря", contactName: "Айгуль", address: "мкр Север 12" } });
  assert.equal(r.status, 201);
  assert.equal(r.body.shop.linked, false);
  const l = await api("POST", "/api/shop/login", { body: { phone: "87770001122" } });
  assert.equal(l.status, 200);
  assert.equal(l.body.shop.name, "Мини-маркет Заря");
});

test("повторная регистрация того же номера и названия = вход, дубля нет", async () => {
  const r = await api("POST", "/api/shop/register", { body: { phone: "+7 777 000 11 22", name: "мини-маркет заря", address: "мкр Север 12" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.existed, true);
  const { rows } = await pool.query("SELECT count(*) AS n FROM shops WHERE phone = '77770001122'");
  assert.equal(Number(rows[0].n), 1);
});

test("на одном номере несколько магазинов → выбор", async () => {
  await api("POST", "/api/shop/register", { body: { phone: "+7 777 000 11 22", name: "Второй магазин", address: "ул. 2" } });
  const l = await api("POST", "/api/shop/login", { body: { phone: "+7 777 000 11 22" } });
  assert.equal(l.status, 200);
  assert.equal(l.body.choose.length, 2);
  const l2 = await api("POST", "/api/shop/login", { body: { phone: "+7 777 000 11 22", shopId: l.body.choose[0].id } });
  assert.ok(l2.body.token);
});

test("refresh и выход закрывают вход", async () => {
  const l = await api("POST", "/api/shop/login", { body: { phone: "+7 702 222 33 44" } });
  const rf = await api("POST", "/api/shop/refresh", { body: { refreshToken: l.body.refreshToken } });
  assert.equal(rf.status, 200);
  assert.equal((await api("GET", "/api/shop/me", { token: rf.body.token })).status, 200);
  await api("POST", "/api/shop/logout", { body: { refreshToken: l.body.refreshToken } });
  assert.equal((await api("POST", "/api/shop/refresh", { body: { refreshToken: l.body.refreshToken } })).status, 401);
  assert.equal((await api("GET", "/api/shop/me", { token: l.body.token })).status, 401); // сессия закрыта — доступ пропал сразу
});

test("токен магазина не открывает методы сотрудников, токен сотрудника — методы магазина", async () => {
  const l = await api("POST", "/api/shop/login", { body: { phone: "+7 701 123 45 67" } });
  for (const p of ["/api/auth/me", "/api/users", "/api/orders", "/api/clients"]) {
    assert.equal((await api("GET", p, { token: l.body.token })).status, 401, p);
  }
  assert.equal((await api("GET", "/api/shop/me", { token: ownerTok })).status, 401);
});

test("заблокированный магазин не входит и теряет доступ", async () => {
  const l = await api("POST", "/api/shop/login", { body: { phone: "+7 701 123 45 67" } });
  await pool.query("UPDATE shops SET status = 'blocked' WHERE phone = '77011234567'");
  assert.equal((await api("GET", "/api/shop/me", { token: l.body.token })).status, 401);
  assert.equal((await api("POST", "/api/shop/login", { body: { phone: "+7 701 123 45 67" } })).status, 403);
  await pool.query("UPDATE shops SET status = 'active' WHERE phone = '77011234567'");
});

test("частота: вход ограничен по IP", async () => {
  let last;
  for (let i = 0; i < 15; i++) last = await api("POST", "/api/shop/login", { body: { phone: "+7 777 999 00 0" + (i % 10) } });
  assert.equal(last.status, 429);
});
