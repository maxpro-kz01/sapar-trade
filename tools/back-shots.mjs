// Проверка кнопки «Назад» / «Вперёд» браузера внутри сайта (ТЗ TZ_BACK_BUTTON).
// Нужен локальный сервер + seed-local.js. Запуск: node tools/back-shots.mjs
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromePath } from "./chrome-path.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const local = { "react.production.min.js": "node_modules/react/umd/react.production.min.js", "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js" };
const site = createServer((req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(readFileSync(join(root, "public/index.html"))); });
await new Promise((ok) => site.listen(8080, "127.0.0.1", ok));
const browser = await chromium.launch({ executablePath: chromePath });
const errors = [];
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "✓ " : "✗ ") + msg); if (!ok) fails++; };

async function open(vp = [1366, 800]) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("dialog", (d) => d.accept());
  await page.route("**/*", (route) => {
    const url = route.request().url();
    const hit = Object.keys(local).find((k) => url.endsWith(k));
    if (hit) return route.fulfill({ body: readFileSync(join(root, local[hit])), contentType: "application/javascript" });
    if (url.startsWith("http://127.0.0.1")) return route.continue();
    return route.fulfill({ status: 204, body: "" });
  });
  // страница «до сайта»: если «Назад» уйдёт с сайта, окажемся здесь
  await page.goto("data:text/html,<title>outside</title>чужая страница");
  await page.goto("http://127.0.0.1:8080/");
  return page;
}
const back = async (p) => { await p.goBack({ waitUntil: "commit" }).catch(() => {}); await p.waitForTimeout(700); };
const fwd = async (p) => { await p.goForward({ waitUntil: "commit" }).catch(() => {}); await p.waitForTimeout(700); };
const onSite = (p) => p.url().startsWith("http://127.0.0.1:8080");
const title = (p) => p.locator(".kz-head p.font-display").first().innerText().catch(() => "");
const tab = async (p, name) => { await p.locator(".kz-nav-item", { hasText: name }).first().click(); await p.waitForTimeout(900); };
async function login(p, button, l, pw) {
  await p.getByText(button, { exact: true }).click();
  await p.getByLabel("Логин").fill(l); await p.getByLabel("Пароль").fill(pw);
  await p.getByRole("button", { name: "Войти" }).click(); await p.waitForTimeout(1300);
}

// 1. Система управления
{
  const p = await open();
  await p.getByText("Система управления", { exact: true }).click();
  await p.waitForTimeout(400);
  check(await p.getByLabel("Логин").count() === 1, "вход: форма логина");
  await back(p);
  check(onSite(p) && /Вход для сотрудников/.test(await p.locator("body").innerText()), "вход: «Назад» с логина → выбор роли");
  await fwd(p);
  check(await p.getByLabel("Логин").count() === 1, "вход: «Вперёд» → снова логин");
  await p.getByLabel("Логин").fill("owner"); await p.getByLabel("Пароль").fill("Owner12345");
  await p.getByRole("button", { name: "Войти" }).click(); await p.waitForTimeout(1300);
  check(await title(p) === "Главная", "система: после входа — Главная");
  await tab(p, "Продажи"); await tab(p, "Команда"); await tab(p, "Клиенты");
  await back(p); check(await title(p) === "Команда", "система: «Назад» → Команда");
  await back(p); check(await title(p) === "Продажи", "система: «Назад» → Продажи");
  await fwd(p); check(await title(p) === "Команда", "система: «Вперёд» → Команда");
  await back(p); await back(p);
  check(await title(p) === "Главная", "система: «Назад» → Главная");
  await back(p); await back(p);
  check(onSite(p) && await title(p) === "Главная", "система: с Главной «Назад» не уходит с сайта и не показывает логин");
  // окно уведомлений
  await tab(p, "Склад");
  await p.getByTitle("Уведомления").click(); await p.waitForTimeout(600);
  check(/Уведомления/.test(await p.locator(".kz-modal").innerText().catch(() => "")), "окно: уведомления открыты");
  await back(p);
  check(await p.locator(".kz-modal").count() === 0 && await title(p) === "Склад", "окно: «Назад» закрыл окно, вкладка та же");
  await p.getByTitle("Уведомления").click(); await p.waitForTimeout(600);
  await p.locator(".kz-modal button").first().click(); await p.waitForTimeout(600); // закрыть крестиком
  check(await p.locator(".kz-modal").count() === 0, "окно: закрыто крестиком");
  await back(p);
  check(await title(p) === "Главная", "окно: после крестика «Назад» сразу ведёт на прошлую вкладку");
  // подразделы «Системы» и F5
  await tab(p, "Система");
  await p.locator(".kz-main button", { hasText: "Сотрудники" }).first().click(); await p.waitForTimeout(700);
  await p.reload(); await p.waitForTimeout(1500);
  check(await title(p) === "Система" && /Добавить сотрудника/.test(await p.locator(".kz-main").innerText()), "F5: та же вкладка и подраздел");
  await back(p);
  check(/Интеграция 1С/i.test(await p.locator(".kz-main").innerText()) && !/Добавить сотрудника/.test(await p.locator(".kz-main").innerText()), "F5 и «Назад»: подраздел «Интеграция 1С»");
  // выход
  await p.getByTitle("Выйти").click(); await p.waitForTimeout(800);
  await back(p);
  check(onSite(p) && /Вход для сотрудников/.test(await p.locator("body").innerText()), "выход: «Назад» не возвращает в систему");
}

// 2. Админ-панель
{
  const p = await open();
  await login(p, "Администратор", "adm", "Passw0rd1");
  const first = await title(p);
  await tab(p, "Заказы"); await tab(p, "Склад");
  await back(p); check(await title(p) === "Заказы", "админ: «Назад» → Заказы");
  await back(p); check(await title(p) === first, "админ: «Назад» → " + first);
  await back(p); check(onSite(p) && await title(p) === first, "админ: с первой вкладки не уходит с сайта");
}

// 3. Приложение ТП: магазин → заказ → «Назад»; корзина сохраняется
{
  const p = await open([375, 812]);
  await login(p, "Торговый представитель", "tp1", "Passw0rd1");
  await p.locator(".kz-main >> text=Заказ ›").first().click(); await p.waitForTimeout(1200);
  check(await title(p) === "Заказ", "ТП: открыт заказ по магазину");
  await p.locator(".kz-main .flex.items-center.gap-2.py-2").nth(0).locator("button").last().click(); await p.waitForTimeout(400);
  check(await p.locator(".kz-main input[inputmode=decimal]").count() === 1, "ТП: товар в корзине");
  await back(p);
  check(await title(p) === "Магазины", "ТП: «Назад» из заказа → Магазины");
  await fwd(p);
  check(await title(p) === "Заказ" && await p.locator(".kz-main input[inputmode=decimal]").count() === 1, "ТП: «Вперёд» → заказ, корзина на месте");
  await back(p); await back(p);
  check(onSite(p), "ТП: с первого экрана не уходит с сайта");
}

check(errors.length === 0, "ошибок JS нет" + (errors.length ? ": " + errors.join(" | ") : ""));
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : "\nВсё в порядке");
await browser.close(); site.close();
process.exit(fails ? 1 : 0);
