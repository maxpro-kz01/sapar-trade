// Источник долгов клиентов (ТЗ TZ_DEBTS_BUH): что сейчас действует, сколько контрагентов Бухгалтерии
// сопоставлено с клиентами УТП и кто не найден — для проверки в настройках администратора.
import { q } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError } from "../lib/http.js";
import { getSettings } from "./settings.js";

const n = (v) => Number(v || 0);

export async function debtsSourceInfo(user) {
  if (!can(user, "settings")) throw new HttpError(403, "Нет доступа");
  const { debtsSource } = await getSettings();
  const { rows: [t] } = await q(`
    SELECT (SELECT count(*) FROM onec_debts_buh) AS buh_rows,
           (SELECT max(finished_at) FROM sync_runs WHERE entity = 'debts_buh' AND ok) AS buh_last,
           (SELECT coalesce(sum(amount), 0) FROM onec_debts_buh WHERE kind = 'bal' AND amount > 0) AS buh_total,
           (SELECT coalesce(sum(amount), 0) FROM onec_debts_open) AS open_total,
           (SELECT count(*) FROM onec_debts_buh_map WHERE matched) AS matched,
           (SELECT count(*) FROM onec_debts_buh_map WHERE NOT matched) AS unmatched`);
  const { rows: miss } = await q(`
    SELECT m.buh_code AS code, m.client_name AS name, sum(b.amount) AS amount
    FROM onec_debts_buh_map m JOIN onec_debts_buh b ON b.client_code = m.buh_code AND b.kind = 'bal'
    WHERE NOT m.matched GROUP BY 1, 2 HAVING sum(b.amount) > 0 ORDER BY 3 DESC LIMIT 50`);
  const buhRows = n(t.buh_rows);
  return {
    source: debtsSource,
    active: debtsSource === "buh" && buhRows > 0 ? "buh" : "utp",
    buhLast: t.buh_last,
    buhTotal: n(t.buh_total),
    openTotal: n(t.open_total),
    matched: n(t.matched),
    unmatched: n(t.unmatched),
    unmatchedTop: miss.map((r) => ({ code: r.code, name: r.name, amount: n(r.amount) })),
  };
}
