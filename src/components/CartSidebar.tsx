import { useEffect, useState } from 'react';
import {
  X,
  MapPin,
  Zap,
  Gauge,
  Battery,
  Clock,
  Navigation,
  Radio,
  Satellite,
  BatteryCharging,
  ShieldAlert,
  User,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp, useAuth } from '@/lib/store';

const DURATION_OPTIONS = [5000, 10000, 15000, 30000];

export function CartSidebar() {
  const { state, actions } = useApp();
  const { user } = useAuth();
  const cart = state.selectedCartId ? state.carts.get(state.selectedCartId) : null;
  const [countdown, setCountdown] = useState<number | null>(null);
  const [duration, setDuration] = useState(state.bypassDurationMs);

  useEffect(() => {
    if (!cart?.state?.bypassActive || !cart?.state?.bypassEndsAt) {
      setCountdown(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cart.state!.bypassEndsAt! - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) setCountdown(null);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [cart?.state?.bypassActive, cart?.state?.bypassEndsAt]);

  if (!cart) return null;

  const s = cart.state;
  const canBypass = user && user.role !== 'viewer';
  const statusColor =
    s?.status === 'ACTIVE'
      ? 'bg-accent'
      : s?.status === 'DANGER'
        ? 'bg-danger'
        : 'bg-muted-foreground/50';
  const statusLabel = s?.status ? s.status.toLowerCase() : 'offline';

  const cartAlertCount = state.alerts.filter((a) => a.cartId === cart.cartId && a.status !== 'resolved').length;
  const relayFired = s ? (s.outSta & 0x01) === 1 : false;
  const lastSeenSec = s ? Math.round((Date.now() - s.ts) / 1000) : null;

  return (
    <motion.div
      initial={{ x: 380 }}
      animate={{ x: 0 }}
      exit={{ x: 380 }}
      transition={{ type: 'spring', stiffness: 240, damping: 28 }}
      className="absolute top-0 right-0 w-[380px] h-full z-[1001] glass-dark overflow-y-auto"
    >
      <div className="flex flex-col h-full text-primary-foreground">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-primary-foreground/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary-foreground/10 flex items-center justify-center font-mono font-bold text-base">
              {cart.cartId}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{cart.name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                <span className="text-xs text-primary-foreground/60 capitalize">{statusLabel}</span>
                {relayFired && (
                  <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded text-[10px] bg-danger/20 text-danger">
                    <ShieldAlert size={10} /> Kill Engaged
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => actions.selectCart(null)}
            className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Driver + vehicle */}
        <div className="mx-4 mt-4 p-3 rounded-xl bg-primary-foreground/5 flex items-center gap-2.5">
          <User size={14} className="text-primary-foreground/50" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-primary-foreground/50">Driver</p>
            <p className="text-sm font-medium truncate">{cart.driver?.name ?? 'Unassigned'}</p>
          </div>
          <span className="font-mono text-[10px] text-primary-foreground/50">{cart.vehicleTag ?? '—'}</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-px bg-primary-foreground/5 m-4 rounded-xl overflow-hidden">
          <StatBlock icon={Gauge} label="Speed" value={(s?.speedKph ?? 0).toFixed(1)} unit="km/h" />
          <StatBlock icon={Navigation} label="Distance" value={(s?.odometerKm ?? 0).toFixed(1)} unit="km" />
          <StatBlock
            icon={Battery}
            label="Battery"
            value={`${s?.batteryPct ?? 0}`}
            unit="%"
            highlight={!!(s && s.batteryPct !== null && s.batteryPct < 20)}
          />
          <StatBlock icon={BatteryCharging} label="Ext V" value={s?.extV ? s.extV.toFixed(1) : '—'} unit="V" />
          <StatBlock icon={Satellite} label="Sat" value={`${s?.satellites ?? 0}`} />
          <StatBlock icon={Clock} label="Seen" value={lastSeenSec !== null ? `${lastSeenSec}s` : '—'} />
        </div>

        {s?.lat !== null && s?.lng !== null && (
          <div className="mx-4 mb-3 p-3 rounded-xl bg-primary-foreground/5">
            <div className="flex items-center gap-2 text-xs text-primary-foreground/50 mb-1">
              <MapPin size={12} />
              <span>Coordinates</span>
            </div>
            <p className="font-mono text-xs text-primary-foreground/80">
              {s?.lat?.toFixed(6)}, {s?.lng?.toFixed(6)} · HDOP {(s?.hdop ?? 0).toFixed(1)}
            </p>
          </div>
        )}

        <div className="mx-4 mb-4 p-3 rounded-xl bg-primary-foreground/5 flex items-center gap-2">
          <Radio size={14} className="text-primary-foreground/50" />
          <span className="text-xs text-primary-foreground/50">Mode:</span>
          <span
            className={`text-xs font-medium ${s?.bypassActive ? 'text-warning' : relayFired ? 'text-danger' : 'text-accent'}`}
          >
            {s?.bypassActive ? 'Bypass Active' : relayFired ? 'Cart Stopped' : 'Normal'}
          </span>
        </div>

        {/* Bypass */}
        {canBypass && (
          <div className="mx-4 mb-3">
            <div className="flex gap-1 mb-2">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-mono transition-colors ${
                    duration === d
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-primary-foreground/10 text-primary-foreground/70 hover:bg-primary-foreground/15'
                  }`}
                >
                  {d / 1000}s
                </button>
              ))}
            </div>
            <button
              onClick={() => !s?.bypassActive && actions.triggerBypass(cart.cartId, duration)}
              disabled={!!s?.bypassActive || !s?.connected}
              className={`btn-bypass ${s?.bypassActive ? 'active' : ''}`}
            >
              <Zap size={16} className="inline mr-2" />
              {s?.bypassActive && countdown !== null
                ? `Bypass Active: ${countdown}s`
                : !s?.connected
                  ? 'Tracker Offline'
                  : `Bypass ${duration / 1000}s`}
            </button>
          </div>
        )}

        <div className="mx-4 flex flex-col gap-2 mt-auto pb-5">
          {cartAlertCount > 0 && (
            <button
              onClick={() =>
                state.alerts
                  .filter((a) => a.cartId === cart.cartId && a.status === 'new')
                  .forEach((a) => actions.acknowledgeAlert(a.id))
              }
              className="w-full py-2.5 px-4 rounded-xl text-xs font-medium bg-primary-foreground/10 hover:bg-primary-foreground/15 transition-colors"
            >
              Acknowledge All Alerts ({cartAlertCount})
            </button>
          )}
          <button
            onClick={() => actions.centerOnCart(cart.cartId)}
            disabled={!s?.lat || !s?.lng}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-medium bg-primary-foreground/10 hover:bg-primary-foreground/15 transition-colors disabled:opacity-50"
          >
            Center Map on Cart
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function StatBlock({
  icon: Icon,
  label,
  value,
  unit,
  highlight,
}: {
  icon: any;
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className="p-4 bg-primary-foreground/5">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={12} className="text-primary-foreground/40" />
        <span className="text-[10px] uppercase tracking-wider text-primary-foreground/40">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold font-mono ${highlight ? 'text-danger' : ''}`}>{value}</span>
        {unit && <span className="text-xs text-primary-foreground/40">{unit}</span>}
      </div>
    </div>
  );
}
