// Sapar Trade — «Магазин». Модуль: оболочка магазина — вкладки Каталог / Заказы / Долг / Профиль.
// Корзина лежит на устройстве (localStorage "st.shop.cart") и очищается после оформления заказа.

function ShopApp({ session, onExit }) {
  const [tab, setTab] = useState("catalog");
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem("st.shop.cart") || "{}") || {}; } catch (e) { return {}; } });
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => { try { localStorage.setItem("st.shop.cart", JSON.stringify(cart)); } catch (e) { /* приватный режим */ } }, [cart]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);
  const shop = session.shop;
  const lost = () => onExit("Вход закрыт. Войдите снова.");
  const tabs = [["catalog", "Каталог", "store"], ["orders", "Заказы", "clipboard"], ["debt", "Долг", "wallet"], ["profile", "Профиль", "users"]];
  return (
    <div className="relative h-full flex flex-col font-body kz-narrow" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-display truncate" style={{ fontSize: 15, fontWeight: 800 }}>{shop.name}</p>
          <p style={{ fontSize: 11, color: "var(--muted)" }}>Sapar Trade · оптовые продукты</p>
        </div>
        <Logo size={34} />
      </div>
      <div className="flex-1 min-h-0 relative">
        {tab === "catalog" && <ShopCatalog cart={cart} setCart={setCart} onAuthLost={lost} onOpenCart={() => setCartOpen(true)} />}
        {tab === "orders" && <ShopOrders onAuthLost={lost} toast={setToast} />}
        {tab === "debt" && <ShopDebt shop={shop} onAuthLost={lost} />}
        {tab === "profile" && <ShopProfile shop={shop} onExit={() => onExit()} />}
      </div>
      <div className="absolute left-0 right-0 bottom-0 flex" style={{ background: "#fff", borderTop: "1px solid var(--line)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {tabs.map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)} className="flex-1 flex flex-col items-center py-2.5 gap-0.5" style={{ color: tab === id ? "var(--navy)" : "var(--muted)" }}>
            <Ico name={icon} size={19} />
            <span style={{ fontSize: 10.5, fontWeight: tab === id ? 800 : 600 }}>{label}</span>
          </button>
        ))}
      </div>
      {cartOpen && <ShopCartModal cart={cart} setCart={setCart} onAuthLost={lost} onClose={() => setCartOpen(false)}
        onDone={(r) => { setCart({}); setCartOpen(false); setTab("orders"); setToast("Заказ " + r.number + " отправлен"); }} />}
      <Toast toast={toast} />
    </div>
  );
}
