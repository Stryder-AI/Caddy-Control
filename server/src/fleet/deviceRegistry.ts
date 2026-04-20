/**
 * Maps { IMEI | device-ID } ↔ { cartId, live socket }.
 *
 * Policy: the iStartek device-ID is by default the IMEI, but command 110 lets
 * us rename it. We make every tracker authoritative about its own ID; on first
 * connect from an unknown ID we bind it to the lowest free cart slot (01..38)
 * and persist the IMEI on that cart row. Reconnects are idempotent.
 */

import type { Socket } from 'node:net';
import { cartsRepo, cartStateRepo } from '../persistence/repositories/carts.js';
import { logger } from '../util/logger.js';

interface Binding {
  cartId: string;
  deviceId: string; // as reported by the tracker (ID column)
  socket: Socket;
  lastPacketAt: number;
}

const byDeviceId = new Map<string, Binding>();
const byCartId = new Map<string, Binding>();

export function resolveCartId(deviceId: string): string | null {
  const existing = cartsRepo.getByImei(deviceId);
  if (existing) return existing.cart_id;

  // Not yet bound. Pick lowest cart with null IMEI.
  const all = cartsRepo.list();
  const free = all.find((c) => !c.imei);
  if (!free) {
    logger.warn({ deviceId }, 'no free cart slot for new device');
    return null;
  }
  cartsRepo.setImei(free.cart_id, deviceId);
  logger.info({ cartId: free.cart_id, deviceId }, 'bound new device to cart slot');
  return free.cart_id;
}

export function register(deviceId: string, socket: Socket): string | null {
  const cartId = resolveCartId(deviceId);
  if (!cartId) return null;

  // Kick any stale socket for the same device.
  const prev = byDeviceId.get(deviceId);
  if (prev && prev.socket !== socket) {
    try {
      prev.socket.destroy();
    } catch {
      // ignore
    }
  }

  const binding: Binding = {
    cartId,
    deviceId,
    socket,
    lastPacketAt: Date.now(),
  };
  byDeviceId.set(deviceId, binding);
  byCartId.set(cartId, binding);
  cartStateRepo.setConnected(cartId, true);
  return cartId;
}

export function unregister(deviceId: string): void {
  const b = byDeviceId.get(deviceId);
  if (!b) return;
  byDeviceId.delete(deviceId);
  byCartId.delete(b.cartId);
  cartStateRepo.setConnected(b.cartId, false);
}

export function unregisterSocket(socket: Socket): void {
  for (const [id, b] of byDeviceId.entries()) {
    if (b.socket === socket) {
      byDeviceId.delete(id);
      byCartId.delete(b.cartId);
      cartStateRepo.setConnected(b.cartId, false);
      logger.info({ cartId: b.cartId, deviceId: id }, 'device disconnected');
      return;
    }
  }
}

export function getSocketForCart(cartId: string): Socket | null {
  return byCartId.get(cartId)?.socket ?? null;
}
export function getDeviceIdForCart(cartId: string): string | null {
  return byCartId.get(cartId)?.deviceId ?? null;
}
export function touch(deviceId: string): void {
  const b = byDeviceId.get(deviceId);
  if (b) b.lastPacketAt = Date.now();
}
export function lastSeen(cartId: string): number | null {
  return byCartId.get(cartId)?.lastPacketAt ?? null;
}
export function connectedCartIds(): string[] {
  return [...byCartId.keys()];
}
