// Приём данных от агента 1С.
// Справочники и остатки — «снимок»: таблица целиком заменяется присланными строками.
// Продажи и себестоимость — по периоду: строки за [from..to] удаляются и вставляются заново
// (так ловим перепроведённые и удалённые документы; агент шлёт период с запасом 3 дня).
import { tx, q } from "../db/pool.js";
import { isIsoDate, HttpError } from "../lib/http.js";

const str = (v, max = 300) => (v === null || v === undefined ? null : String(v).trim().slice(0, max));
const num = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`не число: ${v}`);
  return n;
};
const date = (v) => {
  const s = str(v, 30);
  const d = s && s.slice(0, 10); // '2026-10-22T00:00:00' → '2026-10-22'
  if (!isIsoDate(d)) throw new Error(`не дата: ${v}`);
  return d;
};
const key = (v) => { const s = str(v, 100); if (!s) throw new Error("пустой код"); return s; };

// Описание сущностей: таблица, колонки, преобразование строки агента → значения колонок.
// В запросах 1С слова GROUP/DAY заняты, поэтому принимаем и groupName/dt.
// pk — сколько первых колонок образуют ключ; sum — при повторе ключа складывать числа.
export const ENTITIES = {
  products: { table: "onec_products", mode: "snapshot", pk: 1, cols: ["code", "name", "group_name", "unit", "sku"],
    map: (r) => [key(r.code), str(r.name) || "(без названия)", str(r.group ?? r.groupName), str(r.unit, 50), str(r.sku, 100)] },
  warehouses: { table: "onec_warehouses", mode: "snapshot", pk: 1, cols: ["code", "name"],
    map: (r) => [key(r.code), str(r.name) || "(без названия)"] },
  clients: { table: "onec_clients", mode: "snapshot", pk: 1, cols: ["code", "name", "manager", "phone", "address"],
    map: (r) => [key(r.code), str(r.name) || "(без названия)", str(r.manager, 150), str(r.phone, 100), str(r.address, 500)] },
  prices: { table: "onec_prices", mode: "snapshot", pk: 2, cols: ["product_code", "price_type", "price"],
    map: (r) => [key(r.product), str(r.priceType, 150) || "", num(r.price)] },
  stock: { table: "onec_stock", mode: "snapshot", pk: 2, sum: true, cols: ["warehouse_code", "product_code", "qty"],
    map: (r) => [key(r.warehouse), key(r.product), num(r.qty)] },
  debts: { table: "onec_debts", mode: "snapshot", pk: 0, cols: ["client_code", "doc_date", "doc_name", "amount"],
    map: (r) => [key(r.client), r.docDate ? date(r.docDate) : null, str(r.docName, 300), num(r.amount)] },
  sales: { table: "onec_sales_daily", mode: "range", pk: 3, sum: true, cols: ["day", "product_code", "client_code", "qty", "revenue"],
    map: (r) => [date(r.day ?? r.dt), key(r.product), str(r.client, 100) || "", num(r.qty), num(r.revenue)] },
  cost: { table: "onec_cost_daily", mode: "range", pk: 2, sum: true, cols: ["day", "product_code", "qty", "cost"],
    map: (r) => [date(r.day ?? r.dt), key(r.product), num(r.qty), num(r.cost)] },
};

const MAX_ROWS = 200_000;
const BATCH = 1000;

function mergeDuplicates(spec, values) {
  if (!spec.pk) return values;
  const m = new Map();
  for (const v of values) {
    const k = v.slice(0, spec.pk).join("\u0001");
    const prev = m.get(k);
    if (prev && spec.sum) for (let i = spec.pk; i < v.length; i++) prev[i] += v[i];
    else m.set(k, [...v]);
  }
  return [...m.values()];
}

export function parseRows(entity, body) {
  const spec = Object.hasOwn(ENTITIES, entity) ? ENTITIES[entity] : null;
  if (!spec) throw new HttpError(404, `Неизвестный тип данных: ${entity}`);
  const rows = body?.rows;
  if (!Array.isArray(rows)) throw new HttpError(400, "Нужен массив rows");
  if (rows.length > MAX_ROWS) throw new HttpError(413, `Слишком много строк (> ${MAX_ROWS}), разбейте по периодам`);
  let range = null;
  if (spec.mode === "range") {
    const { from, to } = body;
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) throw new HttpError(400, "Для продаж/себестоимости нужны from и to (ГГГГ-ММ-ДД)");
    range = { from, to };
  }
  const errors = [];
  const values = [];
  rows.forEach((r, i) => {
    try {
      const v = spec.map(r || {});
      if (range && (v[0] < range.from || v[0] > range.to)) throw new Error(`дата ${v[0]} вне периода`);
      values.push(v);
    } catch (e) { if (errors.length < 20) errors.push(`строка ${i + 1}: ${e.message}`); }
  });
  if (errors.length) throw new HttpError(400, "Ошибки в данных", { errors });
  return { spec, range, values: mergeDuplicates(spec, values) };
}

async function insertBatches(client, spec, values) {
  const n = spec.cols.length;
  for (let i = 0; i < values.length; i += BATCH) {
    const chunk = values.slice(i, i + BATCH);
    const ph = chunk.map((_, j) => "(" + spec.cols.map((__, c) => `$${j * n + c + 1}`).join(",") + ")").join(",");
    await client.query(`INSERT INTO ${spec.table} (${spec.cols.join(",")}) VALUES ${ph}`, chunk.flat());
  }
}

export async function ingest(entity, body, agentHost) {
  const { rows: [run] } = await q("INSERT INTO sync_runs(entity, agent_host) VALUES ($1,$2) RETURNING id",
    [String(entity).slice(0, 40), str(agentHost, 100)]);
  try {
    const { spec, range, values } = parseRows(entity, body);
    // защита: пустой справочник — скорее ошибка запроса в 1С, а не пустая база
    if (spec.mode === "snapshot" && values.length === 0 && !body.allowEmpty && !["debts", "stock"].includes(entity))
      throw new HttpError(400, "Пустой снимок справочника — не применяю (allowEmpty: true, если это правда)");
    await tx(async (c) => {
      if (spec.mode === "snapshot") await c.query(`TRUNCATE ${spec.table}`);
      else await c.query(`DELETE FROM ${spec.table} WHERE day BETWEEN $1 AND $2`, [range.from, range.to]);
      await insertBatches(c, spec, values);
    });
    await q("UPDATE sync_runs SET finished_at = now(), ok = true, rows_in = $2 WHERE id = $1", [run.id, values.length]);
    return { ok: true, entity, rows: values.length, range };
  } catch (e) {
    const msg = (e.message + (e.extra?.errors ? ": " + e.extra.errors.slice(0, 3).join("; ") : "")).slice(0, 1000);
    await q("UPDATE sync_runs SET finished_at = now(), ok = false, error = $2 WHERE id = $1", [run.id, msg]);
    throw e;
  }
}

// Состояние по каждому типу данных: последняя успешная загрузка, последняя ошибка, «устарело»
export async function syncStatus(staleMinutes) {
  const { rows } = await q(`
    SELECT e.entity,
      (SELECT max(finished_at) FROM sync_runs s WHERE s.entity = e.entity AND s.ok) AS last_ok,
      (SELECT row_to_json(x) FROM (SELECT finished_at AS at, error FROM sync_runs s
         WHERE s.entity = e.entity AND s.ok = false ORDER BY id DESC LIMIT 1) x) AS last_error,
      (SELECT rows_in FROM sync_runs s WHERE s.entity = e.entity AND s.ok ORDER BY id DESC LIMIT 1) AS rows
    FROM unnest($1::text[]) AS e(entity)`, [Object.keys(ENTITIES)]);
  const now = Date.now();
  const items = rows.map((r) => ({
    entity: r.entity, lastOk: r.last_ok, rows: r.rows, lastError: r.last_error,
    stale: !r.last_ok || now - new Date(r.last_ok).getTime() > staleMinutes * 60_000,
  }));
  const oks = items.filter((i) => i.lastOk).map((i) => new Date(i.lastOk).getTime());
  return { items, lastSync: oks.length ? new Date(Math.min(...oks)).toISOString() : null, stale: items.some((i) => i.stale) };
}
