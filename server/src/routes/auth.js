// Вход сотрудников, «кто я», смена пароля, выход на всех устройствах.
import { Router } from "express";
import { ah } from "../lib/http.js";
import { checkLogin, setPassword, publicUser } from "../services/users.js";
import { signToken, requireAuth, rateLimit } from "../middleware/auth.js";
import { ROLE_PERMS } from "../services/rbac.js";
import { audit } from "../services/audit.js";
import { q } from "../db/pool.js";
import bcrypt from "bcryptjs";

const r = Router();

r.post("/login", rateLimit({ windowMs: 60_000, max: 20 }), ah(async (req, res) => {
  const { login, password } = req.body || {};
  const out = await checkLogin(login, password);
  if (out.error) {
    await audit(req, "login.fail", String(login || "").slice(0, 60));
    return res.status(out.status).json({ error: out.error });
  }
  req.user = out.user;
  await audit(req, "login.ok");
  res.json({ token: signToken(out.user), user: publicUser(out.user), perms: ROLE_PERMS[out.user.role] });
}));

r.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), perms: ROLE_PERMS[req.user.role] });
});

r.post("/password", requireAuth, ah(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!(await bcrypt.compare(String(oldPassword || ""), req.user.password_hash)))
    return res.status(400).json({ error: "Старый пароль неверный" });
  try { await setPassword(req.user.id, newPassword); } catch (e) { return res.status(400).json({ error: e.message }); }
  await audit(req, "password.change");
  const { rows } = await q("SELECT * FROM users WHERE id = $1", [req.user.id]);
  res.json({ token: signToken(rows[0]) }); // новый токен для текущего устройства
}));

r.post("/logout-all", requireAuth, ah(async (req, res) => {
  await q("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [req.user.id]);
  await audit(req, "logout.all");
  res.json({ ok: true });
}));

export default r;
