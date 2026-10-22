// Sapar Trade — прототип. Модуль: Система управления: KPI-плитки, графики, бары, экспорт CSV
// Строки 3046–3142 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ---------- small UI parts ---------- */
const MgCard = ({ children, style, onClick }) => (
  <div onClick={onClick} className="rounded-2xl p-3.5 mb-3" style={{ background: "#fff", border: "1px solid var(--line)", cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>
);
const MgLabel = ({ children, color }) => (
  <p style={{ fontSize: 11.5, color: color || "var(--muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, margin: "14px 0 6px" }}>{children}</p>
);
const MgRow = ({ l, v, strong, color }) => (
  <div className="flex justify-between py-1.5" style={{ borderBottom: "1px dashed var(--line)", gap: 8 }}>
    <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{l}</span>
    <span className="font-mono-kz" style={{ fontSize: 12.5, fontWeight: strong ? 800 : 700, color: color || "var(--ink)", textAlign: "right" }}>{v}</span>
  </div>
);
function MgDelta({ cur, prev, invert }) {
  if (!prev) return <span style={{ fontSize: 10.5, color: "var(--muted)" }}>нет данных для сравнения</span>;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  const good = invert ? d <= 0 : d >= 0;
  return (
    <span className="font-mono-kz" style={{ fontSize: 10.5, fontWeight: 700, color: good ? "#127A33" : "var(--red)" }}>
      {d >= 0 ? "▲ +" : "▼ "}{fp(d)} <span style={{ color: "var(--muted)", fontWeight: 500 }}>({shortMoney(cur - prev).replace("-", "−")})</span>
    </span>
  );
}
function MgKpi({ label, value, cur, prev, invert, onClick, accent, noMoneyDelta }) {
  return (
    <div onClick={onClick} className="rounded-2xl p-3" style={{ background: "#fff", border: "1px solid " + (accent || "var(--line)"), cursor: onClick ? "pointer" : "default" }}>
      <p style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, lineHeight: 1.25 }}>{label}</p>
      <p className="font-mono-kz" style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", margin: "4px 0 2px", wordBreak: "break-word" }}>{value}</p>
      {prev !== undefined && (noMoneyDelta
        ? <span className="font-mono-kz" style={{ fontSize: 10.5, fontWeight: 700, color: (invert ? cur <= prev : cur >= prev) ? "#127A33" : "var(--red)" }}>{cur >= prev ? "▲ +" : "▼ "}{fp(cur - prev)} п.п.</span>
        : <MgDelta cur={cur} prev={prev} invert={invert} />)}
    </div>
  );
}
function MgBar({ value, max = 100, color = "var(--navy)" }) {
  return (
    <div className="rounded-full overflow-hidden" style={{ height: 7, background: "#EEF0FF" }}>
      <div style={{ width: Math.max(0, Math.min(100, (value / max) * 100)) + "%", height: "100%", background: color, borderRadius: 99 }} />
    </div>
  );
}
function MgTrend({ data, color = "#1B1464" }) {
  if (!data.length) return null;
  const W = 320, H = 100, p = 6;
  const max = Math.max(...data.map((d) => d.v), 1), min = Math.min(...data.map((d) => d.v), 0);
  const pts = data.map((d, i) => [data.length > 1 ? p + (i / (data.length - 1)) * (W - p * 2) : W / 2, H - p - ((d.v - min) / (max - min || 1)) * (H - p * 2)]);
  const line = pts.map((x) => x.join(",")).join(" ");
  const every = Math.ceil(data.length / 6);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100" preserveAspectRatio="none">
        <polygon points={`${pts[0][0]},${H} ${line} ${pts[pts.length - 1][0]},${H}`} fill={color} opacity="0.08" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex justify-between">
        {data.map((d, i) => (i % every === 0 || i === data.length - 1) ? <span key={i} className="font-mono-kz" style={{ fontSize: 9, color: "var(--muted)" }}>{d.label}</span> : null)}
      </div>
    </div>
  );
}
function MgPeriodBar({ period, setPeriod, custom, setCustom }) {
  return (
    <div className="mb-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {MG_PERIODS.map(([id, l]) => (
          <button key={id} onClick={() => setPeriod(id)} className="shrink-0 px-3 py-1.5 rounded-full font-semibold"
            style={{ fontSize: 11.5, background: period === id ? "var(--navy)" : "#F2F1F8", color: period === id ? "#fff" : "var(--ink)" }}>{l}</button>
        ))}
      </div>
      {period === "custom" && (
        <div className="flex gap-2 mt-2">
          <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="font-mono-kz flex-1 px-3 py-2 rounded-xl" style={{ border: "1px solid var(--line)", fontSize: 12 }} />
          <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="font-mono-kz flex-1 px-3 py-2 rounded-xl" style={{ border: "1px solid var(--line)", fontSize: 12 }} />
        </div>
      )}
    </div>
  );
}
const LVL = { red: { bg: "#FCE7E6", fg: "#B3261E", dot: "#E2231A" }, yellow: { bg: "#FFF6DE", fg: "#8A5A00", dot: "#F5A300" }, green: { bg: "#E4F7E9", fg: "#127A33", dot: "#1FA854" } };
function MgProblemRow({ p, onGo }) {
  const s = LVL[p.lvl];
  return (
    <button onClick={() => onGo && onGo(p.tab)} className="w-full text-left rounded-xl px-3 py-2.5 mb-2 flex items-center gap-2.5" style={{ background: s.bg }}>
      <span className="rounded-full shrink-0" style={{ width: 9, height: 9, background: s.dot, display: "inline-block" }} />
      <span style={{ fontSize: 12.5, color: s.fg, fontWeight: 600, flex: 1 }}>{p.text}</span>
    </button>
  );
}

function downloadCsv(name, rows) {
  const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

