// Локальный запуск для разработки без своей базы: временный PostgreSQL + сервер на порту 3999.
//   npm run dev:local     (под root не работает — PostgreSQL требует обычного пользователя)
// Владелец: owner / Owner12345, ключ агента: test-agent-key-0123456789
import { startEnv } from "../test/helpers.js";

const env = await startEnv({ port: Number(process.env.PORT || 3999) });
console.log(`Сервер: ${env.base}  (Ctrl+C — остановить)`);
const stop = () => env.stop().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
