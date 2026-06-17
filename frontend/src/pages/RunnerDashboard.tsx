import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runnersApi, eventsApi, stripeApi, announcementsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Calendar, CreditCard, CheckCircle, Clock, AlertTriangle, MapPin, Dumbbell, ChevronRight, Target, Megaphone } from 'lucide-react';
import { format, isAfter, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { Event, Payment, Announcement } from '../types';

export default function RunnerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: meData, isLoading } = useQuery({
    queryKey: ['runner-me'],
    queryFn: () => runnersApi.me(),
  });

  const { data: eventsData } = useQuery({
    queryKey: ['events'],
    queryFn: () => eventsApi.list(),
  });

  const { data: annData } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => announcementsApi.list(),
  });
  const announcements: Announcement[] = annData?.data ?? [];

  const checkoutMutation = useMutation({
    mutationFn: (paymentId: number) => stripeApi.createCheckout(paymentId),
    onSuccess: (res) => {
      window.location.href = res.data.url;
    },
  });

  const me = meData?.data;
  const allEvents: Event[] = eventsData?.data ?? [];
  // Show upcoming events first; if none, show 4 most recent past events
  const upcomingEvents = allEvents.filter((e) => isAfter(new Date(e.fecha), new Date()));
  const dashboardEvents = upcomingEvents.length > 0
    ? upcomingEvents.slice(0, 4)
    : [...allEvents].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 4);
  const pendingPayments: Payment[] = (me?.payments ?? []).filter((p: Payment) => p.estado !== 'pagado').slice(0, 3);
  const myPlans: { id: number; planId: number; activo: boolean; fechaInicio: string; fechaFin?: string; plan: { id: number; nombre: string; nivel: string; objetivo?: string; duracionSemanas: number; descripcion?: string } }[] = me?.trainingPlans ?? [];
  const registeredEventIds = new Set((me?.eventRegistrations ?? []).map((r: { eventId: number }) => r.eventId));

  const estadoIcon = { pagado: CheckCircle, pendiente: Clock, vencido: AlertTriangle } as const;
  const estadoColor = { pagado: 'text-green-400', pendiente: 'text-yellow-400', vencido: 'text-red-400' } as const;

  if (isLoading) return <div className="p-4 lg:p-8 text-gray-400">Cargando tu perfil...</div>;

  return (
    <div className="p-4 lg:p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          ¡Hola, {me?.nombre ?? user?.runner?.nombre}! 👋
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })} · {me?.ciudad}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Mis planes */}
        <div className="xl:col-span-2">
          {/* Comunicados del coach */}
          {announcements.length > 0 && (
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-6 mb-6">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Megaphone size={15} className="text-brand-400" /> Comunicados del coach
              </h2>
              <div className="space-y-3">
                {announcements.slice(0, 4).map(ann => {
                  const cfg: Record<string, string> = { general: '📢', urgente: '🚨', entrenamiento: '💪', evento: '🎯' };
                  return (
                    <div key={ann.id} className="bg-dark-700 rounded-xl p-4 border border-dark-600">
                      <div className="flex items-center gap-2 mb-1">
                        <span>{cfg[ann.tipo] ?? '📢'}</span>
                        <span className="text-sm font-bold text-white">{ann.titulo}</span>
                        <span className="text-xs text-gray-500 ml-auto">
                          {formatDistanceToNow(new Date(ann.createdAt), { locale: es, addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">{ann.contenido}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-dark-800 border border-dark-700 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Dumbbell size={15} className="text-brand-400" /> Mis planes de entrenamiento
            </h2>
            {myPlans.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Dumbbell size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Tu coach aún no te ha asignado un plan</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myPlans.map((assignment) => (
                  <button
                    key={assignment.id}
                    onClick={() => navigate(`/planes/${assignment.planId}`)}
                    className="w-full text-left p-4 bg-dark-700 rounded-xl border border-dark-600 hover:border-brand-500/40 hover:bg-dark-600 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-white text-sm leading-snug">{assignment.plan.nombre}</p>
                          {assignment.activo && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">Activo</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                          {assignment.plan.objetivo && (
                            <span className="flex items-center gap-1"><Target size={11} />{assignment.plan.objetivo}</span>
                          )}
                          <span className="flex items-center gap-1"><Clock size={11} />{assignment.plan.duracionSemanas} semanas</span>
                          <span className="capitalize px-1.5 py-0.5 rounded bg-dark-600 text-gray-400">{assignment.plan.nivel}</span>
                        </div>
                        <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                          <span>Inicio: {format(new Date(assignment.fechaInicio), "d MMM yyyy", { locale: es })}</span>
                          {assignment.fechaFin && (
                            <span>Fin: {format(new Date(assignment.fechaFin), "d MMM yyyy", { locale: es })}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-gray-600 group-hover:text-brand-400 transition-colors flex-shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Próximos eventos */}
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Calendar size={15} className="text-brand-400" /> Próximos eventos
            </h2>
            {allEvents.length === 0 ? (
              <p className="text-gray-500 text-sm">Sin eventos disponibles</p>
            ) : (
              <>
                {upcomingEvents.length === 0 && (
                  <p className="text-xs text-gray-500 mb-2">No hay eventos próximos — mostrando los más recientes</p>
                )}
                <div className="space-y-3">
                  {dashboardEvents.map((ev) => {
                    const registered = registeredEventIds.has(ev.id);
                    const isPast = !isAfter(new Date(ev.fecha), new Date());
                    return (
                      <button
                        key={ev.id}
                        onClick={() => navigate(`/eventos`)}
                        className="w-full flex items-center gap-4 p-3 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors text-left"
                      >
                        <div className="text-center min-w-[2.5rem]">
                          <p className="text-xs text-gray-400">{format(new Date(ev.fecha), 'MMM', { locale: es }).toUpperCase()}</p>
                          <p className={`text-lg font-bold leading-none ${isPast ? 'text-gray-500' : 'text-brand-400'}`}>
                            {format(new Date(ev.fecha), 'd')}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isPast ? 'text-gray-400' : 'text-white'}`}>{ev.nombre}</p>
                          <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                            <MapPin size={11} /> {ev.lugar}
                          </div>
                        </div>
                        {registered ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-green-500/15 text-green-400 flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle size={11} /> Inscrito
                          </span>
                        ) : !isPast ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-brand-500/15 text-brand-400 whitespace-nowrap">
                            Ver evento →
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => navigate('/eventos')} className="mt-3 text-xs text-brand-400 hover:text-brand-300 transition-colors">
                  Ver todos los eventos →
                </button>
              </>
            )}
          </div>
        </div>

        {/* Pagos pendientes */}
        <div>
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4 flex items-center gap-2">
              <CreditCard size={15} className="text-brand-400" /> Mis pagos
            </h2>
            {pendingPayments.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle size={28} className="mx-auto text-green-400 mb-2" />
                <p className="text-sm text-gray-400">¡Estás al corriente!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingPayments.map((p: Payment) => {
                  const estado = p.estado as 'pagado' | 'pendiente' | 'vencido';
                  const Icon = estadoIcon[estado] ?? Clock;
                  const color = estadoColor[estado] ?? 'text-gray-400';
                  return (
                    <div key={p.id} className="p-3 bg-dark-700 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-white capitalize">{p.concepto.replace('_', ' ')}</p>
                        <Icon size={14} className={color} />
                      </div>
                      <p className="text-lg font-bold text-white">${p.monto.toLocaleString('es-MX')} <span className="text-xs text-gray-500">{p.moneda}</span></p>
                      {p.fechaVencimiento && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Vence: {format(new Date(p.fechaVencimiento), "d MMM yyyy", { locale: es })}
                        </p>
                      )}
                      {estado !== 'pagado' && (
                        <button
                          onClick={() => checkoutMutation.mutate(p.id)}
                          disabled={checkoutMutation.isPending}
                          className="mt-2 w-full py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                        >
                          {checkoutMutation.isPending ? 'Redirigiendo...' : 'Pagar con tarjeta'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Historial */}
            {me?.payments?.filter((p: Payment) => p.estado === 'pagado').length > 0 && (
              <div className="mt-4 pt-4 border-t border-dark-700">
                <p className="text-xs text-gray-500 mb-2">Historial de pagos</p>
                {me.payments.filter((p: Payment) => p.estado === 'pagado').slice(0, 3).map((p: Payment) => (
                  <div key={p.id} className="flex items-center justify-between py-1">
                    <span className="text-xs text-gray-400 capitalize">{p.concepto.replace('_', ' ')}</span>
                    <span className="text-xs text-green-400">${p.monto.toLocaleString('es-MX')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
