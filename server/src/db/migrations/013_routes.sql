-- Sapar Trade — маршрутные листы водителей (ТЗ TZ_DRIVER_ROUTE): список магазинов на день, отметки о доставке, точки магазинов на карте.

CREATE TABLE route_sheets (
  id          serial PRIMARY KEY,
  sheet_date  date NOT NULL,
  driver_id   integer NOT NULL REFERENCES users(id),
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','closed')),
  created_by  integer NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  closed_at   timestamptz
);
-- у водителя на одну дату один незакрытый лист
CREATE UNIQUE INDEX route_sheets_open ON route_sheets (driver_id, sheet_date) WHERE status <> 'closed';

CREATE TABLE route_stops (
  id            serial PRIMARY KEY,
  sheet_id      integer NOT NULL REFERENCES route_sheets(id) ON DELETE CASCADE,
  position      integer NOT NULL,
  order_id      integer NOT NULL REFERENCES orders(id),
  status        text NOT NULL DEFAULT 'wait' CHECK (status IN ('wait','done','failed')),
  fail_reason   text,
  done_at       timestamptz,
  done_lat      double precision,
  done_lon      double precision
);
-- Полученные на остановке деньги: наличные или QR. Остаток суммы заказа — «позже / в долг».
CREATE TABLE route_payments (
  id      serial PRIMARY KEY,
  stop_id integer NOT NULL REFERENCES route_stops(id) ON DELETE CASCADE,
  method  text NOT NULL CHECK (method IN ('cash','kaspi','halyk')),
  amount  numeric(16,2) NOT NULL CHECK (amount > 0),
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX route_payments_stop ON route_payments (stop_id);
CREATE INDEX route_payments_at ON route_payments (at);

CREATE INDEX route_stops_sheet ON route_stops (sheet_id, position);
-- заказ может ждать доставки только в одном листе
CREATE UNIQUE INDEX route_stops_order_wait ON route_stops (order_id) WHERE status = 'wait';

-- Точка магазина на карте: ставится один раз и запоминается. Ключ — код клиента заказа (для магазина вне 1С — NEW-<id>).
CREATE TABLE client_geo (
  client_code text PRIMARY KEY,
  lat         double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon         double precision NOT NULL CHECK (lon BETWEEN -180 AND 180),
  set_by      integer REFERENCES users(id),
  set_at      timestamptz NOT NULL DEFAULT now()
);
