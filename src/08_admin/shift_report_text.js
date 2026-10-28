// Sapar Trade — администратор. Модуль: текст отчёта смены для директора (WhatsApp) из данных сервера
// Отчёт строит сервер (заказы приложения + продажи из 1С); здесь — только оформление текста и ссылка wa.me.

const shiftHM = (ts) => new Date(ts).toLocaleTimeString("ru-RU", { timeZone: ST_TZ, hour: "2-digit", minute: "2-digit" });
const shiftLen = (a, b) => { const m = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)); return (Math.floor(m / 60) ? Math.floor(m / 60) + " ч " : "") + (m % 60) + " мин"; };

function shiftReportText(r) {
  const L = [], o = r.orders, s = r.sales1c;
  L.push("*ОТЧЁТ ЗА СМЕНУ — ИП «Sapar Trade»*");
  L.push("Дата: " + stFmtDate(r.day));
  L.push("Смена: " + shiftHM(r.from) + " — " + shiftHM(r.to) + "  (" + shiftLen(r.from, r.to) + ")");
  L.push("Администратор: " + r.adminName);
  L.push("");
  L.push("🧾 *ЗАКАЗЫ В ПРИЛОЖЕНИИ: " + o.count + "*");
  L.push("Сумма: " + stMoney(o.total) + (o.avg ? " · средний " + stMoney(o.avg) : ""));
  L.push("• Отгружено: " + o.shipped + " · в работе: " + o.inWork + " · отменено: " + o.cancelled);
  L.push("• Создано в 1С: " + o.in1c + (o.err1c ? " · ошибок 1С: " + o.err1c : ""));
  if (o.byTp.length) { L.push(""); L.push("👤 *ПО ТОРГОВЫМ ПРЕДСТАВИТЕЛЯМ*"); o.byTp.forEach((t) => L.push("• " + t.manager + " — " + t.n + " зак. · " + stMoney(t.total))); }
  L.push("");
  L.push("💰 *ПРОДАЖИ ЗА ДЕНЬ ПО 1С*");
  L.push("Выручка: " + stMoney(s.revenue) + " · покупателей: " + s.clients);
  if (s.lastSync) L.push("Данные 1С на " + stFmtTime(s.lastSync));
  if (s.top.length) { L.push(""); L.push("📦 *ТОП ТОВАРОВ ДНЯ*"); s.top.forEach((t, i) => L.push((i + 1) + ". " + t.name + " — " + stNum(t.qty) + " · " + stMoney(t.sum))); }
  if (r.debts.overdue > 0) { L.push(""); L.push("⏰ *ПРОСРОЧЕННЫЕ ДОЛГИ*: " + stMoney(r.debts.overdue) + " (" + r.debts.clients + " клиентов)"); }
  if (r.lowStock.length) {
    L.push(""); L.push("⚠️ *ЗАКАНЧИВАЕТСЯ НА СКЛАДЕ*");
    r.lowStock.forEach((p) => L.push("• " + p.name + " — " + stNum(p.stock) + " " + (p.unit || "") + (p.daysLeft !== null ? " (≈" + p.daysLeft + " дн.)" : "")));
  }
  L.push("");
  L.push("Отчёт сформирован автоматически: " + stFmtTime(r.to));
  return L.join("\n");
}

function shiftWhatsAppUrl(phone, text) {
  const body = CUR_LANG === "kk" ? text.split("\n").map(trKK).join("\n") : text;
  return "https://wa.me/" + String(phone || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(body);
}
