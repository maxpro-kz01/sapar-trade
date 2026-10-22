// Sapar Trade — прототип. Модуль: Задачи, AI-ассистент (правила), интеграции/синхронизация, аудит, безопасность
// Строки 4093–4352 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

const TASK_ST = ["Новая", "В работе", "На проверке", "Выполнена", "Отклонена"];
const PRIO = { "Высокий": ["#FCE7E6", "#B3261E"], "Средний": ["#FFF6DE", "#8A5A00"], "Низкий": ["#E4F7E9", "#127A33"] };
function MgTasks({ role, tasks, setTasks, addAudit, showToast }) {
  const R = MG_ROLES[role];
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ title: "", who: MG_ROLES.tp.person, deadline: addD(new Date(), 2).toISOString().slice(0, 10), prio: "Средний", comment: "" });
  const [openT, setOpenT] = useState(null);
  const [cmt, setCmt] = useState("");
  const canAssign = ["owner", "director", "supervisor", "accountant", "financier"].includes(role);
  const mine = canAssign ? tasks : tasks.filter((t) => t.who === R.person);
  const people = Object.values(MG_ROLES).map((r) => r.person);
  const save = () => {
    if (!f.title.trim()) return;
    const t = { id: "T" + Date.now(), ...f, title: f.title.trim(), by: R.person, status: "Новая", comments: f.comment ? [{ a: R.person, t: f.comment }] : [] };
    setTasks([t, ...tasks]);
    addAudit(R.person, "Создана задача", t.title, "исполнитель " + t.who + ", срок " + t.deadline);
    setAdd(false); setF({ ...f, title: "", comment: "" });
    showToast("Задача создана ✓");
  };
  const setStatus = (t, st) => {
    const nt = { ...t, status: st };
    setTasks(tasks.map((x) => x.id === t.id ? nt : x)); setOpenT(nt);
    addAudit(R.person, "Статус задачи", t.title, t.status + " → " + st);
  };
  const addCmt = () => {
    if (!cmt.trim()) return;
    const nt = { ...openT, comments: [...(openT.comments || []), { a: R.person, t: cmt.trim() }] };
    setTasks(tasks.map((x) => x.id === nt.id ? nt : x)); setOpenT(nt); setCmt("");
  };
  const ddmm = (s) => s.split("-").reverse().join(".");
  return (
    <div>
      {canAssign && <PrimaryButton full onClick={() => setAdd(true)}><span className="flex items-center justify-center gap-2"><Ico name="plus" size={15} />Новая задача</span></PrimaryButton>}
      <div style={{ height: 12 }} />
      {mine.length === 0 && <p className="text-center py-8" style={{ fontSize: 12.5, color: "var(--muted)" }}>Задач пока нет</p>}
      <div className="kz-list">
      {mine.map((t) => {
        const late = !["Выполнена", "Отклонена"].includes(t.status) && new Date(t.deadline) < sod(new Date());
        return (
          <MgCard key={t.id} onClick={() => setOpenT(t)}>
            <div className="flex justify-between mb-1" style={{ gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{t.title}</span>
              <Badge bg={PRIO[t.prio][0]} fg={PRIO[t.prio][1]}>{t.prio}</Badge>
            </div>
            <div className="flex justify-between" style={{ fontSize: 11, color: "var(--muted)", gap: 8 }}>
              <span>{t.who}</span>
              <span style={{ color: late ? "var(--red)" : "var(--muted)", fontWeight: late ? 700 : 400 }}>{t.status} · до {ddmm(t.deadline)}</span>
            </div>
          </MgCard>
        );
      })}
      </div>
      {add && (
        <Modal title="Новая задача" onClose={() => setAdd(false)} wide>
          <Field label="Что нужно сделать" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>Исполнитель</p>
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {people.map((p) => <button key={p} onClick={() => setF({ ...f, who: p })} className="px-2.5 py-1.5 rounded-full font-semibold" style={{ fontSize: 11, background: f.who === p ? "var(--navy)" : "#F2F1F8", color: f.who === p ? "#fff" : "var(--ink)" }}>{p}</button>)}
          </div>
          <Field label="Срок (deadline)" type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
          <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>Приоритет</p>
          <div className="flex gap-1.5 mb-3">
            {Object.keys(PRIO).map((p) => <button key={p} onClick={() => setF({ ...f, prio: p })} className="flex-1 py-2 rounded-xl font-semibold" style={{ fontSize: 12, background: f.prio === p ? PRIO[p][0] : "#F2F1F8", color: f.prio === p ? PRIO[p][1] : "var(--ink)", border: "1.5px solid " + (f.prio === p ? PRIO[p][1] : "transparent") }}>{p}</button>)}
          </div>
          <Field label="Комментарий" value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />
          <PrimaryButton full onClick={save}>Создать задачу</PrimaryButton>
        </Modal>
      )}
      {openT && (
        <Modal title={openT.title} onClose={() => setOpenT(null)} wide>
          <MgRow l="Исполнитель" v={openT.who} />
          <MgRow l="Поставил" v={openT.by} />
          <MgRow l="Срок" v={ddmm(openT.deadline)} />
          <MgRow l="Приоритет" v={openT.prio} />
          <MgLabel>Статус</MgLabel>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {TASK_ST.map((s) => <button key={s} onClick={() => setStatus(openT, s)} className="rounded-xl py-2 font-semibold" style={{ fontSize: 12, background: openT.status === s ? "var(--navy)" : "#F2F1F8", color: openT.status === s ? "#fff" : "var(--ink)" }}>{s}</button>)}
          </div>
          <MgLabel>Комментарии</MgLabel>
          {(openT.comments || []).map((c, i) => (
            <div key={i} className="rounded-xl p-2.5 mb-1.5" style={{ background: "#F6F5FA" }}>
              <p style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700 }}>{c.a}</p>
              <p style={{ fontSize: 12.5 }}>{c.t}</p>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input value={cmt} onChange={(e) => setCmt(e.target.value)} placeholder="Написать комментарий" className="flex-1 px-3 py-2.5 rounded-xl" style={{ border: "1.5px solid var(--line)", fontSize: 13 }} />
            <button onClick={addCmt} className="px-3 rounded-xl" style={{ background: "var(--navy)" }}><Ico name="send" size={15} color="#fff" /></button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function mgAnswer(q, role, warehouse, weights) {
  const R = MG_ROLES[role];
  const sc = R.scope || {};
  const s = q.toLowerCase();
  const now = new Date();
  const t = mgAgg(sod(now), now, sc);
  const m = mgAgg(new Date(now.getFullYear(), now.getMonth(), 1), now, sc);
  const has = (...w) => w.some((x) => s.includes(x));
  if (has("чист", "таза", "валов", "прибыл", "пайда", "себестоим", "p&l", "ebitda")) {
    if (R.fin !== "full") return "У вашей роли нет доступа к валовой и чистой прибыли. Эти данные видит только владелец.";
    return "За текущий месяц: выручка " + shortMoney(m.netRev) + ", валовая прибыль " + shortMoney(m.gross) + " (маржа " + fp(m.margin) + "), операционные расходы " + shortMoney(m.opex) + ", чистая прибыль " + shortMoney(m.net) + " (" + fp(m.netMargin) + ").";
  }
  if (has("марж")) {
    if (R.fin !== "full" && R.fin !== "margin") return "У вашей роли нет доступа к марже.";
    return "Маржа за текущий месяц — " + fp(m.margin) + ". Сегодня — " + fp(t.margin) + ".";
  }
  if (has("дебитор", "долг", "қарыз", "просроч")) {
    if (role === "driver" || role === "warehouse") return "Дебиторка для вашей роли недоступна.";
    const cl = MG.clients.filter((c) => (!sc.sv || c.sv === sc.sv) && (!sc.tp || c.tp === sc.tp));
    const worst = [...cl].sort((a, b) => b.overdue - a.overdue)[0];
    return "Дебиторка: " + shortMoney(cl.reduce((a, c) => a + c.debt, 0)) + ", просроченная " + shortMoney(cl.filter((c) => c.overdue > 0).reduce((a, c) => a + c.debt, 0)) + (worst && worst.overdue ? ". Самая большая просрочка — " + worst.name + ": " + worst.overdue + " дн., " + money(worst.debt) + "." : ".");
  }
  if (has("склад", "қойма", "остат", "заканч", "dead")) {
    if (["tp", "driver", "supervisor"].includes(role)) return "Складские данные для вашей роли недоступны.";
    const sv = stockView(warehouse);
    const low = sv.filter((p) => p.cover < 7).sort((a, b) => a.cover - b.cover).slice(0, 3);
    return "Заканчивается: " + (low.map((p) => p.name + " (" + p.cover + " дн.)").join(", ") || "нет") + ". Dead stock 30+ дней: " + sv.filter((p) => p.lastMove >= 30).length + " SKU.";
  }
  if (has("лучш", "рейтинг", "үздік", "score", "худш")) {
    if (role === "tp") return "Ваш Score за месяц: " + tpScore(MG.tpById[sc.tp], m, weights).score + ".";
    if (["driver", "warehouse", "accountant", "financier"].includes(role)) return "Рейтинг ТП для вашей роли недоступен.";
    const list = MG.tps.filter((x) => !sc.sv || x.sv === sc.sv).map((x) => ({ x, sc: tpScore(x, mgAgg(new Date(now.getFullYear(), now.getMonth(), 1), now, { tp: x.id }), weights).score })).sort((a, b) => b.sc - a.sc);
    return "Лучший ТП месяца — " + list[0].x.name + " (Score " + list[0].sc + "). Отстаёт — " + list[list.length - 1].x.name + " (Score " + list[list.length - 1].sc + ").";
  }
  if (has("план", "жоспар", "прогноз")) {
    if (["driver", "warehouse"].includes(role)) return "План продаж для вашей роли недоступен.";
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return "План месяца выполнен на " + fp(m.planPct) + ". Прогноз на конец месяца — " + shortMoney(m.netRev / now.getDate() * dim) + ".";
  }
  if (has("продал", "продаж", "выручк", "сатыл", "сколько")) {
    if (["driver", "warehouse"].includes(role)) return "Данные о продажах для вашей роли недоступны.";
    return "Сегодня продано на " + shortMoney(t.netRev) + ", за месяц — " + shortMoney(m.netRev) + ". Возвраты за месяц: " + fp(m.retPct) + ".";
  }
  if (has("проблем", "мәселе", "вмешат")) {
    const p = mgProblems(role, warehouse).filter((x) => x.lvl === "red");
    return p.length ? "Критично сейчас: " + p.map((x) => x.text).join("; ") + "." : "Критичных проблем нет.";
  }
  return "Я могу ответить про продажи, план, маржу, прибыль, дебиторку, склад, рейтинг ТП и проблемы — в рамках прав вашей роли. Например: «Сколько продали сегодня?»";
}

function MgAI({ role, warehouse, weights }) {
  const [msgs, setMsgs] = useState([{ me: false, t: "Здравствуйте! Спросите о компании — отвечу по данным, доступным вашей роли." }]);
  const [q, setQ] = useState("");
  const ask = (text) => {
    const v = (text || q).trim(); if (!v) return;
    setMsgs((m) => [...m, { me: true, t: v }, { me: false, t: mgAnswer(v, role, warehouse, weights) }]);
    setQ("");
  };
  const quick = ["Сколько продали сегодня?", "Как выполняется план?", "Какая дебиторка?", "Кто лучший ТП?", "Что заканчивается на складе?", "Какая чистая прибыль?", "Где нужно вмешаться?"];
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2" style={{ scrollbarWidth: "none" }}>
        {quick.map((x) => <button key={x} onClick={() => ask(x)} className="shrink-0 px-3 py-1.5 rounded-full" style={{ fontSize: 11.5, background: "#EEF0FF", color: "var(--navy)", fontWeight: 600 }}>{x}</button>)}
      </div>
      {msgs.map((m, i) => (
        <div key={i} className="flex mb-2" style={{ justifyContent: m.me ? "flex-end" : "flex-start" }}>
          <div className="rounded-2xl px-3.5 py-2.5" style={{ maxWidth: "85%", background: m.me ? "var(--navy)" : "#fff", color: m.me ? "#fff" : "var(--ink)", border: m.me ? "none" : "1px solid var(--line)", fontSize: 13, lineHeight: 1.45 }}>{m.t}</div>
        </div>
      ))}
      <div className="flex gap-2 mt-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Спросите что-нибудь…" className="flex-1 px-3.5 py-3 rounded-xl" style={{ border: "1.5px solid var(--line)", fontSize: 13, background: "#fff" }} />
        <button onClick={() => ask()} className="px-4 rounded-xl" style={{ background: "var(--navy)" }}><Ico name="send" size={16} color="#fff" /></button>
      </div>
      <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.4 }}>Демо-ассистент отвечает по встроенным правилам. В рабочей версии AI подключается на сервере и проверяет права роли (RBAC) до ответа.</p>
    </div>
  );
}

function MgSystem({ role, sync, setSync, weights, setWeights, auditLog, addAudit, showToast, cur, rg }) {
  const R = MG_ROLES[role];
  const [busy, setBusy] = useState(false);
  const [w, setW] = useState(weights);
  const refresh = () => {
    setBusy(true);
    setTimeout(() => {
      const ok = !sync.fail; const t = new Date();
      setSync((s) => ({ ...s, c1: ok ? t : s.c1, sd: ok ? t : s.sd, log: [{ t, src: "1С + Sales Doctor", ok }, ...s.log].slice(0, 30) }));
      addAudit(R.person, "Ручное обновление данных", "Интеграции", ok ? "успешно" : "ошибка");
      showToast(ok ? "Данные обновлены ✓" : "Ошибка синхронизации");
      setBusy(false);
    }, 1100);
  };
  const saveW = () => { setWeights(w); addAudit(R.person, "Изменены веса Score", "Рейтинг ТП", Object.entries(w).map(([k, v]) => k + "=" + v).join(", ")); showToast("Веса сохранены ✓"); };
  const sum = Object.values(w).reduce((s, x) => s + Number(x || 0), 0);
  const exportCsv = () => {
    const rows = [["Sapar Trade", dmy(rg.from) + " — " + dmy(rg.to)], ["Показатель", "Значение"], ["Выручка", Math.round(cur.netRev)], ["Возвраты", Math.round(cur.ret)], ["Поступило денег", Math.round(cur.cash)], ["План, %", cur.planPct.toFixed(1)]];
    if (R.fin === "full") rows.push(["Себестоимость", Math.round(cur.cogs)], ["Валовая прибыль", Math.round(cur.gross)], ["Валовая маржа", cur.margin.toFixed(1) + "%"], ["Операционные расходы", Math.round(cur.opex)], ["Чистая прибыль", Math.round(cur.net)]);
    const out = CUR_LANG === "kk" ? rows.map((r) => r.map((x) => typeof x === "string" ? trKK(x) : x)) : rows;
    downloadCsv("sapar-trade-" + new Date().toISOString().slice(0, 10) + ".csv", out);
    addAudit(R.person, "Экспорт отчёта", "Excel (CSV)", "период " + dmy(rg.from) + " — " + dmy(rg.to));
  };
  return (
    <div>
      <MgLabel>Интеграции</MgLabel>
      {[["1С: Бухгалтерия", "c1", "Финансы, себестоимость, остатки, реализация, дебиторка"], ["Sales Doctor", "sd", "ТП, визиты, GPS, маршруты, заказы"]].map(([name, k, desc]) => (
        <MgCard key={k}>
          <div className="flex justify-between items-center">
            <span style={{ fontSize: 13, fontWeight: 800 }}>{name}</span>
            <Badge bg={sync.fail ? "#FCE7E6" : "#E4F7E9"} fg={sync.fail ? "#B3261E" : "#127A33"}>{sync.fail ? "ошибка" : "подключено (демо)"}</Badge>
          </div>
          <p style={{ fontSize: 11, color: "var(--muted)", margin: "3px 0" }}>{desc}</p>
          <p className="font-mono-kz" style={{ fontSize: 11.5 }}>Последняя синхронизация: {dt(new Date(sync[k]))}</p>
        </MgCard>
      ))}
      <PrimaryButton full disabled={busy} onClick={refresh}>
        <span className="flex items-center justify-center gap-2"><Ico name="download" size={15} />{busy ? "Обновляем…" : "Обновить данные"}</span>
      </PrimaryButton>
      <div className="flex items-center justify-between mt-3 mb-2 px-1">
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Проверка: имитировать сбой 1С</span>
        <Toggle checked={sync.fail} onChange={(v) => setSync((s) => ({ ...s, fail: v }))} />
      </div>
      <MgLabel>Журнал интеграций</MgLabel>
      <MgCard>
        {sync.log.length === 0 && <p style={{ fontSize: 12, color: "var(--muted)" }}>Записей пока нет</p>}
        {sync.log.map((l, i) => <MgRow key={i} l={dt(new Date(l.t)) + " · " + l.src} v={l.ok ? "OK" : "ОШИБКА"} color={l.ok ? "#127A33" : "var(--red)"} />)}
      </MgCard>
      {role === "owner" && (
        <>
          <MgLabel>Веса Score торгового представителя</MgLabel>
          <MgCard>
            {Object.keys(w).map((k) => (
              <div key={k} className="flex items-center justify-between py-1" style={{ gap: 8 }}>
                <span style={{ fontSize: 12.5 }}>{SCORE_LABELS[k]}</span>
                <input inputMode="numeric" value={w[k]} onChange={(e) => setW({ ...w, [k]: e.target.value.replace(/\D/g, "").slice(0, 3) })} className="font-mono-kz text-center rounded-lg" style={{ width: 60, border: "1.5px solid var(--line)", padding: 6, fontSize: 13 }} />
              </div>
            ))}
            <p className="font-mono-kz" style={{ fontSize: 12, fontWeight: 700, color: sum === 100 ? "#127A33" : "var(--red)", margin: "8px 0" }}>Сумма: {sum} {sum === 100 ? "✓" : "(должно быть 100)"}</p>
            <GhostButton small onClick={saveW}>Сохранить</GhostButton>
          </MgCard>
        </>
      )}
      <MgLabel>Экспорт</MgLabel>
      <div className="flex gap-2 mb-2">
        <GhostButton small onClick={exportCsv}>Excel (CSV)</GhostButton>
        <GhostButton small onClick={() => { addAudit(R.person, "Экспорт отчёта", "PDF", "печать экрана"); window.print(); }}>PDF / печать</GhostButton>
      </div>
      <p style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 10 }}>В экспорт попадают только данные, разрешённые вашей роли.</p>
      <MgLabel>Журнал действий (audit log)</MgLabel>
      <MgCard>
        {auditLog.slice(0, 12).map((a, i) => (
          <div key={i} className="py-1.5" style={{ borderBottom: "1px dashed var(--line)" }}>
            <p style={{ fontSize: 12, fontWeight: 700 }}>{a.action} · <span style={{ fontWeight: 500 }}>{a.obj}</span></p>
            <p style={{ fontSize: 10.5, color: "var(--muted)" }}>{a.t} · {a.user} · {a.detail}</p>
          </div>
        ))}
      </MgCard>
      <MgLabel>Безопасность</MgLabel>
      <MgCard>
        {["HTTPS-соединение", "Пароли хранятся в виде хэша", "Права (RBAC) проверяются на сервере", "2FA для владельца и директора", "Контроль сессий и устройств", "Резервное копирование ежедневно"].map((x) => (
          <div key={x} className="flex items-center gap-2 py-1"><Ico name="check-circle" size={14} color="#127A33" /><span style={{ fontSize: 12.5 }}>{x}</span></div>
        ))}
        <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.4 }}>Эти пункты выполняются на стороне Backend при подключении к серверу; в демо-версии они показаны как требования ТЗ.</p>
      </MgCard>
    </div>
  );
}

