// Долгие входы по устройствам: токен входа (refresh) → короткий токен доступа.
// Токен входа не меняется при обновлении, а только продлевается (скользящие 90 дней): так два вкладки
// или обрыв связи на телефоне при обновлении не выбросят человека из программы. Украденный токен
// отзывается в «Мои устройства» или кнопкой владельца «Выйти на всех устройствах».
import crypto from "node:crypto";
import { q } from "../db/pool.js";
import { config } from "../config.js";

const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

// «Android · Chrome», «iPhone · Safari», «Windows · Edge» — по User-Agent, чтобы человек узнал своё устройство
export function deviceLabel(ua) {
  const s = String(ua || "");
  const os = /iPhone|iPad|iPod/.test(s) ? "iPhone" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows" : /Mac OS X|Macintosh/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "Устройство";
  const br = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /YaBrowser/.test(s) ? "Яндекс" : /Firefox\//.test(s) ? "Firefox" : /Chrome\/|CriOS/.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "браузер";
  return `${os} · ${br}`;
}

export async function createSession(user, ua) {
  const refreshToken = crypto.randomBytes(32).toString("base64url");
  const { rows: [s] } = await q(
    `INSERT INTO sessions(user_id, token_hash, device, token_version, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5::int)) RETURNING id`,
    [user.id, sha(refreshToken), deviceLabel(ua), user.token_version, config.sessionDays]);
  return { sid: Number(s.id), refreshToken };
}

// Обновить доступ по токену входа. → { user, sid } или null (нет такого, истёк, пользователь закрыт, пароль/роль менялись)
export async function useRefreshToken(refreshToken) {
  if (typeof refreshToken !== "string" || refreshToken.length < 20 || refreshToken.length > 200) return null;
  const { rows } = await q(
    `UPDATE sessions s SET last_used_at = now(), expires_at = now() + make_interval(days => $2::int)
     FROM users u
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.id = s.user_id AND u.is_active AND u.token_version = s.token_version
     RETURNING s.id AS sid, u.*`, [sha(refreshToken), config.sessionDays]);
  if (!rows[0]) return null;
  const { sid, ...user } = rows[0];
  return { user, sid: Number(sid) };
}

export async function sessionAlive(sid, userId) {
  const { rowCount } = await q("SELECT 1 FROM sessions WHERE id = $1 AND user_id = $2 AND expires_at > now()", [sid, userId]);
  return rowCount > 0;
}

export const revokeByToken = (refreshToken) => q("DELETE FROM sessions WHERE token_hash = $1", [sha(String(refreshToken || ""))]);
export const revokeById = (userId, id) => q("DELETE FROM sessions WHERE user_id = $1 AND id = $2", [userId, id]);
export const revokeAll = (userId, exceptSid = 0) => q("DELETE FROM sessions WHERE user_id = $1 AND id <> $2", [userId, exceptSid]);

export async function listSessions(userId, currentSid) {
  const { rows } = await q("SELECT id, device, created_at, last_used_at FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY last_used_at DESC", [userId]);
  return rows.map((r) => ({ id: Number(r.id), device: r.device, createdAt: r.created_at, lastUsedAt: r.last_used_at, current: Number(r.id) === currentSid }));
}

// Раз в сутки убираем истёкшие
export const purgeExpired = () => q("DELETE FROM sessions WHERE expires_at < now()");
