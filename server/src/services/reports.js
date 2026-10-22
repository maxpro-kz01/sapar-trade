// Отчёты по данным 1С с учётом прав (ТЗ V1.0 §4, §23).
// Правило: себестоимость и валовую прибыль в тенге видит только владелец, маржу % — владелец и директор.
// ТП/супервайзер видят продажи и долги только своих клиентов (по менеджеру в 1С).
import { q } from "../db/pool.js";
import { config } from "../config.js";
import { can, scopeOf, managersOf } from "./rbac.js";
import { todayLocal, HttpError } from "../lib/http.js";
import { syncStatus } from "./sync.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

// Последняя защита: убрать финансовые поля, которые роли не положены, где бы они ни оказались
const GROSS_KEYS = new Set(["cost", "gross", "costTotal", "grossTotal"]);
export function stripForRole(user, data) {
  const showGross = can(user, "gross");
  const showMargin = can(user, "margin");
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (!showGross && GROSS_KEYS.has(k)) continue;
        if (!showMargin && k === "marginPct") continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(data);
}

// Фильтр «свои клиенты» для продаж/долгов: SQL-условие (параметр добавляется в params)
function clientFilter(user, kind, alias, params) {
  const scope = scopeOf(user, kind);
  if (!scope) throw new HttpError(403, "Нет доступа");
  if (scope === "all") return "";
  params.push(managersOf(user));
  return ` AND ${alias}.client_code IN (SELECT code FROM onec_clients WHERE manager = ANY($${params.length}::text[]))`;
}

async function priceType() {
  if (config.priceType) return config.priceType;
  const { rows } = await q("SELECT price_type FROM onec_prices GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1");
  return rows[0]?.price_type ?? "";
}

async function freshness() {
  const s = await syncStatus(config.staleMinutes);
  return { lastSync: s.lastSync, stale: s.stale };
}

function overdueDate() {
  const d = new Date(todayLocal() + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - config.overdueDays);
  return d.toISOString().slice(0, 10);
}

const lim = (v, def, max) => Math.min(Math.max(Number(v) || def, 1), max);

// ===== Главная =====
export async function dashboard(user, { from, to }) {
  const out = { period: { from, to }, ...(await freshness()) };
  const salesScope = scopeOf(user, "sales");

  if (salesScope) {
    const p = [from, to];
    const f = clientFilter(user, "sales", "s", p);
    const [tot, daily, topP, topC] = await Promise.all([
      q(`SELECT coalesce(sum(revenue),0) AS revenue, coalesce(sum(qty),0) AS qty, count(DISTINCT nullif(client_code,'')) AS clients
         FROM onec_sales_daily s WHERE day BETWEEN $1 AND $2${f}`, p),
      q(`SELECT day, sum(revenue) AS revenue FROM onec_sales_daily s WHERE day BETWEEN $1 AND $2${f} GROUP BY day ORDER BY day`, p),
      q(`SELECT s.product_code AS code, coalesce(pr.name, s.product_code) AS name, sum(s.qty) AS qty, sum(s.revenue) AS revenue
         FROM onec_sales_daily s LEFT JOIN onec_products pr ON pr.code = s.product_code
         WHERE day BETWEEN $1 AND $2${f} GROUP BY 1,2 ORDER BY revenue DESC LIMIT 10`, p),
      q(`SELECT s.client_code AS code, coalesce(c.name, nullif(s.client_code,''), 'Без клиента') AS name, sum(s.revenue) AS revenue
         FROM onec_sales_daily s LEFT JOIN onec_clients c ON c.code = s.client_code
         WHERE day BETWEEN $1 AND $2${f} GROUP BY 1,2 ORDER BY revenue DESC LIMIT 10`, p),
    ]);
    const t = tot.rows[0];
    out.sales = { revenue: round2(t.revenue), qty: t.qty, clients: Number(t.clients), avgPerDay: null };
    out.daily = daily.rows.map((r) => ({ day: r.day, revenue: round2(r.revenue) }));
    out.topProducts = topP.rows.map((r) => ({ ...r, revenue: round2(r.revenue) }));
    out.topClients = topC.rows.map((r) => ({ ...r, revenue: round2(r.revenue) }));
    if (out.daily.length) out.sales.avgPerDay = round2(out.sales.revenue / out.daily.length);

    // Себестоимость по компании — только при доступе ко всем продажам и праве на маржу
    if (salesScope === "all" && can(user, "margin")) {
      const [ct, cd, cp] = await Promise.all([
        q("SELECT coalesce(sum(cost),0) AS cost FROM onec_cost_daily WHERE day BETWEEN $1 AND $2", [from, to]),
        q("SELECT day, sum(cost) AS cost FROM onec_cost_daily WHERE day BETWEEN $1 AND $2 GROUP BY day", [from, to]),
        q(`SELECT product_code AS code, sum(cost) AS cost FROM onec_cost_daily WHERE day BETWEEN $1 AND $2
           AND product_code = ANY($3::text[]) GROUP BY 1`, [from, to, out.topProducts.map((x) => x.code)]),
      ]);
      const cost = round2(ct.rows[0].cost);
      out.sales.cost = cost;
      out.sales.gross = round2(out.sales.revenue - cost);
      out.sales.marginPct = pct(out.sales.revenue - cost, out.sales.revenue);
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

// ===== Продажи: по дням / товарам / клиентам =====
export async function sales(user, { from, to, group = "day", limit }) {
  if (!["day", "product", "client"].includes(group)) throw new HttpError(400, "group: day | product | client");
  const p = [from, to];
  const f = clientFilter(user, "sales", "s", p);
  const n = lim(limit, 200, 2000);
  const sql = {
    day: `SELECT day AS key, day AS name, sum(qty) AS qty, sum(revenue) AS revenue FROM onec_sales_daily s
          WHERE day BETWEEN $1 AND $2${f} GROUP BY day ORDER BY day`,
    product: `SELECT s.product_code AS key, coalesce(pr.name, s.product_code) AS name, pr.group_name,
          sum(s.qty) AS qty, sum(s.revenue) AS revenue FROM onec_sales_daily s LEFT JOIN onec_products pr ON pr.code = s.product_code
          WHERE day BETWEEN $1 AND $2${f} GROUP BY 1,2,3 ORDER BY revenue DESC LIMIT ${n}`,
    client: `SELECT s.client_code AS key, coalesce(c.name, nullif(s.client_code,''), 'Без клиента') AS name,
          c.manager, sum(s.qty) AS qty, sum(s.revenue) AS revenue, max(day) AS last_day FROM onec_sales_daily s
          LEFT JOIN onec_clients c ON c.code = s.client_code WHERE day BETWEEN $1 AND $2${f}
          GROUP BY 1,2,3 ORDER BY revenue DESC LIMIT ${n}`,
  }[group];
  const { rows } = await q(sql, p);
  let items = rows.map((r) => ({ ...r, revenue: round2(r.revenue) }));

  // себестоимость в 1С есть по дню и товару (не по клиенту)
  if (scopeOf(user, "sales") === "all" && can(user, "margin") && group !== "client") {
    const col = group === "day" ? "day" : "product_code";
    const { rows: cr } = await q(`SELECT ${col} AS key, sum(cost) AS cost FROM onec_cost_daily WHERE day BETWEEN $1 AND $2 GROUP BY 1`, [from, to]);
    const m = new Map(cr.map((r) => [r.key, r.cost]));
    items = items.map((x) => {
      const c = round2(m.get(x.key) || 0);
      return { ...x, cost: c, gross: round2(x.revenue - c), marginPct: pct(x.revenue - c, x.revenue) };
    });
  }
  return stripForRole(user, { period: { from, to }, group, items, ...(await freshness()) });
}

// ===== Склад =====
export async function stock(user, { warehouse, search, onlyLow, limit }) {
  if (!can(user, "stock")) throw new HttpError(403, "Нет доступа");
  const pt = await priceType();
  const p = [pt];
  let where = "true";
  if (warehouse) { p.push(String(warehouse)); where += ` AND st.warehouse_code = $${p.length}`; }
  if (search) {
    p.push(`%${String(search).slice(0, 80)}%`);
    where += ` AND (pr.name ILIKE $${p.length} OR pr.sku ILIKE $${p.length} OR st.product_code ILIKE $${p.length})`;
  }
  if (onlyLow) where += " AND st.qty <= 0";
  const [items, whs] = await Promise.all([
    q(`SELECT st.product_code AS code, coalesce(pr.name, st.product_code) AS name, pr.group_name, pr.unit, pr.sku,
              st.warehouse_code, w.name AS warehouse, st.qty, p.price, round(st.qty * coalesce(p.price,0), 2) AS value
       FROM onec_stock st
       LEFT JOIN onec_products pr ON pr.code = st.product_code
       LEFT JOIN onec_warehouses w ON w.code = st.warehouse_code
       LEFT JOIN onec_prices p ON p.product_code = st.product_code AND p.price_type = $1
       WHERE ${where} ORDER BY value DESC NULLS LAST, name LIMIT ${lim(limit, 500, 5000)}`, p),
    q(`SELECT w.code, w.name, count(st.product_code) FILTER (WHERE st.qty > 0) AS positions,
              coalesce(sum(st.qty * coalesce(p.price,0)) FILTER (WHERE st.qty > 0),0) AS value
       FROM onec_warehouses w LEFT JOIN onec_stock st ON st.warehouse_code = w.code
       LEFT JOIN onec_prices p ON p.product_code = st.product_code AND p.price_type = $1
       GROUP BY 1,2 ORDER BY value DESC`, [pt]),
  ]);
  return stripForRole(user, {
    priceType: pt,
    warehouses: whs.rows.map((r) => ({ ...r, positions: Number(r.positions), value: round2(r.value) })),
    items: items.rows,
    ...(await freshness()),
  });
}

// ===== Клиенты и дебиторка =====
export async function clients(user, { search, from, to, onlyDebtors, limit }) {
  const debtScope = scopeOf(user, "debts");
  const salesScope = scopeOf(user, "sales");
  if (!debtScope && !salesScope) throw new HttpError(403, "Нет доступа");
  const p = [overdueDate(), from, to];
  let where = "true";
  if (debtScope !== "all" && salesScope !== "all") { p.push(managersOf(user)); where += ` AND c.manager = ANY($${p.length}::text[])`; }
  if (search) {
    p.push(`%${String(search).slice(0, 80)}%`);
    where += ` AND (c.name ILIKE $${p.length} OR c.phone ILIKE $${p.length} OR c.code ILIKE $${p.length})`;
  }
  if (onlyDebtors) where += " AND coalesce(d.total,0) > 0";
  const { rows } = await q(
    `SELECT c.code, c.name, c.manager, c.phone, c.address,
            coalesce(d.total,0) AS debt, coalesce(d.overdue,0) AS overdue, d.oldest,
            coalesce(s.revenue,0) AS revenue, s.last_day
     FROM onec_clients c
     LEFT JOIN (SELECT client_code, sum(amount) FILTER (WHERE amount > 0) AS total,
                       sum(amount) FILTER (WHERE amount > 0 AND doc_date < $1) AS overdue,
                       min(doc_date) FILTER (WHERE amount > 0) AS oldest
                FROM onec_debts GROUP BY 1) d ON d.client_code = c.code
     LEFT JOIN (SELECT client_code, sum(revenue) AS revenue, max(day) AS last_day
                FROM onec_sales_daily WHERE day BETWEEN $2 AND $3 GROUP BY 1) s ON s.client_code = c.code
     WHERE ${where}
     ORDER BY overdue DESC, debt DESC, revenue DESC, c.name LIMIT ${lim(limit, 300, 3000)}`, p);
  const items = rows.map((r) => {
    const x = { code: r.code, name: r.name, manager: r.manager, phone: r.phone, address: r.address };
    if (debtScope) Object.assign(x, { debt: round2(r.debt), overdue: round2(r.overdue), oldestDebt: r.oldest });
    if (salesScope) Object.assign(x, { revenue: round2(r.revenue), lastSale: r.last_day });
    return x;
  });
  return stripForRole(user, { period: { from, to }, overdueDays: config.overdueDays, items, ...(await freshness()) });
}
