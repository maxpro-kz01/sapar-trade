// Sapar Trade — система управления. Модуль: Экспедиторы (GPS) — пока не подключено
// Источника координат нет (Sales Doctor не используется). Нужен телефон водителя с приложением или GPS-трекер.

function MgFleet() {
  return (
    <MgCard>
      <div className="flex items-center gap-3 mb-2">
        <div className="rounded-xl p-2.5" style={{ background: "#F2F1F8" }}><Ico name="map-pin" size={20} color="var(--muted)" /></div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 800 }}>Экспедиторы на карте</p>
          <Badge bg="#F2F1F8" fg="var(--muted)">не подключено</Badge>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
        Чтобы видеть водителей-экспедиторов на карте, нужен источник координат: приложение на телефоне водителя
        (передаёт место во время рейса) или GPS-трекер в машине. В 1С таких данных нет.
        Когда выберете вариант, подключим карту, маршруты и сигнал «нет связи больше 5 минут».
      </p>
    </MgCard>
  );
}
