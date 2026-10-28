// Команда: рейтинг торговых представителей. ТП = «Основной менеджер покупателя» в карточке клиента 1С.
// План продаж вводится в приложении (таблица sales_plans) по месяцам на каждого ТП.
import { q } from "../db/pool.js";
import { can, scopeOf, managersOf } from "./rbac.js";
import { HttpError } from "../lib/http.js";
import { round2, pct, stripForRole, freshness, overdueDate, UNIT_COST_CTE, prorate } from "./scope.js";

export async function team(user, range) {
  const scope = scopeOf(user, "team");
  if (!scope) throw new HttpError(403, "Нет доступа");
  const { from, to } = range;
  const own = scope === "own" ? managersOf(user) : null;
  const withCost = can(user, "margin") && scope === "all";
  const p = [from, to, overdueDate(), from.slice(0, 8) + "01"];
  let mf = "m.manager <> ''";
  if (own) { p.push(own); mf += ` AND m.manager = ANY($${p.length}::text[])`; }
  const { rows } = await q(
    `WITH ${UNIT_COST_CTE},
     m AS (SELECT DISTINCT manager FROM onec_clients WHERE coalesce(manager,'') <> ''
           UNION SELECT DISTINCT manager FROM sales_plans WHERE month BETWEEN $4 AND $2),
     cl AS (SELECT manager, count(*) AS clients_total FROM onec_clients GROUP BY 1),
     sl AS (SELECT c.manager, sum(s.revenue) AS revenue, sum(s.qty) AS qty,
                   count(DISTINCT s.client_code) AS clients_active, max(s.day) AS last_day
                   ${withCost ? ", sum(s.qty * coalesce(uc.unit,0)) AS cost" : ""}
            FROM onec_sales_daily s JOIN onec_clients c ON c.code = s.client_code
            ${withCost ? "LEFT JOIN uc ON uc.day = s.day AND uc.product_code = s.product_code" : ""}
            WHERE s.day BETWEEN $1 AND $2 GROUP BY 1),
     ever AS (SELECT c.manager, max(s.day) AS last_day FROM onec_sales_daily s JOIN onec_clients c ON c.code = s.client_code GROUP BY 1),
     db AS (SELECT c.manager, sum(d.amount) FILTER (WHERE d.amount > 0) AS debt,
                   sum(d.amount) FILTER (WHERE d.amount > 0 AND d.doc_date < $3) AS overdue
            FROM onec_debts d JOIN onec_clients c ON c.code = d.client_code GROUP BY 1),
     pl AS (SELECT manager, json_agg(json_build_object('month', to_char(month,'YYYY-MM-DD'), 'amount', amount)) AS plans
            FROM sales_plans WHERE month BETWEEN $4 AND $2 GROUP BY 1),
     u AS (SELECT DISTINCT ON (trim(x)) trim(x) AS manager, users.name AS user_name, users.login
           FROM users, unnest(string_to_array(coalesce(manager_1c,''), ',')) AS x
           WHERE users.is_active AND users.role IN ('tp','supervisor') ORDER BY trim(x), users.role DESC)
     SELECT m.manager, coalesce(cl.clients_total,0) AS clients_total, coalesce(sl.revenue,0) AS revenue, coalesce(sl.qty,0) AS qty,
            coalesce(sl.clients_active,0) AS clients_active, ever.last_day, coalesce(db.debt,0) AS debt, coalesce(db.overdue,0) AS overdue,
            pl.plans, u.user_name, u.login ${withCost ? ", coalesce(sl.cost,0) AS cost" : ""}
     FROM m LEFT JOIN cl ON cl.manager = m.manager LEFT JOIN sl ON sl.manager = m.manager LEFT JOIN ever ON ever.manager = m.manager
     LEFT JOIN db ON db.manager = m.manager LEFT JOIN pl ON pl.manager = m.manager LEFT JOIN u ON u.manager = m.manager
     WHERE ${mf}
     ORDER BY revenue DESC, m.manager`, p);
  const items = rows.map((r, i) => {
    const plan = r.plans ? prorate(r.plans, range) : null;
    const x = {
      rank: i + 1, manager: r.manager, user: r.user_name ? { name: r.user_name, login: r.login } : null,
      revenue: round2(r.revenue), qty: r.qty, clientsActive: Number(r.clients_active), clientsTotal: Number(r.clients_total),
      avgPerClient: Number(r.clients_active) ? round2(r.revenue / r.clients_active) : null,
      lastSale: r.last_day, debt: round2(r.debt), overdue: round2(r.overdue),
      plan, planPct: plan ? pct(r.revenue, plan) : null,
    };
    if (withCost) { x.cost = round2(r.cost); x.gross = round2(x.revenue - x.cost); x.marginPct = pct(x.revenue - x.cost, x.revenue); }
    return x;
  });
  const sum = (k) => round2(items.reduce((a, x) => a + (x[k] || 0), 0));
  const planTotal = items.some((x) => x.plan !== null) ? sum("plan") : null;
  return stripForRole(user, {
    period: { from, to }, items,
    totals: { revenue: sum("revenue"), debt: sum("debt"), overdue: sum("overdue"), plan: planTotal, planPct: planTotal ? pct(sum("revenue"), planTotal) : null },
    approxCost: withCost, ...(await freshness()),
  });
}

// ===== План продаж =====
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function getPlans(user, month) {
  const scope = scopeOf(user, "team");
  if (!scope) throw new HttpError(403, "Нет доступа");
  if (!MONTH.test(month || "")) throw new HttpError(400, "Месяц в формате ГГГГ-ММ");
  const p = [month + "-01"];
  let f = "";
  if (scope === "own") { p.push(managersOf(user)); f = " AND m.manager = ANY($2::text[])"; }
  const { rows } = await q(
    `SELECT m.manager, coalesce(sp.amount, 0) AS amount
     FROM (SELECT DISTINCT manager FROM onec_clients WHERE coalesce(manager,'') <> ''
           UNION SELECT manager FROM sales_plans WHERE month = $1) m
     LEFT JOIN sales_plans sp ON sp.manager = m.manager AND sp.month = $1
     WHERE true${f} ORDER BY m.manager`, p);
  return { month, canEdit: can(user, "plans.edit"), items: rows.map((r) => ({ manager: r.manager, amount: round2(r.amount) })) };
}

export async function savePlans(user, month, items) {
  if (!can(user, "plans.edit")) throw new HttpError(403, "Нет доступа");
  if (!MONTH.test(month || "")) throw new HttpError(400, "Месяц в формате ГГГГ-ММ");
  if (!Array.isArray(items) || items.length > 500) throw new HttpError(400, "Нужен список items");
  let n = 0;
  for (const it of items) {
    const manager = String(it?.manager || "").trim().slice(0, 150);
    const amount = Number(it?.amount);
    if (!manager || !Number.isFinite(amount) || amount < 0) throw new HttpError(400, `Неверная строка плана: ${manager || "без имени"}`);
    await q(`INSERT INTO sales_plans(month, manager, amount, updated_by) VALUES ($1,$2,$3,$4)
             ON CONFLICT (month, manager) DO UPDATE SET amount = EXCLUDED.amount, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [month + "-01", manager, round2(amount), user.id]);
    n++;
  }
  return { ok: true, saved: n };
}
