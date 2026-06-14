import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runnersApi } from '../services/api';
import { CommunicationLog, Payment, EventRegistration } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, Phone, MapPin, Mail, Calendar, CreditCard,
  MessageSquare, Clock, AlertTriangle,
  Dumbbell, Send, Trash2, X, Edit2, EyeOff, Activity,
  Flame, Timer, TrendingUp, Heart,
} from 'lucide-react';
import { format, isAfter, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const nivelConfig: Record<string, { badge: string; gradient: string }> = {
  principiante: { badge: 'bg-green-500/15 text-green-400 border-green-500/20',   gradient: 'from-green-500 to-emerald-600' },
  intermedio:   { badge: 'bg-blue-500/15 text-blue-400 border-blue-500/20',     gradient: 'from-blue-500 to-indigo-600' },
  avanzado:     { badge: 'bg-purple-500/15 text-purple-400 border-purple-500/20', gradient: 'from-purple-500 to-violet-600' },
  elite:        { badge: 'bg-brand-500/15 text-brand-400 border-brand-500/20',   gradient: 'from-brand-500 to-orange-600' },
};

const logTipoConfig: Record<string, { icon: string; label: string; color: string }> = {
  whatsapp:   { icon: '💬', label: 'WhatsApp', color: 'text-green-400' },
  email:      { icon: '📧', label: 'Email',    color: 'text-blue-400' },
  llamada:    { icon: '📞', label: 'Llamada',  color: 'text-yellow-400' },
  presencial: { icon: '🤝', label: 'Presencial', color: 'text-purple-400' },
};

const tabs = ['Resumen', 'Actividades', 'Plan', 'Eventos', 'Pagos', 'Mensajes'] as const;
type Tab = typeof tabs[number];

export default function RunnerProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isCoach } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('Resumen');
  const [logForm, setLogForm] = useState({ tipo: 'whatsapp', direccion: 'entrante', mensaje: '' });
  const [showLogForm, setShowLogForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ nombre: '', apellido: '', telefono: '', pais: '', estado: '', ciudad: '', nivel: 'principiante', genero: '', tallaCamiseta: '', notas: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['runner', id],
    queryFn: () => runnersApi.get(Number(id)),
  });

  const addLogMutation = useMutation({
    mutationFn: (d: object) => runnersApi.addLog(Number(id), d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['runner', id] }); setLogForm({ tipo: 'whatsapp', direccion: 'entrante', mensaje: '' }); setShowLogForm(false); },
  });

  const deleteLogMutation = useMutation({
    mutationFn: (logId: number) => runnersApi.deleteLog(Number(id), logId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runner', id] }),
  });

  const updateMutation = useMutation({
    mutationFn: (d: object) => runnersApi.update(Number(id), d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['runner', id] }); qc.invalidateQueries({ queryKey: ['runners'] }); setShowEditModal(false); },
  });

  const openEdit = () => {
    if (!runner) return;
    setEditForm({ nombre: runner.nombre, apellido: runner.apellido, telefono: runner.telefono ?? '', pais: (runner as any).pais ?? '', estado: runner.estado ?? '', ciudad: runner.ciudad, nivel: runner.nivel, genero: (runner as any).genero ?? '', tallaCamiseta: (runner as any).tallaCamiseta ?? '', notas: runner.notas ?? '' });
    setShowEditModal(true);
  };

  const handleDisable = async () => {
    if (!window.confirm(`¿Deshabilitar a ${runner?.nombre} ${runner?.apellido}? No aparecerá en la lista pero sus datos se conservan.`)) return;
    await runnersApi.deactivate(Number(id));
    qc.invalidateQueries({ queryKey: ['runners'] });
    navigate('/corredores');
  };

  const handleDelete = async () => {
    if (!window.confirm(`¿Eliminar permanentemente a ${runner?.nombre} ${runner?.apellido}? Esta acción no se puede deshacer.`)) return;
    await runnersApi.permanentDelete(Number(id));
    qc.invalidateQueries({ queryKey: ['runners'] });
    navigate('/corredores');
  };

  if (isLoading) return (
    <div className="p-4 lg:p-8 flex items-center gap-3 text-gray-500">
      <Clock size={16} className="animate-spin" /> Cargando perfil...
    </div>
  );

  const runner = data?.data;
  if (!runner) return <div className="p-4 lg:p-8 text-gray-500">Corredor no encontrado</div>;

  const nivel = runner.nivel ?? 'principiante';
  const cfg = nivelConfig[nivel] ?? nivelConfig.principiante;
  const initials = `${runner.nombre?.[0] ?? ''}${runner.apellido?.[0] ?? ''}`.toUpperCase();

  const activePlan = runner.trainingPlans?.[0];
  const pendingPayments: Payment[] = (runner.payments ?? []).filter((p: Payment) => p.estado !== 'pagado');
  const nextPayment = pendingPayments.sort((a, b) =>
    new Date(a.fechaVencimiento ?? '9999').getTime() - new Date(b.fechaVencimiento ?? '9999').getTime()
  )[0];
  const upcomingEvents: EventRegistration[] = (runner.eventRegistrations ?? []).filter(
    (r: EventRegistration) => isAfter(new Date(r.event.fecha), new Date())
  );
  const logs: CommunicationLog[] = runner.communicationLogs ?? [];

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      {/* Back */}
      <button onClick={() => navigate('/corredores')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white mb-5 transition-colors">
        <ArrowLeft size={16} /> Corredores
      </button>

      {/* Hero header */}
      <div className="card p-4 lg:p-6 mb-5">
        {/* Name row */}
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-14 h-14 lg:w-16 lg:h-16 rounded-2xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white font-black text-lg lg:text-xl flex-shrink-0 shadow-glow`}>
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl lg:text-2xl font-black text-white leading-tight">{runner.nombre} {runner.apellido}</h1>
            <span className={`badge border ${cfg.badge} capitalize mt-1 inline-block`}>{nivel}</span>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex gap-3 mb-4">
          {[
            { label: 'Pagos pend.', value: pendingPayments.length, color: pendingPayments.length > 0 ? 'text-yellow-400' : 'text-green-400' },
            { label: 'Actividades', value: (runner.activityLogs ?? []).length, color: 'text-brand-400' },
            { label: 'Eventos', value: upcomingEvents.length, color: 'text-blue-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex-1 bg-surface-600 rounded-xl px-3 py-2 text-center">
              <p className={`text-lg font-black ${color}`}>{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Contact info */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
          {runner.user?.email && (
            <a href={`mailto:${runner.user.email}`} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
              <Mail size={12} /> {runner.user.email}
            </a>
          )}
          {runner.telefono && (
            <a href={`tel:${runner.telefono}`} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
              <Phone size={12} /> {runner.telefono}
            </a>
          )}
          {runner.ciudad && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <MapPin size={12} /> {runner.ciudad}
            </span>
          )}
        </div>

        {/* Coach actions */}
        {isCoach && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={openEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-gray-300 hover:text-white hover:bg-surface-600 border border-white/[0.08] transition-all">
              <Edit2 size={13} /> Editar
            </button>
            {runner.activo ? (
              <button onClick={handleDisable}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 border border-yellow-500/20 transition-all">
                <EyeOff size={13} /> Deshabilitar
              </button>
            ) : (
              <button onClick={async () => { await runnersApi.reactivate(Number(id)); qc.invalidateQueries({ queryKey: ['runner', id] }); qc.invalidateQueries({ queryKey: ['runners'] }); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-green-400 hover:text-green-300 hover:bg-green-500/10 border border-green-500/20 transition-all">
                <EyeOff size={13} /> Reactivar
              </button>
            )}
            <button onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all">
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        )}

        {/* Next payment alert */}
        {nextPayment && (
          <div className="mt-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle size={15} className="text-yellow-400 flex-shrink-0" />
              <span className="text-xs text-yellow-300 truncate">
                Próximo pago: <strong>{nextPayment.concepto.replace('_', ' ')}</strong>
                {nextPayment.fechaVencimiento && ` · ${format(new Date(nextPayment.fechaVencimiento), "d MMM yyyy", { locale: es })}`}
              </span>
            </div>
            <span className="text-sm font-black text-yellow-400 flex-shrink-0">${nextPayment.monto.toLocaleString('es-MX')}</span>
          </div>
        )}
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="overflow-x-auto mb-5 -mx-4 px-4 lg:mx-0 lg:px-0">
        <div className="flex gap-1 p-1 bg-surface-800 border border-white/[0.06] rounded-xl w-max min-w-full lg:w-fit">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 lg:px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === tab ? 'bg-brand-500 text-white shadow-glow-sm' : 'text-gray-400 hover:text-white'
              }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Resumen */}
      {activeTab === 'Resumen' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-slide-up">
          <div className="card p-5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Información</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Nivel</span><span className="text-white capitalize">{nivel}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Ciudad</span><span className="text-white">{runner.ciudad || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Miembro desde</span><span className="text-white">{format(new Date(runner.createdAt), "MMMM yyyy", { locale: es })}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Estado</span>
                <span className={`font-medium ${runner.activo ? 'text-green-400' : 'text-red-400'}`}>
                  {runner.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          </div>
          <div className="card p-5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Plan activo</h3>
            {activePlan ? (
              <div>
                <p className="font-bold text-white">{activePlan.plan.nombre}</p>
                <p className="text-xs text-gray-400 mt-1">{activePlan.plan.objetivo} · {activePlan.plan.duracionSemanas} semanas</p>
                <p className="text-xs text-gray-500 mt-2">Inició {format(new Date(activePlan.fechaInicio), "d MMM yyyy", { locale: es })}</p>
              </div>
            ) : <p className="text-sm text-gray-500">Sin plan asignado</p>}
          </div>
          {runner.notas && (
            <div className="card p-5 sm:col-span-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Notas del coach</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{runner.notas}</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Actividades */}
      {activeTab === 'Actividades' && (
        <div className="space-y-3 animate-slide-up">
          {(runner.activityLogs ?? []).length === 0 ? (
            <div className="card p-12 text-center">
              <Activity size={36} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-500">Sin actividades registradas</p>
            </div>
          ) : (runner.activityLogs ?? []).map((act: any) => (
            <div key={act.id} className="card p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-white capitalize">{act.nombre || act.tipo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {format(new Date(act.fecha), "d MMM yyyy · HH:mm", { locale: es })}
                  </p>
                </div>
                <span className="badge bg-brand-500/15 text-brand-400 capitalize flex-shrink-0">{act.tipo}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {act.distanciaKm != null && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <TrendingUp size={13} className="text-brand-400" />
                    <span className="text-white font-semibold">{Number(act.distanciaKm).toFixed(2)} km</span>
                  </div>
                )}
                {act.duracionMin != null && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <Timer size={13} className="text-blue-400" />
                    <span className="text-white font-semibold">{act.duracionMin} min</span>
                  </div>
                )}
                {act.fcPromedio != null && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <Heart size={13} className="text-red-400" />
                    <span className="text-white font-semibold">{act.fcPromedio} bpm</span>
                  </div>
                )}
                {act.caloriasKcal != null && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <Flame size={13} className="text-orange-400" />
                    <span className="text-white font-semibold">{act.caloriasKcal} kcal</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Plan */}
      {activeTab === 'Plan' && (
        <div className="animate-slide-up">
          {activePlan ? (
            <div className="card p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-black text-white">{activePlan.plan.nombre}</h2>
                  <p className="text-sm text-gray-400 mt-0.5">{activePlan.plan.descripcion}</p>
                </div>
                <span className="badge bg-brand-500/15 text-brand-400">{activePlan.plan.objetivo}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-5 text-center">
                <div className="bg-surface-600 rounded-xl p-3">
                  <p className="text-lg font-black text-white">{activePlan.plan.duracionSemanas}</p>
                  <p className="text-xs text-gray-500">semanas</p>
                </div>
                <div className="bg-surface-600 rounded-xl p-3">
                  <p className="text-sm font-bold text-white capitalize">{activePlan.plan.nivel}</p>
                  <p className="text-xs text-gray-500">nivel</p>
                </div>
                <div className="bg-surface-600 rounded-xl p-3">
                  <p className="text-sm font-bold text-white">{format(new Date(activePlan.fechaInicio), "d MMM", { locale: es })}</p>
                  <p className="text-xs text-gray-500">inicio</p>
                </div>
              </div>
              {activePlan.plan.semanas?.map((semana: { id: number; numeroSemana: number; descripcion?: string; dias: { id: number; diaSemana: string; tipo: string; distanciaKm?: number; duracionMin?: number; descripcion?: string }[] }) => (
                <div key={semana.id} className="mb-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Semana {semana.numeroSemana}</h4>
                  <div className="space-y-1.5">
                    {semana.dias.map((dia) => (
                      <div key={dia.id} className="flex items-center gap-3 p-2.5 bg-surface-600 rounded-lg text-sm">
                        <span className="text-gray-400 capitalize w-20 flex-shrink-0">{dia.diaSemana}</span>
                        <span className={`badge ${dia.tipo === 'descanso' ? 'bg-gray-500/10 text-gray-500' : 'bg-brand-500/10 text-brand-400'}`}>{dia.tipo}</span>
                        {dia.distanciaKm && <span className="text-gray-300">{dia.distanciaKm}km</span>}
                        {dia.descripcion && <span className="text-gray-400 truncate">{dia.descripcion}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-12 text-center">
              <Dumbbell size={36} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-500">Sin plan asignado</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Eventos */}
      {activeTab === 'Eventos' && (
        <div className="space-y-3 animate-slide-up">
          {(runner.eventRegistrations ?? []).length === 0 && (
            <div className="card p-12 text-center">
              <Calendar size={36} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-500">Sin inscripciones a eventos</p>
            </div>
          )}
          {(runner.eventRegistrations ?? []).map((reg: EventRegistration) => {
            const isPast = !isAfter(new Date(reg.event.fecha), new Date());
            return (
              <div key={reg.id} className={`card p-4 flex items-center gap-4 ${isPast ? 'opacity-60' : ''}`}>
                <div className="text-center min-w-[3rem]">
                  <p className="text-xs text-gray-400">{format(new Date(reg.event.fecha), 'MMM', { locale: es }).toUpperCase()}</p>
                  <p className="text-xl font-black text-brand-400">{format(new Date(reg.event.fecha), 'd')}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white">{reg.event.nombre}</p>
                  <p className="text-xs text-gray-400">{reg.event.lugar} · {reg.event.ciudad}</p>
                </div>
                <div className="text-right">
                  <span className={`badge ${reg.estado === 'inscrito' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'}`}>
                    {reg.estado}
                  </span>
                  {isPast && <p className="text-xs text-gray-500 mt-1">Completado</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Pagos */}
      {activeTab === 'Pagos' && (
        <div className="space-y-3 animate-slide-up">
          {(runner.payments ?? []).length === 0 && (
            <div className="card p-12 text-center">
              <CreditCard size={36} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-500">Sin pagos registrados</p>
            </div>
          )}
          {(runner.payments ?? []).map((p: Payment) => (
            <div key={p.id} className="card p-4 flex items-center gap-4">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                p.estado === 'pagado' ? 'bg-green-400' : p.estado === 'vencido' ? 'bg-red-400' : 'bg-yellow-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white capitalize">{p.concepto.replace('_', ' ')}</p>
                {p.fechaVencimiento && (
                  <p className="text-xs text-gray-400">
                    Vence: {format(new Date(p.fechaVencimiento), "d MMM yyyy", { locale: es })}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-black text-white">${p.monto.toLocaleString('es-MX')}</p>
                <span className={`badge text-xs ${
                  p.estado === 'pagado' ? 'bg-green-500/15 text-green-400' :
                  p.estado === 'vencido' ? 'bg-red-500/15 text-red-400' :
                  'bg-yellow-500/15 text-yellow-400'
                }`}>{p.estado}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Mensajes */}
      {activeTab === 'Mensajes' && (
        <div className="animate-slide-up">
          {isCoach && (
            <div className="mb-4">
              {!showLogForm ? (
                <button onClick={() => setShowLogForm(true)}
                  className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
                  <MessageSquare size={15} /> Registrar comunicación
                </button>
              ) : (
                <div className="card p-5 mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-white">Nueva entrada</h3>
                    <button onClick={() => setShowLogForm(false)} className="btn-ghost p-1.5"><X size={16} /></button>
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Canal</label>
                        <select value={logForm.tipo} onChange={(e) => setLogForm({ ...logForm, tipo: e.target.value })} className="input w-full text-sm">
                          {Object.entries(logTipoConfig).map(([key, cfg]) => (
                            <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Dirección</label>
                        <select value={logForm.direccion} onChange={(e) => setLogForm({ ...logForm, direccion: e.target.value })} className="input w-full text-sm">
                          <option value="entrante">📥 Entrante (el corredor escribió)</option>
                          <option value="saliente">📤 Saliente (yo escribí)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1.5">Resumen del mensaje</label>
                      <textarea value={logForm.mensaje} onChange={(e) => setLogForm({ ...logForm, mensaje: e.target.value })}
                        rows={3} placeholder="¿De qué trató la conversación?" className="input w-full text-sm resize-none" />
                    </div>
                    <button onClick={() => addLogMutation.mutate(logForm)} disabled={addLogMutation.isPending}
                      className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
                      <Send size={14} /> {addLogMutation.isPending ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {logs.length === 0 ? (
            <div className="card p-12 text-center">
              <MessageSquare size={36} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-500">Sin comunicaciones registradas</p>
              {isCoach && <p className="text-xs text-gray-600 mt-1">Registra mensajes de WhatsApp, email o llamadas</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const tipoCfg = logTipoConfig[log.tipo] ?? logTipoConfig.whatsapp;
                return (
                  <div key={log.id} className={`card p-4 border-l-2 ${log.direccion === 'entrante' ? 'border-l-blue-500' : 'border-l-brand-500'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{tipoCfg.icon}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${tipoCfg.color}`}>{tipoCfg.label}</span>
                            <span className="text-xs text-gray-500">·</span>
                            <span className="text-xs text-gray-500">
                              {log.direccion === 'entrante' ? '📥 Recibido' : '📤 Enviado'}
                            </span>
                            <span className="text-xs text-gray-500">·</span>
                            <span className="text-xs text-gray-500">
                              {formatDistanceToNow(new Date(log.createdAt), { locale: es, addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-300 mt-1">{log.mensaje}</p>
                        </div>
                      </div>
                      {isCoach && (
                        <button onClick={() => deleteLogMutation.mutate(log.id)}
                          className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all flex-shrink-0">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">Editar corredor</h2>
              <button onClick={() => setShowEditModal(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {(['nombre', 'apellido'] as const).map((f) => (
                  <div key={f}>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5 capitalize">{f}</label>
                    <input value={editForm[f]} onChange={e => setEditForm({ ...editForm, [f]: e.target.value })} className="input w-full text-sm" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Teléfono</label>
                  <input value={editForm.telefono} onChange={e => setEditForm({ ...editForm, telefono: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nivel</label>
                  <select value={editForm.nivel} onChange={e => setEditForm({ ...editForm, nivel: e.target.value })} className="input w-full text-sm">
                    {['principiante', 'intermedio', 'avanzado', 'elite'].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Género</label>
                  <select value={editForm.genero} onChange={e => setEditForm({ ...editForm, genero: e.target.value })} className="input w-full text-sm">
                    <option value="">—</option>
                    <option value="femenino">Femenino</option>
                    <option value="masculino">Masculino</option>
                    <option value="no_binario">No binario</option>
                    <option value="prefiero_no_responder">Prefiero no responder</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Talla camiseta</label>
                  <select value={editForm.tallaCamiseta} onChange={e => setEditForm({ ...editForm, tallaCamiseta: e.target.value })} className="input w-full text-sm">
                    <option value="">—</option>
                    {['XS','S','M','L','XL','XXL'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">País</label>
                <input value={editForm.pais} onChange={e => setEditForm({ ...editForm, pais: e.target.value })} className="input w-full text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Estado</label>
                  <input value={editForm.estado} onChange={e => setEditForm({ ...editForm, estado: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Ciudad</label>
                  <input value={editForm.ciudad} onChange={e => setEditForm({ ...editForm, ciudad: e.target.value })} className="input w-full text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Notas</label>
                <textarea value={editForm.notas} onChange={e => setEditForm({ ...editForm, notas: e.target.value })} rows={2} className="input w-full text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowEditModal(false)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => updateMutation.mutate({ nombre: editForm.nombre, apellido: editForm.apellido, telefono: editForm.telefono || undefined, pais: editForm.pais || undefined, estado: editForm.estado || undefined, ciudad: editForm.ciudad, nivel: editForm.nivel, genero: editForm.genero || undefined, tallaCamiseta: editForm.tallaCamiseta || undefined, notas: editForm.notas || undefined })}
                disabled={updateMutation.isPending || !editForm.nombre || !editForm.apellido}
                className="flex-1 btn-primary py-2.5 text-sm"
              >
                {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
