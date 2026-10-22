// Sapar Trade — прототип. Модуль: Клиент: главная, баннеры, сторис, карточки товаров
// Строки 954–1083 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== CLIENT: HOME ============================== */

function BannerCarousel({ banners }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % banners.length), 3500);
    return () => clearInterval(t);
  }, [banners.length]);
  if (!banners.length) return null;
  const b = banners[i];
  return (
    <div className="relative rounded-2xl overflow-hidden mb-5" style={{ height: 128, background: b.grad }}>
      {b.img && <img src={b.img} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      <div className="absolute inset-0 p-4 flex flex-col justify-end" style={{ background: b.img ? "linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0.05))" : "transparent" }}>
        <p className="font-display text-white" style={{ fontSize: 16, fontWeight: 800 }}>{b.title}</p>
        <p className="font-body text-white" style={{ fontSize: 12, opacity: 0.9 }}>{b.subtitle}</p>
      </div>
      <div className="absolute bottom-2.5 right-3 flex gap-1">
        {banners.map((_, idx) => (
          <span key={idx} className="rounded-full" style={{ width: idx === i ? 12 : 5, height: 5, background: idx === i ? "#fff" : "rgba(255,255,255,0.5)", transition: "width .2s" }} />
        ))}
      </div>
    </div>
  );
}

function StoriesRow({ stories, onOpen, viewed }) {
  return (
    <div className="flex gap-3.5 overflow-x-auto mb-5 pb-1" style={{ scrollbarWidth: "none" }}>
      {stories.length === 0 ? (
        <span className="font-body" style={{ fontSize: 12, color: "var(--muted)" }}>Историй пока нет</span>
      ) : (
        <button onClick={onOpen} className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="rounded-full p-toggle" style={{ background: viewed ? "#D9D7E6" : "conic-gradient(from 90deg, var(--red), var(--yellow), var(--navy), var(--red))" }}>
            <div className="rounded-full flex items-center justify-center" style={{ width: 60, height: 60, background: "#fff" }}>
              <Logo size={48} />
            </div>
          </div>
          <span className="font-body" style={{ fontSize: 10.5, color: "var(--ink)", fontWeight: 600 }}>Sapar Trade</span>
        </button>
      )}
    </div>
  );
}

function ProductCard({ p, qty, onAdd, onInc, onDec }) {
  return (
    <div className="rounded-2xl p-3 flex flex-col" style={{ background: "#fff", border: "1px solid var(--line)" }}>
      <div className="rounded-xl mb-2.5 flex items-center justify-center" style={{ height: 74, background: "#F2F1F8", fontSize: 30 }}>
        {CATEGORIES.find((c) => c.id === p.cat)?.emoji}
      </div>
      <p className="font-body" style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 600, lineHeight: 1.3, minHeight: 32 }}>{p.name}</p>
      <p className="font-mono-kz mt-1.5 mb-2.5" style={{ fontSize: 15, color: "var(--navy)", fontWeight: 700 }}>{money(p.price)}</p>
      {qty > 0 ? (
        <div className="flex items-center justify-between rounded-xl px-1 py-1" style={{ background: "var(--navy)" }}>
          <button onClick={onDec} className="p-1.5 text-white"><Ico name="minus" size={14} /></button>
          <span className="font-mono-kz text-white" style={{ fontSize: 13, fontWeight: 700 }}>{qty}</span>
          <button onClick={onInc} className="p-1.5 text-white"><Ico name="plus" size={14} /></button>
        </div>
      ) : (
        <button onClick={onAdd} className="font-body rounded-xl py-2 flex items-center justify-center gap-1" style={{ background: "#F2F1F8", color: "var(--navy)", fontSize: 12.5, fontWeight: 700 }}>
          <Ico name="plus" size={13} /> В корзину
        </button>
      )}
    </div>
  );
}

function ClientHome({ profile, cart, setCart, banners, stories, storiesViewed, onOpenStories, notifications, onOpenNotifs, monthSpend, cashback, bonusAvailable }) {
  const [activeCat, setActiveCat] = useState(null);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => PRODUCTS.filter((p) =>
    (!activeCat || p.cat === activeCat) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))
  ), [activeCat, q]);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>Здравствуйте,</p>
          <p className="font-display" style={{ fontSize: 17, fontWeight: 800, color: "var(--ink)" }}>{profile.name || "Гость"}</p>
        </div>
        <div className="flex items-center gap-2">
        <LangSwitch />
        <button onClick={onOpenNotifs} className="relative p-2.5 rounded-full" style={{ background: "#F2F1F8" }}>
          <Ico name="bell" size={18} color="var(--ink)" />
          {unread > 0 && <span className="absolute rounded-full" style={{ top: 6, right: 6, width: 8, height: 8, background: "var(--red)" }} />}
        </button>
        </div>
      </div>

      <StoriesRow stories={stories} onOpen={onOpenStories} viewed={storiesViewed} />
      <CashbackCard monthSpend={monthSpend} cashback={cashback} available={bonusAvailable} compact />
      <BannerCarousel banners={banners} />

      <div className="relative mb-4">
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

      <div className="flex items-center justify-between mb-2.5">
        <span className="font-mono-kz" style={{ fontSize: 11, color: "var(--muted)" }}>Показано {filtered.length} из 30 412 товаров</span>
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
  );
}

