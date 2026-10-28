// Заказы ТП, каталог, смены администратора и настройки.
import { Router } from "express";
import { ah } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import { catalog } from "../services/catalog.js";
import * as orders from "../services/orders.js";
import * as shifts from "../services/shifts.js";
import { getSettings, saveSettings } from "../services/settings.js";
import { audit } from "../services/audit.js";
import { can } from "../services/rbac.js";
import { HttpError } from "../lib/http.js";

const r = Router();
r.use(requireAuth);

r.get("/catalog", ah(async (req, res) => res.json(await catalog(req.user))));

r.get("/orders", ah(async (req, res) => res.json(await orders.listOrders(req.user, req.query))));
r.post("/orders", ah(async (req, res) => {
  const o = await orders.createOrder(req.user, req.body || {});
  await audit(req, "order.create", o.number, { total: o.total, lines: o.lines });
  res.status(201).json(o);
}));
r.patch("/orders/:id", ah(async (req, res) => {
  const out = await orders.setStatus(req.user, req.params.id, req.body?.status, req.body?.note);
  await audit(req, "order.status", req.params.id, { status: req.body?.status });
  res.json(out);
}));
r.post("/orders/:id/retry-1c", ah(async (req, res) => res.json(await orders.retry1c(req.user, req.params.id))));

r.get("/shift", ah(async (req, res) => res.json(await shifts.currentShift(req.user))));
r.post("/shift/start", ah(async (req, res) => {
  const s = await shifts.startShift(req.user);
  await audit(req, "shift.start", String(s.id));
  res.status(201).json(s);
}));
r.post("/shift/end", ah(async (req, res) => {
  const s = await shifts.endShift(req.user);
  await audit(req, "shift.end", String(s.id), { orders: s.report.orders.count, revenue1c: s.report.sales1c.revenue });
  res.json(s);
}));

r.get("/settings", ah(async (req, res) => {
  if (!can(req.user, "settings") && !can(req.user, "shift")) throw new HttpError(403, "Нет доступа");
  res.json(await getSettings());
}));
r.put("/settings", ah(async (req, res) => {
  const s = await saveSettings(req.user, req.body || {});
  await audit(req, "settings.save", null, req.body);
  res.json(s);
}));

export default r;
