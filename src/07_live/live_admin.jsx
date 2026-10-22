// Sapar Trade — рабочая версия. Модуль: Интеграция 1С (статус загрузок), Сотрудники, смена пароля
// Сотрудники — для владельца и администратора (администратор не видит и не создаёт владельца/директора).

const LIVE_ENTITY_NAMES = { products: "Товары", warehouses: "Склады", clients: "Клиенты", prices: "Цены", stock: "Остатки", debts: "Долги клиентов", sales: "Продажи", cost: "Себестоимость" };
const LIVE_ROLES = { owner: "Владелец", director: "Директор", supervisor: "Супервайзер", tp: "Торговый представитель", accountant: "Бухгалтер", financier: "Финансист", warehouse: "Склад", admin: "Администратор", driver: "Водитель-экспедитор" };

function LiveSync({ session, authLost }) {
  const r = useLive(session, "/api/sync/status", authLost);
  const d = r.data;
  if (!d) return <LiveState {...r} onRetry={r.reload} />;
  return (
    <>
      <LiveFreshness lastSync={d.lastSync} stale={d.stale} />
      <MgCard>
        <div className="flex items-center justify-between">
          <MgLabel>1С → Sapar Trade</MgLabel>
          <GhostButton small onClick={r.reload}>Обновить</GhostButton>
        </div>
        {d.items.map((x) => (
          <LiveItem key={x.entity} title={LIVE_ENTITY_NAMES[x.entity] || x.entity}
            sub={x.lastError && (!x.lastOk || new Date(x.lastError.at) > new Date(x.lastOk)) ? "Ошибка: " + x.lastError.error : null}
            value={x.lastOk ? stFmtTime(x.lastOk) : "не загружалось"} valueColor={x.stale ? "var(--red)" : "#127A33"}
            valueSub={x.rows !== null && x.rows !== undefined ? stNum(x.rows) + " строк" : null} />
        ))}
      </MgCard>
      <MgCard>
        <MgLabel>Журнал загрузок</MgLabel>
        {d.log.length === 0 && <p style={{ fontSize: 12, color: "var(--muted)" }}>Пока пусто</p>}
        {d.log.map((x) => (
          <LiveItem key={x.id} title={(LIVE_ENTITY_NAMES[x.entity] || x.entity) + (x.agent_host ? " · " + x.agent_host : "")}
            sub={x.error} value={x.ok ? "OK" : x.ok === false ? "Ошибка" : "…"} valueColor={x.ok ? "#127A33" : "var(--red)"}
            valueSub={stFmtTime(x.started_at) + (x.rows_in !== null ? " · " + stNum(x.rows_in) : "")} />
        ))}
      </MgCard>
    </>
  );
}

function LiveUsers({ session, authLost, showToast }) {
  const r = useLive(session, "/api/users", authLost);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const roles = Object.entries(LIVE_ROLES).filter(([id]) => session.user.role === "owner" || !["owner", "director"].includes(id));
  const save = async () => {
    setErr("");
    try {
      await stApi("/api/users", { method: "POST", token: session.token, body: form });
      setForm(null); showToast("Сотрудник создан"); r.reload();
    } catch (e) { setErr(e.message); }
  };
  const toggle = async (u) => {
    try {
      await stApi("/api/users/" + u.id, { method: "PATCH", token: session.token, body: { isActive: !u.isActive } });
      showToast(u.isActive ? "Доступ закрыт" : "Доступ открыт"); r.reload();
    } catch (e) { showToast(e.message); }
  };
  return (
    <>
      <PrimaryButton full onClick={() => setForm({ login: "", name: "", role: "tp", password: "", manager1c: "" })}>Добавить сотрудника</PrimaryButton>
      <div className="mt-3" />
      <LiveState {...r} onRetry={r.reload} />
      {r.data && (
        <MgCard>
          {r.data.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 13, fontWeight: 700, color: u.isActive ? "var(--ink)" : "var(--muted)" }}>{u.name} <span className="font-mono-kz" style={{ fontSize: 11, color: "var(--muted)" }}>{u.login}</span></p>
                <p style={{ fontSize: 11, color: "var(--muted)" }}>{LIVE_ROLES[u.role] || u.role}{u.manager1c ? " · 1С: " + u.manager1c : ""}{u.lastLoginAt ? " · вход " + stFmtTime(u.lastLoginAt) : ""}</p>
              </div>
              {u.id !== session.user.id && <GhostButton small onClick={() => toggle(u)}>{u.isActive ? "Закрыть доступ" : "Открыть"}</GhostButton>}
            </div>
          ))}
        </MgCard>
      )}
      {form && (
        <Modal title="Новый сотрудник" onClose={() => setForm(null)}>
          <Field label="Имя" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label="Логин (латиница)" value={form.login} autoCapitalize="none" onChange={(e) => setForm({ ...form, login: e.target.value.trim() })} />
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Роль</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-3 rounded-xl mb-3 mt-1" style={{ border: "1.5px solid var(--line)", fontSize: 14, background: "#fff" }}>
            {roles.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
          {["tp", "supervisor"].includes(form.role) && (
            <Field label="Менеджер в 1С (как в карточке клиента; несколько — через запятую)" value={form.manager1c} onChange={(e) => setForm({ ...form, manager1c: e.target.value })} />
          )}
          <Field label="Пароль (не меньше 8 символов, буквы и цифры)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {err && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 10 }}>{err}</p>}
          <PrimaryButton full disabled={!form.login || !form.password} onClick={save}>Создать</PrimaryButton>
        </Modal>
      )}
    </>
  );
}

function LivePasswordModal({ session, onClose, onChanged }) {
  const [f, setF] = useState({ oldPassword: "", newPassword: "", repeat: "" });
  const [err, setErr] = useState("");
  const save = async () => {
    if (f.newPassword !== f.repeat) { setErr("Пароли не совпадают"); return; }
    try {
      const r = await stApi("/api/auth/password", { method: "POST", token: session.token, body: { oldPassword: f.oldPassword, newPassword: f.newPassword } });
      onChanged(r.token);
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="Смена пароля" onClose={onClose}>
      <Field label="Текущий пароль" type="password" value={f.oldPassword} onChange={(e) => setF({ ...f, oldPassword: e.target.value })} />
      <Field label="Новый пароль" type="password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
      <Field label="Повторите новый пароль" type="password" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} />
      {err && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 10 }}>{err}</p>}
      <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>После смены пароля вход на других устройствах завершится.</p>
      <PrimaryButton full disabled={!f.oldPassword || !f.newPassword} onClick={save}>Сохранить</PrimaryButton>
    </Modal>
  );
}
