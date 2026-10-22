// Мелкие помощники для маршрутов.

// Express 4 не ловит ошибки async-функций — оборачиваем.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

// Часовой пояс компании — Кызылорда (UTC+5)
export const TZ = "Asia/Qyzylorda";
export const todayLocal = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // YYYY-MM-DD

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s) => typeof s === "string" && ISO.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

// Период из ?from=&to= ; по умолчанию — с 1-го числа текущего месяца по сегодня
export function period(query) {
  const today = todayLocal();
  const from = query.from ?? today.slice(0, 8) + "01";
  const to = query.to ?? today;
  if (!isIsoDate(from) || !isIsoDate(to)) throw new HttpError(400, "Даты в формате ГГГГ-ММ-ДД");
  if (from > to) throw new HttpError(400, "Дата «с» позже даты «по»");
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (days > 400) throw new HttpError(400, "Период не больше 400 дней");
  return { from, to };
}
