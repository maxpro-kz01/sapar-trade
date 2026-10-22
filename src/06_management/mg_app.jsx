// Sapar Trade — прототип. Модуль: Корень системы управления (шапка, вкладки, уведомления)
// Строки 4353–4440 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

function MgmtApp({ role, shared, onExit, lang, setLang }) {
  const { warehouse, auditLog, addAudit, mgTasks, setMgTasks, mgWeights, setMgWeights, mgSync, setMgSync } = shared;
  const R = MG_ROLES[role];
  const [tab, setTab] = useState("home");
  const [tpOpen, setTpOpen] = useState(null);
  const [period, setPeriod] = useState("month");
  const [custom, setCustom] = useState({ from: addD(new Date(), -13).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) });
  const [toast, setToast] = useState(null);
  const [bell, setBell] = useState(false);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };
  const rg = mgRange(period, custom);
  const scope = R.scope || {};
  const cur = useMemo(() => mgAgg(rg.from, rg.to, scope), [rg.from.getTime(), rg.to.getTime(), role]);
  const prev = useMemo(() => mgAgg(rg.pf, rg.pt, scope), [rg.pf.getTime(), rg.pt.getTime(), role]);
  const problems = mgProblems(role, warehouse);
  const stale = mgSync.fail || Date.now() - new Date(mgSync.sd).getTime() > 15 * 60000;
  const go = (t) => { setTpOpen(null); if (R.tabs.includes(t)) setTab(t); };
  const showPeriod = ["home", "sales", "finance"].includes(tab) && ["owner", "director", "accountant", "financier"].includes(role);
  const p = { role, cur, prev, rg, go, warehouse, problems, weights: mgWeights, addAudit, showToast, openTp: (id) => setTpOpen(id) };
  const title = tpOpen ? MG.tpById[tpOpen].name : MG_TABS[tab][1];
  return (
    <div className="relative h-full flex flex-col" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="px-5 pb-2 flex items-center gap-2">
        <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#fff", border: "1px solid var(--line)" }}><Logo size={24} /></div>
        <div className="flex-1 min-w-0">
          <p className="font-display truncate" style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)" }}>{title}</p>
          <p className="truncate" style={{ fontSize: 10, color: "var(--muted)" }}>{R.person} · {R.label}</p>
        </div>
        <LangSwitch lang={lang} setLang={setLang} />
        <button onClick={() => setBell(true)} className="relative p-2 rounded-full" style={{ background: "#F2F1F8" }}>
          <Ico name="bell" size={16} />
          {problems.some((x) => x.lvl === "red") && <span className="absolute rounded-full" style={{ top: 4, right: 4, width: 8, height: 8, background: "var(--red)" }} />}
        </button>
        <button onClick={onExit} className="p-2 rounded-full" style={{ background: "#FCE7E6" }}><Ico name="log-out" size={15} color="var(--red)" /></button>
      </div>
      {stale && (
        <div className="rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: "#FCE7E6", margin: "0 20px 8px" }}>
          <Ico name="clock" size={14} color="#B3261E" />
          <span style={{ fontSize: 11, color: "#B3261E", fontWeight: 600, flex: 1 }}>Данные могут быть устаревшими. Последнее обновление: {dt(new Date(mgSync.sd))}</span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto pb-24 px-5 pt-1 font-body">
        {tpOpen ? (
          <>
            <button onClick={() => setTpOpen(null)} className="flex items-center gap-1 mb-3" style={{ fontSize: 12.5, color: "var(--navy)", fontWeight: 700 }}><Ico name="arrow-left" size={14} />Назад к команде</button>
            <MgTpCard {...p} tpId={tpOpen} />
          </>
        ) : (
          <>
            {showPeriod && <MgPeriodBar period={period} setPeriod={setPeriod} custom={custom} setCustom={setCustom} />}
            {tab === "home" && <MgHome {...p} />}
            {tab === "sales" && <MgSales {...p} />}
            {tab === "team" && <MgTeam {...p} />}
            {tab === "fleet" && <MgFleet {...p} />}
            {tab === "clients" && <MgClients {...p} />}
            {tab === "stock" && <MgStock {...p} />}
            {tab === "finance" && <MgFinance {...p} />}
            {tab === "problems" && <MgProblems {...p} />}
            {tab === "tasks" && <MgTasks {...p} tasks={mgTasks} setTasks={setMgTasks} />}
            {tab === "ai" && <MgAI {...p} />}
            {tab === "system" && <MgSystem {...p} sync={mgSync} setSync={setMgSync} setWeights={setMgWeights} auditLog={auditLog} />}
            <p className="text-center" style={{ fontSize: 10, color: "var(--muted)", marginTop: 14 }}>Демо-данные · подключение к 1С и Sales Doctor через Backend API</p>
          </>
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 px-2 pt-2 overflow-x-auto" style={{ background: "#fff", borderTop: "1px solid var(--line)", scrollbarWidth: "none", paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}>
        {R.tabs.map((id) => {
          const active = tab === id && !tpOpen;
          return (
            <button key={id} onClick={() => go(id)} className="flex flex-col items-center gap-1 shrink-0 px-2.5 py-1 rounded-xl" style={{ background: active ? "#EEF0FF" : "transparent", minWidth: 54 }}>
              <Ico name={MG_TABS[id][0]} size={18} color={active ? "var(--navy)" : "var(--muted)"} strokeWidth={active ? 2.4 : 2} />
              <span style={{ fontSize: 9, color: active ? "var(--navy)" : "var(--muted)", fontWeight: active ? 700 : 500, whiteSpace: "nowrap" }}>{MG_TABS[id][1]}</span>
            </button>
          );
        })}
      </div>
      {bell && (
        <Modal title="Уведомления" onClose={() => setBell(false)}>
          {problems.filter((x) => x.lvl !== "green").map((x, i) => <MgProblemRow key={i} p={x} onGo={(t) => { setBell(false); go(t); }} />)}
          {problems.filter((x) => x.lvl !== "green").length === 0 && <p style={{ fontSize: 12.5, color: "var(--muted)" }}>Новых уведомлений нет</p>}
        </Modal>
      )}
      <Toast toast={toast} />
    </div>
  );
}

