-- Sapar Trade — черновая схема БД (PostgreSQL 16)
-- Основа для Prisma/миграций. Деньги — numeric(14,2) в тенге. Время — timestamptz (Asia/Qyzylorda, UTC+5).
-- Поля external_1c_id / external_sd_id — связь с 1С и Sales Doctor (Master Source по ТЗ §23).

CREATE TYPE user_role AS ENUM ('owner','director','supervisor','tp','driver','warehouse','warehouse_head','accountant','financier','admin');
CREATE TYPE order_status AS ENUM ('accepted','sent_to_warehouse','picking','ready','loaded','in_transit','delivered','partially_delivered','refused','returned','closed','cancelled');
CREATE TYPE order_source AS ENUM ('client_app','tp_app','sales_doctor','admin','1c');
CREATE TYPE pay_method AS ENUM ('cash','card','transfer','kaspi','debt');
CREATE TYPE task_status AS ENUM ('new','in_progress','review','done','rejected');
CREATE TYPE priority AS ENUM ('high','medium','low');

-- ===== Пользователи, роли, безопасность =====
CREATE TABLE teams (
  id serial PRIMARY KEY,
  name text NOT NULL,                     -- «Кызылорда — Центр»
  supervisor_id int
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  full_name text NOT NULL,
  phone text UNIQUE,
  login text UNIQUE,
  password_hash text,                     -- argon2id
  role user_role NOT NULL,
  team_id int REFERENCES teams(id),
  supervisor_id int REFERENCES users(id),
  territory text,                         -- «Центр», «мкр. Шугыла»…
  photo_url text,
  totp_secret text,                       -- 2FA (обязательно для owner/director)
  is_active boolean NOT NULL DEFAULT true,
  external_sd_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE teams ADD FOREIGN KEY (supervisor_id) REFERENCES users(id);

CREATE TABLE role_permissions (
  role user_role NOT NULL,
  permission text NOT NULL,               -- 'finance.net_profit', 'finance.margin_pct', 'fleet.view', 'stock.cost'…
  PRIMARY KEY (role, permission)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id int NOT NULL REFERENCES users(id),
  refresh_hash text NOT NULL,
  device text, ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id int REFERENCES users(id),
  action text NOT NULL,                   -- 'view','create','update','delete','export','login','login_failed'
  object_type text, object_id text,
  detail jsonb,
  ip inet
);
CREATE INDEX ON audit_log (at DESC);

-- ===== Справочники (Master: 1С) =====
CREATE TABLE categories (id serial PRIMARY KEY, name_ru text NOT NULL, name_kk text, emoji text, sort int DEFAULT 0);

CREATE TABLE products (
  id serial PRIMARY KEY,
  external_1c_id text UNIQUE,
  category_id int REFERENCES categories(id),
  name text NOT NULL,
  brand text,
  unit text NOT NULL DEFAULT 'шт',
  price numeric(14,2) NOT NULL,
  cost numeric(14,2),                     -- себестоимость: отдавать только по праву 'stock.cost'
  image_url text,
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE warehouses (id serial PRIMARY KEY, name text NOT NULL, address text, lat numeric(9,6), lng numeric(9,6), phone text);

CREATE TABLE stock (
  warehouse_id int REFERENCES warehouses(id),
  product_id int REFERENCES products(id),
  qty numeric(14,3) NOT NULL DEFAULT 0,
  last_movement_at timestamptz,           -- для dead stock
  PRIMARY KEY (warehouse_id, product_id)
);

CREATE TABLE stock_movements (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL,
  warehouse_id int REFERENCES warehouses(id),
  product_id int REFERENCES products(id),
  kind text NOT NULL,                     -- 'in','out','return','defect','writeoff','resort','expired','inventory'
  qty numeric(14,3) NOT NULL,
  doc_ref text,
  user_id int REFERENCES users(id)
);

-- ===== Клиенты =====
CREATE TABLE clients (
  id serial PRIMARY KEY,
  external_1c_id text UNIQUE, external_sd_id text UNIQUE,
  name text NOT NULL,                     -- магазин или ФИО частного лица
  is_shop boolean NOT NULL DEFAULT false,
  phone text, address text,
  lat numeric(9,6), lng numeric(9,6),
  tp_id int REFERENCES users(id),
  credit_limit numeric(14,2),
  status text DEFAULT 'active',           -- active / new / lost
  created_at timestamptz DEFAULT now()
);

CREATE TABLE client_app_users (           -- покупатели в клиентском приложении (вход по телефону)
  id serial PRIMARY KEY,
  phone text UNIQUE NOT NULL,
  client_id int REFERENCES clients(id),
  name text,
  lang text DEFAULT 'ru',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE otp_codes (phone text, code_hash text, expires_at timestamptz, attempts int DEFAULT 0);

-- ===== Заказы =====
CREATE TABLE orders (
  id bigserial PRIMARY KEY,
  number text UNIQUE,                     -- 'KZ-260123'
  created_at timestamptz NOT NULL DEFAULT now(),
  client_id int REFERENCES clients(id),
  source order_source NOT NULL,
  tp_id int REFERENCES users(id),
  status order_status NOT NULL DEFAULT 'accepted',
  pay_method pay_method,
  is_debt boolean DEFAULT false,
  total numeric(14,2) NOT NULL,
  cashback_used numeric(14,2) DEFAULT 0,
  delivery_address text,
  shift_id int,
  external_1c_id text, external_sd_id text
);
CREATE INDEX ON orders (created_at);

CREATE TABLE order_items (
  order_id bigint REFERENCES orders(id) ON DELETE CASCADE,
  product_id int REFERENCES products(id),
  qty numeric(14,3) NOT NULL,
  price numeric(14,2) NOT NULL,
  cost numeric(14,2),                     -- себестоимость на момент продажи (из 1С)
  PRIMARY KEY (order_id, product_id)
);

CREATE TABLE order_status_history (id bigserial PRIMARY KEY, order_id bigint REFERENCES orders(id), status order_status, at timestamptz DEFAULT now(), user_id int REFERENCES users(id), comment text);

CREATE TABLE returns (id bigserial PRIMARY KEY, at timestamptz, order_id bigint REFERENCES orders(id), client_id int REFERENCES clients(id), total numeric(14,2), reason text, external_1c_id text);

-- ===== Кэшбэк =====
CREATE TABLE cashback_settings (id int PRIMARY KEY DEFAULT 1, threshold numeric(14,2) NOT NULL DEFAULT 50000, reward numeric(14,2) NOT NULL DEFAULT 5000);
CREATE TABLE cashback_redemptions (client_app_user_id int REFERENCES client_app_users(id), month char(7), order_id bigint REFERENCES orders(id), PRIMARY KEY (client_app_user_id, month));

-- ===== Смены администратора и отчёт директору =====
CREATE TABLE shifts (
  id serial PRIMARY KEY,
  admin_id int REFERENCES users(id),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  report jsonb,                           -- снимок отчёта (как buildShiftReport в прототипе)
  sent_to text,                           -- номер директора
  sent_at timestamptz, send_status text   -- 'sent','failed','manual'
);
CREATE TABLE settings (key text PRIMARY KEY, value jsonb);  -- 'director_whatsapp' = "+77001051717", веса Score и т.д.

-- ===== Деньги и долги (Master: 1С) =====
CREATE TABLE payments (id bigserial PRIMARY KEY, at timestamptz, client_id int REFERENCES clients(id), order_id bigint REFERENCES orders(id), method pay_method, amount numeric(14,2), collected_by int REFERENCES users(id), external_1c_id text);
CREATE TABLE receivables (                -- дебиторка по документам
  id bigserial PRIMARY KEY, client_id int REFERENCES clients(id), doc_ref text, doc_date date, due_date date,
  amount numeric(14,2), paid numeric(14,2) DEFAULT 0, updated_at timestamptz
);
CREATE TABLE payables (id bigserial PRIMARY KEY, supplier text, doc_ref text, due_date date, amount numeric(14,2), paid numeric(14,2) DEFAULT 0);
CREATE TABLE expenses (id bigserial PRIMARY KEY, month date, category text, amount numeric(14,2), external_1c_id text); -- зарплата, логистика, аренда, топливо, маркетинг, коммунальные, банковские, прочие
CREATE TABLE cash_accounts (id serial PRIMARY KEY, bank text, iban text, holder text);

-- ===== Полевые продажи (Master: Sales Doctor) =====
CREATE TABLE routes (id serial PRIMARY KEY, user_id int REFERENCES users(id), date date, planned_points int, external_sd_id text);
CREATE TABLE visits (
  id bigserial PRIMARY KEY, user_id int REFERENCES users(id), client_id int REFERENCES clients(id),
  arrived_at timestamptz, left_at timestamptz, has_order boolean, order_id bigint REFERENCES orders(id),
  lat numeric(9,6), lng numeric(9,6), external_sd_id text
);
CREATE TABLE sales_plans (user_id int REFERENCES users(id), month date, amount numeric(14,2), sku_plan int, PRIMARY KEY (user_id, month));
CREATE TABLE attendance (user_id int REFERENCES users(id), date date, start_at timestamptz, end_at timestamptz, late_minutes int, PRIMARY KEY (user_id, date));

-- ===== Доставка и GPS =====
CREATE TABLE vehicles (id serial PRIMARY KEY, plate text, model text, driver_id int REFERENCES users(id));
CREATE TABLE trips (id serial PRIMARY KEY, driver_id int REFERENCES users(id), vehicle_id int REFERENCES vehicles(id), date date, started_at timestamptz, finished_at timestamptz, km numeric(8,2));
CREATE TABLE deliveries (
  id bigserial PRIMARY KEY, trip_id int REFERENCES trips(id), order_id bigint REFERENCES orders(id), seq int,
  status order_status, delivered_at timestamptz, collected numeric(14,2) DEFAULT 0, pay_method pay_method, invoice_ref text, photo_url text
);
CREATE TABLE gps_points (
  id bigserial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id),
  trip_id int REFERENCES trips(id),
  recorded_at timestamptz NOT NULL,
  lat numeric(9,6) NOT NULL, lng numeric(9,6) NOT NULL,
  accuracy_m real, speed_kmh real, heading real,
  source text DEFAULT 'app'               -- 'app','sales_doctor','tracker'
);
CREATE INDEX ON gps_points (user_id, recorded_at DESC);

-- ===== Аналитика (дневные агрегаты для быстрых дашбордов) =====
CREATE TABLE kpi_daily (
  date date, user_id int REFERENCES users(id),
  revenue numeric(14,2), cogs numeric(14,2), returns numeric(14,2), plan numeric(14,2),
  visits_plan int, visits_fact int, visits_effective int, new_clients int, km numeric(8,2), sku int, sku_plan int, cash_in numeric(14,2),
  PRIMARY KEY (date, user_id)
);

-- ===== Задачи, уведомления, контент =====
CREATE TABLE tasks (id serial PRIMARY KEY, title text NOT NULL, assignee_id int REFERENCES users(id), author_id int REFERENCES users(id), deadline date, priority priority DEFAULT 'medium', status task_status DEFAULT 'new', created_at timestamptz DEFAULT now());
CREATE TABLE task_comments (id serial PRIMARY KEY, task_id int REFERENCES tasks(id) ON DELETE CASCADE, author_id int REFERENCES users(id), text text, file_url text, at timestamptz DEFAULT now());
CREATE TABLE notifications (id bigserial PRIMARY KEY, user_id int REFERENCES users(id), level text, text text, link text, created_at timestamptz DEFAULT now(), read_at timestamptz);
CREATE TABLE banners (id serial PRIMARY KEY, title text, subtitle text, image_url text, sort int, is_active boolean DEFAULT true);
CREATE TABLE stories (id serial PRIMARY KEY, caption text, media_url text, media_type text, created_at timestamptz DEFAULT now(), expires_at timestamptz, views int DEFAULT 0);
CREATE TABLE push_log (id serial PRIMARY KEY, text text, sent_by int REFERENCES users(id), at timestamptz DEFAULT now());

-- ===== Интеграции (ТЗ §23–24) =====
CREATE TABLE integration_runs (
  id bigserial PRIMARY KEY,
  source text NOT NULL,                   -- '1c','sales_doctor','whatsapp'
  entity text,                            -- 'products','orders','stock'…
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean, rows_in int, error text
);
CREATE INDEX ON integration_runs (source, started_at DESC);
