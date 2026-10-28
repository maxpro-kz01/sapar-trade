// Sapar Trade — система управления. Модуль: Проблемы — рассчитываются сервером из данных 1С по правам роли
// Нажатие на проблему открывает нужный раздел с фильтром.

function MgProblems({ session, authLost, go }) {
  const r = useLive(session, "/api/problems", authLost);
  if (!r.data) return <LiveState {...r} onRetry={r.reload} />;
  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <p style={{ fontSize: 11, color: "var(--muted)" }}>Проверено: {stFmtTime(r.data.at)}</p>
        <GhostButton small onClick={r.reload}>Обновить</GhostButton>
      </div>
      {r.data.items.map((p) => <MgProblemRow key={p.code} p={p} onGo={go} />)}
    </>
  );
}
