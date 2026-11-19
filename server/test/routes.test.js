// Тесты маршрутных листов: составление, права, доставка, «не принят», деньги, точка магазина, изоляция водителей.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";

let env, api;
const tok = {};
const ids = {};
const login = async (l, p) => (await api("POST", "/api/auth/login", { body: { login: l, password: p } })).body.token;
const dayPlus = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qyzylorda" }).format(new Date(Date.now() + n * 86400000));

async function mkOrder(code, name, { total = 10000, status = "Собран", payment = "cash" } = {}) {
  const { rows: [o] } = await env.pool.query(
    "INSERT INTO orders(client_code, client_name, created_by, status, price_type, total, payment) VALUES ($1,$2,$3,$4,'Рынок',$5,$6) RETURNING id",
    [code, name, ids.owner, status, total, payment]);
  await env.pool.query("INSERT INTO order_items(order_id, line, product_code, name, unit, qty, price, sum) VALUES ($1,1,'T1','Чай','шт',2,$2,$3)", [o.id, total / 2, total]);
  return o.id;
}

before(async () => {
  env = await startEnv();
  api = env.api;
  tok.owner = await login(OWNER.login, OWNER.password);
  ids.owner = (await env.pool.query("SELECT id FROM users WHERE role = 'owner' LIMIT 1")).rows[0].id;
  for (const [l, role] of [["drv1", "driver"], ["drv2", "driver"], ["dir", "director"], ["tp1", "tp"], ["sklad", "warehouse"], ["oper", "admin"], ["buh", "accountant"]]) {
    const u = await api("POST", "/api/users", { token: tok.owner, body: { login: l, name: "Имя " + l, role, password: "Passw0rd1", manager1c: role === "tp" ? "Ахметов Ержан" : undefined } });
    ids[l] = u.body.id;
    tok[l] = await login(l, "Passw0rd1");
  }
  await env.pool.query("INSERT INTO onec_clients(code, name, address, phone) VALUES ('C1','Магазин Один','ул. Абая 1','+77001112233'),('C2','Магазин Два','ул. Байтурсынова 5','+77004445566'),('C3','Магазин Три',NULL,NULL)");
});
after(async () => { await env?.stop(); });

test("права: составлять могут владелец, директор, оператор, склад; остальные нет", async () => {
  for (const l of ["owner", "dir", "oper", "sklad"]) assert.equal((await api("GET", "/api/routes", { token: tok[l] })).status, 200, l);
  for (const l of ["tp1", "buh", "drv1"]) {
    assert.equal((await api("GET", "/api/routes", { token: tok[l] })).status, 403, l);
    assert.equal((await api("POST", "/api/routes", { token: tok[l], body: { driverId: ids.drv1, orderIds: [] } })).status, 403, l);
  }
  assert.equal((await api("GET", "/api/my-route", { token: tok.sklad })).status, 403, "склад не водитель");
  assert.equal((await api("GET", "/api/routes")).status, 401);
});

let o1, o2, o3, sheet;
test("в лист попадают только «Собран», заказ не может стоять в двух листах", async () => {
  o1 = await mkOrder("C1", "Магазин Один", { total: 10000, payment: "cash" });
  o2 = await mkOrder("C2", "Магазин Два", { total: 5000, payment: "transfer" });
  o3 = await mkOrder("C3", "Магазин Три", { total: 7000 });
  const newOne = await mkOrder("C1", "Магазин Один", { status: "Новый" });
  const av = await api("GET", "/api/routes/orders", { token: tok.oper });
  const got = av.body.map((x) => x.orderId);
  assert.ok(got.includes(o1) && got.includes(o2) && got.includes(o3));
  assert.ok(!got.includes(newOne), "«Новый» в доступных не показывается");
  assert.equal((await api("POST", "/api/routes", { token: tok.oper, body: { driverId: ids.drv1, orderIds: [newOne] } })).status, 400);
  assert.equal((await api("POST", "/api/routes", { token: tok.oper, body: { driverId: ids.tp1, orderIds: [o1] } })).status, 400, "в лист назначается только водитель");
  assert.equal((await api("POST", "/api/routes", { token: tok.oper, body: { driverId: ids.drv1, orderIds: [o1, o1] } })).status, 400);
  const ok = await api("POST", "/api/routes", { token: tok.oper, body: { driverId: ids.drv1, orderIds: [o1, o2] } });
  assert.equal(ok.status, 201);
  sheet = ok.body.id;
  assert.equal((await api("POST", "/api/routes", { token: tok.sklad, body: { driverId: ids.drv2, orderIds: [o2] } })).status, 409, "заказ уже в другом листе");
  assert.equal((await api("POST", "/api/routes", { token: tok.sklad, body: { driverId: ids.drv1, orderIds: [] } })).status, 409, "второй лист на ту же дату у того же водителя");
  const av2 = await api("GET", "/api/routes/orders", { token: tok.oper });
  assert.ok(!av2.body.some((x) => x.orderId === o1), "заказ в листе пропал из доступных");
});

test("черновик не виден водителю; после «Передать» виден только ему", async () => {
  assert.equal((await api("GET", "/api/my-route", { token: tok.drv1 })).body.sheet, null);
  assert.equal((await api("POST", "/api/routes/" + sheet + "/send", { token: tok.oper })).status, 200);
  const mine = await api("GET", "/api/my-route", { token: tok.drv1 });
  assert.deepEqual(mine.body.stops.map((s) => s.orderId), [o1, o2], "порядок как составил оператор");
  assert.equal(mine.body.stops[0].address, "ул. Абая 1");
  assert.equal(mine.body.stops[0].expectCash, 10000);
  assert.equal(mine.body.stops[1].expectCash, 0, "перевод — наличных не ждём");
  assert.equal(mine.body.totals.cashExpected, 10000);
  assert.equal((await api("GET", "/api/my-route", { token: tok.drv2 })).body.sheet, null, "чужой лист не виден");
  assert.equal((await api("POST", "/api/routes/" + sheet + "/send", { token: tok.oper })).status, 400, "повторно передать нельзя");
  assert.equal((await api("DELETE", "/api/routes/" + sheet, { token: tok.oper })).status, 400, "переданный не удалить");
});

test("«Доставлено»: заказ → «Отгружен», наличные, повтор безопасен, чужой не может", async () => {
  const stops = (await api("GET", "/api/my-route", { token: tok.drv1 })).body.stops;
  const s1 = stops[0].id;
  assert.equal((await api("POST", `/api/my-route/stops/${s1}/done`, { token: tok.drv2, body: {} })).status, 404, "чужая остановка");
  assert.equal((await api("POST", `/api/my-route/stops/${s1}/done`, { token: tok.drv1, body: { cash: -5 } })).status, 400);
  assert.equal((await api("POST", `/api/my-route/stops/${s1}/done`, { token: tok.drv1, body: { cash: 10000, lat: 44.85, lon: 65.48 } })).status, 200);
  assert.equal((await api("POST", `/api/my-route/stops/${s1}/done`, { token: tok.drv1, body: { cash: 10000 } })).body.again, true, "повтор не ломает");
  const { rows: [o] } = await env.pool.query("SELECT status FROM orders WHERE id = $1", [o1]);
  assert.equal(o.status, "Отгружен");
  const { rows: ev } = await env.pool.query("SELECT note FROM order_events WHERE order_id = $1 AND event = 'Отгружен'", [o1]);
  assert.equal(ev.length, 1);
  const t = (await api("GET", "/api/my-route", { token: tok.drv1 })).body.totals;
  assert.equal(t.done, 1);
  assert.equal(t.cashReceived, 10000);
});

test("«Не принят»: причина обязательна, заказ остаётся «Собран», виден в проблемах, лист закрывается", async () => {
  const stops = (await api("GET", "/api/my-route", { token: tok.drv1 })).body.stops;
  const s2 = stops[1].id;
  assert.equal((await api("POST", `/api/my-route/stops/${s2}/fail`, { token: tok.drv1, body: {} })).status, 400);
  assert.equal((await api("POST", `/api/my-route/stops/${s2}/fail`, { token: tok.drv1, body: { reason: "Выдумка" } })).status, 400);
  assert.equal((await api("POST", `/api/my-route/stops/${s2}/fail`, { token: tok.drv1, body: { reason: "Закрыто", note: "обед до 15:00" } })).status, 200);
  const { rows: [o] } = await env.pool.query("SELECT status FROM orders WHERE id = $1", [o2]);
  assert.equal(o.status, "Собран", "заказ не потерян — его можно отправить снова");
  const pr = await api("GET", "/api/problems", { token: tok.oper });
  assert.ok(JSON.stringify(pr.body).includes("routefail"), "оператор видит проблему");
  const sh = await api("GET", "/api/routes/" + sheet, { token: tok.oper });
  assert.equal(sh.body.status, "closed", "ждущих нет — лист закрылся сам");
  assert.equal(sh.body.stops[1].failReason, "Закрыто: обед до 15:00");
  const av = await api("GET", "/api/routes/orders", { token: tok.oper });
  assert.ok(av.body.some((x) => x.orderId === o2), "не принятый заказ снова доступен для нового листа");
  assert.equal((await api("POST", `/api/my-route/stops/${s2}/done`, { token: tok.drv1, body: {} })).status, 404, "закрытый лист водителю уже не принадлежит");
});

test("точка магазина: ставит оператор, границы, видна водителю; водитель может поставить сам", async () => {
  assert.equal((await api("PUT", "/api/clients/C3/geo", { token: tok.tp1, body: { lat: 44.8, lon: 65.5 } })).status, 403);
  assert.equal((await api("PUT", "/api/clients/C3/geo", { token: tok.oper, body: { lat: 65.5, lon: 44.8 } })).status, 400, "широта и долгота перепутаны");
  assert.equal((await api("PUT", "/api/clients/NOPE/geo", { token: tok.oper, body: { lat: 44.8, lon: 65.5 } })).status, 404);
  assert.equal((await api("PUT", "/api/clients/C3/geo", { token: tok.oper, body: { lat: 44.8501, lon: 65.4802 } })).status, 200);
  const c = await api("POST", "/api/routes", { token: tok.dir, body: { date: dayPlus(1), driverId: ids.drv2, orderIds: [o3] } });
  assert.equal(c.status, 201);
  await api("POST", `/api/routes/${c.body.id}/send`, { token: tok.dir });
  const mine = (await api("GET", "/api/my-route", { token: tok.drv2 })).body;
  assert.deepEqual(mine.stops[0].geo, { lat: 44.8501, lon: 65.4802 });
  assert.equal(mine.stops[0].address, null, "адреса нет — водитель увидит подсказку");
  assert.equal((await api("PUT", `/api/my-route/stops/${mine.stops[0].id}/geo`, { token: tok.drv2, body: { lat: 44.86, lon: 65.49 } })).status, 200);
  assert.equal((await api("PUT", `/api/my-route/stops/${mine.stops[0].id}/geo`, { token: tok.drv1, body: { lat: 44.86, lon: 65.49 } })).status, 404, "чужая остановка");
  assert.deepEqual((await api("GET", "/api/my-route", { token: tok.drv2 })).body.stops[0].geo, { lat: 44.86, lon: 65.49 });
});

test("правка черновика, удаление, ручное закрытие", async () => {
  const a = await mkOrder("C1", "Магазин Один", { total: 100 });
  const b = await mkOrder("C2", "Магазин Два", { total: 200 });
  const date = dayPlus(2);
  const c = await api("POST", "/api/routes", { token: tok.sklad, body: { date, driverId: ids.drv1, orderIds: [a] } });
  assert.equal(c.status, 201);
  assert.equal((await api("PATCH", "/api/routes/" + c.body.id, { token: tok.sklad, body: { orderIds: [b, a] } })).status, 200);
  let s = (await api("GET", "/api/routes/" + c.body.id, { token: tok.sklad })).body;
  assert.deepEqual(s.stops.map((x) => x.orderId), [b, a]);
  assert.equal((await api("PATCH", "/api/routes/" + c.body.id, { token: tok.sklad, body: { orderIds: [a] } })).status, 200);
  s = (await api("GET", "/api/routes/" + c.body.id, { token: tok.sklad })).body;
  assert.deepEqual(s.stops.map((x) => x.orderId), [a]);
  assert.equal((await api("POST", "/api/routes/" + c.body.id + "/close", { token: tok.sklad })).status, 400, "черновик закрывать нельзя — его удаляют");
  assert.equal((await api("DELETE", "/api/routes/" + c.body.id, { token: tok.sklad })).status, 200);
  assert.equal((await api("GET", "/api/routes/" + c.body.id, { token: tok.sklad })).status, 404);
  const c2 = await api("POST", "/api/routes", { token: tok.sklad, body: { date, driverId: ids.drv1, orderIds: [a] } });
  await api("POST", `/api/routes/${c2.body.id}/send`, { token: tok.sklad });
  assert.equal((await api("POST", `/api/routes/${c2.body.id}/close`, { token: tok.sklad })).status, 200);
  const { rows: [o] } = await env.pool.query("SELECT status FROM orders WHERE id = $1", [a]);
  assert.equal(o.status, "Собран", "после ручного закрытия заказ остаётся «Собран»");
});

test("оплата по QR: разбивка по способам, лишнее отклоняется, отчёт «Оплаты» и QR в настройках", async () => {
  const a = await mkOrder("C1", "Магазин Один", { total: 10000 });
  const b = await mkOrder("C2", "Магазин Два", { total: 6000 });
  const date = dayPlus(3);
  const c = await api("POST", "/api/routes", { token: tok.oper, body: { date, driverId: ids.drv1, orderIds: [a, b] } });
  assert.equal(c.status, 201);
  await api("POST", `/api/routes/${c.body.id}/send`, { token: tok.oper });
  // лист на «завтра+3» водитель увидит, только если других переданных нет — закроем прежние
  const mine = await api("GET", "/api/my-route", { token: tok.drv1 });
  const sh = mine.body.sheet;
  assert.ok(sh, "водитель видит лист");
  const stops = mine.body.stops.filter((s) => [a, b].includes(s.orderId));
  const sa = stops.find((s) => s.orderId === a), sb = stops.find((s) => s.orderId === b);
  const bad = (body) => api("POST", `/api/my-route/stops/${sa.id}/done`, { token: tok.drv1, body });
  assert.equal((await bad({ payments: [{ method: "bitcoin", amount: 100 }] })).status, 400, "неизвестный способ");
  assert.equal((await bad({ payments: [{ method: "kaspi", amount: 20000 }] })).status, 400, "больше суммы заказа");
  assert.equal((await bad({ payments: [{ method: "kaspi", amount: 6000 }, { method: "cash", amount: 5000 }] })).status, 400, "сумма частей больше заказа");
  assert.equal((await bad({ payments: [{ method: "kaspi", amount: 6000 }, { method: "cash", amount: 3000 }] })).status, 200);
  assert.equal((await api("POST", `/api/my-route/stops/${sb.id}/done`, { token: tok.drv1, body: { payments: [{ method: "halyk", amount: 6000 }] } })).status, 200);
  const rep = await api("GET", "/api/routes/payments", { token: tok.oper });
  assert.equal(rep.status, 200);
  assert.equal(rep.body.totals.kaspi, 6000);
  assert.equal(rep.body.totals.halyk, 6000);
  assert.ok(rep.body.totals.cash >= 3000);
  assert.equal(rep.body.totals.later, 1000, "10000 − 6000 − 3000 остался «позже»");
  const row = rep.body.items.find((x) => x.method === "halyk");
  assert.equal(row.client, "Магазин Два");
  assert.equal(row.amount, 6000);
  for (const l of ["buh", "dir", "owner", "sklad"]) assert.equal((await api("GET", "/api/routes/payments", { token: tok[l] })).status, 200, l);
  assert.equal((await api("GET", "/api/routes/payments", { token: tok.tp1 })).status, 403, "ТП не видит оплаты");
  const { rows: [ev] } = await env.pool.query("SELECT note FROM order_events WHERE order_id = $1 AND event = 'Отгружен'", [b]);
  assert.match(ev.note, /Halyk QR/);

  // QR: водитель видит, чужие роли нет, менять может только тот, у кого настройки
  const qr = await api("GET", "/api/payment-qr", { token: tok.drv1 });
  assert.equal(qr.status, 200);
  assert.match(qr.body.kaspi, /^data:image\/jpeg;base64,/);
  assert.match(qr.body.halyk, /^data:image\/jpeg;base64,/);
  assert.equal((await api("GET", "/api/payment-qr", { token: tok.tp1 })).status, 403);
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  assert.equal((await api("PUT", "/api/payment-qr/kaspi", { token: tok.drv1, body: { image: png } })).status, 403);
  assert.equal((await api("PUT", "/api/payment-qr/kaspi", { token: tok.oper, body: { image: "http://x/y.png" } })).status, 400);
  assert.equal((await api("PUT", "/api/payment-qr/visa", { token: tok.oper, body: { image: png } })).status, 400);
  assert.equal((await api("PUT", "/api/payment-qr/kaspi", { token: tok.oper, body: { image: png } })).status, 200);
  assert.equal((await api("GET", "/api/payment-qr", { token: tok.drv1 })).body.kaspi, png);
});
