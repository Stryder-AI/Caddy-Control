import { useEffect, useState } from 'react';
import { Trophy, Shield, Zap, Gauge, TrendingUp, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { api, type LeaderboardRow } from '@/lib/api';

type TimeWindow = 'day' | 'week' | 'month';

export default function LeaderboardPage() {
  const [window, setWindow] = useState<TimeWindow>('day');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .leaderboard(window)
      .then(setRows)
      .catch((e) => console.warn(e))
      .finally(() => setLoading(false));
  }, [window]);

  const topDistance = rows[0];
  const topSpeed = rows.slice().sort((a, b) => b.top_speed_kph - a.top_speed_kph)[0];
  const safest = rows
    .slice()
    .filter((r) => r.trip_count > 0)
    .sort((a, b) => a.harsh_events - b.harsh_events)[0];
  const fastestAvg = rows.slice().sort((a, b) => b.avg_speed_kph - a.avg_speed_kph)[0];

  const windows: { k: TimeWindow; label: string }[] = [
    { k: 'day', label: 'Today' },
    { k: 'week', label: 'This Week' },
    { k: 'month', label: 'This Month' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center">
            <Trophy size={22} className="text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Leaderboard</h1>
            <p className="text-xs text-muted-foreground">Driver performance across the fleet</p>
          </div>
        </div>
        <div className="flex bg-muted rounded-lg p-0.5">
          {windows.map((w) => (
            <button
              key={w.k}
              onClick={() => setWindow(w.k)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                window === w.k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Tile
          icon={TrendingUp}
          tone="accent"
          label="Most Distance"
          big={topDistance ? `${(topDistance.total_distance_m / 1000).toFixed(1)} km` : '—'}
          caption={topDistance?.driver_name ?? ''}
        />
        <Tile
          icon={Gauge}
          tone="info"
          label="Top Speed"
          big={topSpeed ? `${topSpeed.top_speed_kph.toFixed(1)} km/h` : '—'}
          caption={topSpeed?.driver_name ?? ''}
        />
        <Tile
          icon={Shield}
          tone="accent"
          label="Safest Driver"
          big={safest ? `${safest.harsh_events}` : '—'}
          caption={`${safest?.driver_name ?? ''} · harsh events`}
        />
        <Tile
          icon={Zap}
          tone="warning"
          label="Smoothest Avg"
          big={fastestAvg ? `${fastestAvg.avg_speed_kph.toFixed(1)} km/h` : '—'}
          caption={fastestAvg?.driver_name ?? ''}
        />
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Rankings</h2>
          <span className="text-[11px] text-muted-foreground">by total distance</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" /> loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No trips in this window yet. Once carts start moving, rankings will appear here.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-muted-foreground text-xs">
                <th className="text-left px-5 py-2 font-medium">#</th>
                <th className="text-left px-5 py-2 font-medium">Driver</th>
                <th className="text-left px-5 py-2 font-medium">Carts</th>
                <th className="text-right px-5 py-2 font-medium">Trips</th>
                <th className="text-right px-5 py-2 font-medium">Distance</th>
                <th className="text-right px-5 py-2 font-medium">Top km/h</th>
                <th className="text-right px-5 py-2 font-medium">Avg km/h</th>
                <th className="text-right px-5 py-2 font-medium">Harsh</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <motion.tr
                  key={`${r.driver_id}-${i}`}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-t border-border hover:bg-muted/30"
                >
                  <td className="px-5 py-2.5 font-mono font-bold text-foreground">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </td>
                  <td className="px-5 py-2.5 font-medium">{r.driver_name}</td>
                  <td className="px-5 py-2.5 text-muted-foreground font-mono text-xs">{r.cart_ids}</td>
                  <td className="px-5 py-2.5 text-right font-mono">{r.trip_count}</td>
                  <td className="px-5 py-2.5 text-right font-mono font-semibold">
                    {(r.total_distance_m / 1000).toFixed(2)} km
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono">{r.top_speed_kph.toFixed(1)}</td>
                  <td className="px-5 py-2.5 text-right font-mono">{r.avg_speed_kph.toFixed(1)}</td>
                  <td
                    className={`px-5 py-2.5 text-right font-mono ${
                      r.harsh_events > 5 ? 'text-warning' : 'text-muted-foreground'
                    }`}
                  >
                    {r.harsh_events}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Tile({
  icon: Icon,
  tone,
  label,
  big,
  caption,
}: {
  icon: any;
  tone: 'accent' | 'info' | 'warning' | 'danger';
  label: string;
  big: string;
  caption: string;
}) {
  const toneClass =
    tone === 'accent'
      ? 'text-accent bg-accent/10'
      : tone === 'info'
        ? 'text-info bg-info/10'
        : tone === 'warning'
          ? 'text-warning bg-warning/10'
          : 'text-danger bg-danger/10';
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="glass rounded-xl p-5 transition-all duration-200 hover:shadow-lg"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${toneClass} mb-3`}>
        <Icon size={18} />
      </div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold font-mono text-foreground">{big}</p>
      <p className="text-xs text-muted-foreground truncate mt-1">{caption}</p>
    </motion.div>
  );
}
