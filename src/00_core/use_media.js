// Sapar Trade — прототип. Модуль: Хук размера экрана (телефон / планшет / компьютер)
// Используется в layout_shell.jsx и экранах, где на компьютере меняется раскладка (карта экспедиторов).

const BP_TABLET = 768;   // от 768 px — планшет
const BP_DESKTOP = 1200; // от 1200 px — компьютер: меню слева, контент на всю ширину

function useMedia(query) {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, [query]);
  return match;
}

// "phone" | "tablet" | "desktop"
function useBreakpoint() {
  const tablet = useMedia(`(min-width: ${BP_TABLET}px)`);
  const desktop = useMedia(`(min-width: ${BP_DESKTOP}px)`);
  return desktop ? "desktop" : tablet ? "tablet" : "phone";
}
