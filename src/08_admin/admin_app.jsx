// Sapar Trade — администратор. Модуль: оболочка админ-панели на реальных данных (вход по личному логину)
// Разделы по правам: Смена, Заказы, Склад (1С), Сотрудники, Настройки. Реклама/Истории/CRM — вернутся с приложением для магазинов.

const ADMIN_TABS = { shift: ["power", "Смена"], orders: ["clipboard", "Заказы"], stock: ["package", "Склад"], staff: ["users", "Сотрудники"], settings: ["settings", "Настройки"] };

function adminTabsFor(session) {
  const can = (...p) => liveCan(session, ...p);
  return [can("shift") && "shift", can("orders.all") && "orders", can("stock") && "stock", can("users") && "staff", can("settings") && "settings"].filter(Boolean);
}

function AdminLiveApp({ session, setSession, onExit }) {
  const tabs = adminTabsFor(session);
  const [tab, setTab] = useState(tabs[0]);
  const [toast, setToast] = useState(null);
  const [pwd, setPwd] = useState(false);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };
  const authLost = (msg) => onExit(msg || "Сессия завершена, войдите снова");
  const p = { session, authLost, showToast, go: () => {}, param: null, setParam: () => {} };
  return (
    <div className="relative h-full flex flex-col kz-app" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="px-5 pb-2 flex items-center gap-2 kz-head">
        <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#fff", border: "1px solid var(--line)" }}><Logo size={24} /></div>
        <div className="flex-1 min-w-0">
          <p className="font-display truncate" style={{ fontSize: 13.5, fontWeight: 800 }}>{ADMIN_TABS[tab][1]}</p>
          <p className="truncate" style={{ fontSize: 10, color: "var(--muted)" }}>{session.user.name} · {LIVE_ROLES[session.user.role] || session.user.role}</p>
        </div>
        <LangSwitch />
        <button onClick={() => setPwd(true)} title="Сменить пароль" className="p-2 rounded-full" style={{ background: "#F2F1F8" }}><Ico name="settings" size={15} /></button>
        <button onClick={() => onExit()} title="Выйти" className="p-2 rounded-full" style={{ background: "#FCE7E6" }}><Ico name="log-out" size={15} color="var(--red)" /></button>
      </div>
      <div className="flex-1 overflow-y-auto pb-24 px-5 pt-1 font-body kz-main">
        {tab === "shift" && <AdminShiftLive {...p} />}
        {tab === "orders" && <OrdersBoard {...p} />}
        {tab === "stock" && <MgStock {...p} />}
        {tab === "staff" && <LiveUsers {...p} />}
        {tab === "settings" && <AdminSettingsLive {...p} />}
      </div>
      <AppNav items={tabs.map((id) => ({ id, icon: ADMIN_TABS[id][0], label: ADMIN_TABS[id][1] }))} active={tab} onPick={setTab} spread={tabs.length <= 5}
        brand={<NavBrand title="Sapar Trade" sub="Администратор" />} />
      {pwd && <LivePasswordModal session={session} onClose={() => setPwd(false)}
        onChanged={(token) => { setSession({ ...session, token }); setPwd(false); showToast("Пароль изменён"); }} />}
      <Toast toast={toast} />
    </div>
  );
}
