// Права по ролям (ТЗ V1.0 §4). Источник правды — сервер: фронт только скрывает.
//  sales      — выручка/продажи по всей компании
//  sales.own  — продажи только своих клиентов (ТП, супервайзер: по менеджеру 1С)
//  gross      — себестоимость и валовая прибыль в тенге (только владелец)
//  margin     — маржа в % (владелец, директор)
//  stock      — остатки и сумма склада по цене продажи
//  debts / debts.own — дебиторка всех / своих клиентов
//  sync       — статус и журнал интеграции; users — управление пользователями; audit — журнал действий

//  team / team.own — рейтинг ТП всех / своей команды; plans.edit — ввод плана продаж
//  Задачи доступны всем ролям (видят свои; владелец и директор — все).
//  orders.create — создавать заказы (ТП/супервайзер — только своим клиентам); orders.all / orders.own — видеть заказы;
//  orders.manage — менять статус (принят/собран/отгружен); shift — смены администратора; settings — настройки
export const ROLE_PERMS = {
  owner:      ["sales", "gross", "margin", "stock", "debts", "sync", "users", "audit", "team", "plans.edit", "tasks.all",
               "orders.create", "orders.all", "orders.manage", "settings"],
  director:   ["sales", "margin", "stock", "debts", "sync", "team", "plans.edit", "tasks.all", "orders.create", "orders.all", "orders.manage"],
  supervisor: ["sales.own", "debts.own", "team.own", "orders.create", "orders.own"],
  tp:         ["sales.own", "debts.own", "team.own", "orders.create", "orders.own"],
  accountant: ["sales", "debts", "sync", "orders.all"],
  financier:  ["sales", "debts"],
  warehouse:  ["stock", "orders.all", "orders.manage"],
  admin:      ["stock", "users", "orders.all", "orders.manage", "shift", "settings"],
  driver:     [],
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
