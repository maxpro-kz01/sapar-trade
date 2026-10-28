-- Sapar Trade — заказы ТП (с отправкой в 1С как «Заказ покупателя»), смены администратора, настройки.

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by integer REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id            serial PRIMARY KEY,
  client_code   text NOT NULL,
  client_name   text NOT NULL,
  manager       text,                      -- ТП (основной менеджер клиента в 1С) на момент заказа
  created_by    integer NOT NULL REFERENCES users(id),
  status        text NOT NULL DEFAULT 'Новый' CHECK (status IN ('Новый','Принят','Собран','Отгружен','Отменён')),
  comment       text,
  delivery_date date,
  price_type    text NOT NULL,
  total         numeric(16,2) NOT NULL DEFAULT 0,
  onec_status   text NOT NULL DEFAULT 'pending' CHECK (onec_status IN ('pending','sent','error','skip')),
  onec_number   text,
  onec_error    text,
  onec_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_created ON orders (created_at DESC);
CREATE INDEX orders_onec ON orders (onec_status) WHERE onec_status IN ('pending','error');

CREATE TABLE order_items (
  order_id     integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  line         integer NOT NULL,
  product_code text NOT NULL,
  name         text NOT NULL,
  unit         text,
  qty          numeric(16,3) NOT NULL CHECK (qty > 0),
  price        numeric(16,2) NOT NULL,
  sum          numeric(16,2) NOT NULL,
  PRIMARY KEY (order_id, line)
);

CREATE TABLE order_events (
  id       bigserial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id  integer REFERENCES users(id),
  at       timestamptz NOT NULL DEFAULT now(),
  event    text NOT NULL,
  note     text
);
CREATE INDEX order_events_order ON order_events (order_id);

CREATE TABLE shifts (
  id         serial PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz,
  report     jsonb
);
CREATE UNIQUE INDEX shifts_one_open ON shifts (user_id) WHERE ended_at IS NULL;
