// Sapar Trade — администратор. Модуль: смена «Начать работу / Завершить работу» на сервере
// При завершении сервер собирает отчёт (заказы приложения + продажи за день из 1С), администратор отправляет его директору в WhatsApp.

function AdminShiftLive({ session, authLost, showToast }) {
  const r = useLive(session, "/api/shift", authLost);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  if (!r.data) return <LiveState {...r} onRetry={r.reload} />;
  const { current, history, settings } = r.data;
  const start = async () => {
    setBusy(true);
    try { await stApi("/api/shift/start", { method: "POST", token: session.token }); showToast("Смена начата"); r.reload(); }
    catch (e) { showToast(e.message); }
    setBusy(false);
  };
  const end = async () => {
    if (!window.confirm("Завершить смену и сформировать отчёт?")) return;
    setBusy(true);
    try { const res = await stApi("/api/shift/end", { method: "POST", token: session.token }); setReport({ r: res.report, phone: res.settings.directorPhone }); r.reload(); }
    catch (e) { showToast(e.message); }
    setBusy(false);
  };
  return (
    <>
      <MgCard style={{ textAlign: "center", padding: 22 }}>
        {current ? (
          <>
            <Badge bg="#E4F7E9" fg="#127A33">смена идёт</Badge>
            <p className="font-display" style={{ fontSize: 22, fontWeight: 800, margin: "10px 0 2px" }}>{shiftLen(current.started_at, now)}</p>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>начата в {shiftHM(current.started_at)}</p>
            <PrimaryButton full disabled={busy} onClick={end}>{busy ? "Формируем отчёт…" : "Завершить работу"}</PrimaryButton>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Отчёт за смену уйдёт директору ({settings.directorPhone}) в WhatsApp</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>Смена не начата</p>
            <PrimaryButton full disabled={busy} onClick={start}>Начать работу</PrimaryButton>
          </>
        )}
      </MgCard>
      {history.length > 0 && (
        <>
          <MgLabel>Прошлые смены</MgLabel>
          <MgCard>
            {history.map((h) => (
              <div key={h.id} onClick={() => setReport({ r: h.report, phone: settings.directorPhone })} style={{ cursor: "pointer" }}>
                <LiveItem title={stFmtDate(h.report ? h.report.day : String(h.started_at).slice(0, 10)) + " · " + shiftHM(h.started_at) + "–" + shiftHM(h.ended_at)}
                  sub={h.report ? h.report.orders.count + " заказов · 1С " + shortMoney(h.report.sales1c.revenue) : ""} value="отчёт ›" />
              </div>
            ))}
          </MgCard>
        </>
      )}
      {report && report.r && (
        <Modal title="Отчёт за смену" onClose={() => setReport(null)} wide>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.5, background: "#F6F5FA", borderRadius: 14, padding: 12 }}>{shiftReportText(report.r)}</pre>
          <div className="mt-3"><PrimaryButton full onClick={() => window.open(shiftWhatsAppUrl(report.phone, shiftReportText(report.r)), "_blank")}>Отправить директору в WhatsApp</PrimaryButton></div>
          <div className="mt-2"><GhostButton full onClick={() => { navigator.clipboard && navigator.clipboard.writeText(shiftReportText(report.r)); showToast("Текст скопирован"); }}>Скопировать текст</GhostButton></div>
        </Modal>
      )}
    </>
  );
}

function AdminSettingsLive({ session, authLost, showToast }) {
  const r = useLive(session, "/api/settings", authLost);
  const [phone, setPhone] = useState("");
  useEffect(() => { if (r.data) setPhone(r.data.directorPhone); }, [r.data]);
  if (!r.data) return <LiveState {...r} onRetry={r.reload} />;
  const save = async () => {
    try { const s = await stApi("/api/settings", { method: "PUT", token: session.token, body: { directorPhone: phone } }); setPhone(s.directorPhone); showToast("Сохранено"); }
    catch (e) { showToast(e.message); }
  };
  return (
    <MgCard>
      <Field label="WhatsApp директора (для отчёта смены)" value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
      <PrimaryButton full disabled={!liveCan(session, "settings")} onClick={save}>Сохранить</PrimaryButton>
    </MgCard>
  );
}
