import { getDb } from '../db.js';

export interface TripRow {
  id: number;
  cart_id: string;
  driver_id: number | null;
  started_at: number;
  ended_at: number | null;
  distance_m: number;
  top_speed_kph: number;
  harsh_brake_count: number;
  harsh_accel_count: number;
  bookings_id: number | null;
}

export interface LeaderboardRow {
  driver_id: number | null;
  driver_name: string;
  cart_ids: string;
  total_distance_m: number;
  top_speed_kph: number;
  trip_count: number;
  harsh_events: number;
  avg_speed_kph: number;
}

export const tripsRepo = {
  list(opts: { cartId?: string; driverId?: number; from?: number; to?: number } = {}): TripRow[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (opts.cartId) { where.push('cart_id = ?'); args.push(opts.cartId); }
    if (opts.driverId !== undefined) { where.push('driver_id = ?'); args.push(opts.driverId); }
    if (opts.from !== undefined) { where.push('started_at >= ?'); args.push(opts.from); }
    if (opts.to !== undefined) { where.push('started_at <= ?'); args.push(opts.to); }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    return getDb()
      .prepare(`SELECT * FROM trips ${clause} ORDER BY started_at DESC`)
      .all(...args) as TripRow[];
  },

  getActive(cartId: string): TripRow | undefined {
    return getDb()
      .prepare('SELECT * FROM trips WHERE cart_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1')
      .get(cartId) as TripRow | undefined;
  },

  start(cartId: string, driverId: number | null, bookingsId: number | null = null): TripRow {
    const r = getDb()
      .prepare(
        `INSERT INTO trips (cart_id, driver_id, started_at, bookings_id)
         VALUES (?, ?, ?, ?)`
      )
      .run(cartId, driverId, Date.now(), bookingsId);
    return getDb()
      .prepare('SELECT * FROM trips WHERE id = ?')
      .get(r.lastInsertRowid as number) as TripRow;
  },

  accumulate(tripId: number, distanceM: number, speedKph: number): void {
    getDb()
      .prepare(
        `UPDATE trips SET
           distance_m = distance_m + ?,
           top_speed_kph = MAX(top_speed_kph, ?)
         WHERE id = ?`
      )
      .run(distanceM, speedKph, tripId);
  },

  incrementHarsh(tripId: number, kind: 'brake' | 'accel'): void {
    const col = kind === 'brake' ? 'harsh_brake_count' : 'harsh_accel_count';
    getDb().prepare(`UPDATE trips SET ${col} = ${col} + 1 WHERE id = ?`).run(tripId);
  },

  end(tripId: number): void {
    getDb().prepare('UPDATE trips SET ended_at = ? WHERE id = ? AND ended_at IS NULL').run(Date.now(), tripId);
  },

  /**
   * Driver leaderboard over a time window. Uses MAX(top_speed) across trips
   * and SUM of distance / harsh events. Drivers with no id are grouped under
   * "Unassigned".
   */
  leaderboard(fromTs: number, toTs: number): LeaderboardRow[] {
    return getDb()
      .prepare(
        `SELECT
           t.driver_id,
           COALESCE(d.name, 'Unassigned') AS driver_name,
           GROUP_CONCAT(DISTINCT t.cart_id) AS cart_ids,
           SUM(t.distance_m) AS total_distance_m,
           MAX(t.top_speed_kph) AS top_speed_kph,
           COUNT(*) AS trip_count,
           SUM(t.harsh_brake_count + t.harsh_accel_count) AS harsh_events,
           CASE
             WHEN SUM(COALESCE(t.ended_at, ?) - t.started_at) > 0
             THEN (SUM(t.distance_m) / 1000.0) /
                  (SUM(COALESCE(t.ended_at, ?) - t.started_at) / 3600000.0)
             ELSE 0
           END AS avg_speed_kph
         FROM trips t
         LEFT JOIN drivers d ON d.id = t.driver_id
         WHERE t.started_at >= ? AND t.started_at <= ?
         GROUP BY t.driver_id
         ORDER BY total_distance_m DESC`
      )
      .all(Date.now(), Date.now(), fromTs, toTs) as LeaderboardRow[];
  },
};
