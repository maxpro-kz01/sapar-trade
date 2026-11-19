// Магазин (ТЗ TZ_STORE_APP): каталог, заказы и долг самого магазина. Цены и итоги считает сервер.
// Магазин видит только своё: все запросы фильтруются по shop_id / client_code ЭТОГО магазина.
import { q, tx } from "../db/pool.js";
import { config } from "../config.js";
import { HttpError, isIsoDate } from "../lib/http.js";
import { priceTypeFor, priceType, round2, freshness, overdueDate, overdueSql } from "./scope.js";
import { getSettings } from "./settings.js";
import { orderNumber } from "./orders.js";
import { creditInfo, assertCanBuyOnCredit } from "./credit.js";
import { activePromos, giftsFor, saveGifts, giftSummary } from "./promos.js";

// Какой тип цен у магазина: у привязанного — из договора 1С, у нового — из настройки «Прайс для новых магазинов» (по умолчанию «Рынок»).
// fb — запасной: берём, когда у товара нет цены своего типа (в каталоге и в заказе правило одно).
export async function shopTypes(shop) {
  const want = String((await getSettings()).shopPriceType || "").trim();
  const ok = !!want && (await q("SELECT 1 FROM onec_prices WHERE price_type = $1 AND price > 0 LIMIT 1", [want])).rowCount;
  const fb = ok ? want : await priceType();
  const pt = shop?.client_code ? await priceTypeFor(shop.client_code) : ok ? want : await priceTypeFor(null);
  return { pt, fb };
}

export const PAYMENTS = ["cash", "transfer", "debt"];
export const PAYMENT_NAMES = { cash: "Наличными", transfer: "Переводом", debt: "В долг" };
// У магазина, которого нет в 1С, временный код; при привязке к клиенту 1С заказы переносятся на настоящий
export const clientCodeOf = (shop) => shop.client_code || `NEW-${shop.id}`;

export async function shopCatalog(shop) {
  // если у товара нет цены типа магазина — берём цену из настройки «Прайс для новых магазинов» (по умолчанию «Рынок»)
  const { pt, fb } = await shopTypes(shop);
  const { rows } = await q(
    `SELECT pr.code, pr.name, coalesce(pr.group_name, 'Без группы') AS grp, pr.unit, coalesce(NULLIF(p.price, 0), f.price) AS price, coalesce(st.qty, 0) > 0 AS in_stock
     FROM onec_products pr
     LEFT JOIN onec_prices p ON p.product_code = pr.code AND p.price_type = $1
     LEFT JOIN onec_prices f ON f.product_code = pr.code AND f.price_type = $2 AND f.price > 0
     LEFT JOIN (SELECT product_code, sum(qty) AS qty FROM onec_stock GROUP BY 1) st ON st.product_code = pr.code
     WHERE coalesce(NULLIF(p.price, 0), f.price) > 0
     ORDER BY grp, pr.name`, [pt, fb]);
  const items = rows.map((r) => ({ code: r.code, name: r.name, group: r.grp, unit: r.unit, price: Number(r.price), inStock: r.in_stock }));
  return { groups: [...new Set(items.map((i) => i.group))], items, promos: await activePromos(), ...(await freshness()) };
}

export async function createShopOrder(shop, b) {
  if (!Array.isArray(b?.items) || !b.items.length) throw new HttpError(400, "Добавьте товары в заказ");
  if (b.items.length > 200) throw new HttpError(400, "Слишком много строк в заказе");
  const payment = b.payment ?? "cash";
  if (!PAYMENTS.includes(payment)) throw new HttpError(400, "Неверный способ оплаты");
  if (b.deliveryDate && !isIsoDate(b.deliveryDate)) throw new HttpError(400, "Дата доставки в формате ГГГГ-ММ-ДД");
  const qtyByCode = new Map();
  for (const it of b.items) {
    const code = String(it?.code || ""), qty = Number(it?.qty);
    if (!code || !Number.isFinite(qty) || qty <= 0 || qty > 100000) throw new HttpError(400, `Неверное количество: ${code || "без кода"}`);
    qtyByCode.set(code, round2((qtyByCode.get(code) || 0) + qty));
  }
  const { rows: [cnt] } = await q("SELECT count(*) AS n FROM orders WHERE shop_id = $1 AND created_at > now() - interval '1 day'", [shop.id]);
  if (Number(cnt.n) >= config.shopOrdersPerDay) throw new HttpError(429, "Слишком много заказов за сутки. Позвоните в офис");

  const { pt, fb } = await shopTypes(shop);
  const { rows: prods } = await q(
    `SELECT pr.code, pr.name, pr.unit, coalesce(NULLIF(p.price, 0), f.price) AS price, coalesce(st.qty, 0) AS stock FROM onec_products pr
     LEFT JOIN onec_prices p ON p.product_code = pr.code AND p.price_type = $1
     LEFT JOIN onec_prices f ON f.product_code = pr.code AND f.price_type = $3 AND f.price > 0
     LEFT JOIN (SELECT product_code, sum(qty) AS qty FROM onec_stock GROUP BY 1) st ON st.product_code = pr.code
     WHERE pr.code = ANY($2::text[])`, [pt, [...qtyByCode.keys()], fb]);
  const byCode = new Map(prods.map((p) => [p.code, p]));
  const lines = [...qtyByCode].map(([code, qty], i) => {
    const p = byCode.get(code);
    if (!p || !(p.price > 0)) throw new HttpError(400, `Товара ${code} нет в каталоге`);
    if (!(Number(p.stock) > 0)) throw new HttpError(400, `«${p.name}» нет в наличии`);
    return { line: i + 1, code, name: p.name, unit: p.unit, qty, price: p.price, sum: round2(qty * p.price) };
  });
  const total = round2(lines.reduce((a, l) => a + l.sum, 0));
  const gifts = await giftsFor(lines); // акции: подарок отдельной строкой с ценой 0
  const max = Number((await getSettings()).shopMaxOrder) || 0;
  if (max > 0 && total > max) throw new HttpError(400, `Заказ больше ${Math.round(max).toLocaleString("ru-RU")} ₸ — оформите через менеджера`);
  if (payment === "debt") await assertCanBuyOnCredit(shop.client_code, total);

  const code = clientCodeOf(shop);
  const manager = shop.client_code ? (await q("SELECT manager FROM onec_clients WHERE code = $1", [shop.client_code])).rows[0]?.manager || null : null;
  return tx(async (c) => {
    // onec_status 'skip': заказы магазинов в 1С сами не уходят — их сначала смотрит сотрудник
    const { rows: [o] } = await c.query(
      `INSERT INTO orders(client_code, client_name, manager, created_by, comment, delivery_date, price_type, total, onec_status, source, shop_id, payment)
       VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,'skip','shop',$8,$9) RETURNING id`,
      [code, shop.name, manager, b.comment ? String(b.comment).slice(0, 500) : null, b.deliveryDate || null, pt, total, shop.id, payment]);
    for (const l of lines)
      await c.query("INSERT INTO order_items(order_id, line, product_code, name, unit, qty, price, sum) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [o.id, l.line, l.code, l.name, l.unit, l.qty, l.price, l.sum]);
    await c.query("INSERT INTO order_events(order_id, event, note) VALUES ($1,'Создан магазином',$2)", [o.id, PAYMENT_NAMES[payment]]);
    await saveGifts(c, o.id, null, lines.length + 1, gifts);
    return { id: o.id, number: orderNumber(o.id), total, lines: lines.length, payment, gifts: giftSummary(gifts) };
  });
}

export async function listShopOrders(shop) {
  const { rows } = await q(
    `SELECT o.id, o.status, o.total, o.payment, o.comment, o.delivery_date, o.created_at,
            (SELECT json_agg(json_build_object('name', i.name, 'unit', i.unit, 'qty', i.qty, 'price', i.price, 'sum', i.sum, 'gift', i.is_gift) ORDER BY i.line)
             FROM order_items i WHERE i.order_id = o.id) AS items
     FROM orders o WHERE o.shop_id = $1 ORDER BY o.id DESC LIMIT 100`, [shop.id]);
  return rows.map((o) => ({ ...o, number: orderNumber(o.id), total: Number(o.total) }));
}

// Магазин может отменить только свой заказ, пока он «Новый»
export async function cancelShopOrder(shop, id) {
  const { rows: [o] } = await q("SELECT id, status FROM orders WHERE id = $1 AND shop_id = $2", [Number(id) || 0, shop.id]);
  if (!o) throw new HttpError(404, "Заказ не найден");
  if (o.status !== "Новый") throw new HttpError(400, "Заказ уже принят — отмените его через менеджера");
  await tx(async (c) => {
    await c.query("UPDATE orders SET status = 'Отменён', updated_at = now() WHERE id = $1", [o.id]);
    await c.query("INSERT INTO order_events(order_id, event, note) VALUES ($1,'Отменён','Отменил магазин')", [o.id]);
  });
  return { ok: true };
}

export async function shopDebt(shop) {
  const credit = await creditInfo(shop.client_code);
  if (!shop.client_code) return { ...credit, overdue: 0, docs: [] };
  const [{ rows: [t] }, { rows: docs }] = await Promise.all([
    q(`SELECT coalesce(sum(amount) FILTER (WHERE ${overdueSql("", "$2")}), 0) AS overdue
       FROM onec_debts_open WHERE client_code = $1`, [shop.client_code, overdueDate()]),
    q(`SELECT doc_date, doc_name, amount FROM onec_debts_open WHERE client_code = $1 ORDER BY doc_date DESC NULLS LAST LIMIT 50`, [shop.client_code]),
  ]);
  return { ...credit, overdue: round2(Number(t.overdue)), docs: docs.map((d) => ({ date: d.doc_date, name: d.doc_name, amount: Number(d.amount) })), ...(await freshness()) };
}
