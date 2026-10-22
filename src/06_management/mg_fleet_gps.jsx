// Sapar Trade — прототип. Модуль: GPS-карта экспедиторов (Leaflet/OSM) + передача GPS водителем
// Строки 3168–3434 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ---------- GPS-мониторинг экспедиторов (владелец и директор) ---------- */
// Демо: позиции рассчитываются по плановому маршруту и времени. На рабочей версии
// приложение водителя отправляет координаты на сервер каждые 30–60 сек (только в
// рабочее время), а эта карта получает их с сервера.
const KZO_CENTER = [44.8465, 65.4935];
const KZO_WAREHOUSE = { name: "Склад Sapar Trade", addr: "г. Кызылорда, ул. Бокейхана, 2", lat: 44.8362, lng: 65.5138 };
const FLEET_COLORS = ["#1B1464", "#E2231A", "#0B8A5A", "#C27A00"];

const FLEET = (() => {
  const r = mkRng(4412);
  const base = [
    { id: "dr1", name: "Серик Алимов", car: "Isuzu · 777 ABZ 11", phone: "+7 701 411 22 10", start: [8, 40] },
    { id: "dr2", name: "Бауржан Нуров", car: "Hyundai Porter · 512 KLM 11", phone: "+7 705 318 40 77", start: [9, 30] },
    { id: "dr3", name: "Ерболат Сарсенов", car: "Газель Next · 245 AAB 11", phone: "+7 747 902 15 36", start: [10, 15] },
  ];
  return base.map((d, i) => {
    const stops = MG.clients.filter((_, k) => k % base.length === i).slice(0, 6).map((c) => {
      const [la, ln] = c.gps.split(",").map(Number);
      return { name: c.name, addr: c.addr, lat: la, lng: ln, dwell: 20 + Math.floor(r() * 16) };
    });
    return { ...d, color: FLEET_COLORS[i], stops, speed: 24 + r() * 8, lostSignal: i === 2 };
  });
})();

function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLa = (b.lat - a.lat) * rad, dLn = (b.lng - a.lng) * rad;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Позиция водителя на момент t (мс) по плану: склад → точки → склад.
function fleetState(d, t) {
  const pts = [KZO_WAREHOUSE, ...d.stops, KZO_WAREHOUSE];
  let clock = sod(new Date(t)).getTime() + (d.start[0] * 60 + d.start[1]) * 60000;
  const track = [[KZO_WAREHOUSE.lat, KZO_WAREHOUSE.lng]];
  let km = 0;
  if (t < clock) return { status: "wait", pos: KZO_WAREHOUSE, track, km: 0, done: 0, speed: 0, eta: new Date(clock) };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dist = haversineKm(a, b) * 1.3; // по дорогам длиннее, чем по прямой
    const legMs = (dist / d.speed) * 3600000;
    if (t < clock + legMs) {
      const f = (t - clock) / legMs;
      const pos = { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
      track.push([pos.lat, pos.lng]);
      return { status: i === pts.length - 1 ? "return" : "drive", pos, track, km: km + dist * f, done: i - 1, speed: Math.round(d.speed + Math.sin(t / 20000) * 5), legTo: b, eta: new Date(clock + legMs) };
    }
    clock += legMs; km += dist; track.push([b.lat, b.lng]);
    if (i === pts.length - 1) break;
    const dwellMs = b.dwell * 60000;
    if (t < clock + dwellMs) return { status: "stop", pos: b, track, km, done: i - 1, speed: 0, at: b, since: new Date(clock) };
    clock += dwellMs;
  }
  return { status: "back", pos: KZO_WAREHOUSE, track, km, done: d.stops.length, speed: 0 };
}

const FLEET_STATUS = {
  wait: ["Ещё не выехал", "#77748C"], drive: ["В пути", "#0B5A8A"], stop: ["На точке", "#8A5A00"],
  return: ["Возвращается на склад", "#0B5A8A"], back: ["Рейс завершён", "#127A33"], lost: ["Нет сигнала", "#B3261E"],
};

function useLeaflet() {
  const [L, setL] = useState(window.L || null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (window.L) { setL(window.L); return; }
    if (!document.getElementById("leaflet-css")) {
      const l = document.createElement("link"); l.id = "leaflet-css"; l.rel = "stylesheet";
      l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(l);
    }
    let s = document.getElementById("leaflet-js");
    if (!s) { s = document.createElement("script"); s.id = "leaflet-js"; s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; document.head.appendChild(s); }
    const ok = () => setL(window.L); const bad = () => setFailed(true);
    s.addEventListener("load", ok); s.addEventListener("error", bad);
    const to = setTimeout(() => { if (!window.L) setFailed(true); }, 9000);
    return () => { s.removeEventListener("load", ok); s.removeEventListener("error", bad); clearTimeout(to); };
  }, []);
  return { L, failed };
}

function FleetLeafletMap({ L, items, focus, onPick, height = 330 }) {
  const box = useRef(null), map = useRef(null), layer = useRef(null);
  useEffect(() => {
    if (!L || !box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(KZO_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    L.marker([KZO_WAREHOUSE.lat, KZO_WAREHOUSE.lng], { icon: L.divIcon({ className: "", html: '<div style="width:26px;height:26px;border-radius:8px;background:#161327;color:#fff;font:700 12px Manrope,sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">С</div>', iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .addTo(m).bindTooltip(KZO_WAREHOUSE.name);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    setTimeout(() => m.invalidateSize(), 250);
    return () => { m.remove(); map.current = null; layer.current = null; };
  }, [L]);
  useEffect(() => {
    if (!L || !layer.current) return;
    const g = layer.current; g.clearLayers();
    items.forEach(({ d, s, lost }) => {
      const show = !focus || focus === d.id;
      const col = lost ? "#9A97AE" : d.color;
      L.polyline([[KZO_WAREHOUSE.lat, KZO_WAREHOUSE.lng], ...d.stops.map((p) => [p.lat, p.lng]), [KZO_WAREHOUSE.lat, KZO_WAREHOUSE.lng]], { color: col, weight: 2, opacity: show ? 0.35 : 0.1, dashArray: "5 6" }).addTo(g);
      L.polyline(s.track, { color: col, weight: 4, opacity: show ? 0.9 : 0.2 }).addTo(g);
      d.stops.forEach((p, k) => {
        L.circleMarker([p.lat, p.lng], { radius: 5, color: "#fff", weight: 1.5, fillColor: k < s.done ? "#1FA854" : col, fillOpacity: show ? 0.95 : 0.25 }).addTo(g).bindTooltip((k + 1) + ". " + p.name);
      });
      const ini = d.name.split(" ").map((x) => x[0]).join("");
      L.marker([s.pos.lat, s.pos.lng], { zIndexOffset: 1000, icon: L.divIcon({ className: "", html: '<div style="width:34px;height:34px;border-radius:50%;background:' + col + ';color:#fff;font:800 12px Manrope,sans-serif;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);opacity:' + (show ? 1 : 0.45) + '">' + ini + "</div>", iconSize: [34, 34], iconAnchor: [17, 17] }) })
        .addTo(g).on("click", () => onPick(d.id));
    });
  }, [L, items, focus]);
  useEffect(() => {
    if (!map.current) return;
    const it = items.find((x) => x.d.id === focus);
    if (it) map.current.flyTo([it.s.pos.lat, it.s.pos.lng], 15, { duration: 0.6 });
    else map.current.flyTo(KZO_CENTER, 13, { duration: 0.6 });
  }, [focus]);
  useEffect(() => { if (map.current) setTimeout(() => map.current.invalidateSize(), 50); }, [height]);
  return <div ref={box} style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", position: "relative", zIndex: 0, border: "1px solid var(--line)" }} />;
}

// Запасная схема, если карта не загрузилась (нет интернета)
function FleetSchemeMap({ items, focus, onPick, height = 230 }) {
  const all = [KZO_WAREHOUSE, ...items.flatMap(({ d }) => d.stops)];
  const la = all.map((p) => p.lat), ln = all.map((p) => p.lng);
  const b = { a: Math.min(...la) - 0.004, z: Math.max(...la) + 0.004, c: Math.min(...ln) - 0.006, d: Math.max(...ln) + 0.006 };
  const X = (p) => 10 + ((p.lng - b.c) / (b.d - b.c)) * 300, Y = (p) => 10 + (1 - (p.lat - b.a) / (b.z - b.a)) * 210;
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#F3F6FB", border: "1px solid var(--line)" }}>
      <svg viewBox="0 0 320 230" width="100%" height={height}>
        {items.map(({ d, s, lost }) => {
          const col = lost ? "#9A97AE" : d.color;
          return (
            <g key={d.id} opacity={focus && focus !== d.id ? 0.25 : 1}>
              <polyline points={s.track.map(([a, c]) => X({ lat: a, lng: c }) + "," + Y({ lat: a, lng: c })).join(" ")} fill="none" stroke={col} strokeWidth="3" />
              {d.stops.map((p, k) => <circle key={k} cx={X(p)} cy={Y(p)} r="4" fill={k < s.done ? "#1FA854" : col} />)}
              <circle cx={X(s.pos)} cy={Y(s.pos)} r="9" fill={col} stroke="#fff" strokeWidth="2" onClick={() => onPick(d.id)} />
            </g>
          );
        })}
        <rect x={X(KZO_WAREHOUSE) - 6} y={Y(KZO_WAREHOUSE) - 6} width="12" height="12" rx="3" fill="#161327" />
      </svg>
    </div>
  );
}

function MgFleet({ role, addAudit }) {
  const R = MG_ROLES[role];
  const { L, failed } = useLeaflet();
  const desktop = useMedia("(min-width: 1200px)");
  const mapH = desktop ? 600 : 330;
  const [now, setNow] = useState(Date.now());
  const [fast, setFast] = useState(false);
  const [focus, setFocus] = useState(null);
  const base = useRef(null);
  if (base.current === null) {
    const d = new Date(); const h = d.getHours() + d.getMinutes() / 60;
    // в демо вне утреннего рейса показываем 11:00, чтобы на карте было движение
    base.current = { real: Date.now(), sim: h >= 8.7 && h <= 12.5 ? Date.now() : sod(d).getTime() + 11 * 3600000, k: 1 };
  }
  useEffect(() => { addAudit(R.person, "Просмотр GPS экспедиторов", "Карта", "Кызылорда"); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), fast ? 1000 : 5000); return () => clearInterval(t); }, [fast]);
  const simTime = base.current.sim + (now - base.current.real) * base.current.k;
  const setSpeed = (v) => { const t = Date.now(); base.current = { real: t, sim: base.current.sim + (t - base.current.real) * base.current.k, k: v ? 30 : 1 }; setFast(v); setNow(t); };
  const items = FLEET.map((d) => {
    const s = fleetState(d, simTime);
    const lost = d.lostSignal && (s.status === "drive" || s.status === "stop");
    return { d, s, lost, last: lost ? 7 * 60 : 12 + (Math.floor(now / 1000) % 25) };
  });
  const cur = items.find((x) => x.d.id === focus);
  const onRoute = items.filter((x) => ["drive", "stop", "return"].includes(x.s.status)).length;
  const delivered = items.reduce((q, x) => q + x.s.done, 0);
  const totalStops = items.reduce((q, x) => q + x.d.stops.length, 0);
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <MgKpi label="На линии" value={onRoute + " / " + FLEET.length} />
        <MgKpi label="Точек пройдено" value={delivered + " / " + totalStops} />
        <MgKpi label="Пробег сегодня" value={Math.round(items.reduce((q, x) => q + x.s.km, 0)) + " км"} />
      </div>
      <div className="kz-split">
      <div>
      {L && !failed ? <FleetLeafletMap L={L} items={items} focus={focus} onPick={setFocus} height={mapH} /> : failed ? <FleetSchemeMap items={items} focus={focus} onPick={setFocus} height={desktop ? 520 : 230} /> :
        <div className="rounded-2xl flex items-center justify-center" style={{ height: mapH, background: "#F3F6FB", border: "1px solid var(--line)", fontSize: 12.5, color: "var(--muted)" }}>Загружаем карту Кызылорды…</div>}
      {failed && <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>Карта не загрузилась (нет интернета) — показана схема маршрутов.</p>}
      <div className="flex items-center justify-between mt-2 mb-1 px-1">
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Демо: ускорить движение ×30</span>
        <Toggle checked={fast} onChange={setSpeed} />
      </div>
      </div>
      <div className="kz-split-side">
      <div className="flex gap-1.5 overflow-x-auto pb-1 mt-2 mb-2" style={{ scrollbarWidth: "none" }}>
        <button onClick={() => setFocus(null)} className="shrink-0 px-3 py-1.5 rounded-full font-semibold" style={{ fontSize: 11.5, background: !focus ? "var(--navy)" : "#F2F1F8", color: !focus ? "#fff" : "var(--ink)" }}>Все экспедиторы</button>
        {FLEET.map((d) => (
          <button key={d.id} onClick={() => setFocus(d.id)} className="shrink-0 px-3 py-1.5 rounded-full font-semibold flex items-center gap-1.5" style={{ fontSize: 11.5, background: focus === d.id ? d.color : "#F2F1F8", color: focus === d.id ? "#fff" : "var(--ink)" }}>
            <span className="rounded-full" style={{ width: 8, height: 8, background: focus === d.id ? "#fff" : d.color, display: "inline-block" }} />{d.name}
          </button>
        ))}
      </div>
      {items.filter((x) => !focus || x.d.id === focus).map((x) => {
        const [label, color] = FLEET_STATUS[x.lost ? "lost" : x.s.status];
        return (
          <MgCard key={x.d.id} onClick={() => setFocus(x.d.id)}>
            <div className="flex justify-between items-center mb-1" style={{ gap: 8 }}>
              <span className="flex items-center gap-2" style={{ fontSize: 13.5, fontWeight: 800 }}>
                <span className="rounded-full shrink-0" style={{ width: 10, height: 10, background: x.lost ? "#9A97AE" : x.d.color, display: "inline-block" }} />{x.d.name}
              </span>
              <Badge bg={color + "1A"} fg={color}>{label}</Badge>
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{x.d.car} · {x.d.phone}</p>
            {x.s.status === "drive" && <MgRow l="Едет к" v={x.s.legTo.name} />}
            {x.s.status === "drive" && <MgRow l="Прибытие примерно" v={hm(x.s.eta)} />}
            {x.s.status === "stop" && <MgRow l="Сейчас у клиента" v={x.s.at.name} />}
            {x.s.status === "stop" && <MgRow l="На точке с" v={hm(x.s.since)} />}
            {x.s.status === "wait" && <MgRow l="Выезд по плану" v={hm(x.s.eta)} />}
            <MgRow l="Скорость" v={x.lost ? "—" : x.s.speed + " км/ч"} />
            <MgRow l="Точек" v={x.s.done + " / " + x.d.stops.length} />
            <MgRow l="Пробег" v={x.s.km.toFixed(1).replace(".", ",") + " км"} />
            <MgRow l="Последний сигнал GPS" v={x.last >= 60 ? Math.round(x.last / 60) + " мин назад" : x.last + " сек назад"} color={x.last >= 300 ? "var(--red)" : "#127A33"} />
            {x.lost && <p style={{ fontSize: 11.5, color: "#B3261E", marginTop: 6, fontWeight: 600 }}>Сигнал пропал более 5 минут назад. Показана последняя известная точка — позвоните водителю.</p>}
          </MgCard>
        );
      })}
      {cur && (
        <MgCard>
          <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Маршрут на сегодня · {cur.d.name}</p>
          <MgRow l={"Старт · " + KZO_WAREHOUSE.name} v={String(cur.d.start[0]).padStart(2, "0") + ":" + String(cur.d.start[1]).padStart(2, "0")} />
          {cur.d.stops.map((p, k) => (
            <MgRow key={k} l={(k + 1) + ". " + p.name} v={k < cur.s.done ? "доставлено ✓" : cur.s.status === "stop" && cur.s.at === p ? "сейчас здесь" : "ожидает"} color={k < cur.s.done ? "#127A33" : "var(--muted)"} />
          ))}
          <div className="flex gap-2 mt-3">
            <a href={"tel:" + cur.d.phone.replace(/\s/g, "")} className="rounded-xl px-3 py-2 font-semibold" style={{ fontSize: 12, background: "#EEF0FF", color: "var(--navy)" }}>Позвонить водителю</a>
            <a href={"https://www.google.com/maps?q=" + cur.s.pos.lat.toFixed(5) + "," + cur.s.pos.lng.toFixed(5)} target="_blank" rel="noopener" className="rounded-xl px-3 py-2 font-semibold" style={{ fontSize: 12, background: "#F2F1F8", color: "var(--ink)" }}>Открыть в картах</a>
          </div>
        </MgCard>
      )}
      </div>
      </div>
      <p style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.45, marginTop: 4 }}>
        GPS фиксируется только в рабочее время и только на служебном маршруте. Карту видят только владелец и директор. Демо-режим: позиции рассчитаны по маршруту; в рабочей версии их присылает телефон водителя через сервер.
      </p>
    </div>
  );
}

// Карточка в приложении водителя: включение передачи GPS
function MgDriverGps() {
  const [pos, setPos] = useState(null);
  const [err, setErr] = useState("");
  const [on, setOn] = useState(false);
  const watch = useRef(null);
  useEffect(() => () => { if (watch.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watch.current); }, []);
  const toggle = (v) => {
    setErr("");
    if (!v) { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; setOn(false); return; }
    if (!navigator.geolocation) { setErr("Телефон не поддерживает GPS"); return; }
    setOn(true);
    watch.current = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), t: new Date() }),
      () => { setErr("Нет доступа к геолокации — разрешите его в настройках браузера"); setOn(false); },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  };
  return (
    <MgCard>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 800 }}>Передача GPS</p>
          <p style={{ fontSize: 11, color: "var(--muted)" }}>Ваше местоположение видят владелец и директор</p>
        </div>
        <Toggle checked={on} onChange={toggle} />
      </div>
      {pos && <p className="font-mono-kz" style={{ fontSize: 11.5, marginTop: 6 }}>{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)} · ±{pos.acc} м · {hm(pos.t)}</p>}
      {err && <p style={{ fontSize: 11.5, color: "var(--red)", marginTop: 6 }}>{err}</p>}
    </MgCard>
  );
}

