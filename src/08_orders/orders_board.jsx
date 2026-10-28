// Sapar Trade — заказы. Модуль: список заказов с фильтрами, составом, историей, статусом в 1С и кнопками действий
// Используется администратором (все заказы) и ТП (свои). Обновляется автоматически раз в 30 секунд.

const ORDER_FILTERS = [["new", "Новые", ["Новый"]], ["work", "В работе", ["Принят", "Собран"]], ["done", "Отгружены", ["Отгружен"]], ["cancel", "Отменённые", ["Отменён"]], ["all", "Все", null]];
const ORDER_ACTIONS = { "Новый": [["Принят", "Принять"], ["Отменён", "Отменить"]], "Принят": [["Собран", "Собран"], ["Отменён", "Отменить"]], "Собран": [["Отгружен", "Отгружен"], ["Отменён", "Отменить"]] };
const ORDER_COLORS = { "Новый": ["#EEF0FF", "var(--navy)"], "Принят": ["#FFF6DE", "#8A5A00"], "Собран": ["#FFF6DE", "#8A5A00"], "Отгружен": ["#E4F7E9", "#127A33"], "Отменён": ["#F2F1F8", "var(--muted)"] };

function Order1C({ o }) {
  if (o.onec_status === "sent") return <Badge bg="#E4F7E9" fg="#127A33">1С: {o.onec_number || "создан"}</Badge>;
  if (o.onec_status === "error") return <Badge bg="#FCE7E6" fg="#B3261E">ошибка 1С</Badge>;
  if (o.onec_status === "pending") return <Badge bg="#F2F1F8" fg="var(--muted)">ждёт отправки в 1С</Badge>;
  return null;
}

function OrdersBoard({ session, authLost, showToast, defaultFilter = "new", title }) {
  const [filter, setFilter] = useState(defaultFilter);
  const [open, setOpen] = useState(null);
  const r = useLive(session, "/api/orders", authLost, 30000);
  const all = r.data || [];
  const f = ORDER_FILTERS.find((x) => x[0] === filter);
  const list = f[2] ? all.filter((o) => f[2].includes(o.status)) : all;
  const count = (st) => all.filter((o) => st.includes(o.status)).length;
  const canManage = liveCan(session, "orders.manage");
  const act = async (o, status) => {
    if (status === "Отменён" && !window.confirm(`Отменить заказ ${o.number}?`)) return;
    try {
      const res = await stApi("/api/orders/" + o.id, { method: "PATCH", token: session.token, body: { status } });
      showToast(res.note || `${o.number}: ${status}`); r.reload();
    } catch (e) { showToast(e.message); }
  };
  const retry = async (o) => {
    try { await stApi("/api/orders/" + o.id + "/retry-1c", { method: "POST", token: session.token }); showToast("Отправим в 1С ещё раз"); r.reload(); }
    catch (e) { showToast(e.message); }
  };
  return (
    <>
      {title}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {ORDER_FILTERS.map(([id, l, st]) => <LiveChip key={id} on={filter === id} onClick={() => setFilter(id)}>{l}{st && count(st) ? " · " + count(st) : ""}</LiveChip>)}
      </div>
      <LiveState {...r} onRetry={r.reload} empty={r.data && !list.length ? "Заказов нет" : null} />
      <div className="kz-list">
        {list.map((o) => {
          const [bg, fg] = ORDER_COLORS[o.status];
          const mineNew = o.status === "Новый" && o.created_by === session.user.id;
          const actions = (ORDER_ACTIONS[o.status] || []).filter(([st]) => canManage || (mineNew && st === "Отменён"));
          return (
            <MgCard key={o.id}>
              <div onClick={() => setOpen(open === o.id ? null : o.id)} style={{ cursor: "pointer" }}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13.5, fontWeight: 800 }}>{o.client_name}</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>{o.number} · {stFmtTime(o.created_at)} · {o.creator}{o.manager && o.manager !== o.creator ? " · ТП " + o.manager : ""}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono-kz" style={{ fontSize: 14, fontWeight: 800 }}>{stMoney(o.total)}</p>
                    <Badge bg={bg} fg={fg}>{o.status}</Badge>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                  <Order1C o={o} />
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{(o.items || []).length} поз.{o.delivery_date ? " · доставка " + stFmtDate(o.delivery_date) : ""}</span>
                </div>
              </div>
              {open === o.id && (
                <div className="mt-2 pt-2" style={{ borderTop: "1px dashed var(--line)" }}>
                  {(o.items || []).map((it, i) => (
                    <div key={i} className="flex justify-between gap-2 py-1" style={{ fontSize: 12.5 }}>
                      <span className="flex-1">{it.name}</span>
                      <span className="font-mono-kz" style={{ color: "var(--muted)" }}>{stNum(it.qty)} {it.unit || ""} × {stNum(it.price)}</span>
                      <span className="font-mono-kz" style={{ fontWeight: 700, minWidth: 90, textAlign: "right" }}>{stMoney(it.sum)}</span>
                    </div>
                  ))}
                  {o.comment && <p style={{ fontSize: 12, marginTop: 6 }}>💬 {o.comment}</p>}
                  {o.onec_status === "error" && <p style={{ fontSize: 11.5, color: "#B3261E", marginTop: 6 }}>Ошибка 1С: {o.onec_error}</p>}
                  {(o.events || []).length > 0 && (
                    <div className="mt-2">
                      {(o.events || []).map((e, i) => <p key={i} style={{ fontSize: 10.5, color: "var(--muted)" }}>{stFmtTime(e.at)} · {e.event}{e.user ? " · " + e.user : ""}{e.note ? " — " + e.note : ""}</p>)}
                    </div>
                  )}
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {actions.map(([st, label]) => <GhostButton key={st} small onClick={() => act(o, st)}>{label}</GhostButton>)}
                    {canManage && o.onec_status === "error" && <GhostButton small onClick={() => retry(o)}>Отправить в 1С ещё раз</GhostButton>}
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
