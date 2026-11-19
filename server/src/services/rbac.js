// Права по ролям (ТЗ V1.0 §4). Источник правды — сервер: фронт только скрывает.
//  sales      — выручка/продажи по всей компании
//  sales.own  — продажи только своих клиентов (ТП, супервайзер: по менеджеру 1С)
//  gross      — себестоимость и валовая прибыль в тенге (только владелец)
//  margin     — маржа в % (владелец, директор)
//  stock      — остатки и сумма склада по цене продажи
//  debts / debts.own — дебиторка всех / своих клиентов
//  sync       — статус и журнал интеграции; users — управление пользователями; audit — журнал действий

//  team / team.own — рейтинг ТП всех / своей команды; plans.edit — ввод плана продаж
//  promos.edit — акции с подарком: создавать и менять (владелец, директор); действующие акции видят все, кто заказывает
//  routes — маршрутные листы водителей: составить и передать водителю (владелец, директор, оператор, склад); водитель видит свой лист по fleet.send
//  Задачи: tasks.create — ставить задачи любому сотруднику (владелец, директор, администратор); tasks.all — видеть все (те же роли).
//  Остальные роли получают задачи, меняют статус и пишут комментарии, но сами задачи не создают.
//  orders.create — создавать заказы (ТП/супервайзер — только своим клиентам); orders.all / orders.own — видеть заказы;
//  orders.manage — менять статус (принят/собран/отгружен); shift — смены администратора; settings — настройки
//  fleet.send — водитель передаёт своё место в рейсе; fleet.view — карта экспедиторов и маршруты
//  shops — «Новые магазины»: привязка к клиенту 1С, блокировка; credit — кредитный лимит «в долг» (владелец, директор)
//  cash — остатки касс/счетов и движение денег по статьям; cash.in — только «поступило от покупателей» (директор)
export const ROLE_PERMS = {
  owner:      ["sales", "gross", "margin", "stock", "debts", "sync", "users", "audit", "team", "plans.edit", "tasks.all", "tasks.create",
               "orders.create", "orders.all", "orders.manage", "settings", "fleet.view", "cash", "shops", "credit", "routes", "promos.edit"],
  // директор — те же права, что у владельца (решение 19.11.2026). Управлять владельцем и другими директорами не может (users.js: TOP)
  director:   ["sales", "gross", "margin", "stock", "debts", "sync", "users", "audit", "team", "plans.edit", "tasks.all", "tasks.create",
               "orders.create", "orders.all", "orders.manage", "settings", "fleet.view", "cash", "shops", "credit", "routes", "promos.edit"],
  supervisor: ["sales.own", "debts.own", "team.own", "orders.create", "orders.own"],
  tp:         ["sales.own", "debts.own", "team.own", "orders.create", "orders.own"],
  accountant: ["sales", "debts", "sync", "orders.all", "cash"],
  financier:  ["sales", "debts", "cash"],
  warehouse:  ["stock", "orders.all", "orders.manage"],
  admin:      ["stock", "users", "orders.all", "orders.manage", "shift", "settings", "shops", "tasks.all", "tasks.create", "routes"],
  driver:     ["fleet.send"],
};

export const ROLES = Object.keys(ROLE_PERMS);

export const can = (user, perm) => (ROLE_PERMS[user.role] || []).includes(perm);

// Видит ли пользователь продажи/долги: "all" | "own" | null
export function scopeOf(user, kind /* "sales" | "debts" | "team" */) {
  if (can(user, kind)) return "all";
  if (can(user, kind + ".own")) return "own";
  return null;
}

// Список менеджеров 1С, чьих клиентов видит ТП/супервайзер (через запятую в users.manager_1c)
export const managersOf = (user) => (user.manager_1c || "").split(",").map((s) => s.trim()).filter(Boolean);
