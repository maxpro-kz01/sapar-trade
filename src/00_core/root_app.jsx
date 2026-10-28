// Sapar Trade — прототип. Модуль: Корень всего приложения: состояние, маршрутизация между режимами
// Строки 4441–4528 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== ROOT ============================== */

function App() {
  // view: "client" (customer-facing app) | "staffChoice" (hidden role picker, reached via
  // double‑tap on the logo) | "adminLogin" / "admin" (staff dashboard, admin/admin)
  // | "agentLogin" / "agent" (sales-rep dashboard, credentials issued by the admin)
  // Рабочий режим: сессия живёт до закрытия вкладки; ссылка …/#work открывает рабочий вход сразу
  const [liveSession, setLiveSessionState] = useState(() => stSession.get());
  const setLiveSession = (v) => { stSession.set(v); setLiveSessionState(v); };
  const [liveNotice, setLiveNotice] = useState("");
  const [loginMode, setLoginMode] = useState("mgmt");
  // Стартовый экран — вход для сотрудников. Клиентское приложение (для магазинов) — по ссылке …/#client
  const clientMode = location.hash === "#client";
  const HOME = clientMode ? "client" : "staffChoice";
  const [view, setView] = useState(() => (stSession.get() ? "live" : location.hash === "#work" ? "liveLogin" : HOME));
  const [lang, setLang] = useState(initialLang);
  useI18nDom(lang);
  const [profile, setProfile] = useState({ name: "", hasShop: false, shopName: "" });
  const [cart, setCart] = useState({});
  const [orders, setOrders] = useState(genOrders());
  const [banners, setBanners] = useState(BANNER_SEED);
  const [warehouse, setWarehouse] = useState(PRODUCTS);
  const [stories, setStories] = useState(STORY_SEED);
  const [accounts, setAccounts] = useState(ACCOUNTS_SEED);
  const [auditLog, setAuditLog] = useState(AUDIT_SEED);
  const [pushLog, setPushLog] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [cashback, setCashback] = useState({ threshold: 50000, reward: 5000 });
  const [bonusRedeemedMonth, setBonusRedeemedMonth] = useState(null);

  const addAudit = (user, action, obj, detail) => {
    setAuditLog((prev) => [{ t: "только что", user, action, obj, detail }, ...prev]);
  };
  const clientNotify = (text) => {
    setNotifications((prev) => [{ text, time: new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), read: false }, ...prev]);
  };

  const shared = {
    profile, setProfile, cart, setCart, orders, setOrders, banners, setBanners,
    warehouse, setWarehouse, stories, setStories, accounts, setAccounts,
    auditLog, addAudit, pushLog, setPushLog, notifications, setNotifications, clientNotify,
    cashback, setCashback, bonusRedeemedMonth, setBonusRedeemedMonth,
  };

  return (
    <LangCtx.Provider value={{ lang, setLang }}>
    <div className="kz-root" style={{ height: "100dvh", width: "100%", overflow: "hidden", position: "relative", background: "var(--bg)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;800&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .kz-root { --navy:#1B1464; --red:#E2231A; --yellow:#FFC800; --bg:#F6F5FA; --ink:#161327; --muted:#77748C; --line:#E7E5F0; }
        .kz-root, .kz-root input, .kz-root textarea, .kz-root button { font-family: 'Manrope', sans-serif; }
        .font-display { font-family: 'Unbounded', sans-serif; }
        .font-mono-kz { font-family: 'JetBrains Mono', monospace; }
        .kz-root ::-webkit-scrollbar { display: none; }
      `}</style>

      <div className="relative h-full w-full kz-frame">
        {view === "client" && <ClientApp shared={shared} onAdminTrigger={() => setView("staffChoice")} />}
        {view === "staffChoice" && <StaffGate onCancel={clientMode ? () => setView("client") : null} onPick={(mode) => { setLoginMode(mode); setView("liveLogin"); }} />}
        {view === "liveLogin" && <LiveLogin mode={loginMode} notice={liveNotice} onCancel={() => setView("staffChoice")} onSuccess={(s) => { setLiveNotice(""); setLiveSession(s); setView("live"); }} />}
        {view === "live" && liveSession && (() => {
          const exit = (msg) => { setLoginMode(liveSession.mode || "mgmt"); setLiveSession(null); setLiveNotice(msg || ""); setView(msg ? "liveLogin" : HOME); };
          const App2 = liveSession.mode === "admin" ? AdminLiveApp : liveSession.mode === "tp" ? TpApp : MgmtApp;
          return <App2 session={liveSession} setSession={setLiveSession} onExit={exit} />;
        })()}
      </div>
    </div>
    </LangCtx.Provider>
  );
}


const rootEl = document.getElementById("root");
const root = ReactDOM.createRoot(rootEl);
root.render(<App />);



