// Проверка плашки «Вышла новая версия сайта»: при проверке сервер отдаёт страницу с другой версией (st-build) —
// должна появиться плашка, кнопка перезагружает страницу. Запуск: node build.mjs && node tools/version-shots.mjs
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromePath } from "./chrome-path.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "public/index.html"), "utf8");
const ver = (html.match(/<meta name="st-build" content="([0-9a-f]{12})"/) || [])[1];
let served = html; // что отдаёт «сервер» сейчас
const site = createServer((req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(served); });
await new Promise((ok) => site.listen(8080, "127.0.0.1", ok));
const local = { "react.production.min.js": "node_modules/react/umd/react.production.min.js", "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js" };
const browser = await chromium.launch({ executablePath: chromePath });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.route("**/*", (route) => {
  const url = route.request().url();
  const hit = Object.keys(local).find((k) => url.endsWith(k));
  if (hit) return route.fulfill({ body: readFileSync(join(root, local[hit])), contentType: "application/javascript" });
  if (url.startsWith("http://127.0.0.1")) return route.continue();
  return route.fulfill({ status: 204, body: "" });
});
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "✓ " : "✗ ") + msg); if (!ok) fails++; };
const visible = () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

await page.goto("http://127.0.0.1:8080/");
check(!!ver, "страница собрана с версией " + ver);
await visible(); await page.waitForTimeout(800);
check(await page.getByTestId("new-version").count() === 0, "та же версия — плашки нет");
served = html.replace(`content="${ver}"`, 'content="bbbbbbbbbbbb"'); // вышла новая версия
await visible(); await page.waitForTimeout(800);
check(await page.getByTestId("new-version").count() === 1, "новая версия — плашка «Вышла новая версия сайта»");
await page.screenshot({ path: "/tmp/version-bar.png" });
await page.getByRole("button", { name: "Обновить" }).click();
await page.waitForTimeout(1500);
check(await page.getByTestId("new-version").count() === 0, "после «Обновить» — новая версия, плашки нет");
check(errors.length === 0, "ошибок JS нет " + errors.join(" | "));
await browser.close(); site.close();
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : "\nВсё в порядке");
process.exit(fails ? 1 : 0);
