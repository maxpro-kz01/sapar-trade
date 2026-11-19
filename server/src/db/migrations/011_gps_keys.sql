-- Sapar Trade — GPS в фоне через Traccar Client (ТЗ TZ_GPS_TRACCAR).
-- Личный ключ водителя = идентификатор устройства в приложении; рейс может начаться с первой точки приложения.
ALTER TABLE users ADD COLUMN gps_key text UNIQUE;
ALTER TABLE trips ADD COLUMN source text NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'traccar'));
