-- Sapar Trade — тип цен клиента из основного договора в 1С (ТЗ TZ_APP_LOGIN_PRICES, часть C).
-- ТП видит и заказывает по ценам того типа, что указан в договоре магазина, — как будет в реализации 1С.
-- Пусто — договор без типа цен: берётся «Цена Прайс» (DEFAULT_PRICE_TYPE).
ALTER TABLE onec_clients ADD COLUMN price_type text;
