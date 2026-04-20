import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import mapboxgl from 'mapbox-gl';
import { AppContext, type AppActions, type AppState, type AuthState } from '@/lib/store';
import { api, BACKEND_URL, getToken, setToken, type AuthUser } from '@/lib/api';
import {
  DEFAULT_COURSE_CENTER,
  type AlertEvent,
  type Cart,
  type Driver,
  type Fence,
  type LiveCartState,
  type PositionBroadcast,
} from '@/lib/telemetry';

export function AppProvider({ children }: { children: React.ReactNode }) {
  // --- Auth state ---
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // --- App state ---
  const [carts, setCarts] = useState<Map<string, Cart>>(new Map());
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const [fences, setFences] = useState<Fence[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);
  const [connection, setConnection] = useState<AppState['connection']>('offline');
  const [bypassDurationMs, setBypassDurationMs] = useState(15000);

  const mapRef = useRef<mapboxgl.Map | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // --- Auth bootstrap: on mount, if we have a cached token, validate it ---
  useEffect(() => {
    const t = getToken();
    if (!t) {
      setAuthReady(true);
      return;
    }
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setAuthReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user } = await api.login(email, password);
    setToken(token);
    setUser(user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    socketRef.current?.disconnect();
    socketRef.current = null;
    setCarts(new Map());
    setAlerts([]);
    setFences([]);
    setConnection('offline');
  }, []);

  // --- Hydrate once authenticated ---
  const hydrate = useCallback(async () => {
    try {
      const [cartsList, fencesList, driversList, alertsPage] = await Promise.all([
        api.carts(),
        api.fences(),
        api.drivers(),
        api.alerts({ limit: 100 }),
      ]);
      const m = new Map<string, Cart>();
      for (const c of cartsList) m.set(c.cartId, c);
      setCarts(m);
      setFences(fencesList);
      setDrivers(driversList);
      setAlerts(
        alertsPage.items.map((a: any) => ({
          id: a.id,
          cartId: a.cart_id,
          type: a.type,
          severity: a.severity,
          title: a.title,
          message: a.message,
          timestamp: a.ts,
          status: a.status,
        }))
      );
      setAlertsTotal(alertsPage.total);
    } catch (e) {
      console.warn('hydrate failed', e);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    hydrate();
  }, [user, hydrate]);

  // --- Socket.io connection ---
  useEffect(() => {
    const token = getToken();
    if (!user || !token) return;
    setConnection('connecting');
    const sock = io(BACKEND_URL, {
      auth: { token },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = sock;

    sock.on('connect', () => setConnection('online'));
    sock.on('disconnect', () => setConnection('offline'));
    sock.on('connect_error', () => setConnection('offline'));

    sock.on('cart:position', (b: PositionBroadcast) => {
      setCarts((prev) => {
        const next = new Map(prev);
        const existing = next.get(b.cartId);
        if (!existing) return prev;
        next.set(b.cartId, {
          ...existing,
          state: {
            ts: b.ts,
            lat: b.lat,
            lng: b.lng,
            speedKph: b.speedKph,
            course: b.course,
            batteryPct: b.batteryPct,
            extV: b.extV,
            batV: b.batV,
            satellites: b.satellites,
            hdop: b.hdop,
            odometerKm: b.odometerKm,
            inSta: b.inSta,
            outSta: b.outSta,
            status: b.status,
            bypassActive: existing.state?.bypassActive ?? false,
            bypassEndsAt: existing.state?.bypassEndsAt ?? null,
            lastAlmCode: b.almCode,
            connected: true,
            fenceInside: b.fenceInside,
          },
        });
        return next;
      });
    });

    sock.on('alert:new', (_a: unknown) => {
      // The server also writes to DB, so refetch latest page for authoritative ordering.
      api.alerts({ limit: 100 }).then((page) => {
        setAlerts(
          page.items.map((a: any) => ({
            id: a.id,
            cartId: a.cart_id,
            type: a.type,
            severity: a.severity,
            title: a.title,
            message: a.message,
            timestamp: a.ts,
            status: a.status,
          }))
        );
        setAlertsTotal(page.total);
      });
    });

    sock.on('alert:update', (u: { id: number; status: AlertEvent['status'] }) => {
      setAlerts((prev) => prev.map((a) => (a.id === u.id ? { ...a, status: u.status } : a)));
    });

    sock.on('bypass:active', (p: { cartId: string; endsAt: number }) => {
      setCarts((prev) => {
        const next = new Map(prev);
        const c = next.get(p.cartId);
        if (c?.state) {
          next.set(p.cartId, {
            ...c,
            state: { ...c.state, bypassActive: true, bypassEndsAt: p.endsAt },
          });
        }
        return next;
      });
    });
    sock.on('bypass:ended', (p: { cartId: string }) => {
      setCarts((prev) => {
        const next = new Map(prev);
        const c = next.get(p.cartId);
        if (c?.state) {
          next.set(p.cartId, {
            ...c,
            state: { ...c.state, bypassActive: false, bypassEndsAt: null },
          });
        }
        return next;
      });
    });

    sock.on('fence:updated', () => {
      api.fences().then(setFences);
    });
    sock.on('booking:updated', () => {
      // Consumers refetch on demand; no-op here.
    });

    // New alert notification: also push a synthetic alert locally for fast feedback.
    // The cart:position handler already shows the status change; this keeps toasts fresh.

    return () => {
      sock.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  // --- Alert refetch helper ---
  const refreshAlerts = useCallback(async (opts: { limit?: number; offset?: number } = {}) => {
    const page = await api.alerts({ limit: opts.limit ?? 100, offset: opts.offset ?? 0 });
    setAlerts(
      page.items.map((a: any) => ({
        id: a.id,
        cartId: a.cart_id,
        type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        timestamp: a.ts,
        status: a.status,
      }))
    );
    setAlertsTotal(page.total);
  }, []);

  const refreshCarts = useCallback(async () => {
    const list = await api.carts();
    const m = new Map<string, Cart>();
    for (const c of list) m.set(c.cartId, c);
    setCarts(m);
  }, []);

  // --- Actions ---
  const actions: AppActions = useMemo(
    () => ({
      selectCart: setSelectedCartId,
      applyPosition: (cartId, patch) => {
        setCarts((prev) => {
          const next = new Map(prev);
          const c = next.get(cartId);
          if (!c || !c.state) return prev;
          next.set(cartId, { ...c, state: { ...c.state, ...patch } });
          return next;
        });
      },
      addAlert: (a) => setAlerts((prev) => [a, ...prev].slice(0, 500)),
      updateAlert: (id, patch) =>
        setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a))),
      acknowledgeAlert: async (id) => {
        await api.ackAlert(id);
        setAlerts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: 'acknowledged' } : a))
        );
      },
      resolveAlert: async (id) => {
        await api.resolveAlert(id);
        setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'resolved' } : a)));
      },
      triggerBypass: async (cartId, durationMs) => {
        const ms = durationMs ?? bypassDurationMs;
        try {
          await api.bypass(cartId, ms);
        } catch (e) {
          console.warn('bypass failed', e);
        }
      },
      setFences,
      setDrivers,
      setBypassActive: (cartId, active, endsAt) => {
        setCarts((prev) => {
          const next = new Map(prev);
          const c = next.get(cartId);
          if (c?.state)
            next.set(cartId, {
              ...c,
              state: { ...c.state, bypassActive: active, bypassEndsAt: endsAt },
            });
          return next;
        });
      },
      centerOnCart: (cartId) => {
        const c = carts.get(cartId);
        if (c?.state?.lat && c.state.lng && mapRef.current) {
          mapRef.current.flyTo({
            center: [c.state.lng, c.state.lat],
            zoom: 17,
            duration: 900,
          });
        }
      },
      centerOnAllCarts: () => {
        if (!mapRef.current) return;
        const pts: [number, number][] = [];
        carts.forEach((c) => {
          if (c.state?.lat && c.state?.lng) pts.push([c.state.lng, c.state.lat]);
        });
        if (pts.length === 0) {
          mapRef.current.flyTo({
            center: [DEFAULT_COURSE_CENTER[1], DEFAULT_COURSE_CENTER[0]],
            zoom: 15,
            duration: 900,
          });
          return;
        }
        const bounds = new mapboxgl.LngLatBounds(pts[0], pts[0]);
        for (const p of pts) bounds.extend(p);
        mapRef.current.fitBounds(bounds, { padding: 60, duration: 900, maxZoom: 17 });
      },
      refreshCarts,
      refreshAlerts,
      setBypassDuration: setBypassDurationMs,
    }),
    [carts, bypassDurationMs, refreshAlerts, refreshCarts]
  );

  const state: AppState = {
    carts,
    alerts,
    alertsTotal,
    fences,
    drivers,
    selectedCartId,
    connection,
    bypassDurationMs,
  };

  const auth: AuthState = { user, ready: authReady, login, logout };

  return (
    <AppContext.Provider value={{ state, actions, auth, mapRef }}>
      {children}
    </AppContext.Provider>
  );
}
