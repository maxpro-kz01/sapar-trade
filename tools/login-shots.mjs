// Проверка «вход без выхода» (TZ_APP_LOGIN_PRICES, часть B): вход переживает перезапуск браузера,
// тихо обновляется после истечения токена доступа, «Выйти» стирает вход, закрытый на сервере вход выкидывает на экран входа.
// Запуск (нужен локальный сервер + seed): node tools/login-shots.mjs
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromePath } from "./chrome-path.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const local = { "react.production.min.js": "node_modules/react/umd/react.production.min.js", "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js" };
const site = createServer((req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(readFileSync(join(root, "public/index.html"))); });
await new Promise((ok) => site.listen(8080, "127.0.0.1", ok));
const browser = await chromium.launch({ executablePath: chromePath });
const errors = [];
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "✓ " : "✗ ") + msg); if (!ok) fails++; };

const newPage = async (ctx) => {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    const hit = Object.keys(local).find((k) => url.endsWith(k));
    if (hit) return route.fulfill({ body: readFileSync(join(root, local[hit])), contentType: "application/javascript" });
    if (url.startsWith("http://127.0.0.1")) return route.continue();
    return route.fulfill({ status: 204, body: "" });
  });
  return page;
};
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("st.session") || "null"));
const onLoginForm = (page) => page.getByLabel("Логин").count().then((n) => n > 0);

const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
let page = await newPage(ctx);
await page.goto("http://127.0.0.1:8080/");
await page.getByText("Торговый представитель", { exact: true }).click();
await page.getByLabel("Логин").fill("tp1"); await page.getByLabel("Пароль").fill("Passw0rd1");
await page.getByRole("button", { name: "Войти" }).click(); await page.waitForTimeout(1200);
let s = await stored(page);
check(!!(s && s.token && s.refreshToken), "после входа токены лежат на устройстве (localStorage)");
check((await page.locator(".kz-nav-item").count()) > 0, "ТП внутри программы");

// «перезапуск браузера»: новая вкладка в том же профиле, вкладка sessionStorage пустая
await page.close();
page = await newPage(ctx);
await page.goto("http://127.0.0.1:8080/");
await page.waitForTimeout(1200);
check(!(await onLoginForm(page)) && (await page.locator(".kz-nav-item").count()) > 0, "после перезапуска вход не просят");

// токен доступа истёк: подменяем на негодный — программа сама обновляет по токену входа
await page.evaluate(() => { const v = JSON.parse(localStorage.getItem("st.session")); v.token = "истёк.токен.доступа"; localStorage.setItem("st.session", JSON.stringify(v)); });
await page.reload(); await page.waitForTimeout(1800);
const s2 = await stored(page);
check(!(await onLoginForm(page)) && (await page.locator(".kz-nav-item").count()) > 0, "доступ истёк — программа тихо обновила его, вход не просят");
check(!!s2 && s2.token !== "истёк.токен.доступа", "новый токен доступа сохранён");

// «Мои устройства» в профиле
await page.getByTitle("Сменить пароль").click(); await page.waitForTimeout(900);
check(/Мои устройства/.test(await page.locator("body").innerText()) && /это устройство/.test(await page.locator("body").innerText()), "в профиле виден список устройств");
await page.screenshot({ path: "/tmp/login-devices.png" });
await page.keyboard.press("Escape");
await page.reload(); await page.waitForTimeout(1200);

// «Выйти» стирает вход
await page.getByTitle("Выйти").click(); await page.waitForTimeout(900);
check((await stored(page)) === null, "«Выйти» стёрло вход с устройства");
await page.reload(); await page.waitForTimeout(900);
check(!(await page.locator(".kz-nav-item").count()), "после выхода и перезагрузки — снова экран входа");

// вход закрыт на сервере (например, владелец нажал «Выйти везде») — программа выходит на экран входа
await page.getByText("Торговый представитель", { exact: true }).click();
await page.getByLabel("Логин").fill("tp1"); await page.getByLabel("Пароль").fill("Passw0rd1");
await page.getByRole("button", { name: "Войти" }).click(); await page.waitForTimeout(1200);
s = await stored(page);
await page.evaluate(async (rt) => { await fetch("http://127.0.0.1:3999/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: rt }) }); }, s.refreshToken);
await page.evaluate(() => { const v = JSON.parse(localStorage.getItem("st.session")); v.token = "x.y.z"; localStorage.setItem("st.session", JSON.stringify(v)); });
await page.reload(); await page.waitForTimeout(1800);
check(await onLoginForm(page), "вход закрыт на сервере — показан экран входа");
check(/Сессия завершена|закрыт/.test(await page.locator("body").innerText()), "человеку сказано, что вход завершён");

check(errors.length === 0, "ошибок JS нет " + errors.join(" | "));
await browser.close(); site.close();
console.log(fails ? `\nПРОВАЛОВ: ${fails}` : "\nВсё в порядке");
process.exit(fails ? 1 : 0);
