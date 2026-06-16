import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Users, Trash2, Pencil, Check, CalendarDays, Loader2 } from 'lucide-react';
import { groupsApi, plansApi } from '../services/api';
import type { Runner } from '../types';

export interface RunnerGroup {
  id: number;
  nombre: string;
  descripcion?: string | null;
  color: string;
  members: { runner: { id: number; nombre: string; apellido: string } }[];
  _count?: { members: number };
}

const COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#f97316', '#ef4444', '#06b6d4', '#eab308', '#ec4899'];

export default function GroupsManager({
  runners, onClose,
}: {
  runners: Runner[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RunnerGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [assigningTo, setAssigningTo] = useState<RunnerGroup | null>(null);

  const { data: groupsData, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
  });
  const groups: RunnerGroup[] = groupsData?.data ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: number) => groupsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06] sticky top-0 bg-surface-800 z-10">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-brand-400" />
            <h2 className="font-black text-white">Grupos de corredores</h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          <button
            onClick={() => { setCreating(true); setEditing(null); }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-white/[0.12] text-gray-400 hover:text-white hover:border-brand-500/40 transition-all text-sm font-medium"
          >
            <Plus size={16} /> Nuevo grupo
          </button>

          {isLoading ? (
            <div className="text-center py-8 text-gray-500 text-sm">Cargando grupos…</div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8">
              <Users size={36} className="mx-auto text-gray-600 mb-2" />
              <p className="text-gray-500 text-sm">Aún no hay grupos. Crea uno para clasificar a tus corredores por equipo, ciudad o nivel.</p>
            </div>
          ) : (
            groups.map(g => (
              <div key={g.id} className="rounded-xl border border-white/[0.06] bg-surface-700 p-4">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: g.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm truncate">{g.nombre}</p>
                    <p className="text-xs text-gray-500">
                      {(g._count?.members ?? g.members.length)} corredor{(g._count?.members ?? g.members.length) !== 1 ? 'es' : ''}
                      {g.descripcion ? ` · ${g.descripcion}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setAssigningTo(g)} title="Asignar plan al grupo"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-all">
                      <CalendarDays size={15} />
                    </button>
                    <button onClick={() => { setEditing(g); setCreating(false); }} title="Editar"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => { if (confirm(`¿Eliminar el grupo "${g.nombre}"? Los corredores no se borran.`)) deleteMut.mutate(g.id); }}
                      title="Eliminar"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {g.members.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {g.members.slice(0, 8).map(m => (
                      <span key={m.runner.id} className="text-[11px] px-2 py-0.5 rounded-full bg-surface-600 text-gray-300">
                        {m.runner.nombre} {m.runner.apellido?.[0] ?? ''}.
                      </span>
                    ))}
                    {g.members.length > 8 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-600 text-gray-500">
                        +{g.members.length - 8}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {(creating || editing) && (
        <GroupEditor
          group={editing}
          runners={runners.filter(r => r.activo)}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {assigningTo && (
        <AssignPlanToGroup group={assigningTo} onClose={() => setAssigningTo(null)} />
      )}
    </div>
  );
}

// ── Create / edit a group ─────────────────────────────────────────────────────
function GroupEditor({
  group, runners, onClose,
}: {
  group: RunnerGroup | null;
  runners: Runner[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(group?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(group?.descripcion ?? '');
  const [color, setColor] = useState(group?.color ?? COLORS[0]);
  const [selected, setSelected] = useState<Set<number>>(
    new Set(group?.members.map(m => m.runner.id) ?? []),
  );
  const [search, setSearch] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (group) {
        await groupsApi.update(group.id, { nombre, descripcion: descripcion || null, color });
        await groupsApi.setMembers(group.id, Array.from(selected));
      } else {
        await groupsApi.create({ nombre, descripcion: descripcion || undefined, color, runnerIds: Array.from(selected) });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); onClose(); },
  });

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const filtered = runners.filter(r =>
    `${r.nombre} ${r.apellido} ${r.ciudad}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] px-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06] sticky top-0 bg-surface-800 z-10">
          <h2 className="font-black text-white">{group ? 'Editar grupo' : 'Nuevo grupo'}</h2>
          <button onClick={onClose} className="btn-ghost p-2"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nombre del grupo</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Equipo Tijuana, Maratonistas, Principiantes martes…"
              className="input w-full text-sm" autoFocus />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Descripción (opcional)</label>
            <input value={descripcion ?? ''} onChange={e => setDescripcion(e.target.value)}
              placeholder="¿Para qué es este grupo?" className="input w-full text-sm" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-800' : ''}`}
                  style={{ background: c }}>
                  {color === c && <Check size={14} className="text-white mx-auto" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-400">Corredores en el grupo</label>
              <span className="text-xs text-brand-400 font-semibold">{selected.size} seleccionados</span>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar corredor…" className="input w-full text-sm mb-2" />
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
              {filtered.map(r => {
                const on = selected.has(r.id);
                return (
                  <button key={r.id} onClick={() => toggle(r.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${on ? 'bg-brand-500/15 border border-brand-500/30' : 'bg-surface-700 border border-transparent hover:bg-surface-600'}`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-brand-500 border-brand-500' : 'border-gray-500'}`}>
                      {on && <Check size={12} className="text-white" />}
                    </div>
                    <span className="text-sm text-white">{r.nombre} {r.apellido}</span>
                    <span className="text-xs text-gray-500 ml-auto capitalize">{r.nivel}</span>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="text-xs text-gray-500 text-center py-3">Sin resultados</p>}
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-white/[0.06] sticky bottom-0 bg-surface-800">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={!nombre.trim() || save.isPending}
            className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
            {save.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
            {group ? 'Guardar cambios' : 'Crear grupo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign a plan to all members of a group ───────────────────────────────────
function AssignPlanToGroup({ group, onClose }: { group: RunnerGroup; onClose: () => void }) {
  const [planId, setPlanId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState('');

  const { data: plansData } = useQuery({ queryKey: ['plans'], queryFn: () => plansApi.list() });
  const plans: { id: number; nombre: string; duracionSemanas: number }[] = plansData?.data ?? [];

  const assign = useMutation({
    mutationFn: () => groupsApi.assignPlan(group.id, planId!, fecha),
    onSuccess: (res: { data: { assigned: number } }) => {
      setMsg(`✓ Plan asignado a ${res.data.assigned} corredor(es) del grupo`);
      setTimeout(onClose, 1600);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setMsg(`⚠ ${err?.response?.data?.error ?? 'Error al asignar'}`),
  });

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] px-4">
      <div className="card w-full max-w-md p-5 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-white">Asignar plan a "{group.nombre}"</h2>
          <button onClick={onClose} className="btn-ghost p-2"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          El plan se asignará a los {group._count?.members ?? group.members.length} corredores actuales del grupo. Reemplaza su plan activo.
        </p>

        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Plan</label>
        <select value={planId ?? ''} onChange={e => setPlanId(Number(e.target.value))} className="input w-full text-sm mb-4">
          <option value="" disabled>Selecciona un plan…</option>
          {plans.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.duracionSemanas} sem)</option>)}
        </select>

        <label className="block text-xs font-semibold text-gray-400 mb-1.5">Fecha de inicio</label>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input w-full text-sm mb-4" />

        {msg && <p className={`text-xs mb-3 ${msg.startsWith('✓') ? 'text-green-400' : 'text-yellow-400'}`}>{msg}</p>}

        <button onClick={() => assign.mutate()} disabled={!planId || assign.isPending}
          className="w-full btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
          {assign.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
          Asignar a todo el grupo
        </button>
      </div>
    </div>
  );
}
