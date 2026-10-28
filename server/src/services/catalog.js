// Каталог для заказа: товары из 1С с ценой продажи («Цена Прайс») и общим остатком по складам.
import { q } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError } from "../lib/http.js";
import { priceType, freshness } from "./scope.js";

export async function catalog(user) {
  if (!can(user, "orders.create") && !can(user, "stock") && !can(user, "orders.all")) throw new HttpError(403, "Нет доступа");
  const pt = await priceType();
  const { rows } = await q(
    `SELECT pr.code, pr.name, coalesce(pr.group_name, 'Без группы') AS grp, pr.unit, pr.sku, p.price,
            coalesce(st.qty, 0) AS stock
     FROM onec_products pr
     LEFT JOIN onec_prices p ON p.product_code = pr.code AND p.price_type = $1
     LEFT JOIN (SELECT product_code, sum(qty) AS qty FROM onec_stock GROUP BY 1) st ON st.product_code = pr.code
     WHERE p.price > 0 OR coalesce(st.qty, 0) > 0
     ORDER BY grp, pr.name`, [pt]);
  const groups = [...new Set(rows.map((r) => r.grp))];
  return { priceType: pt, groups, items: rows, ...(await freshness()) };
}
