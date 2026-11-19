// Тесты GPS в фоне через Traccar Client: приём по ключу, форматы, рейс, ключи водителей.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";

let env, api, parseTraccar, pool;
const tok = {};
const login = async (l, p) => (await api("POST", "/api/auth/login", { body: { login: l, password: p } })).body.token;
const BASE = { lat: 44.8488, lon: 65.4823 };

before(async () => {
  env = await startEnv();
  api = env.api; pool = env.pool;
  ({ parseTraccar } = await import("../src/services/fleet.js"));
  tok.owner = await login(OWNER.login, OWNER.password);
  for (const [l, role] of [["drv1", "driver"], ["tp1", "tp"], ["dir", "director"]]) {
    const u = await api("POST", "/api/users", { token: tok.owner, body: { login: l, name: "Имя " + l, role, password: "Passw0rd1", manager1c: role === "tp" ? "Ахметов Ержан" : undefined } });
    tok[l + "_id"] = u.body.id;
    tok[l] = await login(l, "Passw0rd1");
  }
});
after(async () => { await env?.stop(); });

test("разбор OsmAnd: узлы → м/с, секунды → дата", () => {
  const now = Math.floor(Date.now() / 1000);
  const { key, point } = parseTraccar({ id: "abc", lat: "44.85", lon: "65.48", timestamp: String(now), speed: "10", bearing: "90", accuracy: "12" });
  assert.equal(key, "abc");
  assert.ok(Math.abs(point.spd - 5.14444) < 0.01);
  assert.equal(point.hdg, 90);
  assert.equal(parseTraccar({ id: "abc", lat: "x", lon: "1" }).point, null);
});

test("разбор JSON нового Traccar Client", () => {
  const { key, point } = parseTraccar({}, { device_id: "k1", location: { timestamp: new Date().toISOString(), coords: { latitude: 44.85, longitude: 65.48, speed: 4, heading: 10, accuracy: 5 } } });
  assert.equal(key, "k1");
  assert.equal(point.spd, 4);
});

test("ключи: выпускают владелец/директор, ТП и водитель — нет", async () => {
  assert.equal((await api("GET", "/api/fleet/gps-keys", { token: tok.tp1 })).status, 403);
  assert.equal((await api("GET", "/api/fleet/gps-keys", { token: tok.drv1 })).status, 403);
  const r = await api("POST", `/api/fleet/gps-keys/${tok.drv1_id}`, { token: tok.dir });
  assert.equal(r.status, 200);
  assert.match(r.body.key, /^[a-z2-9]{16}$/);
  tok.key1 = r.body.key;
  const again = await api("POST", `/api/fleet/gps-keys/${tok.drv1_id}`, { token: tok.owner });
  assert.notEqual(again.body.key, tok.key1, "новый ключ заменяет старый");
  tok.oldKey = tok.key1; tok.key1 = again.body.key;
  const list = await api("GET", "/api/fleet/gps-keys", { token: tok.owner });
  assert.equal(list.body.items.find((x) => x.login === "drv1").key, tok.key1);
  assert.equal((await api("POST", `/api/fleet/gps-keys/${tok.tp1_id}`, { token: tok.owner })).status, 404, "только водителям");
});

const send = (key, i = 0, extra = "") =>
  api("GET", `/api/fleet/traccar?id=${key}&lat=${BASE.lat}&lon=${BASE.lon + i * 0.00127}&timestamp=${Math.floor(Date.now() / 1000) - 120 + i * 10}&speed=10${extra}`);

test("неверный ключ → 401, ничего не сохраняется", async () => {
  assert.equal((await send("nope")).status, 401);
  assert.equal((await send(tok.oldKey)).status, 401, "старый ключ не работает");
  assert.equal((await api("GET", "/api/fleet/traccar?lat=1&lon=1")).status, 401);
  const { rows } = await pool.query("SELECT count(*)::int n FROM gps_points");
  assert.equal(rows[0].n, 0);
});

test("первая точка открывает рейс, повтор не дублируется, виден на карте", async () => {
  assert.equal((await send(tok.key1, 0)).status, 200);
  assert.equal((await send(tok.key1, 0)).status, 200);
  for (let i = 1; i <= 3; i++) await send(tok.key1, i);
  const { rows } = await pool.query("SELECT source, ended_at FROM trips");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "traccar");
  assert.equal(rows[0].ended_at, null);
  const pts = await pool.query("SELECT count(*)::int n FROM gps_points");
  assert.equal(pts.rows[0].n, 4);
  const live = await api("GET", "/api/fleet/live", { token: tok.dir });
  const d = live.body.drivers.find((x) => x.login === "drv1");
  assert.equal(d.inTrip, true);
  assert.ok(d.tripKm > 0.2, "пробег считается");
});

test("JSON-запрос (POST) тоже принимается", async () => {
  const r = await api("POST", "/api/fleet/traccar", { body: { device_id: tok.key1, location: { timestamp: new Date().toISOString(), coords: { latitude: BASE.lat, longitude: BASE.lon + 0.01, speed: 3, accuracy: 5 } } } });
  assert.equal(r.status, 200);
});

test("нет точек 30 минут → рейс закрывается, следующая точка открывает новый", async () => {
  await pool.query("UPDATE gps_points SET at = at - interval '2 hours'");
  await pool.query("UPDATE trips SET started_at = started_at - interval '2 hours'");
  const live = await api("GET", "/api/fleet/live", { token: tok.owner });
  assert.equal(live.body.drivers.find((x) => x.login === "drv1").inTrip, false);
  assert.equal((await send(tok.key1, 5)).status, 200);
  const { rows } = await pool.query("SELECT ended_at FROM trips ORDER BY id");
  assert.equal(rows.length, 2);
  assert.ok(rows[0].ended_at && !rows[1].ended_at);
});

test("мусорная точка не ломает приложение (200, не сохраняется)", async () => {
  const before = (await pool.query("SELECT count(*)::int n FROM gps_points")).rows[0].n;
  assert.equal((await api("GET", `/api/fleet/traccar?id=${tok.key1}&lat=999&lon=1`)).status, 200);
  assert.equal((await pool.query("SELECT count(*)::int n FROM gps_points")).rows[0].n, before);
});
