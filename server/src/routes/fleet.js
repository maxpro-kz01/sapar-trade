// GPS экспедиторов: рейс водителя и приём точек; карта и маршрут — владелец и директор.
import { Router } from "express";
import { ah } from "../lib/http.js";
import { requireAuth, rateLimit } from "../middleware/auth.js";
import * as fleet from "../services/fleet.js";
import { audit } from "../services/audit.js";

// Traccar Client (фон): без входа по паролю — водителя определяет личный ключ.
// Отдельный роутер: монтируется в app.js ВЫШЕ общих роутеров /api, которые требуют вход.
export const traccarRoutes = Router();
traccarRoutes.all("/", rateLimit({ windowMs: 60_000, max: 120 }), ah(async (req, res) => {
  const { key, point } = fleet.parseTraccar(req.query, req.body);
  await fleet.addTraccarPoint(key, point);
  res.status(200).end();
}));

const r = Router();
r.use(requireAuth);

r.get("/gps-keys", ah(async (req, res) => res.json({ items: await fleet.listGpsKeys(req.user), url: `${req.protocol}://${req.get("host")}/api/fleet/traccar` })));
r.post("/gps-keys/:id", ah(async (req, res) => {
  const out = await fleet.issueGpsKey(req.user, req.params.id);
  await audit(req, "gps.key", out.login);
  res.json(out);
}));

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
