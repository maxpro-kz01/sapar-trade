// Система управления: команда, финансы, проблемы, план продаж, задачи, сотрудники, журнал действий.
import { Router } from "express";
import { ah, period } from "../lib/http.js";
import { requireAuth, requirePerm } from "../middleware/auth.js";
import { team, getPlans, savePlans } from "../services/team.js";
import { finance } from "../services/reports.js";
import { problems } from "../services/problems.js";
import * as tasks from "../services/tasks.js";
import { audit } from "../services/audit.js";
import { q } from "../db/pool.js";

const r = Router();
r.use(requireAuth);

r.get("/team", ah(async (req, res) => res.json(await team(req.user, period(req.query)))));
r.get("/finance", ah(async (req, res) => res.json(await finance(req.user, period(req.query)))));
r.get("/problems", ah(async (req, res) => res.json(await problems(req.user))));

r.get("/plans", ah(async (req, res) => res.json(await getPlans(req.user, req.query.month))));
r.put("/plans", ah(async (req, res) => {
  const out = await savePlans(req.user, req.body?.month, req.body?.items);
  await audit(req, "plans.save", req.body?.month, { rows: out.saved });
  res.json(out);
}));

r.get("/tasks", ah(async (req, res) => res.json(await tasks.listTasks(req.user, { status: req.query.status }))));
r.post("/tasks", ah(async (req, res) => {
  const t = await tasks.createTask(req.user, req.body || {});
  await audit(req, "task.create", String(t.id));
  res.status(201).json(t);
}));
r.patch("/tasks/:id", ah(async (req, res) => {
  const out = await tasks.updateTask(req.user, req.params.id, req.body || {});
  await audit(req, "task.update", req.params.id, req.body);
  res.json(out);
}));
r.post("/tasks/:id/comments", ah(async (req, res) => res.status(201).json(await tasks.addComment(req.user, req.params.id, req.body?.text))));

r.get("/staff", ah(async (req, res) => res.json(await tasks.staffBrief())));

r.get("/audit", requirePerm("audit"), ah(async (req, res) => {
  const { rows } = await q(
    `SELECT a.id, a.at, u.name AS user_name, u.role, a.action, a.object, a.detail, a.ip
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200`);
  res.json(rows);
}));

export default r;
