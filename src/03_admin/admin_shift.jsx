// Sapar Trade — прототип. Модуль: Админ: экран «Смена» (начать/завершить работу, отчёт директору)
// Строки 1533–1773 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== ADMIN: SECTIONS ============================== */

/* ---------- ADMIN: work shift (start / finish + auto report to director) ---------- */
function AdminShift({ shift, setShift, shiftHistory, setShiftHistory, orders, warehouse, directorPhone, addAudit, showToast }) {
  const ADMIN_NAME = "Гульмира";
  const [now, setNow] = useState(new Date());
  const [confirmOpen, setConfirmOpen] = useState(false);   // preview before closing
  const [doneReport, setDoneReport] = useState(null);      // report of the just-closed shift

  // live clock while the shift is running
  useEffect(() => {
    if (!shift) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [shift]);

  const liveReport = shift
    ? buildShiftReport(orders, warehouse, new Date(shift.startedAt), now, ADMIN_NAME)
    : null;

  const start = () => {
    const d = new Date();
    setShift({ startedAt: d, admin: ADMIN_NAME });
    addAudit("Админ (" + ADMIN_NAME + ")", "Начало смены", "Смена " + dmy(d), "открыта в " + hm(d));
    showToast("Смена открыта ✓");
  };

  const finish = () => {
    const to = new Date();
    const r = buildShiftReport(orders, warehouse, new Date(shift.startedAt), to, shift.admin || ADMIN_NAME);
    const text = reportToText(r);
    // send first (still inside the user's tap → no popup blocking), then close
    sendToWhatsApp(directorPhone, text);
    setShiftHistory([{ ...r, text }, ...shiftHistory].slice(0, 30));
    setShift(null);
    setConfirmOpen(false);
    setDoneReport({ ...r, text });
    addAudit("Админ (" + r.adminName + ")", "Завершение смены", "Смена " + dmy(r.from),
      "касса " + money(r.till) + " · отчёт отправлен директору " + directorPhone);
    showToast("Смена закрыта · отчёт отправлен ✓");
  };

  const copyReport = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast("Отчёт скопирован ✓"), () => showToast("Не удалось скопировать"));
    } else showToast("Не удалось скопировать");
  };

  const last = shiftHistory[0];

  const Row = ({ label, value, strong, color }) => (
    <div className="flex justify-between py-1.5" style={{ borderBottom: "1px dashed var(--line)" }}>
      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{label}</span>
      <span className="font-mono-kz" style={{ fontSize: 13, fontWeight: strong ? 800 : 700, color: color || "var(--ink)" }}>{value}</span>
    </div>
  );

  const ReportBody = ({ r }) => (
    <div>
      <div className="rounded-xl p-3 mb-3" style={{ background: "#F6F5FA" }}>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>{dmy(r.from)} · {hm(r.from)} — {hm(r.to)} · {r.duration}</p>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>Администратор: {r.adminName}</p>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Заказы</p>
      <Row label="Всего заказов" value={r.countAll} strong />
      <Row label="Магазины" value={r.countShops} />
      <Row label="Частные лица" value={r.countIndividuals} />
      <Row label="От представителей" value={r.countAgents} />
      <Row label="Выдано / доставлено" value={r.delivered} />
      <Row label="В работе" value={r.inWork} />
      <Row label="Отменено" value={r.countCancelled} color="var(--red)" />
      <p style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, margin: "12px 0 4px" }}>Продажи</p>
      <Row label="Сумма продаж" value={money(r.revenue)} strong />
      <Row label="Средний чек" value={money(r.avgCheck)} />
      <p style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, margin: "12px 0 4px" }}>Касса</p>
      <Row label="Наличные" value={money(r.cash)} />
      <Row label="Картой" value={money(r.card)} />
      <Row label="Перевод" value={money(r.transfer)} />
      <div className="flex justify-between items-center rounded-xl px-3 py-2.5 mt-2" style={{ background: "#E4F7E9" }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#127A33" }}>ИТОГО В КАССУ</span>
        <span className="font-mono-kz" style={{ fontSize: 16, fontWeight: 800, color: "#127A33" }}>{money(r.till)}</span>
      </div>
      <div className="flex justify-between items-center rounded-xl px-3 py-2 mt-1.5" style={{ background: "#FFF6DE" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#8A5A00" }}>Отпущено в долг</span>
        <span className="font-mono-kz" style={{ fontSize: 13.5, fontWeight: 800, color: "#8A5A00" }}>{money(r.debt)}</span>
      </div>
      {r.top.length > 0 && (
        <>
          <p style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, margin: "14px 0 4px" }}>Топ товаров</p>
          {r.top.map((t, i) => (
            <div key={i} className="flex justify-between py-1.5" style={{ borderBottom: "1px dashed var(--line)" }}>
              <span style={{ fontSize: 12.5 }}>{i + 1}. {t.n} × {t.qty}</span>
              <span className="font-mono-kz" style={{ fontSize: 12.5, fontWeight: 700 }}>{money(t.sum)}</span>
            </div>
          ))}
        </>
      )}
      {r.lowStock.length > 0 && (
        <>
          <p style={{ fontSize: 11.5, color: "var(--red)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, margin: "14px 0 4px" }}>Заканчивается на складе</p>
          {r.lowStock.map((p) => (
            <div key={p.id} className="flex justify-between py-1.5" style={{ borderBottom: "1px dashed var(--line)" }}>
              <span style={{ fontSize: 12.5 }}>{p.name}</span>
              <span className="font-mono-kz" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--red)" }}>{p.stock} {p.unit}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );

  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle sub="Открытие и закрытие рабочего дня">Смена</SectionTitle>

      {!shift ? (
        <>
          <div className="rounded-2xl p-5 mb-4 text-center" style={{ background: "#fff", border: "1px solid var(--line)" }}>
            <div className="mx-auto rounded-full flex items-center justify-center mb-3" style={{ width: 76, height: 76, background: "#EEF0FF" }}>
              <Ico name="power" size={34} color="var(--navy)" strokeWidth={2.2} />
            </div>
            <p className="font-display" style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>Смена закрыта</p>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
              Нажмите «Начать работу» — приложение начнёт считать заказы, продажи и кассу за сегодняшний день.
            </p>
            <button onClick={start} className="w-full rounded-2xl py-4" style={{ background: "var(--navy)", color: "#fff" }}>
              <span className="flex items-center justify-center gap-2" style={{ fontSize: 15, fontWeight: 800 }}>
                <Ico name="play" size={16} color="#fff" />Начать работу
              </span>
            </button>
          </div>

          {last && (
            <>
              <p className="font-body mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Последняя смена</p>
              <div className="rounded-2xl p-3.5 mb-3" style={{ background: "#fff", border: "1px solid var(--line)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{dmy(last.from)} · {hm(last.from)}—{hm(last.to)}</span>
                  <Badge bg="#E4F7E9" fg="#127A33">отчёт отправлен</Badge>
                </div>
                <Row label="Заказов" value={last.countAll} />
                <Row label="Продажи" value={money(last.revenue)} />
                <Row label="В кассу" value={money(last.till)} strong />
                <div className="flex gap-2 mt-3">
                  <GhostButton small onClick={() => setDoneReport(last)}>Открыть отчёт</GhostButton>
                  <GhostButton small onClick={() => sendToWhatsApp(directorPhone, last.text)}>Отправить ещё раз</GhostButton>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="rounded-2xl p-4 mb-3" style={{ background: "linear-gradient(160deg,#1B1464,#4B3FCB)", color: "#fff" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full" style={{ width: 9, height: 9, background: "#5BE38A", display: "inline-block" }} />
              <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>Смена идёт</span>
            </div>
            <p className="font-mono-kz" style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{liveReport.duration}</p>
            <p style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
              Начало: {hm(new Date(shift.startedAt))} · {dmy(new Date(shift.startedAt))} · {shift.admin}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { l: "Заказов", v: liveReport.countAll, ic: "clipboard" },
              { l: "Продажи", v: money(liveReport.revenue), ic: "trending-up" },
              { l: "В кассу", v: money(liveReport.till), ic: "wallet" },
            ].map((c, i) => (
              <div key={i} className="rounded-2xl p-3" style={{ background: "#fff", border: "1px solid var(--line)" }}>
                <Ico name={c.ic} size={15} color="var(--navy)" />
                <p className="font-mono-kz" style={{ fontSize: 13.5, fontWeight: 800, marginTop: 6, wordBreak: "break-word" }}>{c.v}</p>
                <p style={{ fontSize: 10.5, color: "var(--muted)" }}>{c.l}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl p-3.5 mb-3" style={{ background: "#fff", border: "1px solid var(--line)" }}>
            <p style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Касса на текущий момент</p>
            <Row label="Наличные" value={money(liveReport.cash)} />
            <Row label="Картой" value={money(liveReport.card)} />
            <Row label="Перевод" value={money(liveReport.transfer)} />
            <Row label="В долг" value={money(liveReport.debt)} color="#8A5A00" />
          </div>

          <div className="rounded-2xl p-3.5 mb-3 flex items-center gap-2.5" style={{ background: "#E7FBEF", border: "1px solid #BFEBD0" }}>
            <Ico name="message-circle" size={18} color="#127A33" />
            <div className="flex-1">
              <p style={{ fontSize: 12, fontWeight: 700, color: "#0E5F28" }}>Отчёт уйдёт директору в WhatsApp</p>
              <p className="font-mono-kz" style={{ fontSize: 12, color: "#127A33" }}>{directorPhone}</p>
            </div>
          </div>

          <button onClick={() => setConfirmOpen(true)} className="w-full rounded-2xl py-4" style={{ background: "var(--red)", color: "#fff" }}>
            <span className="flex items-center justify-center gap-2" style={{ fontSize: 15, fontWeight: 800 }}>
              <Ico name="power" size={16} color="#fff" />Завершить работу
            </span>
          </button>
          <p className="text-center" style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
            Полный отчёт за день сформируется автоматически и откроется в WhatsApp директора.
          </p>
        </>
      )}

      {confirmOpen && liveReport && (
        <Modal title="Отчёт за смену" onClose={() => setConfirmOpen(false)} wide>
          <BarcodeStrip />
          <div className="py-2"><ReportBody r={liveReport} /></div>
          <div className="rounded-xl p-3 my-3" style={{ background: "#EEF0FF" }}>
            <p style={{ fontSize: 12, color: "var(--navy)", fontWeight: 700 }}>Получатель отчёта</p>
            <p className="font-mono-kz" style={{ fontSize: 13.5, fontWeight: 800, color: "var(--navy)" }}>Директор · {directorPhone}</p>
          </div>
          <PrimaryButton full onClick={finish}>
            <span className="flex items-center justify-center gap-2"><Ico name="send" size={15} />Завершить и отправить директору</span>
          </PrimaryButton>
          <div className="mt-2"><GhostButton full onClick={() => setConfirmOpen(false)}>Отмена</GhostButton></div>
        </Modal>
      )}

      {doneReport && (
        <Modal title="Смена закрыта" onClose={() => setDoneReport(null)} wide>
          <div className="flex items-center gap-2 rounded-xl p-3 mb-3" style={{ background: "#E4F7E9" }}>
            <Ico name="check-circle" size={20} color="#127A33" />
            <p style={{ fontSize: 12.5, fontWeight: 700, color: "#0E5F28" }}>Отчёт открыт в WhatsApp — осталось нажать «Отправить»</p>
          </div>
          <ReportBody r={doneReport} />
          <div className="mt-4 flex flex-col gap-2">
            <PrimaryButton full onClick={() => sendToWhatsApp(directorPhone, doneReport.text)}>
              <span className="flex items-center justify-center gap-2"><Ico name="message-circle" size={15} />Открыть WhatsApp директора</span>
            </PrimaryButton>
            <GhostButton full onClick={() => copyReport(doneReport.text)}>
              <span className="flex items-center justify-center gap-2"><Ico name="copy" size={14} />Скопировать текст отчёта</span>
            </GhostButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

