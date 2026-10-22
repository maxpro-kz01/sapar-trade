// Создать сотрудника из консоли (Render → Shell):
//   node scripts/create-user.js <логин> <роль> "<Имя>" [менеджер_1С]
// Пароль спрашивается из переменной NEW_PASSWORD или генерируется и выводится один раз.
import crypto from "node:crypto";
import { createUser } from "../src/services/users.js";
import { ROLES } from "../src/services/rbac.js";
import { migrate } from "../src/db/migrate.js";
import { pool } from "../src/db/pool.js";

const [login, role, name, manager1c] = process.argv.slice(2);
if (!login || !ROLES.includes(role)) {
  console.error(`Использование: node scripts/create-user.js <логин> <${ROLES.join("|")}> "<Имя>" [менеджер_1С]`);
  process.exit(1);
}
const password = process.env.NEW_PASSWORD || crypto.randomBytes(9).toString("base64url") + "7";
try {
  await migrate();
  const u = await createUser({ login, role, name: name || login, password, manager1c: manager1c || null });
  console.log(`Создан: ${u.login} (${u.role})${process.env.NEW_PASSWORD ? "" : `\nПароль: ${password}`}`);
} catch (e) {
  console.error("Ошибка:", e.code === "23505" ? "такой логин уже есть" : e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
