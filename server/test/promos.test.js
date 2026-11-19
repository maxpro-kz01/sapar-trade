// Тесты акций с подарком: права, срабатывание «один раз на заказ», нулевая цена подарка, нехватка на складе, период и выключатель.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";
import { sample, day } from "./fixtures/sample.js";

let env, api;
const tok = {};
const login = async (l, p) => (await api("POST", "/api/auth/login", { body: { login: l, password: p } })).body.token;
const order = (token, items) => api("POST", "/api/orders", { token, body: { clientCode: "К-001", items } });
const promo = (o = {}) => ({ title: "Мука + подарок", buyCode: "00002", buyQty: 5, giftCode: "00003", giftQty: 2, ...o });

before(async () => {
  env = await startEnv();
  api = env.api;
  tok.owner = await login(OWNER.login, OWNER.password);
  for (const [l, role, m] of [["dir", "director"], ["tp1", "tp", "Ахметов Ержан"], ["sklad", "warehouse"]]) {
    await api("POST", "/api/users", { token: tok.owner, body: { login: l, name: l, role, password: "Passw0rd1", manager1c: m } });
    tok[l] = await login(l, "Passw0rd1");
  }
  for (const e of ["products", "warehouses", "clients", "prices", "stock"]) await api("POST", `/api/sync/1c/${e}`, { agent: true, body: { rows: sample[e] } });
});
after(async () => { await env?.stop(); });

test("права: акции создают владелец и директор; ТП, склад — нет, но акцию видят в каталоге", async () => {
  assert.equal((await api("POST", "/api/promos", { token: tok.tp1, body: promo() })).status, 403);
  assert.equal((await api("POST", "/api/promos", { token: tok.sklad, body: promo() })).status, 403);
  assert.equal((await api("GET", "/api/promos", { token: tok.tp1 })).status, 403);
  const c = await api("POST", "/api/promos", { token: tok.dir, body: promo({ label: "5 + 2 в подарок" }) });
  assert.equal(c.status, 201, c.raw);
  const list = await api("GET", "/api/promos", { token: tok.owner });
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].running, true);
  assert.equal(list.body.items[0].giftStock, 3);
  const cat = await api("GET", "/api/catalog?client=К-001", { token: tok.tp1 });
  assert.equal(cat.body.promos.length, 1);
  assert.equal(cat.body.promos[0].label, "5 + 2 в подарок");
  assert.equal(cat.body.promos[0].giftStock, undefined, "остаток подарка клиентам не показываем");
});

test("проверка данных акции", async () => {
  const bad = (o) => api("POST", "/api/promos", { token: tok.dir, body: promo(o) });
  assert.equal((await bad({ title: "" })).status, 400);
  assert.equal((await bad({ buyQty: 0 })).status, 400);
  assert.equal((await bad({ giftQty: -1 })).status, 400);
  assert.equal((await bad({ buyCode: "нет" })).status, 400);
  assert.equal((await bad({ giftCode: "нет" })).status, 400);
  assert.equal((await bad({ dateFrom: "2026-05-02", dateTo: "2026-05-01" })).status, 400);
  assert.equal((await bad({ dateFrom: "вчера" })).status, 400);
});

test("заказ ниже порога — подарка нет; на пороге — один подарок; в 2 раза больше — всё равно один (раз на заказ)", async () => {
  const lo = await order(tok.tp1, [{ code: "00002", qty: 4 }]);
  assert.equal(lo.status, 201, lo.raw);
  assert.deepEqual(lo.body.gifts, []);
  const eq = await order(tok.tp1, [{ code: "00002", qty: 5 }]);
  assert.equal(eq.body.gifts.length, 1);
  assert.equal(eq.body.gifts[0].qty, 2);
  const twice = await order(tok.tp1, [{ code: "00002", qty: 10 }]);
  assert.equal(twice.body.gifts[0].qty, 2, "один раз на заказ, а не за каждые 5");
});

test("подарок — отдельная строка с ценой 0, в сумму заказа не входит; в истории есть запись об акции", async () => {
  const o = await order(tok.tp1, [{ code: "00002", qty: 5 }]);
  assert.equal(o.body.total, 22502.5, "5 × 4500,50, подарок не считается");
  const list = await api("GET", "/api/orders", { token: tok.owner });
  const full = list.body.find((x) => x.id === o.body.id);
  assert.equal(full.items.length, 2);
  const g = full.items.find((i) => i.gift);
  assert.equal(g.code, "00003");
  assert.equal(g.qty, 2);
  assert.equal(g.sum, 0);
  assert.equal(g.price, 0);
  assert.ok(/^Подарок: /.test(g.name));
  assert.equal(Number(full.total), 22502.5);
  assert.ok(full.events.some((e) => e.event === "Акция" && /Мука \+ подарок/.test(e.note)));
});

test("подарка не хватает на складе: выдаём остаток и сообщаем в «Проблемах»", async () => {
  // остаток подарка 3; заказ сам берёт 2 штуки этого товара → свободно 1, а положено 2
  const o = await order(tok.tp1, [{ code: "00002", qty: 5 }, { code: "00003", qty: 2 }]);
  assert.equal(o.status, 201, o.raw);
  assert.equal(o.body.gifts[0].qty, 1);
  assert.equal(o.body.gifts[0].short, true);
  const pr = await api("GET", "/api/problems", { token: tok.dir });
  assert.ok(pr.body.items.some((x) => x.code === "giftshort"), "директор видит нехватку подарка");
  const prTp = await api("GET", "/api/problems", { token: tok.tp1 });
  assert.ok(!prTp.body.items.some((x) => x.code === "giftshort"), "ТП эту проблему не видит");
});

test("выключенная и просроченная акция не срабатывают; изменение и удаление", async () => {
  const list = await api("GET", "/api/promos", { token: tok.owner });
  const id = list.body.items[0].id;
  const off = await api("PUT", `/api/promos/${id}`, { token: tok.dir, body: promo({ active: false }) });
  assert.equal(off.status, 200, off.raw);
  assert.deepEqual((await order(tok.tp1, [{ code: "00002", qty: 5 }])).body.gifts, []);
  assert.equal((await api("GET", "/api/catalog?client=К-001", { token: tok.tp1 })).body.promos.length, 0);
  // включена, но период закончился вчера
  await api("PUT", `/api/promos/${id}`, { token: tok.dir, body: promo({ active: true, dateTo: day(-1) }) });
  assert.deepEqual((await order(tok.tp1, [{ code: "00002", qty: 5 }])).body.gifts, []);
  assert.equal((await api("GET", "/api/promos", { token: tok.owner })).body.items[0].running, false);
  // действует с сегодняшнего дня
  await api("PUT", `/api/promos/${id}`, { token: tok.dir, body: promo({ dateFrom: day(0), dateTo: day(3) }) });
  assert.equal((await order(tok.tp1, [{ code: "00002", qty: 5 }])).body.gifts.length, 1);
  assert.equal((await api("PUT", `/api/promos/${id}`, { token: tok.tp1, body: promo() })).status, 403);
  assert.equal((await api("DELETE", `/api/promos/${id}`, { token: tok.tp1 })).status, 403);
  assert.equal((await api("DELETE", `/api/promos/${id}`, { token: tok.dir })).status, 200);
  assert.equal((await api("DELETE", `/api/promos/${id}`, { token: tok.dir })).status, 404);
  assert.deepEqual((await order(tok.tp1, [{ code: "00002", qty: 5 }])).body.gifts, []);
});
