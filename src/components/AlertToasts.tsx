import { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '@/lib/store';
import type { AlertEvent } from '@/lib/telemetry';

interface ToastItem {
  alert: AlertEvent;
  dismissAt: number;
}

export function AlertToasts() {
  const { state } = useApp();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenRef = useRef(new Set<number>());

  useEffect(() => {
    const latest = state.alerts.slice(0, 5);
    const fresh = latest.filter((a) => !seenRef.current.has(a.id));
    if (fresh.length === 0) return;
    fresh.forEach((a) => seenRef.current.add(a.id));
    const add: ToastItem[] = fresh.map((a) => ({
      alert: a,
      dismissAt: Date.now() + (a.severity === 'critical' ? 12000 : a.severity === 'warning' ? 7000 : 4000),
    }));
    setToasts((prev) => [...add, ...prev].slice(0, 5));
  }, [state.alerts]);

  useEffect(() => {
    const interval = setInterval(
      () => setToasts((prev) => prev.filter((t) => t.dismissAt > Date.now())),
      400
    );
    return () => clearInterval(interval);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.alert.id !== id));

  const config: Record<string, { icon: any; border: string }> = {
    critical: { icon: AlertCircle, border: 'border-l-danger' },
    warning: { icon: AlertTriangle, border: 'border-l-warning' },
    info: { icon: Info, border: 'border-l-info' },
  };

  return (
    <div className="fixed bottom-4 right-4 z-[2000] flex flex-col gap-2 w-[360px]">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const c = config[toast.alert.severity];
          const Icon = c.icon;
          return (
            <motion.div
              key={toast.alert.id}
              layout
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              className={`glass rounded-xl border-l-4 ${c.border} p-3.5 cursor-pointer`}
              onClick={() => dismiss(toast.alert.id)}
            >
              <div className="flex items-start gap-2.5">
                <Icon size={16} className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{toast.alert.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{toast.alert.message}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                    Cart {toast.alert.cartId} · {new Date(toast.alert.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(toast.alert.id);
                  }}
                  className="p-0.5 rounded hover:bg-muted transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
