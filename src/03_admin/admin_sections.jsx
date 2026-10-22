// Sapar Trade — прототип. Модуль: Админ: заказы, реклама/push, склад, сторис, CRM, аудит, настройки
// Строки 1774–2239 исходника sapar-trade-app.html. Глобальный скрипт (без import/export), порядок загрузки — см. src/README.md

function AdminOrders({ orders, addAudit }) {
  const [tab, setTab] = useState("today");
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);

  const now = new Date();
  const list = orders.filter((o) => {
    if (tab === "today") { if (now - o.date > 24 * 3600 * 1000) return false; }
    else { if (o.date.toISOString().slice(0, 10) !== dateFilter) return false; }
    if (filter === "shops") return o.type === "shop";
    if (filter === "individuals") return o.type === "individual";
    if (filter === "agents") return o.type === "agent";
    if (filter === "debt") return o.isDebt;
    return true;
  });

  const typeLabel = (o) => o.type === "shop" ? "Магазин" : o.type === "agent" ? "Представитель: " + o.agentName : "Частное лицо";

  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle sub="Заказы за 24 часа и полная история">Заказы</SectionTitle>
      <div className="flex gap-2 mb-3">
        <button onClick={() => setTab("today")} className="flex-1 rounded-xl py-2.5 font-semibold" style={{ fontSize: 12, background: tab === "today" ? "var(--navy)" : "#F2F1F8", color: tab === "today" ? "#fff" : "var(--ink)" }}>За 24 часа</button>
        <button onClick={() => setTab("history")} className="flex-1 rounded-xl py-2.5 font-semibold" style={{ fontSize: 12, background: tab === "history" ? "var(--navy)" : "#F2F1F8", color: tab === "history" ? "#fff" : "var(--ink)" }}>История по дате</button>
      </div>
      {tab === "history" && (
        <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="font-mono-kz w-full mb-3 px-3 py-2.5 rounded-xl outline-none" style={{ border: "1px solid var(--line)", fontSize: 13 }} />
      )}
      <div className="flex gap-1.5 overflow-x-auto mb-3 pb-1" style={{ scrollbarWidth: "none" }}>
        {[["all", "Все"], ["shops", "Магазины"], ["individuals", "Частные лица"], ["agents", "От представителей"], ["debt", "Долги"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className="shrink-0 px-3 py-1.5 rounded-full font-semibold" style={{ fontSize: 11.5, background: filter === id ? "var(--red)" : "#F2F1F8", color: filter === id ? "#fff" : "var(--ink)" }}>{label}</button>
        ))}
      </div>
      <p className="font-mono-kz mb-2" style={{ fontSize: 11, color: "var(--muted)" }}>Найдено: {list.length}</p>
      <div className="flex flex-col gap-2.5">
        {list.map((o) => {
          const st = STATUS_STYLE[o.status];
          return (
            <button key={o.id} onClick={() => setOpen(o)} className="text-left rounded-2xl p-3.5" style={{ background: "#fff", border: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono-kz" style={{ fontSize: 11.5, color: "var(--muted)" }}>{o.id}</span>
                <Badge bg={st.bg} fg={st.fg}>{o.status}</Badge>
              </div>
              <p style={{ fontSize: 13, color: "var(--ink)", fontWeight: 700 }}>{o.shop || o.name}</p>
              <div className="flex items-center justify-between mt-1">
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{dt(o.date)}</span>
                <span className="font-mono-kz" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{money(o.total)}</span>
              </div>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <Badge bg="#EEF0FF" fg="var(--navy)">{typeLabel(o)}</Badge>
                {o.isDebt && <Badge bg="#FFF6DE" fg="#8A5A00">Долг</Badge>}
              </div>
            </button>
          );
        })}
        {list.length === 0 && <p className="text-center py-10" style={{ fontSize: 13, color: "var(--muted)" }}>Заказов не найдено</p>}
      </div>

      {open && (
        <Modal title={open.id} onClose={() => setOpen(null)} wide>
          <BarcodeStrip />
          <div className="py-3">
            <div className="flex justify-between py-1" style={{ fontSize: 12.5 }}><span style={{ color: "var(--muted)" }}>Клиент</span><span style={{ fontWeight: 700 }}>{open.name}</span></div>
            {open.shop && <div className="flex justify-between py-1" style={{ fontSize: 12.5 }}><span style={{ color: "var(--muted)" }}>Магазин</span><span style={{ fontWeight: 700 }}>{open.shop}</span></div>}
            {open.type === "agent" && <div className="flex justify-between py-1" style={{ fontSize: 12.5 }}><span style={{ color: "var(--muted)" }}>Представитель</span><span style={{ fontWeight: 700 }}>{open.agentName}</span></div>}
            <div className="flex justify-between py-1" style={{ fontSize: 12.5 }}><span style={{ color: "var(--muted)" }}>Телефон</span><span className="font-mono-kz">{open.phone}</span></div>
            <div className="flex justify-between py-1" style={{ fontSize: 12.5 }}><span style={{ color: "var(--muted)" }}>Адрес</span><span>{open.address}</span></div>
            <div className="flex justify-between py-1" style={{ fontSize: 12.5 }}><span style={{ color: "var(--muted)" }}>Дата и время</span><span className="font-mono-kz">{dt(open.date)}</span></div>
            <div className="flex justify-between py-1" style={{ fontSize: 12.5 }}><span style={{ color: "var(--muted)" }}>Оплата</span><span>{open.isDebt ? "В долг" : open.payMethod === "transfer" ? "Перевод" : open.payMethod === "card" ? "Картой" : "Наличные"}</span></div>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, marginBottom: 6 }}>Состав заказа</p>
          {open.items.map((it, i) => (
            <div key={i} className="flex justify-between py-2" style={{ borderBottom: "1px dashed var(--line)", fontSize: 13 }}>
              <span>{it.n} × {it.qty}</span>
              <span className="font-mono-kz" style={{ fontWeight: 700 }}>{money(it.price * it.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-3 pb-4">
            <span style={{ fontWeight: 700 }}>Итого</span>
            <span className="font-mono-kz" style={{ fontWeight: 800, fontSize: 17 }}>{money(open.total)}</span>
          </div>
          <PrimaryButton full onClick={() => { addAudit("Админ (Гульмира)", "Экспорт PDF", open.id, "Скачан чек заказа"); }}>
            <span className="flex items-center justify-center gap-2"><Ico name="download" size={15} />Скачать PDF</span>
          </PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function AdminAds({ banners, setBanners, pushLog, setPushLog, addAudit, clientNotify }) {
  const [addOpen, setAddOpen] = useState(null); // {img}
  const [caption, setCaption] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [pushText, setPushText] = useState("");
  const fileRef = useRef(null);
  const galleryRef = useRef(null);
  const GRADS = ["linear-gradient(135deg,#1B1464,#3B2FA0)", "linear-gradient(135deg,#E2231A,#FF6A5B)", "linear-gradient(135deg,#FFC800,#FF9A00)", "linear-gradient(135deg,#161327,#4B3FCB)"];

  const pickFile = (e) => {
    const f = e.target.files[0];
    if (f) setAddOpen({ img: URL.createObjectURL(f) });
    else setAddOpen({ img: null });
  };

  const saveBanner = () => {
    const b = { id: "b" + Date.now(), title: caption || "Новая акция", subtitle, grad: GRADS[banners.length % GRADS.length], img: addOpen?.img || null };
    setBanners([...banners, b]);
    addAudit("Админ (Гульмира)", "Добавлен баннер", b.title, `слот ${banners.length + 1}/10`);
    setAddOpen(null); setCaption(""); setSubtitle("");
  };

  const sendPush = () => {
    if (!pushText.trim()) return;
    const entry = { text: pushText, time: new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) };
    setPushLog([entry, ...pushLog]);
    clientNotify(pushText);
    addAudit("Админ (Гульмира)", "Push-уведомление", "Все клиенты", pushText.slice(0, 40));
    setPushText("");
  };

  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle sub={`${banners.length}/10 баннеров · показываются каруселью на главной`}>Реклама</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 mb-6">
        {banners.map((b) => (
          <div key={b.id} className="relative rounded-xl overflow-hidden" style={{ height: 84, background: b.grad }}>
            {b.img && <img src={b.img} className="absolute inset-0 w-full h-full object-cover" alt="" />}
            <div className="absolute inset-0 p-2 flex flex-col justify-end" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.5), transparent 60%)" }}>
              <p className="text-white font-bold" style={{ fontSize: 10.5, lineHeight: 1.2 }}>{b.title}</p>
            </div>
            <button onClick={() => setBanners(banners.filter((x) => x.id !== b.id))} className="absolute top-1.5 right-1.5 rounded-full p-1" style={{ background: "rgba(0,0,0,0.4)" }}>
              <Ico name="trash" size={11} color="#fff" />
            </button>
          </div>
        ))}
        {banners.length < 10 && (
          <button onClick={() => { setAddOpen({ img: null }); }} className="rounded-xl flex flex-col items-center justify-center gap-1" style={{ height: 84, border: "1.5px dashed var(--line)", color: "var(--navy)" }}>
            <Ico name="plus-circle" size={20} /><span style={{ fontSize: 10.5, fontWeight: 700 }}>Добавить баннер</span>
          </button>
        )}
      </div>

      <p className="mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Push-уведомление всем клиентам</p>
      <textarea value={pushText} onChange={(e) => setPushText(e.target.value)} placeholder="Например: Завтра склад работает до 15:00"
        rows={3} className="w-full px-3.5 py-3 rounded-xl outline-none mb-2.5" style={{ border: "1.5px solid var(--line)", fontSize: 13.5, resize: "none" }} />
      <div className="mb-5"><PrimaryButton onClick={sendPush}><span className="flex items-center gap-2"><Ico name="send" size={14} />Отправить</span></PrimaryButton></div>

      {pushLog.length > 0 && (
        <>
          <p className="mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Последние отправленные</p>
          <div className="flex flex-col gap-2">
            {pushLog.slice(0, 5).map((p, i) => (
              <div key={i} className="rounded-xl p-3" style={{ border: "1px solid var(--line)" }}>
                <p style={{ fontSize: 12.5 }}>{p.text}</p>
                <p className="font-mono-kz" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>{p.time}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {addOpen !== null && (
        <Modal title="Новый баннер" onClose={() => setAddOpen(null)}>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickFile} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
          {addOpen.img ? (
            <img src={addOpen.img} className="w-full h-32 object-cover rounded-xl mb-3" alt="" />
          ) : (
            <div className="flex gap-2 mb-3">
              <GhostButton onClick={() => fileRef.current.click()}><span className="flex items-center gap-1.5"><Ico name="camera" size={14} />Камера</span></GhostButton>
              <GhostButton onClick={() => galleryRef.current.click()}><span className="flex items-center gap-1.5"><Ico name="image" size={14} />Галерея</span></GhostButton>
            </div>
          )}
          <Field label="Заголовок" placeholder="Скидка −10% на напитки" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <Field label="Подзаголовок" placeholder="При заказе от 50 000 ₸" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          <PrimaryButton full onClick={saveBanner}>Сохранить баннер</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function AdminWarehouse({ warehouse, setWarehouse, addAudit }) {
  const [q, setQ] = useState("");
  const [incoming, setIncoming] = useState(null); // product id
  const [amount, setAmount] = useState("");
  const filtered = warehouse.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  const applyIncoming = () => {
    const n = parseInt(amount, 10);
    if (!n) return;
    setWarehouse(warehouse.map((p) => p.id === incoming ? { ...p, stock: p.stock + n } : p));
    const prod = warehouse.find((p) => p.id === incoming);
    addAudit("Склад (Дамир)", "Приход товара", prod.name, `+${n} ${prod.unit}`);
    setIncoming(null); setAmount("");
  };

  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle sub="Остатки на складе и приход товара">Склад</SectionTitle>
      <div className="relative mb-4">
        <Ico name="search" size={16} style={{ position: "absolute", left: 13, top: 13 }} color="var(--muted)" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти товар..."
          className="w-full pl-9 pr-3 py-3 rounded-xl outline-none" style={{ background: "#F2F1F8", fontSize: 13.5 }} />
      </div>
      <div className="flex flex-col gap-2">
        {filtered.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl p-3" style={{ border: "1px solid var(--line)" }}>
            <div className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 38, height: 38, background: "#F2F1F8", fontSize: 17 }}>
              {CATEGORIES.find((c) => c.id === p.cat)?.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate" style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 600 }}>{p.name}</p>
              <p className="font-mono-kz" style={{ fontSize: 11.5, color: p.stock < 10 ? "var(--red)" : "var(--muted)", fontWeight: p.stock < 10 ? 700 : 500 }}>
                Остаток: {p.stock} {p.unit}{p.stock < 10 ? " · мало!" : ""}
              </p>
            </div>
            <button onClick={() => setIncoming(p.id)} className="rounded-lg px-2.5 py-2 shrink-0 flex items-center gap-1" style={{ background: "#EEF0FF", color: "var(--navy)" }}>
              <Ico name="plus" size={12} /><span style={{ fontSize: 11, fontWeight: 700 }}>Приход</span>
            </button>
          </div>
        ))}
      </div>
      {incoming && (
        <Modal title="Приход товара" onClose={() => setIncoming(null)}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{warehouse.find((p) => p.id === incoming)?.name}</p>
          <Field label="Количество" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          <PrimaryButton full onClick={applyIncoming}>Добавить на склад</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function AdminStories({ stories, setStories, addAudit }) {
  const [addOpen, setAddOpen] = useState(false);
  const [media, setMedia] = useState(null);
  const [caption, setCaption] = useState("");
  const fileRef = useRef(null);
  const galleryRef = useRef(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((v) => v + 1), 60000); return () => clearInterval(t); }, []);
  const GRADS = ["linear-gradient(160deg,#1B1464,#4B3FCB)", "linear-gradient(160deg,#E2231A,#FF7A6E)", "linear-gradient(160deg,#FFC800,#FF9A00)", "linear-gradient(160deg,#161327,#4B3FCB)"];

  const remaining = (s) => {
    const left = 24 - s.hoursAgo;
    if (left <= 0) return "истекает";
    const h = Math.floor(left), m = Math.round((left - h) * 60);
    return `осталось ${h}ч ${m}м`;
  };

  const publish = () => {
    const s = { id: "s" + Date.now(), caption: caption || "Новая история", grad: GRADS[stories.length % GRADS.length], views: 0, hoursAgo: 0, media };
    setStories([s, ...stories]);
    addAudit("Админ (Гульмира)", "Добавлена история", s.caption.slice(0, 30), media?.type === "video" ? "видео" : "фото");
    setAddOpen(false); setMedia(null); setCaption("");
  };

  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle sub="Хранятся 24 часа, затем удаляются автоматически">Истории</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => setAddOpen(true)} className="rounded-xl flex flex-col items-center justify-center gap-1" style={{ height: 130, border: "1.5px dashed var(--line)", color: "var(--navy)" }}>
          <Ico name="plus-circle" size={22} /><span style={{ fontSize: 11, fontWeight: 700 }}>Добавить историю</span>
        </button>
        {stories.map((s) => (
          <div key={s.id} className="relative rounded-xl overflow-hidden flex flex-col justify-between p-2.5" style={{ height: 130, background: s.grad }}>
            {s.media?.type === "video" && <Ico name="video" size={14} color="#fff" style={{ position: "absolute", top: 8, left: 8 }} />}
            <button onClick={() => setStories(stories.filter((x) => x.id !== s.id))} className="self-end rounded-full p-1" style={{ background: "rgba(0,0,0,0.35)" }}>
              <Ico name="trash" size={11} color="#fff" />
            </button>
            <div>
              <p className="text-white" style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1.25, marginBottom: 4 }}>{s.caption}</p>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-white" style={{ fontSize: 10, opacity: 0.9 }}><Ico name="eye" size={10} />{s.views}</span>
                <span className="flex items-center gap-1 text-white" style={{ fontSize: 9, opacity: 0.85 }}><Ico name="clock" size={9} />{remaining(s)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {addOpen && (
        <Modal title="Новая история" onClose={() => setAddOpen(false)}>
          <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files[0]; if (f) setMedia({ url: URL.createObjectURL(f), type: f.type.startsWith("video") ? "video" : "image" }); }} />
          <input ref={galleryRef} type="file" accept="image/*,video/*" className="hidden"
            onChange={(e) => { const f = e.target.files[0]; if (f) setMedia({ url: URL.createObjectURL(f), type: f.type.startsWith("video") ? "video" : "image" }); }} />
          {media ? (
            media.type === "video" ? (
              <div className="relative w-full h-40 rounded-xl mb-3 overflow-hidden" style={{ background: "#161327" }}>
                <video src={media.url} className="w-full h-full object-cover" muted />
                <Ico name="play" size={28} color="#fff" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
              </div>
            ) : (
              <img src={media.url} className="w-full h-40 object-cover rounded-xl mb-3" alt="" />
            )
          ) : (
            <div className="flex gap-2 mb-3">
              <GhostButton onClick={() => fileRef.current.click()}><span className="flex items-center gap-1.5"><Ico name="camera" size={14} />Снять фото/видео (≤30с)</span></GhostButton>
              <GhostButton onClick={() => galleryRef.current.click()}><span className="flex items-center gap-1.5"><Ico name="image" size={14} />Галерея</span></GhostButton>
            </div>
          )}
          <Field label="Текст на истории" placeholder="Например: Новая партия товара!" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <PrimaryButton full onClick={publish}>Опубликовать</PrimaryButton>
        </Modal>
      )}
    </div>
  );
}

function AdminCRM({ orders }) {
  const today = orders.filter((o) => (new Date() - o.date) < 24 * 3600 * 1000);
  const revenueToday = today.reduce((s, o) => s + o.total, 0);
  const avgCheck = today.length ? Math.round(revenueToday / today.length) : 0;

  const revByDay = useMemo(() => {
    const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const now = new Date();
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (6 - i));
      const sum = orders.filter((o) => o.date.toDateString() === d.toDateString()).reduce((s, o) => s + o.total, 0);
      return { day: days[d.getDay() === 0 ? 6 : d.getDay() - 1], sum: sum || Math.round(20000 + Math.random() * 60000) };
    });
  }, [orders]);

  const catStats = CATEGORIES.map((c) => ({ name: c.name, val: PRODUCTS.filter((p) => p.cat === c.id).reduce((s, p) => s + p.stock, 0) }));

  const kpis = [
    { label: "Выручка сегодня", value: money(revenueToday || 284500), icon: "dollar", color: "var(--navy)" },
    { label: "Заказов сегодня", value: today.length || 12, icon: "package", color: "var(--red)" },
    { label: "Средний чек", value: money(avgCheck || 23700), icon: "trending-up", color: "#8A5A00" },
    { label: "Новых клиентов", value: 6, icon: "users", color: "#127A33" },
  ];

  const bySource = [
    { label: "Магазины (представители)", val: orders.filter((o) => o.type === "agent").length },
    { label: "Магазины (клиенты)", val: orders.filter((o) => o.type === "shop").length },
    { label: "Частные лица", val: orders.filter((o) => o.type === "individual").length },
  ];

  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle sub="Полная статистика продаж">CRM</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 mb-5">
        {kpis.map((k, i) => (
          <div key={i} className="rounded-2xl p-3.5" style={{ background: "#fff", border: "1px solid var(--line)" }}>
            <Ico name={k.icon} size={16} color={k.color} />
            <p className="font-mono-kz" style={{ fontSize: 16.5, fontWeight: 800, color: "var(--ink)", marginTop: 6 }}>{k.value}</p>
            <p style={{ fontSize: 10.5, color: "var(--muted)" }}>{k.label}</p>
          </div>
        ))}
      </div>

      <p className="mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Выручка за 7 дней</p>
      <div className="rounded-2xl p-3 mb-5" style={{ background: "#fff", border: "1px solid var(--line)" }}>
        <MiniLineChart data={revByDay} xKey="day" yKey="sum" color="#1B1464" />
      </div>

      <p className="mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Остатки по категориям</p>
      <div className="rounded-2xl p-3 mb-5" style={{ background: "#fff", border: "1px solid var(--line)" }}>
        <MiniBarChart data={catStats} labelKey="name" valueKey="val" color="#E2231A" />
      </div>

      <p className="mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Заказы по источникам</p>
      <div className="rounded-2xl p-1" style={{ background: "#fff", border: "1px solid var(--line)" }}>
        {bySource.map((b, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: i < bySource.length - 1 ? "1px solid var(--line)" : "none" }}>
            <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{b.label}</span>
            <span className="font-mono-kz" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--navy)" }}>{b.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminAudit({ log }) {
  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle sub="Журнал действий сотрудников и системы">Аудит</SectionTitle>
      <div className="flex items-center gap-2 mb-4 px-3.5 py-2.5 rounded-xl" style={{ background: "#EEF0FF" }}>
        <Ico name="shield-check" size={16} color="var(--navy)" />
        <span style={{ fontSize: 11.5, color: "var(--navy)" }}>Каждое изменение цены, остатка, статуса заказа и долга фиксируется</span>
      </div>
      <div className="flex flex-col">
        {log.map((a, i) => (
          <div key={i} className="flex gap-3 py-3" style={{ borderBottom: i < log.length - 1 ? "1px dashed var(--line)" : "none" }}>
            <div className="rounded-full shrink-0 mt-1" style={{ width: 7, height: 7, background: "var(--red)" }} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 700 }}>{a.action}</span>
                <span className="font-mono-kz" style={{ fontSize: 10, color: "var(--muted)" }}>{a.t}</span>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--muted)" }}>{a.user} · {a.obj}</p>
              <p className="font-mono-kz" style={{ fontSize: 11, color: "var(--navy)", marginTop: 1 }}>{a.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminSettings({ accounts, setAccounts, addAudit, cashback, setCashback, directorPhone, setDirectorPhone }) {
  const update = (id, field, val) => setAccounts(accounts.map((a) => a.id === id ? { ...a, [field]: val } : a));
  const [threshold, setThreshold] = useState(String(cashback.threshold));
  const [reward, setReward] = useState(String(cashback.reward));
  const [dirPhone, setDirPhone] = useState(directorPhone);

  const saveDirector = () => {
    setDirectorPhone(dirPhone.trim());
    addAudit("Админ (Гульмира)", "Изменён номер директора", "Отчёт по смене", "WhatsApp → " + dirPhone.trim());
  };

  const saveCashback = () => {
    const t = Math.max(0, Number(threshold.replace(/\D/g, "")) || 0);
    const r = Math.max(0, Number(reward.replace(/\D/g, "")) || 0);
    setCashback({ threshold: t, reward: r });
    addAudit("Админ (Гульмира)", "Изменена бонусная программа", "Кэшбэк", `порог ${money(t)} → награда ${money(r)}`);
  };

  return (
    <div className="px-5 pt-4 pb-4 font-body">
      <SectionTitle sub="Отчёты, бонусы и реквизиты">Настройки</SectionTitle>

      <p className="font-body mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Отчёт по смене</p>
      <div className="rounded-2xl p-3.5 mb-4" style={{ background: "#fff", border: "1px solid var(--line)" }}>
        <Field label="WhatsApp директора" inputMode="tel" value={dirPhone} onChange={(e) => setDirPhone(e.target.value)} />
        <p style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10, lineHeight: 1.4 }}>
          На этот номер уходит полный отчёт, когда администратор нажимает «Завершить работу»: заказы, сумма продаж, деньги в кассе по видам оплаты, долги, топ товаров и остатки на складе.
        </p>
        <GhostButton small onClick={saveDirector}>Сохранить</GhostButton>
      </div>

      <p className="font-body mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Бонусная программа</p>
      <div className="rounded-2xl p-3.5 mb-4" style={{ background: "#fff", border: "1px solid var(--line)" }}>
        <Field label="Порог покупок за месяц, ₸" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))} />
        <Field label="Награда (кэшбэк), ₸" inputMode="numeric" value={reward} onChange={(e) => setReward(e.target.value.replace(/\D/g, ""))} />
        <p style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10, lineHeight: 1.4 }}>
          Когда сумма покупок клиента за календарный месяц достигает порога, ему становится доступен кэшбэк — списывается один раз в корзине. Счётчик обнуляется в начале каждого нового месяца.
        </p>
        <GhostButton small onClick={saveCashback}>Сохранить</GhostButton>
      </div>

      <p className="font-body mb-2" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Счета для зачисления онлайн-оплаты</p>
      <div className="flex flex-col gap-3 mb-4">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-2xl p-3.5" style={{ background: "#fff", border: "1px solid var(--line)" }}>
            <Field label="Банк" value={a.bank} onChange={(e) => update(a.id, "bank", e.target.value)} />
            <Field label="Номер счёта / IBAN" value={a.iban} onChange={(e) => update(a.id, "iban", e.target.value)} />
            <Field label="Получатель" value={a.holder} onChange={(e) => update(a.id, "holder", e.target.value)} />
            <GhostButton small onClick={() => addAudit("Бухгалтер (Айдос)", "Изменён счёт", a.bank, "обновлены реквизиты")}>Сохранить</GhostButton>
          </div>
        ))}
      </div>
      <button onClick={() => setAccounts([...accounts, { id: "a" + Date.now(), bank: "", iban: "", holder: "ИП «Sapar Trade»" }])}
        className="rounded-xl w-full p-3.5 flex items-center justify-center gap-2" style={{ border: "1.5px dashed var(--line)", color: "var(--navy)" }}>
        <Ico name="plus-circle" size={16} /><span style={{ fontSize: 13, fontWeight: 700 }}>Добавить счёт</span>
      </button>
    </div>
  );
}

