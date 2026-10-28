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
  // Стартовый экран — вход для сотрудников. Клиентское приложение (для магазинов) — по ссылке …/#client
  const clientMode = location.hash === "#client";
  const HOME = clientMode ? "client" : "staffChoice";
  const [view, setView] = useState(() => (stSession.get() ? "live" : location.hash === "#work" ? "liveLogin" : HOME));
  const [loggedAgent, setLoggedAgent] = useState(null);
  const [lang, setLang] = useState(initialLang);
  useI18nDom(lang);
  const [mgRole, setMgRole] = useState(null);
  const [mgTasks, setMgTasks] = useState([
    { id: "T1", title: "Погасить просрочку «Минимаркет Айсулу»", who: "Азамат Турсунов", by: "Директор по продажам", deadline: new Date().toISOString().slice(0, 10), prio: "Высокий", status: "В работе", comments: [{ a: "Директор по продажам", t: "Договориться о графике оплаты до пятницы" }] },
    { id: "T2", title: "Провести инвентаризацию напитков", who: "Дамир — завсклад", by: "Сапар — владелец", deadline: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), prio: "Средний", status: "Новая", comments: [] },
  ]);
  const [mgWeights, setMgWeights] = useState(DEFAULT_WEIGHTS);
  const [mgSync, setMgSync] = useState({ c1: new Date(Date.now() - 4 * 60000), fail: false, log: [
    { t: new Date(Date.now() - 4 * 60000), src: "1С", ok: true }] });

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
  const [agents, setAgents] = useState(AGENTS_SEED);
  const [agentStores, setAgentStores] = useState([]);
  const [shift, setShift] = useState(null);            // null = смена закрыта
  const [shiftHistory, setShiftHistory] = useState([]);
  const [directorPhone, setDirectorPhone] = useState(DIRECTOR_PHONE_DEFAULT);

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
    agents, setAgents, agentStores, setAgentStores,
    mgTasks, setMgTasks, mgWeights, setMgWeights, mgSync, setMgSync,
    shift, setShift, shiftHistory, setShiftHistory, directorPhone, setDirectorPhone,
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
        {view === "staffChoice" && <StaffGate onCancel={clientMode ? () => setView("client") : null} onPick={(role) => setView(role === "admin" ? "adminLogin" : role === "mgmt" ? "mgmtLogin" : role === "live" ? "liveLogin" : "agentLogin")} />}
        {view === "liveLogin" && <LiveLogin notice={liveNotice} onCancel={() => setView("staffChoice")} onSuccess={(s) => { setLiveNotice(""); setLiveSession(s); setView("live"); }} />}
        {view === "live" && liveSession && <LiveApp session={liveSession} setSession={setLiveSession}
          onExit={(msg) => { setLiveSession(null); setLiveNotice(msg || ""); setView(msg ? "liveLogin" : HOME); }} />}
        {view === "mgmtLogin" && <MgmtLogin addAudit={addAudit} onCancel={() => setView("staffChoice")} onSuccess={(r) => { setMgRole(r); setView("mgmt"); }} />}
        {view === "mgmt" && mgRole && <MgmtApp role={mgRole} shared={shared} onExit={() => { addAudit(MG_ROLES[mgRole].person, "Выход из системы", MG_ROLES[mgRole].label, ""); setMgRole(null); setView(HOME); }} />}
        {view === "adminLogin" && <AdminLogin onCancel={() => setView("staffChoice")} onSuccess={() => setView("admin")} />}
        {view === "admin" && <AdminApp shared={shared} onExit={() => setView(HOME)} />}
        {view === "agentLogin" && <AgentLogin agents={agents} onCancel={() => setView("staffChoice")} onSuccess={(ag) => { setLoggedAgent(ag); setView("agent"); }} />}
        {view === "agent" && loggedAgent && <AgentApp agent={loggedAgent} shared={shared} onExit={() => { setLoggedAgent(null); setView(HOME); }} />}
      </div>
    </div>
    </LangCtx.Provider>
  );
}


const rootEl = document.getElementById("root");
const root = ReactDOM.createRoot(rootEl);
root.render(<App />);



