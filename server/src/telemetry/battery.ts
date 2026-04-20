/**
 * Battery state-of-charge estimation.
 *
 * Primary source: `ext_v` — the external power supply voltage, reported by
 * the VT-100 as the battery pack voltage on a golf cart.
 * Mapped to SoC via a piecewise-linear curve over a typical 48V lead-acid
 * pack (configurable per cart type later).
 *
 * Fallback: if ext_v is unavailable (NaN), we fall back to a distance-based
 * linear discharge (15 km full-range assumption), tracked per cart in memory.
 */

const VOLTAGE_CURVE: Array<[number, number]> = [
  // [volts, soc%]
  [40.0, 0],
  [44.0, 10],
  [46.0, 25],
  [48.0, 50],
  [50.0, 75],
  [51.5, 90],
  [52.5, 100],
];

function interpolate(points: Array<[number, number]>, x: number): number {
  if (x <= points[0]![0]) return points[0]![1];
  if (x >= points[points.length - 1]![0]) return points[points.length - 1]![1];
  for (let i = 1; i < points.length; i++) {
    const [x2, y2] = points[i]!;
    if (x <= x2) {
      const [x1, y1] = points[i - 1]!;
      const t = (x - x1) / (x2 - x1);
      return y1 + t * (y2 - y1);
    }
  }
  return 0;
}

const FULL_RANGE_KM = 15;

interface DistanceState {
  socPct: number;
  lastOdoM: number | null;
}
const distanceState = new Map<string, DistanceState>();

export function estimateBattery(
  cartId: string,
  extV: number,
  odometerMeters: number
): number {
  if (Number.isFinite(extV) && extV > 0) {
    return Math.round(interpolate(VOLTAGE_CURVE, extV));
  }

  // Fallback: distance-based.
  let state = distanceState.get(cartId);
  if (!state) {
    state = { socPct: 100, lastOdoM: odometerMeters };
    distanceState.set(cartId, state);
  }
  if (state.lastOdoM !== null && odometerMeters > state.lastOdoM) {
    const deltaKm = (odometerMeters - state.lastOdoM) / 1000;
    const drain = (deltaKm / FULL_RANGE_KM) * 100;
    state.socPct = Math.max(0, state.socPct - drain);
  }
  state.lastOdoM = odometerMeters;
  return Math.round(state.socPct);
}

export function resetBatteryState(cartId: string): void {
  distanceState.delete(cartId);
}
