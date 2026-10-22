// Sapar Trade — прототип. Модуль: Приложение торгового представителя (магазины, заказы)
// Строки 2518–2807 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== AGENT: SALES REP APP ============================== */
/* A field sales rep ("торговый представитель") logs in separately, keeps their own list
   of stores ("Мои магазины"), opens a store to see the full warehouse assortment, builds
   an order for that store, picks a payment method (cash / transfer) or marks it as debt,
   and submits it — the order lands on the admin's Orders panel immediately (type: "agent"). */

function AgentStores({ agent, agentStores, setAgentStores, onOpenStore, addAudit }) {
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [addr, setAddr] = useState("");
  const [phone, setPhone] = useState("");
  const mine = agentStores.filter((s) => s.agentLogin === agent.login);

  const save = () => {
    if (!name.trim()) return;
    const s = { id: "st" + Date.now(), agentLogin: agent.login, name: name.trim(), addr: addr.trim(), phone: phone.trim() };
    setAgentStores([...agentStores, s]);
    addAudit(agent.name, "Добавлен магазин", s.name, s.addr || "—");
    setAddOpen(false); setName(""); setAddr(""); setPhone("");
  };

  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle sub="Магазины, которые вы обслуживаете">Мои магазины</SectionTitle>
      <button onClick={() => setAddOpen(true)} className="w-full rounded-2xl p-4 mb-4 flex items-center justify-center gap-2" style={{ border: "1.5px dashed var(--line)", color: "var(--navy)" }}>
        <Ico name="plus-circle" size={18} /><span style={{ fontSize: 13.5, fontWeight: 700 }}>Добавить магазин</span>
      </button>
      <div className="flex flex-col gap-2.5 kz-list">
        {mine.map((s) => (
          <button key={s.id} onClick={() => onOpenStore(s)} className="text-left rounded-2xl p-3.5 flex items-center gap-3" style={{ background: "#fff", border: "1px solid var(--line)" }}>
            <div className="rounded-xl p-2.5 shrink-0" style={{ background: "#EEF0FF" }}><Ico name="store" size={18} color="var(--navy)" /></div>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 14, color: "var(--ink)", fontWeight: 700 }}>{s.name}</p>
              {s.addr && <p className="truncate" style={{ fontSize: 11.5, color: "var(--muted)" }}>{s.addr}</p>}
            </div>
            <Ico name="arrow-left" size={16} color="var(--muted)" style={{ transform: "rotate(180deg)" }} />
          </button>
        ))}
        {mine.length === 0 && <p className="text-center py-10" style={{ fontSize: 13, color: "var(--muted)" }}>Магазинов пока нет — добавьте первый</p>}
      </div>

      {addOpen && (
        <Modal title="Новый магазин" onClose={() => setAddOpen(false)}>
          <Field label="Название магазина" placeholder="Например, Dinara" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Field label="Адрес" placeholder="г. Кызылорда, ул. ..." value={addr} onChange={(e) => setAddr(e.target.value)} />
          <Field label="Телефон" placeholder="+7 7XX XXX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <PrimaryButton full disabled={!name.trim()} onClick={save}>Добавить магазин</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function AgentStoreOrder({ store, warehouse, onBack, onSubmitOrder }) {
  const [cart, setCart] = useState({});
  const [activeCat, setActiveCat] = useState(null);
  const [q, setQ] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [isDebt, setIsDebt] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");

  const filtered = useMemo(() => warehouse.filter((p) =>
    (!activeCat || p.cat === activeCat) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))
  ), [activeCat, q, warehouse]);

  const items = Object.entries(cart).map(([id, qty]) => ({ p: warehouse.find((x) => x.id === Number(id)), qty })).filter((it) => it.p);
  const total = items.reduce((s, it) => s + it.p.price * it.qty, 0);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const submit = () => {
    onSubmitOrder({ items, total, isDebt, payMethod });
    setCart({}); setCheckoutOpen(false); setIsDebt(false); setPayMethod("cash");
  };

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden font-body">
      <div className="px-5 pt-4 pb-2 flex items-center gap-2.5">
        <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full"><Ico name="arrow-left" size={19} color="var(--ink)" /></button>
        <div className="flex-1 min-w-0">
          <p className="font-display truncate" style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)" }}>{store.name}</p>
          {store.addr && <p className="truncate" style={{ fontSize: 11, color: "var(--muted)" }}>{store.addr}</p>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-24 kz-main">
        <div className="relative mb-3 mt-1">
          <Ico name="search" size={16} style={{ position: "absolute", left: 13, top: 13 }} color="var(--muted)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск товара..."
            className="w-full pl-9 pr-3 py-3 rounded-xl outline-none" style={{ background: "#F2F1F8", fontSize: 13.5, color: "var(--ink)" }} />
        </div>
        <div className="flex gap-2 overflow-x-auto mb-4 pb-1" style={{ scrollbarWidth: "none" }}>
          <button onClick={() => setActiveCat(null)} className="shrink-0 px-3.5 py-2 rounded-full font-semibold"
            style={{ fontSize: 12, background: !activeCat ? "var(--navy)" : "#F2F1F8", color: !activeCat ? "#fff" : "var(--ink)" }}>Все</button>
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setActiveCat(c.id)} className="shrink-0 px-3.5 py-2 rounded-full font-semibold flex items-center gap-1"
              style={{ fontSize: 12, background: activeCat === c.id ? "var(--navy)" : "#F2F1F8", color: activeCat === c.id ? "#fff" : "var(--ink)" }}>
              <span>{c.emoji}</span>{c.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => (
            <ProductCard key={p.id} p={p} qty={cart[p.id] || 0}
              onAdd={() => setCart({ ...cart, [p.id]: 1 })}
              onInc={() => setCart({ ...cart, [p.id]: (cart[p.id] || 0) + 1 })}
              onDec={() => { const n = { ...cart }; if (n[p.id] <= 1) delete n[p.id]; else n[p.id] -= 1; setCart(n); }} />
          ))}
          {filtered.length === 0 && <p className="col-span-2 text-center py-10" style={{ fontSize: 13, color: "var(--muted)" }}>Ничего не найдено</p>}
        </div>
      </div>
      {cartCount > 0 && (
        <div className="absolute bottom-0 left-0 right-0 px-5 pt-3" style={{ background: "#fff", borderTop: "1px solid var(--line)", paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
          <PrimaryButton full onClick={() => setCheckoutOpen(true)}>
            <span className="flex items-center justify-center gap-2">Корзина · {cartCount} · {money(total)}</span>
          </PrimaryButton>
        </div>
      )}

      {checkoutOpen && (
        <Modal title="Оформление заказа" onClose={() => setCheckoutOpen(false)} wide>
          {items.map(({ p, qty }) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px dashed var(--line)" }}>
              <div className="flex-1 min-w-0">
                <p className="truncate" style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>{p.name}</p>
                <p className="font-mono-kz" style={{ fontSize: 12, color: "var(--navy)", fontWeight: 700 }}>{money(p.price * qty)}</p>
              </div>
              <div className="flex items-center gap-1 rounded-lg px-1 py-1" style={{ background: "#F2F1F8" }}>
                <button onClick={() => setCart(qty <= 1 ? Object.fromEntries(Object.entries(cart).filter(([k]) => k != p.id)) : { ...cart, [p.id]: qty - 1 })} className="p-1"><Ico name="minus" size={12} /></button>
                <span className="font-mono-kz" style={{ fontSize: 12, width: 18, textAlign: "center" }}>{qty}</span>
                <button onClick={() => setCart({ ...cart, [p.id]: qty + 1 })} className="p-1"><Ico name="plus" size={12} /></button>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between px-3.5 py-3.5 rounded-xl mt-3" style={{ background: "#FFF6DE", border: "1px solid #FFE49B" }}>
            <div>
              <p style={{ fontSize: 13, color: "var(--ink)", fontWeight: 700 }}>Взять заказ в долг</p>
              <p style={{ fontSize: 11, color: "var(--muted)" }}>Магазин оплатит позже</p>
            </div>
            <Toggle checked={isDebt} onChange={setIsDebt} />
          </div>

          {!isDebt && (
            <div className="mt-3">
              <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 8 }}>Способ оплаты</p>
              <div className="flex gap-2">
                <button onClick={() => setPayMethod("cash")} className="flex-1 rounded-xl py-2.5 font-semibold" style={{ fontSize: 12, background: payMethod === "cash" ? "var(--navy)" : "#F2F1F8", color: payMethod === "cash" ? "#fff" : "var(--ink)" }}>Наличные</button>
                <button onClick={() => setPayMethod("transfer")} className="flex-1 rounded-xl py-2.5 font-semibold" style={{ fontSize: 12, background: payMethod === "transfer" ? "var(--navy)" : "#F2F1F8", color: payMethod === "transfer" ? "#fff" : "var(--ink)" }}>Перевод</button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between py-4">
            <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Итого</span>
            <span className="font-mono-kz" style={{ fontSize: 20, color: "var(--ink)", fontWeight: 800 }}>{money(total)}</span>
          </div>
          <PrimaryButton full disabled={items.length === 0} onClick={submit}>Отправить в обработку</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function AgentOrders({ agent, orders }) {
  const mine = orders.filter((o) => o.type === "agent" && o.agentLogin === agent.login);
  const [open, setOpen] = useState(null);
  if (mine.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 font-body text-center">
        <div className="rounded-full p-5 mb-4" style={{ background: "#F2F1F8" }}><Ico name="clipboard" size={28} color="var(--muted)" /></div>
        <p style={{ fontSize: 14, color: "var(--ink)", fontWeight: 700 }}>Заказов пока нет</p>
      </div>
    );
  }
  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle sub="Заказы, отправленные вами в обработку">Мои заказы</SectionTitle>
      <div className="flex flex-col gap-2.5 kz-list">
        {mine.map((o) => {
          const st = STATUS_STYLE[o.status];
          return (
            <button key={o.id} onClick={() => setOpen(o)} className="text-left rounded-2xl p-3.5" style={{ background: "#fff", border: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono-kz" style={{ fontSize: 12, color: "var(--muted)" }}>{o.id}</span>
                <Badge bg={st.bg} fg={st.fg}>{o.status}</Badge>
              </div>
              <p style={{ fontSize: 13, color: "var(--ink)", fontWeight: 700 }}>{o.shop}</p>
              <div className="flex items-center justify-between mt-1">
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{dt(o.date)}</span>
                <span className="font-mono-kz" style={{ fontSize: 14, color: "var(--ink)", fontWeight: 700 }}>{money(o.total)}</span>
              </div>
              {o.isDebt && <div className="mt-1.5"><Badge bg="#FFF6DE" fg="#8A5A00">В долг</Badge></div>}
            </button>
          );
        })}
      </div>
      {open && (
        <Modal title={open.id} onClose={() => setOpen(null)}>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>{dt(open.date)}</p>
          {open.items.map((it, i) => (
            <div key={i} className="flex justify-between py-2" style={{ borderBottom: "1px dashed var(--line)", fontSize: 13 }}>
              <span>{it.n} × {it.qty}</span>
              <span className="font-mono-kz" style={{ fontWeight: 700 }}>{money(it.price * it.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-3">
            <span style={{ fontWeight: 700 }}>Итого</span>
            <span className="font-mono-kz" style={{ fontWeight: 800, fontSize: 16 }}>{money(open.total)}</span>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AgentNav({ screen, setScreen }) {
  const items = [
    { id: "stores", icon: "store", label: "Магазины" },
    { id: "orders", icon: "clipboard", label: "Заказы" },
  ];
  return <AppNav items={items} active={screen} onPick={setScreen} spread brand={<NavBrand title="Sapar Trade" sub="Торговый представитель" />} />;
}

function AgentApp({ agent, shared, onExit }) {
  const { orders, setOrders, agentStores, setAgentStores, warehouse, addAudit } = shared;
  const [screen, setScreen] = useState("stores");
  const [activeStore, setActiveStore] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const submitOrder = ({ items, total, isDebt, payMethod }) => {
    const order = {
      id: "KZ-" + Math.floor(260000 + Math.random() * 9999),
      date: new Date(), name: activeStore.name, shop: activeStore.name,
      items: items.map((it) => ({ n: it.p.name, price: it.p.price, qty: it.qty })),
      total, isDebt, status: "В обработке", type: "agent",
      agentName: agent.name, agentLogin: agent.login, payMethod,
      phone: activeStore.phone || "—", address: activeStore.addr || "—",
    };
    setOrders([order, ...orders]);
    addAudit(agent.name, "Заказ от торгового представителя", order.id,
      activeStore.name + " · " + money(total) + (isDebt ? " · в долг" : payMethod === "transfer" ? " · перевод" : " · наличные"));
    showToast("Заказ отправлен в обработку ✓");
    setActiveStore(null);
    setScreen("orders");
  };

  return (
    <div className={"relative h-full flex flex-col" + (activeStore ? "" : " kz-app")} style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="px-5 pb-2 flex items-center gap-2.5 kz-head">
        <div className="rounded-xl flex items-center justify-center" style={{ width: 32, height: 32, background: "#fff", border: "1px solid var(--line)" }}><Logo size={24} /></div>
        <div className="flex-1">
          <p className="font-display" style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>{agent.name}</p>
          <p style={{ fontSize: 10, color: "var(--muted)" }}>Торговый представитель</p>
        </div>
        <LangSwitch />
        <button onClick={onExit} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg" style={{ background: "#FCE7E6" }}>
          <Ico name="arrow-left" size={13} color="var(--red)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--red)" }}>Выход</span>
        </button>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeStore ? (
          <AgentStoreOrder store={activeStore} warehouse={warehouse} onBack={() => setActiveStore(null)} onSubmitOrder={submitOrder} />
        ) : (
          <div className="flex-1 overflow-y-auto pb-24 kz-main">
            {screen === "stores"
              ? <AgentStores agent={agent} agentStores={agentStores} setAgentStores={setAgentStores} onOpenStore={setActiveStore} addAudit={addAudit} />
              : <AgentOrders agent={agent} orders={orders} />}
          </div>
        )}
      </div>
      {!activeStore && <AgentNav screen={screen} setScreen={setScreen} />}
      <Toast toast={toast} />
    </div>
  );
}

