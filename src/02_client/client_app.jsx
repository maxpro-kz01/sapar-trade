// Sapar Trade — прототип. Модуль: Клиент: нижнее меню и корень клиентского приложения
// Строки 1408–1532 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== CLIENT: BOTTOM NAV ============================== */

function ClientNav({ screen, setScreen, cartCount, onAdminTrigger }) {
  const items = [
    { id: "home", icon: "home", label: "Главная" },
    { id: "orders", icon: "clipboard", label: "Заказы" },
    { id: "cart", icon: "cart", label: "Корзина", badge: cartCount },
    { id: "settings", icon: "settings", label: "Настройки" },
  ];
  // одиночный тап по логотипу — «О компании», двойной — вход для сотрудников
  const logoTap = useDoubleTap(onAdminTrigger, () => setScreen("info"));
  return (
    <AppNav items={items} active={screen} onPick={setScreen} spread
      brand={<NavBrand title="Sapar Trade" sub="Оптово-розничная торговля" onLogo={logoTap} />}
      extra={
        <button onClick={logoTap} className="flex flex-col items-center gap-1">
          <div className="rounded-full flex items-center justify-center" style={{ width: 46, height: 46, background: "#fff", border: `3px solid ${screen === "info" ? "var(--red)" : "#fff"}`, boxShadow: "0 6px 16px rgba(0,0,0,0.18)" }}>
            <Logo size={30} />
          </div>
        </button>
      } />
  );
}

/* ============================== CLIENT APP ROOT ============================== */

function ClientApp({ shared, onAdminTrigger }) {
  const { profile, setProfile, cart, setCart, orders, setOrders, banners, stories, notifications, setNotifications, addAudit,
    cashback, bonusRedeemedMonth, setBonusRedeemedMonth } = shared;
  const [authed, setAuthed] = useState(false);
  const [regStep, setRegStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [screen, setScreen] = useState("home");
  const [storyOpen, setStoryOpen] = useState(false);
  const [storiesViewed, setStoriesViewed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };
  const myOrders = orders.filter((o) => o.__client);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  const monthSpend = getMonthSpend(myOrders);
  const bonusEarned = monthSpend >= cashback.threshold;
  const bonusAvailable = bonusEarned && bonusRedeemedMonth !== monthKey(new Date());

  const checkout = (items, total, isDebt, payMethod, bonusUsed) => {
    const order = {
      id: "KZ-" + Math.floor(260000 + Math.random() * 9999),
      date: new Date(), name: profile.name, shop: profile.hasShop ? profile.shopName : null,
      items: items.map((it) => ({ n: it.p.name, price: it.p.price, qty: it.qty })),
      total, isDebt, status: "Новый", type: profile.hasShop ? "shop" : "individual", payMethod,
      phone: "+7 701 234 56 78", address: "г. Кызылорда, ул. Абая, 15", __client: true,
    };
    setOrders([order, ...orders]);
    setCart({});
    if (bonusUsed) setBonusRedeemedMonth(monthKey(new Date()));
    addAudit(profile.name + (isDebt ? " (в долг)" : ""), "Новый заказ", order.id,
      money(total) + (payMethod === "card" ? " · картой" : "") + (bonusUsed ? " · кэшбэк списан" : ""));
    showToast(isDebt ? "Заказ оформлен в долг ✓" : "Заказ оформлен ✓");
    setScreen("orders");
  };

  const logout = () => {
    setAuthed(false);
    setRegStep(1);
    setPhone("");
    setOtp("");
    setScreen("home");
  };

  if (!authed) {
    return (
      <div className="relative h-full" style={{ background: "var(--bg)" }}>
        <StatusBar />
        {regStep === 1 && <RegPhone phone={phone} setPhone={setPhone} onNext={() => setRegStep(2)} onToast={showToast} onAdminTrigger={onAdminTrigger} />}
        {regStep === 2 && <RegOtp otp={otp} setOtp={setOtp} onNext={() => setRegStep(3)} onBack={() => setRegStep(1)} />}
        {regStep === 3 && <RegProfile profile={profile} setProfile={setProfile} onFinish={() => setAuthed(true)} />}
        <Toast toast={toast} />
      </div>
    );
  }

  return (
    <div className={"relative h-full flex flex-col" + (screen !== "info" ? " kz-app" : "")} style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="flex-1 overflow-y-auto pb-24 kz-main">
        {screen === "home" && <ClientHome profile={profile} cart={cart} setCart={setCart} banners={banners} stories={stories}
          storiesViewed={storiesViewed} onOpenStories={() => setStoryOpen(true)}
          notifications={notifications} onOpenNotifs={() => setNotifOpen(true)}
          monthSpend={monthSpend} cashback={cashback} bonusAvailable={bonusAvailable} />}
        {screen === "cart" && <ClientCart cart={cart} setCart={setCart} profile={profile} onCheckout={checkout} cashback={cashback} bonusAvailable={bonusAvailable} />}
        {screen === "orders" && <ClientOrders orders={myOrders} />}
        {screen === "settings" && <ClientSettings profile={profile} setProfile={setProfile} monthSpend={monthSpend} cashback={cashback} bonusAvailable={bonusAvailable} onLogout={logout} />}
        {screen === "info" && <ClientInfo onBack={() => setScreen("home")} />}
      </div>
      {screen !== "info" && <ClientNav screen={screen} setScreen={setScreen} cartCount={cartCount} onAdminTrigger={onAdminTrigger} />}
      {storyOpen && <StoryViewer stories={stories} onClose={() => { setStoryOpen(false); setStoriesViewed(true); }} onFinish={() => { setStoryOpen(false); setStoriesViewed(true); }} />}
      {notifOpen && (
        <Modal title="Уведомления" onClose={() => { setNotifOpen(false); setNotifications(notifications.map((n) => ({ ...n, read: true }))); }}>
          {notifications.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Уведомлений пока нет</p>
          ) : notifications.map((n, i) => (
            <div key={i} className="py-3" style={{ borderBottom: "1px dashed var(--line)" }}>
              <p style={{ fontSize: 13, color: "var(--ink)" }}>{n.text}</p>
              <p style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>{n.time}</p>
            </div>
          ))}
        </Modal>
      )}
      <Toast toast={toast} />
    </div>
  );
}

