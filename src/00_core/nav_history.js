// Sapar Trade — общее. Модуль: кнопка «Назад» браузера и телефона внутри сайта (ТЗ TZ_BACK_BUTTON)
// Состояние экранов (вкладка, карточка, магазин) хранится в истории браузера: pushState при переходе, popstate — «Назад/Вперёд».

// Запись истории сайта: { st: 1, nav: { ключ: значение }, modal?: id, guard?: true }
const navCur = () => (history.state && history.state.st ? history.state : { st: 1, nav: {} });
const navRead = (key, fallback) => {
  const s = navCur();
  return Object.prototype.hasOwnProperty.call(s.nav, key) ? s.nav[key] : fallback;
};
const navSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Новый шаг истории. Если сверху запись открытого окна — заменяем её (окно закрывается переходом, лишний шаг не нужен).
function navPush(patch) {
  const s = navCur();
  const next = { st: 1, nav: { ...s.nav, ...patch } };
  if (s.modal || s.guard) history.replaceState(next, "");
  else history.pushState(next, "");
}
function navReplace(patch, extra) {
  const s = navCur();
  history.replaceState({ st: 1, nav: { ...s.nav, ...patch }, ...(extra || {}) }, "");
}

// useState, который помнит значение в истории: «Назад» возвращает предыдущее, после F5 открывается то же.
// valid(значение) — можно ли его показать (например, вкладка доступна роли); иначе — initial.
function useNavState(key, initial, valid) {
  const ok = (v) => (valid ? valid(v) : true);
  const read = () => { const v = navRead(key, initial); return ok(v) ? v : initial; };
  const [val, setVal] = useState(read);
  useEffect(() => {
    if (!navSame(navRead(key, undefined), val)) navReplace({ [key]: val });
    const on = () => setVal(read());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, [key]);
  const set = (nv) => {
    const cur = navRead(key, initial);
    const v = typeof nv === "function" ? nv(cur) : nv;
    setVal(v);
    if (!navSame(v, cur)) navPush({ [key]: v });
  };
  // без нового шага истории (вход, выход): «Назад» не должен возвращать на форму входа
  const replace = (v) => { setVal(v); navReplace({ [key]: v }); };
  return [val, set, replace];
}

// Окно поверх экрана: «Назад» закрывает окно, а не уходит со страницы.
// Если окно закрыли кнопкой — убираем его шаг из истории, чтобы «Назад» потом не «пропадал».
function useBackClose(onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const id = "m" + Math.random().toString(36).slice(2, 9);
    const s = navCur();
    history.pushState({ st: 1, nav: s.nav, modal: id }, "");
    let byBack = false;
    const on = (e) => {
      if (e.state && e.state.modal === id) return; // «Вперёд» на это же окно
      byBack = true;
      ref.current();
    };
    window.addEventListener("popstate", on);
    return () => {
      window.removeEventListener("popstate", on);
      if (!byBack && history.state && history.state.modal === id) history.back();
    };
  }, []);
}

// Первый экран после входа: «Назад» не уходит с сайта (выход — только кнопкой «Выйти»).
// Под первым экраном кладём «защитную» запись; если на неё вернулись — снова шагаем вперёд.
// Флаг во вкладке (sessionStorage): после F5 защита уже стоит, история переходов сохраняется.
const NAV_GUARD_KEY = "st.navGuard";
const navGuardSet = { get() { try { return sessionStorage.getItem(NAV_GUARD_KEY) === "1"; } catch (e) { return false; } },
  set(on) { try { if (on) sessionStorage.setItem(NAV_GUARD_KEY, "1"); else sessionStorage.removeItem(NAV_GUARD_KEY); } catch (e) { /* приватный режим */ } } };

function useBackGuard(active) {
  useEffect(() => {
    if (!active) return undefined;
    if (!navGuardSet.get()) {
      const s = navCur();
      history.replaceState({ st: 1, nav: s.nav, guard: true }, "");
      history.pushState({ st: 1, nav: s.nav }, "");
      navGuardSet.set(true);
    }
    const on = (e) => {
      if (e.state && e.state.guard) history.pushState({ st: 1, nav: e.state.nav }, "");
    };
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, [active]);
}

// Выход из системы: забываем экраны прошлого сотрудника, «Назад» не возвращает в систему.
function navReset(nav) {
  history.replaceState({ st: 1, nav: nav || {} }, "");
  navGuardSet.set(false);
}
