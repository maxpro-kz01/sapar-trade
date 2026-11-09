// Sapar Trade — система управления. Модуль: Деньги — остатки касс и счетов, движение денег по группам статей
// Директор видит только «Поступило от покупателей»; переводы между своими счетами в поступлениях и выплатах не считаются.

const MONEY_GROUP_COLORS = { customer: "#127A33", income_other: "#0B5A8A", supplier: "#8A5A00", transfer: "#77748C", loan: "#5B3FA8", expense: "#B3261E", none: "#77748C" };

function MgMoney({ session, range, authLost, full }) {
  const r = useLive(session, "/api/money?" + stQs(range), authLost);
  const d = r.data;
  if (!d) return <LiveState {...r} onRetry={r.reload} />;
  const rec = d.received;
  return (
    <>
      <MgLabel>Деньги</MgLabel>
      <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
        <MgKpi label="Поступило от покупателей" value={stMoney(rec.total)} cur={rec.total} prev={rec.prev} />
        {full && <MgKpi label="Всего поступило" value={stMoney(d.flow.in)} />}
        {full && <MgKpi label="Всего выплачено" value={stMoney(d.flow.out)} />}
        {full && <MgKpi label="Деньги сейчас" value={stMoney(d.balances.total)} accent={d.balances.total < 0 ? "var(--red)" : undefined} />}
      </div>
      {!full && rec.daily.length > 1 && (
        <MgCard><MgLabel>Поступления по дням</MgLabel><MgTrend data={rec.daily.map((x) => ({ v: x.amount, label: stFmtDay(x.day) }))} color="#127A33" /></MgCard>
      )}
      {full && (
        <div className="kz-cols2">
          <MgCard>
            <MgLabel>Остатки сейчас</MgLabel>
            {d.balances.accounts.map((a) => (
              <MgRow key={a.account} l={a.account + (a.kind ? " · " + a.kind.toLowerCase() : "")} v={stMoney(a.amount)} color={a.amount < 0 ? "var(--red)" : undefined} />
            ))}
            <MgRow l="Итого" v={stMoney(d.balances.total)} strong />
            {!d.balances.accounts.length && <p style={{ fontSize: 12, color: "var(--muted)" }}>Остатки ещё не загружены — обновите агент на сервере 1С</p>}
            {d.balances.negative > 0 && (
              <p style={{ fontSize: 11.5, color: "#B3261E", marginTop: 8, lineHeight: 1.45 }}>
                Минус в кассе или на счёте — так сейчас в 1С. Обычно это значит, что часть поступлений или выплат не проведена. Проверьте с бухгалтером.
              </p>
            )}
          </MgCard>
          <MgCard>
            <MgLabel>Движение за период</MgLabel>
            {d.flow.byGroup.map((g) => (
              <div key={g.grp} className="flex items-center gap-2 py-1.5" style={{ borderBottom: "1px dashed var(--line)" }}>
                <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: MONEY_GROUP_COLORS[g.grp] }} />
                <span className="flex-1 min-w-0" style={{ fontSize: 12.5, color: "var(--muted)" }}>{g.label}</span>
                <span className="font-mono-kz text-right" style={{ fontSize: 12, fontWeight: 700 }}>
                  {g.in ? <span style={{ color: "#127A33" }}>+{shortMoney(g.in)}</span> : null}{g.in && g.out ? " / " : ""}{g.out ? <span style={{ color: "#B3261E" }}>−{shortMoney(g.out)}</span> : null}
                </span>
              </div>
            ))}
            {!d.flow.byGroup.length && <p style={{ fontSize: 12, color: "var(--muted)" }}>Движения денег за период нет</p>}
            {d.flow.transfers > 0 && <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Переводы между своими счетами ({shortMoney(d.flow.transfers)}) в «Всего поступило/выплачено» не входят.</p>}
          </MgCard>
        </div>
      )}
      {full && d.flow.daily.length > 1 && (
        <MgCard>
          <MgLabel>Поступления по дням</MgLabel>
          <MgTrend data={d.flow.daily.map((x) => ({ v: x.in, label: stFmtDay(x.day) }))} color="#127A33" />
          <MgLabel>Выплаты по дням</MgLabel>
          <MgTrend data={d.flow.daily.map((x) => ({ v: x.out, label: stFmtDay(x.day) }))} color="#B3261E" />
        </MgCard>
      )}
      {full && d.flow.byArticle.length > 0 && (
        <MgCard>
          <MgLabel>По статьям</MgLabel>
          {d.flow.byArticle.slice(0, 20).map((a) => (
            <LiveItem key={a.article + a.grp} title={a.article} sub={MONEY_GROUP_LABEL(a.grp)}
              value={a.out ? "−" + stMoney(a.out) : "+" + stMoney(a.in)} valueColor={a.out ? "#B3261E" : "#127A33"}
              valueSub={a.in && a.out ? "+" + shortMoney(a.in) : undefined} />
          ))}
        </MgCard>
      )}
    </>
  );
}

const MONEY_GROUP_LABEL = (g) => ({ customer: "от покупателей", income_other: "прочие поступления", supplier: "поставщикам", transfer: "перевод между счетами", loan: "займы", expense: "расход", none: "без статьи" }[g] || g);
