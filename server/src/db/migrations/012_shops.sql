-- Sapar Trade — «Магазин»: вход магазинов по телефону, самостоятельные заказы, кредитный лимит (ТЗ TZ_STORE_APP).

CREATE TABLE shops (
  id            serial PRIMARY KEY,
  phone         text NOT NULL,                       -- 7XXXXXXXXXX
  name          text NOT NULL,
  contact_name  text,
  address       text,
  client_code   text,                                -- код клиента в 1С; NULL — ещё не привязан
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  token_version integer NOT NULL DEFAULT 0,          -- +1 закрывает все входы магазина
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (phone, name)
);
CREATE INDEX shops_phone ON shops (phone);
CREATE INDEX shops_client ON shops (client_code);

-- Входы магазинов по устройствам (как sessions у сотрудников): хранится только хэш токена
CREATE TABLE shop_sessions (
  id            bigserial PRIMARY KEY,
  shop_id       integer NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  device        text,
  token_version integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX shop_sessions_shop ON shop_sessions (shop_id);

-- Кредитный лимит для заказов «в долг»; нет строки или 0 — «в долг» выключено
CREATE TABLE client_limits (
  client_code  text PRIMARY KEY,
  credit_limit numeric(16,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  updated_by   integer REFERENCES users(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders
  ADD COLUMN source  text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'shop')),
  ADD COLUMN shop_id integer REFERENCES shops(id),
  ADD COLUMN payment text NOT NULL DEFAULT 'cash' CHECK (payment IN ('cash', 'transfer', 'debt'));
ALTER TABLE orders ALTER COLUMN created_by DROP NOT NULL;   -- у заказа магазина нет сотрудника
CREATE INDEX orders_shop ON orders (shop_id) WHERE shop_id IS NOT NULL;
