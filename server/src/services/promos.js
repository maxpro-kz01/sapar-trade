// Акции с подарком (ТЗ TZ_PLAN_PROMO): «купи N штук товара — получи M штук подарка», один раз на заказ.
// Подарок берётся с того же склада и в тех же единицах, что обычный товар: если на складе не хватает, выдаём сколько есть
// и пишем в историю заказа — оператор и директор видят это в «Проблемах». Акция действует для всех клиентов.
import { q } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError, isIsoDate } from "../lib/http.js";
import { round2, today } from "./scope.js";

const need = (user) => { if (!can(user, "promos.edit")) throw new HttpError(403, "Нет доступа"); };

const view = (r) => ({
  id: r.id, title: r.title, label: r.label || `${Number(r.buy_qty)} + ${Number(r.gift_qty)} в подарок`, active: r.active,
  dateFrom: r.date_from, dateTo: r.date_to,
  buyCode: r.buy_product, buyName: r.buy_name, buyUnit: r.buy_unit, buyQty: Number(r.buy_qty),
  giftCode: r.gift_product, giftName: r.gift_name, giftUnit: r.gift_unit, giftQty: Number(r.gift_qty),
  giftStock: r.gift_stock === undefined ? undefined : Number(r.gift_stock),
});

const SELECT = `SELECT p.id, p.title, p.label, p.active, to_char(p.date_from,'YYYY-MM-DD') AS date_from, to_char(p.date_to,'YYYY-MM-DD') AS date_to,
       p.buy_product, p.buy_qty, p.gift_product, p.gift_qty, b.name AS buy_name, b.unit AS buy_unit, g.name AS gift_name, g.unit AS gift_unit,
       coalesce((SELECT sum(qty) FROM onec_stock WHERE product_code = p.gift_product), 0) AS gift_stock
     FROM promos p JOIN onec_products b ON b.code = p.buy_product JOIN onec_products g ON g.code = p.gift_product`;

// Все акции — для владельца и директора (экран «Акции»)
export async function listPromos(user) {
  need(user);
  const { rows } = await q(SELECT + " ORDER BY p.active DESC, p.id DESC");
  const t = today();
  return rows.map((r) => ({ ...view(r), running: r.active && (!r.date_from || r.date_from <= t) && (!r.date_to || r.date_to >= t) }));
}

// Действующие сегодня — их видят все, кто заказывает (отдаются вместе с каталогом)
export async function activePromos() {
  const t = today();
  const { rows } = await q(
    SELECT + ` WHERE p.active AND (p.date_from IS NULL OR p.date_from <= $1::date) AND (p.date_to IS NULL OR p.date_to >= $1::date) ORDER BY p.id`, [t]);
  return rows.map((r) => { const v = view(r); delete v.giftStock; return v; });
}

async function clean(b) {
  const title = String(b?.title || "").trim().slice(0, 120);
  if (!title) throw new HttpError(400, "Укажите название акции");
  const label = b?.label ? String(b.label).trim().slice(0, 60) : null;
  const buyQty = Number(b?.buyQty), giftQty = Number(b?.giftQty);
  if (!(buyQty > 0) || buyQty > 100000) throw new HttpError(400, "Укажите, сколько нужно купить");
  if (!(giftQty > 0) || giftQty > 100000) throw new HttpError(400, "Укажите количество подарка");
  const buy = String(b?.buyCode || ""), gift = String(b?.giftCode || "");
  const { rows } = await q("SELECT code FROM onec_products WHERE code = ANY($1::text[])", [[buy, gift]]);
  const have = new Set(rows.map((r) => r.code));
  if (!have.has(buy)) throw new HttpError(400, "Товар для покупки не найден в 1С");
  if (!have.has(gift)) throw new HttpError(400, "Товар-подарок не найден в 1С");
  const dateFrom = b?.dateFrom || null, dateTo = b?.dateTo || null;
  if ((dateFrom && !isIsoDate(dateFrom)) || (dateTo && !isIsoDate(dateTo))) throw new HttpError(400, "Даты в формате ГГГГ-ММ-ДД");
  if (dateFrom && dateTo && dateFrom > dateTo) throw new HttpError(400, "Дата «с» позже даты «по»");
  return { title, label, buyQty: round2(buyQty), giftQty: round2(giftQty), buy, gift, dateFrom, dateTo, active: b?.active !== false };
}

export async function createPromo(user, b) {
  need(user);
  const p = await clean(b);
  const { rows: [r] } = await q(
    `INSERT INTO promos(title, label, active, date_from, date_to, buy_product, buy_qty, gift_product, gift_qty, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [p.title, p.label, p.active, p.dateFrom, p.dateTo, p.buy, p.buyQty, p.gift, p.giftQty, user.id]);
  return { id: r.id };
}

export async function updatePromo(user, id, b) {
  need(user);
  const p = await clean(b);
  const { rowCount } = await q(
    `UPDATE promos SET title=$2, label=$3, active=$4, date_from=$5, date_to=$6, buy_product=$7, buy_qty=$8, gift_product=$9, gift_qty=$10, updated_at=now()
     WHERE id = $1`, [Number(id) || 0, p.title, p.label, p.active, p.dateFrom, p.dateTo, p.buy, p.buyQty, p.gift, p.giftQty]);
  if (!rowCount) throw new HttpError(404, "Акция не найдена");
  return { ok: true };
}

export async function deletePromo(user, id) {
  need(user);
  const { rowCount } = await q("DELETE FROM promos WHERE id = $1", [Number(id) || 0]);
  if (!rowCount) throw new HttpError(404, "Акция не найдена");
  return { ok: true };
}

// Какие подарки положены к заказу. lines — [{ code, qty }] (по одному на товар). Каждая акция срабатывает один раз на заказ.
// Подарок не больше свободного остатка: из остатка вычитаем то, что клиент заказал сам (и подарки других акций этого заказа).
export async function giftsFor(lines) {
  const qty = new Map(lines.map((l) => [l.code, Number(l.qty)]));
  const t = today();
  const { rows } = await q(
    SELECT + ` WHERE p.active AND p.buy_product = ANY($2::text[]) AND (p.date_from IS NULL OR p.date_from <= $1::date) AND (p.date_to IS NULL OR p.date_to >= $1::date) ORDER BY p.id`,
    [t, [...qty.keys()]]);
  const gifts = [];
  const free = new Map(); // свободный остаток подарочного товара
  for (const r of rows) {
    if ((qty.get(r.buy_product) || 0) < Number(r.buy_qty)) continue;
    if (!free.has(r.gift_product)) free.set(r.gift_product, Math.max(Number(r.gift_stock) - (qty.get(r.gift_product) || 0), 0));
    const want = Number(r.gift_qty);
    const give = round2(Math.min(want, free.get(r.gift_product)));
    free.set(r.gift_product, free.get(r.gift_product) - give);
    gifts.push({ promoId: r.id, title: r.title, code: r.gift_product, name: r.gift_name, unit: r.gift_unit, qty: give, wanted: want });
  }
  return gifts;
}

// Записать подарочные строки (цена 0, в сумму заказа не входят) и пометки в историю заказа
export async function saveGifts(c, orderId, userId, startLine, gifts) {
  let line = startLine;
  for (const g of gifts) {
    if (g.qty > 0) {
      await c.query(
        "INSERT INTO order_items(order_id, line, product_code, name, unit, qty, price, sum, is_gift, promo_id) VALUES ($1,$2,$3,$4,$5,$6,0,0,true,$7)",
        [orderId, line++, g.code, "Подарок: " + g.name, g.unit, g.qty, g.promoId]);
      await c.query("INSERT INTO order_events(order_id, user_id, event, note) VALUES ($1,$2,'Акция',$3)",
        [orderId, userId, `«${g.title}»: подарок ${g.name} × ${g.qty}` + (g.qty < g.wanted ? ` (положено ${g.wanted}, на складе не хватило)` : "")]);
    }
    if (g.qty < g.wanted)
      await c.query("INSERT INTO order_events(order_id, user_id, event, note) VALUES ($1,$2,'Подарок: не хватило',$3)",
        [orderId, userId, `Акция «${g.title}»: подарок ${g.name} — нужно ${g.wanted}, выдано ${g.qty}`]);
  }
}

export const giftSummary = (gifts) => gifts.filter((g) => g.qty > 0).map((g) => ({ name: g.name, unit: g.unit, qty: g.qty, title: g.title, short: g.qty < g.wanted }));
