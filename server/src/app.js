// Сборка Express-приложения (без запуска — так его удобно тестировать).
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import syncRoutes from "./routes/sync.js";
import reportRoutes from "./routes/reports.js";
import mgmtRoutes from "./routes/mgmt.js";
import orderRoutes from "./routes/orders.js";
import shopRoutes from "./routes/shop.js";
import shopsAdminRoutes from "./routes/shops_admin.js";
import routesRoutes from "./routes/routes.js";
import promosRoutes from "./routes/promos.js";
import fleetRoutes, { traccarRoutes } from "./routes/fleet.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // Render стоит за прокси — нужен настоящий IP клиента
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" });
    next();
  });
  app.use("/api", cors({ origin: config.corsOrigins, allowedHeaders: ["Content-Type", "Authorization"], methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], maxAge: 600 }));
  // агенту 1С нужны большие пакеты, остальным — маленькие
  app.use("/api/sync/1c", express.json({ limit: "25mb" }));
  app.use("/api/fleet/traccar", express.urlencoded({ extended: false, limit: "20kb" })); // Traccar Client может слать форму
  app.use("/api/payment-qr", express.json({ limit: "900kb" })); // картинки QR (до ~400 КБ) больше обычного лимита
  app.use(express.json({ limit: "200kb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use("/api/fleet/traccar", traccarRoutes); // без входа по паролю — до общих /api
  app.use("/api/shop", shopRoutes); // вход магазинов — свой токен, до общих /api
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/sync", syncRoutes);
  app.use("/api", shopsAdminRoutes);
  app.use("/api", reportRoutes);
  app.use("/api", mgmtRoutes);
  app.use("/api", routesRoutes);
  app.use("/api", promosRoutes);
  app.use("/api", orderRoutes);
  app.use("/api/fleet", fleetRoutes);

  app.use("/api", (req, res) => res.status(404).json({ error: "Не найдено" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Слишком большой запрос" });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Неверный JSON" });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  });
  return app;
}
