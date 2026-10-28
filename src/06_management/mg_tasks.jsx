// Sapar Trade — система управления. Модуль: Задачи (хранятся на сервере)
// Создать и назначить, статус, срок, приоритет, комментарии. Владелец и директор видят все задачи, остальные — свои.

const MG_TASK_STATUSES = ["Новая", "В работе", "Выполнена", "Отменена"];
const MG_PRIO_COLOR = { "Высокий": ["#FCE7E6", "#B3261E"], "Средний": ["#FFF6DE", "#8A5A00"], "Низкий": ["#F2F1F8", "var(--muted)"] };

function MgTasks({ session, authLost, showToast }) {
  const [filter, setFilter] = useState("active");
  const r = useLive(session, "/api/tasks", authLost);
  const staff = useLive(session, "/api/staff", authLost);
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const me = session.user.id;
  const all = r.data || [];
  const list = all.filter((t) => filter === "all" ? true : filter === "mine" ? t.assignee_id === me : !["Выполнена", "Отменена"].includes(t.status));
  const call = async (path, method, body, ok) => {
    setErr("");
    try { await stApi(path, { method, token: session.token, body }); if (ok) showToast(ok); r.reload(); return true; }
    catch (e) { setErr(e.message); showToast(e.message); return false; }
  };
  const create = async () => { if (await call("/api/tasks", "POST", form, "Задача создана")) setForm(null); };
  const today = stToday();
  return (
    <>
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {[["active", "Активные"], ["mine", "Мне"], ["all", "Все"]].map(([id, l]) => <LiveChip key={id} on={filter === id} onClick={() => setFilter(id)}>{l}</LiveChip>)}
        <div className="flex-1" />
        <button onClick={() => setForm({ title: "", assigneeId: me, deadline: "", priority: "Средний", description: "" })} className="shrink-0 px-3 py-1.5 rounded-full flex items-center gap-1" style={{ fontSize: 11.5, background: "var(--navy)", color: "#fff", fontWeight: 700 }}>
          <Ico name="plus" size={13} color="#fff" />Новая задача
        </button>
      </div>
      <LiveState {...r} onRetry={r.reload} empty={r.data && !list.length ? "Задач нет" : null} />
      <div className="kz-list">
        {list.map((t) => {
          const [bg, fg] = MG_PRIO_COLOR[t.priority] || MG_PRIO_COLOR["Средний"];
          const late = t.deadline && t.deadline < today && !["Выполнена", "Отменена"].includes(t.status);
          const canEdit = liveCan(session, "tasks.all") || t.creator_id === me || t.assignee_id === me;
          return (
            <MgCard key={t.id}>
              <div onClick={() => setOpen(open === t.id ? null : t.id)} style={{ cursor: "pointer" }}>
                <div className="flex items-start gap-2">
                  <p className="flex-1" style={{ fontSize: 13.5, fontWeight: 800, textDecoration: t.status === "Выполнена" ? "line-through" : "none" }}>{t.title}</p>
                  <Badge bg={bg} fg={fg}>{t.priority}</Badge>
                </div>
                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                  {t.assignee || "без исполнителя"} · от {t.creator}{t.deadline ? " · до " + stFmtDate(t.deadline) : ""}
                  {late && <span style={{ color: "var(--red)", fontWeight: 700 }}> · просрочена</span>}
                </p>
                <p style={{ fontSize: 11.5, fontWeight: 700, marginTop: 4, color: t.status === "Выполнена" ? "#127A33" : "var(--navy)" }}>{t.status}{t.comments.length ? " · 💬 " + t.comments.length : ""}</p>
              </div>
              {open === t.id && (
                <div className="mt-2 pt-2" style={{ borderTop: "1px dashed var(--line)" }}>
                  {t.description && <p style={{ fontSize: 12.5, marginBottom: 8, whiteSpace: "pre-wrap" }}>{t.description}</p>}
                  {canEdit && (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {MG_TASK_STATUSES.filter((s) => s !== t.status).map((s) => <LiveChip key={s} onClick={() => call("/api/tasks/" + t.id, "PATCH", { status: s }, "Статус: " + s)}>{s}</LiveChip>)}
                    </div>
                  )}
                  {t.comments.map((c) => (
                    <div key={c.id} className="rounded-xl px-3 py-2 mb-1.5" style={{ background: "#F6F5FA" }}>
                      <p style={{ fontSize: 11, color: "var(--muted)" }}>{c.user} · {stFmtTime(c.at)}</p>
                      <p style={{ fontSize: 12.5 }}>{c.text}</p>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-1">
                    <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий" className="flex-1 px-3 py-2 rounded-xl" style={{ border: "1.5px solid var(--line)", fontSize: 13 }} />
                    <GhostButton small onClick={async () => { if (comment.trim() && await call("/api/tasks/" + t.id + "/comments", "POST", { text: comment }, "Комментарий добавлен")) setComment(""); }}>Отправить</GhostButton>
                  </div>
                </div>
              )}
            </MgCard>
          );
        })}
      </div>
      {form && (
        <Modal title="Новая задача" onClose={() => setForm(null)}>
          <Field label="Что сделать" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Исполнитель</label>
          <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: Number(e.target.value) })} className="w-full px-3 py-3 rounded-xl mb-3 mt-1" style={{ border: "1.5px solid var(--line)", fontSize: 14, background: "#fff" }}>
            {(staff.data || [{ id: me, name: session.user.name, role: session.user.role }]).map((u) => <option key={u.id} value={u.id}>{u.name} · {LIVE_ROLES[u.role] || u.role}</option>)}
          </select>
          <Field label="Срок" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Приоритет</label>
          <div className="flex gap-1.5 mb-3 mt-1">{["Высокий", "Средний", "Низкий"].map((p) => <LiveChip key={p} on={form.priority === p} onClick={() => setForm({ ...form, priority: p })}>{p}</LiveChip>)}</div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Описание</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-xl mb-3 mt-1" style={{ border: "1.5px solid var(--line)", fontSize: 13 }} />
          {err && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 8 }}>{err}</p>}
          <PrimaryButton full disabled={!form.title.trim()} onClick={create}>Создать</PrimaryButton>
        </Modal>
      )}
    </>
  );
}
