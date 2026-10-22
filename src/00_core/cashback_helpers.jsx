// Sapar Trade — прототип. Модуль: Ежемесячный кэшбэк, стили статусов заказа
// Строки 705–729 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ---------- Monthly cashback program helpers ---------- */
// Rule: once a client's own purchases in the current calendar month reach the
// threshold, they unlock one reward (a free-shopping cashback credit) that can
// be applied at checkout. Progress is derived from order dates, so it resets
// automatically at the start of every new month — no manual reset needed.
const monthKey = (d) => d.getFullYear() + "-" + d.getMonth();
const getMonthSpend = (orders, now = new Date()) => {
  const mk = monthKey(now);
  return orders
    .filter((o) => o.__client && o.status !== "Отменён" && monthKey(new Date(o.date)) === mk)
    .reduce((sum, o) => sum + o.total, 0);
};
const daysLeftInMonth = (now = new Date()) => {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return end.getDate() - now.getDate();
};

const STATUS_STYLE = {
  "Новый": { bg: "#EEF0FF", fg: "#1B1464" },
  "В обработке": { bg: "#FFF3D6", fg: "#8A5A00" },
  "Готов к выдаче": { bg: "#E3F3FF", fg: "#0B5A8A" },
  "Доставлен": { bg: "#E4F7E9", fg: "#127A33" },
  "Отменён": { bg: "#FCE7E6", fg: "#B3261E" },
};

