// Sapar Trade — прототип. Модуль: Вход в систему управления (пароль + 2FA демо)
// Строки 3435–3491 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

function MgmtLogin({ onCancel, onSuccess, addAudit, lang, setLang }) {
  const [role, setRole] = useState(null);
  const [pwd, setPwd] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1);
  const [err, setErr] = useState("");
  const R = role && MG_ROLES[role];
  const submit = () => {
    setErr("");
    if (step === 1) {
      if (pwd !== "1234") { setErr("Неверный пароль"); addAudit("Система", "Неудачный вход", R.label, "неверный пароль"); return; }
      if (R.twofa) { setStep(2); return; }
    } else if (code !== "2026") { setErr("Неверный код подтверждения"); return; }
    addAudit(R.person, "Вход в систему управления", R.label, R.twofa ? "пароль + 2FA" : "пароль");
    onSuccess(role);
  };
  return (
    <div className="relative h-full" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="flex flex-col h-full px-6 pt-4 font-body overflow-y-auto pb-8 kz-narrow">
        <div className="flex items-center justify-between mb-4">
          <button onClick={role ? () => { setRole(null); setStep(1); setPwd(""); setCode(""); setErr(""); } : onCancel} className="p-2 -ml-2 rounded-full"><Ico name="arrow-left" size={20} color="var(--ink)" /></button>
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
        <div className="flex flex-col items-center mb-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--navy)" }}><Ico name="bar-chart" size={28} color="#fff" /></div>
          <h1 className="font-display text-center" style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>Система управления</h1>
          <p className="text-center" style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{R ? R.label : "Выберите свою должность"}</p>
        </div>
        {!R && Object.entries(MG_ROLES).map(([id, r]) => (
          <button key={id} onClick={() => setRole(id)} className="rounded-2xl p-3.5 mb-2.5 flex items-center gap-3 press-98" style={{ border: "1.5px solid var(--line)", background: "#fff" }}>
            <div className="rounded-xl p-2.5" style={{ background: "#EEF0FF" }}><Ico name={r.icon} size={17} color="var(--navy)" /></div>
            <div className="flex-1 text-left">
              <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{r.label}</p>
              <p style={{ fontSize: 11, color: "var(--muted)" }}>{r.sub}</p>
            </div>
          </button>
        ))}
        {R && (
          <>
            {step === 1
              ? <Field label="Пароль" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
              : <Field label="Код подтверждения (2FA)" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />}
            {err && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 10 }}>{err}</p>}
            <PrimaryButton full onClick={submit}>{step === 1 ? "Войти" : "Подтвердить"}</PrimaryButton>
            <div className="rounded-xl p-3 mt-3" style={{ background: "#FFF6DE" }}>
              <p style={{ fontSize: 11.5, color: "#8A5A00", lineHeight: 1.45 }}>
                Демо-доступ: пароль 1234{R.twofa ? ", код 2FA 2026" : ""}. На рабочем сервере — личные пароли (хранятся в виде хэша), двухфакторная защита для владельца и директора, контроль сессий и устройств.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

