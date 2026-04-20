/**
 * Fastify HTTP server: REST endpoints for dashboard hydration and writes.
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import bcrypt from 'bcrypt';
import { z } from 'zod';

import { config } from '../util/config.js';
import { logger } from '../util/logger.js';
import { cartsRepo, cartStateRepo } from '../persistence/repositories/carts.js';
import { fencesRepo } from '../persistence/repositories/fences.js';
import { alertsRepo } from '../persistence/repositories/alerts.js';
import { bookingsRepo } from '../persistence/repositories/bookings.js';
import { tripsRepo } from '../persistence/repositories/trips.js';
import { driversRepo } from '../persistence/repositories/drivers.js';
import { usersRepo, type UserRole } from '../persistence/repositories/users.js';
import { bypassRepo } from '../persistence/repositories/bypass.js';
import { broadcast, connectedClientCount } from './ws.js';
import { bypass } from '../fleet/bypass.js';
import { repushFencesToAll } from '../fleet/provisioning.js';
import { sign as signJwt } from './jwtLite.js';
import type { AuthPayload } from '../auth/jwt.js';
import { connectedCartIds } from '../fleet/deviceRegistry.js';

export async function buildHttp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: config.frontendOrigin,
    credentials: true,
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  const roleGuard = (roles: UserRole[]) => async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    const user = req.user as AuthPayload;
    if (!roles.includes(user.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  };
  const anyAuth = roleGuard(['admin', 'operator', 'viewer']);
  const adminOnly = roleGuard(['admin']);
  const operatorOrAdmin = roleGuard(['admin', 'operator']);

  // ---------- Health ----------
  app.get('/health', async () => ({
    ok: true,
    ts: Date.now(),
    connectedCarts: connectedCartIds().length,
    wsClients: connectedClientCount(),
  }));

  // ---------- Auth ----------
  const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
  app.post('/auth/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad input' });
    const { email, password } = parsed.data;
    const user = usersRepo.getByEmail(email);
    if (!user) return reply.code(401).send({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.pwd_hash);
    if (!ok) return reply.code(401).send({ error: 'invalid credentials' });
    const payload: AuthPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const token = signJwt(payload as unknown as Record<string, unknown>, 60 * 60 * 24 * 7);
    return { token, user: payload };
  });
  app.get('/auth/me', { preHandler: anyAuth }, async (req) => {
    return { user: req.user };
  });

  // ---------- Users (admin only) ----------
  app.get('/users', { preHandler: adminOnly }, async () => {
    return usersRepo.list().map(({ pwd_hash, ...rest }) => rest);
  });
  app.post('/users', { preHandler: adminOnly }, async (req, reply) => {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().min(1),
      password: z.string().min(6),
      role: z.enum(['admin', 'operator', 'viewer']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad input' });
    const hash = await bcrypt.hash(parsed.data.password, 10);
    const u = usersRepo.create({
      email: parsed.data.email,
      name: parsed.data.name,
      pwd_hash: hash,
      role: parsed.data.role,
    });
    const { pwd_hash: _, ...rest } = u;
    return rest;
  });

  // ---------- Carts ----------
  app.get('/carts', { preHandler: anyAuth }, async () => {
    const carts = cartsRepo.list();
    const states = new Map(cartStateRepo.list().map((s) => [s.cart_id, s]));
    const drivers = new Map(driversRepo.list().map((d) => [d.id, d]));
    return carts.map((c) => {
      const s = states.get(c.cart_id);
      const d = c.driver_id ? drivers.get(c.driver_id) : null;
      return {
        cartId: c.cart_id,
        name: c.name,
        imei: c.imei,
        vehicleTag: c.vehicle_tag,
        notes: c.notes,
        driver: d ? { id: d.id, name: d.name, role: d.role, avatarUrl: d.avatar_url } : null,
        state: s
          ? {
              ts: s.ts,
              lat: s.lat,
              lng: s.lng,
              speedKph: s.speed_kph,
              course: s.course,
              batteryPct: s.battery_pct,
              extV: s.ext_v,
              batV: s.bat_v,
              satellites: s.sat,
              hdop: s.hdop,
              odometerKm: s.odometer_m ? Math.round(s.odometer_m / 10) / 100 : 0,
              inSta: s.in_sta,
              outSta: s.out_sta,
              status: s.status,
              bypassActive: !!s.bypass_active,
              bypassEndsAt: s.bypass_ends_at,
              lastAlmCode: s.last_alm_code,
              connected: !!s.connected,
            }
          : null,
      };
    });
  });

  app.patch('/carts/:cartId', { preHandler: adminOnly }, async (req, reply) => {
    const { cartId } = req.params as { cartId: string };
    const schema = z.object({
      name: z.string().optional(),
      driverId: z.number().int().nullable().optional(),
      vehicleTag: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      imei: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad input' });
    cartsRepo.update(cartId, {
      name: parsed.data.name,
      driver_id: parsed.data.driverId ?? null,
      vehicle_tag: parsed.data.vehicleTag ?? null,
      notes: parsed.data.notes ?? null,
      imei: parsed.data.imei ?? null,
    });
    return { ok: true };
  });

  // ---------- Fences ----------
  app.get('/fences', { preHandler: anyAuth }, async () => fencesRepo.list());
  app.post('/fences', { preHandler: adminOnly }, async (req, reply) => {
    const schema = z.object({
      idx: z.number().int().min(1).max(8).optional(),
      name: z.string().min(1),
      lat: z.number(),
      lng: z.number(),
      radiusM: z.number().min(10).max(5000),
      flag: z.number().int().min(1).max(3).default(2),
      enabled: z.boolean().default(true),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad input', details: parsed.error.flatten() });
    const idx = parsed.data.idx ?? fencesRepo.nextIndex();
    fencesRepo.upsert({
      idx,
      name: parsed.data.name,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      radius_m: parsed.data.radiusM,
      flag: parsed.data.flag,
      enabled: parsed.data.enabled ? 1 : 0,
    });
    broadcast('fence:updated', { idx });
    repushFencesToAll();
    return fencesRepo.get(idx);
  });
  app.patch('/fences/:idx', { preHandler: adminOnly }, async (req, reply) => {
    const idx = parseInt((req.params as { idx: string }).idx, 10);
    const existing = fencesRepo.get(idx);
    if (!existing) return reply.code(404).send({ error: 'not found' });
    const schema = z.object({
      name: z.string().min(1).optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      radiusM: z.number().min(10).max(5000).optional(),
      flag: z.number().int().min(1).max(3).optional(),
      enabled: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad input' });
    fencesRepo.upsert({
      idx,
      name: parsed.data.name ?? existing.name,
      lat: parsed.data.lat ?? existing.lat,
      lng: parsed.data.lng ?? existing.lng,
      radius_m: parsed.data.radiusM ?? existing.radius_m,
      flag: parsed.data.flag ?? existing.flag,
      enabled: parsed.data.enabled !== undefined ? (parsed.data.enabled ? 1 : 0) : existing.enabled,
    });
    broadcast('fence:updated', { idx });
    repushFencesToAll();
    return fencesRepo.get(idx);
  });
  app.delete('/fences/:idx', { preHandler: adminOnly }, async (req) => {
    const idx = parseInt((req.params as { idx: string }).idx, 10);
    fencesRepo.delete(idx);
    broadcast('fence:updated', { idx, deleted: true });
    repushFencesToAll();
    return { ok: true };
  });

  // ---------- Alerts ----------
  app.get('/alerts', { preHandler: anyAuth }, async (req) => {
    const q = req.query as { cartId?: string; status?: string; limit?: string; offset?: string };
    return {
      items: alertsRepo.list({
        cartId: q.cartId,
        status: (q.status as any) ?? 'all',
        limit: q.limit ? parseInt(q.limit, 10) : 100,
        offset: q.offset ? parseInt(q.offset, 10) : 0,
      }),
      total: alertsRepo.count({
        cartId: q.cartId,
        status: (q.status as any) ?? 'all',
      }),
    };
  });
  app.post('/alerts/:id/acknowledge', { preHandler: operatorOrAdmin }, async (req) => {
    const id = parseInt((req.params as { id: string }).id, 10);
    const user = req.user as AuthPayload;
    alertsRepo.acknowledge(id, user.id);
    broadcast('alert:update', { id, status: 'acknowledged' });
    return { ok: true };
  });
  app.post('/alerts/:id/resolve', { preHandler: operatorOrAdmin }, async (req) => {
    const id = parseInt((req.params as { id: string }).id, 10);
    const user = req.user as AuthPayload;
    alertsRepo.resolve(id, user.id);
    broadcast('alert:update', { id, status: 'resolved' });
    return { ok: true };
  });

  // ---------- Bypass ----------
  app.post('/bypass', { preHandler: operatorOrAdmin }, async (req, reply) => {
    const schema = z.object({
      cartId: z.string().min(1),
      durationMs: z.number().int().min(1000).max(60000).default(15000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad input' });
    const user = req.user as AuthPayload;
    const res = bypass(parsed.data.cartId, parsed.data.durationMs, user.id);
    if (!res.ok) return reply.code(409).send(res);
    return res;
  });
  app.get('/bypass/:cartId/history', { preHandler: anyAuth }, async (req) => {
    const { cartId } = req.params as { cartId: string };
    return bypassRepo.recent(cartId, 50);
  });

  // ---------- Drivers ----------
  app.get('/drivers', { preHandler: anyAuth }, async () => driversRepo.list());
  app.post('/drivers', { preHandler: adminOnly }, async (req, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      role: z.string().nullable().optional(),
      avatarUrl: z.string().url().nullable().optional(),
      phone: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad input' });
    return driversRepo.create({
      name: parsed.data.name,
      role: parsed.data.role ?? null,
      avatar_url: parsed.data.avatarUrl ?? null,
      phone: parsed.data.phone ?? null,
      notes: parsed.data.notes ?? null,
    });
  });
  app.patch('/drivers/:id', { preHandler: adminOnly }, async (req, reply) => {
    const id = parseInt((req.params as { id: string }).id, 10);
    const schema = z.object({
      name: z.string().optional(),
      role: z.string().nullable().optional(),
      avatarUrl: z.string().url().nullable().optional(),
      phone: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad input' });
    driversRepo.update(id, {
      name: parsed.data.name,
      role: parsed.data.role ?? null,
      avatar_url: parsed.data.avatarUrl ?? null,
      phone: parsed.data.phone ?? null,
      notes: parsed.data.notes ?? null,
    });
    return driversRepo.get(id);
  });
  app.delete('/drivers/:id', { preHandler: adminOnly }, async (req) => {
    const id = parseInt((req.params as { id: string }).id, 10);
    driversRepo.delete(id);
    return { ok: true };
  });

  // ---------- Bookings ----------
  app.get('/bookings', { preHandler: anyAuth }, async (req) => {
    const q = req.query as { from?: string; to?: string; cartId?: string };
    return bookingsRepo.list({
      from: q.from ? parseInt(q.from, 10) : undefined,
      to: q.to ? parseInt(q.to, 10) : undefined,
      cartId: q.cartId,
    });
  });
  app.post('/bookings', { preHandler: operatorOrAdmin }, async (req, reply) => {
    const schema = z.object({
      cartId: z.string().min(1),
      driverId: z.number().int().nullable().optional(),
      startsAt: z.number().int(),
      endsAt: z.number().int(),
      note: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad input', details: parsed.error.flatten() });
    if (parsed.data.endsAt <= parsed.data.startsAt) {
      return reply.code(400).send({ error: 'endsAt must be > startsAt' });
    }
    const conflicts = bookingsRepo.conflicts(parsed.data.cartId, parsed.data.startsAt, parsed.data.endsAt);
    if (conflicts.length > 0) return reply.code(409).send({ error: 'time slot conflict', conflicts });
    const user = req.user as AuthPayload;
    const row = bookingsRepo.create({
      cart_id: parsed.data.cartId,
      driver_id: parsed.data.driverId ?? null,
      user_id: user.id,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      status: 'scheduled',
      note: parsed.data.note ?? null,
    });
    broadcast('booking:updated', { id: row.id });
    return row;
  });
  app.patch('/bookings/:id', { preHandler: operatorOrAdmin }, async (req, reply) => {
    const id = parseInt((req.params as { id: string }).id, 10);
    const schema = z.object({ status: z.enum(['scheduled', 'active', 'completed', 'cancelled']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad input' });
    bookingsRepo.updateStatus(id, parsed.data.status);
    broadcast('booking:updated', { id });
    return bookingsRepo.get(id);
  });
  app.delete('/bookings/:id', { preHandler: operatorOrAdmin }, async (req) => {
    const id = parseInt((req.params as { id: string }).id, 10);
    bookingsRepo.delete(id);
    broadcast('booking:updated', { id, deleted: true });
    return { ok: true };
  });

  // ---------- Leaderboard ----------
  app.get('/leaderboard', { preHandler: anyAuth }, async (req) => {
    const q = req.query as { window?: 'day' | 'week' | 'month' };
    const now = Date.now();
    const windowMs =
      q.window === 'month' ? 30 * 86400_000 : q.window === 'week' ? 7 * 86400_000 : 86400_000;
    const rows = tripsRepo.leaderboard(now - windowMs, now);
    return rows;
  });

  // ---------- Error handler ----------
  app.setErrorHandler((err, _req, reply) => {
    logger.error({ err }, 'http error');
    reply.code(500).send({ error: 'internal', message: err.message });
  });

  return app;
}
