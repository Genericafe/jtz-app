import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList, Calendar,
  CreditCard, ShoppingBag, MessageSquare, LogOut, Zap, User, Settings, MessageCircle, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { runnersApi, chatApi } from '../services/api';

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
  { to: '/tienda',       label: 'Tienda',           icon: ShoppingBag },
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

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout, isCoach } = useAuth();
  const navItems = isCoach ? coachNav : runnerNav;

  const { data: meData } = useQuery({
    queryKey: ['runner-me'],
    queryFn: () => runnersApi.me(),
    staleTime: 30000,
  });

  const me = meData?.data;
  const runnerName = me
    ? `${me.nombre} ${me.apellido}`.trim()
    : user?.runner
      ? `${user.runner.nombre} ${user.runner.apellido}`.trim()
      : user?.email;

  // Unread message counts
  const { data: conversations } = useQuery<{ runner: { id: number }; unreadCount: number }[]>({
    queryKey: ['chat-conversations'],
    queryFn: () => chatApi.conversations().then((r) => r.data),
    refetchInterval: 5000,
    enabled: isCoach,
    staleTime: 0,
  });

  const myRunnerId = me?.id ?? user?.runner?.id;
  const { data: runnerMessages } = useQuery<{ fromMe: boolean; leido: boolean }[]>({
    queryKey: ['chat-messages', myRunnerId],
    queryFn: () => chatApi.messages(myRunnerId!).then((r) => r.data),
    refetchInterval: 5000,
    enabled: !isCoach && !!myRunnerId,
    staleTime: 0,
  });

  const chatUnread = isCoach
    ? (conversations ?? []).reduce((sum, c) => sum + (c.unreadCount ?? 0), 0)
    : (runnerMessages ?? []).filter((m) => !m.fromMe && !m.leido).length;

  return (
    <aside className={`
      fixed top-0 left-0 z-40 h-screen
      w-72 lg:w-64
      bg-surface-800 flex flex-col border-r border-white/[0.05]
      transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
    `}>
      {/* Logo */}
      <div className="px-5 py-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-hero flex items-center justify-center shadow-glow-sm">
            <Zap size={20} className="text-white" fill="white" />
          </div>
          <div>
            <p className="text-xl font-black tracking-tight gradient-text">JTZ</p>
            <p className="text-xs text-gray-500 -mt-0.5">Running Club</p>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="lg:hidden p-2 rounded-xl text-gray-500 hover:text-white hover:bg-surface-600 transition-all"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 pb-4 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onClose}
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
                {to === '/chat' && chatUnread > 0 ? (
                  <span className="ml-auto min-w-[20px] h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center px-1.5 shadow-glow-sm">
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </span>
                ) : (
                  isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-3 pb-5 space-y-2 flex-shrink-0">
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
