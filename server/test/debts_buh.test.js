// Тесты TZ_DEBTS_BUH: долги из 1С:Бухгалтерии (счёт 1274) вместо УТП.
// Сальдо Бухгалтерии — итог долга; отгрузки по дням — для возраста; сопоставление по названию.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";
import { day } from "./fixtures/sample.js";

let env, api, tok;
const send = (entity, body) => api("POST", `/api/sync/1c/${entity}`, { agent: true, body });
const range = `from=${day(-6)}&to=${day(0)}`;
const open = async () => (await env.pool.query(
  "SELECT client_code, doc_name, amount::float AS amount FROM onec_debts_open ORDER BY client_code, doc_date NULLS FIRST")).rows
  .map((r) => [r.client_code, r.doc_name, r.amount]);

before(async () => {
  env = await startEnv();
  api = env.api;
  tok = (await api("POST", "/api/auth/login", { body: { login: OWNER.login, password: OWNER.password } })).body.token;
  await send("clients", { rows: [
    { code: "К-1", name: "Маг Азат", manager: "Жасулан" },
    { code: "К-2", name: "Маг Айда", manager: "Жасулан" },
    { code: "К-3", name: "Маг Акенже", manager: "Жасулан" },
  ] });
  // в УТП оплаты не доходят — «вечный» долг
  const r = await send("debts", { rows: [{ client: "К-1", docDate: day(-100), docName: "Реализация 1", amount: 999000 }] });
  assert.equal(r.status, 200, r.raw);
});
after(async () => { await env?.stop(); });

test("пока Бухгалтерия ничего не прислала — долги из УТП", async () => {
  assert.deepEqual(await open(), [["К-1", "Реализация 1", 999000]]);
});

test("агент присылает сальдо и отгрузки 1274 — долг как в Бухгалтерии", async () => {
  const r = await send("debts_buh", { rows: [
    // «Маг  азат» — другой регистр и двойной пробел, код Бухгалтерии свой
    { kind: "bal", client: "000001", clientName: "Маг  азат", dt: "0001-01-01", amount: 60000 },
    { kind: "dt", client: "000001", clientName: "Маг  азат", dt: day(-40), amount: 100000 },
    { kind: "dt", client: "000001", clientName: "Маг  азат", dt: day(-25), amount: 50000 },
    { kind: "dt", client: "000001", clientName: "Маг  азат", dt: day(-5), amount: 30000 },
    // переплата
    { kind: "bal", client: "000002", clientName: "Маг Айда", amount: -5000 },
    { kind: "dt", client: "000002", clientName: "Маг Айда", dt: day(-10), amount: 20000 },
    // долг больше отгрузок за год: 12 000 — старый
    { kind: "bal", client: "000003", clientName: "Маг Акенже", amount: 20000 },
    { kind: "dt", client: "000003", clientName: "Маг Акенже", dt: day(-3), amount: 8000 },
    // нет в УТП
    { kind: "bal", client: "000009", clientName: "Маг Неизвестный", amount: 7000 },
  ] });
  assert.equal(r.status, 200, r.raw);
  assert.deepEqual(await open(), [
    ["Б:000009", "Долг старше года (Бухгалтерия)", 7000],
    ["К-1", `Отгрузка ${new Date(day(-25)).toLocaleDateString("ru-RU")}`, 30000],
    ["К-1", `Отгрузка ${new Date(day(-5)).toLocaleDateString("ru-RU")}`, 30000],
    ["К-3", "Долг старше года (Бухгалтерия)", 12000],
    ["К-3", `Отгрузка ${new Date(day(-3)).toLocaleDateString("ru-RU")}`, 8000],
  ]);
  const c = await api("GET", `/api/clients?${range}`, { token: tok });
  const by = Object.fromEntries(c.body.items.map((x) => [x.code, x]));
  assert.equal(by["К-1"].debt, 60000);
  assert.equal(by["К-1"].overdue, 30000);
  assert.equal(by["К-2"].debt, 0);
  assert.equal(by["К-3"].debt, 20000);
  assert.equal(by["К-3"].overdue, 12000, "долг без даты — просрочен");
});

test("настройки: сопоставление и список не найденных", async () => {
  const r = await api("GET", "/api/settings/debts", { token: tok });
  assert.equal(r.status, 200, r.raw);
  assert.equal(r.body.active, "buh");
  assert.equal(r.body.matched, 3);
  assert.equal(r.body.unmatched, 1);
  assert.equal(r.body.buhTotal, 87000);
  assert.equal(r.body.openTotal, 87000);
  assert.deepEqual(r.body.unmatchedTop, [{ code: "000009", name: "Маг Неизвестный", amount: 7000 }]);
});

test("переключение на УТП и обратно", async () => {
  let r = await api("PUT", "/api/settings", { token: tok, body: { debtsSource: "utp" } });
  assert.equal(r.status, 200, r.raw);
  assert.deepEqual(await open(), [["К-1", "Реализация 1", 999000]]);
  r = await api("PUT", "/api/settings", { token: tok, body: { debtsSource: "x" } });
  assert.equal(r.status, 400);
  await api("PUT", "/api/settings", { token: tok, body: { debtsSource: "buh" } });
  assert.equal((await open()).length, 5);
});

test("неверный kind — ошибка, данные не меняются", async () => {
  const r = await send("debts_buh", { rows: [{ kind: "zz", client: "1", amount: 1 }] });
  assert.equal(r.status, 400);
  assert.equal((await open()).length, 5);
});

test("БИН/ИИН: контрагент с другим названием в Бухгалтерии находится по БИН; повтор БИН в УТП — по названию", async () => {
  await send("clients", { rows: [
    { code: "К-1", name: "Маг Азат", manager: "Жасулан" },
    { code: "К-2", name: "Маг Айда", manager: "Жасулан" },
    { code: "К-3", name: "Маг Акенже", manager: "Жасулан" },
    { code: "К-9", name: "ТОО Рахат", manager: "Жасулан" },
    { code: "К-10", name: "ИП Рахат-2", manager: "Жасулан" },
  ] });
  assert.equal((await send("client_bins", { rows: [
    { code: "К-9", bin: "123456789012" },
    { code: "К-1", bin: "111111111111" }, { code: "К-10", bin: "111111111111" }, // один БИН у двух клиентов УТП — не доверяем
    { code: "К-2", bin: "12345" },                                              // не 12 цифр — мусор
  ] })).status, 200);
  assert.equal((await send("buh_bins", { rows: [
    { code: "000009", bin: "1234 5678 9012" },  // пробелы в БИН убираем
    { code: "000001", bin: "111111111111" },
    { code: "000002", bin: "12345" },
  ] })).status, 200);
  await send("debts_buh", { rows: [
    { kind: "bal", client: "000009", clientName: "Рахат ТОО (Кызылорда)", amount: 40000 },
    { kind: "dt", client: "000009", clientName: "Рахат ТОО (Кызылорда)", dt: day(-3), amount: 40000 },
    { kind: "bal", client: "000001", clientName: "Маг  азат", amount: 10000 },
    { kind: "dt", client: "000001", clientName: "Маг  азат", dt: day(-2), amount: 10000 },
  ] });
  const { rows } = await env.pool.query("SELECT buh_code, client_code, matched, matched_by FROM onec_debts_buh_map WHERE buh_code IN ('000009', '000001') ORDER BY 1");
  assert.deepEqual(rows, [
    { buh_code: "000001", client_code: "К-1", matched: true, matched_by: "name" }, // БИН не однозначен → по названию
    { buh_code: "000009", client_code: "К-9", matched: true, matched_by: "bin" },
  ]);
  assert.ok((await open()).some((r) => r[0] === "К-9" && r[2] === 40000), "долг пришёл на клиента, найденного по БИН");
  const info = await api("GET", "/api/settings/debts", { token: tok });
  assert.equal(info.body.byBin, 1);
  assert.equal(info.body.binsReady, true);
});
