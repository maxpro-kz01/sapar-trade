// Тестовое окружение: настоящий PostgreSQL (embedded-postgres) во временной папке + приложение на случайном порту.
import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const AGENT_KEY = "test-agent-key-0123456789";
export const OWNER = { login: "owner", password: "Owner12345" };

export async function startEnv({ port: appPort = 0 } = {}) {
  const port = 15432 + Math.floor(Math.random() * 1000);
  const pg = new EmbeddedPostgres({ databaseDir: join(mkdtempSync(join(tmpdir(), "st-pg-")), "data"), onLog: (m) => process.env.PG_DEBUG && console.error(String(m)), onError: (e) => process.env.PG_DEBUG && console.error(String(e)), user: "st", password: "st", port, persistent: false, initdbFlags: ["--lc-messages=C", "--locale=C.UTF-8", "--encoding=UTF8"] });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("st");

  Object.assign(process.env, {
    DATABASE_URL: `postgres://st:st@localhost:${port}/st`,
    JWT_SECRET: "test-secret-test-secret-test-secret",
    AGENT_KEY,
    BOOTSTRAP_OWNER_LOGIN: OWNER.login,
    BOOTSTRAP_OWNER_PASSWORD: OWNER.password,
    PRICE_TYPE: "",
  });
  const { migrate } = await import("../src/db/migrate.js");
  const { ensureBootstrapOwner } = await import("../src/services/users.js");
  const { config } = await import("../src/config.js");
  const { createApp } = await import("../src/app.js");
  const { pool } = await import("../src/db/pool.js");
  await migrate();
  await ensureBootstrapOwner(config.bootstrapOwner);

  const server = await new Promise((ok) => { const s = createApp().listen(appPort, () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const api = async (method, path, { body, token, agent, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(agent ? { "x-agent-key": agent === true ? AGENT_KEY : agent, "x-agent-host": "srv1c" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, raw: text };
  };

  const stop = async () => {
    await new Promise((ok) => server.close(ok));
    await pool.end();
    await pg.stop();
  };
  return { api, stop, pool, base };
}
