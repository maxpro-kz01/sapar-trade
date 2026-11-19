// Sapar Trade — «Магазин». Модуль: главный экран сайта. Две кнопки для покупателей; вход сотрудников — двойной тап по логотипу.
// Кнопка «Скачать приложение» ставит программу на телефон (или показывает подсказку для iPhone).

function ShopLanding({ onOrder, onStaff, hasSession }) {
  const logoTap = useDoubleTap(onStaff);
  const app = useInstallApp();
  const [help, setHelp] = useState(false);
  const download = () => { if (app.canPrompt) app.install(); else setHelp((v) => !v); };
  return (
    <div className="relative h-full" style={{ background: "var(--bg)" }}>
      <StatusBar />
      <div className="flex flex-col h-full px-6 pt-4 pb-6 font-body kz-narrow">
        <div className="flex justify-end"><LangSwitch /></div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <button onClick={logoTap} className="mb-5 select-none" style={{ WebkitTapHighlightColor: "transparent", background: "none", border: 0, padding: 0 }} aria-label="Sapar Trade">
            <Logo size={104} full />
          </button>
          <h1 className="font-display" style={{ fontSize: 21, fontWeight: 800, color: "var(--ink)" }}>Оптовые продукты</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, maxWidth: 280, lineHeight: 1.5 }}>Заказывайте товары для магазина сами: цены по вашему договору, статус заказа и долг — в одном месте.</p>
        </div>
        <PrimaryButton full onClick={onOrder}>{hasSession ? "Открыть магазин" : "Заказать товары"}</PrimaryButton>
        {!app.installed && (
          <div className="mt-3">
            <GhostButton full onClick={download}>Скачать приложение</GhostButton>
            {help && !app.canPrompt && <InstallApp compact />}
          </div>
        )}
      </div>
    </div>
  );
}
