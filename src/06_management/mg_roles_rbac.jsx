// Sapar Trade — прототип. Модуль: Роли и доступы (RBAC) — какие вкладки и финданные видит каждая роль
// Строки 3143–3167 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ---------- roles & access (RBAC) ---------- */
const MG_ROLES = {
  owner: { label: "Владелец (Owner)", sub: "Полная финансовая картина компании", icon: "shield-check", fin: "full", twofa: true, person: "Сапар — владелец",
    tabs: ["home", "sales", "team", "fleet", "clients", "stock", "finance", "problems", "tasks", "ai", "system"] },
  director: { label: "Директор по продажам", sub: "Продажи, план/факт, маржа %, дебиторка, команда", icon: "trending-up", fin: "margin", twofa: true, person: "Директор по продажам",
    tabs: ["home", "sales", "team", "fleet", "clients", "stock", "problems", "tasks", "ai"] },
  supervisor: { label: "Супервайзер", sub: "KPI своей команды без прибыли и маржи", icon: "users", fin: "none", scope: { sv: "sv1" }, person: "Ерлан Мукашев",
    tabs: ["home", "clients", "problems", "tasks", "ai"] },
  tp: { label: "Торговый представитель", sub: "Свой план, маршрут, клиенты и рейтинг", icon: "map-pin", fin: "none", scope: { tp: "tp1" }, person: "Азамат Турсунов",
    tabs: ["home", "clients", "problems", "tasks", "ai"] },
  driver: { label: "Водитель-экспедитор", sub: "Маршрут, доставка, собранные деньги", icon: "package", fin: "none", person: "Серик Алимов",
    tabs: ["home", "problems", "tasks"] },
  warehouse: { label: "Склад / завсклад", sub: "Остатки, движение, прогноз, dead stock", icon: "store", fin: "none", person: "Дамир — завсклад",
    tabs: ["home", "problems", "tasks"] },
  accountant: { label: "Бухгалтер", sub: "Касса, банк, дебиторка/кредиторка, 1С", icon: "wallet", fin: "cash", person: "Айдос — бухгалтер",
    tabs: ["home", "clients", "problems", "tasks", "system"] },
  financier: { label: "Финансист", sub: "Движение денег, дебиторка, расходы", icon: "bar-chart", fin: "cash", person: "Финансист",
    tabs: ["home", "clients", "problems", "tasks"] },
};
const MG_TABS = {
  home: ["home", "Главная"], sales: ["trending-up", "Продажи"], team: ["users", "Команда"], fleet: ["map-pin", "Экспедиторы"], clients: ["store", "Клиенты"],
  stock: ["package", "Склад"], finance: ["wallet", "Финансы"], problems: ["bell", "Проблемы"], tasks: ["clipboard", "Задачи"],
  ai: ["message-circle", "AI"], system: ["settings", "Система"],
};

