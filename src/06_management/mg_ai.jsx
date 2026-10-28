// Sapar Trade — система управления. Модуль: AI-помощник (без нейросети) — ответы по реальным данным 1С
// Собирает сводку из тех же отчётов сервера, поэтому видит только то, что разрешено роли. Нейросеть — отдельный этап.

const MG_AI_QUESTIONS = [
  ["sales", "Как идут продажи?"], ["plan", "Что с планом?"], ["debts", "Кто должен больше всех?"],
  ["products", "Что лучше продаётся?"], ["stock", "Что лежит без движения?"], ["problems", "Что требует внимания?"],
];

async function mgAiAnswer(id, session, range) {
  const get = (path) => stApi(path, { token: session.token });
  const can = (...p) => liveCan(session, ...p);
  const dlt = (a, b) => (b ? (a >= b ? "▲ +" : "▼ ") + fp(((a - b) / Math.abs(b)) * 100) + " к прошлому периоду" : "сравнить не с чем");
  if (id === "sales") {
    if (!can("sales", "sales.own")) return ["Продажи для вашей роли недоступны."];
    const d = await get("/api/dashboard?" + stQs(range));
    const s = d.sales, p = d.prev;
    const out = [`Выручка ${stFmtDate(range.from)} — ${stFmtDate(range.to)}: ${stMoney(s.revenue)} (${dlt(s.revenue, p.revenue)}).`,
      `Покупали ${s.clients} клиентов, в среднем ${stMoney(s.avgPerDay)} в день.`];
    if (s.marginPct !== undefined && s.marginPct !== null) out.push(`Маржа ${fp(s.marginPct)}${p.marginPct !== undefined && p.marginPct !== null ? " (было " + fp(p.marginPct) + ")" : ""}.`);
    if (s.gross !== undefined) out.push(`Валовая прибыль ${stMoney(s.gross)}.`);
    if (d.topProducts && d.topProducts[0]) out.push(`Лидер по выручке: ${d.topProducts[0].name} — ${stMoney(d.topProducts[0].revenue)}.`);
    return out;
  }
  if (id === "plan") {
    if (!can("team", "team.own")) return ["План доступен владельцу, директору, супервайзеру и ТП."];
    const t = await get("/api/team?" + stQs(range));
    if (t.totals.plan === null) return ["План на этот период не введён. Владелец или директор может ввести его в разделе «Команда» → «План продаж на месяц»."];
    const out = [`Выполнение плана: ${fp(t.totals.planPct || 0)} (${stMoney(t.totals.revenue)} из ${stMoney(t.totals.plan)}).`];
    const withPlan = t.items.filter((x) => x.plan);
    if (withPlan.length > 1) {
      const best = withPlan.reduce((a, b) => ((a.planPct || 0) >= (b.planPct || 0) ? a : b));
      const worst = withPlan.reduce((a, b) => ((a.planPct || 0) <= (b.planPct || 0) ? a : b));
      out.push(`Лучше всех: ${best.manager} — ${fp(best.planPct || 0)}. Больше всех отстаёт: ${worst.manager} — ${fp(worst.planPct || 0)}.`);
    }
    return out;
  }
  if (id === "debts") {
    if (!can("debts", "debts.own")) return ["Дебиторка для вашей роли недоступна."];
    const c = await get("/api/clients?" + stQs({ ...range, debtors: true, limit: 5 }));
    if (!c.items.length) return ["Должников нет."];
    return [`Общий долг: ${stMoney(c.summary.debt)}, просрочено: ${stMoney(c.summary.overdue)}.`,
      ...c.items.map((x, i) => `${i + 1}. ${x.name} — ${stMoney(x.debt)}${x.overdue ? ", просрочено " + stMoney(x.overdue) : ""}${x.manager ? " (ТП " + x.manager + ")" : ""}`)];
  }
  if (id === "products") {
    if (!can("sales", "sales.own")) return ["Продажи для вашей роли недоступны."];
    const s = await get("/api/sales?" + stQs({ ...range, group: "product", limit: 5 }));
    if (!s.items.length) return ["Продаж за период нет."];
    return s.items.map((x, i) => `${i + 1}. ${x.name} — ${stMoney(x.revenue)}, ${stNum(x.qty)} шт${x.marginPct !== undefined && x.marginPct !== null ? ", маржа " + fp(x.marginPct) : ""}`);
  }
  if (id === "stock") {
    if (!can("stock")) return ["Склад для вашей роли недоступен."];
    const s = await get("/api/stock?dead=60&limit=5");
    const d60 = s.summary.dead.find((x) => x.days === 60);
    if (!s.items.length) return ["Товаров без продаж 60+ дней нет."];
    return [`Неликвид 60+ дней: ${stMoney(d60.value)} по цене продажи.`, ...s.items.map((x, i) => `${i + 1}. ${x.name} — ${stNum(x.qty)} ${x.unit || ""}, ${stMoney(x.value)}`)];
  }
  const p = await get("/api/problems");
  return p.items.map((x) => `${x.lvl === "red" ? "🔴" : x.lvl === "yellow" ? "🟡" : "🟢"} ${x.title}${x.detail ? " — " + x.detail : ""}`);
}

function MgAI({ session, range }) {
  const [chat, setChat] = useState([{ who: "ai", lines: ["Здравствуйте! Я отвечаю по данным из 1С за выбранный период. Выберите вопрос."] }]);
  const [busy, setBusy] = useState(false);
  const ask = async (id, text) => {
    setBusy(true);
    setChat((c) => [...c, { who: "me", lines: [text] }]);
    try { const lines = await mgAiAnswer(id, session, range); setChat((c) => [...c, { who: "ai", lines }]); }
    catch (e) { setChat((c) => [...c, { who: "ai", lines: ["Не получилось: " + e.message] }]); }
    setBusy(false);
  };
  return (
    <>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {MG_AI_QUESTIONS.map(([id, t]) => <LiveChip key={id} onClick={() => !busy && ask(id, t)}>{t}</LiveChip>)}
      </div>
      {chat.map((m, i) => (
        <div key={i} className={"flex mb-2 " + (m.who === "me" ? "justify-end" : "")}>
          <div className="rounded-2xl px-3.5 py-2.5" style={{ maxWidth: "88%", background: m.who === "me" ? "var(--navy)" : "#fff", color: m.who === "me" ? "#fff" : "var(--ink)", border: m.who === "me" ? "none" : "1px solid var(--line)" }}>
            {m.lines.map((l, j) => <p key={j} style={{ fontSize: 12.5, lineHeight: 1.5 }}>{l}</p>)}
          </div>
        </div>
      ))}
      {busy && <p style={{ fontSize: 12, color: "var(--muted)" }}>Считаю…</p>}
      <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 10 }}>Помощник пока работает по правилам. Свободные вопросы нейросети — следующий этап.</p>
    </>
  );
}
