// Sapar Trade — система управления. Модуль: Финансы — прибыль (владелец), деньги (владелец, бухгалтер, финансист), поступления (директор)
// ТЗ финансов v1.2: чистая прибыль = валовая − операционные расходы (выплаты по статьям движения денег из 1С).

function MgFinance({ session, range, authLost, showToast }) {
  const owner = liveCan(session, "gross");
  const cash = liveCan(session, "cash", "cash.in");
  return (
    <>
      {owner && <MgProfit session={session} range={range} authLost={authLost} />}
      {cash && <MgMoney session={session} range={range} authLost={authLost} full={liveCan(session, "cash")} />}
      {owner && <MgCfArticles session={session} authLost={authLost} showToast={showToast} />}
    </>
  );
}

// Прибыль: выручка → себестоимость → валовая → расходы → чистая; по месяцам; по группам товаров
function MgProfit({ session, range, authLost }) {
  const r = useLive(session, "/api/finance?" + stQs(range), authLost);
  const d = r.data;
  if (!d) return <LiveState {...r} onRetry={r.reload} />;
  const t = d.totals, p = d.prev;
  return (
    <>
      <LiveFreshness lastSync={d.lastSync} stale={d.stale} />
      <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
        <MgKpi label="Выручка" value={stMoney(t.revenue)} cur={t.revenue} prev={p.revenue} />
        <MgKpi label="Валовая прибыль" value={stMoney(t.gross)} cur={t.gross} prev={p.gross} />
        <MgKpi label="Расходы" value={stMoney(t.expenses)} cur={t.expenses} prev={p.expenses} invert />
        <MgKpi label="Чистая прибыль" value={stMoney(t.net)} cur={t.net} prev={p.net} accent={t.net < 0 ? "var(--red)" : "#9FD8B0"} />
      </div>
      <div className="kz-cols2">
        <MgCard>
          <MgLabel>Прибыль за период</MgLabel>
          <MgRow l="Выручка" v={stMoney(t.revenue)} />
          <MgRow l="− Себестоимость" v={stMoney(t.cost)} />
          <MgRow l="= Валовая прибыль" v={stMoney(t.gross)} strong />
          <MgRow l="Маржа валовая" v={t.marginPct === null ? "—" : fp(t.marginPct)} />
          <MgRow l="− Операционные расходы" v={stMoney(t.expenses)} />
          <MgRow l="= Чистая прибыль" v={stMoney(t.net)} strong color={t.net < 0 ? "var(--red)" : "#127A33"} />
          <MgRow l="Рентабельность" v={t.netPct === null ? "—" : fp(t.netPct)} />
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.45 }}>
            Расходы — выплаты по статьям движения денег в 1С (по дню оплаты). Оплата поставщикам, переводы между своими счетами и займы в расходы не входят.
          </p>
        </MgCard>
        <MgCard>
          <MgLabel>Расходы по статьям</MgLabel>
          {d.expenses.slice(0, 12).map((x) => <MgRow key={x.article} l={x.article || "(без статьи)"} v={stMoney(x.amount)} />)}
          {!d.expenses.length && <p style={{ fontSize: 12, color: "var(--muted)" }}>Расходов за период нет (или агент ещё не прислал движение денег)</p>}
        </MgCard>
      </div>
      <MgCard>
        <MgLabel>По месяцам</MgLabel>
        <div className="overflow-x-auto">
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 420 }}>
            <thead><tr style={{ color: "var(--muted)", textAlign: "right" }}>
              <th style={{ textAlign: "left", fontWeight: 600, padding: "4px 0" }}>Месяц</th>
              <th style={{ fontWeight: 600 }}>Выручка</th><th style={{ fontWeight: 600 }}>Валовая</th><th style={{ fontWeight: 600 }}>Расходы</th><th style={{ fontWeight: 600 }}>Чистая</th>
            </tr></thead>
            <tbody>{d.months.map((m) => (
              <tr key={m.month} className="font-mono-kz" style={{ textAlign: "right", borderTop: "1px dashed var(--line)" }}>
                <td style={{ textAlign: "left", padding: "6px 0" }}>{stFmtDay(m.month).slice(3)}.{m.month.slice(0, 4)}</td>
                <td>{shortMoney(m.revenue)}</td><td>{shortMoney(m.gross)}</td><td>{shortMoney(m.expenses)}</td>
                <td style={{ fontWeight: 800, color: m.net < 0 ? "var(--red)" : "#127A33" }}>{shortMoney(m.net)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </MgCard>
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
    </>
  );
}
