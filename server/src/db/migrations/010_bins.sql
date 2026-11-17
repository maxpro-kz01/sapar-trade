-- Sapar Trade — сопоставление долгов Бухгалтерии с клиентами УТП по БИН/ИИН (ТЗ TZ_APP_LOGIN_PRICES, часть D).
-- Названия в двух базах пишут по-разному, а БИН/ИИН у контрагента один. Сначала сверяем по нему, потом по названию.
CREATE TABLE onec_client_bins (code text PRIMARY KEY, bin text NOT NULL DEFAULT '');   -- клиенты УТП
CREATE TABLE onec_buh_bins    (code text PRIMARY KEY, bin text NOT NULL DEFAULT '');   -- контрагенты Бухгалтерии

CREATE OR REPLACE VIEW onec_debts_buh_map AS
WITH ub AS (   -- БИН/ИИН (12 цифр) → клиент УТП, только если в УТП он один
  SELECT bin, min(code) AS code, count(*) AS n FROM onec_client_bins WHERE bin ~ '^[0-9]{12}$' GROUP BY bin
), bb AS (
  SELECT code AS buh_code, bin FROM onec_buh_bins WHERE bin ~ '^[0-9]{12}$'
), utp AS (    -- запасной путь: название без учёта регистра и лишних пробелов
  SELECT lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) AS nk, min(code) AS code, count(*) AS n
  FROM onec_clients GROUP BY 1
), buh AS (
  SELECT client_code, max(client_name) AS client_name,
         lower(regexp_replace(btrim(max(client_name)), '\s+', ' ', 'g')) AS nk
  FROM onec_debts_buh GROUP BY client_code
)
SELECT buh.client_code AS buh_code, buh.client_name,
       CASE WHEN ub.n = 1 THEN ub.code WHEN utp.n = 1 THEN utp.code ELSE 'Б:' || buh.client_code END AS client_code,
       (ub.n = 1 OR utp.n = 1) IS TRUE AS matched,
       CASE WHEN ub.n = 1 THEN 'bin' WHEN utp.n = 1 THEN 'name' END AS matched_by
FROM buh
LEFT JOIN bb  ON bb.buh_code = buh.client_code
LEFT JOIN ub  ON ub.bin = bb.bin
LEFT JOIN utp ON utp.nk = buh.nk;
