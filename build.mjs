// Sapar Trade — сборка сайта из модулей.
// src/modules.json        — порядок модулей (глобальный скрипт, без import/export)
// src/**/*.jsx            — исходники (у каждого 2 строки шапки + пустая строка)
// styles/*.css            — стили (base.css, затем responsive.css)
// src/index.template.html — HTML-шаблон с метками /*__STYLES__*/ и /*__APP__*/
// ST_API_URL             — адрес API (по умолчанию https://sapar-trade-api.onrender.com)
// Результат: public/index.html (JSX скомпилирован заранее, Babel в браузере не нужен).
//
// Запуск: npm ci && node build.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

const order = JSON.parse(read("src/modules.json"));
const source = order
  .map((file) => {
    const text = read(join("src", file));
    const body = text.split("\n").slice(3).join("\n"); // убрать шапку модуля
    return body.endsWith("\n") ? body.slice(0, -1) : body;
  })
  .join("\n");

const { code } = transformSync(source, {
  presets: [["@babel/preset-react", { runtime: "classic" }]],
  babelrc: false,
  configFile: false,
  comments: false,
  filename: "sapar-trade.jsx",
});

const styles = ["styles/base.css", "styles/responsive.css"]
  .filter((p) => existsSync(join(root, p)))
  .map(read)
  .join("\n");

// Адрес API-сервера рабочего режима (можно переопределить: ST_API_URL=http://127.0.0.1:3999 node build.mjs)
const apiUrl = process.env.ST_API_URL || "https://sapar-trade-api.onrender.com";

const html = read("src/index.template.html")
  .replace("__ST_API__", () => apiUrl)
  .replace("/*__STYLES__*/", () => styles)
  .replace("/*__APP__*/", () => code.replace(/<\/script/gi, "<\\/script"));

mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public/index.html"), html);
console.log(`public/index.html собран: ${order.length} модулей, ${(html.length / 1024).toFixed(0)} КБ`);
