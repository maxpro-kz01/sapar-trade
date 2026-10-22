// Точка входа: миграции → первый владелец → запуск HTTP.
import { config } from "./config.js";
import { migrate } from "./db/migrate.js";
import { ensureBootstrapOwner } from "./services/users.js";
import { createApp } from "./app.js";
import { pool } from "./db/pool.js";

await migrate();
await ensureBootstrapOwner(config.bootstrapOwner);

const server = createApp().listen(config.port, () => console.log(`sapar-trade-api слушает порт ${config.port}`));

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => server.close(() => pool.end().then(() => process.exit(0))));
}
