// Sapar Trade — система управления. Модуль: Экспедиторы — водители на карте, сигнал, маршрут за день
// Данные: /api/fleet/live (раз в 15 с) и /api/fleet/track. Координаты передаёт телефон водителя во время рейса.

function MgFleet({ session, authLost }) {
  const live = useLive(session, "/api/fleet/live", authLost, 15000);
  const { L, failed } = useLeaflet();
  const [focus, setFocus] = useState(null);
  const [date, setDate] = useState(stToday());
  const track = useFleetTrack(session, focus, date, authLost);
  const bp = useBreakpoint();
  const drivers = live.data ? live.data.drivers : [];
  const sel = drivers.find((d) => d.id === focus) || null;
  const count = (st) => drivers.filter((d) => d.status === st).length;
  const pick = (id) => { setFocus(id === focus ? null : id); setDate(stToday()); };

  if (!live.data) return <LiveState loading={live.loading} error={live.error} onRetry={live.reload} />;
  if (!drivers.length) return (
    <MgCard>
      <p style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>Водителей пока нет</p>
      <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
        Создайте сотрудников с ролью «Водитель-экспедитор» (Система → Сотрудники) и выдайте им логин и пароль.
        Водитель открывает сайт на телефоне → «Водитель-экспедитор» → «Начать рейс» — и появляется здесь на карте.
      </p>
    </MgCard>
  );
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <Badge bg="#E3F5E9" fg="#127A33">В рейсе: {drivers.filter((d) => d.inTrip).length}</Badge>
        {count("lost") > 0 && <Badge bg="#FCE7E6" fg="#B3261E">Нет сигнала: {count("lost")}</Badge>}
        {count("late") > 0 && <Badge bg="#FFF6DE" fg="#8A5A00">Сигнал запаздывает: {count("late")}</Badge>}
        <Badge bg="#F2F1F8" fg="var(--muted)">Обновлено {fleetTime(live.data.at)}</Badge>
      </div>

      {failed
        ? <MgCard><p style={{ fontSize: 12.5, color: "var(--muted)" }}>Карта не загрузилась (нет связи с OpenStreetMap). Список водителей ниже работает.</p></MgCard>
        : L ? <FleetMap L={L} drivers={drivers} track={sel && track.data ? track.data.points : null} focus={focus} onPick={pick} height={bp === "desktop" ? 460 : 330} />
          : <div className="rounded-2xl flex items-center justify-center" style={{ height: 200, background: "#F3F6FB", border: "1px solid var(--line)" }}><p style={{ fontSize: 12.5, color: "var(--muted)" }}>Загрузка карты…</p></div>}

      {sel && <FleetDriverDetail d={sel} date={date} setDate={setDate} track={track} onClose={() => setFocus(null)} />}

      <MgLabel>Водители</MgLabel>
      {drivers.map((d) => <FleetDriverRow key={d.id} d={d} on={d.id === focus} onClick={() => pick(d.id)} />)}
      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
        Место передаётся только во время рейса и только пока у водителя открыта страница рейса. «Нет сигнала» — в рейсе, но точек нет больше 5 минут
        (свернул браузер, заблокировал экран или нет интернета).
      </p>
    </div>
  );
}

// Маршрут выбранного водителя за день; за сегодня — обновляется раз в 30 с
function useFleetTrack(session, driver, date, authLost) {
  const [st, setSt] = useState({ data: null, error: null, loading: false });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!driver || date !== stToday()) return undefined;
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, [driver, date]);
  useEffect(() => {
    if (!driver) { setSt({ data: null, error: null, loading: false }); return undefined; }
    let alive = true;
    setSt((s) => ({ data: s.data && s.data.driver.id === driver && s.data.date === date ? s.data : null, error: null, loading: true }));
    stApi("/api/fleet/track?" + stQs({ driver, date }), { token: session.token })
      .then((data) => alive && setSt({ data, error: null, loading: false }))
      .catch((e) => { if (!alive) return; if (e.status === 401) authLost(e.message); setSt({ data: null, error: e.message, loading: false }); });
    return () => { alive = false; };
  }, [driver, date, tick]);
  return st;
}

function FleetDriverRow({ d, on, onClick }) {
  const [label, fg, bg] = FLEET_STATUS[d.status];
  return (
    <MgCard onClick={onClick} style={{ border: on ? "1.5px solid var(--navy)" : undefined }}>
      <div className="flex items-center gap-3" data-testid="fleet-driver">
        <div className="rounded-full flex items-center justify-center shrink-0" style={{ width: 38, height: 38, background: FLEET_PIN[d.status], color: "#fff", fontWeight: 800, fontSize: 13 }}>{fleetInitials(d.name)}</div>
        <div className="flex-1 min-w-0">
          <p className="truncate" style={{ fontSize: 13.5, fontWeight: 700 }}>{d.name}</p>
          <p className="truncate" style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {d.inTrip ? "В рейсе с " + fleetTime(d.tripStartedAt) + " · " + fleetKm(d.tripKm) : "Сегодня " + fleetKm(d.kmToday)}
            {d.last && d.last.speedKmh !== null && d.inTrip ? " · " + d.last.speedKmh + " км/ч" : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <Badge bg={bg} fg={fg}>{label}</Badge>
          <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>{d.last ? fleetAge(d.ageSec) : "точек нет"}</p>
        </div>
      </div>
    </MgCard>
  );
}

function FleetDriverDetail({ d, date, setDate, track, onClose }) {
  const t = track.data;
  return (
    <MgCard style={{ marginTop: 12 }}>
      <div className="flex items-center justify-between mb-2" style={{ gap: 8 }}>
        <p style={{ fontSize: 14, fontWeight: 800 }}>Маршрут: {d.name}</p>
        <button onClick={onClose} className="p-1.5 rounded-full" title="Показать всех" style={{ background: "#F2F1F8" }}><Ico name="x" size={14} /></button>
      </div>
      <label style={{ fontSize: 12, color: "var(--muted)" }}>Дата{" "}
        <input type="date" value={date} max={stToday()} onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-lg px-2 py-1 ml-1" style={{ border: "1px solid var(--line)", fontSize: 12.5 }} />
      </label>
      {track.loading && !t && <LiveState loading />}
      {track.error && <LiveState error={track.error} />}
      {t && (
        <div className="mt-2">
          <MgRow l="Пройдено за день" v={fleetKm(t.km)} strong />
          <MgRow l="Рейсов" v={String(t.trips.length)} />
          {t.trips.map((x, i) => <MgRow key={x.id} l={"Рейс " + (i + 1)} v={fleetTime(x.startedAt) + " – " + (x.endedAt ? fleetTime(x.endedAt) : "идёт") + " · " + fleetKm(x.km)} />)}
          <MgRow l="Точек на карте" v={String(t.points.length)} />
          {!t.points.length && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>За этот день точек нет.</p>}
        </div>
      )}
    </MgCard>
  );
}
