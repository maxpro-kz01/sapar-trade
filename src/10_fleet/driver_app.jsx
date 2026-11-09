// Sapar Trade — GPS экспедиторов. Модуль: экран водителя-экспедитора (личный логин)
// «Начать рейс» → телефон передаёт место, пока страница открыта; «Завершить рейс» → передача прекращается.

function DriverApp({ session, setSession, onExit }) {
  const [toast, setToast] = useState(null);
  const [pwd, setPwd] = useState(false);
  const [trip, setTrip] = useState(undefined); // undefined — ещё не знаем, null — рейса нет
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const authLost = (msg) => onExit(msg || "Сессия завершена, войдите снова");
  const gps = useGpsTracker(session, !!trip, { onAuthLost: authLost, onTripGone: () => { setTrip(null); showToast("Рейс завершён"); } });

  const load = () => {
    setErr("");
    stApi("/api/fleet/trip", { token: session.token })
      .then((r) => setTrip(r.trip)) // открытый рейс продолжается после перезагрузки страницы
      .catch((e) => { if (e.status === 401) authLost(e.message); else { setErr(e.message); setTrip(null); } });
  };
  useEffect(load, []);
  useEffect(() => { if (!trip) return undefined; const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, [trip]);

  const start = async () => {
    setBusy(true); setErr("");
    try {
      const r = await stApi("/api/fleet/trip/start", { method: "POST", token: session.token });
      setTrip(r.trip); setNow(Date.now());
      showToast(r.resumed ? "Рейс продолжается" : "Рейс начат");
    } catch (e) { if (e.status === 401) authLost(e.message); else setErr(e.message); } finally { setBusy(false); }
  };
  const end = async () => {
    if (!window.confirm("Завершить рейс? Передача места прекратится.")) return false;
    setBusy(true); setErr("");
    try {
      const left = await gps.flushAll();
      const r = await stApi("/api/fleet/trip/end", { method: "POST", token: session.token });
      setTrip(null);
      showToast("Рейс завершён · " + fleetKm(r.trip.km) + (left ? " · не отправлено точек: " + left : ""));
      return true;
    } catch (e) {
      if (e.status === 401) authLost(e.message);
      else if (e.status === 400) { setTrip(null); return true; } // уже закрыт
      else setErr(e.message);
      return false;
    } finally { setBusy(false); }
  };
  const exit = async () => { if (trip && !(await end())) return; onExit(); };

  const onTrip = !!trip;
  const km = gps.km !== null ? gps.km : trip ? trip.km : 0;
  return (
    <div className="relative h-full flex flex-col kz-app" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="px-5 pb-2 flex items-center gap-2 kz-head">
        <div className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 32, height: 32, background: "#fff", border: "1px solid var(--line)" }}><Logo size={24} /></div>
        <div className="flex-1 min-w-0">
          <p className="font-display truncate" style={{ fontSize: 13.5, fontWeight: 800 }}>Рейс</p>
          <p className="truncate" style={{ fontSize: 10, color: "var(--muted)" }}>{session.user.name} · {LIVE_ROLES[session.user.role] || session.user.role}</p>
        </div>
        <button onClick={() => setPwd(true)} title="Сменить пароль" className="p-2 rounded-full" style={{ background: "#F2F1F8" }}><Ico name="settings" size={15} /></button>
        <button onClick={exit} title="Выйти" className="p-2 rounded-full" style={{ background: "#FCE7E6" }}><Ico name="log-out" size={15} color="var(--red)" /></button>
      </div>
      <div className="flex-1 overflow-y-auto pb-10 px-5 pt-2 font-body kz-main kz-narrow">
        {trip === undefined && <LiveState loading />}
        {trip !== undefined && (
          <>
            <div className="rounded-2xl p-5 mb-3 text-center" data-testid="trip-card" style={{ background: onTrip ? "#E3F5E9" : "#fff", border: "1px solid " + (onTrip ? "#BFE6CB" : "var(--line)") }}>
              <div className="mx-auto mb-3 rounded-full flex items-center justify-center" style={{ width: 72, height: 72, background: onTrip ? "#1FA854" : "#F2F1F8" }}>
                <Ico name="map-pin" size={32} color={onTrip ? "#fff" : "var(--muted)"} />
              </div>
              <p className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>{onTrip ? "Рейс идёт" : "Рейс не начат"}</p>
              <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
                {onTrip ? "Место передаётся каждые 30 секунд" : "Место передаётся только во время рейса"}
              </p>
              {onTrip && (
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <DriverStat label="В рейсе" value={fleetDuration(now - new Date(trip.startedAt).getTime())} />
                  <DriverStat label="Пройдено" value={fleetKm(km)} />
                </div>
              )}
            </div>

            {onTrip && <DriverGpsPanel gps={gps} />}
            {err && <p style={{ fontSize: 12.5, color: "var(--red)", fontWeight: 600, margin: "8px 0" }}>{err}</p>}

            {onTrip
              ? <button onClick={end} disabled={busy} className="w-full rounded-2xl py-4 font-bold press-98" style={{ background: busy ? "#C9C7D6" : "var(--red)", color: "#fff", fontSize: 15 }}>{busy ? "Подождите…" : "Завершить рейс"}</button>
              : <button onClick={start} disabled={busy} className="w-full rounded-2xl py-4 font-bold press-98" style={{ background: busy ? "#C9C7D6" : "#1FA854", color: "#fff", fontSize: 15 }}>{busy ? "Подождите…" : "Начать рейс"}</button>}

            <div className="rounded-2xl p-3.5 mt-4" style={{ background: "#FFF6DE" }}>
              <p style={{ fontSize: 12, color: "#8A5A00", lineHeight: 1.5 }}>
                <b>Важно:</b> во время рейса не закрывайте эту страницу и не блокируйте экран — иначе телефон перестаёт передавать место.
                Держите телефон на зарядке. Без интернета точки сохраняются и отправятся, когда связь появится.
              </p>
            </div>
          </>
        )}
      </div>
      {pwd && <LivePasswordModal session={session} onClose={() => setPwd(false)}
        onChanged={(token) => { setSession({ ...session, token }); setPwd(false); showToast("Пароль изменён"); }} />}
      <Toast toast={toast} />
    </div>
  );
}

const DriverStat = ({ label, value }) => (
  <div className="rounded-xl py-2.5" style={{ background: "#fff" }}>
    <p style={{ fontSize: 11, color: "var(--muted)" }}>{label}</p>
    <p className="font-mono-kz" style={{ fontSize: 15, fontWeight: 800 }}>{value}</p>
  </div>
);

function DriverGpsPanel({ gps }) {
  const warn = [];
  if (gps.perm === "denied") warn.push("Доступ к местоположению запрещён. Разрешите его для этого сайта в настройках браузера и обновите страницу.");
  if (gps.perm === "unsupported") warn.push("Этот браузер не умеет определять место. Откройте сайт в Chrome или Safari.");
  if (gps.perm === "error") warn.push("Телефон не может определить место. Включите геолокацию (GPS) в настройках телефона.");
  if (!gps.online) warn.push("Нет интернета — точки сохраняются на телефоне и уйдут позже.");
  if (gps.wake === false) warn.push("Не удалось запретить экрану гаснуть — не блокируйте телефон во время рейса.");
  if (gps.sendError && gps.online) warn.push("Не отправилось: " + gps.sendError);
  const acc = gps.fix && gps.fix.acc;
  return (
    <MgCard>
      <MgRow l="Точность GPS" v={gps.perm === "wait" ? "ищем спутники…" : acc == null ? "—" : "± " + acc + " м"} color={acc != null && acc > 100 ? "#8A5A00" : undefined} />
      <MgRow l="Отправлено" v={gps.lastSentAt ? fleetTime(gps.lastSentAt) : "ещё нет"} />
      <MgRow l="Ждут отправки" v={String(gps.queued)} color={gps.queued > 10 ? "#8A5A00" : undefined} />
      {warn.map((w) => <p key={w} style={{ fontSize: 12, color: "#B3261E", fontWeight: 600, marginTop: 8, lineHeight: 1.45 }}>{w}</p>)}
    </MgCard>
  );
}
