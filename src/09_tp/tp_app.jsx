// Sapar Trade — торговый представитель. Модуль: оболочка приложения ТП (вход по личному логину)
// Вкладки: Мои магазины → заказ, Мои заказы, Мой план. Только свои клиенты; без себестоимости и маржи.

const TP_TABS = { stores: ["store", "Магазины"], orders: ["clipboard", "Мои заказы"], plan: ["trending-up", "Мой план"] };

function TpApp({ session, setSession, onExit }) {
  const [tab, setTab] = useState("stores");
  const [store, setStore] = useState(null);
  const [toast, setToast] = useState(null);
  const [pwd, setPwd] = useState(false);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const authLost = (msg) => onExit(msg || "Сессия завершена, войдите снова");
  const catalog = useLive(session, "/api/catalog", authLost);
  const t = stToday();
  const p = { session, authLost, showToast, go: () => {}, param: null, setParam: () => {} };
  const pick = (id) => { setStore(null); setTab(id); };
  return (
    <div className="relative h-full flex flex-col kz-app" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="px-5 pb-2 flex items-center gap-2 kz-head">
        <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#fff", border: "1px solid var(--line)" }}><Logo size={24} /></div>
        <div className="flex-1 min-w-0">
          <p className="font-display truncate" style={{ fontSize: 13.5, fontWeight: 800 }}>{store ? "Заказ" : TP_TABS[tab][1]}</p>
          <p className="truncate" style={{ fontSize: 10, color: "var(--muted)" }}>{session.user.name} · {LIVE_ROLES[session.user.role] || session.user.role}</p>
        </div>
        <LangSwitch />
        <button onClick={() => setPwd(true)} title="Сменить пароль" className="p-2 rounded-full" style={{ background: "#F2F1F8" }}><Ico name="settings" size={15} /></button>
        <button onClick={() => onExit()} title="Выйти" className="p-2 rounded-full" style={{ background: "#FCE7E6" }}><Ico name="log-out" size={15} color="var(--red)" /></button>
      </div>
      <div className="flex-1 overflow-y-auto pb-24 px-5 pt-1 font-body kz-main">
        {tab === "stores" && !store && <TpStores {...p} onOrder={setStore} />}
        {tab === "stores" && store && <TpOrder {...p} store={store} catalog={catalog} onBack={() => setStore(null)} onDone={() => { setStore(null); setTab("orders"); }} />}
        {tab === "orders" && <OrdersBoard {...p} defaultFilter="all" />}
        {tab === "plan" && <MgTeam {...p} range={{ from: t.slice(0, 8) + "01", to: t }} />}
      </div>
      <AppNav items={Object.entries(TP_TABS).map(([id, [icon, label]]) => ({ id, icon, label }))} active={store ? "stores" : tab} onPick={pick} spread
        brand={<NavBrand title="Sapar Trade" sub="Торговый представитель" />} />
      {pwd && <LivePasswordModal session={session} onClose={() => setPwd(false)}
        onChanged={(token) => { setSession({ ...session, token }); setPwd(false); showToast("Пароль изменён"); }} />}
      <Toast toast={toast} />
    </div>
  );
}
