import { describe, it, expect } from 'vitest';
import { haversineM, isInside } from '../src/telemetry/geo.js';

describe('haversine', () => {
  it('zero distance', () => {
    expect(haversineM(33.444, 72.862, 33.444, 72.862)).toBe(0);
  });
  it('~111km per degree of latitude', () => {
    const d = haversineM(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('isInside', () => {
  it('point within radius', () => {
    // ~11m north of center
    expect(isInside({ lat: 33.4445, lng: 72.862 }, { lat: 33.4444, lng: 72.862, radius_m: 50 })).toBe(true);
  });
  it('point outside radius', () => {
    expect(isInside({ lat: 33.46, lng: 72.862 }, { lat: 33.4444, lng: 72.862, radius_m: 50 })).toBe(false);
  });
});
