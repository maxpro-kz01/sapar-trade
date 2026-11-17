-- Sapar Trade — долги клиентов из 1С:Бухгалтерии, счёт 1274 (ТЗ TZ_DEBTS_BUH, 17.11.2026).
-- Бухгалтер закрывает долги в Бухгалтерии, а в УТП оплаты не доходят (сверка 17.11: у клиентов
-- нет ПКО за 90 дней) — поэтому мастер-источник долгов теперь Бухгалтерия. Агент присылает по контрагенту:
--   kind = 'bal' — сальдо 1274 сейчас (Дт − Кт);
--   kind = 'dt'  — отгрузки (обороты Дт 1274) по дням за последний год — для возраста долга.

CREATE TABLE onec_debts_buh (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('bal', 'dt')),
  client_code text NOT NULL,
  client_name text NOT NULL DEFAULT '',
  day         date,
  amount      numeric(16,2) NOT NULL
);
CREATE INDEX onec_debts_buh_client ON onec_debts_buh (client_code);

-- Контрагент Бухгалтерии → клиент УТП: по названию (без учёта регистра и лишних пробелов),
-- только если в УТП такое название одно. Коды баз могут не совпадать, поэтому по коду не сопоставляем.
-- Не найденные остаются с кодом «Б:<код>»: в сумме долгов они есть, в «Системе» видны списком.
CREATE VIEW onec_debts_buh_map AS
WITH utp AS (
  SELECT lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) AS nk, min(code) AS code, count(*) AS n
  FROM onec_clients GROUP BY 1
), buh AS (
  SELECT client_code, max(client_name) AS client_name,
         lower(regexp_replace(btrim(max(client_name)), '\s+', ' ', 'g')) AS nk
  FROM onec_debts_buh GROUP BY client_code
)
SELECT buh.client_code AS buh_code, buh.client_name,
       CASE WHEN utp.n = 1 THEN utp.code ELSE 'Б:' || buh.client_code END AS client_code,
       (utp.n = 1) IS TRUE AS matched
FROM buh LEFT JOIN utp ON utp.nk = buh.nk;

-- Строки долга в том же виде, что onec_debts: отгрузки — плюсом, уже оплаченное — одной строкой минусом;
-- FIFO в onec_debts_open оставит неоплаченными самые новые отгрузки на сумму сальдо.
-- Если сальдо больше отгрузок за год — остаток без даты (старый долг, считается просроченным).
CREATE VIEW onec_debts_buh_rows AS
WITH bal AS (
  SELECT client_code, sum(amount) AS b FROM onec_debts_buh WHERE kind = 'bal' GROUP BY 1
), dt AS (
  SELECT client_code, day, sum(amount) AS a FROM onec_debts_buh WHERE kind = 'dt' AND amount > 0 GROUP BY 1, 2
), tot AS (
  SELECT client_code, sum(a) AS s FROM dt GROUP BY 1
), r AS (
  SELECT dt.client_code, dt.day AS doc_date, 'Отгрузка ' || to_char(dt.day, 'DD.MM.YYYY') AS doc_name, dt.a AS amount
  FROM dt JOIN bal USING (client_code) WHERE bal.b > 0
  UNION ALL
  SELECT client_code, NULL::date, 'Оплачено (Бухгалтерия)', -(tot.s - bal.b)
  FROM bal JOIN tot USING (client_code) WHERE bal.b > 0 AND tot.s > bal.b
  UNION ALL
  SELECT client_code, NULL::date, 'Долг старше года (Бухгалтерия)', bal.b - coalesce(tot.s, 0)
  FROM bal LEFT JOIN tot USING (client_code) WHERE bal.b > coalesce(tot.s, 0)
)
SELECT m.client_code, r.doc_date, r.doc_name, r.amount
FROM r JOIN onec_debts_buh_map m ON m.buh_code = r.client_code;

-- Источник долгов — настройка debtsSource ('buh' по умолчанию / 'utp'). Пока из Бухгалтерии ничего
-- не пришло, используются данные УТП — чтобы до настройки агента долги не пропали.
CREATE OR REPLACE VIEW onec_debts_open AS
WITH src AS (
  SELECT coalesce((SELECT value #>> '{}' FROM settings WHERE key = 'debtsSource'), 'buh') = 'buh'
         AND EXISTS (SELECT 1 FROM onec_debts_buh) AS buh
), d AS (
  SELECT client_code, doc_date, doc_name, amount FROM onec_debts WHERE NOT (SELECT buh FROM src)
  UNION ALL
  SELECT client_code, doc_date, doc_name, amount FROM onec_debts_buh_rows WHERE (SELECT buh FROM src)
)
SELECT client_code, doc_date, doc_name, amount
FROM (
  SELECT d.client_code, d.doc_date, d.doc_name,
         greatest(0, least(d.amount, sum(d.amount) OVER w - coalesce(cr.credit, 0))) AS amount
  FROM d
  LEFT JOIN (SELECT client_code, -sum(amount) AS credit FROM d WHERE amount < 0 GROUP BY 1) cr
         ON cr.client_code = d.client_code
  WHERE d.amount > 0
  WINDOW w AS (PARTITION BY d.client_code ORDER BY d.doc_date NULLS FIRST, d.doc_name, d.amount ROWS UNBOUNDED PRECEDING)
) x
WHERE amount > 0;
