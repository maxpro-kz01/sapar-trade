// Отчёты для экранов системы управления. Права проверяются в services/reports.js.
import { Router } from "express";
import { ah, period } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import * as rep from "../services/reports.js";
import { audit } from "../services/audit.js";

const r = Router();
r.use(requireAuth);

const flag = (v) => v === "1" || v === "true";

r.get("/dashboard", ah(async (req, res) => {
  res.json(await rep.dashboard(req.user, period(req.query)));
}));

r.get("/sales", ah(async (req, res) => {
  res.json(await rep.sales(req.user, { ...period(req.query), group: req.query.group || "day", limit: req.query.limit }));
}));

r.get("/stock", ah(async (req, res) => {
  res.json(await rep.stock(req.user, { warehouse: req.query.warehouse, search: req.query.q, onlyLow: flag(req.query.low), limit: req.query.limit }));
}));

r.get("/clients", ah(async (req, res) => {
  res.json(await rep.clients(req.user, { ...period(req.query), search: req.query.q, onlyDebtors: flag(req.query.debtors), limit: req.query.limit }));
}));

// Отметка в журнале при выгрузке (экспорт делает браузер из уже полученных данных)
r.post("/export-log", ah(async (req, res) => {
  await audit(req, "export", String(req.body?.screen || "").slice(0, 60), { rows: Number(req.body?.rows) || 0 });
  res.json({ ok: true });
}));

export default r;
