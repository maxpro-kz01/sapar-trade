// Задачи сотрудникам (ТЗ V1.0 §19): создать, назначить, сменить статус, комментировать.
// Видят: владелец и директор — все задачи; остальные — где они автор или исполнитель.
import { q, tx } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError, isIsoDate } from "../lib/http.js";

const PRIOS = ["Высокий", "Средний", "Низкий"];
const STATUSES = ["Новая", "В работе", "Выполнена", "Отменена"];

const visible = (user) => can(user, "tasks.all") ? ["true", []] : ["(t.creator_id = $1 OR t.assignee_id = $1)", [user.id]];

export async function listTasks(user, { status } = {}) {
  const [cond, p] = visible(user);
  const params = [...p];
  let where = cond.replace("$1", p.length ? "$1" : "$1");
  if (status && STATUSES.includes(status)) { params.push(status); where += ` AND t.status = $${params.length}`; }
  const { rows } = await q(
    `SELECT t.id, t.title, t.description, t.deadline, t.priority, t.status, t.created_at, t.updated_at,
            t.creator_id, cu.name AS creator, t.assignee_id, au.name AS assignee,
            coalesce((SELECT json_agg(json_build_object('id', c.id, 'user', u.name, 'text', c.text, 'at', c.at) ORDER BY c.id)
                      FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.task_id = t.id), '[]') AS comments
     FROM tasks t JOIN users cu ON cu.id = t.creator_id LEFT JOIN users au ON au.id = t.assignee_id
     WHERE ${where}
     ORDER BY (t.status IN ('Выполнена','Отменена')), t.deadline NULLS LAST, t.id DESC LIMIT 300`, params);
  return rows;
}

async function getVisible(user, id) {
  const { rows } = await q("SELECT * FROM tasks WHERE id = $1", [Number(id) || 0]);
  const t = rows[0];
  if (!t || !(can(user, "tasks.all") || t.creator_id === user.id || t.assignee_id === user.id)) throw new HttpError(404, "Задача не найдена");
  return t;
}

async function checkAssignee(id) {
  if (id === null || id === undefined || id === "") return null;
  const { rows } = await q("SELECT id FROM users WHERE id = $1 AND is_active", [Number(id) || 0]);
  if (!rows[0]) throw new HttpError(400, "Исполнитель не найден");
  return rows[0].id;
}

export async function createTask(user, b) {
  const title = String(b?.title || "").trim().slice(0, 300);
  if (!title) throw new HttpError(400, "Введите название задачи");
  if (b.deadline && !isIsoDate(b.deadline)) throw new HttpError(400, "Срок в формате ГГГГ-ММ-ДД");
  const prio = PRIOS.includes(b.priority) ? b.priority : "Средний";
  const assignee = await checkAssignee(b.assigneeId ?? user.id);
  const { rows } = await q(
    `INSERT INTO tasks(title, description, creator_id, assignee_id, deadline, priority) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [title, b.description ? String(b.description).slice(0, 3000) : null, user.id, assignee, b.deadline || null, prio]);
  return rows[0];
}

export async function updateTask(user, id, b) {
  const t = await getVisible(user, id);
  const isOwnerish = can(user, "tasks.all") || t.creator_id === user.id;
  const set = [], p = [t.id];
  const put = (col, val) => { p.push(val); set.push(`${col} = $${p.length}`); };
  if (b.status !== undefined) { if (!STATUSES.includes(b.status)) throw new HttpError(400, "Неверный статус"); put("status", b.status); }
  // менять содержание и исполнителя может автор, владелец или директор; исполнитель — только статус
  if (["title", "description", "deadline", "priority", "assigneeId"].some((k) => b[k] !== undefined)) {
    if (!isOwnerish) throw new HttpError(403, "Изменить задачу может только автор");
    if (b.title !== undefined) { const v = String(b.title).trim().slice(0, 300); if (!v) throw new HttpError(400, "Пустое название"); put("title", v); }
    if (b.description !== undefined) put("description", b.description ? String(b.description).slice(0, 3000) : null);
    if (b.deadline !== undefined) { if (b.deadline && !isIsoDate(b.deadline)) throw new HttpError(400, "Срок в формате ГГГГ-ММ-ДД"); put("deadline", b.deadline || null); }
    if (b.priority !== undefined) { if (!PRIOS.includes(b.priority)) throw new HttpError(400, "Неверный приоритет"); put("priority", b.priority); }
    if (b.assigneeId !== undefined) put("assignee_id", await checkAssignee(b.assigneeId));
  }
  if (!set.length) return { ok: true };
  await q(`UPDATE tasks SET ${set.join(", ")}, updated_at = now() WHERE id = $1`, p);
  return { ok: true };
}

export async function addComment(user, id, text) {
  const t = await getVisible(user, id);
  const v = String(text || "").trim().slice(0, 2000);
  if (!v) throw new HttpError(400, "Пустой комментарий");
  await tx(async (c) => {
    await c.query("INSERT INTO task_comments(task_id, user_id, text) VALUES ($1,$2,$3)", [t.id, user.id, v]);
    await c.query("UPDATE tasks SET updated_at = now() WHERE id = $1", [t.id]);
  });
  return { ok: true };
}

// Сотрудники для выбора исполнителя (без логинов и служебных полей)
export async function staffBrief() {
  const { rows } = await q("SELECT id, name, role FROM users WHERE is_active ORDER BY name");
  return rows;
}
