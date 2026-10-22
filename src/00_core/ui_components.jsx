// Sapar Trade — прототип. Модуль: Общие UI-компоненты: кнопки, поля, модалки, бейджи, тосты
// Строки 730–868 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== SMALL UI PARTS ============================== */

function StatusBar() {
  // Real full-screen app: the device's own status bar is used, so this is just
  // a safe-area spacer for notches/dynamic islands, not a fake mock status bar.
  return <div style={{ paddingTop: "env(safe-area-inset-top, 0px)" }} />;
}

function BarcodeStrip({ color = "var(--line)", height = 14 }) {
  return (
    <div
      style={{
        height,
        backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 2px, transparent 2px 5px, ${color} 5px 7px, transparent 7px 12px, ${color} 12px 13px, transparent 13px 19px)`,
        opacity: 0.6,
      }}
    />
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="absolute left-1/2 z-50 px-4 py-2.5 rounded-xl shadow-lg font-body"
      style={{ bottom: 92, transform: "translateX(-50%)", background: "var(--ink)", color: "#fff", fontSize: 13, whiteSpace: "nowrap", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>
      {toast}
    </div>
  );
}

function Badge({ children, bg, fg }) {
  return (
    <span className="font-body px-2 py-0.5 rounded-full inline-block" style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700 }}>
      {children}
    </span>
  );
}

/* ---------- Monthly cashback progress card (shown on Home and in Settings) ---------- */
function CashbackCard({ monthSpend, cashback, available, compact }) {
  const { threshold, reward } = cashback;
  const pct = Math.min(100, Math.round((monthSpend / threshold) * 100));
  const earned = monthSpend >= threshold;
  const left = Math.max(0, threshold - monthSpend);
  const now = new Date();

  return (
    <div className={compact ? "rounded-2xl p-4 mb-5" : "rounded-2xl p-4"} style={{ background: "linear-gradient(135deg,#0F5457,#1F7A7E)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-white" style={{ fontSize: 12.5, fontWeight: 700 }}>
          <Ico name="dollar" size={13} color="#fff" />Кэшбэк за месяц
        </span>
        <span className="font-mono-kz" style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
          до конца месяца {daysLeftInMonth(now)} дн.
        </span>
      </div>
      <div className="rounded-full overflow-hidden mb-2" style={{ height: 8, background: "rgba(255,255,255,0.25)" }}>
        <div style={{ width: pct + "%", height: "100%", background: "#FFC800", transition: "width .3s" }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono-kz text-white" style={{ fontSize: 12 }}>{money(monthSpend)} из {money(threshold)}</span>
        <span className="font-mono-kz text-white" style={{ fontSize: 12, fontWeight: 700 }}>{pct}%</span>
      </div>
      <p className="text-white" style={{ fontSize: 12, marginTop: 8, opacity: 0.95, lineHeight: 1.4 }}>
        {available
          ? <>Поздравляем! Вам доступен кэшбэк <b>{money(reward)}</b> — спишите его при оформлении заказа в корзине.</>
          : earned
          ? <>Кэшбэк <b>{money(reward)}</b> за этот месяц уже использован. Новый порог откроется в следующем месяце.</>
          : <>Наберите покупок ещё на <b>{money(left)}</b> в этом месяце — и получите <b>{money(reward)}</b> кэшбэка на бесплатные покупки.</>}
      </p>
    </div>
  );
}

function PrimaryButton({ children, onClick, full, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={"font-body font-bold rounded-2xl press-98 transition " + (full ? "w-full " : "") + (small ? "px-3 py-2 text-xs" : "px-4 py-3.5 text-sm")}
      style={{ background: disabled ? "#C9C7D6" : "var(--navy)", color: "#fff", opacity: disabled ? 0.7 : 1 }}>
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, small, full }) {
  return (
    <button onClick={onClick}
      className={"font-body font-semibold rounded-2xl border press-98 transition " + (full ? "w-full " : "") + (small ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm")}
      style={{ borderColor: "var(--line)", color: "var(--navy)", background: "#fff" }}>
      {children}
    </button>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="block mb-3">
      <span className="font-body block mb-1.5" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{label}</span>
      <input {...props}
        className="font-body w-full px-3.5 py-3 rounded-xl outline-none"
        style={{ background: "#fff", border: "1.5px solid var(--line)", fontSize: 14, color: "var(--ink)" }} />
    </label>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} className="relative rounded-full transition shrink-0"
      style={{ width: 44, height: 26, background: checked ? "var(--red)" : "#D9D7E6" }}>
      <span className="absolute rounded-full bg-white shadow transition" style={{ width: 20, height: 20, top: 3, left: checked ? 21 : 3 }} />
    </button>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="absolute inset-0 z-40 flex items-end" style={{ background: "rgba(22,19,39,0.45)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full bg-white rounded-t-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: wide ? "92%" : "80%" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--line)" }}>
          <h3 className="font-display" style={{ fontSize: 16, color: "var(--ink)", fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ background: "#F2F1F8" }}><Ico name="x" size={16} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div className="mb-3">
      <h2 className="font-display" style={{ fontSize: 19, fontWeight: 800, color: "var(--ink)" }}>{children}</h2>
      {sub && <p className="font-body" style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

