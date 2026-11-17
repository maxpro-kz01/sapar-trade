// Sapar Trade — администратор. Модуль: источник долгов клиентов (ТЗ TZ_DEBTS_BUH).
// По умолчанию долги берутся из 1С:Бухгалтерии (счёт 1274), как в ОСВ у бухгалтера; можно вернуть УТП.
// Показывает, сколько контрагентов Бухгалтерии сопоставлено с клиентами УТП и кого найти не удалось.

function AdminDebtsSource({ session, authLost, showToast }) {
  const r = useLive(session, "/api/settings/debts", authLost);
  const [showMiss, setShowMiss] = useState(false);
  if (!r.data) return <MgCard><LiveState {...r} onRetry={r.reload} /></MgCard>;
  const d = r.data;
  const canEdit = liveCan(session, "settings");
  const setSource = async (src) => {
    if (src === d.source) return;
    try { await stApi("/api/settings", { method: "PUT", token: session.token, body: { debtsSource: src } }); showToast(src === "buh" ? "Долги — из Бухгалтерии" : "Долги — из УТП"); r.reload(); }
    catch (e) { showToast(e.message); }
  };
  const opt = (id, label) => (
    <button key={id} disabled={!canEdit} onClick={() => setSource(id)} aria-pressed={d.source === id}
      className="flex-1 rounded-xl" style={{ padding: "8px 10px", fontSize: 12.5, fontWeight: 800,
        background: d.source === id ? "var(--navy)" : "transparent", color: d.source === id ? "#fff" : "inherit",
        border: "1px solid " + (d.source === id ? "transparent" : "var(--line)") }}>{label}</button>
  );
  const waiting = d.source === "buh" && d.active !== "buh";
  return (
    <MgCard>
      <p style={{ fontSize: 13.5, fontWeight: 800 }}>Откуда брать долги клиентов</p>
      <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45, marginBottom: 8 }}>
        Бухгалтер закрывает долги в 1С:Бухгалтерии (счёт 1274). В УТП оплаты почти не вносятся, поэтому там долги завышены.
      </p>
      <div className="flex gap-2">{opt("buh", "1С:Бухгалтерия (1274)")}{opt("utp", "УТП")}</div>
      {waiting && (
        <p style={{ fontSize: 11.5, color: "#B7791F", marginTop: 8, lineHeight: 1.45 }}>
          Данных из Бухгалтерии ещё нет — пока показываются долги из УТП. На сервере 1С запустите <b>8_buhgalteria.bat</b>.
        </p>
      )}
      {d.active === "buh" && (
        <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
          <div>Долг по Бухгалтерии: <b>{stMoney(d.buhTotal)}</b> · на сайте: <b>{stMoney(d.openTotal)}</b></div>
          <div>Обновлено: {stFmtTime(d.buhLast)} · сопоставлено клиентов: {d.matched}{d.unmatched ? `, не найдено в УТП: ${d.unmatched}` : ""}</div>
          {d.unmatchedTop.length > 0 && (
            <button className="underline" style={{ fontSize: 12, color: "var(--muted)" }} onClick={() => setShowMiss((v) => !v)}>
              {showMiss ? "Скрыть" : "Показать"} должников, которых нет в УТП
            </button>
          )}
          {showMiss && d.unmatchedTop.map((x) => (
            <div key={x.code} className="flex justify-between gap-2" style={{ fontSize: 11.5, borderTop: "1px solid var(--line)", padding: "3px 0" }}>
              <span className="min-w-0 truncate">{x.name || x.code}</span><b className="shrink-0">{stMoney(x.amount)}</b>
            </div>
          ))}
        </div>
      )}
    </MgCard>
  );
}
