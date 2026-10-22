// Sapar Trade — прототип. Модуль: Расчёт отчёта за смену + текст для WhatsApp + отправка wa.me
// Строки 595–704 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ---------- Work shift: report engine ---------- */
// The admin opens a shift ("Начать работу") and closes it ("Завершить работу").
// Everything that happened between those two timestamps is rolled up into one
// report: orders by channel, revenue, money actually taken into the till split
// by payment method, unpaid debt, top products and low-stock warnings.

const DIRECTOR_PHONE_DEFAULT = "+7 700 105 17 17";
const digitsOnly = (s) => String(s || "").replace(/\D/g, "");

const shiftDuration = (from, to) => {
  const mins = Math.max(0, Math.round((to - from) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return (h ? h + " ч " : "") + m + " мин";
};

function buildShiftReport(orders, warehouse, from, to, adminName) {
  const inShift = orders.filter((o) => {
    const d = new Date(o.date);
    return d >= from && d <= to;
  });
  const cancelled = inShift.filter((o) => o.status === "Отменён");
  const live = inShift.filter((o) => o.status !== "Отменён");

  const sum = (arr) => arr.reduce((s, o) => s + o.total, 0);
  const payOf = (o) => o.isDebt ? "debt" : (o.payMethod || "cash");

  const cash = sum(live.filter((o) => payOf(o) === "cash"));
  const card = sum(live.filter((o) => payOf(o) === "card"));
  const transfer = sum(live.filter((o) => payOf(o) === "transfer"));
  const debt = sum(live.filter((o) => payOf(o) === "debt"));
  const revenue = sum(live);
  const till = cash + card + transfer;

  // top products by revenue inside the shift
  const map = {};
  live.forEach((o) => o.items.forEach((it) => {
    if (!map[it.n]) map[it.n] = { n: it.n, qty: 0, sum: 0 };
    map[it.n].qty += it.qty;
    map[it.n].sum += it.price * it.qty;
  }));
  const top = Object.values(map).sort((a, b) => b.sum - a.sum).slice(0, 5);

  const lowStock = (warehouse || []).filter((p) => p.stock <= 30).slice(0, 6);

  return {
    from, to, adminName,
    duration: shiftDuration(from, to),
    countAll: inShift.length,
    countShops: live.filter((o) => o.type === "shop").length,
    countIndividuals: live.filter((o) => o.type === "individual").length,
    countAgents: live.filter((o) => o.type === "agent").length,
    countCancelled: cancelled.length,
    revenue, cash, card, transfer, debt, till,
    avgCheck: live.length ? Math.round(revenue / live.length) : 0,
    top, lowStock,
    delivered: live.filter((o) => o.status === "Доставлен").length,
    inWork: live.filter((o) => o.status === "Новый" || o.status === "В обработке" || o.status === "Готов к выдаче").length,
  };
}

// Plain-text version of the report — this is the exact message the director
// receives in WhatsApp.
function reportToText(r) {
  const L = [];
  L.push("*ОТЧЁТ ЗА СМЕНУ — ИП «Sapar Trade»*");
  L.push("Дата: " + dmy(r.from));
  L.push("Смена: " + hm(r.from) + " — " + hm(r.to) + "  (" + r.duration + ")");
  L.push("Администратор: " + r.adminName);
  L.push("");
  L.push("🧾 *ЗАКАЗЫ: " + r.countAll + "*");
  L.push("• Магазины: " + r.countShops);
  L.push("• Частные лица: " + r.countIndividuals);
  L.push("• От представителей: " + r.countAgents);
  L.push("• Выдано/доставлено: " + r.delivered);
  L.push("• В работе: " + r.inWork);
  L.push("• Отменено: " + r.countCancelled);
  L.push("");
  L.push("💰 *ПРОДАЖИ*");
  L.push("Сумма продаж: " + money(r.revenue));
  L.push("Средний чек: " + money(r.avgCheck));
  L.push("");
  L.push("🏦 *КАССА*");
  L.push("Наличные: " + money(r.cash));
  L.push("Картой: " + money(r.card));
  L.push("Перевод: " + money(r.transfer));
  L.push("*ИТОГО В КАССУ: " + money(r.till) + "*");
  L.push("Отпущено в долг: " + money(r.debt));
  if (r.top.length) {
    L.push("");
    L.push("📦 *ТОП ТОВАРОВ*");
    r.top.forEach((t, i) => L.push((i + 1) + ". " + t.n + " — " + t.qty + " шт · " + money(t.sum)));
  }
  if (r.lowStock.length) {
    L.push("");
    L.push("⚠️ *ЗАКАНЧИВАЕТСЯ НА СКЛАДЕ*");
    r.lowStock.forEach((p) => L.push("• " + p.name + " — остаток " + p.stock + " " + p.unit));
  }
  L.push("");
  L.push("Отчёт сформирован автоматически: " + dt(r.to));
  return L.join("\n");
}

// Opens WhatsApp (app on phone, web on desktop) with the report already typed
// in the chat with the director — one tap on «Отправить» delivers it.
function sendToWhatsApp(phone, text) {
  const body = CUR_LANG === "kk" ? text.split("\n").map(trKK).join("\n") : text;
  const url = "https://wa.me/" + digitsOnly(phone) + "?text=" + encodeURIComponent(body);
  window.open(url, "_blank");
}

