// Sapar Trade — GPS экспедиторов. Модуль: карта OpenStreetMap (Leaflet с cdnjs) — машины и маршрут за день
// Leaflet загружается только при открытии вкладки «Экспедиторы»; без интернета карта не нужна — остаётся список.

function useLeaflet() {
  const [L, setL] = useState(window.L || null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (window.L) { setL(window.L); return undefined; }
    if (!document.getElementById("leaflet-css")) {
      const l = document.createElement("link"); l.id = "leaflet-css"; l.rel = "stylesheet";
      l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(l);
    }
    let s = document.getElementById("leaflet-js");
    if (!s) { s = document.createElement("script"); s.id = "leaflet-js"; s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; document.head.appendChild(s); }
    const ok = () => setL(window.L);
    const bad = () => setFailed(true);
    s.addEventListener("load", ok); s.addEventListener("error", bad);
    const to = setTimeout(() => { if (!window.L) setFailed(true); }, 12000);
    return () => { s.removeEventListener("load", ok); s.removeEventListener("error", bad); clearTimeout(to); };
  }, []);
  return { L, failed };
}

const FLEET_HTML_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const fleetEsc = (s) => String(s).split("").map((c) => FLEET_HTML_ESC[c] || c).join("");

function fleetPinHtml(d, dim) {
  const col = FLEET_PIN[d.status] || FLEET_PIN.off;
  return '<div style="width:36px;height:36px;border-radius:50%;background:' + col + ';color:#fff;font:800 12px Manrope,sans-serif;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);opacity:' + (dim ? 0.45 : 1) + '">' + fleetEsc(fleetInitials(d.name)) + "</div>";
}

// drivers — из /api/fleet/live; track — точки выбранного водителя за день (или null)
function FleetMap({ L, drivers, track, focus, onPick, height = 360 }) {
  const box = useRef(null), map = useRef(null), layer = useRef(null), fitted = useRef("");
  useEffect(() => {
    if (!L || !box.current || map.current) return undefined;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(KZO_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    setTimeout(() => m.invalidateSize(), 250);
    return () => { m.remove(); map.current = null; layer.current = null; };
  }, [L]);

  useEffect(() => {
    if (!L || !layer.current) return;
    const g = layer.current;
    g.clearLayers();
    const bounds = [];
    if (track && track.length) {
      const line = track.map((p) => [p.lat, p.lon]);
      L.polyline(line, { color: "#1B1464", weight: 4, opacity: 0.85 }).addTo(g);
      L.circleMarker(line[0], { radius: 6, color: "#fff", weight: 2, fillColor: "#1FA854", fillOpacity: 1 }).addTo(g).bindTooltip("Начало · " + fleetTime(track[0].at));
      L.circleMarker(line[line.length - 1], { radius: 6, color: "#fff", weight: 2, fillColor: "#E2231A", fillOpacity: 1 }).addTo(g).bindTooltip("Конец · " + fleetTime(track[track.length - 1].at));
      line.forEach((x) => bounds.push(x));
    }
    drivers.filter((d) => d.last).forEach((d) => {
      const dim = focus && focus !== d.id;
      const pos = [d.last.lat, d.last.lon];
      L.marker(pos, { zIndexOffset: dim ? 0 : 1000, icon: L.divIcon({ className: "", html: fleetPinHtml(d, dim), iconSize: [36, 36], iconAnchor: [18, 18] }) })
        .addTo(g).bindTooltip(fleetEsc(d.name) + " · " + FLEET_STATUS[d.status][0] + " · " + fleetAge(d.ageSec)).on("click", () => onPick(d.id));
      if (!track || !track.length) bounds.push(pos);
    });
    // подгоняем масштаб один раз на каждый набор (водитель/маршрут), а не при каждом обновлении
    const key = (focus || "all") + ":" + (track ? track.length > 0 : "-");
    if (bounds.length && fitted.current !== key) {
      fitted.current = key;
      if (bounds.length === 1) map.current.setView(bounds[0], 15);
      else map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }
  }, [L, drivers, track, focus]);

  useEffect(() => { if (map.current) setTimeout(() => map.current.invalidateSize(), 50); }, [height]);
  return <div ref={box} data-testid="fleet-map" style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", position: "relative", zIndex: 0, border: "1px solid var(--line)", background: "#F3F6FB" }} />;
}
