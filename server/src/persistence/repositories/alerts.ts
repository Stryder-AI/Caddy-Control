import { getDb } from '../db.js';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'new' | 'acknowledged' | 'resolved';
export type AlertType =
  | 'low_battery'
  | 'danger_zone'
  | 'tracker_offline'
  | 'bypass_triggered'
  | 'speeding'
  | 'power_cut'
  | 'harsh_brake'
  | 'harsh_accel'
  | 'fence_mismatch'
  | 'gps_lost';

export interface AlertRow {
  id: number;
  cart_id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  status: AlertStatus;
  ts: number;
  ack_by: number | null;
  ack_at: number | null;
  resolved_by: number | null;
  resolved_at: number | null;
}

export const alertsRepo = {
  create(a: Omit<AlertRow, 'id' | 'status' | 'ack_by' | 'ack_at' | 'resolved_by' | 'resolved_at'>): AlertRow {
    const result = getDb()
      .prepare(
        `INSERT INTO alerts (cart_id, type, severity, title, message, status, ts)
         VALUES (?, ?, ?, ?, ?, 'new', ?)`
      )
      .run(a.cart_id, a.type, a.severity, a.title, a.message, a.ts);
    return alertsRepo.get(result.lastInsertRowid as number)!;
  },

  get(id: number): AlertRow | undefined {
    return getDb()
      .prepare('SELECT * FROM alerts WHERE id = ?')
      .get(id) as AlertRow | undefined;
  },

  list(opts: {
    cartId?: string;
    status?: AlertStatus | 'all';
    limit?: number;
    offset?: number;
  } = {}): AlertRow[] {
    const { cartId, status, limit = 100, offset = 0 } = opts;
    const where: string[] = [];
    const args: unknown[] = [];
    if (cartId) {
      where.push('cart_id = ?');
      args.push(cartId);
    }
    if (status && status !== 'all') {
      where.push('status = ?');
      args.push(status);
    }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    args.push(limit, offset);
    return getDb()
      .prepare(`SELECT * FROM alerts ${clause} ORDER BY ts DESC LIMIT ? OFFSET ?`)
      .all(...args) as AlertRow[];
  },

  count(opts: { cartId?: string; status?: AlertStatus | 'all' } = {}): number {
    const { cartId, status } = opts;
    const where: string[] = [];
    const args: unknown[] = [];
    if (cartId) {
      where.push('cart_id = ?');
      args.push(cartId);
    }
    if (status && status !== 'all') {
      where.push('status = ?');
      args.push(status);
    }
    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const r = getDb()
      .prepare(`SELECT COUNT(*) as c FROM alerts ${clause}`)
      .get(...args) as { c: number };
    return r.c;
  },

  acknowledge(id: number, userId: number | null): void {
    getDb()
      .prepare(
        `UPDATE alerts SET status='acknowledged', ack_by=?, ack_at=? WHERE id=? AND status='new'`
      )
      .run(userId, Date.now(), id);
  },
  resolve(id: number, userId: number | null): void {
    getDb()
      .prepare(
        `UPDATE alerts SET status='resolved', resolved_by=?, resolved_at=? WHERE id=? AND status<>'resolved'`
      )
      .run(userId, Date.now(), id);
  },

  /**
   * Dedup helper: returns the last ts (ms) for (cart_id, type), or null.
   * The event pipeline uses this to skip duplicate alarms for the same
   * cart/type within a configurable window.
   */
  lastTs(cartId: string, type: AlertType): number | null {
    const r = getDb()
      .prepare(
        'SELECT ts FROM alerts WHERE cart_id=? AND type=? ORDER BY ts DESC LIMIT 1'
      )
      .get(cartId, type) as { ts: number } | undefined;
    return r?.ts ?? null;
  },
};
