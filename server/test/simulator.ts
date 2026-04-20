/**
 * iStartek TCP simulator — spins up N fake trackers that connect to our
 * server and emit valid '&&' event frames at realistic cadence.
 *
 * Usage:
 *   tsx test/simulator.ts [N] [--fence-cross]
 *
 * Each fake tracker has its own IMEI (865000000000001 .. +N-1), roams on
 * a random walk around the default course center, and ~5% of the time
 * crosses the first fence (if you pass --fence-cross). When that happens,
 * the simulator sends an alm-code=26 packet to exercise the danger-zone
 * pipeline. The simulator also listens for `$$...900,1,0,...` on the
 * socket so it can emulate the relay release.
 */

import net from 'node:net';
import process from 'node:process';

const HOST = process.env.SIM_HOST ?? '127.0.0.1';
const PORT = parseInt(process.env.TCP_PORT ?? '8800', 10);
const N = parseInt(process.argv[2] ?? '38', 10);
const FENCE_CROSS = process.argv.includes('--fence-cross');

// Match the default fence in seed.ts.
const CENTER = { lat: 33.444406, lng: 72.862765 };
const FENCE_RADIUS_M = 300;

// -- Helpers --
function checksum(s: string): string {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum = (sum + s.charCodeAt(i)) & 0xffff;
  return (sum & 0xff).toString(16).toUpperCase().padStart(2, '0');
}
function nowDateTime(): string {
  const d = new Date();
  const yy = String(d.getUTCFullYear() - 2000).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}${hh}${mi}${ss}`;
}
function toHex4(n: number): string {
  return Math.max(0, Math.min(0xffff, Math.round(n))).toString(16).toUpperCase().padStart(4, '0');
}

let packNo = 0x3a;
function nextPackNo(): string {
  const ch = String.fromCharCode(packNo);
  packNo = packNo + 1;
  if (packNo > 0x7e) packNo = 0x3a;
  return ch;
}

// -- Per-tracker state --
interface TrackerState {
  imei: string;
  lat: number;
  lng: number;
  heading: number;
  speedKph: number;
  odoM: number;
  extVoltHundredths: number; // e.g. 4800 = 48.00V
  outSta: number;
  relayReleaseEndsAt: number;
  inFenceLastTick: boolean;
  socket: net.Socket | null;
  recvBuf: Buffer;
}

const trackers: TrackerState[] = [];

function makeTracker(i: number): TrackerState {
  // Spread trackers randomly within 500m of center.
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 500;
  const latOff = (radius / 111_000) * Math.cos(angle);
  const lngOff = (radius / (111_000 * Math.cos(CENTER.lat * Math.PI / 180))) * Math.sin(angle);
  return {
    imei: String(865000000000001 + i),
    lat: CENTER.lat + latOff,
    lng: CENTER.lng + lngOff,
    heading: Math.random() * 360,
    speedKph: 0,
    odoM: 0,
    extVoltHundredths: 4800 + Math.round(Math.random() * 200),
    outSta: 0,
    relayReleaseEndsAt: 0,
    inFenceLastTick: false,
    socket: null,
    recvBuf: Buffer.alloc(0),
  };
}

function distToCenter(t: TrackerState): number {
  const R = 6_371_000;
  const lat1 = (t.lat * Math.PI) / 180;
  const lat2 = (CENTER.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((CENTER.lng - t.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function step(t: TrackerState): void {
  // Gentle walk: 0-18 km/h, occasional stops
  if (Math.random() < 0.05) t.speedKph = Math.max(0, t.speedKph - 2);
  else if (Math.random() < 0.3) t.speedKph = Math.min(18, t.speedKph + 1);
  if (Math.random() < 0.1) t.heading = (t.heading + (Math.random() - 0.5) * 60 + 360) % 360;

  const distM = (t.speedKph / 3.6) * 5; // 5-second tick
  t.odoM += distM;
  const dLat = (distM / 111_000) * Math.cos((t.heading * Math.PI) / 180);
  const dLng =
    (distM / (111_000 * Math.cos((t.lat * Math.PI) / 180))) *
    Math.sin((t.heading * Math.PI) / 180);
  t.lat += dLat;
  t.lng += dLng;

  // If fence-cross mode is on, aim some trackers toward the center occasionally
  if (FENCE_CROSS && Math.random() < 0.01 && distToCenter(t) > FENCE_RADIUS_M) {
    const dy = CENTER.lat - t.lat;
    const dx = CENTER.lng - t.lng;
    t.heading = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (t.heading < 0) t.heading += 360;
    t.speedKph = 15;
  }

  // Check fence state -> fire event 26 on entry
  const inside = distToCenter(t) <= FENCE_RADIUS_M;
  const justEntered = inside && !t.inFenceLastTick;
  t.inFenceLastTick = inside;

  // Relay: on entry, set output1 (unless bypass active)
  if (justEntered && Date.now() > t.relayReleaseEndsAt) {
    t.outSta |= 0x01;
  }
  if (Date.now() > t.relayReleaseEndsAt && inside) {
    t.outSta |= 0x01;
  } else if (Date.now() <= t.relayReleaseEndsAt) {
    t.outSta &= ~0x01;
  } else if (!inside) {
    t.outSta &= ~0x01;
  }

  // Send a telemetry packet (alm-code 26 on fresh entry, else 0)
  const almCode = justEntered ? 26 : 0;
  const almData = justEntered ? '1' : '';
  sendEvent(t, almCode, almData);
}

function sendEvent(t: TrackerState, almCode: number, almData: string): void {
  if (!t.socket || t.socket.destroyed) return;
  const body =
    `,${t.imei},010,${almCode},${almData},${nowDateTime()},A,` +
    `${t.lat.toFixed(6)},${t.lng.toFixed(6)},8,0.9,` +
    `${t.speedKph.toFixed(1)},${Math.round(t.heading)},100,` +
    `${Math.round(t.odoM)},410|1|0000|0000,27,` +
    // system-sta: bit2 GPS valid, bit3 ext power connected
    `0000000C,00,${t.outSta.toString(16).toUpperCase().padStart(2, '0')},` +
    `${toHex4(t.extVoltHundredths)}|0190|0000|0000,1,,`;
  const packNoCh = nextPackNo();
  const packLen = Buffer.byteLength(body, 'ascii');
  const beforeCs = `&&${packNoCh}${packLen}${body}`;
  const cs = checksum(beforeCs);
  const frame = `${beforeCs}${cs}\r\n`;
  t.socket.write(frame);
}

function onRecv(t: TrackerState, chunk: Buffer): void {
  t.recvBuf = Buffer.concat([t.recvBuf, chunk]);
  while (true) {
    const idx = t.recvBuf.indexOf('\r\n');
    if (idx === -1) break;
    const line = t.recvBuf.subarray(0, idx).toString('ascii');
    t.recvBuf = t.recvBuf.subarray(idx + 2);
    // Look for server commands $$...
    // $$<pn><len>,<ID>,<cmd>,<data><cs>
    const m = line.match(/^\$\$.(\d+),([^,]+),(\d{3})(?:,(.+?))?([0-9A-F]{2})$/);
    if (!m) continue;
    const cmd = m[3]!;
    const data = m[4] ?? '';
    if (cmd === '900') {
      // 900,output,flag,time,safe_speed
      const parts = data.split(',');
      const output = parseInt(parts[0] ?? '1', 10);
      const flag = parseInt(parts[1] ?? '0', 10);
      const time = parseInt(parts[2] ?? '0', 10);
      if (output === 1) {
        if (flag === 0) {
          // Release relay for `time` ms
          t.relayReleaseEndsAt = Date.now() + time;
          t.outSta &= ~0x01;
        } else if (flag === 1) {
          t.outSta |= 0x01;
        }
        // Reply: 900,OK
        replyCommand(t, '900', 'OK');
      }
    } else {
      // Ack settable commands with OK
      if (['100', '102', '110', '122', '125', '126', '127', '212', '251', '808'].includes(cmd)) {
        replyCommand(t, cmd, 'OK');
      }
    }
  }
}

function replyCommand(t: TrackerState, cmd: string, result: string): void {
  if (!t.socket || t.socket.destroyed) return;
  const body = `,${t.imei},${cmd},${result}`;
  const pn = nextPackNo();
  const len = Buffer.byteLength(body, 'ascii');
  const before = `&&${pn}${len}${body}`;
  const cs = checksum(before);
  t.socket.write(`${before}${cs}\r\n`);
}

function connectTracker(t: TrackerState): void {
  const socket = net.connect({ host: HOST, port: PORT }, () => {
    console.log(`[sim] connected ${t.imei}`);
    // Send an initial heartbeat event so the server registers us.
    sendEvent(t, 32, ''); // 32 = Power On
  });
  t.socket = socket;
  socket.on('data', (c) => onRecv(t, c));
  socket.on('error', (e) => console.log(`[sim] ${t.imei} err: ${e.message}`));
  socket.on('close', () => {
    console.log(`[sim] ${t.imei} disconnected, reconnecting in 3s`);
    t.socket = null;
    setTimeout(() => connectTracker(t), 3000);
  });
}

async function main(): Promise<void> {
  console.log(`[sim] spawning ${N} trackers against ${HOST}:${PORT} (fence-cross=${FENCE_CROSS})`);
  for (let i = 0; i < N; i++) {
    trackers.push(makeTracker(i));
  }
  // Stagger connects by 50ms to avoid thundering herd
  for (let i = 0; i < trackers.length; i++) {
    setTimeout(() => connectTracker(trackers[i]!), i * 50);
  }

  // Drive the simulation every 5s
  setInterval(() => {
    for (const t of trackers) if (t.socket) step(t);
  }, 5000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
