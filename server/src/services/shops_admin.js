// Новые магазины для сотрудников (ТЗ TZ_STORE_APP §6): список, привязка к клиенту 1С, блокировка.
import { q, tx } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError } from "../lib/http.js";
import { prettyPhone } from "./shop_auth.js";
import { creditInfo } from "./credit.js";
import { shopTypes } from "./shops.js";

const need = (user, perm) => { if (!can(user, perm)) throw new HttpError(403, "Нет доступа"); };

export async function listShops(user, { filter } = {}) {
  need(user, "shops");
  const where = filter === "new" ? "WHERE s.client_code IS NULL" : filter === "blocked" ? "WHERE s.status = 'blocked'" : "";
  const { rows } = await q(
    `SELECT s.*, c.name AS client_name,
            (SELECT count(*) FROM orders o WHERE o.shop_id = s.id) AS orders,
            (SELECT coalesce(sum(total), 0) FROM orders o WHERE o.shop_id = s.id AND o.status <> 'Отменён') AS orders_sum
     FROM shops s LEFT JOIN onec_clients c ON c.code = s.client_code ${where} ORDER BY s.created_at DESC LIMIT 500`);
  return rows.map((s) => ({
    id: s.id, name: s.name, phone: prettyPhone(s.phone), contactName: s.contact_name, address: s.address, status: s.status,
    clientCode: s.client_code, clientName: s.client_name, createdAt: s.created_at, lastLoginAt: s.last_login_at,
    orders: Number(s.orders), ordersSum: Number(s.orders_sum),
  }));
}

// Подсказка для привязки: клиенты 1С с похожим названием или тем же телефоном
export async function suggestClients(user, shopId, search) {
  need(user, "shops");
  const { rows: [s] } = await q("SELECT * FROM shops WHERE id = $1", [Number(shopId) || 0]);
  if (!s) throw new HttpError(404, "Магазин не найден");
  const term = String(search || "").trim().slice(0, 60);
  if (term.length >= 2) { // ручной поиск оператора: по названию, коду или части телефона
    const like = `%${term.replace(/[%_\\]/g, "")}%`, digits = term.replace(/\D/g, "");
    const { rows } = await q(
      `SELECT code, name, address, phone, manager FROM onec_clients
       WHERE name ILIKE $1 OR code ILIKE $1 OR ($2 <> '' AND regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE '%' || $2 || '%')
       ORDER BY name LIMIT 30`, [like, digits]);
    return rows;
  }
  const { rows } = await q(
    `SELECT code, name, address, phone, manager FROM onec_clients
     WHERE (phone IS NOT NULL AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1) OR name ILIKE $2 ORDER BY name LIMIT 20`,
    [s.phone.slice(1), `%${s.name.replace(/[%_\\]/g, "")}%`]);
  return rows;
}

// Привязать магазин к клиенту 1С: дальше цены/долг/лимит по договору, а заказы переезжают с временного кода
export async function linkShop(user, shopId, clientCode) {
  need(user, "shops");
  const { rows: [s] } = await q("SELECT * FROM shops WHERE id = $1", [Number(shopId) || 0]);
  if (!s) throw new HttpError(404, "Магазин не найден");
  const { rows: [c] } = await q("SELECT code, name, manager FROM onec_clients WHERE code = $1", [String(clientCode || "")]);
  if (!c) throw new HttpError(400, "Клиент не найден в 1С");
  await tx(async (t) => {
    await t.query("UPDATE shops SET client_code = $2 WHERE id = $1", [s.id, c.code]);
    await t.query("UPDATE orders SET client_code = $2, client_name = $3, manager = $4 WHERE shop_id = $1", [s.id, c.code, c.name, c.manager]);
    // точка магазина на карте переезжает на клиента 1С (если у него своей точки ещё нет)
    await t.query("UPDATE client_geo SET client_code = $2 WHERE client_code = $1 AND NOT EXISTS (SELECT 1 FROM client_geo WHERE client_code = $2)", [`NEW-${s.id}`, c.code]);
    await t.query("DELETE FROM client_geo WHERE client_code = $1", [`NEW-${s.id}`]);
  });
  return { ok: true, clientCode: c.code, clientName: c.name };
}

export async function setShopStatus(user, shopId, status) {
  need(user, "shops");
  if (!["active", "blocked"].includes(status)) throw new HttpError(400, "Статус: active или blocked");
  const { rows: [s] } = await q("UPDATE shops SET status = $2, token_version = token_version + 1 WHERE id = $1 RETURNING id", [Number(shopId) || 0, status]);
  if (!s) throw new HttpError(404, "Магазин не найден");
  if (status === "blocked") await q("DELETE FROM shop_sessions WHERE shop_id = $1", [s.id]);
  return { ok: true };
}

export async function clientCredit(user, clientCode) {
  need(user, "credit");
  return creditInfo(String(clientCode));
}

// Почему в каталоге магазина мало товаров: сколько товаров в базе и сколько цен каждого типа пришло из 1С.
export async function catalogDiag(user) {
  need(user, "shops");
  const [{ rows: [p] }, { rows: types }] = await Promise.all([
    q(`SELECT (SELECT count(*) FROM onec_products) AS products,
              (SELECT count(*) FROM (SELECT product_code FROM onec_stock GROUP BY 1 HAVING sum(qty) > 0) x) AS in_stock`),
    q("SELECT price_type AS name, count(*) FILTER (WHERE price > 0) AS n FROM onec_prices GROUP BY 1 ORDER BY 2 DESC, 1")]);
  const { pt: newShop, fb: fallback } = await shopTypes(null);
  const n = (name) => Number(types.find((t) => t.name === name)?.n || 0);
  return { products: Number(p.products), inStock: Number(p.in_stock), priceTypes: types.map((t) => ({ name: t.name, n: Number(t.n) })),
    newShopType: newShop, newShopCount: n(newShop), fallbackType: fallback, fallbackCount: n(fallback) };
}
