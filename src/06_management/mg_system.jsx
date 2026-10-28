// Sapar Trade — система управления. Модуль: Система — загрузки из 1С, сотрудники, журнал действий
// Разделы показываются по правам: интеграция (владелец, директор, бухгалтер), сотрудники и журнал (владелец).

const MG_AUDIT_ACTIONS = { "login.ok": "Вход", "login.fail": "Неудачный вход", "user.create": "Создан сотрудник", "user.update": "Изменён сотрудник",
  "password.change": "Смена пароля", "logout.all": "Выход на всех устройствах", export: "Выгрузка", "plans.save": "План продаж", "task.create": "Новая задача", "task.update": "Изменена задача" };

function MgAudit({ session, authLost }) {
  const r = useLive(session, "/api/audit", authLost);
  if (!r.data) return <LiveState {...r} onRetry={r.reload} />;
  return (
    <MgCard>
      {r.data.map((a) => (
        <LiveItem key={a.id} title={(MG_AUDIT_ACTIONS[a.action] || a.action) + (a.object ? " · " + a.object : "")}
          sub={(a.user_name || "—") + (a.ip ? " · " + a.ip : "")} value={stFmtTime(a.at)} />
      ))}
      {!r.data.length && <p style={{ fontSize: 12, color: "var(--muted)" }}>Пусто</p>}
    </MgCard>
  );
}

function MgSystem(p) {
  const { session } = p;
  const parts = [liveCan(session, "sync") && ["sync", "Интеграция 1С"], liveCan(session, "users") && ["users", "Сотрудники"], liveCan(session, "audit") && ["audit", "Журнал действий"]].filter(Boolean);
  const [part, setPart] = useState(parts[0] ? parts[0][0] : null);
  return (
    <>
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {parts.map(([id, l]) => <LiveChip key={id} on={part === id} onClick={() => setPart(id)}>{l}</LiveChip>)}
      </div>
      {part === "sync" && <LiveSync {...p} />}
      {part === "users" && <LiveUsers {...p} />}
      {part === "audit" && <MgAudit {...p} />}
    </>
  );
}
