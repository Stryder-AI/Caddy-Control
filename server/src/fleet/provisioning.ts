/**
 * Sends the VT-100 the set of commands required to make our geofence/bypass
 * loop actually work on real hardware.
 *
 * On first connect of a device we ensure:
 *   102  upload interval   (5s moving, 60s ACC off, 30s stopped)
 *   122  heartbeat         (every 300s)
 *   125  geofence(s)       (one per row in `fences` table, up to 8)
 *   126  geofence name
 *   251  output1 mode      (long-on when fired)
 *   212  event->output bind (event 26 = Enter Fence -> output1)
 *
 * Per V1.6 §900 remark 05, the bypass command (900) takes priority over any
 * event-driven output state set via 212, which is what makes the bypass work
 * even while the cart is still inside the fence.
 *
 * We call this once per freshly-connected device. It is idempotent — re-sending
 * the same parameters to a device that already has them is a no-op on-device.
 */

import type { Socket } from 'node:net';
import { encodeCommand } from '../tcp/iStartekCodec.js';
import { fencesRepo } from '../persistence/repositories/fences.js';
import { logger } from '../util/logger.js';
import { tapRawPacket } from '../util/logger.js';

function send(socket: Socket, deviceId: string, cmdCode: string, cmdData?: string): void {
  const frame = encodeCommand({ deviceId, cmdCode, cmdData });
  const s = frame.toString('ascii').replace(/\r\n$/, '');
  tapRawPacket('tx', `${socket.remoteAddress}:${socket.remotePort}`, s);
  socket.write(frame);
}

export function provisionDevice(socket: Socket, deviceId: string, cartId: string): void {
  logger.info({ cartId, deviceId }, 'provisioning device');

  // Upload cadence: 5s while moving, 60s ACC off, 30s stopped.
  send(socket, deviceId, '102', '5,60,30');

  // Heartbeat every 5 minutes.
  send(socket, deviceId, '122', '300');

  // Configure output1 as "long on" (mode=1) indefinite when fired.
  send(socket, deviceId, '251', '1,1,0,0,0,0');

  // Push each enabled fence.
  const fences = fencesRepo.listEnabled();
  // Also delete any fences above the current count (127,index) so stale fences
  // from a previous provisioning don't linger.
  for (let i = fences.length + 1; i <= 8; i++) {
    send(socket, deviceId, '127', String(i));
  }
  for (const f of fences) {
    send(
      socket,
      deviceId,
      '125',
      `${f.idx},${f.flag},${Math.round(f.radius_m)},${f.lat.toFixed(6)},${f.lng.toFixed(6)}`
    );
    send(socket, deviceId, '126', `${f.idx},${f.name}`);
  }

  // Tie output1 to event 26 (Enter Fence). operation=1 = set exact list.
  send(socket, deviceId, '212', '1,1,26');

  // Read back parameters so we can verify in logs.
  send(socket, deviceId, '808');
}

/**
 * Called after any fence CRUD from the UI — pushes the updated fence table
 * to every currently-connected device.
 */
export function repushFencesToAll(): void {
  // Deferred import to avoid a circular dependency through deviceRegistry.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  import('./deviceRegistry.js').then((mod) => {
    for (const cartId of mod.connectedCartIds()) {
      const socket = mod.getSocketForCart(cartId);
      const deviceId = mod.getDeviceIdForCart(cartId);
      if (socket && deviceId) provisionDevice(socket, deviceId, cartId);
    }
  });
}
