import { useApp, useAuth } from '@/lib/store';
import { Radio, Clock, ShieldCheck, Wifi, Database } from 'lucide-react';

const DURATION_OPTIONS = [5000, 10000, 15000, 30000, 45000, 60000];

export default function SettingsPage() {
  const { state, actions } = useApp();
  const { user } = useAuth();

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-4">
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <ShieldCheck size={16} /> Account
          </h3>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center font-semibold">
                {user.name.slice(0, 1)}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <span className="px-2 py-1 rounded bg-accent/10 text-accent text-[11px] font-medium capitalize">
                {user.role}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not signed in</p>
          )}
        </div>

        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Clock size={16} /> Bypass Duration
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Default length of the relay-release pulse when an operator hits Bypass.
          </p>
          <div className="grid grid-cols-6 gap-2">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => actions.setBypassDuration(d)}
                className={`px-2 py-2 rounded-lg text-sm font-mono transition-all ${
                  state.bypassDurationMs === d
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'bg-muted hover:bg-muted/70'
                }`}
              >
                {d / 1000}s
              </button>
            ))}
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Wifi size={16} /> Backend
          </h3>
          <div className="text-xs space-y-1 font-mono text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Connection</span>
              <span
                className={`font-semibold ${
                  state.connection === 'online'
                    ? 'text-accent'
                    : state.connection === 'connecting'
                      ? 'text-warning'
                      : 'text-danger'
                }`}
              >
                {state.connection}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>API</span>
              <span>{import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Carts</span>
              <span>
                {Array.from(state.carts.values()).filter((c) => c.state?.connected).length}/
                {state.carts.size} online
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Fences loaded</span>
              <span>{state.fences.length}</span>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Database size={16} /> Fleet
          </h3>
          <div className="text-xs text-muted-foreground">
            Fleet size is configured server-side via <code className="mono px-1 rounded bg-muted">FLEET_SIZE</code>{' '}
            env variable (default <code className="mono">38</code>). Individual trackers auto-bind to cart slots on
            first connect.
          </div>
        </div>
      </div>
    </div>
  );
}
