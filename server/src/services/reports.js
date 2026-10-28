// Отчёты по продажам: Главная, Продажи, Финансы (ТЗ V1.0 §4, §23; ТЗ «Система управления на данных 1С»).
// Себестоимость и валовая прибыль в тенге — только владелец, маржа % — владелец и директор.
// ТП/супервайзер видят продажи и долги только своих клиентов (по менеджеру в 1С).
import { q } from "../db/pool.js";
import { config } from "../config.js";
import { can, scopeOf, managersOf } from "./rbac.js";
import { HttpError } from "../lib/http.js";
import {
  round2, pct, lim, stripForRole, clientFilter, priceType, freshness, overdueDate, prevRange, UNIT_COST_CTE, prorate,
} from "./scope.js";

export { stripForRole };

async function salesTotals(user, { from, to }) {
  const p = [from, to];
  const f = clientFilter(user, "sales", "s", p);
  const { rows: [t] } = await q(
    `SELECT coalesce(sum(revenue),0) AS revenue, coalesce(sum(qty),0) AS qty, count(DISTINCT nullif(client_code,'')) AS clients
     FROM onec_sales_daily s WHERE day BETWEEN $1 AND $2${f}`, p);
  const out = { revenue: round2(t.revenue), qty: t.qty, clients: Number(t.clients) };
  if (scopeOf(user, "sales") === "all" && can(user, "margin")) {
    const { rows: [c] } = await q("SELECT coalesce(sum(cost),0) AS cost FROM onec_cost_daily WHERE day BETWEEN $1 AND $2", [from, to]);
    out.cost = round2(c.cost);
    out.gross = round2(out.revenue - out.cost);
    out.marginPct = pct(out.revenue - out.cost, out.revenue);
  }
  return out;
}

// План на период: все ТП (владелец/директор) или свои (ТП/супервайзер)
async function planFor(user, range) {
  const scope = scopeOf(user, "team");
  if (!scope) return null;
  const p = [range.from.slice(0, 8) + "01", range.to];
  let f = "";
  if (scope === "own") { p.push(managersOf(user)); f = " AND manager = ANY($3::text[])"; }
  const { rows } = await q(`SELECT to_char(month,'YYYY-MM-DD') AS month, sum(amount) AS amount FROM sales_plans
    WHERE month BETWEEN $1 AND $2${f} GROUP BY 1`, p);
  return rows.length ? prorate(rows, range) : null;
}

// ===== Главная =====
export async function dashboard(user, range) {
  const { from, to } = range;
  const out = { period: { from, to }, ...(await freshness()) };
  const salesScope = scopeOf(user, "sales");

  if (salesScope) {
    const prev = prevRange(range);
    const p = [from, to];
    const f = clientFilter(user, "sales", "s", p);
    const [cur, before, daily, topP, topC, plan] = await Promise.all([
      salesTotals(user, range),
      salesTotals(user, prev),
      q(`SELECT day, sum(revenue) AS revenue FROM onec_sales_daily s WHERE day BETWEEN $1 AND $2${f} GROUP BY day ORDER BY day`, p),
      q(`SELECT s.product_code AS code, coalesce(pr.name, s.product_code) AS name, sum(s.qty) AS qty, sum(s.revenue) AS revenue
         FROM onec_sales_daily s LEFT JOIN onec_products pr ON pr.code = s.product_code
         WHERE day BETWEEN $1 AND $2${f} GROUP BY 1,2 ORDER BY revenue DESC LIMIT 10`, p),
      q(`SELECT s.client_code AS code, coalesce(c.name, nullif(s.client_code,''), 'Без клиента') AS name, c.manager, sum(s.revenue) AS revenue
         FROM onec_sales_daily s LEFT JOIN onec_clients c ON c.code = s.client_code
         WHERE day BETWEEN $1 AND $2${f} GROUP BY 1,2,3 ORDER BY revenue DESC LIMIT 10`, p),
      planFor(user, range),
    ]);
    out.sales = { ...cur, avgPerDay: null };
    out.prev = { period: prev, ...before };
    if (plan !== null) { out.sales.plan = plan; out.sales.planPct = pct(cur.revenue, plan); }
    out.daily = daily.rows.map((r) => ({ day: r.day, revenue: round2(r.revenue) }));
    out.topProducts = topP.rows.map((r) => ({ ...r, revenue: round2(r.revenue) }));
    out.topClients = topC.rows.map((r) => ({ ...r, revenue: round2(r.revenue) }));
    if (out.daily.length) out.sales.avgPerDay = round2(cur.revenue / out.daily.length);

    if (salesScope === "all" && can(user, "margin")) {
      const [cd, cp] = await Promise.all([
        q("SELECT day, sum(cost) AS cost FROM onec_cost_daily WHERE day BETWEEN $1 AND $2 GROUP BY day", [from, to]),
        q(`SELECT product_code AS code, sum(cost) AS cost FROM onec_cost_daily WHERE day BETWEEN $1 AND $2
           AND product_code = ANY($3::text[]) GROUP BY 1`, [from, to, out.topProducts.map((x) => x.code)]),
      ]);
      const byDay = new Map(cd.rows.map((r) => [r.day, r.cost]));
      out.daily = out.daily.map((d) => {
        const c = round2(byDay.get(d.day) || 0);
        return { ...d, cost: c, gross: round2(d.revenue - c), marginPct: pct(d.revenue - c, d.revenue) };
      });
      const byProd = new Map(cp.rows.map((r) => [r.code, r.cost]));
      out.topProducts = out.topProducts.map((x) => {
        const c = round2(byProd.get(x.code) || 0);
        return { ...x, cost: c, gross: round2(x.revenue - c), marginPct: pct(x.revenue - c, x.revenue) };
      });
    }
  }

  if (can(user, "stock")) {
    const pt = await priceType();
    const { rows: [s] } = await q(
      `SELECT count(*) FILTER (WHERE st.qty > 0) AS positions, count(*) FILTER (WHERE st.qty < 0) AS negative,
              coalesce(sum(st.qty * coalesce(p.price,0)) FILTER (WHERE st.qty > 0),0) AS value,
              count(*) FILTER (WHERE st.qty > 0 AND p.price IS NULL) AS no_price
       FROM onec_stock st LEFT JOIN onec_prices p ON p.product_code = st.product_code AND p.price_type = $1`, [pt]);
    out.stock = { value: round2(s.value), positions: Number(s.positions), negative: Number(s.negative), noPrice: Number(s.no_price), priceType: pt };
  }

  if (scopeOf(user, "debts")) {
    const p = [overdueDate()];
    const f = clientFilter(user, "debts", "d", p);
    const { rows: [d] } = await q(
      `SELECT coalesce(sum(amount) FILTER (WHERE amount > 0),0) AS total,
              coalesce(sum(amount) FILTER (WHERE amount > 0 AND doc_date < $1),0) AS overdue,
              count(DISTINCT client_code) FILTER (WHERE amount > 0) AS clients
       FROM onec_debts d WHERE true${f}`, p);
    out.debts = { total: round2(d.total), overdue: round2(d.overdue), clients: Number(d.clients), overdueDays: config.overdueDays };
  }

  return stripForRole(user, out);
}

// ===== Продажи: по дням / товарам / группам / клиентам / менеджерам =====
const GROUPS = {
  day:     { key: "s.day", name: "s.day", extra: "", join: "" },
  product: { key: "s.product_code", name: "coalesce(pr.name, s.product_code)", extra: ", pr.group_name", join: "LEFT JOIN onec_products pr ON pr.code = s.product_code" },
  group:   { key: "coalesce(pr.group_name, 'Без группы')", name: "coalesce(pr.group_name, 'Без группы')", extra: ", count(DISTINCT s.product_code) AS products", join: "LEFT JOIN onec_products pr ON pr.code = s.product_code" },
  client:  { key: "s.client_code", name: "coalesce(c.name, nullif(s.client_code,''), 'Без клиента')", extra: ", c.manager, max(s.day) AS last_day", join: "LEFT JOIN onec_clients c ON c.code = s.client_code" },
  manager: { key: "coalesce(nullif(c.manager,''), 'Без менеджера')", name: "coalesce(nullif(c.manager,''), 'Без менеджера')", extra: ", count(DISTINCT nullif(s.client_code,'')) AS clients", join: "LEFT JOIN onec_clients c ON c.code = s.client_code" },
};

export async function sales(user, { from, to, group = "day", limit }) {
  const g = GROUPS[group];
  if (!g || !Object.hasOwn(GROUPS, group)) throw new HttpError(400, "group: day | product | group | client | manager");
  const p = [from, to];
  const f = clientFilter(user, "sales", "s", p);
  const withCost = scopeOf(user, "sales") === "all" && can(user, "margin");
  const costCol = withCost ? ", sum(s.qty * coalesce(uc.unit, 0)) AS cost" : "";
  const costJoin = withCost ? "LEFT JOIN uc ON uc.day = s.day AND uc.product_code = s.product_code" : "";
  const order = group === "day" ? "key" : "revenue DESC";
  const { rows } = await q(
    `WITH ${UNIT_COST_CTE}
     SELECT ${g.key} AS key, ${g.name} AS name${g.extra}, sum(s.qty) AS qty, sum(s.revenue) AS revenue${costCol}
     FROM onec_sales_daily s ${g.join} ${costJoin}
     WHERE s.day BETWEEN $1 AND $2${f}
     GROUP BY 1, 2${group === "product" ? ", pr.group_name" : group === "client" ? ", c.manager" : ""}
     ORDER BY ${order} LIMIT ${group === "day" ? 400 : lim(limit, 200, 2000)}`, p);
  const items = rows.map((r) => {
    const x = { ...r, revenue: round2(r.revenue) };
    if (withCost) { x.cost = round2(r.cost); x.gross = round2(x.revenue - x.cost); x.marginPct = pct(x.revenue - x.cost, x.revenue); }
    return x;
  });
  const total = items.reduce((a, x) => a + x.revenue, 0);
  return stripForRole(user, {
    period: { from, to }, group, items, total: round2(total),
    approxCost: withCost && ["client", "manager"].includes(group), ...(await freshness()),
  });
}

// ===== Финансы (только владелец): выручка, себестоимость, валовая по дням и группам =====
export async function finance(user, range) {
  if (!can(user, "gross")) throw new HttpError(403, "Нет доступа");
  const { from, to } = range;
  const prev = prevRange(range);
  const [cur, before, daily, groups] = await Promise.all([
    salesTotals(user, range),
    salesTotals(user, prev),
    q(`SELECT d.day, coalesce(s.revenue,0) AS revenue, coalesce(c.cost,0) AS cost
       FROM (SELECT DISTINCT day FROM onec_sales_daily WHERE day BETWEEN $1 AND $2
             UNION SELECT DISTINCT day FROM onec_cost_daily WHERE day BETWEEN $1 AND $2) d
       LEFT JOIN (SELECT day, sum(revenue) AS revenue FROM onec_sales_daily WHERE day BETWEEN $1 AND $2 GROUP BY 1) s ON s.day = d.day
       LEFT JOIN (SELECT day, sum(cost) AS cost FROM onec_cost_daily WHERE day BETWEEN $1 AND $2 GROUP BY 1) c ON c.day = d.day
       ORDER BY d.day`, [from, to]),
    q(`SELECT coalesce(pr.group_name, 'Без группы') AS name, sum(x.revenue) AS revenue, sum(x.cost) AS cost
       FROM (SELECT product_code, sum(revenue) AS revenue, 0 AS cost FROM onec_sales_daily WHERE day BETWEEN $1 AND $2 GROUP BY 1
             UNION ALL SELECT product_code, 0, sum(cost) FROM onec_cost_daily WHERE day BETWEEN $1 AND $2 GROUP BY 1) x
       LEFT JOIN onec_products pr ON pr.code = x.product_code
       GROUP BY 1 ORDER BY revenue DESC`, [from, to]),
  ]);
  const row = (r) => ({ revenue: round2(r.revenue), cost: round2(r.cost), gross: round2(r.revenue - r.cost), marginPct: pct(r.revenue - r.cost, r.revenue) });
  return stripForRole(user, {
    period: { from, to }, totals: cur, prev: { period: prev, ...before },
    daily: daily.rows.map((r) => ({ day: r.day, ...row(r) })),
    groups: groups.rows.map((r) => ({ name: r.name, ...row(r) })),
    notYet: "Касса, банк, расходы и чистая прибыль — следующий этап (нужны новые выгрузки из 1С)",
    ...(await freshness()),
  });
}
