// Управление сотрудниками (владелец; админ — без ролей владельца/директора).
import { Router } from "express";
import { ah } from "../lib/http.js";
import { requireAuth, requirePerm } from "../middleware/auth.js";
import { createUser, setPassword, publicUser } from "../services/users.js";
import { audit } from "../services/audit.js";
import { q } from "../db/pool.js";

const r = Router();
r.use(requireAuth, requirePerm("users"));

const TOP = ["owner", "director"];
const allowed = (actor, role) => actor.role === "owner" || !TOP.includes(role);

r.get("/", ah(async (req, res) => {
  const { rows } = await q("SELECT * FROM users ORDER BY role, name");
  res.json(rows.filter((u) => allowed(req.user, u.role)).map((u) => ({ ...publicUser(u), lastLoginAt: u.last_login_at })));
}));

r.post("/", ah(async (req, res) => {
  const b = req.body || {};
  if (!allowed(req.user, b.role)) return res.status(403).json({ error: "Нет доступа к этой роли" });
  try {
    const u = await createUser({ login: b.login, name: b.name, role: b.role, password: b.password, manager1c: b.manager1c || null });
    await audit(req, "user.create", u.login, { role: u.role });
    res.status(201).json(publicUser(u));
  } catch (e) {
    res.status(e.code === "23505" ? 409 : 400).json({ error: e.code === "23505" ? "Такой логин уже есть" : e.message });
  }
}));

r.patch("/:id", ah(async (req, res) => {
  const { rows } = await q("SELECT * FROM users WHERE id = $1", [req.params.id]);
  const u = rows[0];
  if (!u || !allowed(req.user, u.role)) return res.status(404).json({ error: "Не найден" });
  const b = req.body || {};
  if (b.role !== undefined && !allowed(req.user, b.role)) return res.status(403).json({ error: "Нет доступа к этой роли" });
  if (u.id === req.user.id && (b.isActive === false || (b.role && b.role !== u.role)))
    return res.status(400).json({ error: "Нельзя заблокировать себя или сменить себе роль" });
  if (b.password) { try { await setPassword(u.id, b.password); } catch (e) { return res.status(400).json({ error: e.message }); } }
  const { rows: upd } = await q(
    `UPDATE users SET name = COALESCE($2, name), role = COALESCE($3, role), manager_1c = CASE WHEN $4::boolean THEN $5 ELSE manager_1c END,
       is_active = COALESCE($6, is_active), token_version = token_version + CASE WHEN $6 = false OR $3 IS NOT NULL THEN 1 ELSE 0 END
     WHERE id = $1 RETURNING *`,
    [u.id, b.name ?? null, b.role ?? null, b.manager1c !== undefined, b.manager1c || null, b.isActive ?? null]
  );
  await audit(req, "user.update", u.login, { ...b, password: b.password ? "***" : undefined });
  res.json(publicUser(upd[0]));
}));

export default r;
