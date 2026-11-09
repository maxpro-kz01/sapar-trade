// ТП клиента (ТЗ финансов v1.2, часть E): в карточках 1С менеджер не заполнен, поэтому ТП берём
// из реализаций — поле «МобильныйАгент» (Эдванс Агент) за 90 дней; запасной вариант — имя основного договора,
// если оно совпадает с именем одного из ТП. Менеджер из карточки 1С, если он когда-то будет заполнен, главнее.
import { q } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError } from "../lib/http.js";

const APPLY_SQL = `
  WITH a AS (
    SELECT DISTINCT ON (client_code) client_code, agent FROM onec_client_agents
    WHERE source = 'agent' ORDER BY client_code, docs DESC, last_day DESC NULLS LAST, agent
  ), names AS (
    SELECT DISTINCT agent FROM onec_client_agents WHERE source = 'agent'
  ), ct AS (
    SELECT ca.client_code, min(n.agent) AS agent FROM onec_client_agents ca
    JOIN names n ON lower(n.agent) = lower(ca.agent)
    WHERE ca.source = 'contract' GROUP BY 1
  )
  UPDATE onec_clients c SET manager = coalesce(nullif(c.manager_1c, ''), a.agent, ct.agent)
  FROM onec_clients x LEFT JOIN a ON a.client_code = x.code LEFT JOIN ct ON ct.client_code = x.code
  WHERE c.code = x.code AND c.manager IS DISTINCT FROM coalesce(nullif(c.manager_1c, ''), a.agent, ct.agent)`;

// Вызывается в транзакции загрузки клиентов или ТП клиентов
export async function applyClientAgents(db) {
  await db.query(APPLY_SQL);
}

// Список ТП, найденных в 1С, — для выбора при создании сотрудника-ТП
export async function agentNames(user) {
  if (!can(user, "users")) throw new HttpError(403, "Нет доступа");
  const { rows } = await q(
    `SELECT manager AS name, count(*)::int AS clients FROM onec_clients
     WHERE coalesce(manager, '') <> '' GROUP BY 1 ORDER BY 1`);
  return rows;
}
