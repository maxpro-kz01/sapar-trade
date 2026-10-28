// Sapar Trade — прототип. Модуль: Админ: учётки торговых представителей
// Строки 2240–2319 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ---------- ADMIN: sales-rep (agent) accounts ---------- */
function AdminAgents({ agents, setAgents, orders, addAudit }) {
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  const genLogin = () => "agent" + Math.floor(100 + Math.random() * 900);
  const genPassword = () => String(Math.floor(1000 + Math.random() * 9000));
  const openAdd = () => { setName(""); setLogin(genLogin()); setPassword(genPassword()); setAddOpen(true); };

  const save = () => {
    if (!name.trim() || !login.trim() || !password.trim()) return;
    const a = { id: "ag" + Date.now(), name: name.trim(), login: login.trim(), password: password.trim(), active: true };
    setAgents([...agents, a]);
    addAudit("Админ (Гульмира)", "Создан торговый представитель", a.name, `логин: ${a.login}`);
    setAddOpen(false);
  };

  const toggleActive = (id) => {
    const a = agents.find((x) => x.id === id);
    setAgents(agents.map((x) => x.id === id ? { ...x, active: !x.active } : x));
    addAudit("Админ (Гульмира)", a.active ? "Заблокирован сотрудник" : "Разблокирован сотрудник", a.name, "");
  };

  const removeAgent = (id) => {
    const a = agents.find((x) => x.id === id);
    setAgents(agents.filter((x) => x.id !== id));
    addAudit("Админ (Гульмира)", "Удалён торговый представитель", a.name, "");
  };

  const statsFor = (login) => {
    const mine = orders.filter((o) => o.type === "agent" && o.agentLogin === login);
    return { count: mine.length, sum: mine.reduce((s, o) => s + o.total, 0) };
  };

  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle sub="Торговые представители, принимающие заказы по магазинам">Сотрудники</SectionTitle>
      <button onClick={openAdd} className="w-full rounded-2xl p-4 mb-4 flex items-center justify-center gap-2" style={{ border: "1.5px dashed var(--line)", color: "var(--navy)" }}>
        <Ico name="plus-circle" size={18} /><span style={{ fontSize: 13.5, fontWeight: 700 }}>Добавить торгового представителя</span>
      </button>
      <div className="flex flex-col gap-2.5 kz-list">
        {agents.map((a) => {
          const st = statsFor(a.login);
          return (
            <div key={a.id} className="rounded-2xl p-3.5" style={{ background: "#fff", border: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <p style={{ fontSize: 14, color: "var(--ink)", fontWeight: 700 }}>{a.name}</p>
                <Toggle checked={a.active} onChange={() => toggleActive(a.id)} />
              </div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="font-mono-kz" style={{ fontSize: 11.5, color: "var(--muted)" }}>Логин: {a.login}</span>
                <span className="font-mono-kz" style={{ fontSize: 11.5, color: "var(--muted)" }}>Пароль: {a.password}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{st.count} заказ(ов) · {money(st.sum)}</span>
                <button onClick={() => removeAgent(a.id)} className="flex items-center gap-1" style={{ fontSize: 11.5, color: "var(--red)", fontWeight: 700 }}>
                  <Ico name="trash" size={12} />Удалить
                </button>
              </div>
            </div>
          );
        })}
        {agents.length === 0 && <p className="text-center py-10" style={{ fontSize: 13, color: "var(--muted)" }}>Сотрудников пока нет</p>}
      </div>

      {addOpen && (
        <Modal title="Новый торговый представитель" onClose={() => setAddOpen(false)}>
          <Field label="ФИО" placeholder="Например, Азамат Турсунов" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Field label="Логин" value={login} onChange={(e) => setLogin(e.target.value)} />
          <Field label="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.4 }}>Логин и пароль сгенерированы автоматически — при необходимости измените и передайте сотруднику.</p>
          <PrimaryButton full disabled={!name.trim() || !login.trim() || !password.trim()} onClick={save}>Создать</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

