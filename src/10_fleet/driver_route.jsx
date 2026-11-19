// Sapar Trade — маршрутный лист. Модуль: экран водителя — список магазинов, карта, навигатор, «Доставлено» с оплатой (наличные / Kaspi QR / Halyk QR), «Не принят»
// Лист составляют оператор, склад, владелец или директор; водитель видит только свой. Подключается в DriverApp.

const ROUTE_PAY = { cash: "Наличные", kaspi: "Kaspi QR", halyk: "Halyk QR" };
const ROUTE_PAY_COLOR = { cash: "#1FA854", kaspi: "#E2231A", halyk: "#0F8B5F" };
const ROUTE_FAIL = ["Нет денег", "Закрыто", "Отказ", "Другое"];

// QR на весь экран: клиент наводит камеру и платит. Сумму показываем крупно, чтобы клиент не ошибся.
function RouteQrView({ method, image, amount, onClose }) {
  useBackClose(onClose);
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center overflow-y-auto" data-testid="qr-view" style={{ background: "#fff" }}>
      <div className="w-full flex items-center justify-between px-5 py-4">
        <p className="font-display" style={{ fontSize: 18, fontWeight: 800, color: ROUTE_PAY_COLOR[method] }}>{ROUTE_PAY[method]}</p>
        <button onClick={onClose} className="p-2 rounded-full" style={{ background: "#F2F1F8" }}><Ico name="x" size={18} /></button>
      </div>
      {amount > 0 && <p className="font-mono-kz" style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>{money(amount)}</p>}
      {image
        ? <img src={image} alt={ROUTE_PAY[method]} style={{ width: "92%", maxWidth: 440, borderRadius: 12 }} />
        : <p className="px-8 text-center" style={{ fontSize: 14, color: "#B3261E", fontWeight: 600, marginTop: 40 }}>QR не загружен — обратитесь к владельцу (Настройки → QR для оплаты)</p>}
      <p className="px-8 text-center" style={{ fontSize: 12, color: "var(--muted)", margin: "12px 0 24px" }}>Покажите QR магазину. Когда деньги пришли на телефон — закройте и отметьте оплату.</p>
    </div>
  );
}

// «Доставлено»: сколько и как заплатил магазин. Остаток — «позже (в долг)».
function RouteDoneModal({ session, stop, qr, onClose, onDone, authLost }) {
  const [amt, setAmt] = useState({ cash: stop.payment === "cash" ? String(stop.total) : "", kaspi: "", halyk: "" });
  const [show, setShow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const val = (m) => Math.max(0, Number(String(amt[m]).replace(/\s/g, "").replace(",", ".")) || 0);
  const paid = val("cash") + val("kaspi") + val("halyk");
  const later = stop.total - paid;
  const setAll = (m) => setAmt({ cash: "", kaspi: "", halyk: "", [m]: String(stop.total) });
  const submit = async () => {
    if (later < -0.005) { setErr("Сумма оплат больше суммы заказа"); return; }
    setBusy(true); setErr("");
    try {
      let pos = null;
      try { pos = await routeGetPosition(); } catch (e) { /* без места доставку не блокируем */ }
      const payments = ["cash", "kaspi", "halyk"].filter((m) => val(m) > 0).map((m) => ({ method: m, amount: val(m) }));
      await stApi("/api/my-route/stops/" + stop.id + "/done", { method: "POST", token: session.token, body: { payments, lat: pos && pos.lat, lon: pos && pos.lon } });
      // у магазина ещё нет точки на карте, а телефон определил место точно — запоминаем его (один раз и навсегда)
      if (!stop.geo && pos && pos.acc <= 100) stApi("/api/my-route/stops/" + stop.id + "/geo", { method: "PUT", token: session.token, body: { lat: pos.lat, lon: pos.lon } }).catch(() => {});
      onDone(payments.length ? "Доставлено · получено " + money(paid) : "Доставлено · оплата позже");
    } catch (e) { if (e.status === 401) authLost(e.message); else setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <Modal title={"Доставлено: " + stop.client} onClose={onClose} wide>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>Заказ {stop.orderNumber} · на сумму <b style={{ color: "var(--ink)" }}>{money(stop.total)}</b>. Как заплатил магазин?</p>
        {["cash", "kaspi", "halyk"].map((m) => (
          <div key={m} className="rounded-2xl p-3 mb-2" style={{ background: "#fff", border: "1px solid var(--line)" }}>
            <div className="flex items-center gap-2">
              <p className="flex-1" style={{ fontSize: 13.5, fontWeight: 800, color: ROUTE_PAY_COLOR[m] }}>{ROUTE_PAY[m]}</p>
              {m !== "cash" && <GhostButton small onClick={() => setShow(m)}>Показать QR</GhostButton>}
              <GhostButton small onClick={() => setAll(m)}>Всё</GhostButton>
            </div>
            <input value={amt[m]} onChange={(e) => setAmt({ ...amt, [m]: e.target.value })} inputMode="decimal" placeholder="0" data-testid={"pay-" + m}
              className="w-full mt-2 rounded-xl px-3 py-2.5 font-mono-kz outline-none" style={{ border: "1px solid var(--line)", fontSize: 15, fontWeight: 700 }} />
          </div>
        ))}
        <div className="rounded-2xl p-3 mb-3" style={{ background: "#F2F1F8" }}>
          <MgRow l="Получено" v={money(paid)} strong />
          <MgRow l="Позже (в долг)" v={money(Math.max(0, later))} color={later > 0.005 ? "#8A5A00" : undefined} />
        </div>
        <p style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>Отмечайте оплату, только когда деньги пришли (наличные в руки или уведомление банка на телефоне).</p>
        {err && <p style={{ fontSize: 12.5, color: "#B3261E", fontWeight: 600, marginBottom: 8 }}>{err}</p>}
        <PrimaryButton full disabled={busy} onClick={submit}>{busy ? "Подождите…" : "Подтвердить доставку"}</PrimaryButton>
      </Modal>
      {show && <RouteQrView method={show} image={qr && qr[show]} amount={val(show)} onClose={() => setShow(null)} />}
    </>
  );
}

function RouteFailModal({ session, stop, onClose, onDone, authLost }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    setBusy(true); setErr("");
    try {
      await stApi("/api/my-route/stops/" + stop.id + "/fail", { method: "POST", token: session.token, body: { reason, note } });
      onDone("Отмечено: не принят");
    } catch (e) { if (e.status === 401) authLost(e.message); else setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={"Не принят: " + stop.client} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>Заказ останется на складе как «Собран» — оператор решит, что делать дальше.</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {ROUTE_FAIL.map((r) => <LiveChip key={r} on={reason === r} onClick={() => setReason(r)}>{r}</LiveChip>)}
      </div>
      <Field label="Пояснение (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: обед до 15:00" />
      {err && <p style={{ fontSize: 12.5, color: "#B3261E", fontWeight: 600, marginBottom: 8 }}>{err}</p>}
      <PrimaryButton full disabled={busy || !reason} onClick={submit}>{busy ? "Подождите…" : "Отметить «Не принят»"}</PrimaryButton>
    </Modal>
  );
}

function RouteStopCard({ stop, open, onToggle, onDone, onFail, onReopen, onSetPoint }) {
  const nav = routeNavUrl(stop);
  const col = stop.status === "done" ? "#1FA854" : stop.status === "failed" ? "#E2231A" : "var(--navy)";
  return (
    <div className="rounded-2xl p-3.5 mb-2.5" data-testid="route-stop" style={{ background: "#fff", border: "1px solid " + (stop.status === "wait" ? "var(--line)" : col) }}>
      <div className="flex items-start gap-3" onClick={onToggle}>
        <div className="shrink-0 rounded-full flex items-center justify-center font-display" style={{ width: 30, height: 30, background: col, color: "#fff", fontSize: 13, fontWeight: 800 }}>{stop.position}</div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 14, fontWeight: 800, wordBreak: "break-word" }}>{stop.client}</p>
          <p style={{ fontSize: 12, color: stop.address ? "var(--ink)" : "#8A5A00", marginTop: 1 }}>{stop.address || "Адрес не указан" + (stop.geo ? " — ехать по точке на карте" : " — спросите у оператора")}</p>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{stop.orderNumber} · {money(stop.total)}{stop.expectCash > 0 ? " · ждём наличными" : ""}</p>
        </div>
        {stop.status === "done" && <span style={{ fontSize: 11, fontWeight: 800, color: col }}>Доставлено</span>}
        {stop.status === "failed" && <span style={{ fontSize: 11, fontWeight: 800, color: col }}>Не принят</span>}
      </div>
      {stop.status === "done" && (
        <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
          {stop.payments.length ? "Получено: " + stop.payments.map((p) => ROUTE_PAY[p.method] + " " + money(p.amount)).join(", ") : "Оплата позже"}
          {stop.total - stop.paid > 0.005 && stop.payments.length ? " · позже " + money(stop.total - stop.paid) : ""}
        </p>
      )}
      {stop.status === "failed" && <p style={{ fontSize: 11.5, color: "#B3261E", marginTop: 6 }}>Причина: {stop.failReason}</p>}
      {open && (
        <div className="mt-2.5 pt-2.5" style={{ borderTop: "1px solid var(--line)" }}>
          {stop.comment && <p style={{ fontSize: 12, color: "#8A5A00", marginBottom: 6 }}>Комментарий: {stop.comment}</p>}
          {stop.items.map((i, k) => <p key={k} style={{ fontSize: 12, color: "var(--ink)" }}>{i.name} — <b>{Number(i.qty)}</b> {i.unit || "шт"}</p>)}
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {stop.phone && <a href={"tel:" + stop.phone} className="rounded-xl px-3 py-2 font-bold press-98" style={{ background: "#F2F1F8", fontSize: 12.5 }}>Позвонить</a>}
        {nav && <a href={nav} target="_blank" rel="noreferrer" className="rounded-xl px-3 py-2 font-bold press-98" style={{ background: "#E8F0FE", color: "#1A56C4", fontSize: 12.5 }}>Навигатор</a>}
        {!stop.geo && stop.status === "wait" && <button onClick={onSetPoint} className="rounded-xl px-3 py-2 font-bold press-98" style={{ background: "#FFF6DE", color: "#8A5A00", fontSize: 12.5 }}>Я у магазина — запомнить точку</button>}
      </div>
      {stop.status === "wait" && (
        <div className="flex gap-2 mt-2.5">
          <button onClick={onDone} data-testid="stop-done" className="flex-1 rounded-xl py-3 font-bold press-98" style={{ background: "#1FA854", color: "#fff", fontSize: 13.5 }}>Доставлено</button>
          <button onClick={onFail} data-testid="stop-fail" className="rounded-xl px-4 py-3 font-bold press-98" style={{ background: "#FCE7E6", color: "#B3261E", fontSize: 13.5 }}>Не принят</button>
        </div>
      )}
      {stop.status === "failed" && <button onClick={onReopen} className="mt-2.5 rounded-xl px-3 py-2 font-bold press-98" style={{ background: "#F2F1F8", fontSize: 12.5 }}>Вернуть в ожидание</button>}
    </div>
  );
}

function DriverRoute({ session, authLost, showToast, gps }) {
  const r = useLive(session, "/api/my-route", authLost, 60000);
  const qrData = useLive(session, "/api/payment-qr", authLost);
  const { L, failed } = useLeaflet();
  const [open, setOpen] = useState(null);
  const [doneFor, setDoneFor] = useState(null);
  const [failFor, setFailFor] = useState(null);
  const d = r.data;
  if (!d) return r.error ? <LiveState error={r.error} onRetry={r.reload} /> : null;
  if (!d.sheet) return (
    <div className="rounded-2xl p-4 mb-3" data-testid="route-empty" style={{ background: "#fff", border: "1px solid var(--line)" }}>
      <p style={{ fontSize: 13.5, fontWeight: 800 }}>Маршрутного листа пока нет</p>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Когда оператор или склад передаст вам лист, здесь появятся магазины и карта.</p>
    </div>
  );
  const t = d.totals;
  const me = gps && gps.fix ? { lat: gps.fix.lat, lon: gps.fix.lon } : null;
  const act = (msg) => { setDoneFor(null); setFailFor(null); showToast(msg); r.reload(); };
  const call = async (path, opts, ok) => {
    try { await stApi(path, { token: session.token, ...opts }); showToast(ok); r.reload(); }
    catch (e) { if (e.status === 401) authLost(e.message); else showToast(e.message); }
  };
  const setPoint = async (s) => {
    try {
      const p = await routeGetPosition();
      await stApi("/api/my-route/stops/" + s.id + "/geo", { method: "PUT", token: session.token, body: { lat: p.lat, lon: p.lon } });
      showToast("Точка магазина запомнена"); r.reload();
    } catch (e) { if (e.status === 401) authLost(e.message); else showToast(e.message); }
  };
  return (
    <div className="mb-3" data-testid="route-sheet">
      <div className="rounded-2xl p-4 mb-2.5" style={{ background: "var(--navy)", color: "#fff" }}>
        <p className="font-display" style={{ fontSize: 16, fontWeight: 800 }}>Маршрутный лист · {stFmtDate(d.sheet.date)}</p>
        <p style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>{d.sheet.status === "closed" ? "Лист завершён" : "Доставлено " + t.done + " из " + t.stops + (t.failed ? " · не принято " + t.failed : "")}</p>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="rounded-xl py-2 text-center" style={{ background: "rgba(255,255,255,.12)" }}><p style={{ fontSize: 10.5, opacity: 0.8 }}>Наличные</p><p className="font-mono-kz" style={{ fontSize: 12.5, fontWeight: 800 }}>{shortMoney(t.cashReceived)}</p></div>
          <div className="rounded-xl py-2 text-center" style={{ background: "rgba(255,255,255,.12)" }}><p style={{ fontSize: 10.5, opacity: 0.8 }}>Kaspi QR</p><p className="font-mono-kz" style={{ fontSize: 12.5, fontWeight: 800 }}>{shortMoney(t.kaspi)}</p></div>
          <div className="rounded-xl py-2 text-center" style={{ background: "rgba(255,255,255,.12)" }}><p style={{ fontSize: 10.5, opacity: 0.8 }}>Halyk QR</p><p className="font-mono-kz" style={{ fontSize: 12.5, fontWeight: 800 }}>{shortMoney(t.halyk)}</p></div>
        </div>
        {t.cashExpected > 0 && <p style={{ fontSize: 11.5, opacity: 0.8, marginTop: 8 }}>Наличными ждём по листу: {money(t.cashExpected)}</p>}
      </div>
      {L ? <RouteMap L={L} stops={d.stops} me={me} height={240} focusKey={d.sheet.id} />
        : <LiveState loading={!failed} error={failed ? "Карта не загрузилась (нет интернета). Список магазинов ниже работает." : null} />}
      <p style={{ fontSize: 11, color: "var(--muted)", margin: "6px 2px 10px" }}>На карте только магазины, у которых уже есть точка. Остальные — по кнопке «Навигатор» (по адресу).</p>
      {d.stops.map((s) => (
        <RouteStopCard key={s.id} stop={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)}
          onDone={() => setDoneFor(s)} onFail={() => setFailFor(s)} onSetPoint={() => setPoint(s)}
          onReopen={() => call("/api/my-route/stops/" + s.id + "/reopen", { method: "POST" }, "Вернули в ожидание")} />
      ))}
      {doneFor && <RouteDoneModal session={session} stop={doneFor} qr={qrData.data} authLost={authLost} onClose={() => setDoneFor(null)} onDone={act} />}
      {failFor && <RouteFailModal session={session} stop={failFor} authLost={authLost} onClose={() => setFailFor(null)} onDone={act} />}
    </div>
  );
}
