// Заказы покупателей из приложения (ТП). Цены и итог считает сервер по «Цене Прайс» из 1С — клиенту не доверяем.
// Каждый новый заказ ставится в очередь для агента 1С: он создаёт в 1С «Заказ покупателя» (непроведённый).
import { q, tx } from "../db/pool.js";
import { can, managersOf } from "./rbac.js";
import { HttpError, isIsoDate } from "../lib/http.js";
import { priceType, round2 } from "./scope.js";

export const ORDER_STATUSES = ["Новый", "Принят", "Собран", "Отгружен", "Отменён"];
const NEXT = { "Новый": ["Принят", "Отменён"], "Принят": ["Собран", "Отменён"], "Собран": ["Отгружен", "Отменён"], "Отгружен": [], "Отменён": [] };
export const orderNumber = (id) => "СТ-" + String(id).padStart(6, "0");

function scopeWhere(user, params) {
  if (can(user, "orders.all")) return "true";
  if (!can(user, "orders.own")) throw new HttpError(403, "Нет доступа");
  params.push(user.id, managersOf(user));
  return `(o.created_by = $${params.length - 1} OR o.manager = ANY($${params.length}::text[]))`;
}

export async function createOrder(user, b) {
  if (!can(user, "orders.create")) throw new HttpError(403, "Нет доступа");
  const { rows: [client] } = await q("SELECT code, name, manager FROM onec_clients WHERE code = $1", [String(b?.clientCode || "")]);
  if (!client) throw new HttpError(400, "Клиент не найден в 1С");
  if (!can(user, "orders.all") && !managersOf(user).includes(client.manager || ""))
    throw new HttpError(403, "Это не ваш клиент: в 1С у него другой основной менеджер");
  if (!Array.isArray(b.items) || !b.items.length) throw new HttpError(400, "Добавьте товары в заказ");
  if (b.items.length > 300) throw new HttpError(400, "Слишком много строк в заказе");
  if (b.deliveryDate && !isIsoDate(b.deliveryDate)) throw new HttpError(400, "Дата доставки в формате ГГГГ-ММ-ДД");
  const qtyByCode = new Map();
  for (const it of b.items) {
    const code = String(it?.code || ""), qty = Number(it?.qty);
    if (!code || !Number.isFinite(qty) || qty <= 0 || qty > 100000) throw new HttpError(400, `Неверное количество: ${code || "без кода"}`);
    qtyByCode.set(code, round2((qtyByCode.get(code) || 0) + qty));
  }
  const pt = await priceType();
  const { rows: prods } = await q(
    `SELECT pr.code, pr.name, pr.unit, p.price FROM onec_products pr
     LEFT JOIN onec_prices p ON p.product_code = pr.code AND p.price_type = $1 WHERE pr.code = ANY($2::text[])`,
    [pt, [...qtyByCode.keys()]]);
  const byCode = new Map(prods.map((p) => [p.code, p]));
  const lines = [...qtyByCode].map(([code, qty], i) => {
    const p = byCode.get(code);
    if (!p) throw new HttpError(400, `Товар ${code} не найден в 1С`);
    if (!(p.price > 0)) throw new HttpError(400, `Нет цены «${pt}» у товара «${p.name}»`);
    return { line: i + 1, code, name: p.name, unit: p.unit, qty, price: p.price, sum: round2(qty * p.price) };
  });
  const total = round2(lines.reduce((a, l) => a + l.sum, 0));
  return tx(async (c) => {
    const { rows: [o] } = await c.query(
      `INSERT INTO orders(client_code, client_name, manager, created_by, comment, delivery_date, price_type, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
      [client.code, client.name, client.manager, user.id, b.comment ? String(b.comment).slice(0, 1000) : null, b.deliveryDate || null, pt, total]);
    for (const l of lines)
      await c.query("INSERT INTO order_items(order_id, line, product_code, name, unit, qty, price, sum) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [o.id, l.line, l.code, l.name, l.unit, l.qty, l.price, l.sum]);
    await c.query("INSERT INTO order_events(order_id, user_id, event) VALUES ($1,$2,'Создан')", [o.id, user.id]);
    return { id: o.id, number: orderNumber(o.id), total, lines: lines.length };
  });
}

export async function listOrders(user, { status, from, to, limit } = {}) {
  const p = [];
  let where = scopeWhere(user, p);
  if (status && ORDER_STATUSES.includes(status)) { p.push(status); where += ` AND o.status = $${p.length}`; }
  if (from && isIsoDate(from)) { p.push(from); where += ` AND o.created_at >= $${p.length}::date`; }
  if (to && isIsoDate(to)) { p.push(to); where += ` AND o.created_at < $${p.length}::date + 1`; }
  const n = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const { rows } = await q(
    `SELECT o.*, u.name AS creator,
            (SELECT json_agg(json_build_object('code', i.product_code, 'name', i.name, 'unit', i.unit, 'qty', i.qty, 'price', i.price, 'sum', i.sum) ORDER BY i.line)
             FROM order_items i WHERE i.order_id = o.id) AS items,
            (SELECT json_agg(json_build_object('at', e.at, 'event', e.event, 'note', e.note, 'user', eu.name) ORDER BY e.id)
             FROM order_events e LEFT JOIN users eu ON eu.id = e.user_id WHERE e.order_id = o.id) AS events
     FROM orders o JOIN users u ON u.id = o.created_by
     WHERE ${where} ORDER BY o.id DESC LIMIT ${n}`, p);
  return rows.map((o) => ({ ...o, number: orderNumber(o.id) }));
}

async function getVisible(user, id) {
  const p = [Number(id) || 0];
  const where = scopeWhere(user, p);
  const { rows } = await q(`SELECT o.* FROM orders o WHERE o.id = $1 AND ${where}`, p);
  if (!rows[0]) throw new HttpError(404, "Заказ не найден");
  return rows[0];
}

export async function setStatus(user, id, status, note) {
  const o = await getVisible(user, id);
  if (!ORDER_STATUSES.includes(status)) throw new HttpError(400, "Неверный статус");
  const ownCancel = status === "Отменён" && o.status === "Новый" && o.created_by === user.id;
  if (!can(user, "orders.manage") && !ownCancel) throw new HttpError(403, "Нет доступа");
  if (!NEXT[o.status].includes(status)) throw new HttpError(400, `Нельзя перевести заказ из «${o.status}» в «${status}»`);
  let extra = note ? String(note).slice(0, 500) : null;
  await tx(async (c) => {
    // отменён до отправки в 1С — в 1С не отправляем; уже в 1С — напоминаем отменить там вручную
    const onec = status === "Отменён" && o.onec_status !== "sent" ? ", onec_status = 'skip'" : "";
    if (status === "Отменён" && o.onec_status === "sent") extra = `Отмените заказ ${o.onec_number || ""} в 1С вручную` + (extra ? ". " + extra : "");
    await c.query(`UPDATE orders SET status = $2, updated_at = now()${onec} WHERE id = $1`, [o.id, status]);
    await c.query("INSERT INTO order_events(order_id, user_id, event, note) VALUES ($1,$2,$3,$4)", [o.id, user.id, status, extra]);
  });
  return { ok: true, note: extra };
}

export async function retry1c(user, id) {
  if (!can(user, "orders.manage")) throw new HttpError(403, "Нет доступа");
  const o = await getVisible(user, id);
  if (o.onec_status !== "error") throw new HttpError(400, "Повторять нужно только заказы с ошибкой отправки");
  await q("UPDATE orders SET onec_status = 'pending', onec_error = NULL, updated_at = now() WHERE id = $1", [o.id]);
  return { ok: true };
}

// ===== для агента 1С =====
export async function pendingFor1C() {
  const { rows } = await q(
    `SELECT o.id, o.client_code, o.client_name, o.manager, o.comment, o.delivery_date, o.price_type, o.total, o.created_at,
            u.name AS creator,
            (SELECT json_agg(json_build_object('code', i.product_code, 'qty', i.qty, 'price', i.price, 'sum', i.sum) ORDER BY i.line)
             FROM order_items i WHERE i.order_id = o.id) AS items
     FROM orders o JOIN users u ON u.id = o.created_by
     WHERE o.onec_status = 'pending' AND o.status <> 'Отменён' ORDER BY o.id LIMIT 50`);
  return rows.map((o) => ({ ...o, number: orderNumber(o.id) }));
}

export async function result1C(id, b) {
  const ok = b?.ok === true;
  const { rowCount } = await q(
    `UPDATE orders SET onec_status = $2, onec_number = $3, onec_error = $4, onec_at = now(), updated_at = now()
     WHERE id = $1 AND onec_status = 'pending'`,
    [Number(id) || 0, ok ? "sent" : "error", ok ? String(b.number || "").slice(0, 50) : null, ok ? null : String(b?.error || "ошибка").slice(0, 1000)]);
  if (!rowCount) throw new HttpError(404, "Заказ не ждёт отправки");
  await q("INSERT INTO order_events(order_id, event, note) VALUES ($1,$2,$3)",
    [Number(id), ok ? "Создан в 1С" : "Ошибка 1С", ok ? String(b.number || "") : String(b?.error || "").slice(0, 500)]);
  return { ok: true };
}
