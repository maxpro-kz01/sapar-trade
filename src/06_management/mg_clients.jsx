// Sapar Trade — система управления. Модуль: Клиенты и дебиторка (данные 1С)
// Возраст долга, просрочка, последняя покупка, «спящие» клиенты; фильтр по ТП (переход из «Команды»).

function MgClients({ session, range, authLost, param, setParam }) {
  const manager = param && typeof param === "object" ? param.manager : "";
  const [q, setQ] = useState("");
  const [mode, setMode] = useState(param === "sleeping" ? "sleeping" : param === "debtors" ? "debtors" : "all");
  const dq = useDebounced(q);
  const r = useLive(session, "/api/clients?" + stQs({ ...range, q: dq, debtors: mode === "debtors", sleeping: mode === "sleeping" ? 30 : "", manager }), authLost);
  const d = r.data;
  const sm = d ? d.summary : null;
  const hasDebt = sm && sm.debt !== undefined;
  const maxAging = sm && sm.aging ? Math.max(...sm.aging.map((x) => x.amount), 1) : 1;
  return (
    <>
      {d && <LiveFreshness lastSync={d.lastSync} stale={d.stale} />}
      {manager && (
        <div className="flex items-center gap-2 mb-3">
          <span className="px-3 py-1.5 rounded-full" style={{ fontSize: 12, background: "#EEF0FF", color: "var(--navy)", fontWeight: 700 }}>ТП: {manager}</span>
          <button onClick={() => setParam(null)} style={{ fontSize: 12, color: "var(--muted)" }}>× показать всех</button>
        </div>
      )}
      <LiveSearch value={q} onChange={setQ} placeholder="Название, телефон или код клиента" />
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        <LiveChip on={mode === "all"} onClick={() => setMode("all")}>Все</LiveChip>
        {(hasDebt || mode === "debtors") && <LiveChip on={mode === "debtors"} onClick={() => setMode("debtors")}>Должники</LiveChip>}
        <LiveChip on={mode === "sleeping"} onClick={() => setMode("sleeping")}>Не покупают 30+ дней</LiveChip>
      </div>
      {hasDebt && (
        <div className="kz-cols2">
          <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <MgKpi label="Долг" value={stMoney(sm.debt)} />
            <MgKpi label={"Просрочено > " + d.overdueDays + " дн."} value={stMoney(sm.overdue)} accent={sm.overdue > 0 ? "#F3B4B0" : undefined} />
            <MgKpi label="Должников" value={stNum(sm.debtors)} />
            {sm.buyers !== undefined && <MgKpi label="Покупали за период" value={stNum(sm.buyers)} />}
          </div>
          <MgCard>
            <MgLabel>Возраст долга</MgLabel>
            {sm.aging.map((a, i) => (
              <div key={a.label} className="mb-2">
                <div className="flex justify-between" style={{ fontSize: 11.5, marginBottom: 3 }}>
                  <span style={{ color: "var(--muted)" }}>{a.label}</span><span className="font-mono-kz" style={{ fontWeight: 700 }}>{stMoney(a.amount)}</span>
                </div>
                <MgBar value={a.amount} max={maxAging} color={i >= 3 ? "var(--red)" : i === 2 ? "#F5A300" : "var(--navy)"} />
              </div>
            ))}
          </MgCard>
        </div>
      )}
      <LiveState {...r} onRetry={r.reload} empty={d && !d.items.length ? "Клиенты не найдены" : null} />
      {d && d.items.length > 0 && (
        <MgCard>
          <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Найдено: {stNum(sm.clients)}{sm.clients > d.items.length ? ", показаны первые " + d.items.length : ""}</p>
          {d.items.map((x) => (
            <LiveItem key={x.code} title={x.name}
              sub={[x.manager, x.phone, x.lastSale ? "посл. покупка " + stFmtDate(x.lastSale) : "покупок нет"].filter(Boolean).join(" · ")}
              value={x.debt !== undefined ? stMoney(x.debt) : stMoney(x.revenue)}
              valueColor={x.overdue > 0 ? "var(--red)" : undefined}
              valueSub={x.debt !== undefined
                ? (x.overdue > 0 ? "просрочено " + shortMoney(x.overdue) : x.debt > 0 ? "с " + stFmtDate(x.oldestDebt) : x.revenue ? "куплено " + shortMoney(x.revenue) : "долга нет")
                : null} />
          ))}
        </MgCard>
      )}
    </>
  );
}
