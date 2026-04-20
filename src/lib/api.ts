/**
 * Typed REST client for the Caddy Control backend.
 */

import type { AlertEvent, Cart, Driver, Fence } from './telemetry';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer';
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

export interface Booking {
  id: number;
  cart_id: string;
  driver_id: number | null;
  user_id: number | null;
  starts_at: number;
  ends_at: number;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  note: string | null;
  created_at: number;
}

let token: string | null = null;
try {
  token = localStorage.getItem('caddy_token');
} catch {
  // ignore (SSR or quota)
}

export function getToken(): string | null {
  return token;
}
export function setToken(t: string | null): void {
  token = t;
  try {
    if (t) localStorage.setItem('caddy_token', t);
    else localStorage.removeItem('caddy_token');
  } catch {
    // ignore
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: { authRequired?: boolean } = { authRequired: true }
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.authRequired !== false && token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    setToken(null);
    throw new Error('unauthenticated');
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error ?? JSON.stringify(j);
    } catch {
      // ignore
    }
    throw new Error(`${method} ${path}: ${res.status} ${msg}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthUser }>('POST', '/auth/login', { email, password }, {
      authRequired: false,
    }),
  me: () => request<{ user: AuthUser }>('GET', '/auth/me'),

  carts: () => request<Cart[]>('GET', '/carts'),
  patchCart: (cartId: string, body: Partial<{ name: string; driverId: number | null; vehicleTag: string | null; notes: string | null; imei: string | null }>) =>
    request<{ ok: true }>('PATCH', `/carts/${cartId}`, body),

  fences: () => request<Fence[]>('GET', '/fences'),
  createFence: (body: { name: string; lat: number; lng: number; radiusM: number; flag?: number; enabled?: boolean }) =>
    request<Fence>('POST', '/fences', body),
  updateFence: (idx: number, body: Partial<{ name: string; lat: number; lng: number; radiusM: number; flag: number; enabled: boolean }>) =>
    request<Fence>('PATCH', `/fences/${idx}`, body),
  deleteFence: (idx: number) => request<{ ok: true }>('DELETE', `/fences/${idx}`),

  alerts: (opts: { cartId?: string; status?: string; limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.cartId) q.set('cartId', opts.cartId);
    if (opts.status) q.set('status', opts.status);
    if (opts.limit !== undefined) q.set('limit', String(opts.limit));
    if (opts.offset !== undefined) q.set('offset', String(opts.offset));
    const s = q.toString();
    return request<{ items: AlertEvent[]; total: number }>('GET', `/alerts${s ? '?' + s : ''}`);
  },
  ackAlert: (id: number) => request<{ ok: true }>('POST', `/alerts/${id}/acknowledge`),
  resolveAlert: (id: number) => request<{ ok: true }>('POST', `/alerts/${id}/resolve`),

  bypass: (cartId: string, durationMs = 15000) =>
    request<{ ok: boolean; reason?: string; bypassId?: number }>('POST', '/bypass', { cartId, durationMs }),

  drivers: () => request<Driver[]>('GET', '/drivers'),
  createDriver: (body: Partial<Driver> & { name: string }) =>
    request<Driver>('POST', '/drivers', { name: body.name, role: body.role ?? null, avatarUrl: body.avatarUrl ?? null }),
  updateDriver: (id: number, body: Partial<Driver>) =>
    request<Driver>('PATCH', `/drivers/${id}`, body),

  bookings: (opts: { from?: number; to?: number; cartId?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.from !== undefined) q.set('from', String(opts.from));
    if (opts.to !== undefined) q.set('to', String(opts.to));
    if (opts.cartId) q.set('cartId', opts.cartId);
    const s = q.toString();
    return request<Booking[]>('GET', `/bookings${s ? '?' + s : ''}`);
  },
  createBooking: (body: { cartId: string; driverId?: number | null; startsAt: number; endsAt: number; note?: string | null }) =>
    request<Booking>('POST', '/bookings', body),
  updateBooking: (id: number, body: { status: Booking['status'] }) =>
    request<Booking>('PATCH', `/bookings/${id}`, body),
  deleteBooking: (id: number) => request<{ ok: true }>('DELETE', `/bookings/${id}`),

  leaderboard: (window: 'day' | 'week' | 'month' = 'day') =>
    request<LeaderboardRow[]>('GET', `/leaderboard?window=${window}`),

  users: () => request<Array<{ id: number; email: string; name: string; role: string }>>('GET', '/users'),
  createUser: (body: { email: string; name: string; password: string; role: 'admin' | 'operator' | 'viewer' }) =>
    request<{ id: number; email: string; name: string; role: string }>('POST', '/users', body),
};
