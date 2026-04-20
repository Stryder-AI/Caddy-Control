import { useEffect, useRef, useState } from 'react';
import { Bell, Settings, LogOut, ChevronDown, Radio } from 'lucide-react';
import { useApp, useAuth } from '@/lib/store';
import { useLocation, useNavigate } from 'react-router-dom';

const baseItems = [
  { label: 'Dashboard', path: '/', role: 'viewer' as const },
  { label: 'Bookings', path: '/bookings', role: 'viewer' as const },
  { label: 'Carts', path: '/carts', role: 'viewer' as const },
  { label: 'Leaderboard', path: '/leaderboard', role: 'viewer' as const },
  { label: 'Fences', path: '/fences', role: 'admin' as const },
  { label: 'Profiles', path: '/profiles', role: 'admin' as const },
];
const roleRank: Record<string, number> = { viewer: 0, operator: 1, admin: 2 };

export function TopNav() {
  const { state } = useApp();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const carts = Array.from(state.carts.values());
  const activeCarts = carts.filter((c) => c.state?.status === 'ACTIVE').length;
  const dangerCarts = carts.filter((c) => c.state?.status === 'DANGER').length;
  const offlineCarts = carts.filter((c) => !c.state?.connected).length;
  const bypassedCarts = carts.filter((c) => c.state?.bypassActive).length;
  const unresolvedAlerts = state.alerts.filter((a) => a.status !== 'resolved').length;

  const navItems = baseItems.filter((i) => {
    if (!user) return false;
    return roleRank[user.role] >= roleRank[i.role];
  });

  const connColor =
    state.connection === 'online'
      ? 'text-accent'
      : state.connection === 'connecting'
        ? 'text-warning'
        : 'text-danger';
  const connLabel =
    state.connection === 'online' ? 'Live' : state.connection === 'connecting' ? '…' : 'Offline';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-5 bg-nav">
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-bold tracking-tight text-nav-foreground">Caddy Control</span>
        <span className="text-[10px] font-medium tracking-wide text-nav-foreground/50 uppercase">
          Fleet & Golf Management
        </span>
      </div>

      <nav className="hidden md:flex items-center gap-1">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-2">
          <span className="status-chip" title="Connected to backend">
            <Radio size={10} className={connColor} />
            {connLabel}
          </span>
          <span className="status-chip">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            {activeCarts} Active
          </span>
          {dangerCarts > 0 && (
            <span className="status-chip">
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
              {dangerCarts} Danger
            </span>
          )}
          {bypassedCarts > 0 && (
            <span className="status-chip">
              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
              {bypassedCarts} Bypassed
            </span>
          )}
          <span className="status-chip">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
            {offlineCarts} Offline
          </span>
        </div>

        <button
          onClick={() => navigate('/')}
          className="relative p-2 rounded-lg text-nav-foreground/60 hover:text-nav-foreground/90 transition-colors"
          title="Alerts"
        >
          <Bell size={18} />
          {unresolvedAlerts > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-danger text-[10px] font-bold text-accent-foreground">
              {unresolvedAlerts}
            </span>
          )}
        </button>

        <button
          onClick={() => navigate('/settings')}
          className="p-2 rounded-lg text-nav-foreground/60 hover:text-nav-foreground/90 transition-colors"
        >
          <Settings size={18} />
        </button>

        {user && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-nav-foreground/80 hover:bg-nav-foreground/10 transition-colors"
            >
              <span className="w-7 h-7 rounded-full bg-accent/30 flex items-center justify-center font-semibold text-xs">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden md:inline text-xs">{user.name.split(' ')[0]}</span>
              <ChevronDown size={12} />
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-xl glass p-2 shadow-lg z-[60]">
                <div className="px-3 py-2 border-b border-border mb-1">
                  <p className="text-xs font-semibold text-foreground">{user.name}</p>
                  <p className="text-[10px] text-muted-foreground">{user.email}</p>
                  <span className="inline-block mt-1 px-1.5 py-0.5 bg-accent/10 text-accent rounded text-[10px] font-medium capitalize">
                    {user.role}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
