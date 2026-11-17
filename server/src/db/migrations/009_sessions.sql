-- Sapar Trade — долгие входы по устройствам (ТЗ TZ_APP_LOGIN_PRICES, часть B).
-- Токен входа живёт 90 дней и продлевается при каждом обновлении; на сервере хранится только его хэш.
-- Токен доступа (JWT) короткий (1 час) и привязан к сессии: закрыли сессию — доступ пропал сразу.
CREATE TABLE sessions (
  id            bigserial PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  device        text NOT NULL DEFAULT '',
  token_version integer NOT NULL,           -- users.token_version на момент входа; не совпал — вход недействителен
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);
