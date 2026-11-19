// Sapar Trade — сотрудники. Модуль: «Магазины» — кто зарегистрировался сам, привязка к клиенту 1С, блокировка.
// Новый магазин сразу может заказывать по «Цена Прайс» без «в долг»; после привязки у него цены, долг и лимит по договору 1С.

function ShopLinkModal({ session, shop, onClose, onDone }) {
  const sug = useLive(session, "/api/shops/" + shop.id + "/suggest");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const link = async (c) => {
    setBusy(true); setErr("");
    try { await stApi("/api/shops/" + shop.id + "/link", { method: "POST", token: session.token, body: { clientCode: c } }); onDone(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={"Привязать: " + shop.name} onClose={onClose} wide>
      <div className="px-5 pb-6 overflow-y-auto" style={{ maxHeight: "70vh" }}>
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Выберите клиента из 1С. Заказы магазина перейдут на него, а цены, долг и менеджер возьмутся из 1С.</p>
        <LiveState loading={sug.loading} error={sug.error} onRetry={sug.reload} empty={sug.data && !sug.data.length ? "Похожих клиентов не нашли — введите код ниже" : null} />
        {(sug.data || []).map((c) => (
          <div key={c.code} className="flex items-center gap-2 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</p>
              <p style={{ fontSize: 11, color: "var(--muted)" }}>{[c.code, c.phone, c.manager].filter(Boolean).join(" · ")}</p>
            </div>
            <GhostButton small onClick={() => !busy && link(c.code)}>Привязать</GhostButton>
          </div>
        ))}
        <div className="mt-4">
          <Field label="Или введите код клиента из 1С" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код клиента" />
          {err && <p style={{ fontSize: 12.5, color: "#B3261E", marginBottom: 8 }}>{err}</p>}
          <PrimaryButton full disabled={busy || !code.trim()} onClick={() => link(code.trim())}>Привязать по коду</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

// Проверка каталога: сколько товаров в базе и сколько цен каждого типа пришло из 1С (почему магазин видит мало товаров)
function ShopCatalogDiag({ session, authLost }) {
  const d = useLive(session, "/api/shops/diag", authLost);
  const x = d.data;
  if (!x) return null;
  return (
    <MgCard>
      <p style={{ fontSize: 12.5, fontWeight: 800 }}>Что видят магазины в каталоге</p>
      <p style={{ fontSize: 11.5, color: "var(--muted)" }}>Товаров в базе: <b>{x.products}</b> · есть на складе: <b>{x.inStock}</b></p>
      <p style={{ fontSize: 11.5, color: "var(--muted)" }}>Новый магазин: «{x.newShopType}» — цен: <b>{x.newShopCount}</b>. Запасная цена: «{x.fallbackType}» — цен: <b>{x.fallbackCount}</b></p>
      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Цены из 1С по типам: {x.priceTypes.length ? x.priceTypes.map((t) => t.name + " — " + t.n).join(" · ") : "нет"}</p>
    </MgCard>
  );
}

function AdminShopsLive({ session, authLost, showToast }) {
  const [filter, setFilter] = useState("new");
  const r = useLive(session, "/api/shops?" + stQs({ filter: filter === "all" ? "" : filter }), authLost);
  const [linkFor, setLinkFor] = useState(null);
  const setStatus = async (s, status) => {
    try { await stApi("/api/shops/" + s.id, { method: "PATCH", token: session.token, body: { status } }); showToast(status === "blocked" ? "Магазин заблокирован" : "Магазин разблокирован"); r.reload(); }
    catch (e) { showToast(e.message); }
  };
  return (
    <>
      <ShopCatalogDiag session={session} authLost={authLost} />
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        <LiveChip on={filter === "new"} onClick={() => setFilter("new")}>Ждут привязки</LiveChip>
        <LiveChip on={filter === "all"} onClick={() => setFilter("all")}>Все</LiveChip>
        <LiveChip on={filter === "blocked"} onClick={() => setFilter("blocked")}>Заблокированные</LiveChip>
      </div>
      <LiveState {...r} onRetry={r.reload} empty={r.data && !r.data.length ? (filter === "new" ? "Новых магазинов нет" : "Магазинов нет") : null} />
      {(r.data || []).map((s) => (
        <MgCard key={s.id}>
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 13.5, fontWeight: 800 }}>{s.name}</p>
              <p className="font-mono-kz" style={{ fontSize: 11.5, color: "var(--muted)" }}>{s.phone}{s.contactName ? " · " + s.contactName : ""}</p>
              {s.address && <p style={{ fontSize: 11.5, color: "var(--muted)" }}>{s.address}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono-kz" style={{ fontSize: 13, fontWeight: 800 }}>{stMoney(s.ordersSum)}</p>
              <p style={{ fontSize: 10.5, color: "var(--muted)" }}>{s.orders} заказ.</p>
            </div>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap items-center">
            {s.clientCode ? <Badge bg="#E4F7EA" fg="#127A33">1С: {s.clientName || s.clientCode}</Badge> : <Badge bg="#FFF6DE" fg="#8A5A00">нет в 1С</Badge>}
            {s.status === "blocked" && <Badge bg="#FCE7E6" fg="#B3261E">заблокирован</Badge>}
            <span style={{ fontSize: 10.5, color: "var(--muted)" }}>рег. {stFmtTime(s.createdAt)}{s.lastLoginAt ? " · заходил " + stFmtTime(s.lastLoginAt) : ""}</span>
          </div>
          <div className="flex gap-2 mt-2.5">
            {!s.clientCode && <PrimaryButton small onClick={() => setLinkFor(s)}>Привязать к клиенту 1С</PrimaryButton>}
            <GhostButton small onClick={() => setStatus(s, s.status === "blocked" ? "active" : "blocked")}>{s.status === "blocked" ? "Разблокировать" : "Заблокировать"}</GhostButton>
          </div>
        </MgCard>
      ))}
      {linkFor && <ShopLinkModal session={session} shop={linkFor} onClose={() => setLinkFor(null)} onDone={() => { setLinkFor(null); showToast("Магазин привязан"); r.reload(); }} />}
    </>
  );
}
