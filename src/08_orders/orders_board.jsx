// Sapar Trade — заказы. Модуль: список заказов с фильтрами, составом, историей, статусом в 1С и кнопками действий
// Используется администратором (все заказы) и ТП (свои). Обновляется автоматически раз в 30 секунд.

const ORDER_FILTERS = [["new", "Новые", ["Новый"]], ["work", "В работе", ["Принят", "Собран"]], ["done", "Отгружены", ["Отгружен"]], ["cancel", "Отменённые", ["Отменён"]], ["all", "Все", null]];
const PACK_FILTERS = [["pack", "К сборке", ["Принят"]], ["packed", "Собраны", ["Собран"]]];
const ORDER_ACTIONS = { "Новый": [["Принят", "Принять и отправить на склад"], ["Отменён", "Отменить"]], "Принят": [["Собран", "Собран"], ["Отменён", "Отменить"]], "Собран": [["Отгружен", "Отгружен"], ["Отменён", "Отменить"]] };
const ORDER_COLORS = { "Новый": ["#EEF0FF", "var(--navy)"], "Принят": ["#FFF6DE", "#8A5A00"], "Собран": ["#FFF6DE", "#8A5A00"], "Отгружен": ["#E4F7E9", "#127A33"], "Отменён": ["#F2F1F8", "var(--muted)"] };

function Order1C({ o }) {
  if (o.onec_status === "sent") return <Badge bg="#E4F7E9" fg="#127A33">1С: {o.onec_number || "создан"}</Badge>;
  if (o.onec_status === "error") return <Badge bg="#FCE7E6" fg="#B3261E">ошибка 1С</Badge>;
  if (o.onec_status === "pending") return <Badge bg="#F2F1F8" fg="var(--muted)">ждёт отправки в 1С</Badge>;
  if (o.onec_status === "skip" && o.status === "Новый") return <Badge bg="#F2F1F8" fg="var(--muted)">в 1С — после «Принять»</Badge>;
  return null;
}

// есть ли у заказа проблема склада, которую оператор ещё не отметил «Решено»
const orderProblem = (o) => { const e = (o.events || []).filter((x) => x.event === "Проблема склада" || x.event === "Проблема решена").pop(); return e && e.event === "Проблема склада" ? e : null; };

function OrdersBoard({ session, authLost, showToast, defaultFilter = "new", title }) {
  const canAccept = liveCan(session, "orders.accept");
  const packOnly = !canAccept && liveCan(session, "orders.pack"); // склад: только принятые и собранные, без денег
  const FILTERS = packOnly ? PACK_FILTERS : ORDER_FILTERS;
  const [filter, setFilter] = useState(packOnly ? "pack" : defaultFilter);
  const [open, setOpen] = useState(null);
  const r = useLive(session, "/api/orders", authLost, 30000);
  const all = r.data || [];
  const f = FILTERS.find((x) => x[0] === filter) || FILTERS[0];
  const list = f[2] ? all.filter((o) => f[2].includes(o.status)) : all;
  const count = (st) => all.filter((o) => st.includes(o.status)).length;
  const canManage = canAccept;
  const act = async (o, status) => {
    if (status === "Отменён" && !window.confirm(`Отменить заказ ${o.number}?`)) return;
    try {
      const res = await stApi("/api/orders/" + o.id, { method: "PATCH", token: session.token, body: { status } });
      showToast(res.note || `${o.number}: ${status}`); r.reload();
    } catch (e) { showToast(e.message); }
  };
  const problem = async (o) => {
    const note = window.prompt("Что случилось? Например: не хватает товара, брак");
    if (!note || !note.trim()) return;
    try { await stApi("/api/orders/" + o.id + "/problem", { method: "POST", token: session.token, body: { note } }); showToast("Оператор увидит проблему"); r.reload(); }
    catch (e) { showToast(e.message); }
  };
  const solved = async (o) => {
    try { await stApi("/api/orders/" + o.id + "/problem-solved", { method: "POST", token: session.token, body: {} }); showToast("Проблема отмечена решённой"); r.reload(); }
    catch (e) { showToast(e.message); }
  };
  const retry = async (o) => {
    try { await stApi("/api/orders/" + o.id + "/retry-1c", { method: "POST", token: session.token }); showToast("Агент создаст в 1С в течение 5 минут"); r.reload(); }
    catch (e) { showToast(e.message); }
  };
  return (
    <>
      {title}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {FILTERS.map(([id, l, st]) => <LiveChip key={id} on={filter === id} onClick={() => setFilter(id)}>{l}{st && count(st) ? " · " + count(st) : ""}</LiveChip>)}
      </div>
      <LiveState {...r} onRetry={r.reload} empty={r.data && !list.length ? "Заказов нет" : null} />
      <div className="kz-list">
        {list.map((o) => {
          const [bg, fg] = ORDER_COLORS[o.status];
          const mineNew = o.status === "Новый" && o.created_by === session.user.id;
          const actions = (ORDER_ACTIONS[o.status] || []).filter(([st]) => canManage || (packOnly && st === "Собран") || (mineNew && st === "Отменён"));
          const prob = orderProblem(o);
          return (
            <MgCard key={o.id}>
              <div onClick={() => setOpen(open === o.id ? null : o.id)} style={{ cursor: "pointer" }}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13.5, fontWeight: 800 }}>{o.client_name}</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>{o.number} · {stFmtTime(o.created_at)} · {o.creator}{o.manager && o.manager !== o.creator ? " · ТП " + o.manager : ""}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {!packOnly && <p className="font-mono-kz" style={{ fontSize: 14, fontWeight: 800 }}>{stMoney(o.total)}</p>}
                    <Badge bg={bg} fg={fg}>{o.status}</Badge>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                  {prob && <Badge bg="#FCE7E6" fg="#B3261E">проблема склада</Badge>}
                  {o.source === "shop" && !packOnly && <Badge bg="#EEF0FF" fg="var(--navy)">Магазин · {SHOP_PAY[o.payment] || o.payment}</Badge>}
                  {o.source === "shop" && String(o.client_code).startsWith("NEW-") && <Badge bg="#FFF6DE" fg="#8A5A00">нет в 1С</Badge>}
                  <Order1C o={o} />
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{(o.items || []).length} поз.{o.delivery_date ? " · доставка " + stFmtDate(o.delivery_date) : ""}</span>
                </div>
              </div>
              {open === o.id && (
                <div className="mt-2 pt-2" style={{ borderTop: "1px dashed var(--line)" }}>
                  {(o.items || []).map((it, i) => (
                    <div key={i} className="flex justify-between gap-2 py-1" style={{ fontSize: 12.5, ...(it.gift ? { background: "#E3F5E9", color: "#127A33", fontWeight: 700, borderRadius: 8, padding: "4px 6px" } : null) }}>
                      <span className="flex-1">{it.gift ? <Ico name="gift" size={12} color="#127A33" style={{ display: "inline", marginRight: 4 }} /> : null}{it.name}</span>
                      <span className="font-mono-kz" style={{ color: "var(--muted)" }}>{stNum(it.qty)} {it.unit || ""}{packOnly ? "" : " × " + stNum(it.price)}</span>
                      {!packOnly && <span className="font-mono-kz" style={{ fontWeight: 700, minWidth: 90, textAlign: "right" }}>{stMoney(it.sum)}</span>}
                    </div>
                  ))}
                  {o.comment && <p style={{ fontSize: 12, marginTop: 6 }}>💬 {o.comment}</p>}
                  {prob && <p style={{ fontSize: 12, color: "#B3261E", marginTop: 6, fontWeight: 700 }}>⚠ Склад: {prob.note}</p>}
                  {o.onec_status === "error" && <p style={{ fontSize: 11.5, color: "#B3261E", marginTop: 6 }}>Ошибка 1С: {o.onec_error}</p>}
                  {(o.events || []).length > 0 && (
                    <div className="mt-2">
                      {(o.events || []).map((e, i) => <p key={i} style={{ fontSize: 10.5, color: "var(--muted)" }}>{stFmtTime(e.at)} · {e.event}{e.user ? " · " + e.user : ""}{e.note ? " — " + e.note : ""}</p>)}
                    </div>
                  )}
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {actions.map(([st, label]) => <GhostButton key={st} small onClick={() => act(o, st)}>{label}</GhostButton>)}
                    {canManage && o.onec_status === "error" && <GhostButton small onClick={() => retry(o)}>Отправить в 1С ещё раз</GhostButton>}
                    {canManage && o.onec_status === "skip" && o.status !== "Отменён" && o.status !== "Новый" && <GhostButton small onClick={() => retry(o)}>Отправить в 1С</GhostButton>}
                    {(packOnly || canManage) && ["Принят", "Собран"].includes(o.status) && !prob && <GhostButton small onClick={() => problem(o)}>Проблема</GhostButton>}
                    {canManage && prob && <GhostButton small onClick={() => solved(o)}>Решено</GhostButton>}
                  </div>
                </div>
              )}
            </MgCard>
          );
        })}
      </div>
    </>
  );
}
