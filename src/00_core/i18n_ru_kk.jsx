// Sapar Trade — прототип. Модуль: Движок перевода RU/ҚАЗ + переключатель языка
// Строки 242–330 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== LANGUAGE: RU / ҚАЗ ============================== */
// Весь интерфейс пишется на русском, а казахский включается переводчиком поверх DOM:
// словарь KK_DICT (русская фраза → казахская) применяется к видимому тексту и
// placeholder-ам. Оригинал хранится, поэтому переключение обратно на RU мгновенное.
let CUR_LANG = "ru";
const LangCtx = React.createContext({ lang: "ru", setLang: () => {} });

const KK_LETTERS = "А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі";
let KK_RE = null;
function kkRegex() {
  if (KK_RE) return KK_RE;
  const keys = Object.keys(KK_DICT).filter((k) => k.length >= 1 && KK_DICT[k] !== undefined).sort((a, b) => b.length - a.length);
  const esc = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  KK_RE = new RegExp("(?<![" + KK_LETTERS + "])(" + esc.join("|") + ")(?![" + KK_LETTERS + "])", "g");
  return KK_RE;
}
function trKK(s) {
  if (!s || !/[А-Яа-яЁё]/.test(s)) return s;
  const t = s.trim();
  if (KK_DICT[t]) return s.replace(t, KK_DICT[t]);
  return s.replace(kkRegex(), (m) => (m in KK_DICT ? KK_DICT[m] : m));
}

const I18N_ORIG = new WeakMap();   // text node -> original russian text
const I18N_SET = new WeakMap();    // text node -> value we last wrote
const I18N_ATTR = new WeakMap();   // element -> { attr: [orig, set] }
function i18nApply(root, lang) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const p = n.parentNode;
    if (!p || p.nodeName === "SCRIPT" || p.nodeName === "STYLE" || p.nodeName === "TEXTAREA") continue;
    const v = n.nodeValue;
    const changedByApp = I18N_SET.get(n) !== v;
    if (changedByApp) I18N_ORIG.set(n, v);
    const orig = I18N_ORIG.get(n);
    const want = lang === "kk" ? trKK(orig) : orig;
    if (want !== v) n.nodeValue = want;
    I18N_SET.set(n, want);
  }
  root.querySelectorAll("[placeholder],[title],[aria-label]").forEach((el) => {
    const rec = I18N_ATTR.get(el) || {};
    ["placeholder", "title", "aria-label"].forEach((a) => {
      if (!el.hasAttribute(a)) return;
      const v = el.getAttribute(a);
      if (!rec[a] || rec[a][1] !== v) rec[a] = [v, v];
      const want = lang === "kk" ? trKK(rec[a][0]) : rec[a][0];
      if (want !== v) el.setAttribute(a, want);
      rec[a][1] = want;
    });
    I18N_ATTR.set(el, rec);
  });
}

function useI18nDom(lang) {
  useEffect(() => {
    CUR_LANG = lang;
    document.documentElement.lang = lang === "kk" ? "kk" : "ru";
    try { localStorage.setItem("sapar_lang", lang); } catch (e) {}
    const root = document.getElementById("root");
    i18nApply(root, lang);
    let raf = 0;
    const obs = new MutationObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; i18nApply(root, lang); });
    });
    obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });
    return () => { obs.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [lang]);
}

function initialLang() {
  try { const v = localStorage.getItem("sapar_lang"); if (v === "kk" || v === "ru") return v; } catch (e) {}
  return "ru";
}

function LangSwitch({ light }) {
  const { lang, setLang } = React.useContext(LangCtx);
  return (
    <div className="flex items-center rounded-full p-toggle shrink-0" style={{ background: light ? "rgba(255,255,255,.18)" : "#F2F1F8" }}>
      {[["ru", "RU"], ["kk", "ҚАЗ"]].map(([id, l]) => (
        <button key={id} onClick={() => setLang(id)} className="rounded-full font-bold"
          style={{ fontSize: 10.5, padding: "4px 8px", background: lang === id ? "var(--navy)" : "transparent", color: lang === id ? "#fff" : (light ? "#fff" : "var(--ink)") }}>{l}</button>
      ))}
    </div>
  );
}

