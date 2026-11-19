// Тесты заказов ТП, каталога, очереди заказов для 1С, смен администратора и настроек.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";
import { sample, day } from "./fixtures/sample.js";

let env, api;
const tok = {};
const login = async (l, p) => (await api("POST", "/api/auth/login", { body: { login: l, password: p } })).body.token;

before(async () => {
  env = await startEnv();
  api = env.api;
  tok.owner = await login(OWNER.login, OWNER.password);
  for (const [l, role, m] of [["tp1", "tp", "Ахметов Ержан"], ["tp2", "tp", "Иванов Пётр"], ["adm", "admin"], ["sklad", "warehouse"], ["drv", "driver"]]) {
    await api("POST", "/api/users", { token: tok.owner, body: { login: l, name: l, role, password: "Passw0rd1", manager1c: m } });
    tok[l] = await login(l, "Passw0rd1");
  }
  for (const e of ["products", "warehouses", "clients", "prices", "stock", "debts"]) await api("POST", `/api/sync/1c/${e}`, { agent: true, body: { rows: sample[e] } });
  for (const e of ["sales", "cost"]) await api("POST", `/api/sync/1c/${e}`, { agent: true, body: { from: day(-5), to: day(0), rows: sample[e] } });
});
after(async () => { await env?.stop(); });

let orderId;

test("каталог: цены по типу цен и остатки", async () => {
  const c = await api("GET", "/api/catalog", { token: tok.tp1 });
  assert.equal(c.status, 200);
  assert.equal(c.body.priceType, "Оптовая");
  const flour = c.body.items.find((x) => x.code === "00001");
  assert.equal(flour.price, 15000);
  assert.equal(flour.stock, 10);
  assert.equal((await api("GET", "/api/catalog", { token: tok.drv })).status, 403);
});

test("цены по типу цен договора магазина; без типа — «Цена Прайс» или самый частый", async () => {
  // в тестовых данных нет «Цена Прайс» — берётся самый частый («Оптовая»)
  const def = await api("GET", "/api/catalog?client=К-002", { token: tok.tp1 });
  assert.equal(def.body.priceType, "Оптовая");
  // у К-001 в договоре «Розничная»: цена только у товара 00001, остальные — без цены
  const sendClients = (rows) => api("POST", "/api/sync/1c/clients", { agent: true, body: { rows } });
  await sendClients(sample.clients.map((x) => (x.code === "К-001" ? { ...x, priceType: "Розничная" } : x)));
  const c = await api("GET", "/api/catalog?client=К-001", { token: tok.tp1 });
  assert.equal(c.body.priceType, "Розничная");
  assert.equal(c.body.items.find((x) => x.code === "00001").price, 16500);
  assert.ok(!(c.body.items.find((x) => x.code === "00002").price > 0), "у 00002 нет розничной цены");
  assert.equal(c.body.noPrice, 2, "два товара с остатком без розничной цены (00002 и 00003)");
  const r = await api("POST", "/api/orders", { token: tok.tp1, body: { clientCode: "К-001", items: [{ code: "00002", qty: 1 }] } });
  assert.equal(r.status, 400, "товар без цены заказать нельзя");
  const ok = await api("POST", "/api/orders", { token: tok.tp1, body: { clientCode: "К-001", items: [{ code: "00001", qty: 1 }] } });
  assert.equal(ok.status, 201, ok.raw);
  assert.equal(ok.body.total, 16500);
  const row = (await env.pool.query("SELECT price_type FROM orders WHERE id = $1", [ok.body.id])).rows[0];
  assert.equal(row.price_type, "Розничная", "заказ помнит тип цен — по нему агент создаст реализацию");
  await env.pool.query("DELETE FROM orders WHERE id = $1", [ok.body.id]);
  // другой магазин по-прежнему видит «Оптовую»
  assert.equal((await api("GET", "/api/catalog?client=К-002", { token: tok.tp1 })).body.priceType, "Оптовая");
  await sendClients(sample.clients); // вернуть как было — дальше тесты считают по «Оптовой»
});

test("ТП создаёт заказ своему клиенту; цены считает сервер", async () => {
  const r = await api("POST", "/api/orders", { token: tok.tp1, body: { clientCode: "К-001", items: [{ code: "00001", qty: 2, price: 1 }, { code: "00002", qty: 1 }, { code: "00001", qty: 1 }], comment: "до обеда" } });
  assert.equal(r.status, 201, r.raw);
  assert.equal(r.body.total, 3 * 15000 + 4500.5, "цена из 1С, а не из запроса; дубли сложены");
  assert.match(r.body.number, /^СТ-\d{6}$/);
  orderId = r.body.id;
});

test("ТП не может заказать чужому клиенту и без товаров", async () => {
  assert.equal((await api("POST", "/api/orders", { token: tok.tp1, body: { clientCode: "К-003", items: [{ code: "00001", qty: 1 }] } })).status, 403);
  assert.equal((await api("POST", "/api/orders", { token: tok.tp1, body: { clientCode: "К-001", items: [] } })).status, 400);
  assert.equal((await api("POST", "/api/orders", { token: tok.tp1, body: { clientCode: "К-001", items: [{ code: "00001", qty: -1 }] } })).status, 400);
  assert.equal((await api("POST", "/api/orders", { token: tok.tp1, body: { clientCode: "К-001", items: [{ code: "нет", qty: 1 }] } })).status, 400);
  assert.equal((await api("POST", "/api/orders", { token: tok.adm, body: { clientCode: "К-001", items: [{ code: "00001", qty: 1 }] } })).status, 403);
});

test("видимость заказов: ТП — свои, админ и склад — все, водитель — нет", async () => {
  assert.equal((await api("GET", "/api/orders", { token: tok.tp1 })).body.length, 1);
  assert.equal((await api("GET", "/api/orders", { token: tok.tp2 })).body.length, 0);
  const a = await api("GET", "/api/orders", { token: tok.adm });
  assert.equal(a.body.length, 1);
  assert.equal(a.body[0].items.length, 2);
  assert.equal(a.body[0].onec_status, "skip", "отправка в 1С по умолчанию выключена");
  assert.equal((await api("GET", "/api/orders", { token: tok.sklad })).body.length, 0, "склад не видит «Новый» — только то, что оператор принял");
  assert.equal((await api("GET", "/api/orders", { token: tok.drv })).status, 403);
});

test("статусы: порядок переходов и права", async () => {
  assert.equal((await api("PATCH", `/api/orders/${orderId}`, { token: tok.tp1, body: { status: "Принят" } })).status, 403);
  assert.equal((await api("PATCH", `/api/orders/${orderId}`, { token: tok.adm, body: { status: "Отгружен" } })).status, 400);
  assert.equal((await api("PATCH", `/api/orders/${orderId}`, { token: tok.sklad, body: { status: "Принят" } })).status, 404, "склад не видит и не принимает «Новый»");
  assert.equal((await api("PATCH", `/api/orders/${orderId}`, { token: tok.adm, body: { status: "Принят" } })).status, 200);
  // склад: видит принятый без денег, не отменяет и не отгружает, может только «Собран»
  const w = (await api("GET", "/api/orders", { token: tok.sklad })).body;
  assert.equal(w.length, 1);
  assert.equal(w[0].total, null); assert.equal(w[0].items[0].price, null); assert.equal(w[0].onec_status, null);
  assert.equal((await api("PATCH", `/api/orders/${orderId}`, { token: tok.sklad, body: { status: "Отменён" } })).status, 403);
  assert.equal((await api("POST", `/api/orders/${orderId}/retry-1c`, { token: tok.sklad })).status, 403);
  assert.equal((await api("PATCH", `/api/orders/${orderId}`, { token: tok.sklad, body: { status: "Собран" } })).status, 200);
  assert.equal((await api("PATCH", `/api/orders/${orderId}`, { token: tok.sklad, body: { status: "Отгружен" } })).status, 403);
  assert.equal((await api("PATCH", `/api/orders/${orderId}`, { token: tok.tp2, body: { status: "Отгружен" } })).status, 404);
});

test("очередь для 1С: агент забирает, сообщает номер; ошибки и повтор", async () => {
  assert.equal((await api("GET", "/api/sync/1c/orders/pending")).status, 401);
  assert.equal((await api("GET", "/api/sync/1c/orders/pending", { agent: true })).body.length, 0, "выключено — агенту пусто");
  assert.equal((await api("POST", `/api/orders/${orderId}/retry-1c`, { token: tok.adm })).status, 400, "выключено — вручную тоже нельзя");
  assert.equal((await api("PUT", "/api/settings", { token: tok.adm, body: { onecOrders: "да" } })).status, 400);
  assert.equal((await api("PUT", "/api/settings", { token: tok.tp1, body: { onecOrders: true } })).status, 403);
  const st = await api("PUT", "/api/settings", { token: tok.owner, body: { onecOrders: true } });
  assert.equal(st.body.onecOrders, true);
  // заказ, созданный при выключенной отправке, отправляем вручную
  assert.equal((await api("POST", `/api/orders/${orderId}/retry-1c`, { token: tok.adm })).status, 200);
  const p = await api("GET", "/api/sync/1c/orders/pending", { agent: true });
  assert.equal(p.body.length, 1);
  assert.equal(p.body[0].client_code, "К-001");
  assert.equal(p.body[0].items.length, 2);
  assert.equal((await api("POST", `/api/sync/1c/orders/${orderId}/result`, { agent: true, body: { ok: true, number: "ЗП-000777" } })).status, 200);
  assert.equal((await api("GET", "/api/sync/1c/orders/pending", { agent: true })).body.length, 0);
  assert.equal((await api("POST", `/api/sync/1c/orders/${orderId}/result`, { agent: true, body: { ok: true, number: "x" } })).status, 404, "повторно не принимаем");
  const o = (await api("GET", "/api/orders", { token: tok.adm })).body[0];
  assert.equal(o.onec_number, "ЗП-000777");

  const r2 = await api("POST", "/api/orders", { token: tok.tp2, body: { clientCode: "К-003", items: [{ code: "00003", qty: 5 }] } });
  assert.equal((await api("GET", "/api/sync/1c/orders/pending", { agent: true })).body.length, 0, "новый заказ в 1С не уходит, пока оператор не принял");
  assert.equal((await api("PATCH", `/api/orders/${r2.body.id}`, { token: tok.adm, body: { status: "Принят" } })).status, 200);
  assert.equal((await api("GET", "/api/sync/1c/orders/pending", { agent: true })).body.length, 1, "«Принять» — и заказ ушёл в очередь 1С");
  await api("POST", `/api/sync/1c/orders/${r2.body.id}/result`, { agent: true, body: { ok: false, error: "Не заполнен склад" } });
  assert.equal((await api("POST", `/api/orders/${r2.body.id}/retry-1c`, { token: tok.tp2 })).status, 403);
  assert.equal((await api("POST", `/api/orders/${r2.body.id}/retry-1c`, { token: tok.adm })).status, 200);
  assert.equal((await api("GET", "/api/sync/1c/orders/pending", { agent: true })).body.length, 1);
  // оператор отменяет заказ — в 1С его больше не отправляем
  assert.equal((await api("PATCH", `/api/orders/${r2.body.id}`, { token: tok.adm, body: { status: "Отменён" } })).status, 200);
  assert.equal((await api("GET", "/api/sync/1c/orders/pending", { agent: true })).body.length, 0);
});

test("отмена заказа, который уже в 1С, — напоминание отменить вручную", async () => {
  const r = await api("PATCH", `/api/orders/${orderId}`, { token: tok.adm, body: { status: "Отменён" } });
  assert.equal(r.status, 200);
  assert.match(r.body.note, /ЗП-000777 в 1С вручную/);
});

test("смена: начать, повторно нельзя, завершить с отчётом", async () => {
  assert.equal((await api("POST", "/api/shift/start", { token: tok.tp1 })).status, 403);
  assert.equal((await api("POST", "/api/shift/start", { token: tok.adm })).status, 201);
  assert.equal((await api("POST", "/api/shift/start", { token: tok.adm })).status, 400);
  const cur = await api("GET", "/api/shift", { token: tok.adm });
  assert.ok(cur.body.current);
  await api("POST", "/api/orders", { token: tok.tp1, body: { clientCode: "К-002", items: [{ code: "00002", qty: 2 }] } });
  const e = await api("POST", "/api/shift/end", { token: tok.adm });
  assert.equal(e.status, 200, e.raw);
  const rep = e.body.report;
  assert.equal(rep.orders.count, 1);
  assert.equal(rep.orders.total, 9001);
  assert.equal(rep.sales1c.revenue, 30000, "продажи за сегодня из 1С");
  assert.ok(rep.debts.overdue > 0);
  assert.equal(e.body.settings.directorPhone, "+7 700 105 17 17");
  assert.equal((await api("POST", "/api/shift/end", { token: tok.adm })).status, 400);
});

test("настройки: телефон директора", async () => {
  assert.equal((await api("PUT", "/api/settings", { token: tok.adm, body: { directorPhone: "123" } })).status, 400);
  const s = await api("PUT", "/api/settings", { token: tok.adm, body: { directorPhone: "8 701 234 56 78".replace(/^8/, "7") } });
  assert.equal(s.status, 200);
  assert.equal(s.body.directorPhone, "+7 701 234 56 78");
  assert.equal((await api("PUT", "/api/settings", { token: tok.tp1, body: { directorPhone: "77012345678" } })).status, 403);
});

test("проблема склада: склад пишет, оператор видит в «Проблемах» и отмечает «Решено»", async () => {
  const r = await api("POST", "/api/orders", { token: tok.tp1, body: { clientCode: "К-001", items: [{ code: "00001", qty: 1 }] } });
  assert.equal((await api("POST", `/api/orders/${r.body.id}/problem`, { token: tok.sklad, body: { note: "нет муки" } })).status, 404, "«Новый» склад не видит");
  await api("PATCH", `/api/orders/${r.body.id}`, { token: tok.adm, body: { status: "Принят" } });
  assert.equal((await api("POST", `/api/orders/${r.body.id}/problem`, { token: tok.sklad, body: { note: "  " } })).status, 400);
  assert.equal((await api("POST", `/api/orders/${r.body.id}/problem`, { token: tok.tp1, body: { note: "x" } })).status, 403);
  assert.equal((await api("POST", `/api/orders/${r.body.id}/problem`, { token: tok.sklad, body: { note: "нет муки" } })).status, 200);
  const pr = (await api("GET", "/api/problems", { token: tok.adm })).body.items;
  assert.ok(pr.some((x) => x.code === "wh_problem"), "оператор видит проблему склада");
  assert.equal((await api("POST", `/api/orders/${r.body.id}/problem-solved`, { token: tok.sklad, body: {} })).status, 403);
  assert.equal((await api("POST", `/api/orders/${r.body.id}/problem-solved`, { token: tok.adm, body: {} })).status, 200);
  assert.ok(!(await api("GET", "/api/problems", { token: tok.adm })).body.items.some((x) => x.code === "wh_problem"), "после «Решено» проблема исчезла");
});
