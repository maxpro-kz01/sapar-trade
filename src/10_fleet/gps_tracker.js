// Sapar Trade — GPS экспедиторов. Модуль: слежение за местом на телефоне водителя во время рейса
// watchPosition → отбор точек → очередь → отправка пачкой раз в 30 с. Экран не гаснет (Wake Lock), пока идёт рейс.

function useGpsTracker(session, active, { onAuthLost, onTripGone } = {}) {
  const [s, setS] = useState({ perm: "wait", fix: null, queued: gpsQueue.load().length, lastSentAt: null, sendError: "", km: null, wake: null, online: navigator.onLine });
  const queue = useRef(gpsQueue.load());
  const lastKept = useRef(queue.current[queue.current.length - 1] || null);
  const sending = useRef(false);
  const token = useRef(session.token); // интервалы живут дольше рендера — токен берём из ссылки
  token.current = session.token;
  const cb = useRef({ onAuthLost, onTripGone });
  cb.current = { onAuthLost, onTripGone };
  const patch = (o) => setS((x) => ({ ...x, ...o }));

  const flush = async () => {
    if (sending.current || !queue.current.length) return;
    sending.current = true;
    const batch = queue.current.slice(0, GPS_BATCH);
    try {
      const r = await stApi("/api/fleet/points", { method: "POST", token: token.current, body: { points: batch }, timeoutMs: 30000 });
      queue.current = queue.current.slice(batch.length);
      gpsQueue.save(queue.current);
      patch({ queued: queue.current.length, lastSentAt: Date.now(), sendError: "", km: r.km });
      if (queue.current.length) setTimeout(flush, 1000); // догружаем накопленное
    } catch (e) {
      if (e.status === 401) cb.current.onAuthLost && cb.current.onAuthLost(e.message);
      else if (e.status === 409) { // рейс закрыт (например, с другого телефона) — копить незачем
        queue.current = []; gpsQueue.save([]); patch({ queued: 0 });
        cb.current.onTripGone && cb.current.onTripGone();
      } else if (e.status === 400) { // пачку сервер не примет никогда — выбрасываем, чтобы не застрять
        queue.current = queue.current.slice(batch.length); gpsQueue.save(queue.current); patch({ queued: queue.current.length, sendError: e.message });
      } else patch({ sendError: e.message });
    } finally {
      sending.current = false;
    }
  };

  // слежение за местом
  useEffect(() => {
    if (!active) return undefined;
    if (!("geolocation" in navigator)) { patch({ perm: "unsupported" }); return undefined; }
    let first = true;
    const id = navigator.geolocation.watchPosition((pos) => {
      const c = pos.coords;
      const p = { t: pos.timestamp || Date.now(), lat: c.latitude, lon: c.longitude, acc: c.accuracy == null ? null : Math.round(c.accuracy),
        spd: c.speed == null || Number.isNaN(c.speed) ? null : Math.round(c.speed * 10) / 10, hdg: c.heading == null || Number.isNaN(c.heading) ? null : Math.round(c.heading) };
      patch({ perm: "ok", fix: p });
      if (p.acc !== null && p.acc > 1000) return; // слишком неточно — сервер всё равно отбросит
      if (!gpsShouldKeep(lastKept.current, p)) return;
      lastKept.current = p;
      queue.current = [...queue.current, p].slice(-GPS_QUEUE_MAX);
      gpsQueue.save(queue.current);
      patch({ queued: queue.current.length });
      if (first) { first = false; flush(); } // первая точка — сразу, чтобы водитель появился на карте
    }, (err) => {
      patch({ perm: err.code === 1 ? "denied" : "error" });
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 60000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  // отправка раз в 30 секунд, при появлении интернета и при возврате на страницу
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(flush, GPS_SEND_MS);
    const on = () => { patch({ online: true }); flush(); };
    const off = () => patch({ online: false });
    const vis = () => { if (document.visibilityState === "visible") flush(); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", vis);
    flush(); // остаток очереди с прошлого раза
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); document.removeEventListener("visibilitychange", vis); };
  }, [active]);

  // экран не гаснет, пока идёт рейс (браузер снимает блокировку при сворачивании — берём снова)
  useEffect(() => {
    if (!active) return undefined;
    if (!("wakeLock" in navigator)) { patch({ wake: false }); return undefined; }
    let lock = null, alive = true;
    const take = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (alive) patch({ wake: true });
        lock.addEventListener("release", () => alive && patch({ wake: false }));
      } catch (e) { if (alive) patch({ wake: false }); }
    };
    const vis = () => { if (document.visibilityState === "visible") take(); };
    take();
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; document.removeEventListener("visibilitychange", vis); if (lock) lock.release().catch(() => {}); };
  }, [active]);

  // перед завершением рейса — отправить всё, что накопилось
  const flushAll = async () => {
    for (let i = 0; i < 20 && queue.current.length; i++) {
      for (let w = 0; w < 60 && sending.current; w++) await new Promise((ok) => setTimeout(ok, 500)); // ждём текущую отправку
      const before = queue.current.length;
      await flush();
      if (queue.current.length >= before) break; // не получилось — не зацикливаемся
    }
    return queue.current.length;
  };
  return { ...s, flush, flushAll };
}
