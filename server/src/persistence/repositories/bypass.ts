import { getDb } from '../db.js';

export interface BypassRow {
  id: number;
  cart_id: string;
  issued_by: number | null;
  issued_at: number;
  duration_ms: number;
  ack_at: number | null;
  result: string | null;
}

export const bypassRepo = {
  create(row: Omit<BypassRow, 'id' | 'ack_at' | 'result'>): BypassRow {
    const r = getDb()
      .prepare(
        `INSERT INTO bypass_events (cart_id, issued_by, issued_at, duration_ms)
         VALUES (?, ?, ?, ?)`
      )
      .run(row.cart_id, row.issued_by, row.issued_at, row.duration_ms);
    return getDb()
      .prepare('SELECT * FROM bypass_events WHERE id = ?')
      .get(r.lastInsertRowid as number) as BypassRow;
  },
  ack(id: number, result: string): void {
    getDb()
      .prepare('UPDATE bypass_events SET ack_at=?, result=? WHERE id=?')
      .run(Date.now(), result, id);
  },
  recent(cartId: string, limit = 20): BypassRow[] {
    return getDb()
      .prepare(
        'SELECT * FROM bypass_events WHERE cart_id=? ORDER BY issued_at DESC LIMIT ?'
      )
      .all(cartId, limit) as BypassRow[];
  },
};
