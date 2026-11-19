// Сотрудники: новые магазины и кредитный лимит клиента. requireAuth стоит на каждом пути отдельно,
// чтобы этот роутер не закрывал вход самим магазинам.
import { Router } from "express";
import { ah } from "../lib/http.js";
import { requireAuth, requirePerm } from "../middleware/auth.js";
import * as sa from "../services/shops_admin.js";
import { setLimit } from "../services/credit.js";
import { audit } from "../services/audit.js";

const r = Router();

r.get("/shops/diag", requireAuth, ah(async (req, res) => res.json(await sa.catalogDiag(req.user))));
r.get("/shops", requireAuth, ah(async (req, res) => res.json(await sa.listShops(req.user, req.query))));
r.get("/shops/:id/suggest", requireAuth, ah(async (req, res) => res.json(await sa.suggestClients(req.user, req.params.id))));
r.post("/shops/:id/link", requireAuth, ah(async (req, res) => {
  const out = await sa.linkShop(req.user, req.params.id, req.body?.clientCode);
  await audit(req, "shop.link", req.params.id, { clientCode: out.clientCode });
  res.json(out);
}));
r.patch("/shops/:id", requireAuth, ah(async (req, res) => {
  const out = await sa.setShopStatus(req.user, req.params.id, req.body?.status);
  await audit(req, "shop.status", req.params.id, { status: req.body?.status });
  res.json(out);
}));

r.get("/clients/:code/limit", requireAuth, requirePerm("credit"), ah(async (req, res) => res.json(await sa.clientCredit(req.user, req.params.code))));
r.put("/clients/:code/limit", requireAuth, requirePerm("credit"), ah(async (req, res) => {
  const out = await setLimit(req.user, req.params.code, req.body?.limit);
  await audit(req, "credit.limit", req.params.code, { limit: out.limit });
  res.json(out);
}));

export default r;
