import { getDb } from '../db.js';

export interface FenceRow {
  idx: number;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  flag: number;
  enabled: number;
  updated_at: number;
}

export const fencesRepo = {
  list(): FenceRow[] {
    return getDb().prepare('SELECT * FROM fences ORDER BY idx').all() as FenceRow[];
  },
  listEnabled(): FenceRow[] {
    return getDb()
      .prepare('SELECT * FROM fences WHERE enabled = 1 ORDER BY idx')
      .all() as FenceRow[];
  },
  get(idx: number): FenceRow | undefined {
    return getDb()
      .prepare('SELECT * FROM fences WHERE idx = ?')
      .get(idx) as FenceRow | undefined;
  },
  upsert(row: Omit<FenceRow, 'updated_at'> & { updated_at?: number }): void {
    const now = Date.now();
    getDb()
      .prepare(
        `INSERT INTO fences (idx, name, lat, lng, radius_m, flag, enabled, updated_at)
         VALUES (@idx, @name, @lat, @lng, @radius_m, @flag, @enabled, @updated_at)
         ON CONFLICT(idx) DO UPDATE SET
           name = excluded.name,
           lat = excluded.lat,
           lng = excluded.lng,
           radius_m = excluded.radius_m,
           flag = excluded.flag,
           enabled = excluded.enabled,
           updated_at = excluded.updated_at`
      )
      .run({ ...row, updated_at: row.updated_at ?? now });
  },
  delete(idx: number): void {
    getDb().prepare('DELETE FROM fences WHERE idx = ?').run(idx);
  },
  nextIndex(): number {
    const row = getDb()
      .prepare('SELECT COALESCE(MAX(idx), 0) as m FROM fences')
      .get() as { m: number };
    return Math.min(8, row.m + 1);
  },
};
