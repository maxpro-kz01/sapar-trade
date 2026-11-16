// Sapar Trade — общее. Модуль: проверка новой версии сайта — плашка «Вышла новая версия сайта» с кнопкой «Обновить»
// Версия сборки — <meta name="st-build"> (отпечаток содержимого страницы). Раз в 5 минут и при возврате на вкладку берём свежую страницу без кэша.

const ST_BUILD = (document.querySelector('meta[name="st-build"]') || {}).content || "dev";
const ST_VERSION_EVERY_MS = 5 * 60 * 1000;

function useNewVersion() {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (ST_BUILD === "dev" || ST_BUILD.startsWith("__")) return undefined; // локальная сборка — не проверяем
    let alive = true;
    const check = async () => {
      if (!alive || document.visibilityState === "hidden") return;
      try {
        const r = await fetch(location.pathname + "?v=" + Date.now(), { cache: "no-store" });
        const m = (await r.text()).match(/<meta name="st-build" content="([^"]+)"/);
        if (alive && m && m[1] !== ST_BUILD && !m[1].startsWith("__")) setFresh(true);
      } catch (e) { /* нет сети — проверим в следующий раз */ }
    };
    const t = setInterval(check, ST_VERSION_EVERY_MS);
    const vis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return fresh;
}

function NewVersionBar() {
  const fresh = useNewVersion();
  if (!fresh) return null;
  return (
    <div role="status" data-testid="new-version" className="flex items-center gap-3"
      style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 9999, maxWidth: 460, margin: "0 auto", background: "#1B1464", color: "#fff", borderRadius: 16, padding: "12px 14px", boxShadow: "0 8px 24px rgba(27,20,100,.35)" }}>
      <span className="flex-1" style={{ fontSize: 13, fontWeight: 600 }}>Вышла новая версия сайта</span>
      <button onClick={() => location.reload()} className="press-98" style={{ background: "#fff", color: "#1B1464", fontWeight: 800, borderRadius: 10, padding: "8px 14px", fontSize: 13 }}>Обновить</button>
    </div>
  );
}
