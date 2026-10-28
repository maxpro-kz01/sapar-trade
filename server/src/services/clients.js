// Клиенты и дебиторка: долг, возраст долга (0–7, 8–14, 15–30, 30+ дней), последняя покупка, «спящие» клиенты.
import { q } from "../db/pool.js";
import { config } from "../config.js";
import { scopeOf, managersOf } from "./rbac.js";
import { HttpError } from "../lib/http.js";
import { round2, lim, stripForRole, freshness, overdueDate, today, shiftDay } from "./scope.js";

export async function clients(user, { search, from, to, onlyDebtors, sleeping, manager, limit }) {
  const debtScope = scopeOf(user, "debts");
  const salesScope = scopeOf(user, "sales");
  if (!debtScope && !salesScope) throw new HttpError(403, "Нет доступа");
  const t = today();
  const p = [overdueDate(), from, to, t];
  let where = "true";
  if (debtScope !== "all" && salesScope !== "all") { p.push(managersOf(user)); where += ` AND c.manager = ANY($${p.length}::text[])`; }
  if (manager) { p.push(String(manager)); where += ` AND c.manager = $${p.length}`; }
  if (search) {
    p.push(`%${String(search).slice(0, 80)}%`);
    where += ` AND (c.name ILIKE $${p.length} OR c.phone ILIKE $${p.length} OR c.code ILIKE $${p.length})`;
  }
  if (onlyDebtors) where += " AND coalesce(d.total,0) > 0";
  const sleepDays = Number(sleeping) || 0;
  if (sleepDays > 0) { p.push(shiftDay(t, -sleepDays)); where += ` AND ever.last_day < $${p.length}`; }

  const base = `
    FROM onec_clients c
    LEFT JOIN (SELECT client_code,
                      sum(amount) FILTER (WHERE amount > 0) AS total,
                      sum(amount) FILTER (WHERE amount > 0 AND doc_date < $1) AS overdue,
                      sum(amount) FILTER (WHERE amount > 0 AND doc_date >= $4::date - 7) AS b0,
                      sum(amount) FILTER (WHERE amount > 0 AND doc_date < $4::date - 7 AND doc_date >= $4::date - 14) AS b8,
                      sum(amount) FILTER (WHERE amount > 0 AND doc_date < $4::date - 14 AND doc_date >= $4::date - 30) AS b15,
                      sum(amount) FILTER (WHERE amount > 0 AND doc_date < $4::date - 30) AS b30,
                      sum(amount) FILTER (WHERE amount > 0 AND doc_date IS NULL) AS bnone,
                      min(doc_date) FILTER (WHERE amount > 0) AS oldest
               FROM onec_debts GROUP BY 1) d ON d.client_code = c.code
    LEFT JOIN (SELECT client_code, sum(revenue) AS revenue FROM onec_sales_daily WHERE day BETWEEN $2 AND $3 GROUP BY 1) s ON s.client_code = c.code
    LEFT JOIN (SELECT client_code, max(day) AS last_day FROM onec_sales_daily GROUP BY 1) ever ON ever.client_code = c.code
    WHERE ${where}`;
  const [items, sum] = await Promise.all([
    q(`SELECT c.code, c.name, c.manager, c.phone, c.address,
              coalesce(d.total,0) AS debt, coalesce(d.overdue,0) AS overdue, d.oldest,
              coalesce(s.revenue,0) AS revenue, ever.last_day
       ${base}
       ORDER BY overdue DESC, debt DESC, revenue DESC, c.name LIMIT ${lim(limit, 300, 3000)}`, p),
    q(`SELECT count(*) AS clients, coalesce(sum(d.total),0) AS debt, coalesce(sum(d.overdue),0) AS overdue,
              coalesce(sum(d.b0),0) AS b0, coalesce(sum(d.b8),0) AS b8, coalesce(sum(d.b15),0) AS b15,
              coalesce(sum(d.b30),0) AS b30, coalesce(sum(d.bnone),0) AS bnone,
              count(*) FILTER (WHERE coalesce(d.total,0) > 0) AS debtors,
              count(*) FILTER (WHERE coalesce(s.revenue,0) > 0) AS buyers
       ${base}`, p),
  ]);
  const S = sum.rows[0];
  const summary = { clients: Number(S.clients) };
  if (debtScope) Object.assign(summary, {
    debt: round2(S.debt), overdue: round2(S.overdue), debtors: Number(S.debtors),
    aging: [
      { label: "0–7 дней", amount: round2(S.b0) }, { label: "8–14 дней", amount: round2(S.b8) },
      { label: "15–30 дней", amount: round2(S.b15) }, { label: "больше 30 дней", amount: round2(S.b30) },
      ...(Number(S.bnone) ? [{ label: "без даты", amount: round2(S.bnone) }] : []),
    ],
  });
  if (salesScope) summary.buyers = Number(S.buyers);
  const rows = items.rows.map((r) => {
    const x = { code: r.code, name: r.name, manager: r.manager, phone: r.phone, address: r.address, lastSale: r.last_day };
    if (debtScope) Object.assign(x, { debt: round2(r.debt), overdue: round2(r.overdue), oldestDebt: r.oldest });
    if (salesScope) x.revenue = round2(r.revenue);
    return x;
  });
  return stripForRole(user, { period: { from, to }, overdueDays: config.overdueDays, summary, items: rows, ...(await freshness()) });
}
