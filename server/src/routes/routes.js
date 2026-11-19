// Маршрутные листы: составление (оператор, склад, владелец, директор) и «Мой маршрут» водителя.
import { Router } from "express";
import { ah } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import * as rt from "../services/routes.js";
import { audit } from "../services/audit.js";

const r = Router();
r.use(requireAuth);

r.get("/payment-qr", ah(async (req, res) => res.json(await rt.getQr(req.user))));
r.put("/payment-qr/:method", ah(async (req, res) => {
  const out = await rt.setQr(req.user, req.params.method, req.body || {});
  await audit(req, "payment.qr", req.params.method);
  res.json(out);
}));
r.get("/routes/payments", ah(async (req, res) => res.json(await rt.paymentsReport(req.user, req.query))));
r.get("/routes/drivers", ah(async (req, res) => res.json(await rt.listDrivers(req.user))));
r.get("/routes/orders", ah(async (req, res) => res.json(await rt.availableOrders(req.user))));
r.get("/routes", ah(async (req, res) => res.json(await rt.listSheets(req.user, req.query))));
r.post("/routes", ah(async (req, res) => {
  const out = await rt.createSheet(req.user, req.body || {});
  await audit(req, "route.create", String(out.id), { driverId: req.body?.driverId, orders: req.body?.orderIds?.length || 0 });
  res.status(201).json(out);
}));
r.get("/routes/:id", ah(async (req, res) => res.json(await rt.getSheet(req.user, req.params.id))));
r.patch("/routes/:id", ah(async (req, res) => {
  const out = await rt.updateSheet(req.user, req.params.id, req.body || {});
  await audit(req, "route.update", req.params.id, { orders: req.body?.orderIds?.length });
  res.json(out);
}));
r.post("/routes/:id/send", ah(async (req, res) => {
  const out = await rt.sendSheet(req.user, req.params.id);
  await audit(req, "route.send", req.params.id, { stops: out.stops });
  res.json(out);
}));
r.post("/routes/:id/close", ah(async (req, res) => {
  const out = await rt.closeSheet(req.user, req.params.id);
  await audit(req, "route.close", req.params.id);
  res.json(out);
}));
r.delete("/routes/:id", ah(async (req, res) => {
  const out = await rt.deleteSheet(req.user, req.params.id);
  await audit(req, "route.delete", req.params.id);
  res.json(out);
}));
r.put("/clients/:code/geo", ah(async (req, res) => {
  const out = await rt.setClientGeo(req.user, req.params.code, req.body || {});
  await audit(req, "client.geo", req.params.code, { lat: req.body?.lat, lon: req.body?.lon });
  res.json(out);
}));

r.get("/my-route", ah(async (req, res) => res.json(await rt.myRoute(req.user))));
r.post("/my-route/stops/:id/done", ah(async (req, res) => {
  const out = await rt.doneStop(req.user, req.params.id, req.body || {});
  if (!out.again) await audit(req, "route.done", req.params.id, { cash: req.body?.cash });
  res.json(out);
}));
r.post("/my-route/stops/:id/fail", ah(async (req, res) => {
  const out = await rt.failStop(req.user, req.params.id, req.body || {});
  await audit(req, "route.fail", req.params.id, { reason: req.body?.reason });
  res.json(out);
}));
r.post("/my-route/stops/:id/reopen", ah(async (req, res) => res.json(await rt.reopenStop(req.user, req.params.id))));
r.put("/my-route/stops/:id/geo", ah(async (req, res) => {
  const out = await rt.setStopGeo(req.user, req.params.id, req.body || {});
  await audit(req, "client.geo", `stop:${req.params.id}`, { lat: req.body?.lat, lon: req.body?.lon });
  res.json(out);
}));

export default r;
