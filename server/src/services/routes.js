// Маршрутные листы водителей (ТЗ TZ_DRIVER_ROUTE): оператор/склад/владелец/директор составляют лист из собранных заказов,
// водитель видит ТОЛЬКО свой лист, отмечает «Доставлено» / «Не принят» и сумму наличных; точка магазина на карте ставится один раз.
import { q, tx } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError, isIsoDate, todayLocal } from "../lib/http.js";
import { orderNumber } from "./orders.js";

export const FAIL_REASONS = ["Нет денег", "Закрыто", "Отказ", "Другое"];
const needManage = (user) => { if (!can(user, "routes")) throw new HttpError(403, "Нет доступа"); };
const needDriver = (user) => { if (!can(user, "fleet.send")) throw new HttpError(403, "Нет доступа"); };
const inKz = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 40 && lat <= 56 && lon >= 46 && lon <= 88; // грубо Казахстан: ловим перепутанные широту и долготу
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

// Адрес и телефон: у клиента 1С — из 1С, у магазина вне 1С — из его анкеты
const STOPS_SQL = `
  SELECT st.id, st.sheet_id, st.position, st.status, st.fail_reason, st.done_at,
         o.id AS order_id, o.client_code, o.client_name, o.total, o.payment, o.comment, o.status AS order_status,
         coalesce(nullif(c.address, ''), s.address) AS address, coalesce(nullif(c.phone, ''), s.phone) AS phone,
         g.lat, g.lon,
         coalesce((SELECT json_agg(json_build_object('method', p.method, 'amount', p.amount) ORDER BY p.id) FROM route_payments p WHERE p.stop_id = st.id), '[]') AS payments,
         coalesce((SELECT json_agg(json_build_object('name', i.name, 'unit', i.unit, 'qty', i.qty) ORDER BY i.line) FROM order_items i WHERE i.order_id = o.id), '[]') AS items
  FROM route_stops st JOIN orders o ON o.id = st.order_id
  LEFT JOIN onec_clients c ON c.code = o.client_code
  LEFT JOIN shops s ON s.id = o.shop_id
  LEFT JOIN client_geo g ON g.client_code = o.client_code
  WHERE st.sheet_id = ANY($1::int[]) ORDER BY st.sheet_id, st.position, st.id`;

const stopOut = (r) => ({
  id: r.id, position: r.position, status: r.status, failReason: r.fail_reason,
  payments: r.payments.map((p) => ({ method: p.method, amount: Number(p.amount) })), paid: r.payments.reduce((a, p) => a + Number(p.amount), 0), doneAt: r.done_at,
  orderId: r.order_id, orderNumber: orderNumber(r.order_id), orderStatus: r.order_status,
  clientCode: r.client_code, client: r.client_name, address: r.address || null, phone: r.phone || null,
  total: Number(r.total), payment: r.payment || null, expectCash: r.payment === "cash" ? Number(r.total) : 0,
  comment: r.comment || null, items: r.items, geo: r.lat === null ? null : { lat: r.lat, lon: r.lon },
});

const byMethod = (stops, m) => stops.reduce((a, s) => a + s.payments.filter((p) => p.method === m).reduce((b, p) => b + p.amount, 0), 0);
export const PAY_METHODS = { cash: "Наличные", kaspi: "Kaspi QR", halyk: "Halyk QR" };
const kzt = (n) => Math.round(n).toLocaleString("ru-RU") + " ₸";

const totals = (stops) => ({
  stops: stops.length, done: stops.filter((s) => s.status === "done").length, failed: stops.filter((s) => s.status === "failed").length,
  wait: stops.filter((s) => s.status === "wait").length,
  sum: stops.reduce((a, s) => a + s.total, 0),
  cashExpected: stops.filter((s) => s.status !== "failed").reduce((a, s) => a + s.expectCash, 0),
  cashReceived: byMethod(stops, "cash"), kaspi: byMethod(stops, "kaspi"), halyk: byMethod(stops, "halyk"),
  later: stops.filter((s) => s.status === "done").reduce((a, s) => a + Math.max(0, s.total - s.paid), 0),
});

async function sheetsWithStops(where, params) {
  const { rows } = await q(
    `SELECT sh.*, u.name AS driver FROM route_sheets sh JOIN users u ON u.id = sh.driver_id WHERE ${where} ORDER BY sh.sheet_date DESC, sh.id DESC LIMIT 100`, params);
  if (!rows.length) return [];
  const { rows: st } = await q(STOPS_SQL, [rows.map((r) => r.id)]);
  return rows.map((r) => {
    const stops = st.filter((x) => x.sheet_id === r.id).map(stopOut);
    return { id: r.id, date: r.sheet_date, status: r.status, driverId: r.driver_id, driver: r.driver, sentAt: r.sent_at, closedAt: r.closed_at, stops, totals: totals(stops) };
  });
}

const dayOf = (d) => (d instanceof Date ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qyzylorda" }).format(d) : String(d));

// --- оператор / склад / владелец / директор ---

export async function listSheets(user, { date } = {}) {
  needManage(user);
  const d = date || todayLocal();
  if (!isIsoDate(d)) throw new HttpError(400, "Дата в формате ГГГГ-ММ-ДД");
  return (await sheetsWithStops("sh.sheet_date = $1", [d])).map((s) => ({ ...s, date: dayOf(s.date) }));
}

export async function getSheet(user, id) {
  needManage(user);
  const [s] = await sheetsWithStops("sh.id = $1", [Number(id) || 0]);
  if (!s) throw new HttpError(404, "Лист не найден");
  return { ...s, date: dayOf(s.date) };
}

export async function listDrivers(user) {
  needManage(user);
  const { rows } = await q("SELECT id, name FROM users WHERE role = 'driver' AND is_active ORDER BY name");
  return rows;
}

// Собранные заказы, которые ещё не стоят ни в одном листе
export async function availableOrders(user) {
  needManage(user);
  const { rows } = await q(
    `SELECT o.id, o.client_code, o.client_name, o.total, o.payment, o.delivery_date, o.source,
            coalesce(nullif(c.address, ''), s.address) AS address, (g.lat IS NOT NULL) AS has_geo
     FROM orders o LEFT JOIN onec_clients c ON c.code = o.client_code LEFT JOIN shops s ON s.id = o.shop_id
     LEFT JOIN client_geo g ON g.client_code = o.client_code
     WHERE o.status = 'Собран' AND NOT EXISTS (SELECT 1 FROM route_stops st WHERE st.order_id = o.id AND st.status = 'wait')
     ORDER BY o.delivery_date NULLS LAST, o.id LIMIT 300`);
  return rows.map((r) => ({ orderId: r.id, orderNumber: orderNumber(r.id), clientCode: r.client_code, client: r.client_name, address: r.address || null,
    total: Number(r.total), payment: r.payment || null, deliveryDate: r.delivery_date ? dayOf(r.delivery_date) : null, hasGeo: r.has_geo, shop: r.source === "shop" }));
}

function cleanIds(list) {
  if (!Array.isArray(list)) throw new HttpError(400, "Список заказов — массив");
  const ids = list.map((x) => Number(x));
  if (ids.some((x) => !Number.isInteger(x) || x <= 0)) throw new HttpError(400, "Неверный номер заказа");
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "Заказ указан дважды");
  if (ids.length > 60) throw new HttpError(400, "Не больше 60 остановок в листе");
  return ids;
}

// Остановки листа = завершённые (остаются на местах) + ждущие в заданном порядке. Новые заказы должны быть «Собран».
async function applyStops(c, sheetId, orderIds) {
  const { rows: cur } = await c.query("SELECT id, order_id, status FROM route_stops WHERE sheet_id = $1 ORDER BY position, id", [sheetId]);
  const fixed = cur.filter((s) => s.status !== "wait");
  const fixedOrders = new Set(fixed.map((s) => s.order_id));
  const want = orderIds.filter((id) => !fixedOrders.has(id));
  const waitByOrder = new Map(cur.filter((s) => s.status === "wait").map((s) => [s.order_id, s.id]));
  const dropIds = cur.filter((s) => s.status === "wait" && !want.includes(s.order_id)).map((s) => s.id);
  if (dropIds.length) await c.query("DELETE FROM route_stops WHERE id = ANY($1::int[])", [dropIds]);
  const fresh = want.filter((id) => !waitByOrder.has(id));
  if (fresh.length) {
    const { rows } = await c.query("SELECT id FROM orders WHERE id = ANY($1::int[]) AND status = 'Собран'", [fresh]);
    const ok = new Set(rows.map((r) => r.id));
    const bad = fresh.find((id) => !ok.has(id));
    if (bad) throw new HttpError(400, `Заказ ${orderNumber(bad)} не в статусе «Собран» или не найден`);
  }
  let pos = fixed.length;
  for (const id of want) {
    pos += 1;
    if (waitByOrder.has(id)) await c.query("UPDATE route_stops SET position = $2 WHERE id = $1", [waitByOrder.get(id), pos]);
    else await c.query("INSERT INTO route_stops(sheet_id, position, order_id) VALUES ($1,$2,$3)", [sheetId, pos, id]);
  }
}

const conflict = (e) => {
  if (e.code === "23505" && String(e.constraint).includes("route_sheets_open")) throw new HttpError(409, "У этого водителя уже есть лист на эту дату — откройте его и добавьте заказы");
  if (e.code === "23505") throw new HttpError(409, "Один из заказов уже стоит в другом маршрутном листе");
  throw e;
};

async function checkDriver(id) {
  const { rows: [u] } = await q("SELECT id FROM users WHERE id = $1 AND is_active AND role = 'driver'", [Number(id) || 0]);
  if (!u) throw new HttpError(400, "Водитель не найден");
  return u.id;
}

export async function createSheet(user, b) {
  needManage(user);
  const date = b?.date || todayLocal();
  if (!isIsoDate(date)) throw new HttpError(400, "Дата в формате ГГГГ-ММ-ДД");
  const driverId = await checkDriver(b?.driverId);
  const ids = cleanIds(b?.orderIds ?? []);
  try {
    return await tx(async (c) => {
      const { rows: [s] } = await c.query("INSERT INTO route_sheets(sheet_date, driver_id, created_by) VALUES ($1,$2,$3) RETURNING id", [date, driverId, user.id]);
      await applyStops(c, s.id, ids);
      return { id: s.id };
    });
  } catch (e) { return conflict(e); }
}

async function loadSheet(id) {
  const { rows: [s] } = await q("SELECT * FROM route_sheets WHERE id = $1", [Number(id) || 0]);
  if (!s) throw new HttpError(404, "Лист не найден");
  return s;
}

export async function updateSheet(user, id, b) {
  needManage(user);
  const s = await loadSheet(id);
  if (s.status === "closed") throw new HttpError(400, "Лист уже закрыт");
  const ids = b?.orderIds !== undefined ? cleanIds(b.orderIds) : null;
  const driverId = b?.driverId !== undefined ? await checkDriver(b.driverId) : null;
  if (driverId && s.status !== "draft") throw new HttpError(400, "Водителя можно менять, пока лист не передан");
  try {
    await tx(async (c) => {
      if (driverId) await c.query("UPDATE route_sheets SET driver_id = $2 WHERE id = $1", [s.id, driverId]);
      if (ids) await applyStops(c, s.id, ids);
    });
  } catch (e) { conflict(e); }
  return { ok: true };
}

export async function sendSheet(user, id) {
  needManage(user);
  const s = await loadSheet(id);
  if (s.status !== "draft") throw new HttpError(400, "Лист уже передан водителю");
  const { rows: stops } = await q("SELECT order_id FROM route_stops WHERE sheet_id = $1 AND status = 'wait' ORDER BY position", [s.id]);
  if (!stops.length) throw new HttpError(400, "Добавьте в лист хотя бы один заказ");
  const { rows: [d] } = await q("SELECT name FROM users WHERE id = $1", [s.driver_id]);
  await tx(async (c) => {
    await c.query("UPDATE route_sheets SET status = 'sent', sent_at = now() WHERE id = $1", [s.id]);
    for (const x of stops) await c.query("INSERT INTO order_events(order_id, user_id, event, note) VALUES ($1,$2,'В доставке',$3)", [x.order_id, user.id, `Маршрутный лист: ${d?.name || "водитель"}`]);
  });
  return { ok: true, stops: stops.length };
}

// Закрыть переданный лист вручную: ждущие остановки считаются не доставленными, заказы остаются «Собран»
export async function closeSheet(user, id) {
  needManage(user);
  const s = await loadSheet(id);
  if (s.status !== "sent") throw new HttpError(400, "Закрыть можно только переданный водителю лист");
  await tx(async (c) => {
    await c.query("UPDATE route_stops SET status = 'failed', fail_reason = 'Закрыт оператором' WHERE sheet_id = $1 AND status = 'wait'", [s.id]);
    await c.query("UPDATE route_sheets SET status = 'closed', closed_at = now() WHERE id = $1", [s.id]);
  });
  return { ok: true };
}

export async function deleteSheet(user, id) {
  needManage(user);
  const s = await loadSheet(id);
  if (s.status !== "draft") throw new HttpError(400, "Удалить можно только лист, который ещё не передан водителю");
  await q("DELETE FROM route_sheets WHERE id = $1", [s.id]);
  return { ok: true };
}

function checkPoint(b) {
  const lat = num(b?.lat), lon = num(b?.lon);
  if (!inKz(lat, lon)) throw new HttpError(400, "Точка вне Казахстана — проверьте место на карте");
  return { lat, lon };
}

export async function setClientGeo(user, clientCode, b) {
  needManage(user);
  const code = String(clientCode || "");
  const { rowCount } = await q("SELECT 1 FROM onec_clients WHERE code = $1 UNION SELECT 1 FROM orders WHERE client_code = $1 LIMIT 1", [code]);
  if (!rowCount) throw new HttpError(404, "Клиент не найден");
  const p = checkPoint(b);
  await q(`INSERT INTO client_geo(client_code, lat, lon, set_by) VALUES ($1,$2,$3,$4)
           ON CONFLICT (client_code) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon, set_by = EXCLUDED.set_by, set_at = now()`, [code, p.lat, p.lon, user.id]);
  return { ok: true };
}

// --- водитель: только свой лист ---

export async function myRoute(user) {
  needDriver(user);
  // переданный лист; только что завершённый тоже показываем (12 часов), чтобы водитель видел итог
  const sheets = await sheetsWithStops(
    "sh.driver_id = $1 AND (sh.status = 'sent' OR (sh.status = 'closed' AND sh.closed_at > now() - interval '12 hours' AND sh.sent_at IS NOT NULL))", [user.id]);
  const s = sheets.sort((a, b) => (a.status === "sent" ? 0 : 1) - (b.status === "sent" ? 0 : 1))[0];
  if (!s) return { sheet: null, stops: [], totals: totals([]) };
  return { sheet: { id: s.id, date: dayOf(s.date), status: s.status }, stops: s.stops, totals: s.totals };
}

async function myStop(user, id, db = { query: q }) {
  needDriver(user);
  const { rows } = await db.query(
    `SELECT st.*, sh.driver_id, sh.status AS sheet_status, o.status AS order_status, o.client_code, o.total
     FROM route_stops st JOIN route_sheets sh ON sh.id = st.sheet_id JOIN orders o ON o.id = st.order_id WHERE st.id = $1`, [Number(id) || 0]);
  const st = rows[0];
  if (!st || st.driver_id !== user.id || st.sheet_status !== "sent") throw new HttpError(404, "Остановка не найдена");
  return st;
}

async function closeIfDone(c, sheetId) {
  const { rows: [n] } = await c.query("SELECT count(*) AS n FROM route_stops WHERE sheet_id = $1 AND status = 'wait'", [sheetId]);
  if (Number(n.n) === 0) await c.query("UPDATE route_sheets SET status = 'closed', closed_at = now() WHERE id = $1 AND status = 'sent'", [sheetId]);
}

// Оплаты остановки: [{method, amount}]; старое поле cash — «только наличные». Сумма оплат не больше суммы заказа, остаток — «позже».
function cleanPayments(b, total) {
  let list = Array.isArray(b?.payments) ? b.payments : [];
  if (!list.length && b?.cash !== undefined && b?.cash !== null && b?.cash !== "") list = [{ method: "cash", amount: b.cash }];
  const out = [];
  for (const p of list) {
    const amount = Math.round(Number(p?.amount) * 100) / 100;
    if (!PAY_METHODS[p?.method]) throw new HttpError(400, "Способ оплаты: наличные, Kaspi QR или Halyk QR");
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e10) throw new HttpError(400, "Сумма оплаты — число от 0");
    if (amount > 0) out.push({ method: p.method, amount });
  }
  if (out.reduce((a, p) => a + p.amount, 0) > total + 0.005) throw new HttpError(400, "Сумма оплат больше суммы заказа (" + kzt(total) + ")");
  return out;
}

export async function doneStop(user, id, b) {
  const st = await myStop(user, id);
  if (st.status === "done") return { ok: true, again: true };
  if (st.order_status !== "Собран") throw new HttpError(409, "Заказ уже не в статусе «Собран» — обратитесь к оператору");
  const pays = cleanPayments(b, Number(st.total));
  const lat = num(b?.lat), lon = num(b?.lon);
  const pt = inKz(lat, lon) ? { lat, lon } : { lat: null, lon: null }; // плохую точку прибытия просто не сохраняем — доставку не блокируем
  await tx(async (c) => {
    await c.query(
      `UPDATE route_stops SET status = 'done', fail_reason = NULL, done_at = now(), done_lat = $2, done_lon = $3 WHERE id = $1`,
      [st.id, pt.lat, pt.lon]);
    await c.query("DELETE FROM route_payments WHERE stop_id = $1", [st.id]); // повторная отметка заменяет прежние оплаты
    for (const p of pays) await c.query("INSERT INTO route_payments(stop_id, method, amount) VALUES ($1,$2,$3)", [st.id, p.method, p.amount]);
    await c.query("UPDATE orders SET status = 'Отгружен', updated_at = now() WHERE id = $1", [st.order_id]);
    await c.query("INSERT INTO order_events(order_id, user_id, event, note) VALUES ($1,$2,'Отгружен',$3)",
      [st.order_id, user.id, "Доставлено водителем" + (pays.length ? ". Получено: " + pays.map((p) => `${PAY_METHODS[p.method]} ${kzt(p.amount)}`).join(", ") : ". Оплата позже")]);
    await closeIfDone(c, st.sheet_id);
  });
  return { ok: true };
}

export async function failStop(user, id, b) {
  const st = await myStop(user, id);
  if (st.status === "done") throw new HttpError(400, "Остановка уже отмечена как доставленная");
  const reason = String(b?.reason || "");
  if (!FAIL_REASONS.includes(reason)) throw new HttpError(400, "Укажите причину: " + FAIL_REASONS.join(", "));
  const note = b?.note ? String(b.note).trim().slice(0, 200) : "";
  const text = reason + (note ? `: ${note}` : "");
  await tx(async (c) => {
    await c.query("UPDATE route_stops SET status = 'failed', fail_reason = $2, done_at = now() WHERE id = $1", [st.id, text]);
    await c.query("INSERT INTO order_events(order_id, user_id, event, note) VALUES ($1,$2,'Не доставлен',$3)", [st.order_id, user.id, text]);
    await closeIfDone(c, st.sheet_id);
  });
  return { ok: true };
}

// Вернуть «не принят» обратно в ожидание (водитель ошибся нажатием), пока лист не закрыт
export async function reopenStop(user, id) {
  const st = await myStop(user, id);
  if (st.status !== "failed") throw new HttpError(400, "Вернуть можно только остановку «не принят»");
  try { await q("UPDATE route_stops SET status = 'wait', fail_reason = NULL, done_at = NULL WHERE id = $1", [st.id]); }
  catch (e) { conflict(e); }
  return { ok: true };
}

export async function setStopGeo(user, id, b) {
  const st = await myStop(user, id);
  const p = checkPoint(b);
  await q(`INSERT INTO client_geo(client_code, lat, lon, set_by) VALUES ($1,$2,$3,$4)
           ON CONFLICT (client_code) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon, set_by = EXCLUDED.set_by, set_at = now()`, [st.client_code, p.lat, p.lon, user.id]);
  return { ok: true };
}

// --- QR для оплаты ---

export async function getQr(user) {
  if (!can(user, "fleet.send") && !can(user, "routes") && !can(user, "settings")) throw new HttpError(403, "Нет доступа");
  const { rows } = await q("SELECT method, image FROM payment_qr");
  const out = { kaspi: null, halyk: null };
  for (const r of rows) out[r.method] = r.image;
  return out;
}

export async function setQr(user, method, b) {
  if (!can(user, "settings")) throw new HttpError(403, "Нет доступа");
  if (!["kaspi", "halyk"].includes(method)) throw new HttpError(400, "QR бывает kaspi или halyk");
  const img = String(b?.image || "");
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(img)) throw new HttpError(400, "Нужна картинка PNG или JPG");
  if (img.length > 600_000) throw new HttpError(400, "Картинка слишком большая (до 400 КБ)");
  await q(`INSERT INTO payment_qr(method, image, updated_by) VALUES ($1,$2,$3)
           ON CONFLICT (method) DO UPDATE SET image = EXCLUDED.image, updated_by = EXCLUDED.updated_by, updated_at = now()`, [method, img, user.id]);
  return { ok: true };
}

// Отчёт «Оплаты» за период: кто, какой магазин, сколько и каким способом
export async function paymentsReport(user, query) {
  if (!can(user, "routes") && !can(user, "cash") && !can(user, "cash.in")) throw new HttpError(403, "Нет доступа");
  const today = todayLocal();
  const from = query?.from || today, to = query?.to || today;
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) throw new HttpError(400, "Даты в формате ГГГГ-ММ-ДД, «с» не позже «по»");
  const { rows } = await q(
    `SELECT p.id, p.method, p.amount, p.at, o.id AS order_id, o.client_code, o.client_name, o.total, u.name AS driver
     FROM route_payments p JOIN route_stops st ON st.id = p.stop_id JOIN route_sheets sh ON sh.id = st.sheet_id
     JOIN orders o ON o.id = st.order_id JOIN users u ON u.id = sh.driver_id
     WHERE (p.at AT TIME ZONE 'Asia/Qyzylorda')::date BETWEEN $1 AND $2 ORDER BY p.at DESC LIMIT 1000`, [from, to]);
  const items = rows.map((r) => ({ id: r.id, method: r.method, amount: Number(r.amount), at: r.at, orderNumber: orderNumber(r.order_id), clientCode: r.client_code, client: r.client_name, orderTotal: Number(r.total), driver: r.driver }));
  const sum = (m) => items.filter((x) => x.method === m).reduce((a, x) => a + x.amount, 0);
  const { rows: [l] } = await q(
    `SELECT coalesce(sum(o.total - coalesce((SELECT sum(amount) FROM route_payments WHERE stop_id = st.id), 0)), 0) AS later
     FROM route_stops st JOIN orders o ON o.id = st.order_id
     WHERE st.status = 'done' AND (st.done_at AT TIME ZONE 'Asia/Qyzylorda')::date BETWEEN $1 AND $2`, [from, to]);
  return { from, to, items, totals: { cash: sum("cash"), kaspi: sum("kaspi"), halyk: sum("halyk"), later: Number(l.later) } };
}
