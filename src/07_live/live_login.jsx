// Sapar Trade — система управления. Модуль: вход сотрудника по личному логину и паролю (проверка на сервере)
// Пароли хранятся на сервере в виде хэша; 5 ошибок подряд — блокировка на 15 минут.

function LiveLogin({ onCancel, onSuccess, notice }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [err, setErr] = useState(notice || "");
  const submit = async () => {
    if (!login || !password || busy) return;
    setBusy(true); setErr(""); setSlow(false);
    const t = setTimeout(() => setSlow(true), 4000);
    try {
      const r = await stApi("/api/auth/login", { method: "POST", body: { login: login.trim(), password } });
      onSuccess({ token: r.token, user: r.user, perms: r.perms });
    } catch (e) {
      setErr(e.message);
    } finally {
      clearTimeout(t); setBusy(false); setSlow(false);
    }
  };
  return (
    <div className="relative h-full" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="flex flex-col h-full px-6 pt-4 font-body overflow-y-auto pb-8 kz-narrow">
        <button onClick={onCancel} className="mb-6 p-2 -ml-2 rounded-full w-fit"><Ico name="arrow-left" size={20} color="var(--ink)" /></button>
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--navy)" }}><Ico name="bar-chart" size={28} color="#fff" /></div>
          <h1 className="font-display text-center" style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>Система управления</h1>
          <p className="text-center" style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>Данные из 1С · личный логин и пароль</p>
        </div>
        <Field label="Логин" value={login} autoCapitalize="none" autoCorrect="off" spellCheck="false" autoComplete="username"
          onChange={(e) => { setLogin(e.target.value); setErr(""); }} />
        <Field label="Пароль" type="password" value={password} autoComplete="current-password"
          onChange={(e) => { setPassword(e.target.value); setErr(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        {err && <p style={{ fontSize: 12, color: "var(--red)", fontWeight: 600, marginBottom: 12 }}>{err}</p>}
        {slow && <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Сервер просыпается после простоя — это может занять до минуты…</p>}
        <PrimaryButton full disabled={!login || !password || busy} onClick={submit}>{busy ? "Вход…" : "Войти"}</PrimaryButton>
        <p className="text-center mt-4" style={{ fontSize: 11, color: "var(--muted)" }}>Логин и пароль выдаёт владелец. Забыли пароль — обратитесь к нему.</p>
      </div>
    </div>
  );
}
