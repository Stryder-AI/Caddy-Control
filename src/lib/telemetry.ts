// Shared types between the frontend and backend wire-format.

export type CartStatus = 'ACTIVE' | 'INACTIVE' | 'DANGER' | 'OFFLINE';

export interface Driver {
  id: number;
  name: string;
  role: string | null;
  avatarUrl: string | null;
}

export interface LiveCartState {
  ts: number;
  lat: number | null;
  lng: number | null;
  speedKph: number;
  course: number;
  batteryPct: number | null;
  extV: number | null;
  batV: number | null;
  satellites: number;
  hdop: number;
  odometerKm: number;
  inSta: number;
  outSta: number;
  status: CartStatus;
  bypassActive: boolean;
  bypassEndsAt: number | null;
  lastAlmCode: number | null;
  connected: boolean;
  fenceInside?: number[];
}

export interface Cart {
  cartId: string;
  name: string;
  imei: string | null;
  vehicleTag: string | null;
  notes: string | null;
  driver: Driver | null;
  state: LiveCartState | null;
}

export interface Fence {
  idx: number;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  flag: number;
  enabled: number;
  updated_at: number;
}

export interface AlertEvent {
  id: number;
  cartId: string;
  type:
    | 'low_battery'
    | 'danger_zone'
    | 'tracker_offline'
    | 'bypass_triggered'
    | 'speeding'
    | 'power_cut'
    | 'harsh_brake'
    | 'harsh_accel'
    | 'fence_mismatch'
    | 'gps_lost';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: number;
  status: 'new' | 'acknowledged' | 'resolved';
}

export interface PositionBroadcast {
  cartId: string;
  lat: number | null;
  lng: number | null;
  speedKph: number;
  course: number;
  batteryPct: number;
  extV: number | null;
  batV: number | null;
  satellites: number;
  hdop: number;
  odometerKm: number;
  inSta: number;
  outSta: number;
  status: CartStatus;
  fenceInside: number[];
  almCode: number;
  ts: number;
}

// Default course center — the dashboard bootstraps the map here if no cart
// positions are known yet.
export const DEFAULT_COURSE_CENTER: [number, number] = [33.444406, 72.862765];

export function dashStatusFromCart(cart: Cart): CartStatus {
  if (!cart.state || !cart.state.connected) return 'OFFLINE';
  return cart.state.status;
}

// Legacy alias — some components import CartState from this module.
export type CartState = Cart & {
  /** Derived: the live state's battery, or null. */
  batteryPct: number | null;
  /** Derived lat for legacy callers. */
  lat: number;
  lng: number;
  speedKph: number;
  odometerKm: number;
  status: CartStatus;
  timestamp: number;
  bypassActive: boolean;
  bypassEndTime: number | null;
};

/** Adapter: view legacy CartState-shaped data from the new Cart object. */
export function toLegacy(cart: Cart): CartState {
  return {
    ...cart,
    lat: cart.state?.lat ?? 0,
    lng: cart.state?.lng ?? 0,
    speedKph: cart.state?.speedKph ?? 0,
    odometerKm: cart.state?.odometerKm ?? 0,
    batteryPct: cart.state?.batteryPct ?? null,
    status: cart.state?.status ?? 'OFFLINE',
    timestamp: cart.state?.ts ?? Date.now(),
    bypassActive: cart.state?.bypassActive ?? false,
    bypassEndTime: cart.state?.bypassEndsAt ?? null,
  };
}
