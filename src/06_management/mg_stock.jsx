// Sapar Trade — система управления. Модуль: Склад (данные 1С)
// Остатки, сумма по цене продажи, отрицательные, без цены, неликвид (нет продаж 30/60/90 дней), на сколько дней хватит.

function MgStock({ session, authLost, param }) {
  const [wh, setWh] = useState("");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState(param === "low" ? "low" : param === "dead" ? "dead" : "all");
  const dq = useDebounced(q);
  const r = useLive(session, "/api/stock?" + stQs({ warehouse: wh, q: dq, low: mode === "low", dead: mode === "dead" ? 60 : "" }), authLost);
  const d = r.data;
  const sm = d && d.summary;
  return (
    <>
      {d && <LiveFreshness lastSync={d.lastSync} stale={d.stale} />}
      {sm && (
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          <MgKpi label={"Склад по цене «" + (d.priceType || "—") + "»"} value={stMoney(sm.value)} />
          <MgKpi label="Позиций в наличии" value={stNum(sm.positions)} />
          <MgKpi label="Отрицательные остатки" value={stNum(sm.negative)} accent={sm.negative > 0 ? "#F3B4B0" : undefined} onClick={() => setMode("low")} />
          <MgKpi label="Без цены" value={stNum(sm.noPrice)} />
          {sm.dead.map((x) => <MgKpi key={x.days} label={"Неликвид " + x.days + "+ дней"} value={stMoney(x.value)} onClick={x.days === 60 ? () => setMode("dead") : undefined} />)}
        </div>
      )}
      {sm && sm.historyFrom && <p style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 8 }}>Неликвид и «хватит на дней» считаются по истории продаж с {stFmtDate(sm.historyFrom)}. Чем длиннее история, тем точнее.</p>}
      {d && d.warehouses.length > 1 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
          <LiveChip on={!wh} onClick={() => setWh("")}>Все склады</LiveChip>
          {d.warehouses.map((w) => <LiveChip key={w.code} on={wh === w.code} onClick={() => setWh(w.code)}>{w.name} · {shortMoney(w.value)}</LiveChip>)}
        </div>
      )}
      <LiveSearch value={q} onChange={setQ} placeholder="Товар, артикул или код" />
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        <LiveChip on={mode === "all"} onClick={() => setMode("all")}>Все</LiveChip>
        <LiveChip on={mode === "low"} onClick={() => setMode("low")}>Ноль и минус</LiveChip>
        <LiveChip on={mode === "dead"} onClick={() => setMode("dead")}>Неликвид 60+ дней</LiveChip>
      </div>
      <LiveState {...r} onRetry={r.reload} empty={d && !d.items.length ? "Ничего не найдено" : null} />
      {d && d.items.length > 0 && (
        <MgCard>
          {d.items.map((x) => (
            <LiveItem key={x.warehouse_code + "|" + x.code} title={x.name}
              sub={[d.warehouses.length > 1 ? x.warehouse : null, x.group_name, x.last_day ? "посл. продажа " + stFmtDate(x.last_day) : "продаж не было",
                x.days_cover !== null ? "хватит ≈ " + x.days_cover + " дн." : null].filter(Boolean).join(" · ")}
              value={stNum(x.qty) + " " + (x.unit || "")} valueColor={x.qty <= 0 ? "var(--red)" : undefined}
              valueSub={x.price === null ? "нет цены" : stMoney(x.value)} />
          ))}
          {d.items.length >= 500 && <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>Показаны первые 500 — уточните поиск</p>}
        </MgCard>
      )}
    </>
  );
}
