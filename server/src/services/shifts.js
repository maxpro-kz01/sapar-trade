// Смены администратора: «Начать работу» / «Завершить работу» и полный отчёт за смену для директора (WhatsApp).
// Отчёт: заказы из приложения за смену, продажи за день по данным 1С, топ товаров, просрочка, что заканчивается.
import { q } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError, todayLocal } from "../lib/http.js";
import { round2, priceType, overdueDate, shiftDay, freshness } from "./scope.js";
import { getSettings } from "./settings.js";

const need = (user) => { if (!can(user, "shift")) throw new HttpError(403, "Нет доступа"); };

export async function currentShift(user) {
  need(user);
  const { rows } = await q("SELECT id, started_at FROM shifts WHERE user_id = $1 AND ended_at IS NULL", [user.id]);
  const { rows: hist } = await q("SELECT id, started_at, ended_at, report FROM shifts WHERE user_id = $1 AND ended_at IS NOT NULL ORDER BY id DESC LIMIT 10", [user.id]);
  return { current: rows[0] || null, history: hist, settings: await getSettings() };
}

export async function startShift(user) {
  need(user);
  try {
    const { rows } = await q("INSERT INTO shifts(user_id) VALUES ($1) RETURNING id, started_at", [user.id]);
    return rows[0];
  } catch (e) {
    if (e.code === "23505") throw new HttpError(400, "Смена уже начата");
    throw e;
  }
}

export async function buildReport(from, to, adminName) {
  const day = todayLocal(new Date(to));
  const [orders, byTp, top, sales, salesTop, debts, low, fresh] = await Promise.all([
    q(`SELECT count(*) AS all_count, count(*) FILTER (WHERE status = 'Отменён') AS cancelled,
              count(*) FILTER (WHERE status = 'Отгружен') AS shipped,
              count(*) FILTER (WHERE status IN ('Новый','Принят','Собран')) AS in_work,
              coalesce(sum(total) FILTER (WHERE status <> 'Отменён'),0) AS total,
              count(*) FILTER (WHERE onec_status = 'sent') AS in1c, count(*) FILTER (WHERE onec_status = 'error') AS err1c
       FROM orders WHERE created_at BETWEEN $1 AND $2`, [from, to]),
    q(`SELECT coalesce(manager, 'Без ТП') AS manager, count(*) AS n, sum(total) AS total FROM orders
       WHERE created_at BETWEEN $1 AND $2 AND status <> 'Отменён' GROUP BY 1 ORDER BY total DESC`, [from, to]),
    q(`SELECT i.name, sum(i.qty) AS qty, sum(i.sum) AS sum FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.created_at BETWEEN $1 AND $2 AND o.status <> 'Отменён' GROUP BY 1 ORDER BY sum DESC LIMIT 5`, [from, to]),
    q(`SELECT coalesce(sum(revenue),0) AS revenue, count(DISTINCT nullif(client_code,'')) AS clients FROM onec_sales_daily WHERE day = $1`, [day]),
    q(`SELECT coalesce(pr.name, s.product_code) AS name, sum(s.qty) AS qty, sum(s.revenue) AS sum FROM onec_sales_daily s
       LEFT JOIN onec_products pr ON pr.code = s.product_code WHERE s.day = $1 GROUP BY 1 ORDER BY sum DESC LIMIT 5`, [day]),
    q(`SELECT coalesce(sum(amount) FILTER (WHERE amount > 0 AND doc_date < $1),0) AS overdue,
              count(DISTINCT client_code) FILTER (WHERE amount > 0 AND doc_date < $1) AS clients FROM onec_debts`, [overdueDate()]),
    q(`SELECT pr.name, pr.unit, coalesce(st.qty,0) AS stock, sp.per_day
       FROM (SELECT product_code, sum(qty) / 30.0 AS per_day FROM onec_sales_daily WHERE day BETWEEN $1 AND $2 GROUP BY 1) sp
       JOIN onec_products pr ON pr.code = sp.product_code
       LEFT JOIN (SELECT product_code, sum(qty) AS qty FROM onec_stock GROUP BY 1) st ON st.product_code = sp.product_code
       WHERE sp.per_day > 0 AND coalesce(st.qty,0) < sp.per_day * 3
       ORDER BY sp.per_day DESC LIMIT 8`, [shiftDay(day, -29), day]),
    freshness(),
  ]);
  const o = orders.rows[0];
  const pt = await priceType();
  return {
    from, to, day, adminName, priceType: pt,
    orders: {
      count: Number(o.all_count), cancelled: Number(o.cancelled), shipped: Number(o.shipped), inWork: Number(o.in_work),
      total: round2(o.total), in1c: Number(o.in1c), err1c: Number(o.err1c),
      avg: Number(o.all_count) - Number(o.cancelled) ? round2(o.total / (Number(o.all_count) - Number(o.cancelled))) : 0,
      byTp: byTp.rows.map((r) => ({ manager: r.manager, n: Number(r.n), total: round2(r.total) })),
      top: top.rows.map((r) => ({ name: r.name, qty: Number(r.qty), sum: round2(r.sum) })),
    },
    sales1c: {
      revenue: round2(sales.rows[0].revenue), clients: Number(sales.rows[0].clients),
      top: salesTop.rows.map((r) => ({ name: r.name, qty: Number(r.qty), sum: round2(r.sum) })), lastSync: fresh.lastSync,
    },
    debts: { overdue: round2(debts.rows[0].overdue), clients: Number(debts.rows[0].clients) },
    lowStock: low.rows.map((r) => ({ name: r.name, unit: r.unit, stock: Number(r.stock), daysLeft: r.per_day > 0 ? Math.max(0, Math.floor(r.stock / r.per_day)) : null })),
  };
}

export async function endShift(user) {
  need(user);
  const { rows } = await q("SELECT id, started_at FROM shifts WHERE user_id = $1 AND ended_at IS NULL", [user.id]);
  if (!rows[0]) throw new HttpError(400, "Смена не начата");
  const to = new Date();
  const report = await buildReport(rows[0].started_at, to, user.name);
  await q("UPDATE shifts SET ended_at = $2, report = $3 WHERE id = $1", [rows[0].id, to, JSON.stringify(report)]);
  return { id: rows[0].id, report, settings: await getSettings() };
}
