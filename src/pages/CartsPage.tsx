import { useMemo, useState } from 'react';
import { useApp } from '@/lib/store';
import { Battery, Gauge, MapPin, Zap, Radio, ShieldAlert, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

type Filter = 'all' | 'active' | 'danger' | 'bypass' | 'offline';

export default function CartsPage() {
  const { state, actions } = useApp();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const carts = useMemo(() => {
    const all = Array.from(state.carts.values()).sort((a, b) => a.cartId.localeCompare(b.cartId));
    return all
      .filter((c) => {
        if (filter === 'active') return c.state?.status === 'ACTIVE';
        if (filter === 'danger') return c.state?.status === 'DANGER';
        if (filter === 'bypass') return c.state?.bypassActive;
        if (filter === 'offline') return !c.state?.connected;
        return true;
      })
      .filter((c) =>
        !search
          ? true
          : c.cartId.includes(search) ||
            c.name.toLowerCase().includes(search.toLowerCase()) ||
            (c.driver?.name.toLowerCase().includes(search.toLowerCase()) ?? false)
      );
  }, [state.carts, filter, search]);

  const filters: { key: Filter; label: string; color: string }[] = [
    { key: 'all', label: 'All', color: 'bg-muted-foreground/30' },
    { key: 'active', label: 'Active', color: 'bg-accent' },
    { key: 'danger', label: 'Danger', color: 'bg-danger' },
    { key: 'bypass', label: 'Bypassed', color: 'bg-warning' },
    { key: 'offline', label: 'Offline', color: 'bg-muted-foreground/40' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-foreground">Fleet Overview</h1>
        <span className="text-xs text-muted-foreground font-mono">
          {carts.length} of {state.carts.size} carts
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-card text-muted-foreground hover:bg-muted'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${f.color}`} /> {f.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cart or driver..."
          className="ml-auto text-xs bg-card border border-border rounded-lg px-3 py-1.5 w-[220px] focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {carts.map((cart, i) => {
          const s = cart.state;
          const statusColor =
            s?.status === 'ACTIVE'
              ? 'bg-accent'
              : s?.status === 'DANGER'
                ? 'bg-danger'
                : !s?.connected
                  ? 'bg-muted-foreground/40'
                  : 'bg-muted-foreground/50';
          const relayFired = s ? (s.outSta & 0x01) === 1 : false;

          return (
            <motion.div
              key={cart.cartId}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.015 }}
              className="glass rounded-xl p-4 hover:shadow-xl transition-all duration-200 group cursor-pointer hover:-translate-y-0.5"
              onClick={() => {
                actions.selectCart(cart.cartId);
                navigate('/');
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center font-mono font-bold text-sm text-foreground shrink-0">
                    {cart.cartId}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{cart.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                      <span className="text-[10px] text-muted-foreground capitalize">
                        {s?.status?.toLowerCase() ?? 'offline'}
                      </span>
                      {s?.bypassActive && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-warning">
                          <Zap size={10} /> bypass
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {relayFired && !s?.bypassActive && <ShieldAlert size={14} className="text-danger" />}
              </div>

              {cart.driver && (
                <div className="flex items-center gap-1.5 mb-3 text-[11px] text-muted-foreground">
                  <User size={10} />
                  <span className="truncate">{cart.driver.name}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <Stat icon={Gauge} value={`${(s?.speedKph ?? 0).toFixed(0)} km/h`} />
                <Stat
                  icon={Battery}
                  value={`${s?.batteryPct ?? 0}%`}
                  danger={!!(s && s.batteryPct !== null && s.batteryPct < 20)}
                />
                <Stat icon={MapPin} value={`${(s?.odometerKm ?? 0).toFixed(1)} km`} />
              </div>

              {!s?.connected && (
                <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                  <Radio size={10} /> last seen: never
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {carts.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No carts match your filters.</p>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, danger }: { icon: any; value: string; danger?: boolean }) {
  return (
    <div className={`flex items-center gap-1 ${danger ? 'text-danger font-semibold' : 'text-muted-foreground'}`}>
      <Icon size={10} />
      <span className="font-mono">{value}</span>
    </div>
  );
}
