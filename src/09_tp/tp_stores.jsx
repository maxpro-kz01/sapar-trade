// Sapar Trade — торговый представитель. Модуль: «Мои магазины» — клиенты ТП из 1С с долгом и последней покупкой
// Нажатие на магазин открывает оформление заказа.

function TpStores({ session, authLost, onOrder }) {
  const [q, setQ] = useState("");
  const [debtors, setDebtors] = useState(false);
  const dq = useDebounced(q);
  const t = stToday();
  const r = useLive(session, "/api/clients?" + stQs({ from: t.slice(0, 8) + "01", to: t, q: dq, debtors, limit: 500 }), authLost);
  const d = r.data;
  return (
    <>
      {d && <LiveFreshness lastSync={d.lastSync} stale={d.stale} />}
      <LiveSearch value={q} onChange={setQ} placeholder="Магазин, телефон или код" />
      <div className="flex gap-1.5 mb-3">
        <LiveChip on={!debtors} onClick={() => setDebtors(false)}>Все{d ? " · " + d.summary.clients : ""}</LiveChip>
        <LiveChip on={debtors} onClick={() => setDebtors(true)}>С долгом</LiveChip>
      </div>
      <LiveState {...r} onRetry={r.reload} empty={d && !d.items.length ? "Магазинов нет. Ваши клиенты определяются по 1С (торговый представитель в документах продаж)." : null} />
      {d && d.items.length > 0 && (
        <div className="kz-list">
          {d.items.map((x) => (
            <MgCard key={x.code} onClick={() => onOrder(x)}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13.5, fontWeight: 800 }}>{x.name}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)" }}>{[x.address, x.phone].filter(Boolean).join(" · ") || "—"}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)" }}>{x.lastSale ? "посл. покупка " + stFmtDate(x.lastSale) : "покупок нет"}</p>
                </div>
                <div className="text-right shrink-0">
                  {x.debt > 0 && <p className="font-mono-kz" style={{ fontSize: 13, fontWeight: 800, color: x.overdue > 0 ? "var(--red)" : "var(--ink)" }}>долг {shortMoney(x.debt)}</p>}
                  {x.overdue > 0 && <p style={{ fontSize: 10.5, color: "var(--red)" }}>просрочено {shortMoney(x.overdue)}</p>}
                  <span className="inline-block mt-1 px-2.5 py-1 rounded-full" style={{ fontSize: 11, fontWeight: 700, background: "var(--navy)", color: "#fff" }}>Заказ ›</span>
                </div>
              </div>
            </MgCard>
          ))}
        </div>
      )}
    </>
  );
}
