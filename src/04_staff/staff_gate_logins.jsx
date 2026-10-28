// Sapar Trade — прототип. Модуль: Скрытый вход сотрудников (двойной тап по логотипу), логины
// Строки 2396–2517 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== STAFF: ROLE GATE + HIDDEN LOGINS ============================== */

function StaffGate({ onCancel, onPick }) {
  return (
    <div className="relative h-full" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="flex flex-col h-full px-6 pt-4 font-body kz-narrow">
        <div className="flex items-center justify-between mb-6">
          {onCancel ? <button onClick={onCancel} className="p-2 -ml-2 rounded-full"><Ico name="arrow-left" size={20} color="var(--ink)" /></button> : <span />}
          <LangSwitch />
        </div>
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--navy)" }}>
            <Ico name="shield-check" size={28} color="#fff" />
          </div>
          <h1 className="font-display text-center" style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)" }}>Вход для сотрудников</h1>
          <p className="text-center" style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>Выберите роль для входа</p>
        </div>
        <button onClick={() => onPick("admin")} className="rounded-2xl p-4 mb-3 flex items-center gap-3 press-98" style={{ border: "1.5px solid var(--line)", background: "#fff" }}>
          <div className="rounded-xl p-2.5" style={{ background: "#EEF0FF" }}><Ico name="shield-check" size={18} color="var(--navy)" /></div>
          <div className="flex-1 text-left">
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Администратор</p>
            <p style={{ fontSize: 11.5, color: "var(--muted)" }}>Заказы, склад, реклама, отчёты</p>
          </div>
          <Ico name="arrow-left" size={16} color="var(--muted)" style={{ transform: "rotate(180deg)" }} />
        </button>
        <button onClick={() => onPick("agent")} className="rounded-2xl p-4 flex items-center gap-3 press-98" style={{ border: "1.5px solid var(--line)", background: "#fff" }}>
          <div className="rounded-xl p-2.5" style={{ background: "#FFF6DE" }}><Ico name="users" size={18} color="#8A5A00" /></div>
          <div className="flex-1 text-left">
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Торговый представитель</p>
            <p style={{ fontSize: 11.5, color: "var(--muted)" }}>Приём заказов по магазинам</p>
          </div>
          <Ico name="arrow-left" size={16} color="var(--muted)" style={{ transform: "rotate(180deg)" }} />
        </button>
        <button onClick={() => onPick("live")} className="rounded-2xl p-4 mt-3 flex items-center gap-3 press-98" style={{ border: "1.5px solid var(--navy)", background: "#EEF0FF" }}>
          <div className="rounded-xl p-2.5" style={{ background: "var(--navy)" }}><Ico name="bar-chart" size={18} color="#fff" /></div>
          <div className="flex-1 text-left">
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Система управления</p>
            <p style={{ fontSize: 11.5, color: "var(--muted)" }}>Данные из 1С · личный логин и пароль</p>
          </div>
          <Ico name="arrow-left" size={16} color="var(--navy)" style={{ transform: "rotate(180deg)" }} />
        </button>
      </div>
    </div>
  );
}

function AdminLogin({ onCancel, onSuccess }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (login === "admin" && password === "admin") { setError(""); onSuccess(); }
    else setError("Неверный логин или пароль");
  };

  return (
    <div className="relative h-full" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="flex flex-col h-full px-6 pt-4 font-body kz-narrow">
        <button onClick={onCancel} className="mb-6 p-2 -ml-2 rounded-full w-fit"><Ico name="arrow-left" size={20} color="var(--ink)" /></button>
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--navy)" }}>
            <Ico name="shield-check" size={28} color="#fff" />
          </div>
          <h1 className="font-display text-center" style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)" }}>Вход для администратора</h1>
          <p className="text-center" style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>Доступ только для сотрудников компании</p>
        </div>
        <Field label="Логин" placeholder="admin" value={login} autoCapitalize="none" autoCorrect="off" spellCheck="false"
          onChange={(e) => { setLogin(e.target.value); setError(""); }} />
        <Field label="Пароль" placeholder="••••••" type="password" value={password}
          onChange={(e) => { setPassword(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        {error && <p style={{ fontSize: 12, color: "var(--red)", fontWeight: 600, marginTop: -8, marginBottom: 12 }}>{error}</p>}
        <div className="mt-auto pb-8">
          <PrimaryButton full disabled={!login || !password} onClick={submit}>Войти</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function AgentLogin({ agents, onCancel, onSuccess }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const found = agents.find((a) => a.login === login && a.password === password);
    if (!found) { setError("Неверный логин или пароль"); return; }
    if (!found.active) { setError("Доступ заблокирован администратором"); return; }
    setError("");
    onSuccess(found);
  };

  return (
    <div className="relative h-full" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="flex flex-col h-full px-6 pt-4 font-body kz-narrow">
        <button onClick={onCancel} className="mb-6 p-2 -ml-2 rounded-full w-fit"><Ico name="arrow-left" size={20} color="var(--ink)" /></button>
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ background: "#8A5A00" }}>
            <Ico name="users" size={28} color="#fff" />
          </div>
          <h1 className="font-display text-center" style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)" }}>Вход для торгового представителя</h1>
          <p className="text-center" style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>Логин и пароль выдаёт администратор</p>
        </div>
        <Field label="Логин" placeholder="Логин" value={login} autoCapitalize="none" autoCorrect="off" spellCheck="false"
          onChange={(e) => { setLogin(e.target.value); setError(""); }} />
        <Field label="Пароль" placeholder="••••••" type="password" value={password}
          onChange={(e) => { setPassword(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        {error && <p style={{ fontSize: 12, color: "var(--red)", fontWeight: 600, marginTop: -8, marginBottom: 12 }}>{error}</p>}
        <div className="mt-auto pb-8">
          <PrimaryButton full disabled={!login || !password} onClick={submit}>Войти</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

