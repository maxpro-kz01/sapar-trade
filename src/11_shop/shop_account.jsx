// Sapar Trade — «Магазин». Модуль: мои заказы, мой долг, профиль.
// Заказы читаются с сервера по своему shop_id; отмена — только пока заказ «Новый».

function ShopOrders({ onAuthLost, toast }) {
  const o = useShopLive("/api/shop/orders", onAuthLost);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(0);
  const cancel = async (id) => {
    setBusy(id);
    try { await shopApi("/api/shop/orders/" + id + "/cancel", { method: "POST" }); toast("Заказ отменён"); o.reload(); }
    catch (e) { toast(e.message); }
    finally { setBusy(0); }
  };
  return (
    <div className="px-4 pt-3 overflow-y-auto h-full" style={{ paddingBottom: 90 }}>
      <SectionTitle sub="Статус обновляется, когда менеджер принимает и собирает заказ">Мои заказы</SectionTitle>
      <LiveState loading={o.loading} error={o.error} onRetry={o.reload} empty={o.data && !o.data.length ? "Заказов пока нет. Откройте «Каталог» и оформите первый." : null} />
      {(o.data || []).map((x) => {
        const [bg, fg] = SHOP_STATUS_COLOR[x.status] || ["#F2F1F8", "var(--ink)"];
        return (
          <div key={x.id} className="rounded-2xl p-3.5 mb-2.5" style={{ background: "#fff", border: "1px solid var(--line)" }}>
            <button className="w-full text-left" onClick={() => setOpen(open === x.id ? null : x.id)}>
              <div className="flex items-center justify-between">
                <span className="font-mono-kz" style={{ fontSize: 13, fontWeight: 800 }}>{x.number}</span>
                <Badge bg={bg} fg={fg}>{x.status}</Badge>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{stFmtTime(x.created_at)} · {SHOP_PAY[x.payment] || x.payment}</span>
                <span className="font-mono-kz" style={{ fontSize: 14, fontWeight: 800 }}>{stMoney(x.total)}</span>
              </div>
            </button>
            {open === x.id && (
              <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                {(x.items || []).map((i, n) => (
                  <div key={n} className="flex justify-between py-1" style={{ fontSize: 12.5 }}>
                    <span className="flex-1 pr-2" style={i.gift ? { color: "#127A33", fontWeight: 700 } : undefined}>{i.name} <span style={{ color: "var(--muted)" }}>× {stNum(i.qty)}</span></span>
                    <span className="font-mono-kz" style={i.gift ? { color: "#127A33", fontWeight: 700 } : undefined}>{i.gift ? "подарок" : stMoney(i.sum)}</span>
                  </div>
                ))}
                {x.comment && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Комментарий: {x.comment}</p>}
                {x.status === "Новый" && <div className="mt-2"><GhostButton small onClick={() => cancel(x.id)}>{busy === x.id ? "Отменяем…" : "Отменить заказ"}</GhostButton></div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ShopDebt({ shop, onAuthLost }) {
  const d = useShopLive("/api/shop/debt", onAuthLost);
  const x = d.data;
  const tile = (label, value, color) => (
    <div className="rounded-2xl p-3.5" style={{ background: "#fff", border: "1px solid var(--line)" }}>
      <p style={{ fontSize: 11.5, color: "var(--muted)" }}>{label}</p>
      <p className="font-mono-kz" style={{ fontSize: 17, fontWeight: 800, color: color || "var(--ink)", marginTop: 2 }}>{stMoney(value)}</p>
    </div>
  );
  return (
    <div className="px-4 pt-3 overflow-y-auto h-full" style={{ paddingBottom: 90 }}>
      <SectionTitle sub="По данным 1С">Мой долг</SectionTitle>
      <LiveState loading={d.loading} error={d.error} onRetry={d.reload} />
      {x && !shop.linked && (
        <div className="rounded-2xl p-4 mb-3" style={{ background: "#FFF6DE" }}>
          <p style={{ fontSize: 12.5, color: "#8A5A00", fontWeight: 600, lineHeight: 1.5 }}>Ваш магазин пока не привязан к базе 1С, поэтому долга нет. Менеджер привяжет его после первого заказа — тогда появятся ваши цены, долг и «в долг».</p>
        </div>
      )}
      {x && (
        <>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            {tile("Долг сейчас", x.debt, x.debt > 0 ? "#B3261E" : "#127A33")}
            {tile("Просрочено", x.overdue, x.overdue > 0 ? "#B3261E" : "var(--ink)")}
            {tile("Лимит «в долг»", x.limit)}
            {tile("Доступно «в долг»", x.available, "var(--navy)")}
          </div>
          {x.pending > 0 && <p style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10 }}>В доступный лимит уже входят ваши неотгруженные заказы «в долг»: {stMoney(x.pending)}.</p>}
          {!!x.docs.length && <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "6px 0" }}>НЕОПЛАЧЕННЫЕ ДОКУМЕНТЫ</p>}
          {x.docs.map((i, n) => <LiveItem key={n} title={i.name || "Документ"} sub={i.date ? stFmtDate(i.date) : "без даты"} value={stMoney(i.amount)} />)}
          {shop.linked && !x.docs.length && <p className="text-center py-6" style={{ fontSize: 12.5, color: "#127A33", fontWeight: 600 }}>Долгов нет</p>}
        </>
      )}
    </div>
  );
}

function ShopProfile({ shop, onExit }) {
  return (
    <div className="px-4 pt-3 overflow-y-auto h-full" style={{ paddingBottom: 90 }}>
      <SectionTitle>Профиль</SectionTitle>
      <div className="rounded-2xl p-4 mb-3" style={{ background: "#fff", border: "1px solid var(--line)" }}>
        <p style={{ fontSize: 15, fontWeight: 800 }}>{shop.name}</p>
        <p className="font-mono-kz" style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{shop.phone}</p>
        {shop.address && <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{shop.address}</p>}
      </div>
      <InstallApp />
      <div className="mt-4"><GhostButton full onClick={onExit}>Выйти из магазина</GhostButton></div>
    </div>
  );
}
