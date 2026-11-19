// Проверка «Магазина» (TZ_STORE_APP): главный экран, секретный вход сотрудников, регистрация, вход по номеру, заказ.
// Нужен локальный сервер (cd server && npm run dev:local) + node scripts/seed-local.js. Запуск: node tools/shop-shots.mjs [папка]
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { chromePath } from "./chrome-path.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] || join(root, "shots", "shop");
mkdirSync(out, { recursive: true });
const API = "http://127.0.0.1:3999";
const local = { "react.production.min.js": "node_modules/react/umd/react.production.min.js", "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js" };
const html = readFileSync(join(root, "public/index.html"), "utf8").replace(/(<meta name="st-api" content=")[^"]*"/, `$1${API}"`);
const site = createServer((req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(html); });
await new Promise((ok) => site.listen(8080, "127.0.0.1", ok));
const browser = await chromium.launch({ executablePath: chromePath });
const errors = [], report = [];
let fails = 0;
const check = (ok, msg) => { report.push((ok ? "✓ " : "✗ ") + msg); if (!ok) fails++; };

// клиент 1С с телефоном: должен входить без регистрации
await fetch(API + "/api/sync/1c/clients", { method: "POST", headers: { "content-type": "application/json", "x-agent-key": "test-agent-key-0123456789", "x-agent-host": "srv1c" },
  body: JSON.stringify({ rows: [{ code: "К-900", name: "Магазин «Нур-1С»", manager: "Ахметов Ержан", phone: "8 (701) 555-66-77", address: "ул. Абая 5", priceType: "Оптовая" }] }) });

const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.route("**/*", (route) => {
  const url = route.request().url();
  const hit = Object.keys(local).find((k) => url.endsWith(k));
  if (hit) return route.fulfill({ body: readFileSync(join(root, local[hit])), contentType: "application/javascript" });
  if (url.startsWith("http://127.0.0.1")) return route.continue();
  return route.fulfill({ status: 204, body: "" });
});
const shot = (n) => page.screenshot({ path: join(out, n + ".png") });
const NEWPH = "777" + String(Math.floor(1000000 + Math.random() * 8999999));
const phoneInput = () => page.getByPlaceholder("7XX XXX XX XX");

await page.goto("http://127.0.0.1:8080/");
await page.waitForTimeout(800);
check(await page.getByRole("button", { name: "Заказать товары" }).count() === 1, "главный экран: кнопка «Заказать товары»");
check(await page.getByRole("button", { name: "Скачать приложение" }).count() === 1, "главный экран: кнопка «Скачать приложение»");
check(await page.getByText("Вход для сотрудников").count() === 0, "клиенты не видят «Вход для сотрудников»");
await shot("1-landing");

// секретный вход: двойной тап по логотипу
await page.locator("button[aria-label='Sapar Trade']").click({ clickCount: 2, delay: 60 });
await page.waitForTimeout(500);
check(await page.getByText("Вход для сотрудников").count() === 1, "двойной тап по логотипу открывает вход сотрудников");
await shot("2-staff-gate");
await page.getByRole("button").first().click(); // стрелка назад
await page.waitForTimeout(400);
check(await page.getByRole("button", { name: "Заказать товары" }).count() === 1, "из входа сотрудников можно вернуться");

// отдельное окно входа
await page.getByRole("button", { name: "Заказать товары" }).click();
await page.waitForTimeout(400);
check(await page.getByText("Вход для магазинов").count() === 1, "«Заказать товары» открывает окно входа");
await shot("3-login");

// неизвестный номер → регистрация
await phoneInput().fill(NEWPH);
await page.getByRole("button", { name: "Войти" }).click();
await page.waitForTimeout(900);
check(await page.getByText("Регистрация магазина").count() === 1, "неизвестный номер → предлагают регистрацию");
await page.getByPlaceholder("Например, Мини-маркет «Заря»").fill("Мини-маркет «Заря»");
await page.getByPlaceholder("Город, улица, дом").fill("мкр Север 12");
await shot("4-register");
await page.getByRole("button", { name: "Зарегистрироваться и войти" }).click();
await page.waitForTimeout(1500);
check(await page.getByText("Каталог", { exact: true }).count() >= 1 && await page.getByPlaceholder("Найти товар").count() === 1, "после регистрации сразу открыт каталог");
await shot("5-catalog");

// заказ
await page.getByRole("button", { name: "В корзину" }).first().click();
await page.getByRole("button", { name: "В корзину" }).first().click();
await page.waitForTimeout(300);
check(await page.getByText(/Корзина · 2 поз\./).count() === 1, "две позиции в корзине");
await page.getByText(/Корзина · 2 поз\./).click();
await page.waitForTimeout(700);
await shot("6-cart");
check(await page.getByRole("button", { name: "В долг" }).isDisabled(), "новому магазину «в долг» недоступно");
await page.getByRole("button", { name: "Оформить заказ" }).click();
await page.waitForTimeout(1500);
check(await page.getByText(/Заказ СТ-\d+ отправлен/).count() === 1, "заказ оформлен");
check(await page.getByText("Мои заказы").count() === 1, "после заказа открыта вкладка «Заказы»");
await shot("7-orders");
await page.getByText("Долг", { exact: true }).click();
await page.waitForTimeout(800);
check(await page.getByText(/не привязан к базе 1С/).count() === 1, "вкладка «Долг»: объяснение для магазина не из 1С");
await shot("8-debt");

// выход и повторный вход по номеру без кода
await page.getByText("Профиль", { exact: true }).click();
await page.getByRole("button", { name: "Выйти из магазина" }).click();
await page.waitForTimeout(500);
check(await page.getByRole("button", { name: "Заказать товары" }).count() === 1, "после выхода — главный экран");
await page.getByRole("button", { name: "Заказать товары" }).click();
await phoneInput().fill(NEWPH);
await page.getByRole("button", { name: "Войти" }).click();
await page.waitForTimeout(1500);
check(await page.getByPlaceholder("Найти товар").count() === 1, "зарегистрированный магазин входит по одному номеру");

// магазин из 1С: другой формат номера, сразу его цены и долг
await page.getByText("Профиль", { exact: true }).click();
await page.getByRole("button", { name: "Выйти из магазина" }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Заказать товары" }).click();
await phoneInput().fill("7015556677");
await page.getByRole("button", { name: "Войти" }).click();
await page.waitForTimeout(1500);
check(await page.getByText("Магазин «Нур-1С»").count() >= 1, "магазин из 1С входит под своим названием без регистрации");
await page.getByText("Долг", { exact: true }).click();
await page.waitForTimeout(800);
check(await page.getByText("Лимит «в долг»").count() === 1, "магазин из 1С видит лимит и долг");
await shot("9-debt-1c");

// после перезапуска вход держится, «Назад» не выкидывает из сайта
await page.reload(); await page.waitForTimeout(1000);
await shot("10-after-reload");

// ===== сотрудник: «Магазины», лимит «в долг», заказ магазина в списке заказов =====
const ctx2 = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const staff = await ctx2.newPage();
staff.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await staff.route("**/*", (route) => {
  const url = route.request().url();
  const hit = Object.keys(local).find((k) => url.endsWith(k));
  if (hit) return route.fulfill({ body: readFileSync(join(root, local[hit])), contentType: "application/javascript" });
  if (url.startsWith("http://127.0.0.1")) return route.continue();
  return route.fulfill({ status: 204, body: "" });
});
await staff.goto("http://127.0.0.1:8080/#work");
await staff.getByText("Система управления", { exact: true }).click().catch(() => {});
await staff.getByLabel("Логин").fill("owner"); await staff.getByLabel("Пароль").fill("Owner12345");
await staff.getByRole("button", { name: "Войти" }).click(); await staff.waitForTimeout(1500);
await staff.getByText("Магазины", { exact: true }).first().click(); await staff.waitForTimeout(1000);
check(await staff.getByText("Мини-маркет «Заря»").count() >= 1, "сотрудник видит новый магазин во вкладке «Магазины»");
check(await staff.getByText("нет в 1С").count() >= 1, "новый магазин помечен «нет в 1С»");
await staff.screenshot({ path: join(out, "11-staff-shops.png") });
await staff.getByRole("button", { name: "Привязать к клиенту 1С" }).first().click(); await staff.waitForTimeout(900);
check(await staff.getByText("Привязать по коду").count() === 1, "окно привязки к клиенту 1С открывается");
await staff.screenshot({ path: join(out, "12-staff-link.png") });
await staff.locator(".kz-modal").first().click({ position: { x: 5, y: 5 } }).catch(() => {});
await staff.waitForTimeout(500);
await staff.getByText("Клиенты", { exact: true }).first().click(); await staff.waitForTimeout(1200);
await staff.getByText("Магазин «Нур-1С»").first().click().catch(() => {}); await staff.waitForTimeout(900);
check(await staff.getByText(/Лимит «в долг»:/).count() >= 1, "владелец открывает окно лимита «в долг» у клиента");
await staff.screenshot({ path: join(out, "13-staff-limit.png") });

console.log(report.join("\n"));
console.log(errors.length ? "Ошибки страницы:\n" + errors.join("\n") : "Ошибок страницы нет");
await browser.close(); site.close();
process.exit(fails || errors.length ? 1 : 0);
