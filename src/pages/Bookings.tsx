import { useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Loader2, X, Clock, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type Booking } from '@/lib/api';
import { useApp, useAuth } from '@/lib/store';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function Bookings() {
  const { state } = useApp();
  const { user } = useAuth();
  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ cartId: string; hour: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dayStart = useMemo(() => startOfDay(date).getTime(), [date]);
  const dayEnd = dayStart + 24 * 3600_000;
  const canEdit = user && user.role !== 'viewer';

  const load = () => {
    setLoading(true);
    api
      .bookings({ from: dayStart, to: dayEnd })
      .then(setBookings)
      .catch((e) => console.warn(e))
      .finally(() => setLoading(false));
  };
  useEffect(load, [dayStart, dayEnd]);

  const cartIds = useMemo(
    () => Array.from(state.carts.keys()).sort(),
    [state.carts]
  );

  const hours = Array.from({ length: 12 }).map((_, i) => i + 7); // 7 AM .. 6 PM

  // Map for quick lookup
  const bookingMap = useMemo(() => {
    const m = new Map<string, Booking>();
    for (const b of bookings) {
      const start = Math.floor((b.starts_at - dayStart) / 3600_000);
      const end = Math.ceil((b.ends_at - dayStart) / 3600_000);
      for (let h = start; h < end; h++) {
        m.set(`${b.cart_id}-${h + 7 * 0 + 0}`, b); // keyed by hour-offset-from-day
      }
    }
    return m;
  }, [bookings, dayStart]);

  function dateLabel(d: Date): string {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center">
            <Calendar size={22} className="text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bookings</h1>
            <p className="text-xs text-muted-foreground">Reserve carts by hour</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate((d) => new Date(d.getTime() - 86400_000))}
            className="px-3 py-1.5 rounded-lg text-xs bg-card hover:bg-muted"
          >
            ←
          </button>
          <span className="text-sm font-medium px-3 py-1.5 rounded-lg bg-card">{dateLabel(date)}</span>
          <button
            onClick={() => setDate((d) => new Date(d.getTime() + 86400_000))}
            className="px-3 py-1.5 rounded-lg text-xs bg-card hover:bg-muted"
          >
            →
          </button>
          <button
            onClick={() => setDate(startOfDay(new Date()))}
            className="px-3 py-1.5 rounded-lg text-xs bg-accent text-accent-foreground hover:brightness-110"
          >
            Today
          </button>
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" /> loading…
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-260px)]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-card">
                    Cart
                  </th>
                  {hours.map((h) => (
                    <th
                      key={h}
                      className="px-2 py-2 font-mono text-muted-foreground text-center min-w-[60px]"
                    >
                      {h}:00
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cartIds.map((cartId) => (
                  <tr key={cartId} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-mono font-semibold sticky left-0 bg-card/50">
                      {cartId}
                    </td>
                    {hours.map((h) => {
                      const hourStart = dayStart + h * 3600_000;
                      const booking = bookings.find(
                        (b) => b.cart_id === cartId && b.starts_at <= hourStart && b.ends_at > hourStart
                      );
                      const isBooked = !!booking;
                      const tone =
                        booking?.status === 'completed'
                          ? 'bg-muted text-muted-foreground'
                          : booking?.status === 'cancelled'
                            ? 'bg-muted/50 line-through text-muted-foreground'
                            : 'bg-accent/30 text-accent-foreground/90';
                      return (
                        <td key={h} className="px-1 py-1">
                          <button
                            disabled={isBooked || !canEdit}
                            onClick={() => setDialog({ cartId, hour: h })}
                            className={`w-full h-7 rounded-md text-[10px] transition-all ${
                              isBooked ? tone : 'bg-muted/20 hover:bg-accent/10 border border-dashed border-border'
                            }`}
                            title={
                              booking
                                ? `Booked${booking.note ? ': ' + booking.note : ''}`
                                : canEdit
                                  ? 'Click to book'
                                  : 'View only'
                            }
                          >
                            {isBooked ? '●' : canEdit ? <Plus size={11} className="mx-auto opacity-40" /> : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {dialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDialog(null)}
          >
            <motion.form
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!dialog) return;
                const fd = new FormData(e.currentTarget);
                const driverId = fd.get('driverId') ? parseInt(fd.get('driverId') as string, 10) : null;
                const dur = parseInt(fd.get('hours') as string, 10);
                const note = (fd.get('note') as string) || null;
                const startsAt = dayStart + dialog.hour * 3600_000;
                const endsAt = startsAt + dur * 3600_000;
                setSubmitting(true);
                try {
                  await api.createBooking({
                    cartId: dialog.cartId,
                    driverId,
                    startsAt,
                    endsAt,
                    note,
                  });
                  setDialog(null);
                  load();
                } catch (err) {
                  alert('Booking failed: ' + (err as Error).message);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="glass rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">
                  New Booking — Cart {dialog.cartId}
                </h3>
                <button type="button" onClick={() => setDialog(null)} className="p-1 hover:bg-muted rounded">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                    <Clock size={11} /> Start
                  </span>
                  <p className="text-sm font-mono">
                    {dateLabel(date)} · {dialog.hour}:00
                  </p>
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground mb-1 block">Duration</span>
                  <select name="hours" defaultValue="1" className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm">
                    <option value="1">1 hour</option>
                    <option value="2">2 hours</option>
                    <option value="3">3 hours</option>
                    <option value="4">4 hours</option>
                    <option value="6">6 hours</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
                    <User size={11} /> Driver
                  </span>
                  <select name="driverId" className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm">
                    <option value="">Unassigned</option>
                    {state.drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.role ?? ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground mb-1 block">Note</span>
                  <input
                    name="note"
                    type="text"
                    placeholder="Optional note"
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="px-4 py-2 rounded-lg text-sm hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-sm bg-accent text-accent-foreground font-medium hover:brightness-110 disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Book'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
