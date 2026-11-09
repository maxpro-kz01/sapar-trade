-- Sapar Trade — ТП клиентов из мобильного агента; деньги, движение денег по статьям, группы статей; заказы в 1С (ТЗ финансов v1.2).

-- ТП клиента по реализациям за 90 дней (source = agent) и имя основного договора (source = contract)
CREATE TABLE onec_client_agents (
  client_code text NOT NULL,
  agent       text NOT NULL,
  source      text NOT NULL CHECK (source IN ('agent','contract')),
  docs        integer NOT NULL DEFAULT 0,
  last_day    date,
  PRIMARY KEY (client_code, agent, source)
);
-- менеджер клиента из 1С (карточка) хранится отдельно, чтобы вычисленный ТП не затирал его
ALTER TABLE onec_clients ADD COLUMN manager_1c text;

-- остатки денег по кассам и счетам (снимок)
CREATE TABLE onec_cash (
  account text PRIMARY KEY,
  kind    text,
  amount  numeric(18,2) NOT NULL
);

-- движение денег по дням: касса/счёт × статья × приход/расход
CREATE TABLE onec_cashflow_daily (
  day     date NOT NULL,
  account text NOT NULL DEFAULT '',
  article text NOT NULL DEFAULT '',
  dir     text NOT NULL CHECK (dir IN ('in','out')),
  amount  numeric(18,2) NOT NULL,
  PRIMARY KEY (day, account, article, dir)
);
CREATE INDEX onec_cashflow_article ON onec_cashflow_daily (article, day);

-- справочник статей из 1С (снимок)
CREATE TABLE onec_cf_articles (
  name     text PRIMARY KEY,
  kind     text,
  activity text
);

-- группа статьи для отчётов; manual — выбрал владелец (автоматика больше не трогает)
CREATE TABLE cf_article_groups (
  article    text PRIMARY KEY,
  grp        text NOT NULL CHECK (grp IN ('customer','income_other','supplier','transfer','loan','expense','none')),
  manual     boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now(),
  updated_by integer REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- заказы, созданные пока отправка в 1С выключена, в 1С не уходят (иначе при включении уйдут все старые)
UPDATE orders SET onec_status = 'skip' WHERE onec_status IN ('pending','error');
