// Sapar Trade — система управления. Модуль: оболочка (шапка, меню по правам роли, период, уведомления, выход)
// Все цифры — с сервера (данные 1С). Вход — личный логин и пароль сотрудника.

function MgmtApp({ session, setSession, onExit }) {
  const tabs = mgTabsFor(session);
  const [tab, setTab] = useState("home");
  const [param, setParam] = useState(null);
  const [period, setPeriod] = useState("month");
  const [custom, setCustom] = useState({ from: stShift(stToday(), -13), to: stToday() });
  const [toast, setToast] = useState(null);
  const [bell, setBell] = useState(false);
  const [pwd, setPwd] = useState(false);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };
  const range = stRange(period, custom);
  const authLost = (msg) => onExit(msg || "Сессия завершена, войдите снова");
  const go = (t, prm) => { if (!tabs.includes(t)) return; setParam(prm || null); setTab(t); setBell(false); };
  const pick = (t) => go(t, null);
  const problems = useLive(session, "/api/problems", authLost);
  const alerts = problems.data ? problems.data.items.filter((x) => x.lvl !== "green") : [];
  const p = { session, range, authLost, go, showToast, param, setParam };
  return (
    <div className="relative h-full flex flex-col kz-app" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="px-5 pb-2 flex items-center gap-2 kz-head">
        <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#fff", border: "1px solid var(--line)" }}><Logo size={24} /></div>
        <div className="flex-1 min-w-0">
          <p className="font-display truncate" style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)" }}>{MG_TABS[tab][1]}</p>
          <p className="truncate" style={{ fontSize: 10, color: "var(--muted)" }}>{session.user.name} · {LIVE_ROLES[session.user.role] || session.user.role}</p>
        </div>
        <LangSwitch />
        <button onClick={() => { setBell(true); problems.reload(); }} title="Уведомления" className="relative p-2 rounded-full" style={{ background: "#F2F1F8" }}>
          <Ico name="bell" size={16} />
          {alerts.length > 0 && <span className="absolute rounded-full" style={{ top: 4, right: 4, width: 8, height: 8, background: alerts.some((x) => x.lvl === "red") ? "var(--red)" : "#F5A300" }} />}
        </button>
        <button onClick={() => setPwd(true)} title="Сменить пароль" className="p-2 rounded-full" style={{ background: "#F2F1F8" }}><Ico name="settings" size={15} /></button>
        <button onClick={() => onExit()} title="Выйти" className="p-2 rounded-full" style={{ background: "#FCE7E6" }}><Ico name="log-out" size={15} color="var(--red)" /></button>
      </div>
      <div className="flex-1 overflow-y-auto pb-24 px-5 pt-1 font-body kz-main">
        {MG_PERIOD_TABS.includes(tab) && <LivePeriodBar period={period} setPeriod={setPeriod} custom={custom} setCustom={setCustom} />}
        {tab === "home" && <MgHome {...p} />}
        {tab === "sales" && <MgSales {...p} />}
        {tab === "team" && <MgTeam {...p} />}
        {tab === "fleet" && <MgFleet {...p} />}
        {tab === "clients" && <MgClients key={JSON.stringify(param)} {...p} />}
        {tab === "stock" && <MgStock key={JSON.stringify(param)} {...p} />}
        {tab === "finance" && <MgFinance {...p} />}
        {tab === "problems" && <MgProblems {...p} />}
        {tab === "tasks" && <MgTasks {...p} />}
        {tab === "ai" && <MgAI {...p} />}
        {tab === "system" && <MgSystem {...p} />}
      </div>
      <AppNav items={tabs.map((id) => ({ id, icon: MG_TABS[id][0], label: MG_TABS[id][1], badge: id === "problems" ? alerts.length : 0 }))} active={tab} onPick={pick}
        brand={<NavBrand title="Sapar Trade" sub="Система управления · 1С" />} />
      {bell && (
        <Modal title="Уведомления" onClose={() => setBell(false)}>
          {problems.data ? problems.data.items.map((x) => <MgProblemRow key={x.code} p={x} onGo={go} />) : <LiveState {...problems} onRetry={problems.reload} />}
        </Modal>
      )}
      {pwd && <LivePasswordModal session={session} onClose={() => setPwd(false)}
        onChanged={(token) => { setSession({ ...session, token }); setPwd(false); showToast("Пароль изменён"); }} />}
      <Toast toast={toast} />
    </div>
  );
}
