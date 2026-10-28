// Проблемы и уведомления — считаются из реальных данных 1С с учётом прав роли.
// lvl: red — срочно, yellow — обратить внимание, green — всё в порядке.
import { q } from "../db/pool.js";
import { config } from "../config.js";
import { can, scopeOf } from "./rbac.js";
import { syncStatus } from "./sync.js";
import { round2, clientFilter, priceType, today, shiftDay, overdueDate } from "./scope.js";
import { team } from "./team.js";

const money = (n) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ") + " ₸";

export async function problems(user) {
  const list = [];
  const t = today();
  const st = await syncStatus(config.staleMinutes);
  if (!st.lastSync) list.push({ lvl: "red", code: "nodata", title: "Данные из 1С ещё не загружались", detail: "Нужно запустить агент на сервере 1С", tab: "system" });
  else if (st.stale) list.push({ lvl: "red", code: "stale", title: "Данные из 1С устарели", detail: "Последнее обновление: " + new Date(st.lastSync).toLocaleString("ru-RU", { timeZone: "Asia/Qyzylorda" }), tab: "system" });
  if (can(user, "sync")) {
    const bad = st.items.filter((i) => i.lastError && (!i.lastOk || new Date(i.lastError.at) > new Date(i.lastOk)));
    if (bad.length) list.push({ lvl: "yellow", code: "syncerr", title: `Ошибки загрузки из 1С: ${bad.length}`, detail: bad.map((b) => b.entity).join(", "), tab: "system" });
  }

  if (scopeOf(user, "debts")) {
    const p = [overdueDate(), shiftDay(t, -30)];
    const f = clientFilter(user, "debts", "d", p);
    const { rows: [d] } = await q(
      `SELECT coalesce(sum(amount) FILTER (WHERE amount > 0 AND doc_date < $1),0) AS overdue,
              count(DISTINCT client_code) FILTER (WHERE amount > 0 AND doc_date < $1) AS clients,
              coalesce(sum(amount) FILTER (WHERE amount > 0 AND doc_date < $2),0) AS old
       FROM onec_debts d WHERE true${f}`, p);
    if (Number(d.overdue) > 0) list.push({ lvl: Number(d.old) > 0 ? "red" : "yellow", code: "overdue",
      title: `Просроченная дебиторка: ${money(d.overdue)}`, detail: `${d.clients} клиентов, долг старше ${config.overdueDays} дней` + (Number(d.old) > 0 ? `; старше 30 дней — ${money(d.old)}` : ""), tab: "clients", filter: "debtors" });
  }

  if (scopeOf(user, "sales")) {
    const p = [shiftDay(t, -90), shiftDay(t, -30)];
    const f = clientFilter(user, "sales", "s", p);
    const { rows: [s] } = await q(
      `SELECT count(*) AS n FROM (SELECT client_code, max(day) AS last_day FROM onec_sales_daily s
       WHERE client_code <> ''${f} GROUP BY 1) x WHERE last_day BETWEEN $1 AND $2`, p);
    if (Number(s.n) > 0) list.push({ lvl: "yellow", code: "sleeping", title: `Клиенты перестали покупать: ${s.n}`, detail: "Последняя покупка 30–90 дней назад", tab: "clients", filter: "sleeping" });
  }

  if (can(user, "stock")) {
    const pt = await priceType();
    const { rows: [s] } = await q(
      `SELECT count(*) FILTER (WHERE st.qty < 0) AS negative, count(*) FILTER (WHERE st.qty > 0 AND p.price IS NULL) AS no_price,
              coalesce(sum(st.qty * coalesce(p.price,0)) FILTER (WHERE st.qty > 0 AND (ls.last_day IS NULL OR ls.last_day < $2)),0) AS dead
       FROM onec_stock st LEFT JOIN onec_prices p ON p.product_code = st.product_code AND p.price_type = $1
       LEFT JOIN (SELECT product_code, max(day) AS last_day FROM onec_sales_daily GROUP BY 1) ls ON ls.product_code = st.product_code`,
      [pt, shiftDay(t, -60)]);
    if (Number(s.negative) > 0) list.push({ lvl: "red", code: "negative", title: `Отрицательные остатки: ${s.negative}`, detail: "Проверьте документы в 1С", tab: "stock", filter: "low" });
    if (Number(s.no_price) > 0) list.push({ lvl: "yellow", code: "noprice", title: `Товары без цены «${pt}»: ${s.no_price}`, detail: "Сумма склада по ним не считается", tab: "stock" });
    if (Number(s.dead) > 0) list.push({ lvl: "yellow", code: "dead", title: `Неликвид (нет продаж 60+ дней): ${money(s.dead)}`, detail: "По цене продажи", tab: "stock", filter: "dead" });
  }

  if (scopeOf(user, "team")) {
    const from = t.slice(0, 8) + "01";
    const tm = await team(user, { from, to: t });
    const idle = tm.items.filter((x) => x.clientsTotal > 0 && (!x.lastSale || x.lastSale < shiftDay(t, -2)));
    if (idle.length) list.push({ lvl: "yellow", code: "idle", title: `ТП без продаж 3+ дня: ${idle.length}`, detail: idle.slice(0, 5).map((x) => x.manager).join(", "), tab: "team" });
    const day = Number(t.slice(8, 10));
    const daysInMonth = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7), 0)).getUTCDate();
    const pace = (day / daysInMonth) * 100;
    const behind = tm.items.filter((x) => x.planPct !== null && x.plan > 0 && x.planPct < pace - 15);
    if (behind.length) list.push({ lvl: "yellow", code: "plan", title: `Отстают от плана: ${behind.length}`, detail: behind.slice(0, 5).map((x) => `${x.manager} ${x.planPct}%`).join(", "), tab: "team" });
  }

  if (!list.length) list.push({ lvl: "green", code: "ok", title: "Проблем не найдено", detail: "Все показатели в норме", tab: "home" });
  const order = { red: 0, yellow: 1, green: 2 };
  return { items: list.sort((a, b) => order[a.lvl] - order[b.lvl]), at: new Date().toISOString() };
}
export { round2 };
