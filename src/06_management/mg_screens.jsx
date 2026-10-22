// Sapar Trade — прототип. Модуль: Экраны: главная владельца, продажи, команда/ТП, водитель, склад, клиенты, финансы, проблемы
// Строки 3492–4092 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ---------- screens ---------- */
function MgHome(props) {
  const { role } = props;
  if (role === "supervisor") return <MgTeam {...props} />;
  if (role === "tp") return <MgTpCard {...props} tpId={MG_ROLES.tp.scope.tp} self />;
  if (role === "driver") return <MgDriverHome {...props} />;
  if (role === "warehouse") return <MgStock {...props} />;
  if (role === "accountant" || role === "financier") return <MgCashHome {...props} />;
  return <MgOwnerHome {...props} />;
}

function MgOwnerHome({ role, cur, prev, rg, go, warehouse, problems, weights }) {
  const fin = MG_ROLES[role].fin;
  const recv = MG.clients.reduce((s, c) => s + c.debt, 0);
  const recvOver = MG.clients.filter((c) => c.overdue > 0).reduce((s, c) => s + c.debt, 0);
  const sv = stockView(warehouse);
  const stockSum = fin === "full" ? sv.reduce((s, p) => s + p.sumCost, 0) : sv.reduce((s, p) => s + p.sumSale, 0);
  const series = useMemo(() => mgSeries(rg.from, rg.to), [rg.from.getTime(), rg.to.getTime()]);
  const rating = MG.tps.map((tp) => ({ tp, ...tpScore(tp, mgAgg(rg.from, rg.to, { tp: tp.id }), weights) })).sort((a, b) => b.score - a.score);
  const k = [];
  k.push({ l: "Выручка", v: shortMoney(cur.netRev), c: cur.netRev, p: prev.netRev, tab: "sales" });
  if (fin === "full") {
    k.push({ l: "Валовая прибыль", v: shortMoney(cur.gross), c: cur.gross, p: prev.gross, tab: "finance" });
    k.push({ l: "Валовая маржа", v: fp(cur.margin), c: cur.margin, p: prev.margin, pp: true, tab: "finance" });
    k.push({ l: "Операционные расходы", v: shortMoney(cur.opex), c: cur.opex, p: prev.opex, inv: true, tab: "finance" });
    k.push({ l: "Чистая прибыль", v: shortMoney(cur.net), c: cur.net, p: prev.net, tab: "finance" });
    k.push({ l: "Чистая рентабельность", v: fp(cur.netMargin), c: cur.netMargin, p: prev.netMargin, pp: true, tab: "finance" });
  } else {
    k.push({ l: "Маржа", v: fp(cur.margin), c: cur.margin, p: prev.margin, pp: true, tab: "sales" });
  }
  k.push({ l: "Поступило денег", v: shortMoney(cur.cash), c: cur.cash, p: prev.cash, tab: fin === "full" ? "finance" : "clients" });
  k.push({ l: "Дебиторка", v: shortMoney(recv), tab: "clients" });
  k.push({ l: "Просроченная дебиторка", v: shortMoney(recvOver), tab: "clients", accent: "#F5C2BF" });
  k.push({ l: fin === "full" ? "Склад (по себестоимости)" : "Склад (по цене продажи)", v: shortMoney(stockSum), tab: "stock" });
  k.push({ l: "Возвраты", v: shortMoney(cur.ret), c: cur.ret, p: prev.ret, inv: true, tab: "sales" });
  k.push({ l: "План продаж", v: fp(cur.planPct), c: cur.planPct, p: prev.planPct, pp: true, tab: "sales" });

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {k.map((x, i) => <MgKpi key={i} label={x.l} value={x.v} cur={x.c} prev={x.p} invert={x.inv} noMoneyDelta={x.pp} accent={x.accent} onClick={() => go(x.tab)} />)}
      </div>
      <div className="kz-cols2">
      <MgCard>
        <div className="flex justify-between items-center mb-1">
          <p style={{ fontSize: 13, fontWeight: 800 }}>Динамика выручки</p>
          <span className="font-mono-kz" style={{ fontSize: 11, color: "var(--muted)" }}>{dmy(rg.from)} — {dmy(rg.to)}</span>
        </div>
        <MgTrend data={series} />
      </MgCard>
      <MgCard>
        <div className="flex justify-between items-center mb-2">
          <p style={{ fontSize: 13, fontWeight: 800 }}>План / факт</p>
          <span className="font-mono-kz" style={{ fontSize: 12, fontWeight: 800, color: cur.planPct >= 100 ? "#127A33" : "var(--red)" }}>{fp(cur.planPct)}</span>
        </div>
        <MgBar value={cur.planPct} color={cur.planPct >= 100 ? "#1FA854" : "var(--navy)"} />
        <div className="flex justify-between mt-2" style={{ fontSize: 11.5, color: "var(--muted)" }}>
          <span>Факт: {shortMoney(cur.netRev)}</span><span>План: {shortMoney(cur.plan)}</span>
        </div>
      </MgCard>
      </div>
      <div className="kz-cols2">
      <div>
      <MgLabel>Главные проблемы</MgLabel>
      {problems.slice(0, 4).map((p, i) => <MgProblemRow key={i} p={p} onGo={go} />)}
      </div>
      <div>
      <MgLabel>Эффективность команды</MgLabel>
      <MgCard onClick={() => go("team")}>
        {rating.slice(0, 3).map((x, i) => (
          <div key={x.tp.id} className="flex items-center gap-2.5 py-1.5">
            <span className="font-mono-kz" style={{ fontSize: 12, fontWeight: 800, width: 18, color: i === 0 ? "#C98A00" : "var(--muted)" }}>{i + 1}</span>
            <span style={{ fontSize: 12.5, flex: 1, fontWeight: 600 }}>{x.tp.name}</span>
            <span className="font-mono-kz" style={{ fontSize: 12.5, fontWeight: 800 }}>{x.score}</span>
          </div>
        ))}
      </MgCard>
      </div>
      </div>
    </div>
  );
}

function MgSales({ role, cur, prev, rg, go }) {
  const fin = MG_ROLES[role].fin;
  const now = new Date();
  const m = mgAgg(new Date(now.getFullYear(), now.getMonth(), 1), now);
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const passed = now.getDate();
  const monthPlan = m.plan / passed * dim;
  const forecast = m.netRev / passed * dim;
  const need = Math.max(0, monthPlan - m.netRev);
  const active = MG.clients.filter((c) => c.status === "active").length;
  const fresh = MG.clients.filter((c) => c.status === "new").length;
  const lost = MG.clients.filter((c) => c.status === "lost").length;
  const ordered = MG.clients.filter((c) => c.lastOrder <= 7).length;
  const byTeam = MG.supervisors.map((s) => ({ s, a: mgAgg(rg.from, rg.to, { sv: s.id }) }));
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MgKpi label="Факт продаж" value={shortMoney(cur.netRev)} cur={cur.netRev} prev={prev.netRev} />
        <MgKpi label="План" value={shortMoney(cur.plan)} />
        <MgKpi label="Выполнение" value={fp(cur.planPct)} cur={cur.planPct} prev={prev.planPct} noMoneyDelta />
        <MgKpi label="Остаток до плана" value={shortMoney(Math.max(0, cur.plan - cur.netRev))} />
        {fin === "full" && <MgKpi label="Валовая прибыль" value={shortMoney(cur.gross)} cur={cur.gross} prev={prev.gross} />}
        {(fin === "full" || fin === "margin") && <MgKpi label="Маржа" value={fp(cur.margin)} cur={cur.margin} prev={prev.margin} noMoneyDelta />}
        <MgKpi label="Возвраты" value={shortMoney(cur.ret) + " · " + fp(cur.retPct)} cur={cur.ret} prev={prev.ret} invert />
        <MgKpi label="Средний чек" value={shortMoney(cur.avgCheck)} cur={cur.avgCheck} prev={prev.avgCheck} />
      </div>
      <MgCard>
        <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Текущий месяц</p>
        <MgRow l="План на месяц" v={shortMoney(monthPlan)} />
        <MgRow l="Факт на сегодня" v={shortMoney(m.netRev)} />
        <MgRow l="Дневной темп" v={shortMoney(m.netRev / passed)} />
        <MgRow l="Прогноз на конец месяца" v={shortMoney(forecast)} strong color={forecast >= monthPlan ? "#127A33" : "var(--red)"} />
        <MgRow l="Нужно продавать в день до плана" v={shortMoney(need / Math.max(1, dim - passed))} />
      </MgCard>
      <MgCard>
        <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Клиенты</p>
        <MgRow l="Активные" v={active} />
        <MgRow l="Новые" v={fresh} color="#127A33" />
        <MgRow l="Потерянные" v={lost} color="var(--red)" />
        <MgRow l="Сделали заказ за 7 дней" v={ordered} />
        <MgRow l="Не заказывали 7+ дней" v={MG.clients.length - ordered} color="#8A5A00" />
      </MgCard>
      <MgLabel>Команды супервайзеров</MgLabel>
      {byTeam.map(({ s, a }) => (
        <MgCard key={s.id} onClick={() => go("team")}>
          <div className="flex justify-between mb-1.5">
            <span style={{ fontSize: 13, fontWeight: 700 }}>{s.team} · {s.name}</span>
            <span className="font-mono-kz" style={{ fontSize: 12.5, fontWeight: 800 }}>{fp(a.planPct)}</span>
          </div>
          <MgBar value={a.planPct} />
          <div className="flex justify-between mt-1.5" style={{ fontSize: 11, color: "var(--muted)" }}>
            <span>{shortMoney(a.netRev)}</span>{fin !== "none" && <span>маржа {fp(a.margin)}</span>}<span>возвраты {fp(a.retPct)}</span>
          </div>
        </MgCard>
      ))}
    </div>
  );
}

const MG_RANGES = [["day", "День"], ["week", "Неделя"], ["month", "Месяц"], ["quarter", "Квартал"]];
const mgShortRange = (id) => id === "day" ? mgRange("today") : mgRange(id);

function MgTeam({ role, weights, openTp }) {
  const scope = MG_ROLES[role].scope || {};
  const [cmp, setCmp] = useState(false);
  const [range, setRange] = useState("month");
  const rr = mgShortRange(range);
  const list = MG.tps.filter((t) => !scope.sv || t.sv === scope.sv)
    .map((tp) => { const a = mgAgg(rr.from, rr.to, { tp: tp.id }); return { tp, a, ...tpScore(tp, a, weights) }; })
    .sort((x, y) => y.score - x.score);
  const teams = MG.supervisors.filter((s) => !scope.sv || s.id === scope.sv).map((s) => {
    const a = mgAgg(rr.from, rr.to, { sv: s.id });
    const members = list.filter((x) => x.tp.sv === s.id);
    const cl = MG.clients.filter((c) => c.sv === s.id);
    return { s, a, members, avg: Math.round(members.reduce((q, x) => q + x.score, 0) / (members.length || 1)),
      debt: cl.reduce((q, c) => q + c.debt, 0), over: cl.filter((c) => c.overdue > 0).reduce((q, c) => q + c.debt, 0),
      fresh: cl.filter((c) => c.status === "new").length, lost: cl.filter((c) => c.status === "lost").length };
  });
  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {MG_RANGES.map(([id, l]) => (
          <button key={id} onClick={() => setRange(id)} className="flex-1 py-2 rounded-xl font-semibold" style={{ fontSize: 11.5, background: range === id ? "var(--navy)" : "#F2F1F8", color: range === id ? "#fff" : "var(--ink)" }}>{l}</button>
        ))}
      </div>
      <MgLabel>Супервайзеры</MgLabel>
      {!scope.sv && <GhostButton small onClick={() => setCmp(!cmp)}>{cmp ? "Скрыть сравнение" : "Сравнить две команды"}</GhostButton>}
      {cmp && teams.length === 2 ? (
        <MgCard style={{ marginTop: 10 }}>
          <div className="flex" style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 4 }}>
            <span style={{ flex: 1.3 }}></span>{teams.map((t) => <span key={t.s.id} style={{ flex: 1, textAlign: "right" }}>{t.s.team}</span>)}
          </div>
          {[["ТП в команде", (t) => t.members.length], ["Продажи", (t) => shortMoney(t.a.netRev)], ["План", (t) => fp(t.a.planPct)],
            ["Эффективный визит", (t) => fp(t.a.effPct)], ["Возвраты", (t) => fp(t.a.retPct)], ["Дебиторка", (t) => shortMoney(t.debt)],
            ["Просрочка", (t) => shortMoney(t.over)], ["Новые / потерянные", (t) => t.fresh + " / " + t.lost], ["Средний Score", (t) => t.avg]].map(([l, fn]) => (
            <div key={l} className="flex py-1.5" style={{ borderBottom: "1px dashed var(--line)", fontSize: 12 }}>
              <span style={{ flex: 1.3, color: "var(--muted)" }}>{l}</span>
              {teams.map((t) => <span key={t.s.id} className="font-mono-kz" style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{fn(t)}</span>)}
            </div>
          ))}
        </MgCard>
      ) : teams.map((t) => (
        <MgCard key={t.s.id} style={{ marginTop: 10 }}>
          <div className="flex justify-between mb-1">
            <span style={{ fontSize: 13, fontWeight: 800 }}>{t.s.name}</span>
            <Badge bg="#EEF0FF" fg="var(--navy)">Score {t.avg}</Badge>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>{t.s.team} · {t.members.length} ТП</p>
          <MgRow l="Продажи команды" v={shortMoney(t.a.netRev)} />
          <MgRow l="План" v={fp(t.a.planPct)} />
          <MgRow l="Эффективный визит" v={fp(t.a.effPct)} />
          <MgRow l="Возвраты" v={fp(t.a.retPct)} />
          <MgRow l="Дебиторка / просрочка" v={shortMoney(t.debt) + " / " + shortMoney(t.over)} />
          <MgRow l="Новые / потерянные клиенты" v={t.fresh + " / " + t.lost} />
        </MgCard>
      ))}
      <MgLabel>Рейтинг торговых представителей</MgLabel>
      <div className="kz-list">
      {list.map((x, i) => (
        <MgCard key={x.tp.id} onClick={() => openTp(x.tp.id)}>
          <div className="flex items-center gap-2.5">
            <span className="rounded-full flex items-center justify-center font-mono-kz shrink-0" style={{ width: 30, height: 30, fontSize: 12, fontWeight: 800, background: i === 0 ? "#FFF3D6" : "#F2F1F8", color: i === 0 ? "#8A5A00" : "var(--ink)" }}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 13, fontWeight: 700 }}>{x.tp.name}</p>
              <p style={{ fontSize: 11, color: "var(--muted)" }}>{x.tp.territory} · план {fp(x.a.planPct, 0)} · визиты {fp(x.a.effPct, 0)}</p>
            </div>
            <div className="text-center">
              <p className="font-mono-kz" style={{ fontSize: 17, fontWeight: 800, color: x.score >= 80 ? "#127A33" : x.score >= 65 ? "#8A5A00" : "var(--red)" }}>{x.score}</p>
              <p style={{ fontSize: 9.5, color: "var(--muted)" }}>Score</p>
            </div>
          </div>
        </MgCard>
      ))}
      </div>
    </div>
  );
}

function MgRouteMap({ tpId }) {
  const r = mkRng(tpId.charCodeAt(2) * 97 + new Date().getDate());
  const pool = [...MG.clients.filter((c) => c.tp === tpId), ...MG.clients.filter((c) => c.tp !== tpId)].slice(0, 7);
  let h = 9, m = 5;
  const tick = (n) => { m += n; while (m >= 60) { m -= 60; h++; } };
  const hhmm = () => String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  const pts = pool.map((c, i) => {
    const arr = hhmm(); const dur = 12 + Math.floor(r() * 25); tick(dur); const dep = hhmm(); tick(10 + Math.floor(r() * 25));
    return { c, x: 26 + i * 42 + r() * 10, y: 25 + r() * 90, arr, dep, dur, sum: r() < 0.75 ? Math.round(r() * 300000 / 100) * 100 : 0, dev: r() < 0.15 };
  });
  const path = "12,130 " + pts.map((p) => p.x + "," + p.y).join(" ");
  return (
    <div>
      <div className="rounded-xl overflow-hidden mb-2" style={{ background: "#F3F6FB", border: "1px solid var(--line)" }}>
        <svg viewBox="0 0 320 150" width="100%" height="150">
          {[30, 60, 90, 120].map((y) => <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="#E4E8F2" />)}
          {[60, 120, 180, 240, 300].map((x) => <line key={x} y1="0" y2="150" x1={x} x2={x} stroke="#E4E8F2" />)}
          <polyline points={path} fill="none" stroke="#1B1464" strokeWidth="2.2" strokeDasharray="5 4" />
          <circle cx="12" cy="130" r="6" fill="#1FA854" />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="9" fill={p.dev ? "#E2231A" : p.sum ? "#1B1464" : "#9A97AE"} />
              <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">{i + 1}</text>
            </g>
          ))}
        </svg>
      </div>
      <p style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 6 }}>Зелёная — старт, синие — точки с заказом, серые — без заказа, красные — отклонение от маршрута. GPS фиксируется только в рабочее время.</p>
      {pts.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5" style={{ borderBottom: "1px dashed var(--line)" }}>
          <span className="font-mono-kz" style={{ fontSize: 11, fontWeight: 800, width: 16 }}>{i + 1}</span>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 12, fontWeight: 700 }} className="truncate">{p.c.name}{p.dev ? " · отклонение" : ""}</p>
            <p className="font-mono-kz" style={{ fontSize: 10.5, color: "var(--muted)" }}>{p.arr}–{p.dep} · {p.dur} мин</p>
          </div>
          <span className="font-mono-kz" style={{ fontSize: 11.5, fontWeight: 700, color: p.sum ? "var(--ink)" : "var(--muted)" }}>{p.sum ? money(p.sum) : "без заказа"}</span>
        </div>
      ))}
    </div>
  );
}

const SCORE_LABELS = { plan: "План продаж", visit: "Эффективный визит", route: "Маршрут", ret: "Возвраты", debt: "Дисциплина дебиторки", sku: "SKU", disc: "Дисциплина" };

function MgTpCard({ tpId, weights, self }) {
  const tp = MG.tpById[tpId];
  const [range, setRange] = useState("month");
  const rr = mgShortRange(range);
  const a = mgAgg(rr.from, rr.to, { tp: tpId });
  const pr = mgAgg(rr.pf, rr.pt, { tp: tpId });
  const sc = tpScore(tp, a, weights);
  const today = mgAgg(sod(new Date()), new Date(), { tp: tpId });
  const cl = MG.clients.filter((c) => c.tp === tpId);
  const sv = MG.supervisors.find((s) => s.id === tp.sv);
  const hours = (() => { const [h, m] = tp.start.split(":").map(Number); const n = new Date(); return Math.max(0, n.getHours() - h + (n.getMinutes() - m) / 60); })();
  return (
    <div>
      <MgCard style={{ background: "linear-gradient(160deg,#1B1464,#4B3FCB)", border: "none", color: "#fff" }}>
        <div className="flex items-center gap-3">
          <div className="rounded-full flex items-center justify-center font-display shrink-0" style={{ width: 46, height: 46, background: "rgba(255,255,255,.18)", fontSize: 16, fontWeight: 800 }}>{tp.name.split(" ").map((s) => s[0]).join("")}</div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 15, fontWeight: 800 }}>{tp.name}</p>
            <p style={{ fontSize: 11.5, opacity: 0.85 }}>{sv.team} · супервайзер {sv.name}</p>
            <p style={{ fontSize: 11.5, opacity: 0.85 }}>{tp.territory} · {tp.route}</p>
          </div>
          <div className="text-center">
            <p className="font-mono-kz" style={{ fontSize: 26, fontWeight: 800 }}>{sc.score}</p>
            <p style={{ fontSize: 10, opacity: 0.8 }}>Score</p>
          </div>
        </div>
      </MgCard>
      <div className="flex gap-1.5 mb-3">
        {MG_RANGES.map(([id, l]) => (
          <button key={id} onClick={() => setRange(id)} className="flex-1 py-2 rounded-xl font-semibold" style={{ fontSize: 11.5, background: range === id ? "var(--navy)" : "#F2F1F8", color: range === id ? "#fff" : "var(--ink)" }}>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MgKpi label="Продажи" value={shortMoney(a.netRev)} cur={a.netRev} prev={pr.netRev} />
        <MgKpi label="План" value={fp(a.planPct)} cur={a.planPct} prev={pr.planPct} noMoneyDelta />
        <MgKpi label="Эффективный визит" value={fp(a.effPct)} cur={a.effPct} prev={pr.effPct} noMoneyDelta />
        <MgKpi label="Средний чек" value={shortMoney(a.avgCheck)} cur={a.avgCheck} prev={pr.avgCheck} />
      </div>
      <MgCard>
        <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Сегодня</p>
        <MgRow l="Начало работы" v={tp.start} />
        <MgRow l="Рабочих часов" v={hours.toFixed(1).replace(".", ",") + " ч"} />
        <MgRow l="Километраж" v={today.km + " км"} />
        <MgRow l="Точки план / факт" v={today.vPlan + " / " + today.vFact} />
        <MgRow l="Заказ сделали / не сделали" v={today.vEff + " / " + Math.max(0, today.vFact - today.vEff)} />
      </MgCard>
      <MgCard>
        <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Показатели за период</p>
        <MgRow l="Точки план / факт" v={a.vPlan + " / " + a.vFact} />
        <MgRow l="Эффективных визитов" v={a.vEff} />
        <MgRow l="SKU на визит (факт / план)" v={(a.vPlan ? (a.sku / Math.max(1, a.vPlan / 22)).toFixed(1).replace(".", ",") : "0") + " / 22"} />
        <MgRow l="Возвраты" v={shortMoney(a.ret) + " · " + fp(a.retPct)} />
        <MgRow l="Дебиторка" v={shortMoney(cl.reduce((s, c) => s + c.debt, 0))} />
        <MgRow l="Просрочка" v={shortMoney(cl.filter((c) => c.overdue > 0).reduce((s, c) => s + c.debt, 0))} color="var(--red)" />
        <MgRow l="Новые клиенты" v={a.newCl} />
        <MgRow l="Километраж" v={a.km.toLocaleString("ru-RU") + " км"} />
      </MgCard>
      <MgCard>
        <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Из чего складывается Score</p>
        {Object.keys(weights).map((k) => (
          <div key={k} className="mb-2">
            <div className="flex justify-between" style={{ fontSize: 11.5, marginBottom: 3 }}>
              <span>{SCORE_LABELS[k]} <span style={{ color: "var(--muted)" }}>({weights[k]})</span></span>
              <span className="font-mono-kz" style={{ fontWeight: 700 }}>{fp(sc.parts[k] * 100, 0)}</span>
            </div>
            <MgBar value={sc.parts[k] * 100} />
          </div>
        ))}
      </MgCard>
      <MgLabel>GPS-маршрут за сегодня</MgLabel>
      <MgCard><MgRouteMap tpId={tpId} /></MgCard>
      {self && (
        <>
          <MgLabel>Не заказывали 7+ дней</MgLabel>
          {cl.filter((c) => c.lastOrder > 7).length === 0 && <p style={{ fontSize: 12, color: "var(--muted)" }}>Все клиенты заказывали на этой неделе</p>}
          {cl.filter((c) => c.lastOrder > 7).map((c) => (
            <MgCard key={c.id}><p style={{ fontSize: 12.5, fontWeight: 700 }}>{c.name}</p><p style={{ fontSize: 11, color: "var(--muted)" }}>последний заказ {c.lastOrder} дн. назад · {c.phone}</p></MgCard>
          ))}
        </>
      )}
    </div>
  );
}

function MgDriverHome({ addAudit, showToast }) {
  const [list, setList] = useState(MG.deliveries);
  const [open, setOpen] = useState(null);
  const done = list.filter((d) => ["Доставлен", "Частично доставлен", "Закрыт"].includes(d.status));
  const cash = list.filter((d) => d.pay === "cash").reduce((s, d) => s + d.collected, 0);
  const bank = list.filter((d) => d.pay === "bank").reduce((s, d) => s + d.collected, 0);
  const debt = list.filter((d) => d.pay === "debt" && ["Доставлен", "Частично доставлен", "Закрыт"].includes(d.status)).reduce((s, d) => s + d.total, 0);
  const setStatus = (d, st) => {
    const collected = d.pay === "debt" ? 0 : ["Доставлен", "Закрыт"].includes(st) ? d.total : st === "Частично доставлен" ? Math.round(d.total * 0.6) : 0;
    setList(list.map((x) => x.id === d.id ? { ...x, status: st, collected } : x));
    setOpen(null);
    addAudit(MG_ROLES.driver.person, "Статус доставки", d.id, d.status + " → " + st);
    showToast("Статус обновлён ✓");
  };
  const stStyle = (s) => s === "Доставлен" || s === "Закрыт" ? ["#E4F7E9", "#127A33"] : s === "В пути" ? ["#E3F3FF", "#0B5A8A"] : s === "Отказ" || s === "Возврат" ? ["#FCE7E6", "#B3261E"] : ["#FFF3D6", "#8A5A00"];
  return (
    <div>
      <MgCard style={{ background: "linear-gradient(160deg,#1B1464,#4B3FCB)", border: "none", color: "#fff" }}>
        <p style={{ fontSize: 15, fontWeight: 800 }}>{MG_ROLES.driver.person}</p>
        <p style={{ fontSize: 11.5, opacity: 0.85 }}>Isuzu 777 ABZ 11 · выезд 08:40 · 64 км</p>
        <div className="flex gap-4 mt-2">
          <div><p className="font-mono-kz" style={{ fontSize: 18, fontWeight: 800 }}>{done.length}/{list.length}</p><p style={{ fontSize: 10, opacity: 0.8 }}>доставлено</p></div>
          <div><p className="font-mono-kz" style={{ fontSize: 18, fontWeight: 800 }}>{shortMoney(cash + bank)}</p><p style={{ fontSize: 10, opacity: 0.8 }}>собрано</p></div>
        </div>
      </MgCard>
      <MgCard>
        <MgRow l="Наличные" v={money(cash)} />
        <MgRow l="Банк (перевод / Kaspi)" v={money(bank)} />
        <MgRow l="Ушло в долг" v={money(debt)} color="#8A5A00" />
        <MgRow l="Возврат товара" v={list.filter((d) => d.status === "Возврат").length + " накл."} />
      </MgCard>
      <MgDriverGps />
      <MgLabel>Маршрут и накладные</MgLabel>
      <div className="kz-list">
      {list.map((d, i) => (
        <MgCard key={d.id} onClick={() => setOpen(d)}>
          <div className="flex justify-between mb-1">
            <span className="font-mono-kz" style={{ fontSize: 11.5, color: "var(--muted)" }}>{i + 1}. {d.id}</span>
            <Badge bg={stStyle(d.status)[0]} fg={stStyle(d.status)[1]}>{d.status}</Badge>
          </div>
          <p style={{ fontSize: 13, fontWeight: 700 }}>{d.client}</p>
          <div className="flex justify-between" style={{ fontSize: 11.5, color: "var(--muted)", gap: 8 }}>
            <span>{d.addr}</span>
            <span className="font-mono-kz" style={{ fontWeight: 700, color: "var(--ink)" }}>{money(d.total)}</span>
          </div>
        </MgCard>
      ))}
      </div>
      {open && (
        <Modal title={open.id + " · " + open.client} onClose={() => setOpen(null)}>
          <MgRow l="Сумма" v={money(open.total)} />
          <MgRow l="Оплата" v={open.pay === "cash" ? "Наличные" : open.pay === "bank" ? "Банк" : "В долг"} />
          <MgRow l="Адрес" v={open.addr} />
          <MgLabel>Сменить статус</MgLabel>
          <div className="grid grid-cols-2 gap-2">
            {ORDER_FLOW.map((s) => (
              <button key={s} onClick={() => setStatus(open, s)} className="rounded-xl py-2.5 px-2 font-semibold" style={{ fontSize: 12, background: open.status === s ? "var(--navy)" : "#F2F1F8", color: open.status === s ? "#fff" : "var(--ink)" }}>{s}</button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function MgStock({ role, warehouse }) {
  const fin = MG_ROLES[role].fin;
  const [tab, setTab] = useState("all");
  const sv = stockView(warehouse);
  const low = sv.filter((p) => p.cover < 7).sort((a, b) => a.cover - b.cover);
  const deadRows = [["30–59 дней", 30, 59], ["60–89 дней", 60, 89], ["90+ дней", 90, 99999]].map(([l, lo, hi]) => ({ l, list: sv.filter((p) => p.lastMove >= lo && p.lastMove <= hi) }));
  const list = tab === "low" ? low : tab === "dead" ? sv.filter((p) => p.lastMove >= 30) : sv;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MgKpi label="Позиций на складе" value={sv.length + " SKU"} />
        <MgKpi label="Остаток, шт" value={sv.reduce((s, p) => s + p.stock, 0).toLocaleString("ru-RU")} />
        <MgKpi label="Сумма по цене продажи" value={shortMoney(sv.reduce((s, p) => s + p.sumSale, 0))} />
        {fin === "full" ? <MgKpi label="Сумма по себестоимости" value={shortMoney(sv.reduce((s, p) => s + p.sumCost, 0))} /> : <MgKpi label="Нужен заказ" value={low.length + " SKU"} accent="#F5C2BF" />}
      </div>
      <MgCard>
        <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Dead stock — товар без движения</p>
        {deadRows.map((d) => <MgRow key={d.l} l={d.l} v={d.list.length + " SKU · " + shortMoney(d.list.reduce((s, p) => s + p.sumSale, 0))} color={d.l.startsWith("90") ? "var(--red)" : "#8A5A00"} />)}
      </MgCard>
      <div className="flex gap-1.5 mb-3">
        {[["all", "Все"], ["low", "Нужен заказ"], ["dead", "Dead stock"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className="flex-1 py-2 rounded-xl font-semibold" style={{ fontSize: 11.5, background: tab === id ? "var(--red)" : "#F2F1F8", color: tab === id ? "#fff" : "var(--ink)" }}>{l}</button>
        ))}
      </div>
      <div className="kz-list">
      {list.map((p) => (
        <MgCard key={p.id}>
          <div className="flex justify-between mb-1" style={{ gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{p.name}</span>
            <span className="font-mono-kz" style={{ fontSize: 12.5, fontWeight: 800 }}>{p.stock} {p.unit}</span>
          </div>
          <div className="flex gap-1.5 mb-1.5 flex-wrap">
            <Badge bg={p.cover < 7 ? "#FCE7E6" : p.cover > 300 ? "#F2F1F8" : "#E4F7E9"} fg={p.cover < 7 ? "#B3261E" : p.cover > 300 ? "var(--muted)" : "#127A33"}>{p.cover > 300 ? "нет продаж" : "хватит на " + p.cover + " дн."}</Badge>
            {p.lastMove >= 30 && <Badge bg="#FFF6DE" fg="#8A5A00">без движения {p.lastMove} дн.</Badge>}
            {p.cover < 7 && <Badge bg="#EEF0FF" fg="var(--navy)">заказать ~{Math.max(1, Math.ceil(p.avgDaily * 21 - p.stock))} {p.unit}</Badge>}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
            Цена {money(p.price)}{fin === "full" ? " · себестоимость " + money(p.cost) : ""} · приход {p.inQ} · расход {p.outQ} · возврат {p.retQ} · брак {p.brak} · списание {p.wo}{p.peresort ? " · пересорт " + p.peresort : ""}{p.expiring ? " · просрочка " + p.expiring : ""}
          </div>
        </MgCard>
      ))}
      </div>
    </div>
  );
}

function MgClients({ role, addAudit }) {
  const R = MG_ROLES[role];
  const scope = R.scope || {};
  const [open, setOpen] = useState(null);
  const [f, setF] = useState("all");
  const base = MG.clients.filter((c) => (!scope.sv || c.sv === scope.sv) && (!scope.tp || c.tp === scope.tp));
  const aging = agingBuckets(base);
  const total = base.reduce((s, c) => s + c.debt, 0);
  const over = base.filter((c) => c.overdue > 0).reduce((s, c) => s + c.debt, 0);
  const list = base.filter((c) => f === "all" || (f === "debt" && c.debt) || (f === "over" && c.overdue > 0)).sort((a, b) => b.overdue - a.overdue || b.debt - a.debt);
  const byTp = MG.tps.filter((t) => base.some((c) => c.tp === t.id)).map((t) => ({ t, sum: base.filter((c) => c.tp === t.id).reduce((s, c) => s + c.debt, 0), over: base.filter((c) => c.tp === t.id && c.overdue > 0).reduce((s, c) => s + c.debt, 0) }));
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MgKpi label="Дебиторка всего" value={shortMoney(total)} />
        <MgKpi label="Просроченная" value={shortMoney(over)} accent="#F5C2BF" />
      </div>
      <MgCard>
        <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Возраст долга</p>
        {aging.map((b, i) => (
          <div key={b.label} className="mb-2">
            <div className="flex justify-between" style={{ fontSize: 11.5, marginBottom: 3 }}>
              <span>{b.label}</span><span className="font-mono-kz" style={{ fontWeight: 700 }}>{shortMoney(b.sum)}</span>
            </div>
            <MgBar value={b.sum} max={total || 1} color={i >= 4 ? "var(--red)" : i === 0 ? "#1FA854" : "#F5A300"} />
          </div>
        ))}
      </MgCard>
      {!scope.tp && (
        <MgCard>
          <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>По торговым представителям (долг / просрочка)</p>
          {byTp.map((x) => <MgRow key={x.t.id} l={x.t.name} v={shortMoney(x.sum) + " / " + shortMoney(x.over)} />)}
          {!scope.sv && MG.supervisors.map((s) => <MgRow key={s.id} l={"Команда: " + s.name} v={shortMoney(base.filter((c) => c.sv === s.id).reduce((q, c) => q + c.debt, 0))} strong />)}
        </MgCard>
      )}
      <div className="flex gap-1.5 mb-3">
        {[["all", "Все клиенты"], ["debt", "С долгом"], ["over", "Просрочка"]].map(([id, l]) => (
          <button key={id} onClick={() => setF(id)} className="flex-1 py-2 rounded-xl font-semibold" style={{ fontSize: 11.5, background: f === id ? "var(--red)" : "#F2F1F8", color: f === id ? "#fff" : "var(--ink)" }}>{l}</button>
        ))}
      </div>
      <div className="kz-list">
      {list.map((c) => (
        <MgCard key={c.id} onClick={() => { setOpen(c); addAudit(R.person, "Просмотр карточки клиента", c.name, "дебиторка " + money(c.debt)); }}>
          <div className="flex justify-between" style={{ gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</span>
            <span className="font-mono-kz" style={{ fontSize: 12.5, fontWeight: 800, color: c.overdue > 30 ? "var(--red)" : "var(--ink)" }}>{c.debt ? money(c.debt) : "без долга"}</span>
          </div>
          <div className="flex justify-between mt-1" style={{ fontSize: 11, color: "var(--muted)" }}>
            <span>{MG.tpById[c.tp].name}</span>
            <span>{c.overdue ? "просрочка " + c.overdue + " дн." : c.debt ? "в срок" : ""}</span>
          </div>
        </MgCard>
      ))}
      </div>
      {open && (
        <Modal title={open.name} onClose={() => setOpen(null)} wide>
          <MgRow l="Адрес" v={open.addr} />
          <MgRow l="Телефон" v={open.phone} />
          <MgRow l="GPS" v={open.gps} />
          <MgRow l="Торговый представитель" v={MG.tpById[open.tp].name} />
          <MgRow l="Супервайзер" v={MG.supervisors.find((s) => s.id === open.sv).name} />
          <MgRow l="Долг" v={money(open.debt)} strong />
          <MgRow l="Просрочка" v={open.overdue ? open.overdue + " дн." : "нет"} color={open.overdue ? "var(--red)" : "#127A33"} />
          <MgRow l="Последний заказ" v={open.lastOrder + " дн. назад"} />
          <MgRow l="Средний заказ" v={money(open.avgOrder)} />
          <MgRow l="Продажи за месяц" v={money(open.monthSales)} />
          <MgRow l="Возвраты" v={money(open.ret)} />
          <MgRow l="SKU" v={open.sku} />
          {R.fin === "full" && <MgRow l="Валовая прибыль за месяц" v={money(Math.round(open.monthSales * open.margin))} />}
          {(R.fin === "full" || R.fin === "margin") && <MgRow l="Маржа" v={fp(open.margin * 100)} />}
          <MgLabel>История визитов</MgLabel>
          {open.visits.map((v, i) => <MgRow key={i} l={v.d} v={v.ok ? "заказ " + money(v.sum) : "без заказа"} color={v.ok ? "var(--ink)" : "var(--muted)"} />)}
        </Modal>
      )}
    </div>
  );
}

function MgFinance({ role, cur, prev, rg, addAudit }) {
  const fin = MG_ROLES[role].fin;
  useEffect(() => { addAudit(MG_ROLES[role].person, "Открыт финансовый раздел", "Финансы", dmy(rg.from) + " — " + dmy(rg.to)); }, []);
  const recv = MG.clients.reduce((s, c) => s + c.debt, 0);
  const pay = MG.payables.reduce((s, p) => s + p.sum, 0);
  return (
    <div>
      <div className="kz-cols2">
      <div>
      {fin === "full" && (
        <MgCard>
          <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>P&L — отчёт о прибылях и убытках</p>
          <MgRow l="Выручка" v={money(Math.round(cur.netRev))} strong />
          <MgRow l="− Себестоимость" v={money(Math.round(cur.cogs))} />
          <MgRow l="= Валовая прибыль" v={money(Math.round(cur.gross))} strong color="#127A33" />
          <MgRow l="Валовая маржа" v={fp(cur.margin)} />
          {cur.opexBy.map(([k, v]) => <MgRow key={k} l={"− " + k} v={money(Math.round(v))} />)}
          <MgRow l="= Операционная прибыль (EBITDA)" v={money(Math.round(cur.ebitda))} strong />
          <MgRow l="− Налоги" v={money(Math.round(cur.tax))} />
          <MgRow l="= Чистая прибыль" v={money(Math.round(cur.net))} strong color={cur.net >= 0 ? "#127A33" : "var(--red)"} />
          <MgRow l="Чистая рентабельность" v={fp(cur.netMargin)} />
          <div className="mt-2"><MgDelta cur={cur.net} prev={prev.net} /> <span style={{ fontSize: 10.5, color: "var(--muted)" }}>к прошлому периоду</span></div>
          <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.4 }}>Статьи расходов и ставка налога — демо. Точная структура утверждается с бухгалтером 1С.</p>
        </MgCard>
      )}
      {fin === "cash" && (
        <MgCard>
          <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Расходы по статьям</p>
          {cur.opexBy.map(([k, v]) => <MgRow key={k} l={k} v={money(Math.round(v))} />)}
        </MgCard>
      )}
      </div>
      <div>
      <MgCard>
        <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Движение денег</p>
        <MgRow l="Поступило за период" v={money(Math.round(cur.cash))} strong />
        <MgRow l="Касса (наличные)" v={money(Math.round(cur.cash * 0.38))} />
        <MgRow l="Банк" v={money(Math.round(cur.cash * 0.62))} />
        <MgRow l="Расходы за период" v={money(Math.round(cur.opex))} />
        <MgRow l="Закуп (оплачено поставщикам)" v={money(Math.round(cur.cogs * 0.93))} />
      </MgCard>
      <MgCard>
        <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Дебиторка и кредиторка</p>
        <MgRow l="Нам должны клиенты" v={shortMoney(recv)} />
        <MgRow l="Мы должны поставщикам" v={shortMoney(pay)} />
        {MG.payables.map((p) => <MgRow key={p.name} l={p.name} v={shortMoney(p.sum) + " · " + p.due + " дн."} />)}
      </MgCard>
      </div>
      </div>
    </div>
  );
}

function MgCashHome(props) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MgKpi label="Поступило денег" value={shortMoney(props.cur.cash)} cur={props.cur.cash} prev={props.prev.cash} />
        <MgKpi label="Расходы" value={shortMoney(props.cur.opex)} cur={props.cur.opex} prev={props.prev.opex} invert />
        <MgKpi label="Дебиторка" value={shortMoney(MG.clients.reduce((s, c) => s + c.debt, 0))} onClick={() => props.go("clients")} />
        <MgKpi label="Кредиторка" value={shortMoney(MG.payables.reduce((s, p) => s + p.sum, 0))} />
      </div>
      <MgFinance {...props} />
    </div>
  );
}

function MgProblems({ problems, go }) {
  const title = { red: "Критично", yellow: "Требует внимания", green: "В норме" };
  return (
    <div>
      {["red", "yellow", "green"].map((g) => {
        const l = problems.filter((p) => p.lvl === g);
        if (!l.length) return null;
        return (
          <div key={g}>
            <MgLabel color={LVL[g].fg}>{title[g]} · {l.length}</MgLabel>
            {l.map((p, i) => <MgProblemRow key={i} p={p} onGo={go} />)}
          </div>
        );
      })}
    </div>
  );
}

