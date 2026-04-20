import fs from 'node:fs';
import path from 'node:path';

function loadDotenv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotenv();

// TCP is sacred — trackers must reach it exactly at TCP_PORT (default 8800).
// HTTP can live on any free port. If PORT (Railway/Fly/Heroku injection) would
// collide with TCP_PORT, ignore it and fall back to HTTP_PORT / 3001.
const TCP_PORT = parseInt(process.env.TCP_PORT ?? '8800', 10);
const envHttpPort = parseInt(process.env.PORT ?? process.env.HTTP_PORT ?? '3001', 10);
const HTTP_PORT =
  envHttpPort === TCP_PORT
    ? parseInt(process.env.HTTP_PORT ?? '3001', 10) === TCP_PORT
      ? 3001 // last-resort fallback
      : parseInt(process.env.HTTP_PORT ?? '3001', 10)
    : envHttpPort;

if (envHttpPort === TCP_PORT) {
  // eslint-disable-next-line no-console
  console.warn(
    `[config] PORT=${envHttpPort} collides with TCP_PORT; using HTTP_PORT=${HTTP_PORT} for HTTP`
  );
}

export const config = {
  httpPort: HTTP_PORT,
  tcpPort: TCP_PORT,
  publicHost: process.env.PUBLIC_HOST ?? '127.0.0.1',
  jwtSecret: process.env.JWT_SECRET ?? 'dev_secret_change_me',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  dbPath: process.env.DB_PATH ?? './data/caddy.db',
  rawPacketLog: process.env.RAW_PACKET_LOG ?? './logs/packets.log',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** How many carts the fleet is provisioned for. */
  fleetSize: parseInt(process.env.FLEET_SIZE ?? '38', 10),
};
