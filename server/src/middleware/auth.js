// Проверка входа сотрудника (JWT) и ключа агента 1С.
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { config } from "../config.js";
import { q } from "../db/pool.js";
import { can } from "../services/rbac.js";

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, tv: user.token_version }, config.jwtSecret, { expiresIn: config.jwtTtl });
}

export async function requireAuth(req, res, next) {
  const m = /^Bearer (.+)$/.exec(req.get("authorization") || "");
  if (!m) return res.status(401).json({ error: "Нужен вход" });
  let payload;
  try { payload = jwt.verify(m[1], config.jwtSecret); } catch { return res.status(401).json({ error: "Сессия истекла, войдите снова" }); }
  const { rows } = await q("SELECT * FROM users WHERE id = $1", [payload.sub]);
  const u = rows[0];
  if (!u || !u.is_active || u.token_version !== payload.tv) return res.status(401).json({ error: "Сессия завершена, войдите снова" });
  req.user = u;
  next();
}

export const requirePerm = (...perms) => (req, res, next) =>
  perms.some((p) => can(req.user, p)) ? next() : res.status(403).json({ error: "Нет доступа" });

export function requireAgent(req, res, next) {
  const key = req.get("x-agent-key") || "";
  const a = Buffer.from(key), b = Buffer.from(config.agentKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Неверный ключ агента" });
  next();
}

// Простое ограничение частоты (в памяти процесса): не более max запросов за windowMs с одного IP
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now(), key = req.ip;
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: "Слишком много запросов, подождите" });
    arr.push(now); hits.set(key, arr);
    next();
  };
}
