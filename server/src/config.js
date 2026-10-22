// Настройки сервера из переменных окружения.
// На Render задаются в Settings → Environment. Секреты в репозиторий не кладём.

const env = process.env;

function required(name, minLen = 1) {
  const v = env[name];
  if (!v) throw new Error(`Не задана переменная окружения ${name}`);
  if (v.length < minLen) throw new Error(`${name} слишком короткий (нужно не меньше ${minLen} символов)`);
  return v;
}

export const config = {
  port: Number(env.PORT || 3000),
  databaseUrl: required("DATABASE_URL"),
  databaseSsl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  jwtSecret: required("JWT_SECRET", 32),
  jwtTtl: env.JWT_TTL || "12h",
  agentKey: required("AGENT_KEY", 24),
  // Откуда разрешены запросы браузера (сайт). Несколько адресов — через запятую.
  corsOrigins: (env.CORS_ORIGINS || "https://sapar-trade.onrender.com").split(",").map((s) => s.trim()).filter(Boolean),
  // Первый владелец создаётся при старте, если пользователей ещё нет.
  bootstrapOwner: env.BOOTSTRAP_OWNER_LOGIN && env.BOOTSTRAP_OWNER_PASSWORD
    ? { login: env.BOOTSTRAP_OWNER_LOGIN, password: env.BOOTSTRAP_OWNER_PASSWORD, name: env.BOOTSTRAP_OWNER_NAME || "Владелец" }
    : null,
  // Бизнес-настройки
  priceType: env.PRICE_TYPE || "",                  // тип цен 1С для «цены продажи»; пусто — самый частый тип
  overdueDays: Number(env.DEBT_OVERDUE_DAYS || 14), // долг старше N дней считается просроченным
  staleMinutes: Number(env.STALE_MINUTES || 15),    // данные старше N минут — «устарели»
};
