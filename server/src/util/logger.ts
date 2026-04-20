import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';

const level = process.env.LOG_LEVEL ?? 'info';
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level,
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
    : undefined,
});

/**
 * Append raw bytes-on-the-wire to a tap file for hardware debugging.
 * Never used in the happy-path hot loop output — writes lazily.
 */
const rawLogPath = process.env.RAW_PACKET_LOG ?? './logs/packets.log';
try {
  fs.mkdirSync(path.dirname(rawLogPath), { recursive: true });
} catch {
  // ignore
}
let rawStream: fs.WriteStream | null = null;
function getRawStream(): fs.WriteStream {
  if (!rawStream) rawStream = fs.createWriteStream(rawLogPath, { flags: 'a' });
  return rawStream;
}
export function tapRawPacket(direction: 'rx' | 'tx', remote: string, data: string): void {
  const ts = new Date().toISOString();
  getRawStream().write(`${ts} ${direction} ${remote} ${data}\n`);
}
