import { useEffect, useMemo, useState } from 'react';
import { User, UserPlus, Save, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/lib/store';
import { api } from '@/lib/api';
import type { Driver } from '@/lib/telemetry';

export default function ProfilesPage() {
  const { state, actions } = useApp();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDriver, setNewDriver] = useState(false);
  const [editingCart, setEditingCart] = useState<string | null>(null);
  const [editCartDraft, setEditCartDraft] = useState<{ name: string; driverId: number | null; vehicleTag: string; notes: string }>({ name: '', driverId: null, vehicleTag: '', notes: '' });

  useEffect(() => {
    load();
  }, []);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const ds = await api.drivers();
      setDrivers(ds);
      actions.setDrivers(ds);
    } finally {
      setLoading(false);
    }
  }

  const cartList = useMemo(() => Array.from(state.carts.values()).sort((a, b) => a.cartId.localeCompare(b.cartId)), [state.carts]);

  async function saveDriver(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') as string).trim();
    const role = ((fd.get('role') as string) || '').trim() || null;
    if (!name) return;
    try {
      await api.createDriver({ name, role });
      setNewDriver(false);
      load();
    } catch (err) {
      alert('Failed: ' + (err as Error).message);
    }
  }

  async function saveCartEdit(cartId: string): Promise<void> {
    try {
      await api.patchCart(cartId, {
        name: editCartDraft.name,
        driverId: editCartDraft.driverId,
        vehicleTag: editCartDraft.vehicleTag || null,
        notes: editCartDraft.notes || null,
      });
      setEditingCart(null);
      await actions.refreshCarts();
    } catch (e) {
      alert('Failed: ' + (e as Error).message);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center">
          <User size={22} className="text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Profiles</h1>
          <p className="text-xs text-muted-foreground">Manage drivers and cart assignments</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Drivers</h2>
            <button
              onClick={() => setNewDriver(true)}
              className="inline-flex items-center gap-1.5 text-xs bg-accent text-accent-foreground px-3 py-1.5 rounded-lg hover:brightness-110"
            >
              <UserPlus size={13} /> New
            </button>
          </div>

          <div className="glass rounded-xl divide-y divide-border overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
                <Loader2 size={14} className="animate-spin mr-2" /> loading…
              </div>
            ) : (
              drivers.map((d) => (
                <motion.div
                  key={d.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40"
                >
                  <span className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center font-semibold text-sm">
                    {d.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.name}</p>
                    <p className="text-[11px] text-muted-foreground">{d.role ?? ''}</p>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </section>

        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Cart Profiles</h2>
            <span className="text-xs text-muted-foreground">{cartList.length} carts</span>
          </div>

          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2 font-medium">Cart</th>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Driver</th>
                  <th className="text-left px-4 py-2 font-medium">Tag</th>
                  <th className="text-left px-4 py-2 font-medium">IMEI</th>
                  <th className="text-right px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cartList.map((cart) => {
                  const isEditing = editingCart === cart.cartId;
                  return (
                    <tr key={cart.cartId} className="border-t border-border hover:bg-muted/20">
                      <td className="px-4 py-2 font-mono font-semibold">{cart.cartId}</td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <input
                            value={editCartDraft.name}
                            onChange={(e) => setEditCartDraft({ ...editCartDraft, name: e.target.value })}
                            className="bg-card border border-border rounded px-2 py-1 text-sm w-32"
                          />
                        ) : (
                          cart.name
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <select
                            value={editCartDraft.driverId ?? ''}
                            onChange={(e) =>
                              setEditCartDraft({
                                ...editCartDraft,
                                driverId: e.target.value ? parseInt(e.target.value, 10) : null,
                              })
                            }
                            className="bg-card border border-border rounded px-2 py-1 text-sm"
                          >
                            <option value="">—</option>
                            {drivers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          cart.driver?.name ?? <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {isEditing ? (
                          <input
                            value={editCartDraft.vehicleTag}
                            onChange={(e) =>
                              setEditCartDraft({ ...editCartDraft, vehicleTag: e.target.value })
                            }
                            className="bg-card border border-border rounded px-2 py-1 text-sm w-24"
                          />
                        ) : (
                          cart.vehicleTag ?? '—'
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {cart.imei ?? <span className="italic">unbound</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => saveCartEdit(cart.cartId)}
                              className="p-1.5 rounded hover:bg-accent/10 text-accent"
                              title="Save"
                            >
                              <Save size={13} />
                            </button>
                            <button
                              onClick={() => setEditingCart(null)}
                              className="p-1.5 rounded hover:bg-muted"
                              title="Cancel"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingCart(cart.cartId);
                              setEditCartDraft({
                                name: cart.name,
                                driverId: cart.driver?.id ?? null,
                                vehicleTag: cart.vehicleTag ?? '',
                                notes: cart.notes ?? '',
                              });
                            }}
                            className="px-3 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <AnimatePresence>
        {newDriver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setNewDriver(false)}
          >
            <motion.form
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={saveDriver}
              className="glass rounded-2xl p-6 w-full max-w-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">New Driver</h3>
                <button type="button" onClick={() => setNewDriver(false)} className="p-1 rounded hover:bg-muted">
                  <X size={16} />
                </button>
              </div>
              <label className="block mb-3">
                <span className="text-xs text-muted-foreground mb-1 block">Name</span>
                <input
                  name="name"
                  required
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
              <label className="block mb-4">
                <span className="text-xs text-muted-foreground mb-1 block">Role</span>
                <input
                  name="role"
                  placeholder="e.g. Senior Caddy"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setNewDriver(false)} className="px-4 py-2 rounded-lg text-sm hover:bg-muted">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg text-sm bg-accent text-accent-foreground font-medium">
                  Create
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
