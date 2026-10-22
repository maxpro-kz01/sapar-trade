// Приём данных от агента 1С (по ключу) и статус интеграции (владелец/директор/бухгалтер).
import { Router } from "express";
import { ah } from "../lib/http.js";
import { requireAgent, requireAuth, requirePerm } from "../middleware/auth.js";
import { ingest, syncStatus, ENTITIES } from "../services/sync.js";
import { config } from "../config.js";
import { q } from "../db/pool.js";

const r = Router();

r.get("/1c/ping", requireAgent, (req, res) =>
  res.json({ ok: true, entities: Object.keys(ENTITIES), serverTime: new Date().toISOString() }));

r.post("/1c/:entity", requireAgent, ah(async (req, res) => {
  res.json(await ingest(req.params.entity, req.body, req.get("x-agent-host")));
}));

r.get("/status", requireAuth, requirePerm("sync"), ah(async (req, res) => {
  const status = await syncStatus(config.staleMinutes);
  const { rows } = await q(
    "SELECT id, entity, started_at, finished_at, ok, rows_in, error, agent_host FROM sync_runs ORDER BY id DESC LIMIT 50");
  res.json({ ...status, log: rows });
}));

export default r;
