import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-surface-900 text-white">
      <Sidebar />
      <main className="flex-1 overflow-auto min-h-screen">
        {/* Subtle glow effect at top */}
        <div className="pointer-events-none fixed top-0 left-64 right-0 h-64 bg-glow-green z-0" />
        <div className="relative z-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
