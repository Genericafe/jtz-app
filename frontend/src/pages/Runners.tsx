import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Phone, MapPin, X, UserCheck, Check, Trash2, EyeOff, RefreshCw, Users } from 'lucide-react';
import { runnersApi, groupsApi } from '../services/api';
import { Runner } from '../types';
import { useAuth } from '../context/AuthContext';
import GroupsManager, { type RunnerGroup } from '../components/GroupsManager';

const nivelConfig: Record<string, { badge: string; ring: string; gradient: string }> = {
  principiante: { badge: 'bg-green-500/15 text-green-400',   ring: 'ring-green-500/30',  gradient: 'from-green-500 to-emerald-600' },
  intermedio:   { badge: 'bg-blue-500/15 text-blue-400',     ring: 'ring-blue-500/30',   gradient: 'from-blue-500 to-indigo-600' },
  avanzado:     { badge: 'bg-purple-500/15 text-purple-400', ring: 'ring-purple-500/30', gradient: 'from-purple-500 to-violet-600' },
  elite:        { badge: 'bg-brand-500/15 text-brand-400',   ring: 'ring-brand-500/30',  gradient: 'from-brand-500 to-orange-600' },
};

function RunnerCard({
  runner,
  onClick,
  selectable = false,
  selected = false,
  onToggleSelect,
  onReactivate,
}: {
  runner: Runner;
  onClick: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
  onReactivate?: (e: React.MouseEvent) => void;
}) {
  const nivel = runner.nivel ?? 'principiante';
  const cfg = nivelConfig[nivel] ?? nivelConfig.principiante;
  const initials = `${runner.nombre?.[0] ?? ''}${runner.apellido?.[0] ?? ''}`.toUpperCase() || '?';
  const disabled = !runner.activo;

  return (
    <div
      onClick={selectable ? onToggleSelect : onClick}
      className={`card-hover p-5 flex flex-col gap-4 cursor-pointer relative transition-all
        ${selected ? 'ring-2 ring-brand-500 bg-brand-500/5' : ''}
        ${disabled ? 'opacity-50' : ''}
      `}
    >
      {disabled && (
        <div className="absolute top-3 left-3 z-10">
          <span className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full uppercase tracking-wide">
            Deshabilitado
          </span>
        </div>
      )}

      {selectable && (
        <div className="absolute top-3 right-3 z-10">
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
            selected ? 'bg-brand-500 border-brand-500' : 'border-gray-500 bg-surface-800/80'
          }`}>
            {selected && <Check size={12} className="text-white" />}
          </div>
        </div>
      )}

      <div className={`flex items-center gap-3 ${disabled ? 'mt-4' : ''}`}>
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-white font-black text-base ring-2 ${cfg.ring} flex-shrink-0 shadow-glow-sm ${disabled ? 'grayscale' : ''}`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white truncate">{runner.nombre} {runner.apellido}</p>
          <span className={`badge ${cfg.badge} capitalize`}>{nivel}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {runner.telefono && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Phone size={12} className="text-gray-500 flex-shrink-0" /> {runner.telefono}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <MapPin size={12} className="text-gray-500 flex-shrink-0" /> {runner.ciudad}
        </div>
        {runner.user?.email && (
          <div className="text-xs text-gray-500 truncate">{runner.user.email}</div>
        )}
      </div>

      {runner.notas && (
        <p className="text-xs text-gray-500 border-t border-white/[0.05] pt-3 line-clamp-2 italic">
          "{runner.notas}"
        </p>
      )}

      {disabled && onReactivate && (
        <button
          onClick={onReactivate}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-semibold text-green-400 border border-green-500/25 hover:bg-green-500/10 transition-all mt-1"
        >
          <RefreshCw size={12} /> Reactivar cuenta
        </button>
      )}
    </div>
  );
}

export default function Runners() {
  const { isCoach } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('todos');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', nombre: '', apellido: '', telefono: '', nivel: 'principiante', notas: '' });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [groupFilter, setGroupFilter] = useState<number | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['runners'], queryFn: () => runnersApi.list() });
  const runners: Runner[] = data?.data ?? [];

  const { data: groupsData } = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list(), enabled: isCoach });
  const groups: RunnerGroup[] = groupsData?.data ?? [];
  // runnerId -> set of groupIds it belongs to
  const runnerGroups = new Map<number, Set<number>>();
  groups.forEach(g => g.members?.forEach(m => {
    const s = runnerGroups.get(m.runner.id) ?? new Set<number>();
    s.add(g.id); runnerGroups.set(m.runner.id, s);
  }));

  const createMutation = useMutation({
    mutationFn: (d: object) => runnersApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['runners'] }); setShowForm(false); },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: number) => runnersApi.reactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runners'] }),
  });

  const activeRunners = runners.filter(r => r.activo);
  const disabledRunners = runners.filter(r => !r.activo);

  const filtered = runners.filter((r) => {
    const matchesSearch = `${r.nombre} ${r.apellido} ${r.ciudad}`.toLowerCase().includes(search.toLowerCase());
    if (levelFilter === 'deshabilitados') return !r.activo && matchesSearch;
    if (!r.activo) return false;
    const matchesLevel = levelFilter === 'todos' || r.nivel === levelFilter;
    const matchesGroup = groupFilter == null || runnerGroups.get(r.id)?.has(groupFilter);
    return matchesSearch && matchesLevel && matchesGroup;
  });

  const countByLevel = (nivel: string) => activeRunners.filter(r => r.nivel === nivel).length;

  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(r => r.id)));
    }
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDisable = async () => {
    if (!window.confirm(`¿Deshabilitar ${selectedIds.size} corredor(es)? Seguirán en la base de datos pero no aparecerán en la lista.`)) return;
    setBulkPending(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => runnersApi.deactivate(id)));
      qc.invalidateQueries({ queryKey: ['runners'] });
      exitSelection();
    } finally {
      setBulkPending(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`¿Eliminar permanentemente ${selectedIds.size} corredor(es)? Esta acción no se puede deshacer.`)) return;
    setBulkPending(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => runnersApi.permanentDelete(id)));
      qc.invalidateQueries({ queryKey: ['runners'] });
      exitSelection();
    } finally {
      setBulkPending(false);
    }
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white">Corredores</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {activeRunners.length} activos{disabledRunners.length > 0 ? ` · ${disabledRunners.length} deshabilitados` : ''} · Equipo JTZ
          </p>
        </div>
        {isCoach && (
          <div className="flex items-center gap-2 flex-wrap">
            {selectionMode && selectedIds.size > 0 && (
              <>
                <button
                  onClick={handleBulkDisable}
                  disabled={bulkPending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 border border-yellow-500/20 transition-all disabled:opacity-40"
                >
                  <EyeOff size={14} />
                  Deshabilitar ({selectedIds.size})
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkPending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all disabled:opacity-40"
                >
                  <Trash2 size={14} />
                  Eliminar ({selectedIds.size})
                </button>
              </>
            )}
            <button
              onClick={() => setShowGroups(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-surface-600 transition-all"
            >
              <Users size={15} /> Grupos
            </button>
            <button
              onClick={() => selectionMode ? exitSelection() : setSelectionMode(true)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                selectionMode
                  ? 'bg-surface-600 text-white border border-white/[0.08]'
                  : 'text-gray-400 hover:text-white hover:bg-surface-600'
              }`}
            >
              {selectionMode ? 'Cancelar' : 'Gestionar'}
            </button>
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
              <Plus size={16} /> Agregar corredor
            </button>
          </div>
        )}
      </div>

      {/* Level stat pills */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setLevelFilter('todos')}
          className={`text-sm px-4 py-1.5 rounded-full font-medium transition-all ${levelFilter === 'todos' ? 'bg-brand-500 text-white shadow-glow-sm' : 'bg-surface-700 text-gray-400 hover:text-white border border-white/[0.06]'}`}>
          Todos ({activeRunners.length})
        </button>
        {['principiante', 'intermedio', 'avanzado', 'elite'].map((nivel) => (
          <button key={nivel} onClick={() => setLevelFilter(nivel)}
            className={`text-sm px-4 py-1.5 rounded-full font-medium capitalize transition-all ${levelFilter === nivel ? 'bg-brand-500 text-white shadow-glow-sm' : 'bg-surface-700 text-gray-400 hover:text-white border border-white/[0.06]'}`}>
            {nivel} ({countByLevel(nivel)})
          </button>
        ))}
        {isCoach && disabledRunners.length > 0 && (
          <button onClick={() => setLevelFilter(levelFilter === 'deshabilitados' ? 'todos' : 'deshabilitados')}
            className={`text-sm px-4 py-1.5 rounded-full font-medium transition-all ${levelFilter === 'deshabilitados' ? 'bg-red-500/30 text-red-300 border border-red-500/40' : 'bg-surface-700 text-red-400/70 hover:text-red-300 border border-red-500/20'}`}>
            Deshabilitados ({disabledRunners.length})
          </button>
        )}
      </div>

      {/* Group filter chips */}
      {isCoach && groups.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap items-center">
          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide flex items-center gap-1">
            <Users size={12} /> Grupos:
          </span>
          {groups.map(g => (
            <button key={g.id} onClick={() => setGroupFilter(groupFilter === g.id ? null : g.id)}
              className={`text-sm px-3 py-1 rounded-full font-medium transition-all flex items-center gap-1.5 border ${
                groupFilter === g.id ? 'text-white border-transparent' : 'text-gray-400 border-white/[0.08] hover:text-white'
              }`}
              style={groupFilter === g.id ? { background: g.color } : { background: 'transparent' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: groupFilter === g.id ? '#fff' : g.color }} />
              {g.nombre} ({g._count?.members ?? g.members.length})
            </button>
          ))}
          {groupFilter != null && (
            <button onClick={() => setGroupFilter(null)} className="text-xs text-gray-500 hover:text-white underline">
              limpiar
            </button>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar corredor..."
          className="input w-full pl-10 text-sm" />
      </div>

      {/* Select all bar */}
      {isCoach && selectionMode && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-surface-700 rounded-xl border border-white/[0.06]">
          <button onClick={handleSelectAll} className="flex items-center gap-2.5 text-sm text-gray-300 hover:text-white transition-colors">
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              allSelected ? 'bg-brand-500 border-brand-500' : someSelected ? 'border-brand-500 bg-surface-800' : 'border-gray-500 bg-surface-800'
            }`}>
              {allSelected && <Check size={12} className="text-white" />}
              {someSelected && <span className="w-2 h-0.5 bg-brand-400 rounded-full" />}
            </div>
            {allSelected
              ? 'Deseleccionar todos'
              : selectedIds.size > 0
              ? `${selectedIds.size} de ${filtered.length} seleccionados`
              : `Seleccionar todos (${filtered.length})`}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-20 text-gray-500">Cargando equipo...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((runner) => (
              <RunnerCard
                key={runner.id}
                runner={runner}
                onClick={() => navigate(`/corredores/${runner.id}`)}
                selectable={selectionMode && runner.activo}
                selected={selectedIds.has(runner.id)}
                onToggleSelect={(e) => { e.stopPropagation(); handleToggleSelect(runner.id); }}
                onReactivate={isCoach && !runner.activo ? (e) => { e.stopPropagation(); reactivateMutation.mutate(runner.id); } : undefined}
              />
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-20">
              <UserCheck size={40} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-500">No se encontraron corredores</p>
            </div>
          )}
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">Agregar corredor</h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[['nombre', 'Nombre'], ['apellido', 'Apellido']].map(([f, l]) => (
                  <div key={f}>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">{l}</label>
                    <input value={form[f as keyof typeof form]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} className="input w-full text-sm" />
                  </div>
                ))}
              </div>
              {[['email', 'Correo electrónico', 'email'], ['telefono', 'Teléfono', 'tel']].map(([f, l, t]) => (
                <div key={f}>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">{l}</label>
                  <input type={t} value={form[f as keyof typeof form]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} className="input w-full text-sm" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nivel</label>
                <select value={form.nivel} onChange={(e) => setForm({ ...form, nivel: e.target.value })} className="input w-full text-sm">
                  {['principiante', 'intermedio', 'avanzado', 'elite'].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Notas</label>
                <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} className="input w-full text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={() => createMutation.mutate({ ...form, password: 'JTZ2024!' })} disabled={createMutation.isPending}
                className="flex-1 btn-primary py-2.5 text-sm">
                {createMutation.isPending ? 'Guardando...' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroups && <GroupsManager runners={runners} onClose={() => setShowGroups(false)} />}
    </div>
  );
}
