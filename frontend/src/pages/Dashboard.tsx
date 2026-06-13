import { useAuth } from '../context/AuthContext';
import RunnerDashboard from './RunnerDashboard';
import { useQuery } from '@tanstack/react-query';
import { runnersApi, paymentsApi, eventsApi, announcementsApi } from '../services/api';
import { Runner, Event, Payment, Announcement } from '../types';
import { format, isAfter, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Users, TrendingUp, AlertTriangle, Megaphone,
  Calendar, MapPin, ChevronRight, Zap, Clock,
} from 'lucide-react';

const eventGradient: Record<string, string> = {
  carrera:       'bg-carrera',
  trail:         'bg-trail',
  entrenamiento: 'bg-entrenamiento',
  social:        'bg-social',
};

const eventEmoji: Record<string, string> = {
  carrera: '🏃', trail: '🏔️', entrenamiento: '💪', social: '🎉',
};

function EventStoryCard({ ev }: { ev: Event }) {
  const gradient = eventGradient[ev.tipo] ?? 'bg-carrera';
  return (
    <div className={`${gradient} rounded-2xl p-5 min-w-[200px] max-w-[200px] flex flex-col justify-between h-36 cursor-pointer hover:scale-105 transition-transform duration-200 shadow-glow-sm flex-shrink-0`}>
      <div className="flex items-start justify-between">
        <span className="text-2xl">{eventEmoji[ev.tipo] ?? '🏃'}</span>
        <span className="text-xs bg-black/20 backdrop-blur rounded-full px-2 py-0.5 text-white font-medium">
          {ev.distanciaKm ? `${ev.distanciaKm}km` : ev.tipo}
        </span>
      </div>
      <div>
        <p className="font-bold text-white text-sm leading-tight line-clamp-2">{ev.nombre}</p>
        <p className="text-white/70 text-xs mt-1">
          {format(new Date(ev.fecha), "d MMM", { locale: es })} · {ev.ciudad}
        </p>
      </div>
    </div>
  );
}

function AnnouncementCard({ ann }: { ann: Announcement }) {
  const typeConfig: Record<string, { emoji: string; color: string }> = {
    general:       { emoji: '📢', color: 'text-blue-400' },
    urgente:       { emoji: '🚨', color: 'text-red-400' },
    entrenamiento: { emoji: '💪', color: 'text-brand-400' },
    evento:        { emoji: '🎯', color: 'text-purple-400' },
  };
  const cfg = typeConfig[ann.tipo] ?? typeConfig.general;

  return (
    <div className="card p-4 animate-slide-up">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-hero flex items-center justify-center text-lg flex-shrink-0 shadow-glow-sm">
          J
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-white">Coach JTZ</span>
            <span className={`text-xs ${cfg.color}`}>{cfg.emoji}</span>
            <span className="text-xs text-gray-500 ml-auto">
              {formatDistanceToNow(new Date(ann.createdAt), { locale: es, addSuffix: true })}
            </span>
          </div>
          <p className="text-sm font-semibold text-white mb-1">{ann.titulo}</p>
          <p className="text-sm text-gray-400 leading-relaxed">{ann.contenido}</p>
        </div>
      </div>
    </div>
  );
}

function CoachDashboard() {
  const { data: runnersData } = useQuery({ queryKey: ['runners'], queryFn: () => runnersApi.list() });
  const { data: paymentsData } = useQuery({ queryKey: ['payments'], queryFn: () => paymentsApi.list() });
  const { data: statsData } = useQuery({ queryKey: ['payment-stats'], queryFn: () => paymentsApi.stats() });
  const { data: eventsData } = useQuery({ queryKey: ['events'], queryFn: () => eventsApi.list() });
  const { data: annData } = useQuery({ queryKey: ['announcements'], queryFn: () => announcementsApi.list() });

  const runners: Runner[] = runnersData?.data ?? [];
  const payments: Payment[] = paymentsData?.data ?? [];
  const events: Event[] = eventsData?.data ?? [];
  const announcements: Announcement[] = annData?.data ?? [];
  const stats = statsData?.data;

  const activeRunners = runners.filter((r) => r.activo).length;
  const pendingPayments = payments.filter((p) => p.estado === 'pendiente').length;
  const upcomingEvents = events.filter((e) => isAfter(new Date(e.fecha), new Date()));

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">
          Buenos días, <span className="gradient-text">Coach</span> 👋
        </h1>
        <p className="text-gray-500 text-sm mt-0.5 capitalize">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Corredores', value: activeRunners, icon: Users, sub: 'activos', color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Pendientes', value: pendingPayments, icon: AlertTriangle, sub: 'por cobrar', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: 'Eventos', value: upcomingEvents.length, icon: Calendar, sub: 'próximos', color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: 'Ingresos', value: `$${((stats?.totalRecaudado ?? 0) / 1000).toFixed(0)}k`, icon: TrendingUp, sub: 'MXN cobrado', color: 'text-brand-400', bg: 'bg-brand-500/10' },
        ].map(({ label, value, icon: Icon, sub, color, bg }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon size={18} className={color} />
            </div>
            <div>
              <p className="text-xl font-black text-white leading-tight">{value}</p>
              <p className="text-xs text-gray-500">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Main feed */}
        <div className="xl:col-span-2 space-y-5">
          {/* Event stories */}
          {upcomingEvents.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap size={15} className="text-brand-400" /> Próximos eventos
                </h2>
                <a href="/eventos" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                  Ver todos <ChevronRight size={13} />
                </a>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {upcomingEvents.slice(0, 6).map((ev) => (
                  <EventStoryCard key={ev.id} ev={ev} />
                ))}
              </div>
            </div>
          )}

          {/* Announcements feed */}
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
              <Megaphone size={15} className="text-brand-400" /> Feed del equipo
            </h2>
            <div className="space-y-3">
              {announcements.slice(0, 5).map((ann) => (
                <AnnouncementCard key={ann.id} ann={ann} />
              ))}
              {announcements.length === 0 && (
                <div className="card p-8 text-center text-gray-500 text-sm">
                  No hay publicaciones aún. Ve a Comunicación para crear una.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right widgets */}
        <div className="space-y-4">
          {/* Nivel distribution */}
          <div className="card p-5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Equipo por nivel</h3>
            {(['principiante', 'intermedio', 'avanzado', 'elite'] as const).map((nivel) => {
              const count = runners.filter((r) => r.nivel === nivel && r.activo).length;
              const pct = activeRunners > 0 ? Math.round((count / activeRunners) * 100) : 0;
              const colors: Record<string, string> = {
                principiante: 'bg-green-500', intermedio: 'bg-blue-500',
                avanzado: 'bg-purple-500', elite: 'bg-brand-500',
              };
              return (
                <div key={nivel} className="mb-3">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-300 capitalize">{nivel}</span>
                    <span className="text-gray-500">{count}</span>
                  </div>
                  <div className="h-1.5 bg-surface-500 rounded-full overflow-hidden">
                    <div className={`h-full ${colors[nivel]} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pending payments */}
          <div className="card p-5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Clock size={13} /> Cobros pendientes
            </h3>
            {payments.filter(p => p.estado === 'pendiente').slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                <div>
                  <p className="text-xs font-medium text-white">{p.runner?.nombre} {p.runner?.apellido}</p>
                  <p className="text-xs text-gray-500 capitalize">{p.concepto.replace('_',' ')}</p>
                </div>
                <p className="text-xs font-bold text-yellow-400">${p.monto.toLocaleString('es-MX')}</p>
              </div>
            ))}
            {payments.filter(p => p.estado === 'pendiente').length === 0 && (
              <p className="text-xs text-gray-500">¡Todo al corriente!</p>
            )}
            <a href="/pagos" className="mt-3 block text-xs text-brand-400 hover:text-brand-300 text-center">Ver todos →</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { isCoach } = useAuth();
  return isCoach ? <CoachDashboard /> : <RunnerDashboard />;
}
