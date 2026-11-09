// Проверка GPS экспедиторов в браузере: водитель (телефон, геолокация подменена) и карта у владельца/директора.
// Нужен локальный сервер (npm run dev:local в server/ + node scripts/seed-local.js). Запуск: node tools/fleet-shots.mjs [папка]
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { chromePath } from "./chrome-path.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] || join(root, "shots", "fleet");
mkdirSync(out, { recursive: true });
const local = {
  "react.production.min.js": "node_modules/react/umd/react.production.min.js",
  "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js",
  "leaflet.min.js": "node_modules/leaflet/dist/leaflet.js",
  "leaflet.min.css": "node_modules/leaflet/dist/leaflet.css",
};
// серая плитка вместо OpenStreetMap (в тестовой среде нет выхода в интернет)
const TILE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN89+7dfwAJWAPXLC5sXQAAAABJRU5ErkJggg==", "base64");
const site = createServer((req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(readFileSync(join(root, "public/index.html"))); });
await new Promise((ok) => site.listen(8080, "127.0.0.1", ok));
const browser = await chromium.launch({ executablePath: chromePath });
const errors = [], report = [];
let fails = 0;
const check = (ok, msg) => { report.push((ok ? "✓ " : "✗ ") + msg); if (!ok) fails++; };
const KZO = { latitude: 44.8488, longitude: 65.4823 };

async function open(vp, button, geo) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, ...(geo ? { geolocation: { ...geo, accuracy: 9 }, permissions: ["geolocation"] } : {}) });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("dialog", (d) => d.accept());
  await page.route("**/*", (route) => {
    const url = route.request().url();
    const hit = Object.keys(local).find((k) => url.endsWith(k));
    if (hit) return route.fulfill({ body: readFileSync(join(root, local[hit])), contentType: hit.endsWith(".css") ? "text/css" : "application/javascript" });
    if (url.includes("tile.openstreetmap.org")) return route.fulfill({ body: TILE, contentType: "image/png" });
    if (url.startsWith("http://127.0.0.1")) return route.continue();
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto("http://127.0.0.1:8080/");
  await page.getByText(button, { exact: true }).click();
  return { page, ctx };
}
async function login(page, l, p) {
  await page.getByLabel("Логин").fill(l); await page.getByLabel("Пароль").fill(p);
  await page.getByRole("button", { name: "Войти" }).click(); await page.waitForTimeout(1200);
}
const overflow = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  return [...document.querySelectorAll("#root *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 2 && !e.closest(".overflow-x-auto, .kz-nav, .leaflet-container"); }).length;
});
const tab = async (page, name) => { await page.locator(".kz-nav-item", { hasText: name }).first().click(); await page.waitForTimeout(1500); };
const body = (page) => page.locator("body").innerText();
const navs = (page) => page.locator(".kz-nav-item .kz-nav-label").allInnerTexts();

// 1. не водитель не может войти как водитель
let { page: p } = await open([375, 812], "Водитель-экспедитор");
await login(p, "sklad", "Passw0rd1");
check(/недоступен/.test(await body(p)), "склад не может войти как водитель");

// 2. водитель: начать рейс, проехать, точки ушли
const drv = await open([375, 812], "Водитель-экспедитор", KZO);
const d = drv.page;
await login(d, "drv1", "Passw0rd1");
check(/Рейс не начат/.test(await body(d)), "водитель: рейс не начат");
await d.screenshot({ path: join(out, "phone_driver_01_idle.png") });
await d.getByRole("button", { name: "Начать рейс" }).click();
await d.waitForTimeout(2500);
check(/Рейс идёт/.test(await body(d)), "водитель: рейс идёт");
for (let i = 1; i <= 3; i++) { // едем на восток примерно по 150 м
  await drv.ctx.setGeolocation({ latitude: KZO.latitude, longitude: KZO.longitude + i * 0.0019, accuracy: 9 });
  await d.waitForTimeout(5600);
}
await d.evaluate(() => window.dispatchEvent(new Event("online"))); // отправить, не дожидаясь 30 с
await d.waitForTimeout(2000);
const dt = await body(d);
check(/Отправлено\s*\n?\s*\d\d:\d\d/.test(dt), "водитель: точки отправлены");
check(/Ждут отправки\s*\n?\s*0/.test(dt), "водитель: очередь пустая");
check(/Пройдено\s*\n?\s*0,[3-5] км/.test(dt), "водитель: пробег ≈ 0,45 км — " + (dt.match(/Пройдено\s*\n?\s*([^\n]+)/) || [])[1]);
check((await overflow(d)) === 0, "водитель: без прокрутки вбок");
await d.screenshot({ path: join(out, "phone_driver_02_trip.png") });

// 3. владелец видит карту
for (const [size, vp] of [["desktop", [1366, 800]], ["phone", [375, 812]]]) {
  const { page: o } = await open(vp, "Система управления");
  await login(o, "owner", "Owner12345");
  check((await navs(o)).includes("Экспедиторы"), `${size} владелец: вкладка Экспедиторы`);
  await tab(o, "Экспедиторы");
  await o.waitForTimeout(1500);
  const t = await body(o);
  check(await o.locator(".leaflet-container").count() === 1, `${size} владелец: карта загрузилась`);
  check(await o.locator(".leaflet-marker-icon").count() === 1, `${size} владелец: одна машина на карте`);
  check(/Серик Алимов[\s\S]*Сигнал есть/.test(t), `${size} владелец: Серик в рейсе, сигнал есть`);
  check(/Бауржан Нуров[\s\S]*Не в рейсе/.test(t), `${size} владелец: Бауржан не в рейсе`);
  await o.locator("[data-testid=fleet-driver]", { hasText: "Серик" }).click();
  await o.waitForTimeout(1500);
  const t2 = await body(o);
  check(/Маршрут: Серик Алимов/.test(t2) && /Точек на карте\s*\n?\s*[2-9]/.test(t2), `${size} владелец: маршрут за день`);
  check(await o.locator("path.leaflet-interactive").count() >= 1, `${size} владелец: линия маршрута на карте`);
  check((await overflow(o)) === 0, `${size} владелец: без прокрутки вбок`);
  await o.screenshot({ path: join(out, `${size}_owner_fleet.png`), fullPage: size === "phone" });
}

// 4. директор видит, склад — нет
let { page: dir } = await open([1366, 800], "Система управления");
await login(dir, "director", "Passw0rd1");
check((await navs(dir)).includes("Экспедиторы"), "директор: вкладка есть");
let { page: sk } = await open([1366, 800], "Система управления");
await login(sk, "sklad", "Passw0rd1");
check(!(await navs(sk)).includes("Экспедиторы"), "склад: вкладки нет");

// 5. водитель завершает рейс
await d.getByRole("button", { name: "Завершить рейс" }).click();
await d.waitForTimeout(2000);
check(/Рейс не начат/.test(await body(d)), "водитель: рейс завершён");
const { page: o2 } = await open([1366, 800], "Система управления");
await login(o2, "owner", "Owner12345");
await tab(o2, "Экспедиторы");
check(/Серик Алимов[\s\S]*Не в рейсе/.test(await body(o2)), "владелец: после завершения — не в рейсе");

check(errors.length === 0, "ошибок JS нет" + (errors.length ? ": " + errors.join(" | ") : ""));
console.log(report.join("\n"));
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : "\nВсё в порядке");
await browser.close();
site.close();
process.exit(fails ? 1 : 0);
