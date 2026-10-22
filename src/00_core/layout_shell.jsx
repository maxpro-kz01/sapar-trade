// Sapar Trade — прототип. Модуль: Общее меню приложения (снизу на телефоне, слева на компьютере)
// Используется клиентом, админ-панелью, торговым представителем и системой управления. Стили — styles/responsive.css (.kz-nav*).

// items: [{ id, icon, label, badge? }]
// brand: необязательный блок (логотип + название), виден только в боковом меню на компьютере
// extra: необязательная кнопка в конце нижнего меню (на телефоне), например логотип клиента
// spread: распределить пункты по ширине (короткие меню)
function AppNav({ items, active, onPick, brand, extra, spread }) {
  return (
    <nav className={"kz-nav" + (spread ? " kz-nav--spread" : "")}>
      {brand && <div className="kz-nav-brand">{brand}</div>}
      {items.map((it) => {
        const on = active === it.id;
        return (
          <button key={it.id} onClick={() => onPick(it.id)} className={"kz-nav-item" + (on ? " is-active" : "")} aria-current={on ? "page" : undefined}>
            <span className="kz-nav-icon">
              <Ico name={it.icon} size={19} color={on ? "var(--navy)" : "var(--muted)"} strokeWidth={on ? 2.4 : 2} />
              {it.badge > 0 && <span className="kz-nav-badge font-mono-kz">{it.badge}</span>}
            </span>
            <span className="kz-nav-label">{it.label}</span>
          </button>
        );
      })}
      {extra && <div className="kz-nav-extra">{extra}</div>}
    </nav>
  );
}

// Логотип + подпись для бокового меню
function NavBrand({ title, sub, onLogo }) {
  return (
    <>
      <button onClick={onLogo} className="rounded-xl flex items-center justify-center shrink-0" style={{ width: 40, height: 40, background: "#fff", border: "1px solid var(--line)" }}>
        <Logo size={30} />
      </button>
      <div className="min-w-0">
        <p className="font-display truncate" style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>{title}</p>
        {sub && <p className="truncate" style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</p>}
      </div>
    </>
  );
}
