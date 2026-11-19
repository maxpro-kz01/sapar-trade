// Sapar Trade — маршрутный лист. Модуль: карта остановок (нумерованные точки магазинов) и выбор точки касанием
// Используют экран водителя (driver_route.jsx) и составление листа оператором (admin_routes.jsx). Карта — Leaflet, как у экспедиторов.

const ROUTE_PIN = { wait: "#1B1464", done: "#1FA854", failed: "#E2231A" };

function routePinHtml(n, status) {
  return '<div style="width:30px;height:30px;border-radius:50%;background:' + (ROUTE_PIN[status] || ROUTE_PIN.wait) + ';color:#fff;font:800 13px Manrope,sans-serif;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)">' + n + "</div>";
}

// stops — [{position, status, client, geo:{lat,lon}|null}]; me — {lat,lon} текущее место водителя;
// onPick(lat, lon) — если задан, касание карты ставит точку (режим «поставить точку магазина»); marker — временная точка выбора
function RouteMap({ L, stops, me, onPick, marker, height = 260, focusKey }) {
  const box = useRef(null), map = useRef(null), layer = useRef(null), fitted = useRef(""), pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    if (!L || !box.current || map.current) return undefined;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(KZO_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on("click", (e) => { if (pick.current) pick.current(e.latlng.lat, e.latlng.lng); });
    map.current = m;
    setTimeout(() => m.invalidateSize(), 250);
    return () => { m.remove(); map.current = null; layer.current = null; };
  }, [L]);

  useEffect(() => {
    if (!L || !layer.current) return;
    const g = layer.current;
    g.clearLayers();
    const bounds = [];
    stops.filter((s) => s.geo).forEach((s) => {
      const pos = [s.geo.lat, s.geo.lon];
      L.marker(pos, { icon: L.divIcon({ className: "", html: routePinHtml(s.position, s.status), iconSize: [30, 30], iconAnchor: [15, 15] }) })
        .addTo(g).bindTooltip(fleetEsc(s.client || ""));
      bounds.push(pos);
    });
    if (marker) {
      L.circleMarker([marker.lat, marker.lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#E2231A", fillOpacity: 1 }).addTo(g);
      bounds.push([marker.lat, marker.lon]);
    }
    if (me) {
      L.circleMarker([me.lat, me.lon], { radius: 7, color: "#fff", weight: 3, fillColor: "#2A7DE1", fillOpacity: 1 }).addTo(g).bindTooltip("Вы здесь");
      bounds.push([me.lat, me.lon]);
    }
    // масштаб подгоняем один раз на каждый набор остановок, а не при каждом обновлении
    const key = String(focusKey || "") + ":" + stops.filter((s) => s.geo).length;
    if (bounds.length && fitted.current !== key && !marker) {
      fitted.current = key;
      if (bounds.length === 1) map.current.setView(bounds[0], 15);
      else map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }
    if (marker && fitted.current !== "pick") { fitted.current = "pick"; map.current.setView([marker.lat, marker.lon], Math.max(map.current.getZoom(), 15)); }
  }, [L, stops, me, marker, focusKey]);

  useEffect(() => { if (map.current) setTimeout(() => map.current.invalidateSize(), 50); }, [height]);
  return <div ref={box} data-testid="route-map" style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", position: "relative", zIndex: 0, border: "1px solid var(--line)", background: "#F3F6FB", cursor: onPick ? "crosshair" : undefined }} />;
}

// Ссылка «Навигатор»: по точке магазина, а если точки ещё нет — по адресу
function routeNavUrl(stop) {
  if (stop.geo) return "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + stop.geo.lat + "," + stop.geo.lon;
  if (stop.address) return "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=" + encodeURIComponent("Кызылорда, " + stop.address);
  return null;
}

// Текущее место телефона один раз (для «я у магазина — запомнить точку»)
function routeGetPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) { reject(new Error("Этот браузер не умеет определять место")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) }),
      (e) => reject(new Error(e.code === 1 ? "Разрешите доступ к местоположению в настройках браузера" : "Не удалось определить место — включите GPS")),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  });
}
