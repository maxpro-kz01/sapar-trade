// Sapar Trade — система управления. Модуль: Главная («один экран» по ТЗ §6) на данных 1С
// Показатели с сравнением с прошлым периодом той же длины; поля приходят с сервера уже по правам роли.

function MgHome({ session, range, authLost, go }) {
  const r = useLive(session, "/api/dashboard?" + stQs(range), authLost);
  const pr = useLive(session, "/api/problems", authLost);
  const d = r.data;
  if (!d) return <LiveState {...r} onRetry={r.reload} />;
  const s = d.sales, p = d.prev || {};
  const problems = pr.data ? pr.data.items.filter((x) => x.lvl !== "green").slice(0, 4) : [];
  return (
    <>
      <LiveFreshness lastSync={d.lastSync} stale={d.stale} />
      {s && s.plan !== undefined && (
        <MgCard onClick={() => go("team")}>
          <div className="flex justify-between items-baseline mb-1.5">
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>План продаж</span>
            <span className="font-mono-kz" style={{ fontSize: 13, fontWeight: 800 }}>{fp(s.planPct || 0)}</span>
          </div>
          <MgBar value={s.planPct || 0} color={(s.planPct || 0) >= 100 ? "#1FA854" : "var(--navy)"} />
          <p className="font-mono-kz" style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>{stMoney(s.revenue)} из {stMoney(s.plan)}</p>
        </MgCard>
      )}
      <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
        {s && <MgKpi label="Выручка" value={stMoney(s.revenue)} cur={s.revenue} prev={p.revenue} onClick={() => go("sales")} />}
        {s && s.marginPct !== undefined && <MgKpi label="Маржа" value={s.marginPct === null ? "—" : fp(s.marginPct)} cur={s.marginPct || 0} prev={p.marginPct ?? undefined} noMoneyDelta />}
        {s && s.gross !== undefined && <MgKpi label="Валовая прибыль" value={stMoney(s.gross)} cur={s.gross} prev={p.gross} onClick={() => go("finance")} />}
        {s && s.cost !== undefined && <MgKpi label="Себестоимость" value={stMoney(s.cost)} cur={s.cost} prev={p.cost} invert />}
        {s && <MgKpi label="Клиентов с покупками" value={stNum(s.clients)} cur={s.clients} prev={p.clients} noMoneyDelta={false} onClick={() => go("clients")} />}
        {s && <MgKpi label="В среднем за день" value={stMoney(s.avgPerDay)} />}
        {d.stock && <MgKpi label="Склад по цене продажи" value={stMoney(d.stock.value)} onClick={() => go("stock")} />}
        {d.debts && <MgKpi label="Дебиторка" value={stMoney(d.debts.total)} onClick={() => go("clients", "debtors")} />}
        {d.debts && <MgKpi label={"Просрочено > " + d.debts.overdueDays + " дн."} value={stMoney(d.debts.overdue)} accent={d.debts.overdue > 0 ? "#F3B4B0" : undefined} onClick={() => go("clients", "debtors")} />}
      </div>
      {!s && !d.stock && !d.debts && <LiveState empty="Для вашей роли на главной нет показателей из 1С" />}
      {problems.length > 0 && (
        <>
          <MgLabel>Требует внимания</MgLabel>
          {problems.map((x) => <MgProblemRow key={x.code} p={x} onGo={go} />)}
        </>
      )}
      <div className="kz-cols2">
        {d.daily && d.daily.length > 1 && (
          <MgCard>
            <MgLabel>Выручка по дням</MgLabel>
            <MgTrend data={d.daily.map((x) => ({ v: x.revenue, label: stFmtDay(x.day) }))} />
          </MgCard>
        )}
        {d.topProducts && d.topProducts.length > 0 && (
          <MgCard>
            <MgLabel>Топ товаров</MgLabel>
            {d.topProducts.map((x) => (
              <LiveItem key={x.code} title={x.name} sub={stNum(x.qty) + " шт"} value={stMoney(x.revenue)}
                valueSub={x.marginPct !== undefined ? "маржа " + (x.marginPct === null ? "—" : fp(x.marginPct)) : null} />
            ))}
          </MgCard>
        )}
        {d.topClients && d.topClients.length > 0 && (
          <MgCard>
            <MgLabel>Топ клиентов</MgLabel>
            {d.topClients.map((x) => <LiveItem key={x.code || "none"} title={x.name} sub={x.manager} value={stMoney(x.revenue)} />)}
          </MgCard>
        )}
      </div>
    </>
  );
}
