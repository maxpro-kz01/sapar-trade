// Sapar Trade — прототип. Модуль: Демо-данные: категории, товары, баннеры, сторис, заказы, счета, аудит, ТП
// Строки 126–241 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== MOCK DATA ============================== */

const CATEGORIES = [
  { id: "drinks", name: "Напитки", emoji: "🥤" },
  { id: "dairy", name: "Молочные", emoji: "🥛" },
  { id: "sweets", name: "Кондитерка", emoji: "🍬" },
  { id: "grocery", name: "Бакалея", emoji: "🌾" },
  { id: "chemistry", name: "Быт. химия", emoji: "🧴" },
  { id: "canned", name: "Консервация", emoji: "🥫" },
  { id: "snacks", name: "Снеки", emoji: "🍿" },
  { id: "frozen", name: "Заморозка", emoji: "🧊" },
];

const PRODUCTS = [
  { id: 1, cat: "drinks", name: "Coca-Cola 1.5л", price: 620, unit: "шт", stock: 340 },
  { id: 2, cat: "drinks", name: "Fanta 1л", price: 480, unit: "шт", stock: 210 },
  { id: 3, cat: "drinks", name: "Вода Bonaqua 1.5л", price: 250, unit: "шт", stock: 512 },
  { id: 4, cat: "drinks", name: "Сок Da Da яблочный 1л", price: 390, unit: "шт", stock: 88 },
  { id: 5, cat: "dairy", name: "Молоко Айналайын 2.5% 1л", price: 450, unit: "шт", stock: 140 },
  { id: 6, cat: "dairy", name: "Сметана Домик в деревне 400г", price: 620, unit: "шт", stock: 76 },
  { id: 7, cat: "dairy", name: "Йогурт Активиа 290г", price: 380, unit: "шт", stock: 60 },
  { id: 8, cat: "dairy", name: "Сыр Гауда 1кг", price: 3200, unit: "кг", stock: 22 },
  { id: 9, cat: "sweets", name: "Печенье Юбилейное 228г", price: 340, unit: "шт", stock: 190 },
  { id: 10, cat: "sweets", name: "Шоколад Казахстанский 100г", price: 420, unit: "шт", stock: 260 },
  { id: 11, cat: "sweets", name: "Конфеты Рахат Ассорти 1кг", price: 2800, unit: "кг", stock: 34 },
  { id: 12, cat: "sweets", name: "Вафли Артек 300г", price: 390, unit: "шт", stock: 71 },
  { id: 13, cat: "grocery", name: "Мука в/с Алтын Дан 2кг", price: 780, unit: "шт", stock: 150 },
  { id: 14, cat: "grocery", name: "Сахар-песок 1кг", price: 520, unit: "шт", stock: 400 },
  { id: 15, cat: "grocery", name: "Рис Акмола 900г", price: 890, unit: "шт", stock: 96 },
  { id: 16, cat: "grocery", name: "Масло подсолнечное Шедевр 1л", price: 990, unit: "шт", stock: 8 },
  { id: 17, cat: "chemistry", name: "Стиральный порошок Persil 3кг", price: 4200, unit: "шт", stock: 41 },
  { id: 18, cat: "chemistry", name: "Мыло хозяйственное 200г", price: 180, unit: "шт", stock: 300 },
  { id: 19, cat: "chemistry", name: "Средство для посуды Fairy 900мл", price: 1350, unit: "шт", stock: 54 },
  { id: 20, cat: "chemistry", name: "Отбеливатель Белизна 1л", price: 390, unit: "шт", stock: 6 },
  { id: 21, cat: "canned", name: "Тушёнка говяжья 338г", price: 1450, unit: "шт", stock: 120 },
  { id: 22, cat: "canned", name: "Горошек зелёный 400г", price: 390, unit: "шт", stock: 210 },
  { id: 23, cat: "canned", name: "Кукуруза консерв. 400г", price: 410, unit: "шт", stock: 180 },
  { id: 24, cat: "canned", name: "Огурцы маринованные 720мл", price: 650, unit: "шт", stock: 63 },
  { id: 25, cat: "snacks", name: "Чипсы Lays 150г", price: 650, unit: "шт", stock: 130 },
  { id: 26, cat: "snacks", name: "Сухарики Хрутка 90г", price: 280, unit: "шт", stock: 240 },
  { id: 27, cat: "snacks", name: "Орешки солёные 200г", price: 990, unit: "шт", stock: 45 },
  { id: 28, cat: "snacks", name: "Попкорн сладкий 150г", price: 450, unit: "шт", stock: 70 },
  { id: 29, cat: "frozen", name: "Пельмени Сибирские 800г", price: 2100, unit: "шт", stock: 5 },
  { id: 30, cat: "frozen", name: "Мороженое пломбир рожок", price: 350, unit: "шт", stock: 300 },
  { id: 31, cat: "frozen", name: "Овощная смесь 400г", price: 620, unit: "шт", stock: 85 },
  { id: 32, cat: "frozen", name: "Наггетсы куриные 500г", price: 1650, unit: "шт", stock: 3 },
];

const BANNER_SEED = [
  { id: "b1", title: "Скидка −10% на напитки", subtitle: "При заказе от 50 000 ₸", grad: "linear-gradient(135deg,#1B1464,#3B2FA0)", img: null },
  { id: "b2", title: "Новый склад в Кызылорде", subtitle: "Доставка стала быстрее", grad: "linear-gradient(135deg,#E2231A,#FF6A5B)", img: null },
  { id: "b3", title: "Бонусы для оптовиков", subtitle: "Каждый 10-й заказ — подарок", grad: "linear-gradient(135deg,#FFC800,#FF9A00)", img: null },
];

const STORY_SEED = [
  { id: "s1", caption: "Новая партия молочных продуктов 🥛", grad: "linear-gradient(160deg,#1B1464,#4B3FCB)", views: 214, hoursAgo: 2 },
  { id: "s2", caption: "Акция на бытовую химию −15%", grad: "linear-gradient(160deg,#E2231A,#FF7A6E)", views: 187, hoursAgo: 4 },
  { id: "s3", caption: "Работаем без выходных!", grad: "linear-gradient(160deg,#FFC800,#FF9A00)", views: 302, hoursAgo: 6 },
  { id: "s4", caption: "Открыт новый склад в Кызылорде", grad: "linear-gradient(160deg,#1B1464,#E2231A)", views: 95, hoursAgo: 9 },
  { id: "s5", caption: "Скидки для оптовиков до конца месяца", grad: "linear-gradient(160deg,#161327,#4B3FCB)", views: 58, hoursAgo: 12 },
];

function genOrders() {
  const now = new Date();
  const mk = (idx, dayOffset, hour, name, shop, items, isDebt, status, type) => {
    const d = new Date(now);
    d.setDate(d.getDate() - dayOffset);
    d.setHours(hour, (idx * 13) % 60, 0, 0);
    const total = items.reduce((s, it) => s + it.price * it.qty, 0);
    return {
      id: `KZ-${String(2600 + dayOffset).slice(1)}${String(1000 + idx)}`,
      date: d,
      name, shop, items, total, isDebt, status, type,
      phone: "+7 701 " + (100 + idx) + " " + (10 + idx) + " " + (20 + idx),
      address: "г. Кызылорда, ул. Желтоксан, " + (10 + idx),
    };
  };
  return [
    mk(1, 0, 9, "Азамат Т.", "Магазин Береке", [{ n: "Coca-Cola 1.5л", price: 620, qty: 24 }, { n: "Чипсы Lays 150г", price: 650, qty: 12 }], true, "В обработке", "shop"),
    mk(2, 0, 10, "Айгуль С.", null, [{ n: "Молоко Айналайын 1л", price: 450, qty: 6 }], false, "Новый", "individual"),
    mk(3, 0, 12, "Нурлан Б.", "ТД Шапагат", [{ n: "Мука в/с 2кг", price: 780, qty: 40 }, { n: "Сахар-песок 1кг", price: 520, qty: 50 }], true, "Готов к выдаче", "shop"),
    mk(4, 0, 14, "Ерлан К.", null, [{ n: "Печенье Юбилейное", price: 340, qty: 8 }], false, "Доставлен", "individual"),
    mk(5, 1, 11, "Динара М.", "Дукен Азамат ИП", [{ n: "Стиральный порошок Persil 3кг", price: 4200, qty: 10 }], false, "Доставлен", "shop"),
    mk(6, 1, 16, "Бекзат У.", null, [{ n: "Сыр Гауда 1кг", price: 3200, qty: 2 }], false, "Доставлен", "individual"),
    mk(7, 2, 9, "Мадина Р.", "Магазин Береке", [{ n: "Тушёнка говяжья 338г", price: 1450, qty: 30 }], true, "Доставлен", "shop"),
    mk(8, 3, 13, "Сакен А.", null, [{ n: "Вода Bonaqua 1.5л", price: 250, qty: 12 }], false, "Отменён", "individual"),
    mk(9, 5, 10, "Гульнара Б.", "ТД Шапагат", [{ n: "Рис Акмола 900г", price: 890, qty: 25 }], true, "Доставлен", "shop"),
    mk(10, 7, 15, "Ринат Ж.", null, [{ n: "Шоколад Казахстанский 100г", price: 420, qty: 10 }], false, "Доставлен", "individual"),
  ];
}

const ACCOUNTS_SEED = [
  { id: "a1", bank: "Kaspi Bank", iban: "KZ12 3456 7890 1234 5678", holder: "ИП «Sapar Trade»" },
  { id: "a2", bank: "Halyk Bank", iban: "KZ98 7654 3210 9876 5432", holder: "ИП «Sapar Trade»" },
];

const AUDIT_SEED = [
  { t: "сегодня, 09:14", user: "Админ (Гульмира)", action: "Изменена цена", obj: "Сахар-песок 1кг", detail: "500 ₸ → 520 ₸" },
  { t: "сегодня, 08:50", user: "Админ (Гульмира)", action: "Приход товара", obj: "Coca-Cola 1.5л", detail: "+200 шт" },
  { t: "вчера, 19:02", user: "Склад (Дамир)", action: "Списание", obj: "Пельмени Сибирские 800г", detail: "−15 шт, брак упаковки" },
  { t: "вчера, 17:40", user: "Админ (Гульмира)", action: "Заказ переведён в долг", obj: "KZ-26001005", detail: "Магазин Береке, 55 800 ₸" },
  { t: "вчера, 12:10", user: "Админ (Гульмира)", action: "Удалена история", obj: "Story #s0", detail: "истёк срок 24ч" },
  { t: "2 дня назад", user: "Админ (Гульмира)", action: "Добавлен баннер", obj: "Скидка на напитки", detail: "слот 1/10" },
  { t: "3 дня назад", user: "Бухгалтер (Айдос)", action: "Изменён счёт для оплаты", obj: "Kaspi Bank", detail: "обновлён IBAN" },
  { t: "5 дней назад", user: "Админ (Гульмира)", action: "Статус заказа изменён", obj: "KZ-26501009", detail: "Новый → Доставлен" },
];

const AGENTS_SEED = [
  { id: "ag1", name: "Азамат Турсунов", login: "agent", password: "agent123", active: true },
];

const money = (n) => n.toLocaleString("ru-RU") + " ₸";
const dt = (d) => d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const hm = (d) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const dmy = (d) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

