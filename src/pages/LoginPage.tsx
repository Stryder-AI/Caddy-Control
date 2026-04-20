import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { LogIn, Loader2, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@caddy.local');
  const [password, setPassword] = useState('caddy1234');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError('Invalid credentials. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[hsl(181,75%,14%)] via-[hsl(181,75%,10%)] to-[hsl(155,70%,15%)]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div className="glass-dark rounded-2xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center mb-3">
              <ShieldCheck size={26} className="text-accent" />
            </div>
            <h1 className="text-xl font-bold text-white">Caddy Control</h1>
            <p className="text-xs text-white/60 mt-1">Fleet & Geofence Operations</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="text-xs text-white/70 mb-1 block">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                required
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/70 mb-1 block">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                required
              />
            </label>
            {error && (
              <p className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-accent text-accent-foreground rounded-lg py-2.5 text-sm font-semibold hover:brightness-110 disabled:opacity-60"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/10">
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Demo credentials</p>
            <ul className="text-[11px] text-white/60 space-y-0.5 font-mono">
              <li>admin@caddy.local · caddy1234</li>
              <li>operator@caddy.local · operator1234</li>
              <li>viewer@caddy.local · viewer1234</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
