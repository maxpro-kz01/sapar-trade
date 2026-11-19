// Sapar Trade — система управления. Модуль: вкладки и названия ролей
// Какие вкладки видит сотрудник, решается по правам, которые присылает сервер при входе (сервер их и проверяет).

const MG_TABS = {
  home: ["home", "Главная"], sales: ["trending-up", "Продажи"], team: ["users", "Команда"], fleet: ["map-pin", "Экспедиторы"],
  clients: ["store", "Клиенты"], stock: ["package", "Склад"], finance: ["wallet", "Финансы"], problems: ["bell", "Проблемы"],
  tasks: ["clipboard", "Задачи"], shops: ["building", "Магазины"], routes: ["map-pin", "Маршруты"], ai: ["message-circle", "AI"], system: ["settings", "Система"],
};

function mgTabsFor(session) {
  const can = (...p) => liveCan(session, ...p);
  const role = session.user.role;
  return [
    "home",
    can("sales", "sales.own") && "sales",
    can("team", "team.own") && "team",
    can("fleet.view") && "fleet",
    can("debts", "debts.own", "sales", "sales.own") && "clients",
    can("stock") && "stock",
    can("gross", "cash", "cash.in") && "finance",
    can("shops") && "shops",
    can("routes", "cash", "cash.in") && "routes",
    "problems", "tasks", "ai",
    can("sync", "users", "audit") && "system",
  ].filter(Boolean);
}

// Вкладки, где нужен выбор периода
const MG_PERIOD_TABS = ["home", "sales", "team", "clients", "finance"];
