/**
 * TCP listener for iStartek devices.
 *
 * Responsibilities:
 *  - Accept connections
 *  - Per-socket FrameBuffer → decodeEvent
 *  - On first known device ID, register + provision
 *  - For 010/020 frames, auto-emit an ack with the matching pack-no
 *  - Route decoded events through the eventPipeline
 *  - Route 900 reply frames to the bypass ack handler
 */

import net from 'node:net';
import { FrameBuffer } from './frameBuffer.js';
import { decodeEvent, encodeAck } from './iStartekCodec.js';
import { register, unregisterSocket, touch } from '../fleet/deviceRegistry.js';
import { provisionDevice } from '../fleet/provisioning.js';
import { handleEvent } from '../telemetry/eventPipeline.js';
import { handleBypassAck } from '../fleet/bypass.js';
import { logger, tapRawPacket } from '../util/logger.js';
import { config } from '../util/config.js';

export function startTcpServer(): net.Server {
  const server = net.createServer((socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.info({ remote }, 'device connected');

    const fb = new FrameBuffer();
    let boundCartId: string | null = null;
    let boundDeviceId: string | null = null;
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30_000);

    socket.on('data', (chunk) => {
      for (const line of fb.push(chunk)) {
        tapRawPacket('rx', remote, line);
        // Events start with '&&'; command replies (tracker to server) also use '&&'
        // per spec but the cmd field holds the command code (e.g. 900,OK).
        // We detect an event-vs-reply by whether the cmd field is 000/010/020
        // (event) or a 3-digit code (reply).
        handleLine(socket, line);
      }
    });

    function handleLine(sock: net.Socket, line: string): void {
      // Attempt event decode (000/010/020 frames).
      const decoded = decodeEvent(line);
      if (decoded.ok) {
        const ev = decoded.event;
        // Bind the device if it's our first sight of it.
        if (!boundCartId) {
          boundCartId = register(ev.deviceId, sock);
          boundDeviceId = ev.deviceId;
          if (boundCartId) {
            provisionDevice(sock, ev.deviceId, boundCartId);
          } else {
            logger.warn({ deviceId: ev.deviceId }, 'no cart slot available; dropping device');
            sock.destroy();
            return;
          }
        }
        touch(ev.deviceId);

        // Ack if required.
        const ack = encodeAck(ev);
        if (ack) {
          tapRawPacket('tx', remote, ack.toString('ascii').replace(/\r\n$/, ''));
          sock.write(ack);
        }

        if (boundCartId) handleEvent(boundCartId, ev);
        return;
      }

      // Attempt to parse as a command reply: "&&<pn><len>,<ID>,<cmd>,<result>...<cs>"
      // For replies we care about: 900 (bypass ack), 808 (param readback).
      const m = line.match(/^&&.(\d+),([^,]+),(\d{3}),(.+?)([0-9A-F]{2})$/);
      if (m) {
        const deviceId = m[2]!;
        const cmd = m[3]!;
        const rest = m[4]!;
        if (cmd === '900') {
          if (boundCartId) handleBypassAck(boundCartId, rest.replace(/,$/, ''));
          return;
        }
        if (cmd === '808') {
          logger.info({ deviceId, params: rest }, '808 parameter readback');
          return;
        }
        logger.debug({ cmd, deviceId, rest }, 'command reply');
        return;
      }

      logger.warn({ reason: (decoded as any).reason, line }, 'unparsable frame');
    }

    socket.on('error', (err) => {
      logger.warn({ remote, err: err.message }, 'socket error');
    });

    socket.on('close', () => {
      unregisterSocket(socket);
      logger.info({ remote, cartId: boundCartId }, 'device disconnected');
    });
  });

  server.listen(config.tcpPort, '0.0.0.0', () => {
    logger.info({ port: config.tcpPort }, 'TCP server listening for VT-100 devices');
  });

  return server;
}
