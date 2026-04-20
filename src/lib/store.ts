import { createContext, useContext } from 'react';
import type { AlertEvent, Cart, Driver, Fence, LiveCartState } from './telemetry';
import type { AuthUser } from './api';

export interface AppState {
  carts: Map<string, Cart>;
  alerts: AlertEvent[];
  alertsTotal: number;
  fences: Fence[];
  drivers: Driver[];
  selectedCartId: string | null;
  /** Live socket connection status. 'offline' means we haven't talked to the backend yet. */
  connection: 'online' | 'offline' | 'connecting';
  /** Admin-defined bypass duration in ms. */
  bypassDurationMs: number;
}

export interface AppActions {
  selectCart: (cartId: string | null) => void;
  /** Apply a live telemetry broadcast to the local state. */
  applyPosition: (cartId: string, patch: Partial<LiveCartState>) => void;
  addAlert: (alert: AlertEvent) => void;
  updateAlert: (id: number, patch: Partial<AlertEvent>) => void;
  acknowledgeAlert: (id: number) => void | Promise<void>;
  resolveAlert: (id: number) => void | Promise<void>;
  triggerBypass: (cartId: string, durationMs?: number) => Promise<void>;
  setFences: (fences: Fence[]) => void;
  setDrivers: (drivers: Driver[]) => void;
  setBypassActive: (cartId: string, active: boolean, endsAt: number | null) => void;
  centerOnCart: (cartId: string) => void;
  centerOnAllCarts: () => void;
  refreshCarts: () => Promise<void>;
  refreshAlerts: (opts?: { limit?: number; offset?: number }) => Promise<void>;
  setBypassDuration: (ms: number) => void;
}

export interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export interface AppContextValue {
  state: AppState;
  actions: AppActions;
  auth: AuthState;
  mapRef: React.MutableRefObject<any> | null;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function useAuth(): AuthState {
  return useApp().auth;
}
