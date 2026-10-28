// Склад: остатки, сумма по цене продажи, отрицательные, без цены, неликвид (нет продаж N дней),
// на сколько дней хватит (по средним продажам за 30 дней).
import { q } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError } from "../lib/http.js";
import { round2, lim, stripForRole, priceType, freshness, today, shiftDay } from "./scope.js";

export async function stock(user, { warehouse, search, onlyLow, dead, limit }) {
  if (!can(user, "stock")) throw new HttpError(403, "Нет доступа");
  const pt = await priceType();
  const t = today();
  const p = [pt, shiftDay(t, -29), t];
  let where = "true";
  if (warehouse) { p.push(String(warehouse)); where += ` AND st.warehouse_code = $${p.length}`; }
  if (search) {
    p.push(`%${String(search).slice(0, 80)}%`);
    where += ` AND (pr.name ILIKE $${p.length} OR pr.sku ILIKE $${p.length} OR st.product_code ILIKE $${p.length})`;
  }
  if (onlyLow) where += " AND st.qty <= 0";
  const deadDays = Number(dead) || 0;
  if (deadDays > 0) { p.push(shiftDay(t, -deadDays)); where += ` AND st.qty > 0 AND (ls.last_day IS NULL OR ls.last_day < $${p.length})`; }

  const from = `
    FROM onec_stock st
    LEFT JOIN onec_products pr ON pr.code = st.product_code
    LEFT JOIN onec_warehouses w ON w.code = st.warehouse_code
    LEFT JOIN onec_prices p ON p.product_code = st.product_code AND p.price_type = $1
    LEFT JOIN (SELECT product_code, max(day) AS last_day FROM onec_sales_daily GROUP BY 1) ls ON ls.product_code = st.product_code
    LEFT JOIN (SELECT product_code, sum(qty) / 30.0 AS per_day FROM onec_sales_daily WHERE day BETWEEN $2 AND $3 GROUP BY 1) sp ON sp.product_code = st.product_code`;
  const [items, whs, sum] = await Promise.all([
    q(`SELECT st.product_code AS code, coalesce(pr.name, st.product_code) AS name, pr.group_name, pr.unit, pr.sku,
              st.warehouse_code, w.name AS warehouse, st.qty, p.price, round(st.qty * coalesce(p.price,0), 2) AS value,
              ls.last_day, CASE WHEN sp.per_day > 0 AND st.qty > 0 THEN floor(st.qty / sp.per_day) END AS days_cover
       ${from} WHERE ${where} ORDER BY value DESC NULLS LAST, name LIMIT ${lim(limit, 500, 5000)}`, p),
    q(`SELECT w.code, w.name, count(st.product_code) FILTER (WHERE st.qty > 0) AS positions,
              coalesce(sum(st.qty * coalesce(p.price,0)) FILTER (WHERE st.qty > 0),0) AS value
       FROM onec_warehouses w LEFT JOIN onec_stock st ON st.warehouse_code = w.code
       LEFT JOIN onec_prices p ON p.product_code = st.product_code AND p.price_type = $1
       GROUP BY 1,2 ORDER BY value DESC`, [pt]),
    q(`SELECT coalesce(sum(st.qty * coalesce(p.price,0)) FILTER (WHERE st.qty > 0),0) AS value,
              count(*) FILTER (WHERE st.qty > 0) AS positions,
              count(*) FILTER (WHERE st.qty < 0) AS negative,
              count(*) FILTER (WHERE st.qty > 0 AND p.price IS NULL) AS no_price,
              coalesce(sum(st.qty * coalesce(p.price,0)) FILTER (WHERE st.qty > 0 AND (ls.last_day IS NULL OR ls.last_day < $3::date - 30)),0) AS dead30,
              coalesce(sum(st.qty * coalesce(p.price,0)) FILTER (WHERE st.qty > 0 AND (ls.last_day IS NULL OR ls.last_day < $3::date - 60)),0) AS dead60,
              coalesce(sum(st.qty * coalesce(p.price,0)) FILTER (WHERE st.qty > 0 AND (ls.last_day IS NULL OR ls.last_day < $3::date - 90)),0) AS dead90,
              (SELECT min(day) FROM onec_sales_daily) AS history_from
       ${from}`, p.slice(0, 3)),
  ]);
  const S = sum.rows[0];
  return stripForRole(user, {
    priceType: pt,
    summary: {
      value: round2(S.value), positions: Number(S.positions), negative: Number(S.negative), noPrice: Number(S.no_price),
      dead: [{ days: 30, value: round2(S.dead30) }, { days: 60, value: round2(S.dead60) }, { days: 90, value: round2(S.dead90) }],
      historyFrom: S.history_from,
    },
    warehouses: whs.rows.map((r) => ({ ...r, positions: Number(r.positions), value: round2(r.value) })),
    items: items.rows.map((r) => ({ ...r, days_cover: r.days_cover === null ? null : Number(r.days_cover) })),
    ...(await freshness()),
  });
}
