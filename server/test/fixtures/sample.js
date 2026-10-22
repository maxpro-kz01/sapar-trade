// Пример данных в том виде, как их шлёт агент 1С (для тестов и документации).
export const day = (offset) => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const sample = {
  products: [
    { code: "00001", name: "Мука «Цесна» 50 кг", group: "Бакалея", unit: "шт", sku: "4870001" },
    { code: "00002", name: "Масло подсолнечное 5 л", group: "Бакалея", unit: "шт" },
    { code: "00003", name: "Порошок стиральный 3 кг", group: "Бытовая химия", unit: "шт" },
  ],
  warehouses: [{ code: "000000001", name: "Главный склад" }, { code: "000000002", name: "Шугыла" }],
  clients: [
    { code: "К-001", name: "Магазин «Айгерим»", manager: "Ахметов Ержан", phone: "+7 701 000 00 01", address: "ул. Абая, 1" },
    { code: "К-002", name: "Магазин «Береке»", manager: "Ахметов Ержан" },
    { code: "К-003", name: "Магазин «Самал»", manager: "Иванов Пётр" },
  ],
  prices: [
    { product: "00001", priceType: "Оптовая", price: 15000 },
    { product: "00002", priceType: "Оптовая", price: "4 500,50" },
    { product: "00003", priceType: "Оптовая", price: 3000 },
    { product: "00001", priceType: "Розничная", price: 16500 },
  ],
  stock: [
    { warehouse: "000000001", product: "00001", qty: 10 },
    { warehouse: "000000001", product: "00002", qty: 20 },
    { warehouse: "000000002", product: "00003", qty: -2 },
    { warehouse: "000000002", product: "00003", qty: 5 }, // дубль ключа — складывается → 3
  ],
  debts: [
    { client: "К-001", docDate: day(-30), docName: "Реализация 00012", amount: 100000 },
    { client: "К-001", docDate: day(-2), docName: "Реализация 00031", amount: 50000 },
    { client: "К-003", docDate: day(-1), docName: "Реализация 00033", amount: 70000 },
  ],
  sales: [
    { day: day(-1), product: "00001", client: "К-001", qty: 2, revenue: 30000 },
    { day: day(-1), product: "00002", client: "К-002", qty: 4, revenue: 18000 },
    { day: day(0), product: "00003", client: "К-003", qty: 10, revenue: 30000 },
  ],
  cost: [
    { day: day(-1), product: "00001", qty: 2, cost: 24000 },
    { day: day(-1), product: "00002", qty: 4, cost: 14000 },
    { day: day(0), product: "00003", qty: 10, cost: 21000 },
  ],
};
