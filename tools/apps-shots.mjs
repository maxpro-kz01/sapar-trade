// Проверка админ-панели и приложения ТП на реальных данных (локальный сервер + seed-local.js).
// Запуск: node tools/apps-shots.mjs [папка]
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] || join(root, "shots", "apps");
mkdirSync(out, { recursive: true });
const local = { "react.production.min.js": "node_modules/react/umd/react.production.min.js", "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js" };
const site = createServer((req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(readFileSync(join(root, "public/index.html"))); });
await new Promise((ok) => site.listen(8080, "127.0.0.1", ok));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [], report = [];
let fails = 0;
const check = (ok, msg) => { report.push((ok ? "✓ " : "✗ ") + msg); if (!ok) fails++; };

async function open(vp, button) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("dialog", (d) => d.accept());
  ctx.on("page", (pg) => { if (pg !== page) pg.close().catch(() => {}); });
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
  await page.getByRole("button", { name: "Войти" }).click(); await page.waitForTimeout(1000);
}
const overflow = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  return [...document.querySelectorAll("#root *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 2 && !e.closest(".overflow-x-auto, .kz-nav"); }).length;
});
const tab = async (page, name) => { await page.locator(".kz-nav-item", { hasText: name }).first().click(); await page.waitForTimeout(800); };
const text = (page) => page.locator(".kz-main").innerText();
const navs = (page) => page.locator(".kz-nav-item .kz-nav-label").allInnerTexts();

let p = await open([375, 812], "Торговый представитель");
await login(p, "sklad", "Passw0rd1");
check(/недоступен/.test(await p.locator("body").innerText()), "склад не может войти как ТП");

for (const [size, vp] of [["phone", [375, 812]], ["desktop", [1366, 800]]]) {
  p = await open(vp, "Торговый представитель");
  await login(p, "tp1", "Passw0rd1");
  check((await navs(p)).join(",") === "Магазины,Мои заказы,Мой план", `${size} ТП: вкладки`);
  const st = await text(p);
  check(/Магазин «/.test(st), `${size} ТП: свои магазины`);
  await p.screenshot({ path: join(out, `${size}_tp_01_stores.png`) });
  check((await overflow(p)) === 0, `${size} ТП магазины: без прокрутки вбок`);
  if (size === "phone") {
    await p.locator(".kz-main >> text=Заказ ›").first().click(); await p.waitForTimeout(1200);
    await p.getByPlaceholder("Поиск товара").fill("Чай"); await p.waitForTimeout(600);
    const rows = p.locator(".kz-main .flex.items-center.gap-2.py-2");
    await rows.nth(0).locator("button").last().click(); await p.waitForTimeout(100);
    await rows.nth(0).locator("button").last().click();
    await rows.nth(1).locator("button").last().click();
    await p.waitForTimeout(300);
    await p.screenshot({ path: join(out, `phone_tp_02_order.png`) });
    check((await overflow(p)) === 0, "ТП заказ: без прокрутки вбок");
    await p.locator("text=поз. · оформить").click(); await p.waitForTimeout(500);
    await p.getByLabel("Комментарий").fill("до обеда");
    await p.screenshot({ path: join(out, `phone_tp_03_confirm.png`) });
    await p.getByRole("button", { name: "Отправить заказ" }).click(); await p.waitForTimeout(1500);
    const ot = await text(p);
    check(/СТ-\d{6}/.test(ot) && /ждёт отправки в 1С/.test(ot), "ТП: заказ отправлен и виден в «Мои заказы»");
    await p.screenshot({ path: join(out, `phone_tp_04_orders.png`) });
  }
  await tab(p, "Мой план");
  const pt = await text(p);
  check(/Ахметов Ержан/.test(pt) && !/Иванов Пётр/.test(pt), `${size} ТП: свой план`);
  await p.screenshot({ path: join(out, `${size}_tp_05_plan.png`) });

  p = await open(vp, "Администратор");
  await login(p, "adm", "Passw0rd1");
  check((await navs(p)).join(",") === "Смена,Заказы,Склад,Сотрудники,Настройки", `${size} админ: вкладки`);
  if (size === "phone") {
    await p.getByRole("button", { name: "Начать работу" }).click(); await p.waitForTimeout(1000);
    check(/смена идёт/.test(await text(p)), "админ: смена начата");
  }
  await p.screenshot({ path: join(out, `${size}_adm_01_shift.png`) });
  await tab(p, "Заказы");
  await p.locator(".kz-main").getByRole("button", { name: "Все" }).click(); await p.waitForTimeout(400);
  check(/СТ-\d{6}/.test(await text(p)), `${size} админ: видит заказ ТП`);
  if (size === "phone") {
    await p.locator(".kz-main").getByRole("button", { name: /Новые/ }).click(); await p.waitForTimeout(300);
    await p.locator(".kz-main").getByText(/СТ-\d{6}/).first().click(); await p.waitForTimeout(500);
    await p.getByRole("button", { name: "Принять" }).click(); await p.waitForTimeout(1000);
    await p.locator(".kz-main").getByRole("button", { name: /В работе/ }).click(); await p.waitForTimeout(500);
    check(/Принят/.test(await text(p)), "админ: заказ принят");
  }
  await p.screenshot({ path: join(out, `${size}_adm_02_orders.png`) });
  for (const t of ["Склад", "Сотрудники", "Настройки"]) {
    await tab(p, t);
    check((await overflow(p)) === 0 && !/Ошибка сервера|Нет доступа/.test(await text(p)), `${size} админ «${t}»`);
    await p.screenshot({ path: join(out, `${size}_adm_${t}.png`) });
  }
  if (size === "phone") {
    await tab(p, "Смена");
    await p.getByRole("button", { name: "Завершить работу" }).click(); await p.waitForTimeout(1800);
    const rep = await p.locator(".kz-modal").innerText();
    check(/ОТЧЁТ ЗА СМЕНУ/.test(rep) && /ЗАКАЗЫ В ПРИЛОЖЕНИИ: \d+/.test(rep) && /ПРОДАЖИ ЗА ДЕНЬ ПО 1С/.test(rep), "админ: отчёт смены с заказами и продажами 1С");
    check((await p.getByRole("button", { name: "Отправить директору в WhatsApp" }).count()) === 1, "админ: кнопка WhatsApp");
    await p.screenshot({ path: join(out, `phone_adm_03_report.png`) });
  }
}
await browser.close(); site.close();
console.log(report.join("\n"));
console.log("Ошибки JS:", errors.length ? errors.slice(0, 8) : "нет");
process.exit(fails || errors.length ? 1 : 0);
