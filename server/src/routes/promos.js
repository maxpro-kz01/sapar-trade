// Акции с подарком: создают и меняют владелец и директор (promos.edit). Действующие акции все видят в каталоге (/api/catalog).
import { Router } from "express";
import { ah } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import * as pr from "../services/promos.js";
import { audit } from "../services/audit.js";

const r = Router();
r.use(requireAuth);

r.get("/promos", ah(async (req, res) => res.json({ items: await pr.listPromos(req.user) })));
r.post("/promos", ah(async (req, res) => {
  const out = await pr.createPromo(req.user, req.body || {});
  await audit(req, "promo.create", String(out.id), { title: req.body?.title });
  res.status(201).json(out);
}));
r.put("/promos/:id", ah(async (req, res) => {
  const out = await pr.updatePromo(req.user, req.params.id, req.body || {});
  await audit(req, "promo.update", req.params.id, { title: req.body?.title, active: req.body?.active });
  res.json(out);
}));
r.delete("/promos/:id", ah(async (req, res) => {
  const out = await pr.deletePromo(req.user, req.params.id);
  await audit(req, "promo.delete", req.params.id);
  res.json(out);
}));

export default r;
