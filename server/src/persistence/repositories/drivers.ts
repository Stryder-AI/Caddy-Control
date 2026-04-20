import { getDb } from '../db.js';

export interface DriverRow {
  id: number;
  name: string;
  avatar_url: string | null;
  role: string | null;
  phone: string | null;
  notes: string | null;
  created_at: number;
}

export const driversRepo = {
  list(): DriverRow[] {
    return getDb().prepare('SELECT * FROM drivers ORDER BY name').all() as DriverRow[];
  },
  get(id: number): DriverRow | undefined {
    return getDb()
      .prepare('SELECT * FROM drivers WHERE id = ?')
      .get(id) as DriverRow | undefined;
  },
  create(row: Omit<DriverRow, 'id' | 'created_at'>): DriverRow {
    const r = getDb()
      .prepare(
        `INSERT INTO drivers (name, avatar_url, role, phone, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(row.name, row.avatar_url, row.role, row.phone, row.notes, Date.now());
    return driversRepo.get(r.lastInsertRowid as number)!;
  },
  update(id: number, patch: Partial<Omit<DriverRow, 'id' | 'created_at'>>): void {
    const d = driversRepo.get(id);
    if (!d) throw new Error('driver not found');
    const m = { ...d, ...patch };
    getDb()
      .prepare(
        `UPDATE drivers SET name=?, avatar_url=?, role=?, phone=?, notes=? WHERE id=?`
      )
      .run(m.name, m.avatar_url, m.role, m.phone, m.notes, id);
  },
  delete(id: number): void {
    getDb().prepare('DELETE FROM drivers WHERE id=?').run(id);
  },
};
