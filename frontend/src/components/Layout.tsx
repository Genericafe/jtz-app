import { useEffect, useRef, useState, useCallback } from 'react';
import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, X, Menu, Zap } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { chatApi } from '../services/api';

interface ConvEntry {
  runner: { id: number; nombre: string; apellido: string };
  unreadCount: number;
}

interface MsgEntry {
  fromMe: boolean;
  leido: boolean;
}

function ChatNotification() {
  const { isCoach, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, setToast] = useState<{ name: string; to: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCoachCounts = useRef<Map<number, number>>(new Map());
  const coachInitialized = useRef(false);
  const prevRunnerCount = useRef(-1);

  const myRunnerId = user?.runner?.id;

  const { data: conversations } = useQuery<ConvEntry[]>({
    queryKey: ['chat-conversations'],
    queryFn: () => chatApi.conversations().then((r) => r.data),
    refetchInterval: 5000,
    enabled: isCoach,
  });

  const { data: messages } = useQuery<MsgEntry[]>({
    queryKey: ['chat-messages', myRunnerId],
    queryFn: () => chatApi.messages(myRunnerId!).then((r) => r.data),
    refetchInterval: 5000,
    enabled: !isCoach && !!myRunnerId,
  });

  const triggerToast = useCallback((name: string, to: string) => {
    if (location.pathname.startsWith('/chat')) return;
    setToast({ name, to });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 5000);
  }, [location.pathname]);

  useEffect(() => {
    if (!isCoach || !conversations) return;

    if (!coachInitialized.current) {
      conversations.forEach((c) => prevCoachCounts.current.set(c.runner.id, c.unreadCount));
      coachInitialized.current = true;
      return;
    }

    for (const conv of conversations) {
      const prev = prevCoachCounts.current.get(conv.runner.id) ?? 0;
      if (conv.unreadCount > prev) {
        triggerToast(`${conv.runner.nombre} ${conv.runner.apellido}`, `/chat/${conv.runner.id}`);
        break;
      }
    }

    conversations.forEach((c) => prevCoachCounts.current.set(c.runner.id, c.unreadCount));
  }, [conversations, isCoach, triggerToast]);

  useEffect(() => {
    if (isCoach || !messages) return;

    const unread = messages.filter((m) => !m.fromMe && !m.leido).length;

    if (prevRunnerCount.current === -1) {
      prevRunnerCount.current = unread;
      return;
    }

    if (unread > prevRunnerCount.current) {
      triggerToast('Coach JTZ', '/chat');
    }

    prevRunnerCount.current = unread;
  }, [messages, isCoach, triggerToast]);

  if (!toast) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <div className="bg-surface-700 border border-white/10 rounded-2xl shadow-2xl p-4 flex items-center gap-3 max-w-xs animate-slide-up">
        <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
          <MessageCircle size={18} className="text-brand-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">Nuevo mensaje</p>
          <p className="text-sm font-semibold text-white truncate">{toast.name} te envió un mensaje</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button onClick={() => setToast(null)} className="text-gray-600 hover:text-gray-400 transition-colors">
            <X size={14} />
          </button>
          <button
            onClick={() => { navigate(toast.to); setToast(null); }}
            className="text-[11px] text-brand-400 hover:text-brand-300 font-semibold whitespace-nowrap"
          >
            Ver →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-surface-900 text-white">
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-30 lg:hidden transition-opacity duration-300 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col h-screen overflow-hidden lg:ml-64 min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-surface-800/95 backdrop-blur border-b border-white/[0.05] z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white transition-colors p-1 -ml-1"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-hero flex items-center justify-center shadow-glow-sm">
              <Zap size={13} className="text-white" fill="white" />
            </div>
            <span className="font-black text-white tracking-tight">JTZ</span>
            <span className="text-xs text-gray-500 hidden sm:block">Running Club</span>
          </div>
        </div>

        <div className="pointer-events-none fixed top-0 left-64 right-0 h-64 bg-glow-green z-0 hidden lg:block" />
        <div className="relative z-10 flex-1 min-h-0 overflow-auto">
          <Outlet />
        </div>
      </main>

      <ChatNotification />
    </div>
  );
}
