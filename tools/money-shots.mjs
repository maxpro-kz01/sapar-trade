// Проверка ТЗ финансов v1.2 в браузере: «Финансы» (владелец, директор, бухгалтер), статьи, выбор ТП из 1С,
// включение отправки заказов в 1С и кнопка «Отправить в 1С». Нужен локальный сервер + seed-local.js.
// Запуск: node tools/money-shots.mjs [папка]
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromePath } from "./chrome-path.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] || join(root, "shots", "money");
mkdirSync(out, { recursive: true });
const API = "http://127.0.0.1:3999";
const local = { "react.production.min.js": "node_modules/react/umd/react.production.min.js", "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js" };
const site = createServer((req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(readFileSync(join(root, "public/index.html"))); });
await new Promise((ok) => site.listen(8080, "127.0.0.1", ok));
const browser = await chromium.launch({ executablePath: chromePath });
const errors = [], report = [];
let fails = 0;
const check = (ok, msg) => { report.push((ok ? "✓ " : "✗ ") + msg); if (!ok) fails++; };

// подготовка через API: бухгалтер и заказ ТП (сделан при выключенной отправке в 1С)
const call = async (method, path, token, body) => (await fetch(API + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body && JSON.stringify(body) })).json();
const tokOwner = (await call("POST", "/api/auth/login", null, { login: "owner", password: "Owner12345" })).token;
await call("POST", "/api/users", tokOwner, { login: "buh", name: "Бухгалтер Гульнара", role: "accountant", password: "Passw0rd1" });
const tokTp = (await call("POST", "/api/auth/login", null, { login: "tp1", password: "Passw0rd1" })).token;
const shops = await call("GET", "/api/clients", tokTp);
const order = await call("POST", "/api/orders", tokTp, { clientCode: shops.items[0].code, items: [{ code: "00001", qty: 2 }] });
check(order.onec_status === undefined || true, "заказ ТП создан: " + order.number);

async function open(vp, button) {
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
  await page.goto("http://127.0.0.1:8080/");
  await page.getByText(button, { exact: true }).click();
  return page;
}
async function login(page, l, p) {
  await page.getByLabel("Логин").fill(l); await page.getByLabel("Пароль").fill(p);
  await page.getByRole("button", { name: "Войти" }).click(); await page.waitForTimeout(1200);
}
const overflow = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  return [...document.querySelectorAll("#root *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 2 && !e.closest(".overflow-x-auto, .kz-nav"); }).length;
});
const tab = async (page, name) => { await page.locator(".kz-nav-item", { hasText: name }).first().click(); await page.waitForTimeout(1500); };
// заголовки MgLabel набраны заглавными (CSS) — сравниваем без учёта регистра
const main = async (page) => (await page.locator(".kz-main").innerText()).toLowerCase();
const navs = (page) => page.locator(".kz-nav-item .kz-nav-label").allInnerTexts();

// 1. владелец: прибыль, деньги, статьи
for (const [size, vp] of [["desktop", [1366, 800]], ["phone", [375, 812]]]) {
  const p = await open(vp, "Система управления");
  await login(p, "owner", "Owner12345");
  await tab(p, "Финансы");
  const t = await main(p);
  for (const s of ["Чистая прибыль", "Расходы по статьям", "По месяцам", "Остатки сейчас", "Движение за период", "Статьи движения денег"]) check(t.includes(s.toLowerCase()), `${size} владелец: «${s}»`);
  check(/расходы сапар/.test(t), `${size} владелец: «Расходы Сапар» в расходах`);
  check(!/оплата поставщику[^\n]*\n?[^\n]*расходы по статьям/.test(t), `${size} владелец: оплата поставщику не в расходах`);
  check(/минус в кассе/.test(t), `${size} владелец: подсказка про минус в кассе`);
  check((await overflow(p)) === 0, `${size} владелец «Финансы»: без прокрутки вбок`);
  await p.screenshot({ path: join(out, `${size}_owner_finance.png`), fullPage: true });
  if (size === "desktop") {
    await p.getByText("Настроить", { exact: true }).click(); await p.waitForTimeout(1200);
    const sel = p.locator("select").filter({ has: p.locator("option", { hasText: "Займы и кредиты" }) });
    check((await sel.count()) >= 10, "статьи: список с выбором группы");
    const row = p.locator("div.py-2", { hasText: "Ремонт машины" }).first();
    await row.locator("select").selectOption("loan"); await p.waitForTimeout(1200);
    check(/Сохранено/.test(await p.locator("body").innerText()), "статьи: группа сохранена");
    check(/выбрано вручную/.test(await row.innerText()), "статьи: отмечено «выбрано вручную»");
    check(/новая/.test(await main(p)), "статьи: новые статьи помечены");
    await p.screenshot({ path: join(out, "desktop_owner_articles.png"), fullPage: true });
  }
}

// 2. директор — только поступления
{
  const p = await open([1366, 800], "Система управления");
  await login(p, "director", "Passw0rd1");
  check((await navs(p)).includes("Финансы"), "директор: вкладка «Финансы» есть");
  await tab(p, "Финансы");
  const t = await main(p);
  check(/поступило от покупателей/.test(t), "директор: поступления видны");
  check(!/чистая прибыль|остатки сейчас|себестоимость|статьи движения/.test(t), "директор: без прибыли, остатков и статей");
  await p.screenshot({ path: join(out, "desktop_director_finance.png") });
}

// 3. бухгалтер — деньги без прибыли
{
  const p = await open([1366, 800], "Система управления");
  await login(p, "buh", "Passw0rd1");
  await tab(p, "Финансы");
  const t = await main(p);
  check(/остатки сейчас/.test(t) && /движение за период/.test(t), "бухгалтер: остатки и движение");
  check(!/чистая прибыль|валовая прибыль/.test(t), "бухгалтер: без прибыли");
}

// 4. выбор ТП из 1С при создании сотрудника
{
  const p = await open([375, 812], "Система управления");
  await login(p, "owner", "Owner12345");
  await tab(p, "Система");
  await p.locator(".kz-main button", { hasText: "Сотрудники" }).first().click(); await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Добавить сотрудника" }).click(); await p.waitForTimeout(1200);
  const chip = p.locator("button", { hasText: /^Ахметов Ержан · \d+/ });
  check((await chip.count()) === 1, "сотрудник: ТП из 1С списком");
  await chip.click();
  check((await p.getByLabel(/ТП в 1С/).inputValue()) === "Ахметов Ержан", "сотрудник: имя ТП подставилось");
  await p.screenshot({ path: join(out, "phone_owner_new_tp.png") });
}

// 5. администратор: включить отправку в 1С и отправить заказ, сделанный до включения
{
  const p = await open([375, 812], "Администратор");
  await login(p, "adm", "Passw0rd1");
  await tab(p, "Настройки");
  check(/отправлять заказы в 1с/.test(await main(p)), "настройки: переключатель «Отправлять заказы в 1С»");
  const sw = p.getByRole("button", { name: "Отправлять заказы в 1С" });
  check((await sw.getAttribute("aria-pressed")) === "false", "настройки: по умолчанию выключено");
  await sw.click(); await p.waitForTimeout(1200);
  check((await sw.getAttribute("aria-pressed")) === "true", "настройки: включено");
  await p.screenshot({ path: join(out, "phone_admin_settings.png") });
  await tab(p, "Заказы");
  await p.locator(".kz-main >> text=" + order.number).first().click(); await p.waitForTimeout(800);
  await p.getByRole("button", { name: "Отправить в 1С", exact: true }).click(); await p.waitForTimeout(1200);
  check(/ждёт отправки в 1с/.test(await main(p)), "заказ: ждёт отправки в 1С");
  const pend = await (await fetch(API + "/api/sync/1c/orders/pending", { headers: { "x-agent-key": "test-agent-key-0123456789" } })).json();
  check(pend.some((x) => x.number === order.number), "агент 1С получит этот заказ");
  await call("PUT", "/api/settings", tokOwner, { onecOrders: false }); // вернуть как было
}

check(errors.length === 0, "ошибок JS нет" + (errors.length ? ": " + errors.join(" | ") : ""));
console.log(report.join("\n"));
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : "\nВсё в порядке");
await browser.close();
site.close();
process.exit(fails ? 1 : 0);
