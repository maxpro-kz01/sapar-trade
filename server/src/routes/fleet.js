// GPS экспедиторов: рейс водителя и приём точек; карта и маршрут — владелец и директор.
import { Router } from "express";
import { ah } from "../lib/http.js";
import { requireAuth, rateLimit } from "../middleware/auth.js";
import * as fleet from "../services/fleet.js";
import { audit } from "../services/audit.js";

const r = Router();
r.use(requireAuth);

r.get("/trip", ah(async (req, res) => res.json(await fleet.myTrip(req.user))));
r.post("/trip/start", ah(async (req, res) => {
  const out = await fleet.startTrip(req.user);
  if (!out.resumed) await audit(req, "trip.start", String(out.trip.id));
  res.status(out.resumed ? 200 : 201).json(out);
}));
r.post("/trip/end", ah(async (req, res) => {
  const out = await fleet.endTrip(req.user);
  await audit(req, "trip.end", String(out.trip.id), { km: out.trip.km });
  res.json(out);
}));
// телефон шлёт раз в ~30 с; запас на догрузку очереди после потери связи
r.post("/points", rateLimit({ windowMs: 60_000, max: 30 }), ah(async (req, res) => res.json(await fleet.addPoints(req.user, req.body))));

r.get("/live", ah(async (req, res) => res.json(await fleet.live(req.user))));
r.get("/track", ah(async (req, res) => res.json(await fleet.track(req.user, req.query))));

export default r;
