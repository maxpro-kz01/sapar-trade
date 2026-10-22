// Sapar Trade — прототип. Модуль: Админ: меню и корень админ-панели
// Строки 2320–2395 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== ADMIN APP ROOT ============================== */

function AdminNav({ screen, setScreen }) {
  const items = [
    { id: "shift", icon: "power", label: "Смена" },
    { id: "orders", icon: "clipboard", label: "Заказы" },
    { id: "ads", icon: "megaphone", label: "Реклама" },
    { id: "warehouse", icon: "package", label: "Склад" },
    { id: "agents", icon: "users", label: "Сотрудники" },
    { id: "stories", icon: "video", label: "Истории" },
    { id: "crm", icon: "bar-chart", label: "CRM" },
    { id: "audit", icon: "shield-check", label: "Аудит" },
    { id: "settings", icon: "settings", label: "Настройки" },
  ];
  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 px-2 pt-2 pb-6 overflow-x-auto" style={{ background: "#fff", borderTop: "1px solid var(--line)", scrollbarWidth: "none", paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}>
      {items.map((it) => {
        const active = screen === it.id;
        return (
          <button key={it.id} onClick={() => setScreen(it.id)} className="flex flex-col items-center gap-1 shrink-0 px-2.5 py-1 rounded-xl"
            style={{ background: active ? "#EEF0FF" : "transparent" }}>
            <Ico name={it.icon} size={18} color={active ? "var(--navy)" : "var(--muted)"} strokeWidth={active ? 2.4 : 2} />
            <span className="font-body" style={{ fontSize: 9, color: active ? "var(--navy)" : "var(--muted)", fontWeight: active ? 700 : 500, whiteSpace: "nowrap" }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AdminApp({ shared, onExit }) {
  const { orders, setOrders, banners, setBanners, warehouse, setWarehouse, stories, setStories, accounts, setAccounts, auditLog, addAudit, pushLog, setPushLog, clientNotify, cashback, setCashback, agents, setAgents,
    shift, setShift, shiftHistory, setShiftHistory, directorPhone, setDirectorPhone } = shared;
  const [screen, setScreen] = useState("shift");
  const [toast, setToast] = useState(null);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

  return (
    <div className="relative h-full flex flex-col" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="px-5 pb-2 flex items-center gap-2.5">
        <div className="rounded-xl flex items-center justify-center" style={{ width: 32, height: 32, background: "#fff", border: "1px solid var(--line)" }}><Logo size={24} /></div>
        <div className="flex-1">
          <p className="font-display" style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>Sapar Trade</p>
          <p style={{ fontSize: 10, color: "var(--muted)" }}>Админ-панель</p>
        </div>
        <LangSwitch />
        {shift && (
          <button onClick={() => setScreen("shift")} className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: "#E4F7E9" }}>
            <span className="rounded-full" style={{ width: 7, height: 7, background: "#127A33", display: "inline-block" }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#127A33" }}>смена с {hm(new Date(shift.startedAt))}</span>
          </button>
        )}
        <button onClick={onExit} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg" style={{ background: "#FCE7E6" }}>
          <Ico name="arrow-left" size={13} color="var(--red)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--red)" }}>Выход</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pb-24">
        {screen === "shift" && <AdminShift shift={shift} setShift={setShift} shiftHistory={shiftHistory} setShiftHistory={setShiftHistory}
          orders={orders} warehouse={warehouse} directorPhone={directorPhone} addAudit={addAudit} showToast={showToast} />}
        {screen === "orders" && <AdminOrders orders={orders} addAudit={addAudit} />}
        {screen === "ads" && <AdminAds banners={banners} setBanners={setBanners} pushLog={pushLog} setPushLog={setPushLog} addAudit={addAudit} clientNotify={clientNotify} />}
        {screen === "warehouse" && <AdminWarehouse warehouse={warehouse} setWarehouse={setWarehouse} addAudit={addAudit} />}
        {screen === "agents" && <AdminAgents agents={agents} setAgents={setAgents} orders={orders} addAudit={addAudit} />}
        {screen === "stories" && <AdminStories stories={stories} setStories={setStories} addAudit={addAudit} />}
        {screen === "crm" && <AdminCRM orders={orders} />}
        {screen === "audit" && <AdminAudit log={auditLog} />}
        {screen === "settings" && <AdminSettings accounts={accounts} setAccounts={setAccounts} addAudit={addAudit} cashback={cashback} setCashback={setCashback} directorPhone={directorPhone} setDirectorPhone={setDirectorPhone} />}
      </div>
      <AdminNav screen={screen} setScreen={setScreen} />
      <Toast toast={toast} />
    </div>
  );
}

