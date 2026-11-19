// Вход магазинов по телефону (ТЗ TZ_STORE_APP §3). Отдельно от сотрудников: свой токен (typ:"shop"),
// свои сессии (shop_sessions), токен магазина не открывает методы сотрудников и наоборот.
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { q } from "../db/pool.js";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { deviceLabel } from "./sessions.js";

const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

// «8 701 123 45 67», «+7(701)123-45-67», «701 123 45 67» → 77011234567; иначе null
export function normalizePhone(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return /^7\d{10}$/.test(d) ? d : null;
}
export const prettyPhone = (d) => `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;

export const publicShop = (s) => ({ id: s.id, name: s.name, phone: prettyPhone(s.phone), contactName: s.contact_name, address: s.address, linked: !!s.client_code });

export function signShopToken(shop, sid) {
  return jwt.sign({ typ: "shop", sub: shop.id, tv: shop.token_version, sid }, config.jwtSecret, { expiresIn: config.jwtTtl });
}

async function createShopSession(shop, ua) {
  const refreshToken = crypto.randomBytes(32).toString("base64url");
  const { rows: [s] } = await q(
    `INSERT INTO shop_sessions(shop_id, token_hash, device, token_version, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5::int)) RETURNING id`,
    [shop.id, sha(refreshToken), deviceLabel(ua), shop.token_version, config.sessionDays]);
  await q("UPDATE shops SET last_login_at = now() WHERE id = $1", [shop.id]);
  return { sid: Number(s.id), refreshToken };
}

async function issue(shop, ua) {
  const { sid, refreshToken } = await createShopSession(shop, ua);
  return { token: signShopToken(shop, sid), refreshToken, shop: publicShop(shop) };
}

// Клиенты 1С с этим телефоном (в 1С телефон хранится как угодно — сравниваем по цифрам, последние 10)
async function onecClientsByPhone(phone) {
  const { rows } = await q(
    `SELECT code, name, address, phone FROM onec_clients
     WHERE phone IS NOT NULL AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1 ORDER BY name`, [phone.slice(1)]);
  return rows;
}

// Вход по номеру. → { token, refreshToken, shop } | { choose: [...] } (несколько магазинов на одном номере) | HttpError 404 { needRegister }
export async function loginByPhone(rawPhone, shopId, ua) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new HttpError(400, "Введите номер: +7 7XX XXX XX XX");
  let { rows } = await q("SELECT * FROM shops WHERE phone = $1 ORDER BY id", [phone]);
  if (!rows.length) {
    // номера ещё нет у нас, но магазин уже есть в 1С — заводим вход под этим клиентом (цены и долг как в договоре)
    const cl = await onecClientsByPhone(phone);
    if (cl.length) {
      const made = [];
      for (const c of cl.slice(0, 5)) {
        const { rows: [s] } = await q(
          `INSERT INTO shops(phone, name, address, client_code) VALUES ($1,$2,$3,$4)
           ON CONFLICT (phone, name) DO UPDATE SET client_code = coalesce(shops.client_code, EXCLUDED.client_code) RETURNING *`,
          [phone, c.name, c.address || null, c.code]);
        made.push(s);
      }
      rows = made;
    }
  }
  if (!rows.length) throw new HttpError(404, "Такого номера нет. Зарегистрируйтесь — это быстро", { needRegister: true });
  const active = rows.filter((s) => s.status === "active");
  if (!active.length) throw new HttpError(403, "Вход закрыт. Позвоните в офис");
  let shop = null;
  if (shopId) shop = active.find((s) => s.id === Number(shopId)) || null;
  else if (active.length === 1) shop = active[0];
  if (!shop) return { choose: active.map((s) => ({ id: s.id, name: s.name, address: s.address })) };
  return issue(shop, ua);
}

// Регистрация нового магазина. Если такой номер+название уже есть — просто входим в него.
export async function registerShop({ name, phone: rawPhone, contactName, address }, ua) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new HttpError(400, "Введите номер: +7 7XX XXX XX XX");
  const nm = String(name || "").trim().slice(0, 120);
  if (nm.length < 2) throw new HttpError(400, "Укажите название магазина");
  const adr = String(address || "").trim().slice(0, 250);
  if (adr.length < 3) throw new HttpError(400, "Укажите адрес магазина");
  const contact = String(contactName || "").trim().slice(0, 80) || null;
  const { rows: [exist] } = await q("SELECT * FROM shops WHERE phone = $1 AND lower(name) = lower($2)", [phone, nm]);
  if (exist) {
    if (exist.status !== "active") throw new HttpError(403, "Вход закрыт. Позвоните в офис");
    return { ...(await issue(exist, ua)), existed: true };
  }
  const { rows: [shop] } = await q(
    `INSERT INTO shops(phone, name, contact_name, address) VALUES ($1,$2,$3,$4) RETURNING *`, [phone, nm, contact, adr]);
  return { ...(await issue(shop, ua)), created: true, shopId: shop.id };
}

export async function refreshShop(refreshToken) {
  if (typeof refreshToken !== "string" || refreshToken.length < 20 || refreshToken.length > 200) return null;
  const { rows } = await q(
    `UPDATE shop_sessions s SET last_used_at = now(), expires_at = now() + make_interval(days => $2::int)
     FROM shops h
     WHERE s.token_hash = $1 AND s.expires_at > now() AND h.id = s.shop_id AND h.status = 'active' AND h.token_version = s.token_version
     RETURNING s.id AS sid, h.*`, [sha(refreshToken), config.sessionDays]);
  if (!rows[0]) return null;
  const { sid, ...shop } = rows[0];
  return { token: signShopToken(shop, Number(sid)), shop: publicShop(shop) };
}

export const revokeShopToken = (t) => q("DELETE FROM shop_sessions WHERE token_hash = $1", [sha(String(t || ""))]);

// Проверка входа магазина. req.shop = строка shops; req.shopId
export async function requireShop(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.get("authorization") || "");
  if (!m) return res.status(401).json({ error: "Нужен вход" });
  let p;
  try { p = jwt.verify(m[1], config.jwtSecret); } catch { return res.status(401).json({ error: "Сессия истекла, войдите снова" }); }
  if (p.typ !== "shop") return res.status(401).json({ error: "Нужен вход магазина" });
  const { rows } = await q(
    `SELECT h.* FROM shops h JOIN shop_sessions s ON s.shop_id = h.id AND s.id = $2
     WHERE h.id = $1 AND h.status = 'active' AND h.token_version = $3 AND s.expires_at > now()`, [p.sub, p.sid, p.tv]);
  if (!rows[0]) return res.status(401).json({ error: "Сессия завершена, войдите снова" });
  req.shop = rows[0];
  next();
}
