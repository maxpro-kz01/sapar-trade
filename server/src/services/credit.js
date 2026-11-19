// Кредитный лимит «в долг» (ТЗ TZ_STORE_APP §5). Нет строки или 0 — «в долг» выключено.
// Свободный лимит = лимит − долг в 1С − заказы «в долг», которые ещё не отгружены (в 1С их долга пока нет).
import { q } from "../db/pool.js";
import { HttpError } from "../lib/http.js";
import { round2 } from "./scope.js";

export async function creditInfo(clientCode) {
  if (!clientCode) return { limit: 0, debt: 0, pending: 0, available: 0 };
  const [{ rows: [l] }, { rows: [d] }, { rows: [p] }] = await Promise.all([
    q("SELECT credit_limit FROM client_limits WHERE client_code = $1", [clientCode]),
    q("SELECT coalesce(sum(amount), 0) AS debt FROM onec_debts_open WHERE client_code = $1", [clientCode]),
    q(`SELECT coalesce(sum(total), 0) AS pending FROM orders
       WHERE client_code = $1 AND payment = 'debt' AND status IN ('Новый', 'Принят', 'Собран')`, [clientCode]),
  ]);
  const limit = Number(l?.credit_limit || 0), debt = Number(d.debt), pending = Number(p.pending);
  return { limit, debt: round2(debt), pending: round2(pending), available: Math.max(0, round2(limit - debt - pending)) };
}

// Бросает 400, если заказ на `total` «в долг» не помещается в лимит
export async function assertCanBuyOnCredit(clientCode, total) {
  const c = await creditInfo(clientCode);
  if (!(c.limit > 0)) throw new HttpError(400, "Оплата в долг для вашего магазина не подключена. Выберите другой способ или позвоните в офис");
  if (total > c.available) throw new HttpError(400, `Не хватает лимита «в долг»: доступно ${Math.round(c.available).toLocaleString("ru-RU")} ₸`, { available: c.available });
  return c;
}

export async function setLimit(user, clientCode, value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new HttpError(400, "Лимит: число от 0");
  const { rowCount } = await q("SELECT 1 FROM onec_clients WHERE code = $1", [String(clientCode)]);
  if (!rowCount) throw new HttpError(404, "Клиент не найден в 1С");
  await q(`INSERT INTO client_limits(client_code, credit_limit, updated_by) VALUES ($1,$2,$3)
           ON CONFLICT (client_code) DO UPDATE SET credit_limit = EXCLUDED.credit_limit, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [String(clientCode), round2(n), user.id]);
  return creditInfo(String(clientCode));
}
