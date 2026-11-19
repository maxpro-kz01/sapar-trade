// Sapar Trade — маршрутные листы. Модуль: составление листа (оператор, склад, владелец, директор), отчёт «Оплаты» по Kaspi QR / Halyk QR / наличным, загрузка QR
// Вкладка «Маршруты»; отчёт «Оплаты» видят и бухгалтер с финансистом. Водитель работает в driver_route.jsx.

const ROUTE_STATUS = { draft: ["Черновик", "#8A5A00"], sent: ["У водителя", "#1A56C4"], closed: ["Завершён", "#1FA854"] };

// Поставить точку магазина на карте: касание карты, «Сохранить» — запоминается навсегда
function RoutePointModal({ session, target, onClose, onSaved }) {
  const { L, failed } = useLeaflet();
  const [pt, setPt] = useState(target.geo || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setBusy(true); setErr("");
    try { await stApi("/api/clients/" + encodeURIComponent(target.code) + "/geo", { method: "PUT", token: session.token, body: pt }); onSaved(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={"Точка: " + target.name} onClose={onClose} wide>
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Коснитесь карты там, где находится магазин. Точка запомнится — водителю будет видно на карте.</p>
      {L ? <RouteMap L={L} stops={[]} marker={pt} onPick={(lat, lon) => setPt({ lat, lon })} height={300} />
        : <LiveState loading={!failed} error={failed ? "Карта не загрузилась — проверьте интернет" : null} />}
      {err && <p style={{ fontSize: 12.5, color: "#B3261E", margin: "8px 0" }}>{err}</p>}
      <div className="mt-3"><PrimaryButton full disabled={busy || !pt} onClick={save}>{pt ? "Сохранить точку" : "Коснитесь карты"}</PrimaryButton></div>
    </Modal>
  );
}

// Составление листа: водитель, заказы «Собран», порядок остановок
function RouteEditor({ session, sheet, date, onClose, onSaved, authLost, showToast }) {
  const locked = sheet && sheet.stops.filter((s) => s.status !== "wait");
  const drivers = useLive(session, "/api/routes/drivers", authLost);
  const avail = useLive(session, "/api/routes/orders", authLost);
  const [driverId, setDriverId] = useState(sheet ? sheet.driverId : "");
  const [ids, setIds] = useState(sheet ? sheet.stops.filter((s) => s.status === "wait").map((s) => s.orderId) : []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pointFor, setPointFor] = useState(null);
  const [geoDone, setGeoDone] = useState({}); // клиенты, которым только что поставили точку
  const info = {};
  if (sheet) sheet.stops.forEach((s) => { info[s.orderId] = { orderId: s.orderId, orderNumber: s.orderNumber, clientCode: s.clientCode, client: s.client, address: s.address, total: s.total, hasGeo: !!s.geo }; });
  (avail.data || []).forEach((o) => { info[o.orderId] = o; });
  const hasGeo = (o) => o.hasGeo || geoDone[o.clientCode];
  const free = (avail.data || []).filter((o) => !ids.includes(o.orderId));
  const move = (i, d) => { const a = ids.slice(); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setIds(a); };
  const run = async (fn, okMsg) => {
    setBusy(true); setErr("");
    try { await fn(); showToast(okMsg); onSaved(); }
    catch (e) { if (e.status === 401) authLost(e.message); else setErr(e.message); } finally { setBusy(false); }
  };
  const save = async () => {
    if (sheet) { await stApi("/api/routes/" + sheet.id, { method: "PATCH", token: session.token, body: { orderIds: ids, ...(sheet.status === "draft" ? { driverId: Number(driverId) } : {}) } }); return sheet.id; }
    return (await stApi("/api/routes", { method: "POST", token: session.token, body: { date, driverId: Number(driverId), orderIds: ids } })).id;
  };
  const send = async () => { const id = await save(); await stApi("/api/routes/" + id + "/send", { method: "POST", token: session.token }); };
  const readOnly = sheet && sheet.status === "closed";
  const canSend = !readOnly && (!sheet || sheet.status === "draft") && driverId && ids.length > 0;
  const geoLess = ids.filter((id) => info[id] && !hasGeo(info[id])).length;
  return (
    <>
      <Modal title={sheet ? "Лист · " + sheet.driver : "Новый лист · " + stFmtDate(date)} onClose={onClose} wide>
        {!sheet || sheet.status === "draft" ? (
          <label className="block mb-3">
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Водитель</span>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} data-testid="route-driver" className="w-full mt-1 rounded-xl px-3 py-3 bg-white" style={{ border: "1px solid var(--line)", fontSize: 14 }}>
              <option value="">— выберите —</option>
              {(drivers.data || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        ) : <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Водитель: {sheet.driver} · {ROUTE_STATUS[sheet.status][0]}</p>}
        {locked && locked.length > 0 && (
          <div className="mb-3">
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Уже отмечены водителем</p>
            {locked.map((s) => <LiveItem key={s.id} title={s.position + ". " + s.client} sub={s.status === "done" ? (s.payments.length ? s.payments.map((p) => ROUTE_PAY[p.method] + " " + money(p.amount)).join(", ") : "оплата позже") : "Не принят: " + s.failReason} value={s.status === "done" ? "✓" : "✕"} valueColor={s.status === "done" ? "#1FA854" : "#B3261E"} />)}
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Порядок остановок ({ids.length})</p>
        {ids.length === 0 && <p style={{ fontSize: 12.5, color: "var(--muted)", padding: "6px 0" }}>Добавьте заказы из списка ниже.</p>}
        {ids.map((id, i) => {
          const o = info[id] || { client: "Заказ " + id, total: 0, hasGeo: true };
          return (
            <div key={id} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--line)" }} data-testid="route-pick">
              <span className="shrink-0 rounded-full flex items-center justify-center font-display" style={{ width: 26, height: 26, background: "var(--navy)", color: "#fff", fontSize: 12, fontWeight: 800 }}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 13, fontWeight: 700 }}>{o.client}</p>
                <p style={{ fontSize: 11, color: "var(--muted)" }}>{[o.address || "адреса нет", money(o.total)].join(" · ")}</p>
                {!hasGeo(o) && o.clientCode && !readOnly && <button onClick={() => setPointFor({ code: o.clientCode, name: o.client })} style={{ fontSize: 11, color: "#8A5A00", fontWeight: 700 }}>Нет точки на карте — поставить</button>}
              </div>
              {!readOnly && <>
                <button onClick={() => move(i, -1)} className="px-2 py-1 rounded-lg" style={{ background: "#F2F1F8" }}>↑</button>
                <button onClick={() => move(i, 1)} className="px-2 py-1 rounded-lg" style={{ background: "#F2F1F8" }}>↓</button>
                <button onClick={() => setIds(ids.filter((x) => x !== id))} className="px-2 py-1 rounded-lg" style={{ background: "#FCE7E6", color: "#B3261E" }}>✕</button>
              </>}
            </div>
          );
        })}
        {geoLess > 0 && <p style={{ fontSize: 11.5, color: "#8A5A00", marginTop: 6 }}>У магазинов без точки водитель увидит только кнопку «Навигатор» по адресу. Точку можно поставить сейчас или позже.</p>}
        {!readOnly && (
          <div className="mt-4">
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Собранные заказы, которых нет ни в одном листе ({free.length})</p>
            <LiveState loading={avail.loading} error={avail.error} onRetry={avail.reload} empty={avail.data && !free.length ? "Нет свободных собранных заказов" : null} />
            {free.map((o) => (
              <div key={o.orderId} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--line)" }} data-testid="route-free">
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 700 }}>{o.client}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)" }}>{[o.orderNumber, o.address || "адреса нет", money(o.total), o.shop ? "от магазина" : null].filter(Boolean).join(" · ")}</p>
                </div>
                <GhostButton small onClick={() => setIds([...ids, o.orderId])}>+ В лист</GhostButton>
              </div>
            ))}
          </div>
        )}
        {err && <p style={{ fontSize: 12.5, color: "#B3261E", fontWeight: 600, margin: "10px 0" }}>{err}</p>}
        {!readOnly && (
          <div className="mt-4 flex flex-col gap-2">
            {canSend && <PrimaryButton full disabled={busy} onClick={() => run(send, "Лист передан водителю")}>Передать водителю</PrimaryButton>}
            <GhostButton full onClick={() => !busy && driverId && run(async () => { await save(); }, "Сохранено")}>Сохранить{sheet && sheet.status === "sent" ? " изменения" : " черновик"}</GhostButton>
            {sheet && sheet.status === "draft" && <GhostButton full onClick={() => window.confirm("Удалить черновик?") && run(() => stApi("/api/routes/" + sheet.id, { method: "DELETE", token: session.token }), "Черновик удалён")}>Удалить черновик</GhostButton>}
            {sheet && sheet.status === "sent" && <GhostButton full onClick={() => window.confirm("Закрыть лист? Неотмеченные остановки станут «не доставлены», заказы останутся «Собран».") && run(() => stApi("/api/routes/" + sheet.id + "/close", { method: "POST", token: session.token }), "Лист закрыт")}>Закрыть лист вручную</GhostButton>}
          </div>
        )}
      </Modal>
      {pointFor && <RoutePointModal session={session} target={pointFor} onClose={() => setPointFor(null)} onSaved={() => { setGeoDone({ ...geoDone, [pointFor.code]: true }); setPointFor(null); showToast("Точка сохранена"); avail.reload(); }} />}
    </>
  );
}

function RouteSheetsList({ session, authLost, showToast }) {
  const [date, setDate] = useState(stToday());
  const r = useLive(session, "/api/routes?" + stQs({ date }), authLost, 30000);
  const [edit, setEdit] = useState(null); // null | "new" | лист
  const done = () => { setEdit(null); r.reload(); };
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setDate(stShift(date, -1))} className="px-3 py-2 rounded-xl" style={{ background: "#F2F1F8" }}>‹</button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="flex-1 rounded-xl px-3 py-2 bg-white" style={{ border: "1px solid var(--line)", fontSize: 13.5 }} />
        <button onClick={() => setDate(stShift(date, 1))} className="px-3 py-2 rounded-xl" style={{ background: "#F2F1F8" }}>›</button>
      </div>
      <PrimaryButton full onClick={() => setEdit("new")}>+ Новый маршрутный лист</PrimaryButton>
      <div className="mt-3">
        <LiveState loading={r.loading} error={r.error} onRetry={r.reload} empty={r.data && !r.data.length ? "На эту дату листов нет" : null} />
        {(r.data || []).map((s) => (
          <MgCard key={s.id} onClick={() => setEdit(s)}>
            <div className="flex items-center gap-2">
              <p className="flex-1" style={{ fontSize: 14, fontWeight: 800 }}>{s.driver}</p>
              <span style={{ fontSize: 11, fontWeight: 800, color: ROUTE_STATUS[s.status][1] }}>{ROUTE_STATUS[s.status][0]}</span>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Магазинов: {s.totals.stops} · доставлено {s.totals.done}{s.totals.failed ? " · не принято " + s.totals.failed : ""} · {money(s.totals.sum)}</p>
            {s.totals.done > 0 && <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>Получено: нал. {money(s.totals.cashReceived)} · Kaspi {money(s.totals.kaspi)} · Halyk {money(s.totals.halyk)}</p>}
          </MgCard>
        ))}
      </div>
      {edit && <RouteEditor key={edit === "new" ? "new" : edit.id} session={session} sheet={edit === "new" ? null : edit} date={date} authLost={authLost} showToast={showToast} onClose={() => setEdit(null)} onSaved={done} />}
    </>
  );
}

// QR для оплаты: водитель показывает их магазину. Картинку (PNG/JPG, до ~400 КБ) загружает владелец или оператор.
function PaymentQrSettings({ session, authLost, showToast }) {
  const r = useLive(session, "/api/payment-qr", authLost);
  const [busy, setBusy] = useState("");
  const upload = (method, file) => {
    if (!file) return;
    if (file.size > 400 * 1024) { showToast("Картинка больше 400 КБ — уменьшите"); return; }
    const fr = new FileReader();
    fr.onload = async () => {
      setBusy(method);
      try { await stApi("/api/payment-qr/" + method, { method: "PUT", token: session.token, body: { image: fr.result } }); showToast("QR обновлён"); r.reload(); }
      catch (e) { showToast(e.message); } finally { setBusy(""); }
    };
    fr.readAsDataURL(file);
  };
  return (
    <MgCard>
      <p style={{ fontSize: 12.5, fontWeight: 800 }}>QR для оплаты при доставке</p>
      <p style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>Водитель показывает их магазину. Чтобы заменить — выберите новую картинку.</p>
      <div className="grid grid-cols-2 gap-3">
        {["kaspi", "halyk"].map((m) => (
          <div key={m} className="text-center">
            <p style={{ fontSize: 12, fontWeight: 800, color: ROUTE_PAY_COLOR[m], marginBottom: 4 }}>{ROUTE_PAY[m]}</p>
            {r.data && r.data[m] ? <img src={r.data[m]} alt={ROUTE_PAY[m]} style={{ width: "100%", borderRadius: 10, border: "1px solid var(--line)" }} /> : <p style={{ fontSize: 11.5, color: "#B3261E" }}>{r.loading ? "…" : "не загружен"}</p>}
            <label className="block mt-2 rounded-xl py-2 font-semibold press-98" style={{ background: "#F2F1F8", fontSize: 12, cursor: "pointer" }}>
              {busy === m ? "Загрузка…" : "Заменить"}
              <input type="file" accept="image/png,image/jpeg" style={{ display: "none" }} onChange={(e) => { upload(m, e.target.files[0]); e.target.value = ""; }} />
            </label>
          </div>
        ))}
      </div>
    </MgCard>
  );
}

// Отчёт «Оплаты»: какой магазин, сколько и каким способом заплатил водителю
function RoutePayments({ session, authLost }) {
  const [from, setFrom] = useState(stToday());
  const [to, setTo] = useState(stToday());
  const r = useLive(session, "/api/routes/payments?" + stQs({ from, to }), authLost, 60000);
  const x = r.data;
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="flex-1 rounded-xl px-3 py-2 bg-white" style={{ border: "1px solid var(--line)", fontSize: 13 }} />
        <span style={{ color: "var(--muted)" }}>—</span>
        <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="flex-1 rounded-xl px-3 py-2 bg-white" style={{ border: "1px solid var(--line)", fontSize: 13 }} />
      </div>
      <LiveState loading={r.loading} error={r.error} onRetry={r.reload} />
      {x && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3" data-testid="pay-totals">
            {[["cash", x.totals.cash], ["kaspi", x.totals.kaspi], ["halyk", x.totals.halyk]].map(([m, v]) => (
              <div key={m} className="rounded-2xl p-3" style={{ background: "#fff", border: "1px solid var(--line)" }}>
                <p style={{ fontSize: 11, color: ROUTE_PAY_COLOR[m], fontWeight: 800 }}>{ROUTE_PAY[m]}</p>
                <p className="font-mono-kz" style={{ fontSize: 16, fontWeight: 800 }}>{money(v)}</p>
              </div>
            ))}
            <div className="rounded-2xl p-3" style={{ background: "#FFF6DE" }}>
              <p style={{ fontSize: 11, color: "#8A5A00", fontWeight: 800 }}>Позже (в долг)</p>
              <p className="font-mono-kz" style={{ fontSize: 16, fontWeight: 800 }}>{money(x.totals.later)}</p>
            </div>
          </div>
          <LiveState empty={!x.items.length ? "За этот период оплат от водителей нет" : null} />
          {x.items.map((p) => (
            <LiveItem key={p.id} title={p.client} sub={[p.orderNumber, p.driver, stFmtTime(p.at)].join(" · ")} value={money(p.amount)} valueSub={ROUTE_PAY[p.method]} valueColor={ROUTE_PAY_COLOR[p.method]} />
          ))}
        </>
      )}
    </>
  );
}

function AdminRoutes({ session, authLost, showToast }) {
  const canSheets = liveCan(session, "routes");
  const [view, setView] = useState(canSheets ? "sheets" : "pay");
  return (
    <>
      {canSheets && (
        <div className="flex gap-1.5 mb-3">
          <LiveChip on={view === "sheets"} onClick={() => setView("sheets")}>Листы</LiveChip>
          <LiveChip on={view === "pay"} onClick={() => setView("pay")}>Оплаты</LiveChip>
          {liveCan(session, "settings") && <LiveChip on={view === "qr"} onClick={() => setView("qr")}>QR</LiveChip>}
        </div>
      )}
      {view === "sheets" && <RouteSheetsList session={session} authLost={authLost} showToast={showToast} />}
      {view === "pay" && <RoutePayments session={session} authLost={authLost} />}
      {view === "qr" && <PaymentQrSettings session={session} authLost={authLost} showToast={showToast} />}
    </>
  );
}
