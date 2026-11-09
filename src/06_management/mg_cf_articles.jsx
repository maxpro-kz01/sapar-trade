// Sapar Trade — система управления. Модуль: статьи движения денег — к какой группе относится каждая (только владелец)
// От группы зависит, что считается расходом. Выбор владельца сохраняется и больше не меняется автоматически.

function MgCfArticles({ session, authLost, showToast }) {
  const [open, setOpen] = useState(false);
  return (
    <MgCard>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between" style={{ gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800 }}>Статьи движения денег</span>
        <span style={{ fontSize: 12, color: "var(--navy)", fontWeight: 700 }}>{open ? "Скрыть" : "Настроить"}</span>
      </button>
      <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>Какие статьи из 1С считаются расходами, а какие — переводами, оплатой поставщикам или займами.</p>
      {open && <MgCfArticleList session={session} authLost={authLost} showToast={showToast} />}
    </MgCard>
  );
}

function MgCfArticleList({ session, authLost, showToast }) {
  const r = useLive(session, "/api/cf-articles", authLost);
  const [busy, setBusy] = useState(null);
  if (!r.data) return <LiveState {...r} onRetry={r.reload} />;
  const { groups, items } = r.data;
  const save = async (article, grp) => {
    setBusy(article);
    try { await stApi("/api/cf-articles", { method: "PUT", token: session.token, body: { article, grp } }); showToast("Сохранено"); r.reload(); }
    catch (e) { showToast(e.message); } finally { setBusy(null); }
  };
  if (!items.length) return <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Статьи ещё не загружены из 1С — обновите агент на сервере 1С.</p>;
  return (
    <div className="mt-2">
      {items.map((a) => (
        <div key={a.article} className="py-2" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="flex-1 min-w-0" style={{ fontSize: 12.5, fontWeight: 700 }}>
              {a.article || "(без статьи)"} {a.isNew && <Badge bg="#FFF6DE" fg="#8A5A00">новая</Badge>}
            </p>
            <select value={a.grp} disabled={busy === a.article} onChange={(e) => save(a.article, e.target.value)}
              className="rounded-lg px-2 py-1.5" style={{ border: "1.5px solid " + (a.manual ? "var(--navy)" : "var(--line)"), fontSize: 12, background: "#fff", maxWidth: "100%" }}>
              {Object.entries(groups).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <p className="font-mono-kz" style={{ fontSize: 10.5, color: "var(--muted)" }}>
            30 дней: {a.in30 ? "+" + shortMoney(a.in30) : ""}{a.in30 && a.out30 ? " / " : ""}{a.out30 ? "−" + shortMoney(a.out30) : ""}{!a.in30 && !a.out30 ? "движения нет" : ""}
            {a.manual ? " · выбрано вручную" : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
