// Тесты GPS экспедиторов: рейс, приём точек, права, карта, маршрут, пробег, проблема «нет сигнала».
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";

let env, api, cleanPoint, signalStatus; // сервис импортируем после настройки окружения
const tok = {};
const ids = {};
const login = async (l, p) => (await api("POST", "/api/auth/login", { body: { login: l, password: p } })).body.token;

// Кызылорда — точки по прямой на восток примерно через 100 м
const BASE = { lat: 44.8488, lon: 65.4823 };
const pt = (i, secAgo, extra = {}) => ({ t: Date.now() - secAgo * 1000, lat: BASE.lat, lon: BASE.lon + i * 0.00127, acc: 8, spd: 5, hdg: 90, ...extra });

before(async () => {
  env = await startEnv();
  api = env.api;
  ({ cleanPoint, signalStatus } = await import("../src/services/fleet.js"));
  tok.owner = await login(OWNER.login, OWNER.password);
  for (const [l, role] of [["drv1", "driver"], ["drv2", "driver"], ["dir", "director"], ["tp1", "tp"], ["sklad", "warehouse"], ["buh", "accountant"]]) {
    const u = await api("POST", "/api/users", { token: tok.owner, body: { login: l, name: "Имя " + l, role, password: "Passw0rd1", manager1c: role === "tp" ? "Ахметов Ержан" : undefined } });
    ids[l] = u.body.id;
    tok[l] = await login(l, "Passw0rd1");
  }
});
after(async () => { await env?.stop(); });

test("проверка точки: мусор отбрасывается", () => {
  const now = Date.now();
  assert.ok(cleanPoint({ t: now, lat: 44.8, lon: 65.5, acc: 10 }, now));
  assert.equal(cleanPoint({ t: now, lat: 95, lon: 65.5 }, now), null, "широта вне пределов");
  assert.equal(cleanPoint({ t: now, lat: 0, lon: 0 }, now), null, "ноль-ноль");
  assert.equal(cleanPoint({ t: now + 10 * 60_000, lat: 44.8, lon: 65.5 }, now), null, "из будущего");
  assert.equal(cleanPoint({ t: now - 2 * 86400_000, lat: 44.8, lon: 65.5 }, now), null, "старше суток");
  assert.equal(cleanPoint({ t: now, lat: 44.8, lon: 65.5, acc: 5000 }, now), null, "точность хуже 1 км");
  assert.equal(cleanPoint({ t: now, lat: "abc", lon: 65.5 }, now), null);
  assert.equal(cleanPoint({ t: now, lat: 44.8, lon: 65.5, spd: -3 }, now).spd, null, "отрицательная скорость → пусто");
  assert.equal(signalStatus(false, 10), "off");
  assert.equal(signalStatus(true, 60), "ok");
  assert.equal(signalStatus(true, 200), "late");
  assert.equal(signalStatus(true, 400), "lost");
});

test("вне рейса точки не принимаются", async () => {
  const r = await api("POST", "/api/fleet/points", { token: tok.drv1, body: { points: [pt(0, 5)] } });
  assert.equal(r.status, 409);
  const { rows } = await env.pool.query("SELECT count(*)::int AS n FROM gps_points");
  assert.equal(rows[0].n, 0);
});

test("права: передавать может только водитель, карту видят владелец и директор", async () => {
  for (const l of ["tp1", "sklad", "buh", "dir", "owner"]) {
    assert.equal((await api("POST", "/api/fleet/trip/start", { token: tok[l] })).status, 403, l + " не может начать рейс");
    assert.equal((await api("POST", "/api/fleet/points", { token: tok[l], body: { points: [pt(0, 1)] } })).status, 403, l);
  }
  for (const l of ["tp1", "sklad", "buh", "drv1"]) {
    assert.equal((await api("GET", "/api/fleet/live", { token: tok[l] })).status, 403, l + " не видит карту");
    assert.equal((await api("GET", `/api/fleet/track?driver=${ids.drv1}`, { token: tok[l] })).status, 403, l);
  }
  assert.equal((await api("GET", "/api/fleet/live")).status, 401);
  assert.equal((await api("GET", "/api/fleet/live", { token: tok.dir })).status, 200);
});

test("рейс: начать, повторное нажатие не создаёт второй рейс", async () => {
  const a = await api("POST", "/api/fleet/trip/start", { token: tok.drv1 });
  assert.equal(a.status, 201, a.raw);
  const b = await api("POST", "/api/fleet/trip/start", { token: tok.drv1 });
  assert.equal(b.status, 200);
  assert.equal(b.body.resumed, true);
  assert.equal(b.body.trip.id, a.body.trip.id);
  const m = await api("GET", "/api/fleet/trip", { token: tok.drv1 });
  assert.equal(m.body.trip.id, a.body.trip.id);
});

test("точки: пачка, дубли, мусор, пробег", async () => {
  const pts = [pt(0, 40), pt(1, 30), pt(2, 20), pt(3, 10)];
  const r = await api("POST", "/api/fleet/points", { token: tok.drv1, body: { points: [...pts, { t: Date.now(), lat: 200, lon: 1 }] } });
  assert.equal(r.status, 200, r.raw);
  assert.equal(r.body.accepted, 4);
  assert.equal(r.body.rejected, 1);
  assert.ok(r.body.km > 0.25 && r.body.km < 0.35, "≈300 м: " + r.body.km);
  // повтор той же пачки (телефон не получил ответ) — без дублей, пробег не растёт
  const again = await api("POST", "/api/fleet/points", { token: tok.drv1, body: { points: pts } });
  assert.equal(again.body.accepted, 0);
  assert.equal(again.body.duplicate, 4);
  assert.equal(again.body.km, r.body.km);
  // дрожание на месте и невозможный скачок пробег не увеличивают
  const jitter = await api("POST", "/api/fleet/points", { token: tok.drv1, body: { points: [pt(3.02, 8), pt(300, 6)] } });
  assert.equal(jitter.body.accepted, 2);
  assert.equal(jitter.body.km, r.body.km, "скачок ~30 км за 2 сек отброшен");
  assert.equal((await api("POST", "/api/fleet/points", { token: tok.drv1, body: { points: [] } })).status, 400);
  assert.equal((await api("POST", "/api/fleet/points", { token: tok.drv1, body: { points: Array.from({ length: 301 }, (_, i) => pt(i, 1)) } })).status, 400);
});

test("карта: водитель в рейсе с последней точкой и статусом", async () => {
  const r = await api("GET", "/api/fleet/live", { token: tok.owner });
  assert.equal(r.status, 200);
  const d1 = r.body.drivers.find((d) => d.login === "drv1");
  const d2 = r.body.drivers.find((d) => d.login === "drv2");
  assert.equal(d1.inTrip, true);
  assert.equal(d1.status, "ok");
  assert.ok(Math.abs(d1.last.lon - (BASE.lon + 300 * 0.00127)) < 1e-9, "последняя по времени точка");
  assert.equal(d1.last.speedKmh, 18);
  assert.equal(d2.inTrip, false);
  assert.equal(d2.status, "off");
  assert.equal(d2.last, null);
  assert.equal(r.body.drivers.length, 2, "в списке только водители");
});

test("маршрут за день", async () => {
  const r = await api("GET", `/api/fleet/track?driver=${ids.drv1}`, { token: tok.dir });
  assert.equal(r.status, 200, r.raw);
  assert.equal(r.body.points.length, 6);
  assert.ok(r.body.points[0].at < r.body.points[5].at, "по времени");
  assert.equal(r.body.trips.length, 1);
  assert.equal((await api("GET", `/api/fleet/track?driver=${ids.tp1}`, { token: tok.dir })).status, 404, "не водитель");
  assert.equal((await api("GET", `/api/fleet/track?driver=${ids.drv1}&date=2026-13-45`, { token: tok.dir })).status, 400);
  assert.equal((await api("GET", `/api/fleet/track?driver=${ids.drv1}&date=2020-01-01`, { token: tok.dir })).body.points.length, 0);
});

test("нет сигнала больше 5 минут — проблема для владельца", async () => {
  await api("POST", "/api/fleet/trip/start", { token: tok.drv2 });
  await env.pool.query("UPDATE trips SET started_at = now() - interval '10 minutes' WHERE user_id = $1", [ids.drv2]);
  const live = await api("GET", "/api/fleet/live", { token: tok.owner });
  assert.equal(live.body.drivers.find((d) => d.login === "drv2").status, "lost");
  const p = await api("GET", "/api/problems", { token: tok.owner });
  const gps = p.body.items.find((x) => x.code === "gps");
  assert.ok(gps, JSON.stringify(p.body.items));
  assert.match(gps.detail, /Имя drv2/);
  const tp = await api("GET", "/api/problems", { token: tok.tp1 });
  assert.equal(tp.body.items.find((x) => x.code === "gps"), undefined, "ТП это не видит");
});

test("завершить рейс: дальше точки не принимаются", async () => {
  const e = await api("POST", "/api/fleet/trip/end", { token: tok.drv1 });
  assert.equal(e.status, 200);
  assert.ok(e.body.trip.endedAt);
  assert.equal((await api("POST", "/api/fleet/trip/end", { token: tok.drv1 })).status, 400);
  assert.equal((await api("POST", "/api/fleet/points", { token: tok.drv1, body: { points: [pt(400, 1)] } })).status, 409);
  const live = await api("GET", "/api/fleet/live", { token: tok.owner });
  const d1 = live.body.drivers.find((d) => d.login === "drv1");
  assert.equal(d1.status, "off");
  assert.ok(d1.kmToday > 0.25, "км за сегодня сохранились");
  const audit = await env.pool.query("SELECT action FROM audit_log WHERE action LIKE 'trip.%' ORDER BY id");
  assert.deepEqual(audit.rows.map((r) => r.action), ["trip.start", "trip.start", "trip.end"]);
});
