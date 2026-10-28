// Настройки компании (хранятся на сервере): телефон директора для отчёта смены и т.п.
import { q } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError } from "../lib/http.js";

export const DEFAULTS = { directorPhone: "+7 700 105 17 17" };

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
  for (const [k, v] of Object.entries(saved))
    await q(`INSERT INTO settings(key, value, updated_by) VALUES ($1,$2,$3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`, [k, JSON.stringify(v), user.id]);
  return getSettings();
}
