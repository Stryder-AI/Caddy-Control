/**
 * Bypass: momentarily force output1 OFF, which releases the relay that cuts
 * the cart drive wire, so the cart can move again while inside a fence.
 *
 * Wire-level command (V1.6 §900):
 *   900,output,flag,time,safe_speed
 * We send:
 *   900,1,0,<durationMs>,0
 * which means "turn output1 off for N ms at any speed". After the duration
 * the tracker reverts output1 to its configured state (driven by event 26 if
 * still inside fence, else floating).
 *
 * The command reply is `900,OK` / `900,Failed` / `900,Unsupport`. We watch
 * for it on the socket and attach it to the bypass record.
 */

import type { Socket } from 'node:net';
import { encodeCommand } from '../tcp/iStartekCodec.js';
import { bypassRepo } from '../persistence/repositories/bypass.js';
import { cartStateRepo } from '../persistence/repositories/carts.js';
import { alertsRepo } from '../persistence/repositories/alerts.js';
import { getSocketForCart, getDeviceIdForCart } from './deviceRegistry.js';
import { logger, tapRawPacket } from '../util/logger.js';
import { broadcast } from '../api/ws.js';

export interface BypassResult {
  ok: boolean;
  reason?: string;
  bypassId?: number;
}

/**
 * Issue a bypass. `userId` is the operator who triggered it (for audit).
 */
export function bypass(
  cartId: string,
  durationMs: number,
  userId: number | null
): BypassResult {
  const socket = getSocketForCart(cartId);
  const deviceId = getDeviceIdForCart(cartId);
  if (!socket || !deviceId) {
    return { ok: false, reason: 'cart not connected' };
  }

  const row = bypassRepo.create({
    cart_id: cartId,
    issued_by: userId,
    issued_at: Date.now(),
    duration_ms: durationMs,
  });

  const frame = encodeCommand({
    deviceId,
    cmdCode: '900',
    cmdData: `1,0,${durationMs},0`,
  });
  tapRawPacket('tx', `${socket.remoteAddress}:${socket.remotePort}`, frame.toString('ascii').replace(/\r\n$/, ''));
  socket.write(frame);

  const endsAt = Date.now() + durationMs;
  cartStateRepo.setBypass(cartId, true, endsAt);

  alertsRepo.create({
    cart_id: cartId,
    type: 'bypass_triggered',
    severity: 'info',
    title: 'Manual Bypass Triggered',
    message: `Operator released relay for ${Math.round(durationMs / 1000)}s`,
    ts: Date.now(),
  });

  broadcast('bypass:active', {
    cartId,
    endsAt,
    bypassId: row.id,
    userId,
  });

  // Auto-clear bypass state after the duration so the UI reflects reality.
  setTimeout(() => {
    cartStateRepo.setBypass(cartId, false, null);
    broadcast('bypass:ended', { cartId, bypassId: row.id });
  }, durationMs);

  logger.info({ cartId, durationMs, userId, bypassId: row.id }, 'bypass issued');
  return { ok: true, bypassId: row.id };
}

/**
 * Hook called by the codec when a 900 reply frame comes back so we can stamp
 * the bypass row with the actual device ack.
 */
export function handleBypassAck(cartId: string, result: string): void {
  const rows = bypassRepo.recent(cartId, 1);
  const row = rows[0];
  if (!row || row.ack_at) return;
  bypassRepo.ack(row.id, result);
}
