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

export const config = {
  // Railway / Fly / Heroku inject PORT; honor it first, fall back to HTTP_PORT,
  // then our local default 3001.
  httpPort: parseInt(process.env.PORT ?? process.env.HTTP_PORT ?? '3001', 10),
  tcpPort: parseInt(process.env.TCP_PORT ?? '8800', 10),
  publicHost: process.env.PUBLIC_HOST ?? '127.0.0.1',
  jwtSecret: process.env.JWT_SECRET ?? 'dev_secret_change_me',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  dbPath: process.env.DB_PATH ?? './data/caddy.db',
  rawPacketLog: process.env.RAW_PACKET_LOG ?? './logs/packets.log',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** How many carts the fleet is provisioned for. */
  fleetSize: parseInt(process.env.FLEET_SIZE ?? '38', 10),
};
