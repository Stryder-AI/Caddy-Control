import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from '@/components/AppProvider';
import { TopNav } from '@/components/TopNav';
import { useAuth } from '@/lib/store';
import Dashboard from './pages/Dashboard';
import Bookings from './pages/Bookings';
import CartsPage from './pages/CartsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import FencesPage from './pages/FencesPage';
import ProfilesPage from './pages/ProfilesPage';
import NotFound from './pages/NotFound';
import { Loader2 } from 'lucide-react';

const queryClient = new QueryClient();

function Guard({
  roles,
  children,
}: {
  roles: Array<'admin' | 'operator' | 'viewer'>;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppShell() {
  const { user, ready } = useAuth();
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-accent" />
      </div>
    );
  }
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <>
      <TopNav />
      <main className="pt-14">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/carts" element={<CartsPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route
            path="/fences"
            element={
              <Guard roles={['admin']}>
                <FencesPage />
              </Guard>
            }
          />
          <Route
            path="/profiles"
            element={
              <Guard roles={['admin']}>
                <ProfilesPage />
              </Guard>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
