/**
 * Caddy Control server bootstrap.
 *
 *   :3001 HTTP  (REST + Socket.io)
 *   :8800 TCP   (iStartek VT-100 devices)
 */

import { config } from './util/config.js';
import { logger } from './util/logger.js';
import { getDb, closeDb } from './persistence/db.js';
import { seed } from './persistence/seed.js';
import { buildHttp } from './api/http.js';
import { initWs } from './api/ws.js';
import { startTcpServer } from './tcp/tcpServer.js';
import { offlineWatchdog } from './telemetry/eventPipeline.js';
import { telemetryRepo } from './persistence/repositories/telemetry.js';

async function main(): Promise<void> {
  logger.info('Caddy Control starting');

  // 1. DB + seed
  getDb();
  await seed();

  // 2. HTTP + WS
  // Bind to :: (IPv6 dual-stack) rather than 0.0.0.0 so Railway's private
  // IPv6 network can reach the healthcheck endpoint. On Linux, listening on
  // :: also accepts IPv4 connections via IPv4-mapped IPv6 addresses.
  const app = await buildHttp();
  await app.listen({ host: '::', port: config.httpPort });
  initWs(app.server);
  logger.info({ port: config.httpPort }, 'HTTP + Socket.io listening on :: (dual-stack)');

  // 3. TCP (iStartek)
  const tcp = startTcpServer();

  // 4. Background: offline watchdog every 60s
  const wd = setInterval(offlineWatchdog, 60_000);

  // 5. Background: telemetry prune (keep 14 days of raw ticks) every hour
  const TWO_WEEKS = 14 * 86400_000;
  const prune = setInterval(() => {
    const n = telemetryRepo.pruneOlderThan(Date.now() - TWO_WEEKS);
    if (n > 0) logger.info({ pruned: n }, 'telemetry rows pruned');
  }, 3_600_000);

  // 6. Graceful shutdown
  const shutdown = async () => {
    logger.info('shutting down');
    clearInterval(wd);
    clearInterval(prune);
    tcp.close();
    await app.close();
    closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  logger.error(e, 'fatal');
  process.exit(1);
});
