// Sapar Trade — система управления. Модуль: Продажи по дням, товарам, группам, клиентам и ТП (данные 1С)
// Маржа по клиентам и ТП — приблизительная: в 1С себестоимость ведётся по товару, считаем по себестоимости единицы.

const MG_SALES_GROUPS = [["day", "По дням"], ["product", "Товары"], ["group", "Группы"], ["client", "Клиенты"], ["manager", "ТП"]];

function MgSales({ session, range, authLost, go }) {
  const [group, setGroup] = useState("day");
  const r = useLive(session, "/api/sales?" + stQs({ ...range, group }), authLost);
  const items = r.data ? r.data.items : [];
  const hasMargin = items.some((x) => x.marginPct !== undefined);
  const hasGross = items.some((x) => x.gross !== undefined);
  const title = (x) => (group === "day" ? stFmtDate(x.name) : x.name);
  const exportCsv = () => {
    const head = ["Название", "Кол-во", "Выручка"].concat(hasGross ? ["Себестоимость", "Валовая"] : []).concat(hasMargin ? ["Маржа %"] : []);
    const rows = items.map((x) => [title(x), x.qty, x.revenue].concat(hasGross ? [x.cost, x.gross] : []).concat(hasMargin ? [x.marginPct === null ? "" : x.marginPct] : []));
    downloadCsv(`sapar-prodazhi-${group}-${range.from}_${range.to}.csv`, [head, ...rows]);
    stApi("/api/export-log", { method: "POST", token: session.token, body: { screen: "sales:" + group, rows: rows.length } }).catch(() => {});
  };
  const sub = (x) => [
    stNum(x.qty) + " шт", x.group_name, x.products ? x.products + " товаров" : null, x.clients ? x.clients + " клиентов" : null,
    x.manager, x.last_day ? "посл. покупка " + stFmtDate(x.last_day) : null,
  ].filter(Boolean).join(" · ");
  const onItem = (x) => {
    if (group === "manager" && x.key !== "Без менеджера") go("clients", { manager: x.key });
  };
  return (
    <>
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {MG_SALES_GROUPS.map(([id, l]) => <LiveChip key={id} on={group === id} onClick={() => setGroup(id)}>{l}</LiveChip>)}
        <div className="flex-1" />
        {items.length > 0 && <button onClick={exportCsv} className="shrink-0 px-3 py-1.5 rounded-full flex items-center gap-1" style={{ fontSize: 11.5, background: "#F2F1F8", fontWeight: 700 }}><Ico name="download" size={13} />CSV</button>}
      </div>
      {r.data && <LiveFreshness lastSync={r.data.lastSync} stale={r.data.stale} />}
      <LiveState {...r} onRetry={r.reload} empty={r.data && !items.length ? "Продаж за период нет" : null} />
      {items.length > 0 && (
        <MgCard>
          <MgRow l="Итого выручка" v={stMoney(r.data.total)} strong />
          {r.data.approxCost && <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>Маржа по клиентам и ТП — приблизительная: в 1С себестоимость ведётся по товарам.</p>}
          {group === "day" && items.length > 1 && <div className="mt-2"><MgTrend data={items.map((x) => ({ v: x.revenue, label: stFmtDay(x.name) }))} /></div>}
          <div className="mt-1">
            {items.map((x) => (
              <div key={x.key || "none"} onClick={() => onItem(x)} style={{ cursor: group === "manager" ? "pointer" : "default" }}>
                <LiveItem title={title(x)} sub={sub(x)} value={stMoney(x.revenue)}
                  valueSub={[x.gross !== undefined ? "валовая " + shortMoney(x.gross) : null, x.marginPct !== undefined ? (x.marginPct === null ? "—" : fp(x.marginPct)) : null].filter(Boolean).join(" · ") || null} />
              </div>
            ))}
          </div>
        </MgCard>
      )}
    </>
  );
}
