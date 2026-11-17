// Проверка установки (TZ_APP_LOGIN_PRICES, часть A): манифест и значки на месте, сервис-воркер встаёт,
// страница открывается без связи, данные (/api) не кэшируются, кнопка «Установить приложение» работает.
// Запуск: node build.mjs && node tools/pwa-shots.mjs
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { chromePath } from "./chrome-path.mjs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const site = createServer((req, res) => {
  const path = req.url.split("?")[0];
  const file = join(root, "public", path === "/" ? "index.html" : path);
  if (existsSync(file) && !file.endsWith("/public/")) { res.setHeader("content-type", types[extname(file)] || "text/plain"); return res.end(readFileSync(file)); }
  res.statusCode = 404; res.end("нет");
});
await new Promise((ok) => site.listen(8080, "127.0.0.1", ok));
const browser = await chromium.launch({ executablePath: chromePath });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "allow" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 204, body: "" })); // внешние адреса (шрифты) глушим
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "✓ " : "✗ ") + msg); if (!ok) fails++; };

const man = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));
check(man.display === "standalone" && man.icons.some((i) => i.sizes === "512x512") && man.icons.some((i) => i.purpose === "maskable"), "манифест: standalone, значки 192/512 и maskable");
for (const i of man.icons) check(existsSync(join(root, "public", i.src)), "значок есть: " + i.src);
check(existsSync(join(root, "public/icons/apple-touch-icon.png")), "значок для iPhone есть");

await page.goto("http://127.0.0.1:8080/");
await page.waitForTimeout(800);
check(await page.locator('link[rel="manifest"]').count() === 1, "страница ссылается на манифест");
check(/Установить приложение/.test(await page.locator("body").innerText()), "на стартовом экране есть блок «Установить приложение»");

const swReady = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
check(swReady, "сервис-воркер установлен и активен");
await page.reload(); await page.waitForTimeout(800);
check(await page.evaluate(() => !!navigator.serviceWorker.controller), "воркер управляет страницей");

// кэш: только оболочка, ни одного адреса /api
const cached = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; });
console.log("   кэш:", cached.join(" , "));
check(cached.some((u) => u.endsWith("/")), "оболочка (страница) сохранена для работы без связи");
check(!cached.some((u) => /\/api\//.test(u)), "в кэше нет данных /api");

// без связи страница открывается
await ctx.setOffline(true);
await page.goto("http://127.0.0.1:8080/").catch(() => {});
await page.waitForTimeout(800);
console.log("   офлайн, текст:", (await page.locator("body").innerText().catch((e) => "ERR " + e.message)).slice(0, 80));
check(/Вход для сотрудников/.test(await page.locator("body").innerText()), "без связи программа открывается");
await ctx.setOffline(false);

// кнопка установки: имитируем событие браузера
await page.goto("http://127.0.0.1:8080/"); await page.waitForTimeout(600);
await page.evaluate(() => { const e = new Event("beforeinstallprompt"); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: "accepted" }); window.dispatchEvent(e); });
await page.waitForTimeout(300);
const btn = page.getByRole("button", { name: "Установить приложение" });
check(await btn.count() === 1, "браузер разрешил установку — показана кнопка");
await page.screenshot({ path: "/tmp/pwa-gate.png" });
await btn.click(); await page.waitForTimeout(300);
check(await page.evaluate(() => window.__prompted === true), "кнопка вызывает окно установки браузера");
check(await page.getByRole("button", { name: "Установить приложение" }).count() === 0, "после установки кнопка пропала");

// iPhone: подсказка про «Поделиться»
const ios = await browser.newContext({ viewport: { width: 375, height: 812 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
const ip = await ios.newPage();
await ip.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.fulfill({ status: 204, body: "" }));
await ip.goto("http://127.0.0.1:8080/"); await ip.waitForTimeout(600);
check(/Поделиться/.test(await ip.locator("body").innerText()), "iPhone: подсказка «Поделиться → На экран Домой»");

check(errors.length === 0, "ошибок JS нет " + errors.join(" | "));
await browser.close(); site.close();
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : "\nВсё в порядке");
process.exit(fails ? 1 : 0);
