// Sapar Trade — модуль: выбор раздела для сотрудников (стартовый экран); вход — личный логин и пароль
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
            <p style={{ fontSize: 11.5, color: "var(--muted)" }}>Смена, заказы, склад, отчёт директору</p>
          </div>
          <Ico name="arrow-left" size={16} color="var(--muted)" style={{ transform: "rotate(180deg)" }} />
        </button>
        <button onClick={() => onPick("tp")} className="rounded-2xl p-4 flex items-center gap-3 press-98" style={{ border: "1.5px solid var(--line)", background: "#fff" }}>
          <div className="rounded-xl p-2.5" style={{ background: "#FFF6DE" }}><Ico name="users" size={18} color="#8A5A00" /></div>
          <div className="flex-1 text-left">
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Торговый представитель</p>
            <p style={{ fontSize: 11.5, color: "var(--muted)" }}>Мои магазины и заказы · данные 1С</p>
          </div>
          <Ico name="arrow-left" size={16} color="var(--muted)" style={{ transform: "rotate(180deg)" }} />
        </button>
        <button onClick={() => onPick("mgmt")} className="rounded-2xl p-4 mt-3 flex items-center gap-3 press-98" style={{ border: "1.5px solid var(--navy)", background: "#EEF0FF" }}>
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
