// Sapar Trade — рабочая версия. Модуль: общие элементы экранов с данными 1С
// Плашка свежести данных, выбор периода, состояния загрузки/ошибки, строка списка, поиск.

function LiveFreshness({ lastSync, stale }) {
  if (!lastSync) return (
    <div className="rounded-xl px-3 py-2 mb-3 flex items-center gap-2" style={{ background: "#FFF6DE" }}>
      <Ico name="clock" size={14} color="#8A5A00" />
      <span style={{ fontSize: 11.5, color: "#8A5A00", fontWeight: 600 }}>Данные из 1С ещё не загружались. Нужно запустить агент на сервере 1С.</span>
    </div>
  );
  return (
    <div className="rounded-xl px-3 py-2 mb-3 flex items-center gap-2" style={{ background: stale ? "#FCE7E6" : "#E4F7EA" }}>
      <Ico name="clock" size={14} color={stale ? "#B3261E" : "#127A33"} />
      <span style={{ fontSize: 11.5, color: stale ? "#B3261E" : "#127A33", fontWeight: 600 }}>
        {stale ? "Данные устарели. " : "1С · "}Обновлено: {stFmtTime(lastSync)}
      </span>
    </div>
  );
}

function LivePeriodBar({ period, setPeriod, custom, setCustom }) {
  return (
    <div className="mb-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {ST_PERIODS.map(([id, l]) => (
          <button key={id} onClick={() => setPeriod(id)} className="shrink-0 px-3 py-1.5 rounded-full font-semibold"
            style={{ fontSize: 11.5, background: period === id ? "var(--navy)" : "#F2F1F8", color: period === id ? "#fff" : "var(--ink)" }}>{l}</button>
        ))}
      </div>
      {period === "custom" && (
        <div className="flex gap-2 mt-2">
          <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="font-mono-kz flex-1 px-3 py-2 rounded-xl" style={{ border: "1px solid var(--line)", fontSize: 12 }} />
          <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="font-mono-kz flex-1 px-3 py-2 rounded-xl" style={{ border: "1px solid var(--line)", fontSize: 12 }} />
        </div>
      )}
    </div>
  );
}

function LiveState({ loading, error, onRetry, empty }) {
  if (loading) return <p className="text-center py-8" style={{ fontSize: 12.5, color: "var(--muted)" }}>Загрузка…</p>;
  if (error) return (
    <div className="rounded-2xl p-4 text-center" style={{ background: "#FCE7E6" }}>
      <p style={{ fontSize: 12.5, color: "#B3261E", fontWeight: 600, marginBottom: 8 }}>{error}</p>
      {onRetry && <GhostButton small onClick={onRetry}>Повторить</GhostButton>}
    </div>
  );
  if (empty) return <p className="text-center py-8" style={{ fontSize: 12.5, color: "var(--muted)" }}>{empty}</p>;
  return null;
}

function LiveSearch({ value, onChange, placeholder }) {
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 mb-3" style={{ background: "#fff", border: "1px solid var(--line)" }}>
      <Ico name="search" size={15} color="var(--muted)" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="flex-1 py-2.5 bg-transparent outline-none" style={{ fontSize: 13 }} />
      {value && <button onClick={() => onChange("")}><Ico name="x" size={14} color="var(--muted)" /></button>}
    </div>
  );
}

// Значение с задержкой (чтобы не дёргать сервер на каждую букву)
function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function LiveChip({ on, onClick, children }) {
  return (
    <button onClick={onClick} className="shrink-0 px-3 py-1.5 rounded-full font-semibold"
      style={{ fontSize: 11.5, background: on ? "var(--navy)" : "#F2F1F8", color: on ? "#fff" : "var(--ink)" }}>{children}</button>
  );
}

// Строка списка: слева название и подпись, справа сумма и подпись
function LiveItem({ title, sub, value, valueSub, valueColor }) {
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", wordBreak: "break-word" }}>{title}</p>
        {sub && <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{sub}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="font-mono-kz" style={{ fontSize: 13, fontWeight: 800, color: valueColor || "var(--ink)" }}>{value}</p>
        {valueSub && <p className="font-mono-kz" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>{valueSub}</p>}
      </div>
    </div>
  );
}

const liveCan = (session, ...perms) => perms.some((p) => (session.perms || []).includes(p));
