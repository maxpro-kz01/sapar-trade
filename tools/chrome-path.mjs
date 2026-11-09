// Путь к Chromium для Playwright в этой среде (папка версии меняется при обновлении браузеров).
import { readdirSync, existsSync } from "node:fs";

const base = "/opt/pw-browsers";
export const chromePath = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
  .flatMap((d) => ["chrome-linux64", "chrome-linux"].map((sub) => `${base}/${d}/${sub}/chrome`))
  .find((p) => existsSync(p));
