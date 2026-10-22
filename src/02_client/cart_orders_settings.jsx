// Sapar Trade — прототип. Модуль: Клиент: корзина, заказы, настройки, о компании
// Строки 1137–1407 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

/* ============================== CLIENT: CART / ORDERS / SETTINGS / INFO ============================== */

function ClientCart({ cart, setCart, profile, onCheckout, cashback, bonusAvailable }) {
  const [isDebt, setIsDebt] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [useBonus, setUseBonus] = useState(false);
  const items = Object.entries(cart).map(([id, qty]) => ({ p: PRODUCTS.find((x) => x.id === Number(id)), qty }));
  const subtotal = items.reduce((s, it) => s + it.p.price * it.qty, 0);
  const discount = useBonus && bonusAvailable ? Math.min(cashback.reward, subtotal) : 0;
  const total = subtotal - discount;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 font-body text-center">
        <div className="rounded-full p-5 mb-4" style={{ background: "#F2F1F8" }}><Ico name="cart" size={28} color="var(--muted)" /></div>
        <p style={{ fontSize: 14, color: "var(--ink)", fontWeight: 700 }}>Корзина пуста</p>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>Добавьте товары на главной странице</p>
      </div>
    );
  }
  return (
    <div className="px-5 pt-4 pb-4 font-body flex flex-col h-full">
      <SectionTitle>Корзина</SectionTitle>
      <div className="flex-1 overflow-y-auto -mx-5 px-5">
        {items.map(({ p, qty }) => (
          <div key={p.id} className="flex items-center gap-3 py-3" style={{ borderBottom: "1px dashed var(--line)" }}>
            <div className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 44, height: 44, background: "#F2F1F8", fontSize: 20 }}>
              {CATEGORIES.find((c) => c.id === p.cat)?.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }} className="truncate">{p.name}</p>
              <p className="font-mono-kz" style={{ fontSize: 12.5, color: "var(--navy)", fontWeight: 700 }}>{money(p.price * qty)}</p>
            </div>
            <div className="flex items-center gap-1 rounded-lg px-1 py-1" style={{ background: "#F2F1F8" }}>
              <button onClick={() => setCart(qty <= 1 ? Object.fromEntries(Object.entries(cart).filter(([k]) => k != p.id)) : { ...cart, [p.id]: qty - 1 })} className="p-1"><Ico name="minus" size={12} /></button>
              <span className="font-mono-kz" style={{ fontSize: 12, width: 18, textAlign: "center" }}>{qty}</span>
              <button onClick={() => setCart({ ...cart, [p.id]: qty + 1 })} className="p-1"><Ico name="plus" size={12} /></button>
            </div>
          </div>
        ))}

        {bonusAvailable && (
          <div className="flex items-center justify-between px-3.5 py-3.5 rounded-xl mt-3" style={{ background: "#E7F4F4", border: "1px solid #BFE0E0" }}>
            <div className="flex items-center gap-2.5">
              <Ico name="dollar" size={16} color="#0F5457" />
              <div>
                <p style={{ fontSize: 13, color: "var(--ink)", fontWeight: 700 }}>Списать кэшбэк {money(cashback.reward)}</p>
                <p style={{ fontSize: 11, color: "var(--muted)" }}>Доступен за покупки этого месяца</p>
              </div>
            </div>
            <Toggle checked={useBonus} onChange={setUseBonus} />
          </div>
        )}

        {profile.hasShop && (
          <div className="flex items-center justify-between px-3.5 py-3.5 rounded-xl mt-3" style={{ background: "#FFF6DE", border: "1px solid #FFE49B" }}>
            <div>
              <p style={{ fontSize: 13, color: "var(--ink)", fontWeight: 700 }}>Взять заказ в долг</p>
              <p style={{ fontSize: 11, color: "var(--muted)" }}>Для {profile.shopName || "вашего магазина"}</p>
            </div>
            <Toggle checked={isDebt} onChange={setIsDebt} />
          </div>
        )}

        {!isDebt && (
          <div className="mt-3">
            <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 8 }}>Способ оплаты</p>
            <div className="flex gap-2">
              <button onClick={() => setPayMethod("cash")} className="flex-1 rounded-xl py-2.5 font-semibold" style={{ fontSize: 12, background: payMethod === "cash" ? "var(--navy)" : "#F2F1F8", color: payMethod === "cash" ? "#fff" : "var(--ink)" }}>Наличные</button>
              <button onClick={() => setPayMethod("card")} className="flex-1 rounded-xl py-2.5 font-semibold flex items-center justify-center gap-1" style={{ fontSize: 12, background: payMethod === "card" ? "var(--navy)" : "#F2F1F8", color: payMethod === "card" ? "#fff" : "var(--ink)" }}><Ico name="credit-card" size={13} />Картой</button>
            </div>
          </div>
        )}
      </div>

      <div className="pt-3">
        <BarcodeStrip />
        {discount > 0 && (
          <div className="flex items-center justify-between pt-3">
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Сумма товаров</span>
            <span className="font-mono-kz" style={{ fontSize: 13, color: "var(--muted)" }}>{money(subtotal)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex items-center justify-between py-1">
            <span style={{ fontSize: 12.5, color: "#0F5457", fontWeight: 600 }}>Кэшбэк</span>
            <span className="font-mono-kz" style={{ fontSize: 13, color: "#0F5457", fontWeight: 700 }}>−{money(discount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between py-3">
          <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Итого</span>
          <span className="font-mono-kz" style={{ fontSize: 20, color: "var(--ink)", fontWeight: 800 }}>{money(total)}</span>
        </div>
        <PrimaryButton full onClick={() => { onCheckout(items, total, isDebt, payMethod, discount > 0); setIsDebt(false); setUseBonus(false); }}>
          {isDebt ? "Оформить заказ в долг" : "Оформить заказ"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function ClientOrders({ orders }) {
  const [open, setOpen] = useState(null);
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 font-body text-center">
        <div className="rounded-full p-5 mb-4" style={{ background: "#F2F1F8" }}><Ico name="clipboard" size={28} color="var(--muted)" /></div>
        <p style={{ fontSize: 14, color: "var(--ink)", fontWeight: 700 }}>Заказов пока нет</p>
      </div>
    );
  }
  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle>Мои заказы</SectionTitle>
      <div className="flex flex-col gap-2.5">
        {orders.map((o) => {
          const st = STATUS_STYLE[o.status];
          return (
            <button key={o.id} onClick={() => setOpen(o)} className="text-left rounded-2xl p-3.5" style={{ background: "#fff", border: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono-kz" style={{ fontSize: 12, color: "var(--muted)" }}>{o.id}</span>
                <Badge bg={st.bg} fg={st.fg}>{o.status}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{dt(o.date)}</span>
                <span className="font-mono-kz" style={{ fontSize: 14, color: "var(--ink)", fontWeight: 700 }}>{money(o.total)}</span>
              </div>
              {o.isDebt && <div className="mt-1.5"><Badge bg="#FFF6DE" fg="#8A5A00">В долг</Badge></div>}
            </button>
          );
        })}
      </div>
      {open && (
        <Modal title={open.id} onClose={() => setOpen(null)}>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>{dt(open.date)}</p>
          {open.items.map((it, i) => (
            <div key={i} className="flex justify-between py-2" style={{ borderBottom: "1px dashed var(--line)", fontSize: 13 }}>
              <span>{it.n} × {it.qty}</span>
              <span className="font-mono-kz" style={{ fontWeight: 700 }}>{money(it.price * it.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-3">
            <span style={{ fontWeight: 700 }}>Итого</span>
            <span className="font-mono-kz" style={{ fontWeight: 800, fontSize: 16 }}>{money(open.total)}</span>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ClientSettings({ profile, setProfile, monthSpend, cashback, bonusAvailable, onLogout }) {
  const [addr, setAddr] = useState("г. Кызылорда, ул. Абая, 15");
  const [editingAddr, setEditingAddr] = useState(false);
  const [cardModal, setCardModal] = useState(false);
  const [cards, setCards] = useState([]);
  const [cardNum, setCardNum] = useState("");

  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle>Настройки</SectionTitle>
      <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--navy)" }}>
        <div className="flex items-center gap-3">
          <div className="rounded-full flex items-center justify-center font-display text-white font-extrabold" style={{ width: 46, height: 46, background: "rgba(255,255,255,0.18)", fontSize: 18 }}>
            {(profile.name || "Г")[0].toUpperCase()}
          </div>
          <div>
            <p className="text-white" style={{ fontSize: 15, fontWeight: 700 }}>{profile.name || "Гость"}</p>
            {profile.hasShop ? (
              <p className="flex items-center gap-1" style={{ fontSize: 12, color: "#FFC800" }}><Ico name="building" size={12} />{profile.shopName || "Магазин"}</p>
            ) : (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>Частное лицо</p>
            )}
          </div>
        </div>
      </div>

      <p className="font-body mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Бонусная программа</p>
      <div className="mb-4">
        <CashbackCard monthSpend={monthSpend} cashback={cashback} available={bonusAvailable} />
      </div>

      <p className="font-body mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Адрес доставки</p>
      <div className="rounded-xl p-3.5 mb-4 flex items-center justify-between" style={{ border: "1px solid var(--line)" }}>
        {editingAddr ? (
          <input value={addr} onChange={(e) => setAddr(e.target.value)} className="flex-1 outline-none" style={{ fontSize: 13 }} autoFocus onBlur={() => setEditingAddr(false)} />
        ) : (
          <span style={{ fontSize: 13, color: "var(--ink)" }}>{addr}</span>
        )}
        <button onClick={() => setEditingAddr(!editingAddr)} style={{ fontSize: 12, color: "var(--red)", fontWeight: 700 }}>{editingAddr ? "Готово" : "Изменить"}</button>
      </div>

      <p className="font-body mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Оплата</p>
      <div className="flex flex-col gap-2 mb-4">
        {cards.map((c, i) => (
          <div key={i} className="rounded-xl p-3.5 flex items-center gap-3" style={{ border: "1px solid var(--line)" }}>
            <Ico name="credit-card" size={18} color="var(--navy)" />
            <span className="font-mono-kz" style={{ fontSize: 13 }}>•••• •••• •••• {c.slice(-4)}</span>
          </div>
        ))}
        <button onClick={() => setCardModal(true)} className="rounded-xl p-3.5 flex items-center gap-2" style={{ border: "1.5px dashed var(--line)", color: "var(--navy)" }}>
          <Ico name="plus-circle" size={17} /><span style={{ fontSize: 13, fontWeight: 700 }}>Привязать карту</span>
        </button>
      </div>

      <p className="font-body mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Данные регистратора</p>
      <div className="rounded-xl p-3.5 mb-5" style={{ border: "1px solid var(--line)" }}>
        <div className="flex justify-between py-1.5" style={{ fontSize: 12.5 }}><span style={{ color: "var(--muted)" }}>Телефон</span><span className="font-mono-kz">+7 701 234 56 78</span></div>
        <div className="flex justify-between py-1.5" style={{ fontSize: 12.5 }}><span style={{ color: "var(--muted)" }}>Статус</span><span>{profile.hasShop ? "Магазин" : "Частное лицо"}</span></div>
      </div>

      <button onClick={onLogout} className="rounded-xl w-full p-3.5 flex items-center justify-center gap-2" style={{ background: "#FCE7E6" }}>
        <Ico name="log-out" size={16} color="var(--red)" /><span style={{ fontSize: 13, fontWeight: 700, color: "var(--red)" }}>Выйти из аккаунта</span>
      </button>

      {cardModal && (
        <Modal title="Привязать карту" onClose={() => setCardModal(false)}>
          <Field label="Номер карты" placeholder="0000 0000 0000 0000" value={cardNum} onChange={(e) => setCardNum(e.target.value)} />
          <div className="flex gap-3">
            <Field label="Срок" placeholder="ММ/ГГ" />
            <Field label="CVC" placeholder="123" />
          </div>
          <PrimaryButton full onClick={() => { setCards([...cards, cardNum || "424242424242"]); setCardModal(false); setCardNum(""); }}>Сохранить карту</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function ClientInfo({ onBack }) {
  const points = [
    { name: "Главный склад — Кызылорда", addr: "ул. Бокейхана, 2", phone: "+7 7242 40 10 20", type: "Склад" },
    { name: "Магазин-склад — Кызылорда", addr: "мкр. Шугыла, 12", phone: "+7 7242 40 10 21", type: "Магазин" },
    { name: "Склад — пос. Тасбогет", addr: "ул. Кожанова, 45", phone: "+7 7242 40 10 22", type: "Склад" },
  ];
  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <button onClick={onBack} className="mb-3 p-1.5 -ml-1.5 rounded-full w-fit"><Ico name="arrow-left" size={19} color="var(--ink)" /></button>
      <SectionTitle sub="Адреса магазинов, складов и телефоны">О компании «Sapar Trade»</SectionTitle>
      <div className="flex flex-col gap-2.5 mb-5">
        {points.map((p, i) => (
          <div key={i} className="rounded-2xl p-4" style={{ background: "#fff", border: "1px solid var(--line)" }}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl p-2.5 shrink-0" style={{ background: "#F2F1F8" }}><Ico name="map-pin" size={16} color="var(--navy)" /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 700 }}>{p.name}</p>
                  <Badge bg="#EEF0FF" fg="var(--navy)">{p.type}</Badge>
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{p.addr}</p>
                <a href={"tel:" + p.phone} className="flex items-center gap-1.5 mt-2" style={{ color: "var(--red)", fontSize: 12.5, fontWeight: 700 }}>
                  <Ico name="phone" size={12} />{p.phone}
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="font-body mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Общие телефоны</p>
      <div className="rounded-xl p-1" style={{ border: "1px solid var(--line)" }}>
        {[["Отдел продаж", "+7 7242 40 00 01"], ["Бухгалтерия", "+7 7242 40 00 02"], ["Служба доставки", "+7 7242 40 00 03"]].map(([n, ph], i) => (
          <a key={i} href={"tel:" + ph} className="flex items-center justify-between px-3 py-3" style={{ borderBottom: i < 2 ? "1px solid var(--line)" : "none" }}>
            <span style={{ fontSize: 13, color: "var(--ink)" }}>{n}</span>
            <span className="font-mono-kz" style={{ fontSize: 12.5, color: "var(--red)", fontWeight: 700 }}>{ph}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

