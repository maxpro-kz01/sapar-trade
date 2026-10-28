// Sapar Trade — система управления. Модуль: Финансы (только владелец, данные 1С)
// Выручка, себестоимость, валовая прибыль и маржа: итоги с сравнением, по дням, по группам товаров.

function MgFinance({ session, range, authLost }) {
  const r = useLive(session, "/api/finance?" + stQs(range), authLost);
  const d = r.data;
  if (!d) return <LiveState {...r} onRetry={r.reload} />;
  const t = d.totals, p = d.prev;
  return (
    <>
      <LiveFreshness lastSync={d.lastSync} stale={d.stale} />
      <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
        <MgKpi label="Выручка" value={stMoney(t.revenue)} cur={t.revenue} prev={p.revenue} />
        <MgKpi label="Себестоимость" value={stMoney(t.cost)} cur={t.cost} prev={p.cost} invert />
        <MgKpi label="Валовая прибыль" value={stMoney(t.gross)} cur={t.gross} prev={p.gross} />
        <MgKpi label="Маржа" value={t.marginPct === null ? "—" : fp(t.marginPct)} cur={t.marginPct || 0} prev={p.marginPct ?? undefined} noMoneyDelta />
      </div>
      <div className="kz-cols2">
        {d.daily.length > 1 && (
          <MgCard>
            <MgLabel>Валовая прибыль по дням</MgLabel>
            <MgTrend data={d.daily.map((x) => ({ v: x.gross, label: stFmtDay(x.day) }))} color="#127A33" />
          </MgCard>
        )}
        <MgCard>
          <MgLabel>По группам товаров</MgLabel>
          {d.groups.map((g) => (
            <LiveItem key={g.name} title={g.name} sub={"выручка " + shortMoney(g.revenue) + " · себест. " + shortMoney(g.cost)}
              value={stMoney(g.gross)} valueSub={g.marginPct === null ? "—" : "маржа " + fp(g.marginPct)} valueColor={g.gross < 0 ? "var(--red)" : undefined} />
          ))}
          {!d.groups.length && <p style={{ fontSize: 12, color: "var(--muted)" }}>Продаж за период нет</p>}
        </MgCard>
      </div>
      <MgCard style={{ background: "#FFF6DE", borderColor: "#F5D68A" }}>
        <p style={{ fontSize: 12, color: "#8A5A00" }}>{d.notYet}</p>
      </MgCard>
    </>
  );
}
