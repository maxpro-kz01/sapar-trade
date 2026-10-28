// Sapar Trade — общий модуль: форматирование процентов и крупных сумм (₸)
// Используется экранами системы управления и рабочего режима.

const pctOf = (a, b) => (b ? (a / b) * 100 : 0);
const fp = (n, d = 1) => (isFinite(n) && n !== null ? Number(n).toFixed(d).replace(".", ",") : "0") + "%";
const shortMoney = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1e9) return (n / 1e9).toFixed(2).replace(".", ",") + " млрд ₸";
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " млн ₸";
  if (a >= 1e4) return Math.round(n / 1e3).toLocaleString("ru-RU") + " тыс ₸";
  return money(Math.round(n || 0));
};
