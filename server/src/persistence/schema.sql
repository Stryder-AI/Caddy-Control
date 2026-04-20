-- Caddy Control schema. Applied idempotently on boot.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pwd_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','operator','viewer')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT,
  phone TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS carts (
  cart_id TEXT PRIMARY KEY,           -- e.g. '01', '02', ... '38'
  name TEXT NOT NULL,
  imei TEXT UNIQUE,                    -- NULL until a device reports in
  driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_tag TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fences (
  idx INTEGER PRIMARY KEY,             -- 1..8, used as VT-100 fence index
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_m REAL NOT NULL,
  flag INTEGER NOT NULL DEFAULT 2,     -- 1=exit, 2=enter, 3=both
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id TEXT NOT NULL,
  type TEXT NOT NULL,                   -- low_battery | danger_zone | tracker_offline | bypass_triggered | ...
  severity TEXT NOT NULL,               -- info | warning | critical
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',   -- new | acknowledged | resolved
  ts INTEGER NOT NULL,
  ack_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ack_at INTEGER,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alerts_cart_ts ON alerts(cart_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, ts DESC);

CREATE TABLE IF NOT EXISTS bypass_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id TEXT NOT NULL,
  issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  issued_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  ack_at INTEGER,
  result TEXT
);
CREATE INDEX IF NOT EXISTS idx_bypass_cart_ts ON bypass_events(cart_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id TEXT NOT NULL,
  driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | active | completed | cancelled
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_cart_time ON bookings(cart_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id TEXT NOT NULL,
  driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  distance_m INTEGER NOT NULL DEFAULT 0,
  top_speed_kph REAL NOT NULL DEFAULT 0,
  harsh_brake_count INTEGER NOT NULL DEFAULT 0,
  harsh_accel_count INTEGER NOT NULL DEFAULT 0,
  bookings_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_cart ON trips(cart_id, started_at DESC);

-- Latest telemetry snapshot per cart, for fast dashboard hydration.
CREATE TABLE IF NOT EXISTS cart_state (
  cart_id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  lat REAL,
  lng REAL,
  speed_kph REAL,
  course REAL,
  battery_pct REAL,
  ext_v REAL,
  bat_v REAL,
  sat INTEGER,
  hdop REAL,
  odometer_m INTEGER,
  in_sta INTEGER,
  out_sta INTEGER,
  system_sta INTEGER,
  fix_flag TEXT,
  status TEXT,                          -- ACTIVE | INACTIVE | DANGER | OFFLINE
  bypass_active INTEGER NOT NULL DEFAULT 0,
  bypass_ends_at INTEGER,
  last_alm_code INTEGER,
  connected INTEGER NOT NULL DEFAULT 0
);

-- Rolling telemetry history (compact). Older rows pruned nightly.
CREATE TABLE IF NOT EXISTS telemetry (
  ts INTEGER NOT NULL,
  cart_id TEXT NOT NULL,
  lat REAL,
  lng REAL,
  speed_kph REAL,
  course REAL,
  ext_v REAL,
  bat_v REAL,
  sat INTEGER,
  hdop REAL,
  odometer_m INTEGER,
  in_sta INTEGER,
  out_sta INTEGER,
  alm_code INTEGER
);
CREATE INDEX IF NOT EXISTS idx_telemetry_cart_ts ON telemetry(cart_id, ts DESC);
