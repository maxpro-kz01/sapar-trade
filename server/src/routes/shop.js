// «Магазин»: вход и регистрация магазинов, каталог, заказы, долг (ТЗ TZ_STORE_APP §8).
// Монтируется в app.js ДО общих /api-маршрутов сотрудников: у тех requireAuth на всём, что через них проходит.
import { Router } from "express";
import { ah } from "../lib/http.js";
import { rateLimit } from "../middleware/auth.js";
import { config } from "../config.js";
import { loginByPhone, registerShop, refreshShop, revokeShopToken, requireShop, publicShop } from "../services/shop_auth.js";
import { audit } from "../services/audit.js";
import * as shops from "../services/shops.js";

const r = Router();
const ua = (req) => req.get("user-agent");

r.post("/login", rateLimit({ windowMs: 60_000, max: config.shopLoginPerMin }), ah(async (req, res) => {
  const out = await loginByPhone(req.body?.phone, req.body?.shopId, ua(req));
  if (out.token) await audit(req, "shop.login", String(out.shop.id));
  res.json(out);
}));

r.post("/register", rateLimit({ windowMs: 3_600_000, max: config.shopRegisterPerHour }), ah(async (req, res) => {
  const out = await registerShop(req.body || {}, ua(req));
  await audit(req, out.created ? "shop.register" : "shop.login", String(out.shop.id));
  res.status(out.created ? 201 : 200).json(out);
}));

r.post("/refresh", rateLimit({ windowMs: 60_000, max: 120 }), ah(async (req, res) => {
  const out = await refreshShop(req.body?.refreshToken);
  if (!out) return res.status(401).json({ error: "Сессия завершена, войдите снова" });
  res.json(out);
}));

r.post("/logout", ah(async (req, res) => {
  if (req.body?.refreshToken) await revokeShopToken(req.body.refreshToken);
  res.json({ ok: true });
}));

r.get("/me", requireShop, (req, res) => res.json({ shop: publicShop(req.shop) }));

r.get("/catalog", requireShop, ah(async (req, res) => res.json(await shops.shopCatalog(req.shop))));
r.get("/debt", requireShop, ah(async (req, res) => res.json(await shops.shopDebt(req.shop))));
r.get("/orders", requireShop, ah(async (req, res) => res.json(await shops.listShopOrders(req.shop))));
r.post("/orders", requireShop, ah(async (req, res) => {
  const o = await shops.createShopOrder(req.shop, req.body || {});
  await audit(req, "shop.order", o.number, { shop: req.shop.id, total: o.total, payment: o.payment });
  res.status(201).json(o);
}));
r.post("/orders/:id/cancel", requireShop, ah(async (req, res) => {
  const out = await shops.cancelShopOrder(req.shop, req.params.id);
  await audit(req, "shop.order.cancel", req.params.id, { shop: req.shop.id });
  res.json(out);
}));

export default r;
