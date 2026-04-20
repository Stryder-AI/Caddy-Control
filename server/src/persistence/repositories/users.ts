import { getDb } from '../db.js';

export type UserRole = 'admin' | 'operator' | 'viewer';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  pwd_hash: string;
  role: UserRole;
  created_at: number;
}

export const usersRepo = {
  list(): UserRow[] {
    return getDb().prepare('SELECT * FROM users ORDER BY id').all() as UserRow[];
  },
  get(id: number): UserRow | undefined {
    return getDb()
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as UserRow | undefined;
  },
  getByEmail(email: string): UserRow | undefined {
    return getDb()
      .prepare('SELECT * FROM users WHERE lower(email) = lower(?)')
      .get(email) as UserRow | undefined;
  },
  create(row: Omit<UserRow, 'id' | 'created_at'>): UserRow {
    const now = Date.now();
    const r = getDb()
      .prepare(
        `INSERT INTO users (email, name, pwd_hash, role, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(row.email, row.name, row.pwd_hash, row.role, now);
    return usersRepo.get(r.lastInsertRowid as number)!;
  },
  update(id: number, patch: Partial<Pick<UserRow, 'name' | 'role' | 'pwd_hash'>>): void {
    const u = usersRepo.get(id);
    if (!u) throw new Error('user not found');
    const merged = { ...u, ...patch };
    getDb()
      .prepare('UPDATE users SET name=?, role=?, pwd_hash=? WHERE id=?')
      .run(merged.name, merged.role, merged.pwd_hash, id);
  },
  delete(id: number): void {
    getDb().prepare('DELETE FROM users WHERE id=?').run(id);
  },
};
