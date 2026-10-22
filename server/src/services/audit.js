// Журнал действий (ТЗ §26): кто, когда, что смотрел/менял.
import { q } from "../db/pool.js";

export async function audit(req, action, object, detail) {
  try {
    await q("INSERT INTO audit_log(user_id, action, object, detail, ip) VALUES ($1,$2,$3,$4,$5)", [
      req.user?.id || null, action, object || null, detail ? JSON.stringify(detail) : null, req.ip || null,
    ]);
  } catch (e) {
    console.error("audit:", e.message); // журнал не должен ронять запрос
  }
}
