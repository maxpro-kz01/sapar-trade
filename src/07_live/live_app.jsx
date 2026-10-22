// Sapar Trade — рабочая версия. Модуль: оболочка рабочего режима (меню по правам роли, период, выход)
// Вкладки видны только если у роли есть права (перечень прав присылает сервер при входе).

const LIVE_TABS = {
  home: ["home", "Главная"],
  sales: ["trending-up", "Продажи"],
  stock: ["package", "Склад"],
  clients: ["users", "Клиенты"],
  sync: ["clock", "Интеграция 1С"],
  users: ["shield-check", "Сотрудники"],
};

function LiveApp({ session, setSession, onExit }) {
  const can = (...p) => liveCan(session, ...p);
  const tabs = ["home"]
    .concat(can("sales", "sales.own") ? ["sales"] : [])
    .concat(can("stock") ? ["stock"] : [])
    .concat(can("debts", "debts.own", "sales", "sales.own") ? ["clients"] : [])
    .concat(can("sync") ? ["sync"] : [])
    .concat(can("users") ? ["users"] : []);
  const [tab, setTab] = useState("home");
  const [period, setPeriod] = useState("month");
  const [custom, setCustom] = useState({ from: stShift(stToday(), -13), to: stToday() });
  const [toast, setToast] = useState(null);
  const [pwd, setPwd] = useState(false);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };
  const range = stRange(period, custom);
  const authLost = (msg) => onExit(msg || "Сессия завершена, войдите снова");
  const go = (t) => tabs.includes(t) && setTab(t);
  const p = { session, range, authLost, go, showToast };
  const showPeriod = ["home", "sales", "clients"].includes(tab) && can("sales", "sales.own", "debts", "debts.own");
  return (
    <div className="relative h-full flex flex-col kz-app" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="px-5 pb-2 flex items-center gap-2 kz-head">
        <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#fff", border: "1px solid var(--line)" }}><Logo size={24} /></div>
        <div className="flex-1 min-w-0">
          <p className="font-display truncate" style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)" }}>{LIVE_TABS[tab][1]}</p>
          <p className="truncate" style={{ fontSize: 10, color: "var(--muted)" }}>{session.user.name} · {LIVE_ROLES[session.user.role] || session.user.role}</p>
        </div>
        <LangSwitch />
        <button onClick={() => setPwd(true)} title="Сменить пароль" className="p-2 rounded-full" style={{ background: "#F2F1F8" }}><Ico name="settings" size={15} /></button>
        <button onClick={() => onExit()} title="Выйти" className="p-2 rounded-full" style={{ background: "#FCE7E6" }}><Ico name="log-out" size={15} color="var(--red)" /></button>
      </div>
      <div className="flex-1 overflow-y-auto pb-24 px-5 pt-1 font-body kz-main">
        {showPeriod && <LivePeriodBar period={period} setPeriod={setPeriod} custom={custom} setCustom={setCustom} />}
        {tab === "home" && <LiveHome {...p} />}
        {tab === "sales" && <LiveSales {...p} />}
        {tab === "stock" && <LiveStock {...p} />}
        {tab === "clients" && <LiveClients {...p} />}
        {tab === "sync" && <LiveSync {...p} />}
        {tab === "users" && <LiveUsers {...p} />}
      </div>
      <AppNav items={tabs.map((id) => ({ id, icon: LIVE_TABS[id][0], label: LIVE_TABS[id][1] }))} active={tab} onPick={go}
        spread={tabs.length <= 4} brand={<NavBrand title="Sapar Trade" sub="Рабочий режим · 1С" />} />
      {pwd && <LivePasswordModal session={session} onClose={() => setPwd(false)}
        onChanged={(token) => { setSession({ ...session, token }); setPwd(false); showToast("Пароль изменён"); }} />}
      <Toast toast={toast} />
    </div>
  );
}
