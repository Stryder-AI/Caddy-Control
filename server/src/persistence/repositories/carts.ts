import { getDb } from '../db.js';

export interface CartRow {
  cart_id: string;
  name: string;
  imei: string | null;
  driver_id: number | null;
  vehicle_tag: string | null;
  notes: string | null;
  created_at: number;
}

export interface CartStateRow {
  cart_id: string;
  ts: number;
  lat: number | null;
  lng: number | null;
  speed_kph: number | null;
  course: number | null;
  battery_pct: number | null;
  ext_v: number | null;
  bat_v: number | null;
  sat: number | null;
  hdop: number | null;
  odometer_m: number | null;
  in_sta: number | null;
  out_sta: number | null;
  system_sta: number | null;
  fix_flag: string | null;
  status: string | null;
  bypass_active: number;
  bypass_ends_at: number | null;
  last_alm_code: number | null;
  connected: number;
}

export const cartsRepo = {
  list(): CartRow[] {
    return getDb().prepare('SELECT * FROM carts ORDER BY cart_id').all() as CartRow[];
  },

  get(cartId: string): CartRow | undefined {
    return getDb()
      .prepare('SELECT * FROM carts WHERE cart_id = ?')
      .get(cartId) as CartRow | undefined;
  },

  getByImei(imei: string): CartRow | undefined {
    return getDb()
      .prepare('SELECT * FROM carts WHERE imei = ?')
      .get(imei) as CartRow | undefined;
  },

  upsert(row: Omit<CartRow, 'created_at'> & { created_at?: number }): void {
    const now = Date.now();
    getDb()
      .prepare(
        `INSERT INTO carts (cart_id, name, imei, driver_id, vehicle_tag, notes, created_at)
         VALUES (@cart_id, @name, @imei, @driver_id, @vehicle_tag, @notes, @created_at)
         ON CONFLICT(cart_id) DO UPDATE SET
           name = excluded.name,
           imei = COALESCE(excluded.imei, carts.imei),
           driver_id = excluded.driver_id,
           vehicle_tag = excluded.vehicle_tag,
           notes = excluded.notes`
      )
      .run({
        ...row,
        driver_id: row.driver_id ?? null,
        vehicle_tag: row.vehicle_tag ?? null,
        notes: row.notes ?? null,
        imei: row.imei ?? null,
        created_at: row.created_at ?? now,
      });
  },

  update(
    cartId: string,
    patch: Partial<Pick<CartRow, 'name' | 'driver_id' | 'vehicle_tag' | 'notes' | 'imei'>>
  ): void {
    const existing = cartsRepo.get(cartId);
    if (!existing) throw new Error(`Cart ${cartId} not found`);
    const merged = { ...existing, ...patch };
    getDb()
      .prepare(
        `UPDATE carts SET name=?, imei=?, driver_id=?, vehicle_tag=?, notes=? WHERE cart_id=?`
      )
      .run(
        merged.name,
        merged.imei,
        merged.driver_id,
        merged.vehicle_tag,
        merged.notes,
        cartId
      );
  },

  setImei(cartId: string, imei: string): void {
    getDb().prepare('UPDATE carts SET imei=? WHERE cart_id=?').run(imei, cartId);
  },
};

export const cartStateRepo = {
  list(): CartStateRow[] {
    return getDb().prepare('SELECT * FROM cart_state').all() as CartStateRow[];
  },

  get(cartId: string): CartStateRow | undefined {
    return getDb()
      .prepare('SELECT * FROM cart_state WHERE cart_id = ?')
      .get(cartId) as CartStateRow | undefined;
  },

  upsert(row: CartStateRow): void {
    getDb()
      .prepare(
        `INSERT INTO cart_state (
           cart_id, ts, lat, lng, speed_kph, course, battery_pct, ext_v, bat_v,
           sat, hdop, odometer_m, in_sta, out_sta, system_sta, fix_flag, status,
           bypass_active, bypass_ends_at, last_alm_code, connected
         ) VALUES (
           @cart_id, @ts, @lat, @lng, @speed_kph, @course, @battery_pct, @ext_v, @bat_v,
           @sat, @hdop, @odometer_m, @in_sta, @out_sta, @system_sta, @fix_flag, @status,
           @bypass_active, @bypass_ends_at, @last_alm_code, @connected
         )
         ON CONFLICT(cart_id) DO UPDATE SET
           ts = excluded.ts,
           lat = excluded.lat,
           lng = excluded.lng,
           speed_kph = excluded.speed_kph,
           course = excluded.course,
           battery_pct = excluded.battery_pct,
           ext_v = excluded.ext_v,
           bat_v = excluded.bat_v,
           sat = excluded.sat,
           hdop = excluded.hdop,
           odometer_m = excluded.odometer_m,
           in_sta = excluded.in_sta,
           out_sta = excluded.out_sta,
           system_sta = excluded.system_sta,
           fix_flag = excluded.fix_flag,
           status = excluded.status,
           bypass_active = excluded.bypass_active,
           bypass_ends_at = excluded.bypass_ends_at,
           last_alm_code = excluded.last_alm_code,
           connected = excluded.connected`
      )
      .run(row);
  },

  setBypass(cartId: string, active: boolean, endsAt: number | null): void {
    getDb()
      .prepare(
        'UPDATE cart_state SET bypass_active=?, bypass_ends_at=? WHERE cart_id=?'
      )
      .run(active ? 1 : 0, endsAt, cartId);
  },

  setConnected(cartId: string, connected: boolean): void {
    getDb()
      .prepare('UPDATE cart_state SET connected=? WHERE cart_id=?')
      .run(connected ? 1 : 0, cartId);
  },
};
