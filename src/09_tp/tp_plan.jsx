// Sapar Trade — торговый представитель. Модуль: «Мой план» — личный план продаж ТП
// Только своё: план месяца, выполнено, осталось / сверх плана, процент. Чужих ТП и рейтинга здесь нет (ТЗ TZ_PLAN_PROMO).

const PLAN_MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const planMonthTitle = (ym) => PLAN_MONTHS[Number(ym.slice(5, 7)) - 1] + " " + ym.slice(0, 4);

function MyPlan({ session, authLost }) {
  const canPick = liveCan(session, "team"); // владелец и директор смотрят «как ТП»
  const [manager, setManager] = useState("");
  const [which, setWhich] = useState(0); // 0 — текущий месяц, 1 — прошлый
  const r = useLive(session, "/api/my-plan" + (manager ? "?manager=" + encodeURIComponent(manager) : ""), authLost);
  const d = r.data;
  const m = d && d.months && d.months[which];
  return (
    <>
      {canPick && d && d.managers && (
        <div className="mb-3">
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Показать план торгового представителя</label>
          <select value={manager} onChange={(e) => setManager(e.target.value)} className="w-full px-3 py-2.5 rounded-xl mt-1" style={{ border: "1.5px solid var(--line)", fontSize: 14, background: "#fff" }}>
            <option value="">Выберите из списка</option>
            {d.managers.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
      )}
      {d && d.months.length > 0 && <LiveFreshness lastSync={d.lastSync} stale={d.stale} />}
      <LiveState {...r} onRetry={r.reload} empty={d && !d.months.length && !canPick ? "Вам ещё не назначен основной менеджер 1С — обратитесь к директору" : null} />
      {d && d.months.length > 0 && (
        <>
          <div className="flex gap-2 mb-3">
            <LiveChip on={which === 0} onClick={() => setWhich(0)}>Этот месяц</LiveChip>
            <LiveChip on={which === 1} onClick={() => setWhich(1)}>Прошлый месяц</LiveChip>
          </div>
          <PlanCard m={m} />
          {which === 0 && d.clients && (
            <div className="rounded-2xl p-3 mt-3" style={{ background: "#fff", border: "1px solid var(--line)" }}>
              <MgRow l="Клиенты: покупали / закреплено" v={d.clients.active + " / " + d.clients.total} />
              <MgRow l="Средняя выручка на клиента" v={stMoney(d.clients.avg)} />
              <MgRow l="Долг клиентов / просрочено" v={shortMoney(d.clients.debt) + " / " + shortMoney(d.clients.overdue)} color={d.clients.overdue > 0 ? "var(--red)" : undefined} />
            </div>
          )}
          <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 10 }}>Выполнено — продажи ваших клиентов по данным 1С. Заказы выше плана принимаются без ограничений.</p>
        </>
      )}
    </>
  );
}

function PlanCard({ m }) {
  if (!m) return null;
  const hasPlan = m.plan !== null;
  const done = hasPlan && m.plan > 0 && m.done >= m.plan;
  const color = done ? "#1FA854" : "var(--navy)";
  return (
    <div className="rounded-2xl p-4" style={{ background: "#fff", border: "1px solid " + (done ? "#BFE6CC" : "var(--line)") }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{planMonthTitle(m.month)}</p>
      {!hasPlan ? (
        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginTop: 8 }}>План на месяц ещё не назначен директором</p>
      ) : (
        <>
          <div className="flex items-end justify-between" style={{ marginTop: 6 }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--muted)" }}>План</p>
              <p className="font-mono-kz" style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)" }}>{stMoney(m.plan)}</p>
            </div>
            <p className="font-mono-kz" style={{ fontSize: 26, fontWeight: 800, color }}>{fp(m.pct || 0)}</p>
          </div>
          <div style={{ margin: "10px 0" }}><MgBar value={m.pct || 0} color={color} /></div>
          <MgRow l="Выполнено" v={stMoney(m.done)} strong />
          {m.over > 0
            ? <MgRow l="Сверх плана" v={"+" + stMoney(m.over)} color="#127A33" strong />
            : <MgRow l="Осталось" v={stMoney(m.left)} strong />}
          {m.over > 0 && <p style={{ fontSize: 12, fontWeight: 700, color: "#127A33", marginTop: 6 }}>План выполнен — так держать!</p>}
        </>
      )}
    </div>
  );
}
