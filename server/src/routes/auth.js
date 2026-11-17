// Вход сотрудников (долгий, по устройствам), обновление доступа, «кто я», смена пароля, выход, список устройств.
import { Router } from "express";
import { ah } from "../lib/http.js";
import { checkLogin, setPassword, publicUser } from "../services/users.js";
import { signToken, requireAuth, rateLimit } from "../middleware/auth.js";
import { ROLE_PERMS } from "../services/rbac.js";
import { audit } from "../services/audit.js";
import { createSession, useRefreshToken, revokeByToken, revokeById, revokeAll, listSessions } from "../services/sessions.js";
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
  const { sid, refreshToken } = await createSession(out.user, req.get("user-agent"));
  res.json({ token: signToken(out.user, sid), refreshToken, user: publicUser(out.user), perms: ROLE_PERMS[out.user.role] });
}));

// Новый короткий токен доступа по токену входа. Токен входа продлевается ещё на 90 дней.
r.post("/refresh", rateLimit({ windowMs: 60_000, max: 120 }), ah(async (req, res) => {
  const out = await useRefreshToken(req.body?.refreshToken);
  if (!out) return res.status(401).json({ error: "Сессия завершена, войдите снова" });
  res.json({ token: signToken(out.user, out.sid), user: publicUser(out.user), perms: ROLE_PERMS[out.user.role] });
}));

// Выход на этом устройстве: по токену входа (доступ мог уже истечь) или по текущему доступу
r.post("/logout", ah(async (req, res) => {
  if (req.body?.refreshToken) await revokeByToken(req.body.refreshToken);
  res.json({ ok: true });
}));

r.get("/sessions", requireAuth, ah(async (req, res) => res.json(await listSessions(req.user.id, req.sid))));
r.delete("/sessions/:id", requireAuth, ah(async (req, res) => {
  await revokeById(req.user.id, Number(req.params.id) || 0);
  await audit(req, "session.revoke", req.params.id);
  res.json({ ok: true });
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
  // setPassword поднял token_version — все входы недействительны; текущему устройству даём новый
  await revokeAll(req.user.id);
  const { rows } = await q("SELECT * FROM users WHERE id = $1", [req.user.id]);
  const { sid, refreshToken } = await createSession(rows[0], req.get("user-agent"));
  res.json({ token: signToken(rows[0], sid), refreshToken });
}));

r.post("/logout-all", requireAuth, ah(async (req, res) => {
  await q("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [req.user.id]);
  await revokeAll(req.user.id);
  await audit(req, "logout.all");
  res.json({ ok: true });
}));

export default r;
