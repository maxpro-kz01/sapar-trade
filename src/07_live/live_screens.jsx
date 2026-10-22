// Sapar Trade — рабочая версия. Модуль: экраны с данными 1С — Главная, Продажи, Склад, Клиенты
// Сервер сам решает, какие поля видит роль (себестоимость/валовая — только владелец). Экран показывает то, что пришло.

function LiveHome({ session, range, authLost, go }) {
  const r = useLive(session, "/api/dashboard?" + stQs(range), authLost);
  const d = r.data;
  if (!d) return <LiveState {...r} onRetry={r.reload} />;
  const s = d.sales;
  const tiles = [];
  if (s) {
    tiles.push(["Выручка", stMoney(s.revenue), () => go("sales")]);
    if (s.marginPct !== undefined) tiles.push(["Маржа", s.marginPct === null ? "—" : fp(s.marginPct)]);
    if (s.gross !== undefined) tiles.push(["Валовая прибыль", stMoney(s.gross)]);
    if (s.cost !== undefined) tiles.push(["Себестоимость", stMoney(s.cost)]);
    tiles.push(["Клиентов с покупками", stNum(s.clients), () => go("clients")]);
    tiles.push(["В среднем за день", stMoney(s.avgPerDay)]);
  }
  if (d.stock) tiles.push(["Склад по цене продажи", stMoney(d.stock.value), () => go("stock")]);
  if (d.debts) {
    tiles.push(["Дебиторка", stMoney(d.debts.total), () => go("clients")]);
    tiles.push(["Просрочено > " + d.debts.overdueDays + " дн.", stMoney(d.debts.overdue), () => go("clients")]);
  }
  return (
    <>
      <LiveFreshness lastSync={d.lastSync} stale={d.stale} />
      {tiles.length === 0 && <LiveState empty="Для вашей роли на главной пока нет показателей" />}
      <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {tiles.map(([l, v, onClick]) => <MgKpi key={l} label={l} value={v} onClick={onClick} />)}
      </div>
      {d.stock && (d.stock.negative > 0 || d.stock.noPrice > 0) && (
        <MgCard style={{ background: "#FFF6DE", borderColor: "#F5D68A" }}>
          <p style={{ fontSize: 12, color: "#8A5A00", fontWeight: 600 }}>
            {d.stock.negative > 0 && <>Отрицательных остатков: {d.stock.negative}. </>}
            {d.stock.noPrice > 0 && <>Товаров без цены «{d.stock.priceType || "—"}»: {d.stock.noPrice}.</>}
          </p>
        </MgCard>
      )}
      <div className="kz-cols2">
        {d.daily && d.daily.length > 0 && (
          <MgCard>
            <MgLabel>Выручка по дням</MgLabel>
            <MgTrend data={d.daily.map((x) => ({ v: x.revenue, label: stFmtDay(x.day) }))} />
          </MgCard>
        )}
        {d.topProducts && d.topProducts.length > 0 && (
          <MgCard>
            <MgLabel>Топ товаров</MgLabel>
            {d.topProducts.map((x) => (
              <LiveItem key={x.code} title={x.name} sub={stNum(x.qty) + " шт"}
                value={stMoney(x.revenue)} valueSub={x.marginPct !== undefined ? "маржа " + (x.marginPct === null ? "—" : fp(x.marginPct)) : null} />
            ))}
          </MgCard>
        )}
        {d.topClients && d.topClients.length > 0 && (
          <MgCard>
            <MgLabel>Топ клиентов</MgLabel>
            {d.topClients.map((x) => <LiveItem key={x.code || "none"} title={x.name} value={stMoney(x.revenue)} />)}
          </MgCard>
        )}
      </div>
    </>
  );
}

function LiveSales({ session, range, authLost }) {
  const [group, setGroup] = useState("day");
  const r = useLive(session, "/api/sales?" + stQs({ ...range, group }), authLost);
  const items = r.data ? r.data.items : [];
  const hasMargin = items.some((x) => x.marginPct !== undefined);
  const hasGross = items.some((x) => x.gross !== undefined);
  const total = items.reduce((a, x) => a + x.revenue, 0);
  const exportCsv = () => {
    const head = ["Название", "Кол-во", "Выручка"].concat(hasGross ? ["Себестоимость", "Валовая"] : []).concat(hasMargin ? ["Маржа %"] : []);
    const rows = items.map((x) => [group === "day" ? stFmtDate(x.name) : x.name, x.qty, x.revenue]
      .concat(hasGross ? [x.cost, x.gross] : []).concat(hasMargin ? [x.marginPct === null ? "" : x.marginPct] : []));
    downloadCsv(`sapar-prodazhi-${range.from}_${range.to}.csv`, [head, ...rows]);
    stApi("/api/export-log", { method: "POST", token: session.token, body: { screen: "sales:" + group, rows: rows.length } }).catch(() => {});
  };
  return (
    <>
      <div className="flex gap-1.5 mb-3 overflow-x-auto">
        {[["day", "По дням"], ["product", "По товарам"], ["client", "По клиентам"]].map(([id, l]) =>
          <LiveChip key={id} on={group === id} onClick={() => setGroup(id)}>{l}</LiveChip>)}
        <div className="flex-1" />
        {items.length > 0 && <button onClick={exportCsv} className="shrink-0 px-3 py-1.5 rounded-full flex items-center gap-1" style={{ fontSize: 11.5, background: "#F2F1F8", fontWeight: 700 }}><Ico name="download" size={13} />CSV</button>}
      </div>
      {r.data && <LiveFreshness lastSync={r.data.lastSync} stale={r.data.stale} />}
      <LiveState {...r} onRetry={r.reload} empty={r.data && !items.length ? "Продаж за период нет" : null} />
      {items.length > 0 && (
        <MgCard>
          <MgRow l="Итого выручка" v={stMoney(total)} strong />
          {group === "client" && hasMargin && <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>Себестоимость в 1С ведётся по товарам, поэтому маржа по клиентам не считается.</p>}
          <div className="mt-1">
            {items.map((x) => (
              <LiveItem key={x.key || "none"}
                title={group === "day" ? stFmtDate(x.name) : x.name}
                sub={[stNum(x.qty) + " шт", x.group_name, x.manager, x.last_day ? "посл. покупка " + stFmtDate(x.last_day) : null].filter(Boolean).join(" · ")}
                value={stMoney(x.revenue)}
                valueSub={[x.gross !== undefined ? "валовая " + shortMoney(x.gross) : null, x.marginPct !== undefined ? (x.marginPct === null ? "—" : fp(x.marginPct)) : null].filter(Boolean).join(" · ") || null} />
            ))}
          </div>
        </MgCard>
      )}
    </>
  );
}

function LiveStock({ session, authLost }) {
  const [wh, setWh] = useState("");
  const [q, setQ] = useState("");
  const [low, setLow] = useState(false);
  const dq = useDebounced(q);
  const r = useLive(session, "/api/stock?" + stQs({ warehouse: wh, q: dq, low }), authLost);
  const d = r.data;
  return (
    <>
      {d && <LiveFreshness lastSync={d.lastSync} stale={d.stale} />}
      {d && d.warehouses.length > 0 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
          <LiveChip on={!wh} onClick={() => setWh("")}>Все склады</LiveChip>
          {d.warehouses.map((w) => <LiveChip key={w.code} on={wh === w.code} onClick={() => setWh(w.code)}>{w.name} · {shortMoney(w.value)}</LiveChip>)}
        </div>
      )}
      <LiveSearch value={q} onChange={setQ} placeholder="Товар, артикул или код" />
      <label className="flex items-center gap-2 mb-3" style={{ fontSize: 12.5 }}>
        <Toggle checked={low} onChange={setLow} /> Только нулевые и отрицательные
      </label>
      {d && d.priceType && <p style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 6 }}>Сумма — по типу цен «{d.priceType}»</p>}
      <LiveState {...r} onRetry={r.reload} empty={d && !d.items.length ? "Ничего не найдено" : null} />
      {d && d.items.length > 0 && (
        <MgCard>
          <div className="kz-list" style={{ display: "block" }}>
            {d.items.map((x) => (
              <LiveItem key={x.warehouse_code + "|" + x.code} title={x.name}
                sub={[x.warehouse, x.group_name, x.sku].filter(Boolean).join(" · ")}
                value={stNum(x.qty) + " " + (x.unit || "")} valueColor={x.qty <= 0 ? "var(--red)" : undefined}
                valueSub={x.price === null ? "нет цены" : stMoney(x.value)} />
            ))}
          </div>
          {d.items.length >= 500 && <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>Показаны первые 500 — уточните поиск</p>}
        </MgCard>
      )}
    </>
  );
}

function LiveClients({ session, range, authLost }) {
  const [q, setQ] = useState("");
  const [debtors, setDebtors] = useState(false);
  const dq = useDebounced(q);
  const r = useLive(session, "/api/clients?" + stQs({ ...range, q: dq, debtors }), authLost);
  const d = r.data;
  const totals = d ? d.items.reduce((a, x) => ({ debt: a.debt + (x.debt || 0), overdue: a.overdue + (x.overdue || 0) }), { debt: 0, overdue: 0 }) : null;
  const hasDebt = d && d.items.some((x) => x.debt !== undefined);
  return (
    <>
      {d && <LiveFreshness lastSync={d.lastSync} stale={d.stale} />}
      <LiveSearch value={q} onChange={setQ} placeholder="Название, телефон или код клиента" />
      {(hasDebt || debtors) && (
        <label className="flex items-center gap-2 mb-3" style={{ fontSize: 12.5 }}>
          <Toggle checked={debtors} onChange={setDebtors} /> Только должники
        </label>
      )}
      {hasDebt && (
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <MgKpi label="Долг в списке" value={stMoney(totals.debt)} />
          <MgKpi label={"Просрочено > " + d.overdueDays + " дн."} value={stMoney(totals.overdue)} accent={totals.overdue > 0 ? "#F3B4B0" : undefined} />
        </div>
      )}
      <LiveState {...r} onRetry={r.reload} empty={d && !d.items.length ? "Клиенты не найдены" : null} />
      {d && d.items.length > 0 && (
        <MgCard>
          {d.items.map((x) => (
            <LiveItem key={x.code} title={x.name}
              sub={[x.manager, x.phone, x.lastSale ? "посл. покупка " + stFmtDate(x.lastSale) : null].filter(Boolean).join(" · ")}
              value={x.debt !== undefined ? stMoney(x.debt) : stMoney(x.revenue)}
              valueColor={x.overdue > 0 ? "var(--red)" : undefined}
              valueSub={x.debt !== undefined
                ? (x.overdue > 0 ? "просрочено " + shortMoney(x.overdue) : x.debt > 0 ? "с " + stFmtDate(x.oldestDebt) : "долга нет")
                : null} />
          ))}
        </MgCard>
      )}
    </>
  );
}
