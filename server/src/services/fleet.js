// GPS экспедиторов (ТЗ_GPS): рейсы водителей, приём точек с телефона, карта для владельца и директора.
// Точки принимаются только в открытом рейсе — вне рейса место водителя не хранится.
import { q, pool } from "../db/pool.js";
import { can } from "./rbac.js";
import { HttpError, TZ, todayLocal, isIsoDate } from "../lib/http.js";

export const MAX_BATCH = 300;          // точек за один запрос (накопленные без интернета)
export const FRESH_SEC = 120;          // до 2 мин — сигнал свежий
export const LOST_SEC = 300;           // больше 5 мин в рейсе — «нет сигнала»
const MAX_ACCURACY = 1000;             // хуже 1 км — мусор, не сохраняем
const KEEP_DAYS = 90;                  // хранение точек
const FUTURE_SKEW_MS = 2 * 60 * 1000;  // часы телефона могут спешить
const MAX_AGE_MS = 24 * 3600 * 1000;   // старше суток из очереди не принимаем

const needSend = (user) => { if (!can(user, "fleet.send")) throw new HttpError(403, "Нет доступа"); };
const needView = (user) => { if (!can(user, "fleet.view")) throw new HttpError(403, "Нет доступа"); };

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const km = (m) => Math.round(Number(m) / 100) / 10;
const tripOut = (t) => t && ({ id: t.id, startedAt: t.started_at, endedAt: t.ended_at, km: km(t.distance_m) });

async function openTrip(userId, db = { query: q }) {
  const { rows } = await db.query("SELECT * FROM trips WHERE user_id = $1 AND ended_at IS NULL", [userId]);
  return rows[0] || null;
}

// --- водитель ---

export async function myTrip(user) {
  needSend(user);
  const trip = await openTrip(user.id);
  const { rows: [last] } = await q("SELECT at FROM gps_points WHERE user_id = $1 ORDER BY at DESC LIMIT 1", [user.id]);
  return { trip: tripOut(trip), lastPointAt: last?.at || null };
}

export async function startTrip(user) {
  needSend(user);
  const existing = await openTrip(user.id);
  if (existing) return { trip: tripOut(existing), resumed: true }; // повторное нажатие / обновление страницы
  try {
    const { rows } = await q("INSERT INTO trips(user_id) VALUES ($1) RETURNING *", [user.id]);
    // заодно чистим старые точки — дёшево и не нужен отдельный планировщик
    q(`DELETE FROM gps_points WHERE at < now() - interval '${KEEP_DAYS} days'`).catch((e) => console.error("gps cleanup:", e.message));
    return { trip: tripOut(rows[0]), resumed: false };
  } catch (e) {
    if (e.code === "23505") return { trip: tripOut(await openTrip(user.id)), resumed: true };
    throw e;
  }
}

export async function endTrip(user) {
  needSend(user);
  const { rows } = await q("UPDATE trips SET ended_at = now() WHERE user_id = $1 AND ended_at IS NULL RETURNING *", [user.id]);
  if (!rows[0]) throw new HttpError(400, "Рейс не начат");
  return { trip: tripOut(rows[0]) };
}

// Проверка одной точки. Возвращает нормализованную точку или null (плохую точку отбрасываем молча — телефон не должен застревать).
export function cleanPoint(p, now = Date.now()) {
  if (!p || typeof p !== "object") return null;
  const t = typeof p.t === "number" ? p.t : Date.parse(p.t);
  const lat = num(p.lat), lon = num(p.lon), acc = num(p.acc), spd = num(p.spd), hdg = num(p.hdg);
  if (!Number.isFinite(t) || t > now + FUTURE_SKEW_MS || t < now - MAX_AGE_MS) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (lat === 0 && lon === 0) return null;
  if (acc !== null && (!Number.isFinite(acc) || acc < 0 || acc > MAX_ACCURACY)) return null;
  const okOrNull = (v, max) => (v !== null && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
  return { at: new Date(Math.min(t, now)).toISOString(), lat, lon, acc, spd: okOrNull(spd, 100), hdg: okOrNull(hdg, 360) };
}

// Пробег рейса: сумма расстояний между точками (формула гаверсинусов) без дрожания на месте (<10 м),
// неточных точек (>100 м) и невозможных скачков (>200 км/ч). Пересчитывается целиком — точки могут прийти не по порядку.
const DISTANCE_SQL = `
  WITH p AS (
    SELECT at, lat, lon, lag(lat) OVER w AS plat, lag(lon) OVER w AS plon, lag(at) OVER w AS pat
    FROM gps_points WHERE trip_id = $1 AND (accuracy IS NULL OR accuracy <= 100) WINDOW w AS (ORDER BY at)
  ), d AS (
    SELECT 2 * 6371000 * asin(sqrt(power(sin(radians(lat - plat) / 2), 2)
             + cos(radians(plat)) * cos(radians(lat)) * power(sin(radians(lon - plon) / 2), 2))) AS m,
           greatest(extract(epoch FROM at - pat), 1) AS sec
    FROM p WHERE plat IS NOT NULL
  )
  UPDATE trips SET distance_m = coalesce((SELECT sum(m) FROM d WHERE m >= 10 AND m / sec < 55), 0)
  WHERE id = $1 RETURNING distance_m`;

export async function addPoints(user, body) {
  needSend(user);
  const raw = body?.points;
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, "Нет точек");
  if (raw.length > MAX_BATCH) throw new HttpError(400, `Не больше ${MAX_BATCH} точек за раз`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const trip = await openTrip(user.id, client);
    if (!trip) throw new HttpError(409, "Рейс не начат — точки не принимаются");
    // точки до начала рейса (минус минута на расхождение часов) не берём
    const startMs = new Date(trip.started_at).getTime() - 60_000;
    const pts = raw.map((p) => cleanPoint(p)).filter((p) => p && Date.parse(p.at) >= startMs);
    let saved = 0;
    if (pts.length) {
      const cols = ["at", "lat", "lon", "acc", "spd", "hdg"];
      const params = [trip.id, user.id];
      const values = pts.map((p) => "($1,$2," + cols.map((c) => { params.push(p[c]); return "$" + params.length; }).join(",") + ")");
      const r = await client.query(
        `INSERT INTO gps_points(trip_id, user_id, at, lat, lon, accuracy, speed, heading) VALUES ${values.join(",")}
         ON CONFLICT (trip_id, at) DO NOTHING`, params);
      saved = r.rowCount;
    }
    const { rows: [d] } = saved ? await client.query(DISTANCE_SQL, [trip.id]) : { rows: [trip] };
    await client.query("COMMIT");
    return { accepted: saved, rejected: raw.length - pts.length, duplicate: pts.length - saved, km: km(d.distance_m) };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// --- карта ---

export const signalStatus = (inTrip, ageSec) =>
  !inTrip ? "off" : ageSec === null ? "lost" : ageSec <= FRESH_SEC ? "ok" : ageSec <= LOST_SEC ? "late" : "lost";

export async function live(user) {
  needView(user);
  const { rows } = await q(
    `SELECT u.id, u.name, u.login, t.id AS trip_id, t.started_at, t.distance_m,
            lp.at, lp.lat, lp.lon, lp.accuracy, lp.speed, lp.heading,
            (SELECT coalesce(sum(distance_m),0) FROM trips x WHERE x.user_id = u.id AND (x.started_at AT TIME ZONE $1)::date = $2::date) AS day_m
     FROM users u
     LEFT JOIN trips t ON t.user_id = u.id AND t.ended_at IS NULL
     LEFT JOIN LATERAL (SELECT at, lat, lon, accuracy, speed, heading FROM gps_points g WHERE g.user_id = u.id ORDER BY at DESC LIMIT 1) lp ON true
     WHERE u.role = 'driver' AND u.is_active
     ORDER BY u.name`, [TZ, todayLocal()]);
  const now = Date.now();
  const drivers = rows.map((r) => {
    const inTrip = !!r.trip_id;
    // в рейсе без единой точки считаем «возраст» от начала рейса
    const ref = r.at || (inTrip ? r.started_at : null);
    const ageSec = ref ? Math.max(0, Math.round((now - new Date(ref).getTime()) / 1000)) : null;
    return {
      id: r.id, name: r.name, login: r.login, inTrip,
      tripStartedAt: r.started_at || null,
      tripKm: inTrip ? km(r.distance_m) : null,
      kmToday: km(r.day_m),
      last: r.at ? { at: r.at, lat: r.lat, lon: r.lon, accuracy: r.accuracy, speedKmh: r.speed === null ? null : Math.round(r.speed * 3.6), heading: r.heading } : null,
      ageSec,
      status: signalStatus(inTrip, ageSec),
    };
  });
  return { drivers, freshSec: FRESH_SEC, lostSec: LOST_SEC, at: new Date(now).toISOString() };
}

export async function track(user, query) {
  needView(user);
  const driver = Number(query.driver);
  if (!Number.isInteger(driver) || driver <= 0) throw new HttpError(400, "Укажите водителя");
  const date = query.date ?? todayLocal();
  if (!isIsoDate(date)) throw new HttpError(400, "Дата в формате ГГГГ-ММ-ДД");
  const { rows: [u] } = await q("SELECT id, name FROM users WHERE id = $1 AND role = 'driver'", [driver]);
  if (!u) throw new HttpError(404, "Водитель не найден");
  const [pts, trips] = await Promise.all([
    q(`SELECT trip_id, at, lat, lon, accuracy, speed FROM gps_points
       WHERE user_id = $1 AND (at AT TIME ZONE $2)::date = $3::date AND (accuracy IS NULL OR accuracy <= 200)
       ORDER BY at LIMIT 5000`, [driver, TZ, date]),
    q(`SELECT * FROM trips WHERE user_id = $1 AND (started_at AT TIME ZONE $2)::date = $3::date ORDER BY started_at`, [driver, TZ, date]),
  ]);
  return {
    driver: { id: u.id, name: u.name }, date,
    trips: trips.rows.map(tripOut),
    km: km(trips.rows.reduce((s, t) => s + Number(t.distance_m), 0)),
    points: pts.rows.map((p) => ({ trip: p.trip_id, at: p.at, lat: p.lat, lon: p.lon, acc: p.accuracy, kmh: p.speed === null ? null : Math.round(p.speed * 3.6) })),
  };
}

// Для «Проблем»: водители в рейсе без сигнала больше 5 минут
export async function lostDrivers() {
  const { rows } = await q(
    `SELECT u.name, coalesce(max(g.at), t.started_at) AS last FROM trips t JOIN users u ON u.id = t.user_id
     LEFT JOIN gps_points g ON g.trip_id = t.id
     WHERE t.ended_at IS NULL GROUP BY u.name, t.started_at
     HAVING coalesce(max(g.at), t.started_at) < now() - make_interval(secs => $1)`, [LOST_SEC]);
  return rows;
}
