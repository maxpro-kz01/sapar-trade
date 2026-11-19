-- Акции с подарком (ТЗ TZ_PLAN_PROMO): «купи N штук товара — получи M штук подарка», один раз на заказ.
-- Подарочная строка в заказе: цена 0, is_gift = true, promo_id — какая акция сработала.

CREATE TABLE promos (
  id           serial PRIMARY KEY,
  title        text NOT NULL,                       -- название акции
  label        text,                                -- короткая надпись в каталоге: «100 + 5 в подарок»
  active       boolean NOT NULL DEFAULT true,
  date_from    date,
  date_to      date,
  buy_product  text NOT NULL,                       -- код товара-условия (onec_products.code)
  buy_qty      numeric(16,3) NOT NULL CHECK (buy_qty > 0),
  gift_product text NOT NULL,                       -- код подарка (списывается со склада как обычный товар)
  gift_qty     numeric(16,3) NOT NULL CHECK (gift_qty > 0),
  created_by   integer REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (date_from IS NULL OR date_to IS NULL OR date_from <= date_to)
);
CREATE INDEX promos_buy ON promos (buy_product) WHERE active;

ALTER TABLE order_items
  ADD COLUMN is_gift  boolean NOT NULL DEFAULT false,
  ADD COLUMN promo_id integer REFERENCES promos(id) ON DELETE SET NULL;
