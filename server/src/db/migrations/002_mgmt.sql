-- Sapar Trade — система управления: задачи, план продаж по ТП, индексы для отчётов.

CREATE TABLE tasks (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  description text,
  creator_id  integer NOT NULL REFERENCES users(id),
  assignee_id integer REFERENCES users(id),
  deadline    date,
  priority    text NOT NULL DEFAULT 'Средний' CHECK (priority IN ('Высокий','Средний','Низкий')),
  status      text NOT NULL DEFAULT 'Новая' CHECK (status IN ('Новая','В работе','Выполнена','Отменена')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_assignee ON tasks (assignee_id, status);

CREATE TABLE task_comments (
  id      serial PRIMARY KEY,
  task_id integer NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id),
  text    text NOT NULL,
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_task ON task_comments (task_id);

-- План продаж: месяц (1-е число) × менеджер 1С (торговый представитель), сумма в тенге
CREATE TABLE sales_plans (
  month      date NOT NULL CHECK (extract(day FROM month) = 1),
  manager    text NOT NULL,
  amount     numeric(16,2) NOT NULL CHECK (amount >= 0),
  updated_by integer REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month, manager)
);

CREATE INDEX onec_clients_manager ON onec_clients (manager);
CREATE INDEX onec_sales_daily_client ON onec_sales_daily (client_code, day);
CREATE INDEX onec_sales_daily_product ON onec_sales_daily (product_code, day);
