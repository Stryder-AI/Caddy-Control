/**
 * Server-side geofence evaluation.
 *
 * This does NOT issue the kill — the tracker does that autonomously via
 * its 212/251-bound output. This exists as:
 *
 *   1. Data for the dashboard (which carts are inside which fences)
 *   2. A safety net that cross-checks tracker fence events — if the tracker
 *      claims Enter Fence but the server's geometry says the point is
 *      outside (or vice versa), raise a `fence_mismatch` alert.
 */

import { fencesRepo } from '../persistence/repositories/fences.js';
import { haversineM } from './geo.js';

export interface FenceStatus {
  insideIdx: number[];
}

const lastStatus = new Map<string, FenceStatus>();

export function evaluate(cartId: string, lat: number, lng: number): {
  inside: number[];
  entered: number[];
  exited: number[];
} {
  const fences = fencesRepo.listEnabled();
  const inside: number[] = [];
  for (const f of fences) {
    if (haversineM(lat, lng, f.lat, f.lng) <= f.radius_m) {
      inside.push(f.idx);
    }
  }
  const prev = lastStatus.get(cartId)?.insideIdx ?? [];
  const entered = inside.filter((i) => !prev.includes(i));
  const exited = prev.filter((i) => !inside.includes(i));
  lastStatus.set(cartId, { insideIdx: inside });
  return { inside, entered, exited };
}

export function isCartInside(cartId: string): number[] {
  return lastStatus.get(cartId)?.insideIdx ?? [];
}
