// Тесты TZ_APP_LOGIN_PRICES, часть B: долгий вход по устройствам, обновление доступа, выход, отзыв.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startEnv, OWNER } from "./helpers.js";

let env, api;
const login = (l, p, ua) => api("POST", "/api/auth/login", { body: { login: l, password: p }, headers: ua ? { "user-agent": ua } : {} });
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0";

before(async () => {
  env = await startEnv();
  api = env.api;
  const o = (await login(OWNER.login, OWNER.password)).body.token;
  await api("POST", "/api/users", { token: o, body: { login: "tp1", name: "ТП", role: "tp", password: "Passw0rd1" } });
});
after(async () => { await env?.stop(); });

test("вход выдаёт токен доступа и токен входа; хранится только хэш", async () => {
  const r = await login("tp1", "Passw0rd1", ANDROID);
  assert.equal(r.status, 200, r.raw);
  assert.ok(r.body.token && r.body.refreshToken && r.body.refreshToken.length >= 40);
  const { rows } = await env.pool.query("SELECT s.token_hash, s.device, s.expires_at > now() + interval '89 days' AS long FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.login = 'tp1'");
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, r.body.refreshToken, "в базе не сам токен");
  assert.equal(rows[0].device, "Android · Chrome");
  assert.equal(rows[0].long, true, "вход на 90 дней");
});

test("обновление: новый доступ по токену входа, токен входа остаётся прежним и продлевается", async () => {
  const r = await login("tp1", "Passw0rd1", WINDOWS);
  await env.pool.query("UPDATE sessions SET expires_at = now() + interval '5 days' WHERE token_hash = encode(sha256($1::bytea), 'hex')", [r.body.refreshToken]);
  const a = await api("POST", "/api/auth/refresh", { body: { refreshToken: r.body.refreshToken } });
  assert.equal(a.status, 200, a.raw);
  assert.equal((await api("GET", "/api/auth/me", { token: a.body.token })).body.user.login, "tp1");
  const { rows } = await env.pool.query("SELECT expires_at > now() + interval '89 days' AS long FROM sessions WHERE token_hash = encode(sha256($1::bytea), 'hex')", [r.body.refreshToken]);
  assert.equal(rows[0].long, true, "продлён до 90 дней");
  // повторное обновление тем же токеном работает (две вкладки, потерянный ответ — не выбрасывают)
  assert.equal((await api("POST", "/api/auth/refresh", { body: { refreshToken: r.body.refreshToken } })).status, 200);
  assert.equal((await api("POST", "/api/auth/refresh", { body: { refreshToken: "левый-токен-левый-токен-левый-токен" } })).status, 401);
});

test("истёкший вход не обновляется", async () => {
  const r = await login("tp1", "Passw0rd1");
  await env.pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = encode(sha256($1::bytea), 'hex')", [r.body.refreshToken]);
  assert.equal((await api("POST", "/api/auth/refresh", { body: { refreshToken: r.body.refreshToken } })).status, 401);
  assert.equal((await api("GET", "/api/auth/me", { token: r.body.token })).status, 401, "и доступ этой сессии тоже");
});

test("выход закрывает вход на этом устройстве и сразу отключает доступ", async () => {
  const a = await login("tp1", "Passw0rd1"), b = await login("tp1", "Passw0rd1");
  assert.equal((await api("POST", "/api/auth/logout", { body: { refreshToken: a.body.refreshToken } })).status, 200);
  assert.equal((await api("GET", "/api/auth/me", { token: a.body.token })).status, 401);
  assert.equal((await api("POST", "/api/auth/refresh", { body: { refreshToken: a.body.refreshToken } })).status, 401);
  assert.equal((await api("GET", "/api/auth/me", { token: b.body.token })).status, 200, "другое устройство не тронуто");
});

test("«Мои устройства»: список и отзыв чужого входа, но не чужих пользователей", async () => {
  const a = await login("tp1", "Passw0rd1", ANDROID), b = await login("tp1", "Passw0rd1", WINDOWS);
  const list = await api("GET", "/api/auth/sessions", { token: a.body.token });
  assert.equal(list.status, 200);
  const cur = list.body.filter((x) => x.current);
  assert.equal(cur.length, 1);
  assert.equal(cur[0].device, "Android · Chrome");
  const other = list.body.find((x) => x.device === "Windows · Edge" && !x.current);
  assert.ok(other);
  assert.equal((await api("DELETE", `/api/auth/sessions/${other.id}`, { token: a.body.token })).status, 200);
  assert.equal((await api("GET", "/api/auth/me", { token: b.body.token })).status, 401, "отозванное устройство вышло");
  assert.equal((await api("GET", "/api/auth/me", { token: a.body.token })).status, 200);
});

test("смена пароля закрывает другие входы, текущее устройство получает новые токены", async () => {
  const a = await login("tp1", "Passw0rd1"), b = await login("tp1", "Passw0rd1");
  const p = await api("POST", "/api/auth/password", { token: a.body.token, body: { oldPassword: "Passw0rd1", newPassword: "Passw0rd2" } });
  assert.equal(p.status, 200, p.raw);
  assert.ok(p.body.token && p.body.refreshToken);
  assert.equal((await api("GET", "/api/auth/me", { token: p.body.token })).status, 200);
  assert.equal((await api("POST", "/api/auth/refresh", { body: { refreshToken: p.body.refreshToken } })).status, 200);
  assert.equal((await api("POST", "/api/auth/refresh", { body: { refreshToken: b.body.refreshToken } })).status, 401, "старое устройство вышло");
  await api("POST", "/api/auth/password", { token: p.body.token, body: { oldPassword: "Passw0rd2", newPassword: "Passw0rd1" } });
});

test("владелец: выйти на всех устройствах за сотрудника; блокировка закрывает входы", async () => {
  const o = (await login(OWNER.login, OWNER.password)).body.token;
  const a = await login("tp1", "Passw0rd1");
  const id = (await api("GET", "/api/users", { token: o })).body.find((u) => u.login === "tp1").id;
  assert.equal((await api("POST", `/api/users/${id}/logout`, { token: o })).status, 200);
  assert.equal((await api("POST", "/api/auth/refresh", { body: { refreshToken: a.body.refreshToken } })).status, 401);
  const b = await login("tp1", "Passw0rd1");
  await api("PATCH", `/api/users/${id}`, { token: o, body: { isActive: false } });
  assert.equal((await api("POST", "/api/auth/refresh", { body: { refreshToken: b.body.refreshToken } })).status, 401);
  assert.equal((await env.pool.query("SELECT count(*)::int AS n FROM sessions WHERE user_id = $1", [id])).rows[0].n, 0);
  await api("PATCH", `/api/users/${id}`, { token: o, body: { isActive: true } });
});

test("logout-all: все устройства выходят", async () => {
  const a = await login("tp1", "Passw0rd1"), b = await login("tp1", "Passw0rd1");
  assert.equal((await api("POST", "/api/auth/logout-all", { token: a.body.token })).status, 200);
  assert.equal((await api("GET", "/api/auth/me", { token: b.body.token })).status, 401);
  assert.equal((await api("POST", "/api/auth/refresh", { body: { refreshToken: b.body.refreshToken } })).status, 401);
});
