// Sapar Trade — GPS экспедиторов. Модуль: общие константы, расстояние, очередь точек на телефоне, подписи
// Очередь хранится в localStorage, чтобы точки не пропали без интернета или при перезагрузке страницы.

const GPS_SEND_MS = 30000;        // отправка на сервер раз в 30 секунд
const GPS_MIN_GAP_MS = 25000;     // точку берём не чаще раза в 25 с…
const GPS_MIN_MOVE_M = 30;        // …или раньше, если машина сдвинулась на 30 м
const GPS_BATCH = 300;            // сервер принимает до 300 точек за раз
const GPS_QUEUE_MAX = 3000;       // ~25 часов без связи; дальше старые точки вытесняются
const GPS_QUEUE_KEY = "st.gps.queue";
const KZO_CENTER = [44.8465, 65.4935]; // Кызылорда

function gpsDistM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLa = (b.lat - a.lat) * rad, dLn = (b.lon - a.lon) * rad;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Брать ли новую точку: прошло достаточно времени или машина заметно сдвинулась
function gpsShouldKeep(prev, p) {
  if (!prev) return true;
  const dt = p.t - prev.t;
  if (dt >= GPS_MIN_GAP_MS) return true;
  return dt >= 5000 && gpsDistM(prev, p) >= GPS_MIN_MOVE_M;
}

const gpsQueue = {
  load() { try { const v = JSON.parse(localStorage.getItem(GPS_QUEUE_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
  save(list) { try { localStorage.setItem(GPS_QUEUE_KEY, JSON.stringify(list.slice(-GPS_QUEUE_MAX))); } catch (e) { /* приватный режим */ } },
};

// Подписи и цвета статусов сигнала (как присылает сервер)
const FLEET_STATUS = {
  ok: ["Сигнал есть", "#127A33", "#E3F5E9"],
  late: ["Сигнал 2–5 мин назад", "#8A5A00", "#FFF6DE"],
  lost: ["Нет сигнала", "#B3261E", "#FCE7E6"],
  off: ["Не в рейсе", "#77748C", "#F2F1F8"],
};
const FLEET_PIN = { ok: "#1FA854", late: "#F5A300", lost: "#E2231A", off: "#9A97AE" };

function fleetAge(sec) {
  if (sec === null || sec === undefined) return "—";
  if (sec < 60) return sec + " с назад";
  if (sec < 3600) return Math.floor(sec / 60) + " мин назад";
  return Math.floor(sec / 3600) + " ч " + Math.floor((sec % 3600) / 60) + " мин назад";
}
function fleetDuration(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return Math.floor(m / 60) + " ч " + String(m % 60).padStart(2, "0") + " мин";
}
const fleetTime = (ts) => (ts ? new Date(ts).toLocaleTimeString("ru-RU", { timeZone: ST_TZ, hour: "2-digit", minute: "2-digit" }) : "—");
const fleetKm = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " км");
const fleetInitials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("");
