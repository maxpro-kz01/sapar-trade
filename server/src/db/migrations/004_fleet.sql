-- Sapar Trade — GPS экспедиторов (этап 1: передача с сайта, пока открыта страница рейса).

CREATE TABLE trips (
  id          serial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  distance_m  numeric(12,1) NOT NULL DEFAULT 0
);
-- у водителя одновременно не больше одного открытого рейса
CREATE UNIQUE INDEX trips_one_open ON trips (user_id) WHERE ended_at IS NULL;
CREATE INDEX trips_user_started ON trips (user_id, started_at DESC);

CREATE TABLE gps_points (
  trip_id   integer NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id   integer NOT NULL REFERENCES users(id),
  at        timestamptz NOT NULL,
  lat       double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon       double precision NOT NULL CHECK (lon BETWEEN -180 AND 180),
  accuracy  real,
  speed     real,
  heading   real,
  PRIMARY KEY (trip_id, at)
);
CREATE INDEX gps_points_user_at ON gps_points (user_id, at DESC);
