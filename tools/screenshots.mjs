// Скриншоты сайта на разных размерах экрана (для проверки адаптивности).
// Запуск: node tools/screenshots.mjs [выходная_папка]
// React / ReactDOM / Leaflet подставляются из node_modules вместо CDN, тайлы карты и шрифты блокируются.

import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] || join(root, "shots");
mkdirSync(out, { recursive: true });

const local = {
  "react.production.min.js": "node_modules/react/umd/react.production.min.js",
  "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js",
  "leaflet.min.js": "node_modules/leaflet/dist/leaflet.js",
  "leaflet.min.css": "node_modules/leaflet/dist/leaflet.css",
};

const SIZES = { phone: [375, 812], tablet: [768, 1024], laptop: [1366, 768], desktop: [1920, 1080] };
const only = process.env.SIZES ? process.env.SIZES.split(",") : Object.keys(SIZES);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const report = [];

async function newPage([w, h], hash = "") {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    const hit = Object.keys(local).find((k) => url.endsWith(k));
    if (hit) return route.fulfill({ body: readFileSync(join(root, local[hit])), contentType: hit.endsWith(".css") ? "text/css" : "application/javascript" });
    if (url.startsWith("file:")) return route.continue();
    return route.fulfill({ status: 204, body: "" }); // шрифты, тайлы
  });
  await page.goto(pathToFileURL(join(root, "public/index.html")).href + hash);
  await page.waitForTimeout(400);
  return page;
}

const click = (page, text) => page.getByText(text, { exact: true }).first().click();
const dbl = async (page) => { const b = page.locator('button:has([aria-label="Sapar Trade"]), button:has(img)').first(); await b.click(); await b.click(); await page.waitForTimeout(150); };

async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    return [...document.querySelectorAll("#root *")]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 2 && !e.closest(".overflow-x-auto, .kz-nav, .leaflet-container"); })
      .length;
  });
}

async function shot(page, size, name) {
  await page.waitForTimeout(250);
  const ov = await overflow(page);
  report.push(`${size.padEnd(8)} ${name.padEnd(22)} вылезает за экран: ${ov}`);
  await page.screenshot({ path: join(out, `${size}_${name}.png`) });
}

for (const size of only) {
  const vp = SIZES[size];
  // Сотрудники (стартовый экран)
  let p = await newPage(vp);
  await shot(p, size, "00_staff_gate");
  // Клиент (по ссылке #client)
  p = await newPage(vp, "#client");
  await shot(p, size, "01_login");
  await p.fill('input[placeholder="7XX XXX XX XX"]', "7011234567");
  await click(p, "Получить код");
  await p.fill('input[placeholder="••••"]', "1234");
  await click(p, "Подтвердить");
  await p.fill('input[placeholder="Например, Азамат"]', "Азамат");
  await click(p, "Продолжить");
  await shot(p, size, "02_client_home");

  // Админ
  p = await newPage(vp);
  await click(p, "Администратор");
  const ins = p.locator("input");
  await ins.nth(0).fill("admin"); await ins.nth(1).fill("admin");
  await click(p, "Войти");
  await shot(p, size, "03_admin_shift");
  await click(p, "Заказы"); await shot(p, size, "04_admin_orders");
  await click(p, "Склад"); await shot(p, size, "05_admin_stock");

}

await browser.close();
console.log(report.join("\n"));
console.log("Ошибки JS:", errors.length ? errors.slice(0, 5) : "нет");
