// GPS в фоне: личные ключи водителей для приложения Traccar Client (ТЗ_GPS_TRACCAR).
// Видят и выпускают роли с правом «Сотрудники» (владелец, директор).

function LiveGpsKeys({ session, showToast }) {
  const r = useLive(session, "/api/fleet/gps-keys");
  const [busy, setBusy] = useState(0);
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); showToast(what + " скопирован"); } catch (e) { showToast("Выделите и скопируйте вручную"); }
  };
  const issue = async (d) => {
    if (d.key && !window.confirm("Выпустить новый ключ? Старый перестанет работать — приложение у водителя придётся перенастроить.")) return;
    setBusy(d.id);
    try {
      await stApi("/api/fleet/gps-keys/" + d.id, { method: "POST", token: session.token });
      showToast("Ключ выпущен"); r.reload();
    } catch (e) { showToast(e.message); }
    setBusy(0);
  };
  if (!r.data) return r.loading ? null : null;
  if (!r.data.items.length) return null;
  return (
    <div className="mt-5">
      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 2 }}>GPS водителей в фоне</p>
      <p style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>
        Водитель ставит бесплатное приложение Traccar Client (Android), вводит «Идентификатор устройства» = ключ и «Адрес сервера» ниже. Тогда место передаётся и при выключенном экране. На iPhone надёжнее страница рейса на сайте.
      </p>
      <MgCard>
        <div className="py-2" style={{ borderBottom: "1px solid var(--line)" }}>
          <p style={{ fontSize: 11, color: "var(--muted)" }}>Адрес сервера</p>
          <div className="flex items-center gap-2">
            <p className="font-mono-kz flex-1 min-w-0" style={{ fontSize: 12, color: "var(--ink)", wordBreak: "break-all" }}>{r.data.url}</p>
            <GhostButton small onClick={() => copy(r.data.url, "Адрес")}>Копировать</GhostButton>
          </div>
        </div>
        {r.data.items.map((d) => (
          <div key={d.id} className="py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{d.name}</p>
            {d.key ? (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-mono-kz flex-1 min-w-0" style={{ fontSize: 12.5, color: "var(--ink)" }}>{d.key}</p>
                <GhostButton small onClick={() => copy(d.key, "Ключ")}>Копировать</GhostButton>
                <GhostButton small disabled={busy === d.id} onClick={() => issue(d)}>Заменить</GhostButton>
              </div>
            ) : (
              <GhostButton small disabled={busy === d.id} onClick={() => issue(d)}>Выпустить ключ</GhostButton>
            )}
          </div>
        ))}
      </MgCard>
    </div>
  );
}
