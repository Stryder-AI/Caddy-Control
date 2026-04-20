/**
 * Geospatial helpers. Plain JS, no deps.
 */

const EARTH_RADIUS_M = 6_371_000;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Great-circle distance in meters. */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export interface Circle {
  lat: number;
  lng: number;
  radius_m: number;
}

export function isInside(point: { lat: number; lng: number }, circle: Circle): boolean {
  return haversineM(point.lat, point.lng, circle.lat, circle.lng) <= circle.radius_m;
}
