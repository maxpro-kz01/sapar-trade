// Деньги из 1С (ТЗ финансов v1.2, часть B): остатки касс и счетов, движение денег по статьям, расходы, чистая прибыль.
// Расходы в УТП — это выплаты по статьям движения денежных средств (регистра «Затраты» в базе нет).
// Каждая статья относится к группе; владелец может поменять группу, автоматика ручной выбор больше не трогает.
import { q } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError } from "../lib/http.js";
import { round2, prevRange, freshness, today } from "./scope.js";

export const GROUPS = {
  customer: "Поступления от покупателей",
  income_other: "Прочие поступления",
  supplier: "Оплата поставщикам",
  transfer: "Переводы между своими счетами",
  loan: "Займы и кредиты",
  expense: "Операционные расходы",
  none: "Без статьи — уточнить в 1С",
};

// Группа по умолчанию — по названию статьи и её виду в 1С (решение заказчика 09.11: «Расходы Сапар» — расход бизнеса)
export function defaultGroup(article, kind, hasIn, hasOut) {
  const n = String(article || "").toLowerCase().replace(/ё/g, "е");
  if (!n.trim()) return "none";
  if (/деньги в пути|зачислени[ея].*выручк|поступлени[ея] денежных средств с расчетн|выдача денежных средств кассе|перемещени|между счетами|инкассац/.test(n)) return "transfer";
  if (/поставщик/.test(n)) return "supplier";
  if (/займ|кредит/.test(n)) return "loan";
  if (/покупател|платежной картой|kaspi|каспи/.test(n)) return "customer";
  if (kind === "Поступление" || (hasIn && !hasOut)) return "income_other";
  return "expense";
}

// Новые статьи (из справочника или из движения) получают группу по умолчанию. Вызывается в транзакции загрузки.
export async function ensureArticleGroups(db) {
  const { rows } = await db.query(
    `SELECT x.article, max(a.kind) AS kind, bool_or(f.dir = 'in') AS has_in, bool_or(f.dir = 'out') AS has_out
     FROM (SELECT name AS article FROM onec_cf_articles UNION SELECT DISTINCT article FROM onec_cashflow_daily) x
     LEFT JOIN onec_cf_articles a ON a.name = x.article
     LEFT JOIN onec_cashflow_daily f ON f.article = x.article
     WHERE NOT EXISTS (SELECT 1 FROM cf_article_groups g WHERE g.article = x.article)
     GROUP BY x.article`);
  for (const r of rows)
    await db.query("INSERT INTO cf_article_groups(article, grp) VALUES ($1,$2) ON CONFLICT (article) DO NOTHING",
      [r.article, defaultGroup(r.article, r.kind, r.has_in, r.has_out)]);
}

const FLOW = `FROM onec_cashflow_daily f LEFT JOIN cf_article_groups g ON g.article = f.article`;
const GRP = `coalesce(g.grp, CASE WHEN f.article = '' THEN 'none' WHEN f.dir = 'in' THEN 'income_other' ELSE 'expense' END)`;

// Поступило от покупателей за период (видит и директор)
async function received({ from, to }) {
  const { rows } = await q(
    `SELECT f.day, sum(f.amount) AS amount ${FLOW}
     WHERE f.day BETWEEN $1 AND $2 AND f.dir = 'in' AND ${GRP} = 'customer' GROUP BY 1 ORDER BY 1`, [from, to]);
  return { total: round2(rows.reduce((s, r) => s + Number(r.amount), 0)), daily: rows.map((r) => ({ day: r.day, amount: round2(r.amount) })) };
}

// Расходы за период: выплаты по статьям группы «Операционные расходы» минус возвраты по ним
export async function expenses({ from, to }) {
  const { rows } = await q(
    `SELECT f.article, sum(CASE WHEN f.dir = 'out' THEN f.amount ELSE -f.amount END) AS amount ${FLOW}
     WHERE f.day BETWEEN $1 AND $2 AND ${GRP} = 'expense' GROUP BY 1 ORDER BY 2 DESC`, [from, to]);
  const items = rows.map((r) => ({ article: r.article, amount: round2(r.amount) }));
  return { total: round2(items.reduce((s, r) => s + r.amount, 0)), items };
}

export async function money(user, range) {
  const full = can(user, "cash");
  if (!full && !can(user, "cash.in")) throw new HttpError(403, "Нет доступа");
  const prev = prevRange(range);
  const [rec, recPrev] = await Promise.all([received(range), received(prev)]);
  const out = { period: range, received: { ...rec, prev: recPrev.total }, ...(await freshness()) };
  if (!full) return out; // директор: только «Поступило денег»

  const { from, to } = range;
  const [bal, groups, articles, daily] = await Promise.all([
    q("SELECT account, kind, amount FROM onec_cash ORDER BY amount DESC"),
    q(`SELECT ${GRP} AS grp, sum(f.amount) FILTER (WHERE f.dir = 'in') AS inc, sum(f.amount) FILTER (WHERE f.dir = 'out') AS outg
       ${FLOW} WHERE f.day BETWEEN $1 AND $2 GROUP BY 1`, [from, to]),
    q(`SELECT f.article, ${GRP} AS grp, sum(f.amount) FILTER (WHERE f.dir = 'in') AS inc, sum(f.amount) FILTER (WHERE f.dir = 'out') AS outg
       ${FLOW} WHERE f.day BETWEEN $1 AND $2 GROUP BY 1, 2 ORDER BY greatest(coalesce(sum(f.amount) FILTER (WHERE f.dir = 'in'),0), coalesce(sum(f.amount) FILTER (WHERE f.dir = 'out'),0)) DESC`, [from, to]),
    // по дням — без переводов между своими счетами (иначе деньги «приходят» и «уходят» дважды)
    q(`SELECT f.day, sum(f.amount) FILTER (WHERE f.dir = 'in') AS inc, sum(f.amount) FILTER (WHERE f.dir = 'out') AS outg
       ${FLOW} WHERE f.day BETWEEN $1 AND $2 AND ${GRP} <> 'transfer' GROUP BY 1 ORDER BY 1`, [from, to]),
  ]);
  const accounts = bal.rows.map((r) => ({ account: r.account, kind: r.kind, amount: round2(r.amount) }));
  const order = Object.keys(GROUPS);
  const byGroup = groups.rows.map((r) => ({ grp: r.grp, label: GROUPS[r.grp], in: round2(r.inc), out: round2(r.outg) }))
    .sort((a, b) => order.indexOf(a.grp) - order.indexOf(b.grp));
  const real = byGroup.filter((g) => g.grp !== "transfer");
  return {
    ...out,
    balances: { accounts, total: round2(accounts.reduce((s, a) => s + a.amount, 0)), negative: accounts.filter((a) => a.amount < 0).length },
    flow: {
      in: round2(real.reduce((s, g) => s + g.in, 0)), out: round2(real.reduce((s, g) => s + g.out, 0)),
      transfers: round2(byGroup.find((g) => g.grp === "transfer")?.out || 0),
      byGroup,
      byArticle: articles.rows.map((r) => ({ article: r.article || "(без статьи)", grp: r.grp, in: round2(r.inc), out: round2(r.outg) })),
      daily: daily.rows.map((r) => ({ day: r.day, in: round2(r.inc), out: round2(r.outg) })),
    },
  };
}

// P&L по месяцам: выручка, себестоимость, расходы, чистая прибыль — последние 6 месяцев (только владелец)
export async function pnlMonths(months = 6) {
  const cur = today().slice(0, 8) + "01";
  const start = new Date(cur + "T00:00:00Z"); start.setUTCMonth(start.getUTCMonth() - (months - 1));
  const s = start.toISOString().slice(0, 10);
  const { rows } = await q(
    `WITH m AS (SELECT generate_series($1::date, $2::date, interval '1 month')::date AS month)
     SELECT m.month,
       (SELECT coalesce(sum(revenue),0) FROM onec_sales_daily WHERE day >= m.month AND day < m.month + interval '1 month') AS revenue,
       (SELECT coalesce(sum(cost),0) FROM onec_cost_daily WHERE day >= m.month AND day < m.month + interval '1 month') AS cost,
       (SELECT coalesce(sum(CASE WHEN f.dir = 'out' THEN f.amount ELSE -f.amount END),0) ${FLOW}
          WHERE f.day >= m.month AND f.day < m.month + interval '1 month' AND ${GRP} = 'expense') AS expenses
     FROM m ORDER BY m.month`, [s, cur]);
  return rows.map((r) => {
    const gross = Number(r.revenue) - Number(r.cost);
    return { month: r.month, revenue: round2(r.revenue), cost: round2(r.cost), gross: round2(gross), expenses: round2(r.expenses), net: round2(gross - Number(r.expenses)) };
  });
}

// --- статьи и их группы (владелец) ---
const needOwner = (user) => { if (!can(user, "gross")) throw new HttpError(403, "Нет доступа"); };

export async function listArticles(user) {
  needOwner(user);
  const t = today();
  const { rows } = await q(
    `SELECT g.article, g.grp, g.manual, g.first_seen > now() - interval '7 days' AND NOT g.manual AS is_new, a.kind, a.activity,
            coalesce(sum(f.amount) FILTER (WHERE f.dir = 'in'),0) AS inc, coalesce(sum(f.amount) FILTER (WHERE f.dir = 'out'),0) AS outg
     FROM cf_article_groups g
     LEFT JOIN onec_cf_articles a ON a.name = g.article
     LEFT JOIN onec_cashflow_daily f ON f.article = g.article AND f.day > $1::date - 30
     GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY greatest(coalesce(sum(f.amount) FILTER (WHERE f.dir = 'in'),0), coalesce(sum(f.amount) FILTER (WHERE f.dir = 'out'),0)) DESC, 1`, [t]);
  return {
    groups: GROUPS,
    items: rows.map((r) => ({ article: r.article, grp: r.grp, manual: r.manual, isNew: r.is_new, kind: r.kind, in30: round2(r.inc), out30: round2(r.outg) })),
  };
}

export async function setArticleGroup(user, article, grp) {
  needOwner(user);
  if (typeof article !== "string") throw new HttpError(400, "Укажите статью");
  if (!Object.hasOwn(GROUPS, grp)) throw new HttpError(400, "Неизвестная группа");
  const { rowCount } = await q("UPDATE cf_article_groups SET grp = $2, manual = true, updated_by = $3, updated_at = now() WHERE article = $1",
    [article, grp, user.id]);
  if (!rowCount) throw new HttpError(404, "Статья не найдена");
  return { article, grp, manual: true };
}
