/**
 * Socket.io broadcaster.
 *
 * Events emitted to clients:
 *   cart:position  — every telemetry tick
 *   alert:new      — when an alert is created
 *   alert:update   — when ack/resolve state changes
 *   bypass:active  — when an operator issues a bypass
 *   bypass:ended   — when that bypass window expires
 *   fence:updated  — whenever fences are CRUD'd
 *   cart:connect   — when a device connects
 *   cart:disconnect — when a device drops
 *
 * Events received from clients:
 *   cmd:bypass     — operator/admin trigger a bypass
 *   cmd:ack_alert  — operator/admin acknowledge
 *   cmd:resolve_alert
 */

import { Server as IOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { config } from '../util/config.js';
import { logger } from '../util/logger.js';
import type { AuthPayload } from '../auth/jwt.js';
import { verify as jwtVerify } from './jwtLite.js';
import { bypass } from '../fleet/bypass.js';
import { alertsRepo } from '../persistence/repositories/alerts.js';

let io: IOServer | null = null;

export function initWs(httpServer: HttpServer): IOServer {
  io = new IOServer(httpServer, {
    cors: {
      origin: config.frontendOrigin,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string })?.token
      ?? socket.handshake.query?.token;
    if (typeof token !== 'string' || !token) return next(new Error('no token'));
    try {
      const user = jwtVerify(token) as unknown as AuthPayload;
      (socket.data as { user: AuthPayload }).user = user;
      next();
    } catch {
      next(new Error('invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as { user: AuthPayload }).user;
    logger.info({ userId: user.id, email: user.email }, 'ws client connected');

    socket.on('cmd:bypass', (payload: { cartId: string; durationMs?: number }, ack) => {
      if (user.role === 'viewer') {
        ack?.({ ok: false, reason: 'forbidden' });
        return;
      }
      const res = bypass(payload.cartId, payload.durationMs ?? 15000, user.id);
      ack?.(res);
    });

    socket.on('cmd:ack_alert', (payload: { alertId: number }, ack) => {
      if (user.role === 'viewer') return ack?.({ ok: false });
      alertsRepo.acknowledge(payload.alertId, user.id);
      broadcast('alert:update', { id: payload.alertId, status: 'acknowledged', userId: user.id });
      ack?.({ ok: true });
    });

    socket.on('cmd:resolve_alert', (payload: { alertId: number }, ack) => {
      if (user.role === 'viewer') return ack?.({ ok: false });
      alertsRepo.resolve(payload.alertId, user.id);
      broadcast('alert:update', { id: payload.alertId, status: 'resolved', userId: user.id });
      ack?.({ ok: true });
    });

    socket.on('disconnect', () => {
      logger.info({ userId: user.id }, 'ws client disconnected');
    });
  });

  logger.info('Socket.io initialized');
  return io;
}

export function broadcast(event: string, payload: unknown): void {
  if (!io) return;
  io.emit(event, payload);
}

export function connectedClientCount(): number {
  return io?.engine.clientsCount ?? 0;
}
