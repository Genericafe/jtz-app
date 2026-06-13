import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList, Calendar,
  CreditCard, ShoppingBag, MessageSquare, LogOut, Zap, User, Settings, MessageCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const coachNav = [
  { to: '/',             label: 'Inicio',          icon: LayoutDashboard },
  { to: '/corredores',   label: 'Corredores',       icon: Users },
  { to: '/planes',       label: 'Entrenamientos',   icon: ClipboardList },
  { to: '/eventos',      label: 'Eventos',          icon: Calendar },
  { to: '/pagos',        label: 'Pagos',            icon: CreditCard },
  { to: '/tienda',       label: 'Tienda',           icon: ShoppingBag },
  { to: '/comunicacion', label: 'Comunicación',     icon: MessageSquare },
  { to: '/chat',         label: 'Chat privado',     icon: MessageCircle },
  { to: '/perfil',       label: 'Mi perfil',        icon: User },
  { to: '/configuracion', label: 'Configuración',   icon: Settings },
];

const runnerNav = [
  { to: '/',             label: 'Mi inicio',        icon: LayoutDashboard },
  { to: '/planes',       label: 'Mis planes',       icon: ClipboardList },
  { to: '/eventos',      label: 'Eventos',          icon: Calendar },
  { to: '/pagos',        label: 'Mis pagos',        icon: CreditCard },
  { to: '/comunicacion', label: 'Comunicación',     icon: MessageSquare },
  { to: '/chat',         label: 'Chat con coach',   icon: MessageCircle },
  { to: '/perfil',       label: 'Mi perfil',        icon: User },
  { to: '/configuracion', label: 'Configuración',  icon: Settings },
];

function Avatar({ name, email, role }: { name?: string; email?: string; role?: string }) {
  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
  return (
    <div className="flex items-center gap-3 px-2 py-2.5 rounded-xl bg-surface-600 border border-white/[0.06]">
      <div className="w-9 h-9 rounded-full bg-hero flex items-center justify-center text-sm font-bold text-white flex-shrink-0 shadow-glow-sm">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate leading-tight">{name ?? email}</p>
        <p className="text-xs text-brand-400 font-medium">{role === 'coach' ? 'Coach' : 'Corredor'}</p>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { user, logout, isCoach } = useAuth();
  const navItems = isCoach ? coachNav : runnerNav;
  const runnerName = user?.runner ? `${user.runner.nombre} ${user.runner.apellido}` : user?.email;

  return (
    <aside className="w-64 min-h-screen bg-surface-800 flex flex-col border-r border-white/[0.05]">
      {/* Logo */}
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-hero flex items-center justify-center shadow-glow-sm">
            <Zap size={20} className="text-white" fill="white" />
          </div>
          <div>
            <p className="text-xl font-black tracking-tight gradient-text">JTZ</p>
            <p className="text-xs text-gray-500 -mt-0.5">Running Club</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 pb-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-brand-500/15 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-surface-600'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`flex-shrink-0 transition-colors ${isActive ? 'text-brand-400' : 'text-gray-500 group-hover:text-gray-300'}`}>
                  <Icon size={18} />
                </span>
                <span>{label}</span>
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-3 pb-5 space-y-2">
        <Avatar name={runnerName} email={user?.email} role={user?.role} />
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm text-gray-500 hover:text-white hover:bg-surface-600 transition-all duration-150"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
