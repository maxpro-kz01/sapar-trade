// Sapar Trade — рабочая версия. Модуль: связь с сервером (API), сессия, периоды по времени Кызылорды
// Адрес сервера — <meta name="st-api"> в index.template.html.
// Вход долгий: токен входа (90 дней) лежит на устройстве в localStorage, короткий токен доступа (1 час) программа
// обновляет сама, человек выходит только кнопкой «Выйти» (или если доступ закрыли на сервере).

const ST_API = ((document.querySelector('meta[name="st-api"]') || {}).content || "").replace(/\/$/, "");

const stAuth = { token: null, refreshToken: null, pending: null }; // текущие токены в памяти (запросы берут отсюда)
let stMem = null; // копия на случай, когда браузер не даёт писать в localStorage
const stSession = {
  get() {
    let v = stMem;
    try { v = JSON.parse(localStorage.getItem("st.session") || "null") || stMem; } catch (e) { /* приватный режим */ }
    if (v) { stAuth.token = v.token || null; stAuth.refreshToken = v.refreshToken || null; }
    return v;
  },
  set(v) {
    stMem = v || null;
    stAuth.token = v ? v.token || null : null; stAuth.refreshToken = v ? v.refreshToken || null : null;
    try { v ? localStorage.setItem("st.session", JSON.stringify(v)) : localStorage.removeItem("st.session"); } catch (e) { /* приватный режим */ }
    try { sessionStorage.removeItem("st.session"); } catch (e) { /* старая запись прошлой версии */ }
  },
};
const stJwtExp = (t) => { try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000; } catch (e) { return 0; } };

class StApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Один запрос к API без обновления входа. Бесплатный сервер «просыпается» до минуты — поэтому большой таймаут.
async function stFetch(path, { method = "GET", body, token, timeoutMs = 75000 } = {}) {
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

// Новый токен доступа по токену входа. Несколько запросов одновременно ждут один общий ответ.
function stRefresh() {
  if (!stAuth.refreshToken) return Promise.reject(new StApiError(401, "Сессия завершена, войдите снова"));
  if (!stAuth.pending) {
    const rt = stAuth.refreshToken;
    stAuth.pending = stFetch("/api/auth/refresh", { method: "POST", body: { refreshToken: rt } })
      .then((r) => { const s = stSession.get(); if (s && s.refreshToken === rt) stSession.set({ ...s, token: r.token, user: r.user, perms: r.perms }); })
      .finally(() => { stAuth.pending = null; });
  }
  return stAuth.pending;
}

// Запрос к API. Токен доступа истёк (1 час) — тихо обновляем по токену входа и повторяем запрос.
// Выкинет наружу 401 только если вход закрыт на сервере (выход с другого устройства, доступ закрыли, 90 дней без захода).
async function stApi(path, opts = {}) {
  if (!opts.token || !stAuth.refreshToken) return stFetch(path, opts);
  if (!stAuth.token || stJwtExp(stAuth.token) - Date.now() < 60000) {
    try { await stRefresh(); } catch (e) { if (e.status === 401) throw e; /* нет связи — пробуем со старым токеном */ }
  }
  try {
    return await stFetch(path, { ...opts, token: stAuth.token || opts.token });
  } catch (e) {
    if (e.status !== 401) throw e;
    await stRefresh(); // 401 здесь — вход закрыт, пойдёт наверх как выход
    return stFetch(path, { ...opts, token: stAuth.token });
  }
}

// Выход на этом устройстве: токен входа гасим на сервере, с устройства стираем
function stLogout() {
  const rt = stAuth.refreshToken;
  stSession.set(null);
  if (rt) fetch(ST_API + "/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: rt }), keepalive: true }).catch(() => {});
}

// Загрузка данных экрана: { data, error, loading, reload }. При 401 — выход из сессии.
// refreshMs — автообновление (например, список заказов раз в 30 секунд); при обновлении старые данные не прячем
function useLive(session, path, onAuthLost, refreshMs) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!refreshMs) return undefined;
    const t = setInterval(() => setTick((x) => x + 1), refreshMs);
    return () => clearInterval(t);
  }, [refreshMs]);
  useEffect(() => {
    if (!path) return undefined; // path = null — пока нечего загружать (например, магазин ещё не выбран)
    let alive = true;
    setState((s) => ({ ...s, loading: !s.data, error: null }));
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
