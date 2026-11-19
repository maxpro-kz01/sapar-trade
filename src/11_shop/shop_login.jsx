// Sapar Trade — «Магазин». Модуль: отдельное окно входа и регистрации магазина.
// Номер уже есть у нас или в 1С → вход сразу, без кода. Номера нет → короткая регистрация, и можно заказывать.

function ShopLogin({ onBack, onDone }) {
  const [step, setStep] = useState("phone"); // phone | choose | register
  const [digits, setDigits] = useState("");
  const [choices, setChoices] = useState([]);
  const [form, setForm] = useState({ name: "", contactName: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const phone = "+7" + digits;
  const phoneOk = digits.length === 10;

  const finish = (r) => onDone({ token: r.token, refreshToken: r.refreshToken, shop: r.shop });
  const login = async (shopId) => {
    setBusy(true); setErr("");
    try {
      const r = await stFetch("/api/shop/login", { method: "POST", body: { phone, shopId } });
      if (r.choose) { setChoices(r.choose); setStep("choose"); } else finish(r);
    } catch (e) {
      if (e.status === 404) setStep("register"); // такого номера нет — предлагаем зарегистрироваться
      else setErr(e.message);
    } finally { setBusy(false); }
  };
  const register = async () => {
    setBusy(true); setErr("");
    try { finish(await stFetch("/api/shop/register", { method: "POST", body: { phone, ...form } })); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const back = () => (step === "phone" ? onBack() : (setErr(""), setStep("phone")));

  return (
    <div className="relative h-full" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="flex flex-col h-full px-6 pt-4 pb-6 font-body kz-narrow overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <button onClick={back} className="p-2 -ml-2 rounded-full" aria-label="Назад"><Ico name="arrow-left" size={20} color="var(--ink)" /></button>
          <LangSwitch />
        </div>
        <h1 className="font-display" style={{ fontSize: 21, fontWeight: 800, color: "var(--ink)" }}>
          {step === "register" ? "Регистрация магазина" : step === "choose" ? "Какой магазин?" : "Вход для магазинов"}
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 18px" }}>
          {step === "register" ? "Такого номера у нас нет. Заполните данные — и сразу можно заказывать." : step === "choose" ? "На этом номере несколько магазинов." : "Введите номер телефона магазина — без пароля и кода."}
        </p>

        {step === "phone" && (
          <>
            <PhoneField value={digits} onChange={setDigits} />
            {err && <p style={{ fontSize: 12.5, color: "#B3261E", marginBottom: 10 }}>{err}</p>}
            <PrimaryButton full disabled={!phoneOk || busy} onClick={() => login()}>{busy ? "Входим…" : "Войти"}</PrimaryButton>
            <p className="text-center" style={{ fontSize: 12, color: "var(--muted)", marginTop: 14 }}>Нет номера в базе? Нажмите «Войти» — предложим регистрацию.</p>
          </>
        )}

        {step === "choose" && choices.map((c) => (
          <button key={c.id} onClick={() => login(c.id)} disabled={busy} className="rounded-2xl p-4 mb-3 text-left press-98" style={{ border: "1.5px solid var(--line)", background: "#fff" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{c.name}</p>
            {c.address && <p style={{ fontSize: 11.5, color: "var(--muted)" }}>{c.address}</p>}
          </button>
        ))}

        {step === "register" && (
          <>
            <div className="rounded-xl px-3.5 py-3 mb-3" style={{ background: "#fff", border: "1.5px solid var(--line)" }}>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Телефон</span>
              <p className="font-mono-kz" style={{ fontSize: 14, fontWeight: 700 }}>{phone.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, "+7 $1 $2 $3 $4")}</p>
            </div>
            <Field label="Название магазина" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например, Мини-маркет «Заря»" />
            <Field label="Адрес" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Город, улица, дом" />
            <Field label="Контактное лицо (необязательно)" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Как к вам обращаться" />
            {err && <p style={{ fontSize: 12.5, color: "#B3261E", marginBottom: 10 }}>{err}</p>}
            <PrimaryButton full disabled={busy || form.name.trim().length < 2 || form.address.trim().length < 3} onClick={register}>{busy ? "Регистрируем…" : "Зарегистрироваться и войти"}</PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}
