// Sapar Trade — рабочая версия. Модуль: связь с сервером (API), сессия, периоды по времени Кызылорды
// Адрес сервера — <meta name="st-api"> в index.template.html. Токен хранится только до закрытия вкладки (sessionStorage).

const ST_API = ((document.querySelector('meta[name="st-api"]') || {}).content || "").replace(/\/$/, "");

const stSession = {
  get() { try { return JSON.parse(sessionStorage.getItem("st.session") || "null"); } catch (e) { return null; } },
  set(v) { try { v ? sessionStorage.setItem("st.session", JSON.stringify(v)) : sessionStorage.removeItem("st.session"); } catch (e) { /* приватный режим */ } },
};

class StApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Запрос к API. Бесплатный сервер «просыпается» до минуты — поэтому большой таймаут.
async function stApi(path, { method = "GET", body, token, timeoutMs = 75000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(ST_API + path, {
      method,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new StApiError(0, e.name === "AbortError" ? "Сервер не ответил вовремя. Попробуйте ещё раз." : "Нет связи с сервером. Проверьте интернет.");
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* пустой ответ */ }
  if (!res.ok) throw new StApiError(res.status, (data && data.error) || "Ошибка сервера (" + res.status + ")");
  return data;
}

// Загрузка данных экрана: { data, error, loading, reload }. При 401 — выход из сессии.
function useLive(session, path, onAuthLost) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    stApi(path, { token: session.token })
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => {
        if (!alive) return;
        if (e.status === 401 && onAuthLost) onAuthLost(e.message);
        setState({ data: null, error: e.message, loading: false });
      });
    return () => { alive = false; };
  }, [path, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

// ----- даты (часовой пояс компании — Кызылорда) -----
const ST_TZ = "Asia/Qyzylorda";
const stToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: ST_TZ }).format(new Date());
const stShift = (iso, days) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const stFmtDay = (iso) => (iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) : "");
const stFmtDate = (iso) => (iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "—");
const stFmtTime = (ts) => (ts ? new Date(ts).toLocaleString("ru-RU", { timeZone: ST_TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const stMoney = (n) => (n === null || n === undefined ? "—" : money(Math.round(n)));
const stNum = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 3 }));

const ST_PERIODS = [["today", "Сегодня"], ["yesterday", "Вчера"], ["week", "7 дней"], ["month", "Этот месяц"], ["lmonth", "Прошлый месяц"], ["custom", "Свой период"]];
function stRange(id, custom) {
  const t = stToday();
  if (id === "today") return { from: t, to: t };
  if (id === "yesterday") { const y = stShift(t, -1); return { from: y, to: y }; }
  if (id === "week") return { from: stShift(t, -6), to: t };
  if (id === "lmonth") { const end = stShift(t.slice(0, 8) + "01", -1); return { from: end.slice(0, 8) + "01", to: end }; }
  if (id === "custom" && custom.from && custom.to && custom.from <= custom.to) return { from: custom.from, to: custom.to };
  return { from: t.slice(0, 8) + "01", to: t };
}
const stQs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && v !== false && v !== null)
  .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v === true ? "1" : v)).join("&");
