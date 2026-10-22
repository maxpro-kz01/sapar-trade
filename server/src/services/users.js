// Пользователи: создание, проверка пароля, блокировка после неудачных попыток.
import bcrypt from "bcryptjs";
import { q } from "../db/pool.js";
import { ROLES } from "./rbac.js";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export function validatePassword(p) {
  if (typeof p !== "string" || p.length < 8) return "Пароль должен быть не короче 8 символов";
  if (!/[A-Za-zА-Яа-я]/.test(p) || !/\d/.test(p)) return "Пароль должен содержать буквы и цифры";
  return null;
}

export async function createUser({ login, name, role, password, manager1c = null }) {
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(login || "")) throw new Error("Логин: 3–40 символов, латиница, цифры, . _ -");
  if (!ROLES.includes(role)) throw new Error("Неизвестная роль");
  const bad = validatePassword(password);
  if (bad) throw new Error(bad);
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await q(
    "INSERT INTO users(login, name, role, password_hash, manager_1c) VALUES ($1,$2,$3,$4,$5) RETURNING id, login, name, role, manager_1c, is_active",
    [login.toLowerCase(), name || login, role, hash, manager1c]
  );
  return rows[0];
}

// → { user } | { error, status }
export async function checkLogin(login, password) {
  const { rows } = await q("SELECT * FROM users WHERE login = $1", [String(login || "").toLowerCase()]);
  const u = rows[0];
  // одинаковая задержка для «нет пользователя» и «неверный пароль»
  if (!u) { await bcrypt.compare(String(password || ""), "$2a$12$0000000000000000000000000000000000000000000000000000"); return { error: "Неверный логин или пароль", status: 401 }; }
  if (!u.is_active) return { error: "Доступ заблокирован", status: 403 };
  if (u.locked_until && new Date(u.locked_until) > new Date()) return { error: `Слишком много попыток. Попробуйте через ${LOCK_MINUTES} минут`, status: 429 };
  const ok = await bcrypt.compare(String(password || ""), u.password_hash);
  if (!ok) {
    const fails = u.failed_logins + 1;
    if (fails >= MAX_FAILS)
      await q("UPDATE users SET failed_logins = 0, locked_until = now() + make_interval(mins => $2::int) WHERE id = $1", [u.id, LOCK_MINUTES]);
    else
      await q("UPDATE users SET failed_logins = $2::int WHERE id = $1", [u.id, fails]);
    return { error: "Неверный логин или пароль", status: 401 };
  }
  await q("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1", [u.id]);
  return { user: u };
}

export async function setPassword(userId, password) {
  const bad = validatePassword(password);
  if (bad) throw new Error(bad);
  const hash = await bcrypt.hash(password, 12);
  // смена пароля завершает все остальные сессии
  await q("UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1", [userId, hash]);
}

export const publicUser = (u) => ({ id: u.id, login: u.login, name: u.name, role: u.role, manager1c: u.manager_1c, isActive: u.is_active });

export async function ensureBootstrapOwner(owner) {
  if (!owner) return;
  const { rows } = await q("SELECT count(*)::int AS n FROM users");
  if (rows[0].n > 0) return;
  await createUser({ login: owner.login, name: owner.name, role: "owner", password: owner.password });
  console.log(`создан первый владелец: ${owner.login}`);
}
