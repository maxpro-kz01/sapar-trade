// Тесты магазина: каталог по цене договора, заказ, кредитный лимит, изоляция магазинов, привязка к клиенту 1С.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";

let env, api, pool;
const tok = {};
const sh = {}; // токены магазинов
const loginOwner = async () => (await api("POST", "/api/auth/login", { body: { login: OWNER.login, password: OWNER.password } })).body.token;

before(async () => {
  env = await startEnv();
  api = env.api; pool = env.pool;
  tok.owner = await loginOwner();
  for (const [l, role] of [["tp1", "tp"], ["adm", "admin"]]) {
    await api("POST", "/api/users", { token: tok.owner, body: { login: l, name: l, role, password: "Passw0rd1", manager1c: role === "tp" ? "Ахметов Ержан" : undefined } });
    tok[l] = (await api("POST", "/api/auth/login", { body: { login: l, password: "Passw0rd1" } })).body.token;
  }
  await pool.query(`INSERT INTO onec_products(code, name, group_name, unit) VALUES
    ('P1','Мука 50кг','Бакалея','меш'),('P2','Сахар 50кг','Бакалея','меш'),('P3','Масло','Масла','л'),('P4','Нет цены','Масла','шт')`);
  await pool.query(`INSERT INTO onec_prices(product_code, price_type, price) VALUES
    ('P1','Цена Прайс',16000),('P2','Цена Прайс',20000),('P3','Цена Прайс',1000),
    ('P1','Оптовая',15000),('P2','Оптовая',19000),('P3','Оптовая',900)`);
  await pool.query(`INSERT INTO onec_stock(warehouse_code, product_code, qty) VALUES ('W','P1',100),('W','P2',0),('W','P3',500),('W','P4',5)`);
  await pool.query(`INSERT INTO onec_clients(code, name, manager, phone, address, price_type) VALUES
    ('C1','Магазин Нур','Ахметов Ержан','87011234567','Абая 1','Оптовая')`);
  await pool.query(`INSERT INTO onec_debts(client_code, doc_date, doc_name, amount) VALUES ('C1', current_date - 5, 'Реализация 1', 100000)`);
  sh.nur = (await api("POST", "/api/shop/login", { body: { phone: "+7 701 123 45 67" } })).body.token;
  sh.new = (await api("POST", "/api/shop/register", { body: { phone: "+7 777 000 11 22", name: "Мини-маркет Заря", address: "мкр Север 12" } })).body.token;
});
after(async () => { await env?.stop(); });

test("каталог: только товары с ценой; цена по договору; остаток как «есть/нет»", async () => {
  const c = await api("GET", "/api/shop/catalog", { token: sh.nur });
  assert.equal(c.status, 200);
  assert.deepEqual(c.body.items.map((i) => i.code), ["P1", "P2", "P3"]);
  assert.equal(c.body.items[0].price, 15000, "у Нура в договоре «Оптовая»");
  assert.equal(c.body.items[0].inStock, true);
  assert.equal(c.body.items[1].inStock, false);
  assert.equal(c.body.items[0].stock, undefined, "точный остаток магазину не показываем");
  assert.equal(c.body.items[0].cost, undefined);
  assert.equal(JSON.stringify(c.body).includes("Оптовая"), false, "название типа цен не светим");
});

test("новый магазин получает «Цена Прайс»", async () => {
  const c = await api("GET", "/api/shop/catalog", { token: sh.new });
  assert.equal(c.body.items.find((i) => i.code === "P1").price, 16000);
});

test("каталог: у товара нет цены магазина — берём «Оптовая», в заказе та же цена", async () => {
  await pool.query("INSERT INTO onec_products(code, name, group_name, unit) VALUES ('P5','Только оптовая','Масла','шт')");
  await pool.query("INSERT INTO onec_prices(product_code, price_type, price) VALUES ('P5','Оптовая',500)");
  await pool.query("INSERT INTO onec_stock(warehouse_code, product_code, qty) VALUES ('W','P5',50)");
  const c = await api("GET", "/api/shop/catalog", { token: sh.new });
  assert.equal(c.body.items.find((i) => i.code === "P5")?.price, 500, "новый магазин (Цена Прайс) видит позицию по оптовой цене");
  assert.equal(c.body.items.find((i) => i.code === "P1").price, 16000, "своя цена важнее запасной");
  const o = await api("POST", "/api/shop/orders", { token: sh.new, body: { items: [{ code: "P5", qty: 2 }], payment: "cash" } });
  assert.equal(o.status, 201, o.raw);
  assert.equal(o.body.total, 1000);
  await pool.query("DELETE FROM order_items WHERE order_id = $1", [o.body.id]);
  await pool.query("DELETE FROM order_events WHERE order_id = $1", [o.body.id]);
  await pool.query("DELETE FROM orders WHERE id = $1", [o.body.id]);
  await pool.query("DELETE FROM onec_stock WHERE product_code = 'P5'");
  await pool.query("DELETE FROM onec_prices WHERE product_code = 'P5'");
  await pool.query("DELETE FROM onec_products WHERE code = 'P5'");
});

test("привязка: оператор ищет клиента 1С по названию, коду и телефону", async () => {
  const shop = (await api("GET", "/api/shops?filter=new", { token: tok.adm })).body.find((s) => s.name === "Мини-маркет Заря");
  const find = async (q) => (await api("GET", `/api/shops/${shop.id}/suggest?q=${encodeURIComponent(q)}`, { token: tok.adm })).body.map((c) => c.code);
  assert.deepEqual(await find("Нур"), ["C1"], "по названию");
  assert.deepEqual(await find("c1"), ["C1"], "по коду");
  assert.deepEqual(await find("701 123"), ["C1"], "по части телефона");
  assert.deepEqual(await find("нет такого"), []);
  assert.equal((await api("GET", `/api/shops/${shop.id}/suggest?q=Нур`, { token: tok.tp1 })).status, 403);
});

test("проверка каталога: сотрудникам — цифры по типам цен; магазину и ТП — нельзя", async () => {
  const d = await api("GET", "/api/shops/diag", { token: tok.owner });
  assert.equal(d.status, 200, d.raw);
  assert.equal(d.body.products, 4);
  assert.ok(d.body.priceTypes.some((t) => t.name === "Оптовая" && t.n === 3));
  assert.equal((await api("GET", "/api/shops/diag", { token: tok.adm })).status, 200);
  assert.equal((await api("GET", "/api/shops/diag", { token: tok.tp1 })).status, 403);
  assert.equal((await api("GET", "/api/shops/diag", { token: sh.nur })).status, 401);
});

test("заказ: цену и сумму считает сервер, клиентской цене не верим", async () => {
  const r = await api("POST", "/api/shop/orders", { token: sh.nur, body: { items: [{ code: "P1", qty: 2, price: 1 }, { code: "P3", qty: 10 }], payment: "cash" } });
  assert.equal(r.status, 201, r.raw);
  assert.equal(r.body.total, 2 * 15000 + 10 * 900);
  const { rows: [o] } = await pool.query("SELECT * FROM orders WHERE id = $1", [r.body.id]);
  assert.equal(o.source, "shop"); assert.equal(o.created_by, null); assert.equal(o.onec_status, "skip");
  assert.equal(o.client_code, "C1"); assert.equal(o.manager, "Ахметов Ержан");
});

test("нельзя: нет в наличии, нет цены, пустой, лишний способ оплаты, плохое количество", async () => {
  const bad = (body) => api("POST", "/api/shop/orders", { token: sh.nur, body });
  assert.equal((await bad({ items: [{ code: "P2", qty: 1 }] })).status, 400, "нет в наличии");
  assert.equal((await bad({ items: [{ code: "P4", qty: 1 }] })).status, 400, "нет цены");
  assert.equal((await bad({ items: [] })).status, 400);
  assert.equal((await bad({ items: [{ code: "P1", qty: -1 }] })).status, 400);
  assert.equal((await bad({ items: [{ code: "P1", qty: 1 }], payment: "gold" })).status, 400);
  assert.equal((await bad({ items: [{ code: "ZZZ", qty: 1 }] })).status, 400);
});

test("в долг: по умолчанию выключено; с лимитом — только в пределах (долг 1С учитывается)", async () => {
  const body = { items: [{ code: "P1", qty: 2 }], payment: "debt" }; // 30 000
  assert.equal((await api("POST", "/api/shop/orders", { token: sh.nur, body })).status, 400, "лимит 0");
  // ТП не может ставить лимит, владелец — может
  assert.equal((await api("PUT", "/api/clients/C1/limit", { token: tok.tp1, body: { limit: 500000 } })).status, 403);
  assert.equal((await api("PUT", "/api/clients/C1/limit", { token: sh.nur, body: { limit: 500000 } })).status, 401);
  const set = await api("PUT", "/api/clients/C1/limit", { token: tok.owner, body: { limit: 120000 } });
  assert.equal(set.status, 200);
  assert.equal(set.body.available, 20000, "лимит 120 000 − долг 100 000 (заказ «в долг» ещё не было)");
  assert.equal((await api("POST", "/api/shop/orders", { token: sh.nur, body })).status, 400, "30 000 > 20 000");
  const ok = await api("POST", "/api/shop/orders", { token: sh.nur, body: { items: [{ code: "P3", qty: 10 }], payment: "debt" } }); // 9 000
  assert.equal(ok.status, 201, ok.raw);
  const d = await api("GET", "/api/shop/debt", { token: sh.nur });
  assert.equal(d.body.debt, 100000);
  assert.equal(d.body.pending, 9000 + 0, "неотгруженный заказ в долг уменьшает свободный лимит");
  assert.equal(d.body.available, 11000);
  assert.equal(d.body.docs.length, 1);
});

test("новый магазин (не в 1С): в долг нельзя, лимит не выставить, долга нет", async () => {
  const r = await api("POST", "/api/shop/orders", { token: sh.new, body: { items: [{ code: "P3", qty: 1 }], payment: "debt" } });
  assert.equal(r.status, 400);
  const ok = await api("POST", "/api/shop/orders", { token: sh.new, body: { items: [{ code: "P3", qty: 1 }], payment: "transfer" } });
  assert.equal(ok.status, 201);
  const d = await api("GET", "/api/shop/debt", { token: sh.new });
  assert.equal(d.body.debt, 0); assert.deepEqual(d.body.docs, []);
  const { rows: [o] } = await pool.query("SELECT client_code FROM orders WHERE id = $1", [ok.body.id]);
  assert.match(o.client_code, /^NEW-\d+$/);
});

test("изоляция: магазин видит и отменяет только свои заказы", async () => {
  const mine = await api("GET", "/api/shop/orders", { token: sh.nur });
  const other = await api("GET", "/api/shop/orders", { token: sh.new });
  assert.ok(mine.body.length >= 2 && other.body.length >= 1);
  assert.ok(mine.body.every((o) => !other.body.some((x) => x.id === o.id)));
  const foreign = other.body[0].id;
  assert.equal((await api("POST", `/api/shop/orders/${foreign}/cancel`, { token: sh.nur })).status, 404);
  const own = mine.body[0].id;
  assert.equal((await api("POST", `/api/shop/orders/${own}/cancel`, { token: sh.nur })).status, 200);
  assert.equal((await api("POST", `/api/shop/orders/${own}/cancel`, { token: sh.nur })).status, 400, "уже отменён");
  // принятый заказ магазин отменить не может
  const second = mine.body[1].id;
  await pool.query("UPDATE orders SET status = 'Принят' WHERE id = $1", [second]);
  assert.equal((await api("POST", `/api/shop/orders/${second}/cancel`, { token: sh.nur })).status, 400);
});

test("лимит заказов в сутки и максимальная сумма", async () => {
  await pool.query("INSERT INTO settings(key, value) VALUES ('shopMaxOrder', '20000') ON CONFLICT (key) DO UPDATE SET value = '20000'");
  assert.equal((await api("POST", "/api/shop/orders", { token: sh.nur, body: { items: [{ code: "P1", qty: 2 }] } })).status, 400, "30 000 > 20 000");
  await pool.query("DELETE FROM settings WHERE key = 'shopMaxOrder'");
  const { config } = await import("../src/config.js");
  const n = (await pool.query("SELECT count(*) AS n FROM orders WHERE shop_id = (SELECT id FROM shops WHERE phone = '77770001122')")).rows[0].n;
  for (let i = Number(n); i < config.shopOrdersPerDay; i++)
    await pool.query(`INSERT INTO orders(client_code, client_name, price_type, total, source, shop_id) SELECT 'NEW-' || id, 'x', 'p', 1, 'shop', id FROM shops WHERE phone = '77770001122' LIMIT 1`);
  const r = await api("POST", "/api/shop/orders", { token: sh.new, body: { items: [{ code: "P3", qty: 1 }] } });
  assert.equal(r.status, 429);
});

test("сотрудники видят заказы магазинов; ТП — только своих клиентов", async () => {
  const all = await api("GET", "/api/orders", { token: tok.owner });
  const shopOrders = all.body.filter((o) => o.source === "shop");
  assert.ok(shopOrders.length >= 2);
  assert.equal(shopOrders.find((o) => o.client_code === "C1").creator, "Магазин");
  const tp = await api("GET", "/api/orders", { token: tok.tp1 });
  assert.ok(tp.body.some((o) => o.client_code === "C1"));
  assert.ok(!tp.body.some((o) => String(o.client_code).startsWith("NEW-")), "магазин без привязки ТП не виден");
});

test("новые магазины: список, привязка к клиенту 1С переносит заказы, права", async () => {
  assert.equal((await api("GET", "/api/shops", { token: tok.tp1 })).status, 403);
  assert.equal((await api("GET", "/api/shops", { token: sh.nur })).status, 401);
  const list = await api("GET", "/api/shops?filter=new", { token: tok.adm });
  assert.equal(list.status, 200);
  const zarya = list.body.find((s) => s.name === "Мини-маркет Заря");
  assert.ok(zarya && zarya.clientCode === null);
  await pool.query(`INSERT INTO onec_clients(code, name, manager, phone) VALUES ('C9','Заря ТОО','Иванов Пётр','')`);
  assert.equal((await api("POST", `/api/shops/${zarya.id}/link`, { token: tok.adm, body: { clientCode: "NOPE" } })).status, 400);
  assert.equal((await api("POST", `/api/shops/${zarya.id}/link`, { token: tok.adm, body: { clientCode: "C9" } })).status, 200);
  const { rows } = await pool.query("SELECT DISTINCT client_code, manager FROM orders WHERE shop_id = $1", [zarya.id]);
  assert.deepEqual(rows, [{ client_code: "C9", manager: "Иванов Пётр" }]);
  const d = await api("GET", "/api/shop/debt", { token: sh.new });
  assert.equal(d.body.limit, 0);
});

test("блокировка выкидывает магазин сразу", async () => {
  const { rows: [s] } = await pool.query("SELECT id FROM shops WHERE phone = '77770001122'");
  assert.equal((await api("PATCH", `/api/shops/${s.id}`, { token: tok.adm, body: { status: "blocked" } })).status, 200);
  assert.equal((await api("GET", "/api/shop/orders", { token: sh.new })).status, 401);
});

test("«Проблемы»: новые магазины и заказы видят те, у кого есть право", async () => {
  const p = await api("GET", "/api/problems", { token: tok.owner });
  assert.equal(p.status, 200, p.raw);
  assert.ok(JSON.stringify(p.body).includes("shoporders"));
  const tp = await api("GET", "/api/problems", { token: tok.tp1 });
  assert.equal(JSON.stringify(tp.body).includes("newshops"), false);
});
