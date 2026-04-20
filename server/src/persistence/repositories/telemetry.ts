import { getDb } from '../db.js';

export interface TelemetryRow {
  ts: number;
  cart_id: string;
  lat: number | null;
  lng: number | null;
  speed_kph: number | null;
  course: number | null;
  ext_v: number | null;
  bat_v: number | null;
  sat: number | null;
  hdop: number | null;
  odometer_m: number | null;
  in_sta: number | null;
  out_sta: number | null;
  alm_code: number | null;
}

export const telemetryRepo = {
  insert(row: TelemetryRow): void {
    getDb()
      .prepare(
        `INSERT INTO telemetry (ts, cart_id, lat, lng, speed_kph, course, ext_v, bat_v,
                                sat, hdop, odometer_m, in_sta, out_sta, alm_code)
         VALUES (@ts, @cart_id, @lat, @lng, @speed_kph, @course, @ext_v, @bat_v,
                 @sat, @hdop, @odometer_m, @in_sta, @out_sta, @alm_code)`
      )
      .run(row);
  },
  historyFor(cartId: string, since: number, limit = 500): TelemetryRow[] {
    return getDb()
      .prepare(
        'SELECT * FROM telemetry WHERE cart_id=? AND ts >= ? ORDER BY ts DESC LIMIT ?'
      )
      .all(cartId, since, limit) as TelemetryRow[];
  },
  /** Prune rows older than the given cutoff (ms since epoch). Returns row count deleted. */
  pruneOlderThan(cutoffMs: number): number {
    const r = getDb().prepare('DELETE FROM telemetry WHERE ts < ?').run(cutoffMs);
    return r.changes;
  },
};
