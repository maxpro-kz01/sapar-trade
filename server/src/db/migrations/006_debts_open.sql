-- Sapar Trade — неоплаченные долги клиентов по документам (ТЗ TZ_DEBTS_FIX, 17.11.2026).
-- В onec_debts из 1С лежат остатки по документам: отгрузки — плюс, оплаты отдельным документом — минус.
-- Долг клиента = плюсы − минусы; оплаты гасят отгрузки начиная с самой старой (FIFO),
-- поэтому неоплаченными остаются самые новые документы — по ним и считается возраст долга и просрочка.
-- Все отчёты берут долги отсюда, а не из onec_debts напрямую.

CREATE VIEW onec_debts_open AS
SELECT client_code, doc_date, doc_name, amount
FROM (
  SELECT d.client_code, d.doc_date, d.doc_name,
         greatest(0, least(d.amount, sum(d.amount) OVER w - coalesce(cr.credit, 0))) AS amount
  FROM onec_debts d
  LEFT JOIN (SELECT client_code, -sum(amount) AS credit FROM onec_debts WHERE amount < 0 GROUP BY 1) cr
         ON cr.client_code = d.client_code
  WHERE d.amount > 0
  -- самые старые первыми; долг без документа (начальные остатки) — самый старый
  WINDOW w AS (PARTITION BY d.client_code ORDER BY d.doc_date NULLS FIRST, d.doc_name, d.amount ROWS UNBOUNDED PRECEDING)
) x
WHERE amount > 0;

CREATE INDEX IF NOT EXISTS onec_debts_client ON onec_debts (client_code);
