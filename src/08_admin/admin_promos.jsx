// Sapar Trade — акции с подарком. Модуль: экран «Акции» для владельца и директора (ТЗ TZ_PLAN_PROMO)
// Акция: «купи N штук товара — получи M штук подарка», один раз на заказ. Товары берутся из каталога 1С.

// Помощники для каталога и корзины (ТП и магазин): подарки, которые положены к корзине. Окончательно подарок считает сервер.
function promoGiftsFor(promos, qtyOf /* код товара → количество в корзине */) {
  return (promos || []).filter((p) => (qtyOf(p.buyCode) || 0) >= p.buyQty);
}
// Значок акции у товара: надпись + подсказка, сколько ещё до подарка
function PromoTag({ p, n }) {
  const got = n >= p.buyQty;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ fontSize: 10.5, fontWeight: 700, background: got ? "#E3F5E9" : "#FFF6DE", color: got ? "#127A33" : "#8A5A00", marginTop: 3 }}>
      <Ico name="gift" size={11} />{p.label}: подарок {p.giftName} × {p.giftQty}{got ? " — будет в заказе" : n > 0 ? " (ещё " + (p.buyQty - n) + ")" : ""}
    </span>
  );
}
// Строка подарка в корзине / заказе: выделена зелёным, цена 0
function GiftLine({ name, qty, unit, title }) {
  return (
    <div className="flex justify-between gap-2 py-1.5 px-2 rounded-lg my-1" style={{ fontSize: 12.5, background: "#E3F5E9", color: "#127A33" }}>
      <span className="flex-1 flex items-center gap-1.5"><Ico name="gift" size={13} color="#127A33" /><span><b>Подарок:</b> {name}{title ? <span style={{ fontWeight: 400 }}> · {title}</span> : null}</span></span>
      <span className="font-mono-kz" style={{ fontWeight: 700 }}>{stNum(qty)} {unit || ""} · 0 ₸</span>
    </div>
  );
}

// Выбор товара из списка: строка поиска + найденные позиции (с остатком)
function PromoProductPicker({ label, items, value, onChange }) {
  const [text, setText] = useState("");
  const picked = items.find((x) => x.code === value);
  const found = text.trim().length < 2 ? [] : items.filter((x) => x.name.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 30);
  return (
    <div className="mb-3">
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{label}</label>
      {picked && (
        <div className="rounded-xl px-3 py-2 mt-1 flex items-center gap-2" style={{ background: "#EEF0FF", border: "1.5px solid var(--navy)" }}>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 13, fontWeight: 700 }}>{picked.name}</p>
            <p style={{ fontSize: 11, color: "var(--muted)" }}>На складе: {Number(picked.stock)} {picked.unit || ""}</p>
          </div>
          <button onClick={() => { onChange(""); setText(""); }} className="p-1 rounded-full" style={{ background: "#fff" }}><Ico name="x" size={14} /></button>
        </div>
      )}
      {!picked && (
        <>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Начните вводить название товара" className="w-full px-3 py-2.5 rounded-xl mt-1" style={{ border: "1.5px solid var(--line)", fontSize: 14 }} />
          {text.trim().length >= 2 && !found.length && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Ничего не найдено</p>}
          {found.map((x) => (
            <button key={x.code} onClick={() => onChange(x.code)} className="w-full text-left rounded-xl px-3 py-2 mt-1.5 press-98" style={{ background: "#fff", border: "1px solid var(--line)" }}>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{x.name}</p>
              <p style={{ fontSize: 11, color: "var(--muted)" }}>{x.grp} · на складе {Number(x.stock)} {x.unit || ""}</p>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function PromoEditor({ session, promo, items, onClose, onSaved }) {
  const [f, setF] = useState(promo ? {
    title: promo.title, label: promo.label || "", buyCode: promo.buyCode, buyQty: String(promo.buyQty), giftCode: promo.giftCode, giftQty: String(promo.giftQty),
    dateFrom: promo.dateFrom || "", dateTo: promo.dateTo || "", active: promo.active,
  } : { title: "", label: "", buyCode: "", buyQty: "", giftCode: "", giftQty: "", dateFrom: "", dateTo: "", active: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const num = (v) => Number(String(v).replace(",", ".")) || 0;
  const ready = f.title.trim() && f.buyCode && f.giftCode && num(f.buyQty) > 0 && num(f.giftQty) > 0;
  const by = (c) => items.find((x) => x.code === c);
  const preview = ready ? `${by(f.buyCode) ? by(f.buyCode).name : ""}: ${num(f.buyQty)} + подарок ${by(f.giftCode) ? by(f.giftCode).name : ""} ${num(f.giftQty)}` : "";
  const save = async () => {
    setBusy(true); setErr("");
    const body = { title: f.title, label: f.label, buyCode: f.buyCode, buyQty: num(f.buyQty), giftCode: f.giftCode, giftQty: num(f.giftQty), dateFrom: f.dateFrom || null, dateTo: f.dateTo || null, active: f.active };
    try {
      await stApi(promo ? "/api/promos/" + promo.id : "/api/promos", { method: promo ? "PUT" : "POST", token: session.token, body });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const inp = { border: "1.5px solid var(--line)", fontSize: 14 };
  return (
    <Modal title={promo ? "Изменить акцию" : "Новая акция"} onClose={onClose} wide>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Название акции</label>
      <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Например: Зиги Заги — 100 блоков + 5 в подарок" className="w-full px-3 py-2.5 rounded-xl mb-3 mt-1" style={inp} />
      <PromoProductPicker label="Товар, который нужно купить" items={items} value={f.buyCode} onChange={(v) => set("buyCode", v)} />
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Сколько нужно купить (от)</label>
      <input inputMode="decimal" value={f.buyQty} onChange={(e) => set("buyQty", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="100" className="w-full px-3 py-2.5 rounded-xl mb-3 mt-1 font-mono-kz" style={inp} />
      <PromoProductPicker label="Подарок (берётся со склада)" items={items} value={f.giftCode} onChange={(v) => set("giftCode", v)} />
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Сколько дарим</label>
      <input inputMode="decimal" value={f.giftQty} onChange={(e) => set("giftQty", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="5" className="w-full px-3 py-2.5 rounded-xl mb-3 mt-1 font-mono-kz" style={inp} />
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Надпись в каталоге (можно не заполнять)</label>
      <input value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="100 + 5 в подарок" className="w-full px-3 py-2.5 rounded-xl mb-3 mt-1" style={inp} />
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Начало акции</label>
          <input type="date" value={f.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} className="w-full px-3 py-2.5 rounded-xl mt-1" style={inp} />
        </div>
        <div className="flex-1">
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Конец акции</label>
          <input type="date" value={f.dateTo} onChange={(e) => set("dateTo", e.target.value)} className="w-full px-3 py-2.5 rounded-xl mt-1" style={inp} />
        </div>
      </div>
      <label className="flex items-center gap-2 mb-3" style={{ fontSize: 13 }}>
        <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Акция включена
      </label>
      {preview && <p className="rounded-xl px-3 py-2 mb-3" style={{ fontSize: 12, background: "#F7F7FB", color: "var(--ink)" }}>{preview}. Подарок даётся один раз на заказ.</p>}
      {err && <p style={{ fontSize: 12.5, color: "#B3261E", margin: "8px 0" }}>{err}</p>}
      <PrimaryButton full disabled={busy || !ready} onClick={save}>{promo ? "Сохранить" : "Создать акцию"}</PrimaryButton>
    </Modal>
  );
}

function AdminPromos({ session, authLost, showToast }) {
  const r = useLive(session, "/api/promos", authLost);
  const cat = useLive(session, "/api/catalog", authLost);
  const [edit, setEdit] = useState(null); // null | "new" | акция
  const items = cat.data ? cat.data.items : [];
  const done = (msg) => { setEdit(null); showToast(msg); r.reload(); };
  const act = async (fn, msg) => { try { await fn(); showToast(msg); r.reload(); } catch (e) { if (e.status === 401) authLost(e.message); else showToast(e.message); } };
  const state = (p) => !p.active ? ["Выключена", "#8E8CA3"] : p.running ? ["Действует", "#1FA854"] : p.dateFrom && p.dateFrom > stToday() ? ["Ещё не началась", "#8A5A00"] : ["Закончилась", "#8E8CA3"];
  const body = (p) => ({ title: p.title, label: p.label, buyCode: p.buyCode, buyQty: p.buyQty, giftCode: p.giftCode, giftQty: p.giftQty, dateFrom: p.dateFrom, dateTo: p.dateTo });
  return (
    <>
      <PrimaryButton full onClick={() => setEdit("new")} disabled={!cat.data}>+ Новая акция</PrimaryButton>
      <div className="mt-3">
        <LiveState loading={r.loading || cat.loading} error={r.error || cat.error} onRetry={() => { r.reload(); cat.reload(); }} empty={r.data && !r.data.items.length ? "Акций пока нет. Создайте первую: товар, сколько купить и подарок" : null} />
        {(r.data ? r.data.items : []).map((p) => {
          const [st, col] = state(p);
          const low = p.giftStock !== undefined && p.giftStock < p.giftQty;
          return (
            <MgCard key={p.id}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 14, fontWeight: 800 }}>{p.title}</p>
                  <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{p.label}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: col }}>{st}</span>
              </div>
              <div className="mt-2">
                <MgRow l="Купить" v={p.buyName + " × " + p.buyQty} />
                <MgRow l="Подарок" v={p.giftName + " × " + p.giftQty} />
                <MgRow l="Период" v={(p.dateFrom ? stFmtDate(p.dateFrom) : "без начала") + " — " + (p.dateTo ? stFmtDate(p.dateTo) : "без конца")} />
                <MgRow l="Подарка на складе" v={p.giftStock + " " + (p.giftUnit || "")} color={low ? "var(--red)" : undefined} />
              </div>
              {low && <p style={{ fontSize: 11.5, color: "var(--red)", marginTop: 4 }}>На складе меньше, чем положено в подарок — заказы получат остаток.</p>}
              <div className="flex gap-2 mt-3">
                <GhostButton small onClick={() => setEdit(p)}>Изменить</GhostButton>
                <GhostButton small onClick={() => act(() => stApi("/api/promos/" + p.id, { method: "PUT", token: session.token, body: { ...body(p), active: !p.active } }), p.active ? "Акция выключена" : "Акция включена")}>{p.active ? "Выключить" : "Включить"}</GhostButton>
                <GhostButton small onClick={() => { if (window.confirm("Удалить акцию «" + p.title + "»? В уже оформленных заказах подарки останутся.")) act(() => stApi("/api/promos/" + p.id, { method: "DELETE", token: session.token }), "Акция удалена"); }}>Удалить</GhostButton>
              </div>
            </MgCard>
          );
        })}
      </div>
      {edit && <PromoEditor key={edit === "new" ? "new" : edit.id} session={session} promo={edit === "new" ? null : edit} items={items} onClose={() => setEdit(null)} onSaved={() => done("Акция сохранена")} />}
    </>
  );
}
