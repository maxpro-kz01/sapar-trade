// Sapar Trade — прототип. Модуль: Клиент: вход по телефону, OTP, профиль
// Строки 869–953 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== CLIENT: REGISTRATION ============================== */

function PhoneField({ value, onChange }) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 10);
  const parts = digits.match(/^(\d{0,3})(\d{0,3})(\d{0,2})(\d{0,2})$/) || [];
  const display = [parts[1], parts[2], parts[3], parts[4]].filter(Boolean).join(" ");
  return (
    <label className="block mb-3">
      <span className="font-body block mb-1.5" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Номер телефона</span>
      <div className="flex items-center rounded-xl px-3.5" style={{ background: "#fff", border: "1.5px solid var(--line)" }}>
        <span className="font-mono-kz" style={{ fontSize: 14, color: "var(--ink)", fontWeight: 700 }}>+7</span>
        <span style={{ width: 1, height: 20, background: "var(--line)", margin: "0 8px" }} />
        <input
          value={display}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          onKeyDown={(e) => { if (e.key === "Backspace" && display === "") e.preventDefault(); }}
          placeholder="7XX XXX XX XX"
          inputMode="numeric"
          autoFocus
          className="font-body flex-1 py-3 outline-none"
          style={{ fontSize: 14, color: "var(--ink)" }}
        />
      </div>
    </label>
  );
}

function RegPhone({ phone, setPhone, onNext, onToast, onAdminTrigger }) {
  const logoTap = useDoubleTap(onAdminTrigger);
  return (
    <div className="flex flex-col h-full px-6 pt-4 font-body">
      <div className="flex justify-end mb-2"><LangSwitch /></div>
      <div className="flex flex-col items-center mb-8">
        <button onClick={logoTap} className="p-1 rounded-2xl">
          <Logo full size={210} />
        </button>
      </div>
      <SectionTitle sub="Код подтверждения придёт сообщением в WhatsApp">Вход по номеру телефона</SectionTitle>
      <PhoneField value={phone} onChange={setPhone} />
      <div className="flex items-center gap-2 mb-6 px-3.5 py-2.5 rounded-xl" style={{ background: "#E7F8EC" }}>
        <Ico name="message-circle" size={16} color="#1FA854" />
        <span style={{ fontSize: 12, color: "#127A33" }}>Код подтверждения отправим в WhatsApp</span>
      </div>
      <div className="mt-auto pb-8">
        <PrimaryButton full disabled={phone.length < 10} onClick={() => { onToast("Код отправлен в WhatsApp"); onNext(); }}>Получить код</PrimaryButton>
      </div>
    </div>
  );
}

function RegOtp({ otp, setOtp, onNext, onBack }) {
  return (
    <div className="flex flex-col h-full px-6 pt-8 font-body">
      <button onClick={onBack} className="mb-6 p-2 -ml-2 rounded-full w-fit"><Ico name="arrow-left" size={20} color="var(--ink)" /></button>
      <SectionTitle sub="Введите 4-значный код из WhatsApp">Подтверждение</SectionTitle>
      <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" maxLength={4}
        className="font-mono-kz w-full text-center py-4 rounded-xl mb-4 outline-none"
        style={{ fontSize: 28, letterSpacing: 10, border: "1.5px solid var(--line)", color: "var(--navy)" }} />
      <p style={{ fontSize: 12, color: "var(--muted)" }}>Не пришёл код? <span style={{ color: "var(--red)", fontWeight: 700 }}>Отправить снова (демо)</span></p>
      <div className="mt-auto pb-8">
        <PrimaryButton full disabled={otp.length < 4} onClick={onNext}>Подтвердить</PrimaryButton>
      </div>
    </div>
  );
}

function RegProfile({ profile, setProfile, onFinish }) {
  return (
    <div className="flex flex-col h-full px-6 pt-8 font-body">
      <SectionTitle sub="Это займёт 30 секунд">Расскажите о себе</SectionTitle>
      <Field label="Ваше имя" placeholder="Например, Азамат" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
      <div className="flex items-center justify-between px-3.5 py-3.5 rounded-xl mb-3" style={{ border: "1.5px solid var(--line)" }}>
        <span style={{ fontSize: 14, color: "var(--ink)", fontWeight: 600 }}>У меня есть магазин</span>
        <Toggle checked={profile.hasShop} onChange={(v) => setProfile({ ...profile, hasShop: v })} />
      </div>
      {profile.hasShop && (
        <Field label="Название магазина" placeholder="Например, Магазин Береке" value={profile.shopName} onChange={(e) => setProfile({ ...profile, shopName: e.target.value })} />
      )}
      <div className="mt-auto pb-8">
        <PrimaryButton full disabled={!profile.name} onClick={onFinish}>Продолжить</PrimaryButton>
      </div>
    </div>
  );
}

