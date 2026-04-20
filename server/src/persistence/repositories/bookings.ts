import { getDb } from '../db.js';

export type BookingStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

export interface BookingRow {
  id: number;
  cart_id: string;
  driver_id: number | null;
  user_id: number | null;
  starts_at: number;
  ends_at: number;
  status: BookingStatus;
  note: string | null;
  created_at: number;
}

export const bookingsRepo = {
  list(opts: { from?: number; to?: number; cartId?: string } = {}): BookingRow[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (opts.from !== undefined) {
      where.push('ends_at >= ?');
      args.push(opts.from);
    }
    if (opts.to !== undefined) {
      where.push('starts_at <= ?');
      args.push(opts.to);
    }
    if (opts.cartId) {
      where.push('cart_id = ?');
      args.push(opts.cartId);
    }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    return getDb()
      .prepare(`SELECT * FROM bookings ${clause} ORDER BY starts_at ASC`)
      .all(...args) as BookingRow[];
  },
  get(id: number): BookingRow | undefined {
    return getDb()
      .prepare('SELECT * FROM bookings WHERE id = ?')
      .get(id) as BookingRow | undefined;
  },
  conflicts(cartId: string, startsAt: number, endsAt: number, excludeId?: number): BookingRow[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM bookings
         WHERE cart_id = ? AND status <> 'cancelled'
           AND starts_at < ? AND ends_at > ?
           ${excludeId ? 'AND id <> ?' : ''}`
      )
      .all(...(excludeId ? [cartId, endsAt, startsAt, excludeId] : [cartId, endsAt, startsAt])) as BookingRow[];
    return rows;
  },
  create(row: Omit<BookingRow, 'id' | 'created_at'>): BookingRow {
    const r = getDb()
      .prepare(
        `INSERT INTO bookings (cart_id, driver_id, user_id, starts_at, ends_at, status, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.cart_id,
        row.driver_id,
        row.user_id,
        row.starts_at,
        row.ends_at,
        row.status,
        row.note,
        Date.now()
      );
    return bookingsRepo.get(r.lastInsertRowid as number)!;
  },
  updateStatus(id: number, status: BookingStatus): void {
    getDb().prepare('UPDATE bookings SET status=? WHERE id=?').run(status, id);
  },
  delete(id: number): void {
    getDb().prepare('DELETE FROM bookings WHERE id=?').run(id);
  },
};
