// Sapar Trade — система управления. Модуль: Команда — рейтинг торговых представителей и план продаж
// ТП = «Основной менеджер покупателя» в карточке клиента 1С. План вводят владелец и директор (по месяцам).

function MgTeam({ session, range, authLost, go, showToast }) {
  const r = useLive(session, "/api/team?" + stQs(range), authLost);
  const [planOpen, setPlanOpen] = useState(false);
  const d = r.data;
  const canPlan = liveCan(session, "plans.edit");
  return (
    <>
      {d && <LiveFreshness lastSync={d.lastSync} stale={d.stale} />}
      {canPlan && <div className="mb-3"><GhostButton small onClick={() => setPlanOpen(true)}>План продаж на месяц</GhostButton></div>}
      <LiveState {...r} onRetry={r.reload} empty={d && !d.items.length ? "В 1С у клиентов не указан основной менеджер" : null} />
      {d && d.items.length > 0 && (
        <>
          <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
            <MgKpi label="Выручка команды" value={stMoney(d.totals.revenue)} />
            {d.totals.plan !== null && <MgKpi label="План / выполнение" value={stMoney(d.totals.plan) + " · " + fp(d.totals.planPct || 0)} />}
            <MgKpi label="Долг клиентов" value={stMoney(d.totals.debt)} />
            <MgKpi label="Из них просрочено" value={stMoney(d.totals.overdue)} accent={d.totals.overdue > 0 ? "#F3B4B0" : undefined} />
          </div>
          {d.approxCost && <p style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 8 }}>Маржа по ТП — приблизительная: себестоимость в 1С ведётся по товарам.</p>}
          <div className="kz-list">
            {d.items.map((x) => (
              <MgCard key={x.manager} onClick={() => go("clients", { manager: x.manager })}>
                <div className="flex items-start gap-3">
                  <span className="font-mono-kz rounded-full flex items-center justify-center shrink-0"
                    style={{ width: 28, height: 28, fontSize: 12, fontWeight: 800, background: x.rank <= 3 ? "#FFF6DE" : "#F2F1F8", color: x.rank <= 3 ? "#8A5A00" : "var(--muted)" }}>{x.rank}</span>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)" }}>{x.manager}</p>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>
                      {x.user ? "в приложении: " + x.user.name : "нет учётной записи в приложении"}{x.lastSale ? " · посл. продажа " + stFmtDate(x.lastSale) : ""}
                    </p>
                  </div>
                  <p className="font-mono-kz" style={{ fontSize: 14, fontWeight: 800 }}>{stMoney(x.revenue)}</p>
                </div>
                {x.plan !== null && (
                  <div className="mt-2">
                    <div className="flex justify-between" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
                      <span>План {stMoney(x.plan)}</span><span className="font-mono-kz" style={{ fontWeight: 700, color: "var(--ink)" }}>{fp(x.planPct || 0)}</span>
                    </div>
                    <MgBar value={x.planPct || 0} color={(x.planPct || 0) >= 100 ? "#1FA854" : "var(--navy)"} />
                  </div>
                )}
                <div className="mt-2">
                  <MgRow l="Клиенты: покупали / закреплено" v={x.clientsActive + " / " + x.clientsTotal} />
                  <MgRow l="Средняя выручка на клиента" v={stMoney(x.avgPerClient)} />
                  {x.marginPct !== undefined && <MgRow l="Маржа" v={x.marginPct === null ? "—" : fp(x.marginPct)} />}
                  {x.gross !== undefined && <MgRow l="Валовая прибыль" v={stMoney(x.gross)} />}
                  <MgRow l="Долг клиентов / просрочено" v={shortMoney(x.debt) + " / " + shortMoney(x.overdue)} color={x.overdue > 0 ? "var(--red)" : undefined} />
                </div>
              </MgCard>
            ))}
          </div>
        </>
      )}
      {planOpen && <MgPlanModal session={session} authLost={authLost} onClose={() => setPlanOpen(false)} onSaved={() => { setPlanOpen(false); showToast("План сохранён"); r.reload(); }} />}
    </>
  );
}

function MgPlanModal({ session, authLost, onClose, onSaved }) {
  const [month, setMonth] = useState(stToday().slice(0, 7));
  const r = useLive(session, "/api/plans?month=" + month, authLost);
  const [vals, setVals] = useState({});
  const [err, setErr] = useState("");
  useEffect(() => { if (r.data) setVals(Object.fromEntries(r.data.items.map((x) => [x.manager, x.amount ? String(Math.round(x.amount)) : ""]))); }, [r.data]);
  const total = Object.values(vals).reduce((a, v) => a + (Number(String(v).replace(/\s/g, "")) || 0), 0);
  const save = async () => {
    setErr("");
    const items = Object.entries(vals).map(([manager, v]) => ({ manager, amount: Number(String(v).replace(/\s/g, "")) || 0 }));
    try { await stApi("/api/plans", { method: "PUT", token: session.token, body: { month, items } }); onSaved(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="План продаж" onClose={onClose} wide>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Месяц</label>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full px-3 py-2.5 rounded-xl mb-3 mt-1 font-mono-kz" style={{ border: "1.5px solid var(--line)", fontSize: 14 }} />
      <LiveState {...r} onRetry={r.reload} empty={r.data && !r.data.items.length ? "Нет ТП: в 1С у клиентов не указан основной менеджер" : null} />
      {r.data && r.data.items.map((x) => (
        <div key={x.manager} className="flex items-center gap-2 mb-2">
          <span className="flex-1" style={{ fontSize: 13, fontWeight: 600 }}>{x.manager}</span>
          <input inputMode="numeric" value={vals[x.manager] || ""} placeholder="0" onChange={(e) => setVals({ ...vals, [x.manager]: e.target.value.replace(/[^\d\s]/g, "") })}
            className="font-mono-kz px-3 py-2 rounded-xl text-right" style={{ width: 150, border: "1.5px solid var(--line)", fontSize: 13 }} />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>₸</span>
        </div>
      ))}
      {r.data && r.data.items.length > 0 && <MgRow l="Итого план" v={stMoney(total)} strong />}
      {err && <p style={{ fontSize: 12, color: "var(--red)", margin: "8px 0" }}>{err}</p>}
      <div className="mt-3"><PrimaryButton full onClick={save} disabled={!r.data || !r.data.items.length}>Сохранить план</PrimaryButton></div>
    </Modal>
  );
}
