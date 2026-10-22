// Сборка Express-приложения (без запуска — так его удобно тестировать).
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import syncRoutes from "./routes/sync.js";
import reportRoutes from "./routes/reports.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // Render стоит за прокси — нужен настоящий IP клиента
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" });
    next();
  });
  app.use("/api", cors({ origin: config.corsOrigins, allowedHeaders: ["Content-Type", "Authorization"], maxAge: 600 }));
  // агенту 1С нужны большие пакеты, остальным — маленькие
  app.use("/api/sync/1c", express.json({ limit: "25mb" }));
  app.use(express.json({ limit: "200kb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/sync", syncRoutes);
  app.use("/api", reportRoutes);

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
