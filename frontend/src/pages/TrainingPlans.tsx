import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Target, Clock, Users, X, Zap, ChevronRight, Trash2, BookmarkPlus, BookmarkCheck } from 'lucide-react';
import { plansApi, runnersApi } from '../services/api';
import { TrainingPlan, Runner } from '../types';
import { useAuth } from '../context/AuthContext';

const nivelColors: Record<string, string> = {
  principiante: 'bg-green-500/15 text-green-400',
  intermedio:   'bg-blue-500/15 text-blue-400',
  avanzado:     'bg-purple-500/15 text-purple-400',
  elite:        'bg-brand-500/15 text-brand-400',
};

export default function TrainingPlans() {
  const { isCoach } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [assignPlan, setAssignPlan] = useState<TrainingPlan | null>(null);
  const [assignForm, setAssignForm] = useState({ runnerId: '', fechaInicio: '' });

  const { data: plansData } = useQuery({ queryKey: ['plans'], queryFn: () => plansApi.list() });
  const { data: runnersData } = useQuery({ queryKey: ['runners'], queryFn: () => runnersApi.list(), enabled: isCoach });

  const plans: TrainingPlan[] = plansData?.data ?? [];
  const runners: Runner[] = runnersData?.data ?? [];

  const assignMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => plansApi.assign(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plans'] }); setAssignPlan(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => plansApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  });

  const templateMutation = useMutation({
    mutationFn: (id: number) => plansApi.toggleTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Planes de entrenamiento</h1>
          <p className="text-gray-400 text-sm mt-0.5">{plans.length} planes disponibles</p>
        </div>
        {isCoach && (
          <button
            onClick={() => navigate('/planes/nuevo')}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            <Zap size={16} /> Crear plan con IA
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            onClick={() => navigate(`/planes/${plan.id}`)}
            className="bg-dark-800 border border-dark-700 rounded-xl p-5 flex flex-col cursor-pointer hover:border-brand-500/40 hover:bg-dark-700 transition-all group"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 bg-dark-700 rounded-lg group-hover:bg-dark-600 transition-colors">
                <ClipboardList size={18} className="text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white leading-snug">{plan.nombre}</h3>
                <span className={`text-xs px-2 py-0.5 rounded mt-0.5 inline-block ${nivelColors[plan.nivel] ?? nivelColors.intermedio}`}>
                  {plan.nivel}
                </span>
              </div>
              <ChevronRight size={16} className="text-gray-600 group-hover:text-brand-400 transition-colors flex-shrink-0 mt-1" />
            </div>

            {plan.descripcion && (
              <p className="text-xs text-gray-400 mb-3 line-clamp-2">{plan.descripcion}</p>
            )}

            <div className="flex gap-4 mb-4">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Clock size={12} /> {plan.duracionSemanas} semanas
              </div>
              {plan.objetivo && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Target size={12} /> {plan.objetivo}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Users size={12} /> {plan._count?.asignaciones ?? 0} asignados
              </div>
            </div>

            {isCoach && (
              <div className="mt-auto space-y-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setAssignPlan(plan); }}
                  className="w-full py-2 rounded-lg border border-brand-500/30 text-brand-400 text-sm hover:bg-brand-500/10 transition-colors"
                >
                  Asignar a corredor
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); templateMutation.mutate(plan.id); }}
                    title={(plan as any).isTemplate ? 'Quitar de plantillas' : 'Guardar como plantilla'}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      (plan as any).isTemplate
                        ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                        : 'bg-surface-600 border-white/[0.06] text-gray-500 hover:text-yellow-400 hover:border-yellow-500/30'
                    }`}
                  >
                    {(plan as any).isTemplate ? <BookmarkCheck size={13} /> : <BookmarkPlus size={13} />}
                    {(plan as any).isTemplate ? 'Plantilla' : 'Guardar plantilla'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(`¿Eliminar "${plan.nombre}"?`)) deleteMutation.mutate(plan.id); }}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 border border-white/[0.04] transition-all"
                    title="Eliminar plan"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {plans.length === 0 && (
          <div className="col-span-full text-center py-16 text-gray-500">
            <ClipboardList size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-4">No hay planes creados todavía</p>
            {isCoach && (
              <button
                onClick={() => navigate('/planes/nuevo')}
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                <Zap size={15} /> Crear primer plan con IA
              </button>
            )}
          </div>
        )}
      </div>

      {/* Assign modal */}
      {assignPlan && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Asignar plan</h2>
              <button onClick={() => setAssignPlan(null)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Plan: <span className="text-white font-medium">{assignPlan.nombre}</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">Corredor</label>
                <select
                  value={assignForm.runnerId}
                  onChange={(e) => setAssignForm({ ...assignForm, runnerId: e.target.value })}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                >
                  <option value="">Seleccionar corredor...</option>
                  {runners.filter(r => r.activo).map((r) => (
                    <option key={r.id} value={r.id}>{r.nombre} {r.apellido}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">Fecha de inicio</label>
                <input
                  type="date"
                  value={assignForm.fechaInicio}
                  onChange={(e) => setAssignForm({ ...assignForm, fechaInicio: e.target.value })}
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setAssignPlan(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-dark-500 text-sm text-gray-300 hover:text-white hover:border-dark-400 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => assignMutation.mutate({
                  id: assignPlan.id,
                  data: { runnerId: Number(assignForm.runnerId), fechaInicio: assignForm.fechaInicio },
                })}
                disabled={assignMutation.isPending || !assignForm.runnerId || !assignForm.fechaInicio}
                className="flex-1 px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assignMutation.isPending ? 'Asignando...' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
