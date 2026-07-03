import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy, Medal, Plus, Trash2, X, Target, Calendar } from 'lucide-react';
import { gamificationApi, groupsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

type Metric = 'km' | 'elevacion' | 'actividades';
const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: 'km',          label: 'Distancia',   unit: 'km' },
  { id: 'elevacion',   label: 'Desnivel',    unit: 'm' },
  { id: 'actividades', label: 'Actividades', unit: '' },
];

interface Leader { runnerId: number; nombre: string; value: number }
interface Challenge {
  id: number; nombre: string; descripcion: string | null;
  metrica: Metric; meta: number | null; fechaInicio: string; fechaFin: string;
  scope: string; group: { nombre: string; color: string } | null;
  metricInfo: { label: string; unit: string };
  status: 'upcoming' | 'active' | 'ended';
  participants: number; leaderboard: Leader[]; myValue: number | null;
}

const medalColor = (i: number) => i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-600';
const fmtDate = (s: string) => new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

function Leaderboard({ rows, unit, myId }: { rows: Leader[]; unit: string; myId: number | null }) {
  if (rows.length === 0) return <p className="text-xs text-gray-500 py-2">Aún no hay datos.</p>;
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={r.runnerId}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg ${r.runnerId === myId ? 'bg-brand-500/10 border border-brand-500/30' : 'bg-dark-800'}`}>
          <span className={`w-6 text-center font-bold ${medalColor(i)}`}>
            {i < 3 ? <Medal size={16} className="inline" /> : i + 1}
          </span>
          <span className="flex-1 text-sm text-white truncate">{r.nombre}</span>
          <span className="text-sm font-bold text-white">{r.value}{unit ? ` ${unit}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

export default function Competitions() {
  const { isCoach } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'ranking' | 'retos'>('ranking');
  const [metric, setMetric] = useState<Metric>('km');
  const [scope, setScope] = useState<'club' | 'group'>('club');
  const [groupId, setGroupId] = useState<number | undefined>();
  const [showForm, setShowForm] = useState(false);

  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => (await groupsApi.list()).data as { id: number; nombre: string }[],
    enabled: isCoach,
  });

  const { data: ranking } = useQuery({
    queryKey: ['ranking', scope, groupId, metric],
    queryFn: async () => (await gamificationApi.ranking({ scope, groupId, metric })).data as
      { metricInfo: { unit: string }; myRunnerId: number | null; leaderboard: Leader[] },
    enabled: tab === 'ranking' && (scope === 'club' || !!groupId),
  });

  const { data: challenges } = useQuery({
    queryKey: ['challenges'],
    queryFn: async () => (await gamificationApi.challenges()).data as Challenge[],
    enabled: tab === 'retos',
  });

  const del = useMutation({
    mutationFn: (id: number) => gamificationApi.deleteChallenge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges'] }),
  });

  return (
    <div className="p-4 lg:p-8 max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-brand-500/15 flex items-center justify-center">
          <Trophy size={24} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Competencias</h1>
          <p className="text-gray-400 text-sm">Rankings y retos del club</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['ranking', 'retos'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === t ? 'bg-brand-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'}`}>
            {t === 'ranking' ? 'Ranking mensual' : 'Retos'}
          </button>
        ))}
      </div>

      {tab === 'ranking' && (
        <div>
          {/* Metric selector */}
          <div className="flex flex-wrap gap-2 mb-3">
            {METRICS.map(m => (
              <button key={m.id} onClick={() => setMetric(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${metric === m.id ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40' : 'bg-dark-800 text-gray-400'}`}>
                {m.label}
              </button>
            ))}
          </div>
          {/* Scope selector (coach can pick groups) */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => { setScope('club'); setGroupId(undefined); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${scope === 'club' ? 'bg-dark-700 text-white border border-white/10' : 'bg-dark-800 text-gray-400'}`}>
              Todo el club
            </button>
            {isCoach && groups?.map(g => (
              <button key={g.id} onClick={() => { setScope('group'); setGroupId(g.id); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${groupId === g.id ? 'bg-dark-700 text-white border border-white/10' : 'bg-dark-800 text-gray-400'}`}>
                {g.nombre}
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
            Ranking de {new Date().toLocaleDateString('es-MX', { month: 'long' })}
          </p>
          <Leaderboard rows={ranking?.leaderboard ?? []} unit={ranking?.metricInfo?.unit ?? ''} myId={ranking?.myRunnerId ?? null} />
        </div>
      )}

      {tab === 'retos' && (
        <div>
          {isCoach && (
            <button onClick={() => setShowForm(true)}
              className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors">
              <Plus size={16} /> Crear reto
            </button>
          )}

          {(!challenges || challenges.length === 0) && (
            <p className="text-sm text-gray-500 py-8 text-center">No hay retos activos.</p>
          )}

          <div className="space-y-4">
            {challenges?.map(c => (
              <div key={c.id} className="bg-dark-900 border border-dark-700 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white">{c.nombre}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        c.status === 'active' ? 'bg-green-500/15 text-green-400'
                        : c.status === 'upcoming' ? 'bg-blue-500/15 text-blue-400'
                        : 'bg-gray-500/15 text-gray-400'}`}>
                        {c.status === 'active' ? 'Activo' : c.status === 'upcoming' ? 'Próximo' : 'Terminado'}
                      </span>
                      {c.group && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${c.group.color}22`, color: c.group.color }}>{c.group.nombre}</span>}
                    </div>
                    {c.descripcion && <p className="text-xs text-gray-400 mt-0.5">{c.descripcion}</p>}
                    <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-2">
                      <Calendar size={11} /> {fmtDate(c.fechaInicio)} – {fmtDate(c.fechaFin)}
                      <span className="text-gray-600">·</span> {c.metricInfo.label}
                      {c.meta ? <><Target size={11} /> Meta {c.meta} {c.metricInfo.unit}</> : null}
                    </p>
                  </div>
                  {isCoach && (
                    <button onClick={() => { if (confirm('¿Eliminar este reto?')) del.mutate(c.id); }}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {c.meta != null && c.myValue != null && (
                  <div className="mb-3">
                    <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                      <span>Tu progreso</span><span>{c.myValue} / {c.meta} {c.metricInfo.unit}</span>
                    </div>
                    <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(100, (c.myValue / c.meta) * 100)}%` }} />
                    </div>
                  </div>
                )}

                <Leaderboard rows={c.leaderboard} unit={c.metricInfo.unit} myId={null} />
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && <ChallengeForm groups={groups ?? []} onClose={() => setShowForm(false)}
        onCreated={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['challenges'] }); }} />}
    </div>
  );
}

function ChallengeForm({ groups, onClose, onCreated }: { groups: { id: number; nombre: string }[]; onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({
    nombre: '', descripcion: '', metrica: 'km' as Metric, meta: '',
    fechaInicio: '', fechaFin: '', scope: 'club' as 'club' | 'group', groupId: '' as string,
  });
  const [err, setErr] = useState('');

  const create = useMutation({
    mutationFn: () => gamificationApi.createChallenge({
      nombre: f.nombre.trim(),
      descripcion: f.descripcion.trim() || undefined,
      metrica: f.metrica,
      meta: f.meta ? parseFloat(f.meta) : undefined,
      fechaInicio: new Date(f.fechaInicio).toISOString(),
      fechaFin: new Date(f.fechaFin + 'T23:59:59').toISOString(),
      scope: f.scope,
      groupId: f.scope === 'group' && f.groupId ? Number(f.groupId) : undefined,
    }),
    onSuccess: onCreated,
    onError: (e: any) => setErr(e?.response?.data?.error ?? 'Error al crear el reto'),
  });

  const valid = f.nombre.trim() && f.fechaInicio && f.fechaFin && (f.scope === 'club' || f.groupId);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-800 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border border-white/[0.08] max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] sticky top-0 bg-surface-800">
          <h2 className="font-bold text-white">Nuevo reto</h2>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Nombre"><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} className="inp" placeholder="Ej: Reto de mayo" /></Field>
          <Field label="Descripción (opcional)"><input value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} className="inp" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Métrica">
              <select value={f.metrica} onChange={e => setF({ ...f, metrica: e.target.value as Metric })} className="inp">
                {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Meta (opcional)"><input type="number" value={f.meta} onChange={e => setF({ ...f, meta: e.target.value })} className="inp" placeholder="ej. 100" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio"><input type="date" value={f.fechaInicio} onChange={e => setF({ ...f, fechaInicio: e.target.value })} className="inp" /></Field>
            <Field label="Fin"><input type="date" value={f.fechaFin} onChange={e => setF({ ...f, fechaFin: e.target.value })} className="inp" /></Field>
          </div>
          <Field label="Alcance">
            <div className="flex gap-2">
              <button onClick={() => setF({ ...f, scope: 'club' })} className={`flex-1 py-2 rounded-lg text-sm ${f.scope === 'club' ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400'}`}>Todo el club</button>
              <button onClick={() => setF({ ...f, scope: 'group' })} className={`flex-1 py-2 rounded-lg text-sm ${f.scope === 'group' ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400'}`}>Por grupo</button>
            </div>
          </Field>
          {f.scope === 'group' && (
            <Field label="Grupo">
              <select value={f.groupId} onChange={e => setF({ ...f, groupId: e.target.value })} className="inp">
                <option value="">Selecciona…</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </Field>
          )}
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button disabled={!valid || create.isPending} onClick={() => { setErr(''); create.mutate(); }}
            className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold disabled:opacity-50">
            {create.isPending ? 'Creando…' : 'Crear reto'}
          </button>
        </div>
      </div>
      <style>{`.inp{width:100%;background:#111827;border:1px solid #374151;border-radius:0.5rem;padding:0.6rem 0.75rem;font-size:0.875rem;color:#fff}.inp:focus{outline:none;border-color:#22c55e}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
