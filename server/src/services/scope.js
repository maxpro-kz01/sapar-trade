// Общие помощники отчётов: права на поля, фильтр «свои клиенты», тип цен, свежесть данных, периоды.
import { q } from "../db/pool.js";
import { config } from "../config.js";
import { can, scopeOf, managersOf } from "./rbac.js";
import { todayLocal, HttpError } from "../lib/http.js";
import { syncStatus } from "./sync.js";

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
export const lim = (v, def, max) => Math.min(Math.max(Number(v) || def, 1), max);

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
export function clientFilter(user, kind, alias, params) {
  const scope = scopeOf(user, kind);
  if (!scope) throw new HttpError(403, "Нет доступа");
  if (scope === "all") return "";
  params.push(managersOf(user));
  return ` AND ${alias}.client_code IN (SELECT code FROM onec_clients WHERE manager = ANY($${params.length}::text[]))`;
}

export async function priceType() {
  if (config.priceType) return config.priceType;
  const { rows } = await q("SELECT price_type FROM onec_prices GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1");
  return rows[0]?.price_type ?? "";
}

export async function freshness() {
  const s = await syncStatus(config.staleMinutes);
  return { lastSync: s.lastSync, stale: s.stale };
}

const shiftDay = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export { shiftDay };
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
export const today = () => todayLocal();
export const overdueDate = () => shiftDay(todayLocal(), -config.overdueDays);

// Предыдущий период той же длины, сразу перед выбранным
export function prevRange({ from, to }) {
  const n = daysBetween(from, to);
  const pto = shiftDay(from, -1);
  return { from: shiftDay(pto, -(n - 1)), to: pto };
}

// Себестоимость единицы товара за день (для приблизительной маржи по клиентам и менеджерам:
// в 1С себестоимость ведётся по товару, не по клиенту)
export const UNIT_COST_CTE = `uc AS (
  SELECT day, product_code, CASE WHEN sum(qty) <> 0 THEN sum(cost) / sum(qty) END AS unit
  FROM onec_cost_daily WHERE day BETWEEN $1 AND $2 GROUP BY 1, 2)`;

// План по месяцам → план на произвольный период (пропорционально дням каждого месяца)
export function prorate(plans /* [{month:'YYYY-MM-01', amount}] */, { from, to }) {
  let total = 0;
  for (const p of plans) {
    const mStart = p.month;
    const next = new Date(mStart + "T00:00:00Z"); next.setUTCMonth(next.getUTCMonth() + 1);
    const mEnd = shiftDay(next.toISOString().slice(0, 10), -1);
    const a = from > mStart ? from : mStart, b = to < mEnd ? to : mEnd;
    if (a > b) continue;
    total += Number(p.amount) * daysBetween(a, b) / daysBetween(mStart, mEnd);
  }
  return round2(total);
}
