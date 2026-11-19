// Настройки компании (хранятся на сервере): телефон директора для отчёта смены и т.п.
import { q } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError } from "../lib/http.js";

// onecOrders — агент создаёт в 1С «Реализацию» (непроведённую) по заказам из приложения (ТЗ финансов v1.2, часть D)
// debtsSource — откуда брать долги клиентов: 'buh' — 1С:Бухгалтерия, счёт 1274 (ТЗ TZ_DEBTS_BUH), 'utp' — УТП
export const DEFAULTS = { directorPhone: "+7 700 105 17 17", onecOrders: false, debtsSource: "buh", shopMaxOrder: 3000000, shopConfirmCode: false, shopPriceType: "Рынок" };

export async function getSettings() {
  const { rows } = await q("SELECT key, value FROM settings");
  const out = { ...DEFAULTS };
  for (const r of rows) if (Object.hasOwn(DEFAULTS, r.key)) out[r.key] = r.value;
  return out;
}

export async function saveSettings(user, b) {
  if (!can(user, "settings")) throw new HttpError(403, "Нет доступа");
  const saved = {};
  if (b?.directorPhone !== undefined) {
    const d = String(b.directorPhone).replace(/\D/g, "");
    if (!/^7\d{10}$/.test(d)) throw new HttpError(400, "Телефон в формате +7 7XX XXX XX XX");
    saved.directorPhone = `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
  }
  if (b?.onecOrders !== undefined) {
    if (typeof b.onecOrders !== "boolean") throw new HttpError(400, "onecOrders: да или нет");
    saved.onecOrders = b.onecOrders;
  }
  if (b?.debtsSource !== undefined) {
    if (b.debtsSource !== "buh" && b.debtsSource !== "utp") throw new HttpError(400, "debtsSource: buh или utp");
    saved.debtsSource = b.debtsSource;
  }
  if (b?.shopMaxOrder !== undefined) {
    const n = Number(b.shopMaxOrder);
    if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new HttpError(400, "shopMaxOrder: число от 0 (0 — без ограничения)");
    saved.shopMaxOrder = Math.round(n);
  }
  if (b?.shopPriceType !== undefined) {
    const t = String(b.shopPriceType).trim().slice(0, 80);
    if (t) {
      const { rowCount } = await q("SELECT 1 FROM onec_prices WHERE price_type = $1 AND price > 0 LIMIT 1", [t]);
      if (!rowCount) throw new HttpError(400, `Тип цен «${t}» не найден в 1С`);
    }
    saved.shopPriceType = t;
  }
  if (b?.shopConfirmCode !== undefined) {
    if (typeof b.shopConfirmCode !== "boolean") throw new HttpError(400, "shopConfirmCode: да или нет");
    saved.shopConfirmCode = b.shopConfirmCode;
  }
  for (const [k, v] of Object.entries(saved))
    await q(`INSERT INTO settings(key, value, updated_by) VALUES ($1,$2,$3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`, [k, JSON.stringify(v), user.id]);
  return getSettings();
}
