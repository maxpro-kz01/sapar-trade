// Sapar Trade — общее. Модуль: установка программы на телефон и компьютер (PWA) — регистрация сервис-воркера и кнопка «Установить приложение»
// Android/Chrome/Edge: браузер присылает событие beforeinstallprompt — по кнопке показываем системное окно установки.
// iPhone (Safari) такого события не даёт — показываем подсказку «Поделиться → На экран Домой».

let stInstallEvent = null;
const stInstallListeners = new Set();
const stNotifyInstall = () => stInstallListeners.forEach((f) => f());
const stIsStandalone = () => (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); stInstallEvent = e; stNotifyInstall(); });
  window.addEventListener("appinstalled", () => { stInstallEvent = null; stNotifyInstall(); });
  // сервис-воркер: только по https (и на localhost для проверки), иначе браузер его не разрешит
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
  }
}

function useInstallApp() {
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((x) => x + 1); stInstallListeners.add(f); return () => stInstallListeners.delete(f); }, []);
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return {
    installed: stIsStandalone(),
    canPrompt: !!stInstallEvent,
    ios,
    install: async () => {
      if (!stInstallEvent) return;
      const ev = stInstallEvent; stInstallEvent = null; stNotifyInstall();
      ev.prompt(); try { await ev.userChoice; } catch (e) { /* закрыли окно */ }
    },
  };
}

// Блок «Установить приложение». Внутри уже установленной программы не показывается.
function InstallApp({ compact }) {
  const a = useInstallApp();
  if (a.installed) return null;
  const box = { border: "1.5px dashed var(--line)", borderRadius: 16, padding: compact ? "10px 12px" : "12px 14px", background: "#fff", marginTop: 16 };
  if (a.canPrompt) {
    return (
      <div style={box} data-testid="install-app">
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Установите программу на этот {a.ios ? "телефон" : "телефон или компьютер"}: значок на экране, открывается сразу, вход сохраняется.</p>
        <PrimaryButton full onClick={a.install}>Установить приложение</PrimaryButton>
      </div>
    );
  }
  return (
    <div style={box} data-testid="install-app">
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 3 }}>Установить приложение</p>
      <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
        {a.ios
          ? "iPhone: откройте эту страницу в Safari, нажмите «Поделиться» (квадрат со стрелкой) → «На экран «Домой»»."
          : "Откройте меню браузера (три точки) → «Установить приложение» или «Добавить на главный экран». На компьютере в Chrome и Edge значок установки — справа в адресной строке."}
      </p>
    </div>
  );
}
