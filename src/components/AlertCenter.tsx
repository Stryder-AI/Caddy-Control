import { useEffect, useMemo, useState } from 'react';
import { useApp, useAuth } from '@/lib/store';
import { AlertCircle, AlertTriangle, Info, Check, Eye, Zap } from 'lucide-react';
import type { AlertEvent } from '@/lib/telemetry';

type FilterTab = 'all' | 'unresolved' | 'critical';
const PAGE_SIZE = 50;

export function AlertCenter() {
  const { state, actions } = useApp();
  const { user } = useAuth();
  const [tab, setTab] = useState<FilterTab>('unresolved');
  const [cartFilter, setCartFilter] = useState<string>('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    actions.refreshAlerts({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const filtered = useMemo(() => {
    let list = state.alerts;
    if (tab === 'unresolved') list = list.filter((a) => a.status !== 'resolved');
    if (tab === 'critical') list = list.filter((a) => a.severity === 'critical');
    if (cartFilter !== 'all') list = list.filter((a) => a.cartId === cartFilter);
    return list;
  }, [state.alerts, tab, cartFilter]);

  const cartIds = useMemo(() => {
    const ids = new Set(state.alerts.map((a) => a.cartId));
    return Array.from(ids).sort();
  }, [state.alerts]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unresolved', label: 'Unresolved' },
    { key: 'critical', label: 'Critical' },
  ];

  const severityIcon = (s: AlertEvent['severity']) => {
    if (s === 'critical') return <AlertCircle size={13} className="text-danger" />;
    if (s === 'warning') return <AlertTriangle size={13} className="text-warning" />;
    return <Info size={13} className="text-info" />;
  };

  const statusBadge = (s: AlertEvent['status']) => {
    const styles: Record<AlertEvent['status'], string> = {
      new: 'bg-danger/10 text-danger',
      acknowledged: 'bg-warning/10 text-warning',
      resolved: 'bg-accent/10 text-accent',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium capitalize ${styles[s]}`}>
        {s}
      </span>
    );
  };

  const canWrite = user && user.role !== 'viewer';
  const totalPages = Math.max(1, Math.ceil(state.alertsTotal / PAGE_SIZE));

  return (
    <div className="bg-card border-t-2 border-[hsl(181,75%,16%)]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(181,75%,16%,0.2)]">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <AlertCircle size={15} className="text-muted-foreground" />
          Alert Center
          {state.alerts.filter((a) => a.status === 'new').length > 0 && (
            <span className="ml-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-danger text-[10px] font-bold text-accent-foreground">
              {state.alerts.filter((a) => a.status === 'new').length}
            </span>
          )}
          <span className="ml-2 text-xs text-muted-foreground font-normal">of {state.alertsTotal}</span>
        </h3>

        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${
                  tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <select
            value={cartFilter}
            onChange={(e) => setCartFilter(e.target.value)}
            className="text-[11px] bg-muted border-0 rounded-lg px-2 py-1.5 text-muted-foreground"
          >
            <option value="all">All Carts</option>
            {cartIds.map((id) => (
              <option key={id} value={id}>
                Cart {id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-h-[240px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">No alerts to display</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-[hsl(181,75%,16%,0.15)] text-muted-foreground">
                <th className="text-left py-2 px-4 font-medium">Time</th>
                <th className="text-left py-2 px-4 font-medium">Cart</th>
                <th className="text-left py-2 px-4 font-medium">Severity</th>
                <th className="text-left py-2 px-4 font-medium">Message</th>
                <th className="text-left py-2 px-4 font-medium">Status</th>
                <th className="text-right py-2 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((alert) => (
                <tr key={alert.id} className="alert-row border-b border-[hsl(181,75%,16%,0.1)]">
                  <td className="py-2 px-4 font-mono text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-2 px-4 font-mono font-medium">{alert.cartId}</td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-1.5">
                      {severityIcon(alert.severity)}
                      <span className="capitalize">{alert.severity}</span>
                    </div>
                  </td>
                  <td className="py-2 px-4 max-w-[280px] truncate" title={alert.message}>
                    {alert.message}
                  </td>
                  <td className="py-2 px-4">{statusBadge(alert.status)}</td>
                  <td className="py-2 px-4">
                    <div className="flex items-center justify-end gap-1">
                      {canWrite && alert.status === 'new' && (
                        <button
                          onClick={() => actions.acknowledgeAlert(alert.id)}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors"
                          title="Acknowledge"
                        >
                          <Eye size={13} />
                        </button>
                      )}
                      {canWrite && alert.status !== 'resolved' && (
                        <button
                          onClick={() => actions.resolveAlert(alert.id)}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors"
                          title="Resolve"
                        >
                          <Check size={13} />
                        </button>
                      )}
                      {canWrite && alert.type === 'danger_zone' && alert.status !== 'resolved' && (
                        <button
                          onClick={() => {
                            actions.selectCart(alert.cartId);
                            actions.triggerBypass(alert.cartId);
                          }}
                          className="p-1.5 rounded-md hover:bg-accent/10 text-accent transition-colors"
                          title="Bypass"
                        >
                          <Zap size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-end items-center gap-2 px-5 py-2 border-t border-[hsl(181,75%,16%,0.1)] text-xs text-muted-foreground">
          <span>
            Page {page + 1} / {totalPages}
          </span>
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-2 py-1 rounded disabled:opacity-40 hover:bg-muted"
          >
            Prev
          </button>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-2 py-1 rounded disabled:opacity-40 hover:bg-muted"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
