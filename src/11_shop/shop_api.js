// Sapar Trade — «Магазин». Модуль: связь с сервером для магазинов (ТЗ TZ_STORE_APP).
// Вход магазина хранится на устройстве отдельно от входа сотрудников (localStorage "st.shop"):
// токен входа (90 дней) и короткий токен доступа, который программа обновляет сама — как у сотрудников.

const shopAuth = { token: null, refreshToken: null, pending: null };
let shopMem = null;
const shopSession = {
  get() {
    let v = shopMem;
    try { v = JSON.parse(localStorage.getItem("st.shop") || "null") || shopMem; } catch (e) { /* приватный режим */ }
    if (v) { shopAuth.token = v.token || null; shopAuth.refreshToken = v.refreshToken || null; }
    return v;
  },
  set(v) {
    shopMem = v || null;
    shopAuth.token = v ? v.token || null : null; shopAuth.refreshToken = v ? v.refreshToken || null : null;
    try { v ? localStorage.setItem("st.shop", JSON.stringify(v)) : localStorage.removeItem("st.shop"); } catch (e) { /* приватный режим */ }
  },
};

function shopRefresh() {
  if (!shopAuth.refreshToken) return Promise.reject(new StApiError(401, "Сессия завершена, войдите снова"));
  if (!shopAuth.pending) {
    const rt = shopAuth.refreshToken;
    shopAuth.pending = stFetch("/api/shop/refresh", { method: "POST", body: { refreshToken: rt } })
      .then((r) => { const s = shopSession.get(); if (s && s.refreshToken === rt) shopSession.set({ ...s, token: r.token, shop: r.shop }); })
      .finally(() => { shopAuth.pending = null; });
  }
  return shopAuth.pending;
}

// Запрос от имени магазина: доступ истёк — тихо обновляем по токену входа и повторяем.
async function shopApi(path, opts = {}) {
  if (!shopAuth.refreshToken) shopSession.get();
  if (!shopAuth.token || stJwtExp(shopAuth.token) - Date.now() < 60000) {
    try { await shopRefresh(); } catch (e) { if (e.status === 401) throw e; /* нет связи — пробуем со старым токеном */ }
  }
  try {
    return await stFetch(path, { ...opts, token: shopAuth.token });
  } catch (e) {
    if (e.status !== 401) throw e;
    await shopRefresh(); // 401 здесь — вход закрыт (заблокировали, вышли с другого устройства)
    return stFetch(path, { ...opts, token: shopAuth.token });
  }
}

function useShopLive(path, onAuthLost) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (path === null) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: !s.data, error: null }));
    shopApi(path)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => {
        if (!alive) return;
        if (e.status === 401 && onAuthLost) onAuthLost();
        setState({ data: null, error: e.message, loading: false });
      });
    return () => { alive = false; };
  }, [path, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

const SHOP_PAY = { cash: "Наличными", transfer: "Переводом", debt: "В долг" };
const SHOP_STATUS_COLOR = { "Новый": ["#FFF6DE", "#8A5A00"], "Принят": ["#E7EEFF", "#1B3FA0"], "Собран": ["#EEF0FF", "#1B1464"], "Отгружен": ["#E4F7EA", "#127A33"], "Отменён": ["#FCE7E6", "#B3261E"] };
