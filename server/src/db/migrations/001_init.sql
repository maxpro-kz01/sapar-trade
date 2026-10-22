-- Sapar Trade — этап 1: пользователи, журнал, зеркало данных 1С (только чтение из 1С).
-- Коды справочников 1С (Код) — первичные ключи зеркала. Суммы — в тенге.

CREATE TABLE users (
  id            serial PRIMARY KEY,
  login         text NOT NULL UNIQUE,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('owner','director','supervisor','tp','driver','warehouse','accountant','financier','admin')),
  password_hash text NOT NULL,
  manager_1c    text,                 -- для ТП/супервайзера: имя менеджера в 1С (видит только своих клиентов)
  is_active     boolean NOT NULL DEFAULT true,
  token_version integer NOT NULL DEFAULT 0,   -- +1 = выйти на всех устройствах
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  user_id    integer REFERENCES users(id),
  action     text NOT NULL,
  object     text,
  detail     jsonb,
  ip         text
);
CREATE INDEX audit_log_at ON audit_log (at DESC);

CREATE TABLE sync_runs (
  id          bigserial PRIMARY KEY,
  entity      text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok          boolean,
  rows_in     integer,
  error       text,
  agent_host  text
);
CREATE INDEX sync_runs_entity ON sync_runs (entity, started_at DESC);

-- ===== Зеркало 1С =====
CREATE TABLE onec_products (
  code       text PRIMARY KEY,
  name       text NOT NULL,
  group_name text,
  unit       text,
  sku        text,
  synced_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE onec_warehouses (
  code      text PRIMARY KEY,
  name      text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE onec_clients (
  code      text PRIMARY KEY,
  name      text NOT NULL,
  manager   text,
  phone     text,
  address   text,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE onec_prices (
  product_code text NOT NULL,
  price_type   text NOT NULL,
  price        numeric(16,2) NOT NULL,
  PRIMARY KEY (product_code, price_type)
);

CREATE TABLE onec_stock (
  warehouse_code text NOT NULL,
  product_code   text NOT NULL,
  qty            numeric(16,3) NOT NULL,
  PRIMARY KEY (warehouse_code, product_code)
);

-- Продажи по дням (регистр «Продажи»): выручка и количество
CREATE TABLE onec_sales_daily (
  day          date NOT NULL,
  product_code text NOT NULL,
  client_code  text NOT NULL DEFAULT '',
  qty          numeric(16,3) NOT NULL DEFAULT 0,
  revenue      numeric(16,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (day, product_code, client_code)
);
CREATE INDEX onec_sales_daily_day ON onec_sales_daily (day);

-- Себестоимость продаж по дням (регистр «ПродажиСебестоимость»)
CREATE TABLE onec_cost_daily (
  day          date NOT NULL,
  product_code text NOT NULL,
  qty          numeric(16,3) NOT NULL DEFAULT 0,
  cost         numeric(16,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (day, product_code)
);
CREATE INDEX onec_cost_daily_day ON onec_cost_daily (day);

-- Долги клиентов (остатки взаиморасчётов), по документу-основанию для «возраста долга»
CREATE TABLE onec_debts (
  id          bigserial PRIMARY KEY,
  client_code text NOT NULL,
  doc_date    date,
  doc_name    text,
  amount      numeric(16,2) NOT NULL
);
CREATE INDEX onec_debts_client ON onec_debts (client_code);
