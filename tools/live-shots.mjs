// Проверка рабочего режима (данные 1С) в браузере: вход разными ролями, все вкладки, телефон и компьютер.
// Нужен локальный сервер: cd server && npm run dev:local && node scripts/seed-local.js
// Сайт собрать с локальным API: ST_API_URL=http://127.0.0.1:3999 node build.mjs
// Запуск: node tools/live-shots.mjs [папка]
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] || join(root, "shots", "live");
mkdirSync(out, { recursive: true });
const local = {
  "react.production.min.js": "node_modules/react/umd/react.production.min.js",
  "react-dom.production.min.js": "node_modules/react-dom/umd/react-dom.production.min.js",
  "leaflet.min.js": "node_modules/leaflet/dist/leaflet.js",
  "leaflet.min.css": "node_modules/leaflet/dist/leaflet.css",
};
const site = createServer((req, res) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.end(readFileSync(join(root, "public/index.html"))); });
await new Promise((ok) => site.listen(8080, "127.0.0.1", ok));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [], report = [];
let fails = 0;
const check = (ok, msg) => { report.push((ok ? "✓ " : "✗ ") + msg); if (!ok) fails++; };

async function open(vp) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    const hit = Object.keys(local).find((k) => url.endsWith(k));
    if (hit) return route.fulfill({ body: readFileSync(join(root, local[hit])), contentType: hit.endsWith(".css") ? "text/css" : "application/javascript" });
    if (url.startsWith("http://127.0.0.1")) return route.continue();
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto("http://127.0.0.1:8080/#work");
  return page;
}
async function login(page, l, p) {
  await page.getByLabel("Логин").fill(l);
  await page.getByLabel("Пароль").fill(p);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForSelector(".kz-nav");
  await page.waitForTimeout(500);
}
const overflow = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  return [...document.querySelectorAll("#root *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 2 && !e.closest(".overflow-x-auto, .kz-nav"); }).length;
});
const tab = async (page, name) => { await page.locator(".kz-nav-item", { hasText: name }).click(); await page.waitForTimeout(500); };
const text = (page) => page.locator(".kz-main").innerText();

for (const [size, vp] of [["phone", [375, 812]], ["desktop", [1366, 800]]]) {
  const page = await open(vp);
  // неверный пароль
  await page.getByLabel("Логин").fill("owner"); await page.getByLabel("Пароль").fill("wrong-pass1");
  await page.getByRole("button", { name: "Войти" }).click(); await page.waitForTimeout(400);
  check((await page.locator("text=Неверный логин или пароль").count()) === 1, `${size}: неверный пароль → сообщение`);
  await page.screenshot({ path: join(out, `${size}_00_login.png`) });
  await login(page, "owner", "Owner12345");
  for (const [i, t] of ["Главная", "Продажи", "Склад", "Клиенты", "Интеграция 1С", "Сотрудники"].entries()) {
    await tab(page, t);
    const ov = await overflow(page);
    check(ov === 0, `${size} владелец «${t}»: без горизонтальной прокрутки (${ov})`);
    await page.screenshot({ path: join(out, `${size}_0${i + 1}_owner_${t}.png`), fullPage: false });
  }
  await tab(page, "Главная");
  const home = await text(page);
  check(/Валовая прибыль/.test(home) && /Себестоимость/.test(home) && /Маржа/.test(home), `${size}: владелец видит валовую, себестоимость, маржу`);
  check(/Обновлено/.test(home), `${size}: плашка свежести данных`);
  await tab(page, "Продажи");
  await page.getByRole("button", { name: "По товарам" }).click(); await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, `${size}_08_owner_sales_products.png`) });
  // выход
  await page.locator('button[title="Выйти"]').click(); await page.waitForTimeout(300);
  check((await page.locator(".kz-nav-item", { hasText: "Интеграция 1С" }).count()) === 0, `${size}: выход работает`);

  if (size === "phone") {
    let p2 = await open(vp);
    await login(p2, "director", "Passw0rd1");
    const dh = await text(p2);
    check(/Маржа/.test(dh) && !/Себестоимость|Валовая/.test(dh), "директор: маржа есть, себестоимости и валовой нет");
    await tab(p2, "Продажи");
    check(!/валовая/i.test(await text(p2)), "директор: в продажах нет валовой");
    await p2.screenshot({ path: join(out, `phone_10_director_sales.png`) });
    check((await p2.locator(".kz-nav-item", { hasText: "Сотрудники" }).count()) === 0, "директор: нет вкладки «Сотрудники»");

    p2 = await open(vp);
    await login(p2, "tp1", "Passw0rd1");
    const navs = await p2.locator(".kz-nav-item").allInnerTexts();
    check(navs.join(",") === "Главная,Продажи,Клиенты", "ТП: вкладки " + navs.join(","));
    check(!/Маржа|Склад по цене/.test(await text(p2)), "ТП: без маржи и склада");
    await tab(p2, "Клиенты");
    const ct = await text(p2);
    check(!/Иванов Пётр/.test(ct) && /Ахметов Ержан/.test(ct), "ТП: только свои клиенты");
    await p2.screenshot({ path: join(out, `phone_11_tp_clients.png`) });

    p2 = await open(vp);
    await login(p2, "sklad", "Passw0rd1");
    const sn = await p2.locator(".kz-nav-item").allInnerTexts();
    check(sn.join(",") === "Главная,Склад", "склад: вкладки " + sn.join(","));
    await tab(p2, "Склад");
    await p2.getByPlaceholder("Товар, артикул или код").fill("Чай"); await p2.waitForTimeout(900);
    const st = await text(p2);
    check(/Чай/.test(st) && !/Мука/.test(st), "склад: поиск работает");
    await p2.screenshot({ path: join(out, `phone_12_sklad_search.png`) });

    // сессия переживает перезагрузку вкладки
    await p2.reload(); await p2.waitForTimeout(800);
    check((await p2.locator(".kz-nav-item", { hasText: "Склад" }).count()) === 1, "сессия сохраняется при обновлении страницы");
  }
}
await browser.close();
site.close();
console.log(report.join("\n"));
console.log("Ошибки JS:", errors.length ? errors.slice(0, 5) : "нет");
process.exit(fails || errors.length ? 1 : 0);
