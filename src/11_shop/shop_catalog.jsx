// Sapar Trade — «Магазин». Модуль: каталог, корзина и оформление заказа.
// Цены и итог на экране — для удобства; настоящую сумму при оформлении считает сервер по договору магазина.

function ShopQty({ qty, onChange, disabled }) {
  const set = (v) => onChange(Math.max(0, Math.min(100000, Math.round(v * 1000) / 1000)));
  if (disabled) return <span style={{ fontSize: 11.5, color: "#B3261E", fontWeight: 700 }}>Нет в наличии</span>;
  if (!qty) return <button onClick={() => set(1)} className="px-4 py-2 rounded-xl font-bold press-98" style={{ background: "var(--navy)", color: "#fff", fontSize: 12.5 }}>В корзину</button>;
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => set(qty - 1)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#F2F1F8" }} aria-label="Меньше"><Ico name="minus" size={14} /></button>
      <input value={qty} onChange={(e) => set(parseFloat(String(e.target.value).replace(",", ".")) || 0)} inputMode="decimal" className="font-mono-kz text-center outline-none"
        style={{ width: 46, height: 32, border: "1.5px solid var(--line)", borderRadius: 8, fontSize: 13, fontWeight: 700 }} />
      <button onClick={() => set(qty + 1)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--navy)" }} aria-label="Больше"><Ico name="plus" size={14} color="#fff" /></button>
    </div>
  );
}

function ShopCatalog({ cart, setCart, onAuthLost, onOpenCart }) {
  const cat = useShopLive("/api/shop/catalog", onAuthLost);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const items = useMemo(() => {
    const all = (cat.data && cat.data.items) || [];
    const s = q.trim().toLowerCase();
    return all.filter((i) => (!group || i.group === group) && (!s || i.name.toLowerCase().includes(s)));
  }, [cat.data, q, group]);
  const setQty = (code, v) => setCart((c) => { const n = { ...c }; if (v > 0) n[code] = v; else delete n[code]; return n; });
  const promos = (cat.data && cat.data.promos) || [];
  const lines = Object.keys(cart).length;
  const total = ((cat.data && cat.data.items) || []).reduce((a, i) => a + (cart[i.code] ? cart[i.code] * i.price : 0), 0);
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3">
        <LiveSearch value={q} onChange={setQ} placeholder="Найти товар" />
        {cat.data && cat.data.groups.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            <LiveChip on={!group} onClick={() => setGroup("")}>Все</LiveChip>
            {cat.data.groups.map((g) => <LiveChip key={g} on={group === g} onClick={() => setGroup(g)}>{g}</LiveChip>)}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4" style={{ paddingBottom: lines ? 150 : 90 }}>
        {promos.length > 0 && (
          <div className="rounded-2xl p-3 mt-2" style={{ background: "#FFF6DE", border: "1px solid #F1DCA0" }}>
            <p className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 800, color: "#8A5A00" }}><Ico name="gift" size={14} color="#8A5A00" />Акции</p>
            {promos.map((p) => <p key={p.id} style={{ fontSize: 12.5, marginTop: 3 }}><b>{p.title}</b> — {p.label}: {p.giftName} × {p.giftQty}{p.dateTo ? " (до " + stFmtDate(p.dateTo) + ")" : ""}</p>)}
          </div>
        )}
        <LiveState loading={cat.loading} error={cat.error} onRetry={cat.reload} empty={cat.data && !items.length ? (q || group ? "Ничего не найдено" : "Каталог пока пуст") : null} />
        {items.map((i) => (
          <div key={i.code} className="flex items-center gap-3 py-3" style={{ borderBottom: "1px solid var(--line)", opacity: i.inStock ? 1 : 0.65 }}>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", lineHeight: 1.3 }}>{i.name}</p>
              {promos.filter((p) => p.buyCode === i.code).map((p) => <div key={p.id}><PromoTag p={p} n={cart[i.code] || 0} /></div>)}
              <p className="font-mono-kz" style={{ fontSize: 12.5, color: "var(--navy)", fontWeight: 700, marginTop: 2 }}>{stMoney(i.price)}{i.unit ? <span style={{ color: "var(--muted)", fontWeight: 500 }}> / {i.unit}</span> : null}</p>
            </div>
            <ShopQty qty={cart[i.code] || 0} onChange={(v) => setQty(i.code, v)} disabled={!i.inStock} />
          </div>
        ))}
      </div>
      {lines > 0 && (
        <div className="absolute left-0 right-0 px-4" style={{ bottom: 72 }}>
          <button onClick={onOpenCart} className="w-full rounded-2xl px-4 py-3.5 flex items-center justify-between press-98" style={{ background: "var(--navy)", color: "#fff" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Корзина · {lines} поз.</span>
            <span className="font-mono-kz" style={{ fontSize: 14, fontWeight: 800 }}>{stMoney(total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ShopCartModal({ cart, setCart, onClose, onAuthLost, onDone }) {
  const cat = useShopLive("/api/shop/catalog", onAuthLost);
  const debt = useShopLive("/api/shop/debt", onAuthLost);
  const [payment, setPayment] = useState("cash");
  const [comment, setComment] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const byCode = new Map(((cat.data && cat.data.items) || []).map((i) => [i.code, i]));
  const lines = Object.entries(cart).map(([code, qty]) => ({ code, qty, it: byCode.get(code) })).filter((l) => l.it);
  const total = lines.reduce((a, l) => a + l.qty * l.it.price, 0);
  const gifts = promoGiftsFor((cat.data && cat.data.promos) || [], (code) => cart[code]);
  const d = debt.data;
  const debtOn = d && d.limit > 0;
  const setQty = (code, v) => setCart((c) => { const n = { ...c }; if (v > 0) n[code] = v; else delete n[code]; return n; });
  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const r = await shopApi("/api/shop/orders", { method: "POST", body: { items: lines.map((l) => ({ code: l.code, qty: l.qty })), payment, comment: comment.trim() || undefined, deliveryDate: date || undefined } });
      onDone(r);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Корзина" onClose={onClose} wide>
      <div className="px-5 pb-6 overflow-y-auto" style={{ maxHeight: "70vh" }}>
        <LiveState loading={cat.loading} error={cat.error} onRetry={cat.reload} empty={!lines.length && !cat.loading ? "Корзина пуста" : null} />
        {lines.map((l) => (
          <div key={l.code} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{l.it.name}</p>
              <p className="font-mono-kz" style={{ fontSize: 11.5, color: "var(--muted)" }}>{stMoney(l.it.price)} × {stNum(l.qty)} = <b style={{ color: "var(--ink)" }}>{stMoney(l.it.price * l.qty)}</b></p>
            </div>
            <ShopQty qty={l.qty} onChange={(v) => setQty(l.code, v)} />
          </div>
        ))}
        {gifts.map((p) => <GiftLine key={p.id} name={p.giftName} qty={p.giftQty} unit={p.giftUnit} title={p.title} />)}
        {!!lines.length && (
          <>
            <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, margin: "14px 0 6px" }}>Оплата</p>
            <div className="flex gap-2 mb-1">
              {[["cash", "Наличными"], ["transfer", "Переводом"], ["debt", "В долг"]].map(([id, label]) => {
                const off = id === "debt" && !debtOn;
                return (
                  <button key={id} disabled={off} onClick={() => setPayment(id)} className="flex-1 py-2.5 rounded-xl font-semibold"
                    style={{ fontSize: 12.5, border: "1.5px solid " + (payment === id ? "var(--navy)" : "var(--line)"), background: payment === id ? "#EEF0FF" : "#fff", color: off ? "#B5B3C6" : "var(--ink)" }}>{label}</button>
                );
              })}
            </div>
            {debtOn
              ? <p style={{ fontSize: 11.5, color: "var(--muted)" }}>В долг доступно: <b>{stMoney(d.available)}</b></p>
              : <p style={{ fontSize: 11.5, color: "var(--muted)" }}>«В долг» подключает менеджер. Позвоните в офис, если нужно.</p>}
            {payment === "debt" && total > (d ? d.available : 0) && <p style={{ fontSize: 12, color: "#B3261E", marginTop: 4 }}>Сумма больше доступного лимита — выберите другую оплату.</p>}
            <label className="block mt-3">
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Доставить к дате (необязательно)</span>
              <input type="date" value={date} min={stToday()} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 px-3.5 py-3 rounded-xl outline-none" style={{ border: "1.5px solid var(--line)", fontSize: 14 }} />
            </label>
            <label className="block mt-3">
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Комментарий</span>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={500} className="w-full mt-1 px-3.5 py-3 rounded-xl outline-none" style={{ border: "1.5px solid var(--line)", fontSize: 14 }} />
            </label>
            {err && <p style={{ fontSize: 12.5, color: "#B3261E", margin: "10px 0" }}>{err}</p>}
            <div className="flex items-center justify-between mt-4 mb-3">
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Итого</span>
              <span className="font-mono-kz" style={{ fontSize: 18, fontWeight: 800 }}>{stMoney(total)}</span>
            </div>
            <PrimaryButton full disabled={busy || (payment === "debt" && (!debtOn || total > d.available))} onClick={submit}>{busy ? "Отправляем…" : "Оформить заказ"}</PrimaryButton>
            <p className="text-center" style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Окончательную сумму посчитает сервер по цене вашего договора.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
