/**
 * Fan-out for a decoded EventPacket:
 *   1. Persist the telemetry row (sparse — only if we have a fix)
 *   2. Update cart_state (last known)
 *   3. Map alm-codes to alerts (with dedup)
 *   4. Evaluate server-side fence engine, cross-check with tracker claim
 *   5. Manage trip lifecycle (start on motion, end after idle)
 *   6. Broadcast over Socket.io
 *
 * iStartek alm-code mapping (V1.6 Appendix A):
 *    0 Interval (routine)
 *   17 Low Ext-Power       => power_cut (warning)
 *   18 Ext-Power Cut       => power_cut (critical)
 *   19 Ext-Power On        => info
 *   20 Low Battery         => low_battery
 *   22 Speeding            => speeding
 *   25 Exit Fence          => resolve active fence alert
 *   26 Enter Fence         => danger_zone (critical)   ← kill event
 *   27 Lose GPS Signal     => gps_lost
 *   28 Get GPS Signal      => info
 *   30 Heartbeat           => routine
 *   32 Power On            => info
 *   33 Power Off           => info
 *   36 Stop Moving         => end trip
 *   37 Start Moving        => start trip
 *   40 Harsh Braking       => harsh_brake (safety)
 *   39 Harsh Accelerate    => harsh_accel (safety)
 */

import type { EventPacket } from '../tcp/iStartekCodec.js';
import { cartStateRepo, type CartStateRow } from '../persistence/repositories/carts.js';
import { alertsRepo, type AlertType } from '../persistence/repositories/alerts.js';
import { telemetryRepo } from '../persistence/repositories/telemetry.js';
import { tripsRepo } from '../persistence/repositories/trips.js';
import { fencesRepo } from '../persistence/repositories/fences.js';
import { estimateBattery } from './battery.js';
import { evaluate as evaluateFences } from './fenceEngine.js';
import { haversineM } from './geo.js';
import { broadcast } from '../api/ws.js';
import { logger } from '../util/logger.js';
import { cartsRepo } from '../persistence/repositories/carts.js';

const DEDUP_MS = 30_000; // per-cart, per-alert-type cooldown

function dedup(cartId: string, type: AlertType): boolean {
  const last = alertsRepo.lastTs(cartId, type);
  if (!last) return false;
  return Date.now() - last < DEDUP_MS;
}

export function handleEvent(cartId: string, ev: EventPacket): void {
  const hasFix = ev.fixFlag === 'A' && ev.lat !== 0 && ev.lng !== 0;
  const ts = ev.timestamp ?? Date.now();

  // --- Battery ---
  const batteryPct = estimateBattery(cartId, ev.extV, ev.odometerMeters);

  // --- Status ---
  const relayFired = (ev.outSta & 0x01) === 1; // output1 active => kill engaged
  let status: CartStateRow['status'] = 'ACTIVE';
  if (!hasFix) status = 'INACTIVE';
  else if (relayFired) status = 'DANGER';
  else if (ev.speedKph < 0.5) status = 'INACTIVE';

  // --- Server-side fence cross-check (only with a valid fix) ---
  let fenceInside: number[] = [];
  if (hasFix) {
    const res = evaluateFences(cartId, ev.lat, ev.lng);
    fenceInside = res.inside;
    // Cross-check: tracker claims Enter Fence (26) but server says outside all fences.
    if (ev.almCode === 26 && fenceInside.length === 0 && !dedup(cartId, 'fence_mismatch')) {
      alertsRepo.create({
        cart_id: cartId,
        type: 'fence_mismatch',
        severity: 'warning',
        title: 'Fence mismatch',
        message: `Tracker reported Enter Fence(#${ev.almData}) but GPS ${ev.lat.toFixed(5)},${ev.lng.toFixed(5)} is outside server fences`,
        ts,
      });
    }
  }

  // --- Persist ---
  if (hasFix) {
    telemetryRepo.insert({
      ts,
      cart_id: cartId,
      lat: ev.lat,
      lng: ev.lng,
      speed_kph: ev.speedKph,
      course: ev.course,
      ext_v: Number.isFinite(ev.extV) ? ev.extV : null,
      bat_v: Number.isFinite(ev.batV) ? ev.batV : null,
      sat: ev.satellites,
      hdop: ev.hdop,
      odometer_m: ev.odometerMeters,
      in_sta: ev.inSta,
      out_sta: ev.outSta,
      alm_code: ev.almCode,
    });
  }

  const existingState = cartStateRepo.get(cartId);
  cartStateRepo.upsert({
    cart_id: cartId,
    ts,
    lat: hasFix ? ev.lat : existingState?.lat ?? null,
    lng: hasFix ? ev.lng : existingState?.lng ?? null,
    speed_kph: ev.speedKph,
    course: ev.course,
    battery_pct: batteryPct,
    ext_v: Number.isFinite(ev.extV) ? ev.extV : null,
    bat_v: Number.isFinite(ev.batV) ? ev.batV : null,
    sat: ev.satellites,
    hdop: ev.hdop,
    odometer_m: ev.odometerMeters,
    in_sta: ev.inSta,
    out_sta: ev.outSta,
    system_sta: ev.systemSta,
    fix_flag: ev.fixFlag,
    status,
    bypass_active: existingState?.bypass_active ?? 0,
    bypass_ends_at: existingState?.bypass_ends_at ?? null,
    last_alm_code: ev.almCode,
    connected: 1,
  });

  // --- Alert mapping ---
  switch (ev.almCode) {
    case 20: // Low Battery (internal)
      if (!dedup(cartId, 'low_battery')) {
        alertsRepo.create({
          cart_id: cartId,
          type: 'low_battery',
          severity: 'warning',
          title: 'Low Battery',
          message: `Cart ${cartId} battery at ${batteryPct}% (ext ${ev.extV.toFixed(2)}V)`,
          ts,
        });
      }
      break;
    case 17:
    case 18:
      if (!dedup(cartId, 'power_cut')) {
        alertsRepo.create({
          cart_id: cartId,
          type: 'power_cut',
          severity: ev.almCode === 18 ? 'critical' : 'warning',
          title: ev.almCode === 18 ? 'External Power Cut' : 'Low External Power',
          message: `Cart ${cartId} ext-V = ${ev.extV.toFixed(2)}V`,
          ts,
        });
      }
      break;
    case 22:
      if (!dedup(cartId, 'speeding')) {
        alertsRepo.create({
          cart_id: cartId,
          type: 'speeding',
          severity: 'warning',
          title: 'Speeding',
          message: `Cart ${cartId} hit ${ev.speedKph.toFixed(1)} km/h`,
          ts,
        });
      }
      break;
    case 26: {
      const fenceIdx = parseInt(ev.almData, 10) || 0;
      const fence = fenceIdx ? fencesRepo.get(fenceIdx) : undefined;
      alertsRepo.create({
        cart_id: cartId,
        type: 'danger_zone',
        severity: 'critical',
        title: 'Geofence Entry — Cart Stopped',
        message: `Cart ${cartId} entered ${fence?.name ?? `fence #${fenceIdx}`} — relay engaged`,
        ts,
      });
      break;
    }
    case 27:
      if (!dedup(cartId, 'gps_lost')) {
        alertsRepo.create({
          cart_id: cartId,
          type: 'gps_lost',
          severity: 'warning',
          title: 'GPS Signal Lost',
          message: `Cart ${cartId} lost GPS fix`,
          ts,
        });
      }
      break;
    case 39:
      alertsRepo.create({
        cart_id: cartId,
        type: 'harsh_accel',
        severity: 'info',
        title: 'Harsh Acceleration',
        message: `Cart ${cartId} hard launch`,
        ts,
      });
      break;
    case 40:
      alertsRepo.create({
        cart_id: cartId,
        type: 'harsh_brake',
        severity: 'info',
        title: 'Harsh Braking',
        message: `Cart ${cartId} hard brake`,
        ts,
      });
      break;
  }

  // --- Trip lifecycle ---
  const cart = cartsRepo.get(cartId);
  const driverId = cart?.driver_id ?? null;
  if (hasFix && ev.speedKph >= 2) {
    let trip = tripsRepo.getActive(cartId);
    if (!trip) trip = tripsRepo.start(cartId, driverId);
    // Accumulate distance relative to prior telemetry point
    if (existingState?.lat != null && existingState.lng != null) {
      const d = haversineM(existingState.lat, existingState.lng, ev.lat, ev.lng);
      if (d < 500) tripsRepo.accumulate(trip.id, d, ev.speedKph);
    }
    if (ev.almCode === 40) tripsRepo.incrementHarsh(trip.id, 'brake');
    if (ev.almCode === 39) tripsRepo.incrementHarsh(trip.id, 'accel');
  } else if (ev.almCode === 36) {
    const active = tripsRepo.getActive(cartId);
    if (active) tripsRepo.end(active.id);
  }

  // --- Broadcast to dashboard ---
  broadcast('cart:position', {
    cartId,
    lat: hasFix ? ev.lat : existingState?.lat ?? null,
    lng: hasFix ? ev.lng : existingState?.lng ?? null,
    speedKph: Math.round(ev.speedKph * 10) / 10,
    course: ev.course,
    batteryPct,
    extV: Number.isFinite(ev.extV) ? ev.extV : null,
    batV: Number.isFinite(ev.batV) ? ev.batV : null,
    satellites: ev.satellites,
    hdop: ev.hdop,
    odometerKm: Math.round((ev.odometerMeters / 1000) * 100) / 100,
    inSta: ev.inSta,
    outSta: ev.outSta,
    status,
    fenceInside,
    almCode: ev.almCode,
    ts,
  });

  if (ev.almCode !== 0 && ev.almCode !== 30) {
    logger.debug({ cartId, alm: ev.almCode }, 'event processed');
  }
}

/**
 * Offline watchdog: every tick, find carts with no telemetry in 2× heartbeat
 * interval and emit a tracker_offline alert.
 */
export function offlineWatchdog(): void {
  const OFFLINE_MS = 10 * 60 * 1000;
  const states = cartStateRepo.list();
  const now = Date.now();
  for (const s of states) {
    if (!s.connected) continue;
    if (now - s.ts > OFFLINE_MS) {
      if (!dedup(s.cart_id, 'tracker_offline')) {
        alertsRepo.create({
          cart_id: s.cart_id,
          type: 'tracker_offline',
          severity: 'warning',
          title: 'Tracker Offline',
          message: `No telemetry for ${Math.round((now - s.ts) / 60000)} min`,
          ts: now,
        });
        broadcast('alert:new', { cartId: s.cart_id, type: 'tracker_offline' });
      }
    }
  }
}
