// Sapar Trade — торговый представитель. Модуль: заказ по магазину — каталог 1С (Цена Прайс, остатки), корзина, отправка
// Итог пересчитывает сервер по ценам 1С; после отправки агент создаёт в 1С реализацию (непроведённую) для оператора.

function TpOrder({ session, authLost, store, catalog, onBack, onDone, showToast }) {
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState("");
  const [cart, setCart] = useState({});
  const [confirm, setConfirm] = useState(false);
  const [comment, setComment] = useState("");
  const [delivery, setDelivery] = useState(stShift(stToday(), 1));
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(q, 250);
  if (!catalog.data) return <LiveState {...catalog} onRetry={catalog.reload} />;
  const items = catalog.data.items;
  const byCode = Object.fromEntries(items.map((x) => [x.code, x]));
  const needle = dq.trim().toLowerCase();
  const shown = items.filter((x) => (!grp || x.grp === grp) && (!needle || x.name.toLowerCase().includes(needle) || (x.sku || "").toLowerCase().includes(needle))).slice(0, 150);
  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([code, n]) => ({ ...byCode[code], qty: n, sum: n * (byCode[code].price || 0) }));
  const total = lines.reduce((a, l) => a + l.sum, 0);
  const setQty = (code, n) => setCart((c) => ({ ...c, [code]: Math.max(0, Math.round(n * 1000) / 1000) }));
  const send = async () => {
    setBusy(true);
    try {
      const res = await stApi("/api/orders", { method: "POST", token: session.token, body: { clientCode: store.code, items: lines.map((l) => ({ code: l.code, qty: l.qty })), comment, deliveryDate: delivery } });
      showToast(`Заказ ${res.number} отправлен · ${stMoney(res.total)}`);
      onDone();
    } catch (e) { showToast(e.message); }
    setBusy(false);
  };
  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1 mb-2" style={{ fontSize: 12.5, color: "var(--navy)", fontWeight: 700 }}><Ico name="arrow-left" size={14} />Мои магазины</button>
      <MgCard>
        <p style={{ fontSize: 14, fontWeight: 800 }}>{store.name}</p>
        <p style={{ fontSize: 11, color: "var(--muted)" }}>{store.address || ""}{store.debt > 0 ? " · долг " + stMoney(store.debt) : ""}</p>
        <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>Цены: «{catalog.data.priceType}» · остатки из 1С</p>
      </MgCard>
      <LiveSearch value={q} onChange={setQ} placeholder="Поиск товара" />
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        <LiveChip on={!grp} onClick={() => setGrp("")}>Все</LiveChip>
        {catalog.data.groups.map((g) => <LiveChip key={g} on={grp === g} onClick={() => setGrp(g)}>{g}</LiveChip>)}
      </div>
      <MgCard>
        {shown.map((x) => {
          const n = cart[x.code] || 0;
          const noPrice = !(x.price > 0);
          return (
            <div key={x.code} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--line)", opacity: noPrice ? 0.5 : 1 }}>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 12.5, fontWeight: 700 }}>{x.name}</p>
                <p className="font-mono-kz" style={{ fontSize: 11, color: "var(--muted)" }}>
                  {noPrice ? "нет цены" : stMoney(x.price)} · остаток <span style={{ color: x.stock > 0 ? "var(--muted)" : "var(--red)" }}>{stNum(x.stock)} {x.unit || ""}</span>
                </p>
              </div>
              {!noPrice && (
                <div className="flex items-center gap-1 shrink-0">
                  {n > 0 && <button onClick={() => setQty(x.code, n - 1)} className="rounded-full flex items-center justify-center" style={{ width: 30, height: 30, background: "#F2F1F8" }}><Ico name="minus" size={14} /></button>}
                  {n > 0 && <input inputMode="decimal" value={n} onChange={(e) => setQty(x.code, Number(e.target.value.replace(",", ".")) || 0)} className="font-mono-kz text-center rounded-lg" style={{ width: 46, padding: "4px 2px", border: "1px solid var(--line)", fontSize: 13 }} />}
                  <button onClick={() => setQty(x.code, n + 1)} className="rounded-full flex items-center justify-center" style={{ width: 30, height: 30, background: "var(--navy)" }}><Ico name="plus" size={14} color="#fff" /></button>
                </div>
              )}
            </div>
          );
        })}
        {!shown.length && <p style={{ fontSize: 12, color: "var(--muted)" }}>Ничего не найдено</p>}
        {shown.length === 150 && <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>Показаны первые 150 — уточните поиск</p>}
      </MgCard>
      {lines.length > 0 && (
        <div className="sticky bottom-2 mt-2">
          <button onClick={() => setConfirm(true)} className="w-full rounded-2xl px-4 py-3.5 flex items-center justify-between" style={{ background: "var(--navy)", color: "#fff", boxShadow: "0 8px 24px rgba(27,20,100,.25)" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{lines.length} поз. · оформить</span>
            <span className="font-mono-kz" style={{ fontSize: 15, fontWeight: 800 }}>{stMoney(total)}</span>
          </button>
        </div>
      )}
      {confirm && (
        <Modal title="Заказ" onClose={() => setConfirm(false)} wide>
          <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>{store.name}</p>
          {lines.map((l) => (
            <div key={l.code} className="flex justify-between gap-2 py-1" style={{ fontSize: 12.5 }}>
              <span className="flex-1">{l.name}{l.qty > l.stock ? <span style={{ color: "var(--red)" }}> · больше остатка</span> : null}</span>
              <span className="font-mono-kz" style={{ color: "var(--muted)" }}>{stNum(l.qty)} × {stNum(l.price)}</span>
              <span className="font-mono-kz" style={{ fontWeight: 700, minWidth: 90, textAlign: "right" }}>{stMoney(l.sum)}</span>
            </div>
          ))}
          <MgRow l="Итого" v={stMoney(total)} strong />
          <div className="mt-3" />
          <Field label="Доставка" type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} />
          <Field label="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: до обеда" />
          <PrimaryButton full disabled={busy} onClick={send}>{busy ? "Отправляем…" : "Отправить заказ"}</PrimaryButton>
          <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 8 }}>Заказ попадёт администратору и в 1С (реализация, непроведённая — оператор проверит и проведёт).</p>
        </Modal>
      )}
    </>
  );
}
