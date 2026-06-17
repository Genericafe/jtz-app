import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle, Clock, AlertTriangle, X, CreditCard, Search, ChevronDown, Check, Trash2, Edit2, Bell } from 'lucide-react';
import { paymentsApi, runnersApi, stripeApi, groupsApi } from '../services/api';
import { Payment, Runner } from '../types';
import { useAuth } from '../context/AuthContext';
import type { RunnerGroup } from '../components/GroupsManager';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const estadoStyles: Record<string, { cls: string; icon: typeof CheckCircle }> = {
  pagado:   { cls: 'bg-green-500/15 text-green-400 border-green-500/20', icon: CheckCircle },
  pendiente:{ cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20', icon: Clock },
  vencido:  { cls: 'bg-red-500/15 text-red-400 border-red-500/20', icon: AlertTriangle },
};

export default function Payments() {
  const { isCoach, user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [filter, setFilter] = useState<'todos' | 'pendiente' | 'pagado' | 'vencido'>('todos');
  const [form, setForm] = useState({ runnerId: '', concepto: 'membresia', monto: '', moneda: 'MXN', estado: 'pendiente', fechaVencimiento: '', fechaPago: '', duracion: '', duracionUnidad: 'meses', notas: '' });
  const [payTarget, setPayTarget] = useState<'runner' | 'group'>('runner');
  const [groupId, setGroupId] = useState('');
  const [groupMsg, setGroupMsg] = useState('');
  const [runnerSearch, setRunnerSearch] = useState('');
  const [runnerDropdown, setRunnerDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRunnerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Coach ve todos los pagos; runner ve sólo los suyos
  const { data: paymentsData } = useQuery({
    queryKey: ['payments'],
    queryFn: () => isCoach ? paymentsApi.list() : runnersApi.me(),
  });
  const { data: runnersData } = useQuery({ queryKey: ['runners'], queryFn: () => runnersApi.list(), enabled: isCoach });
  const { data: statsData } = useQuery({ queryKey: ['payment-stats'], queryFn: () => paymentsApi.stats(), enabled: isCoach });
  const { data: groupsData } = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list(), enabled: isCoach });
  const groups: RunnerGroup[] = groupsData?.data ?? [];

  const groupChargeMutation = useMutation({
    mutationFn: (d: object) => groupsApi.charge(Number(groupId), d),
    onSuccess: (res: { data: { created: number } }) => {
      qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['payment-stats'] });
      setGroupMsg(`✓ Pago creado para ${res.data.created} corredor(es) del grupo`);
      setTimeout(() => { setShowForm(false); setGroupMsg(''); setGroupId(''); setPayTarget('runner'); }, 1500);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setGroupMsg(`⚠ ${err?.response?.data?.error ?? 'Error al crear pagos'}`),
  });

  const allPayments: Payment[] = isCoach
    ? (paymentsData?.data ?? [])
    : (paymentsData?.data?.payments ?? []);

  const runners: Runner[] = runnersData?.data ?? [];
  const stats = statsData?.data;

  const createMutation = useMutation({
    mutationFn: (d: object) => paymentsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payment-stats'] });
      setShowForm(false);
      setForm({ runnerId: '', concepto: 'membresia', monto: '', moneda: 'MXN', estado: 'pendiente', fechaVencimiento: '', fechaPago: '', duracion: '', duracionUnidad: 'meses', notas: '' });
      setRunnerSearch('');
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: number) => paymentsApi.markPaid(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['payment-stats'] }); },
  });

  const deletePayMutation = useMutation({
    mutationFn: (id: number) => paymentsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['payment-stats'] }); },
  });

  const [editPay, setEditPay] = useState<Payment | null>(null);
  const [editForm, setEditForm] = useState({ concepto: 'membresia', monto: '', estado: 'pendiente', fechaVencimiento: '', fechaPago: '', notas: '' });
  const openEditPay = (p: Payment) => {
    setEditForm({
      concepto: p.concepto, monto: String(p.monto), estado: p.estado,
      fechaVencimiento: p.fechaVencimiento ? p.fechaVencimiento.slice(0, 10) : '',
      fechaPago: p.fechaPago ? p.fechaPago.slice(0, 10) : '',
      notas: p.notas ?? '',
    });
    setEditPay(p);
  };
  const editPayMutation = useMutation({
    mutationFn: (data: object) => paymentsApi.update(editPay!.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['payment-stats'] }); setEditPay(null); },
  });

  const [remindMsg, setRemindMsg] = useState<number | null>(null);
  const remindMutation = useMutation({
    mutationFn: (id: number) => paymentsApi.remind(id),
    onSuccess: (_d, id) => { setRemindMsg(id); setTimeout(() => setRemindMsg(null), 2500); },
  });

  const checkoutMutation = useMutation({
    mutationFn: (paymentId: number) => stripeApi.createCheckout(paymentId),
    onSuccess: (res) => { window.location.href = res.data.url; },
  });

  const filtered = filter === 'todos' ? allPayments : allPayments.filter((p) => p.estado === filter);

  const handleTogglePay = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelectionPay = () => { setSelectionMode(false); setSelectedIds(new Set()); };
  const handleSelectAllPay = () => setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)));
  const handleBulkMarkPaid = async () => {
    const pending = filtered.filter(p => selectedIds.has(p.id) && p.estado !== 'pagado');
    if (!pending.length) return;
    if (!confirm(`¿Marcar ${pending.length} pago(s) como pagados?`)) return;
    setBulkPending(true);
    try {
      await Promise.all(pending.map(p => markPaidMutation.mutateAsync(p.id)));
      exitSelectionPay();
    } finally { setBulkPending(false); }
  };
  const allSelectedPay = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelectedPay = selectedIds.size > 0 && !allSelectedPay;
  const pendingSelected = filtered.filter(p => selectedIds.has(p.id) && p.estado !== 'pagado').length;

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white">{isCoach ? 'Pagos' : 'Mis pagos'}</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {isCoach ? 'Membresías y planes personalizados' : 'Historial y pagos pendientes'}
          </p>
        </div>
        {isCoach && (
          <div className="flex items-center gap-2 flex-wrap">
            {selectionMode && pendingSelected > 0 && (
              <button onClick={handleBulkMarkPaid} disabled={bulkPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-green-400 hover:bg-green-500/10 border border-green-500/20 transition-all disabled:opacity-40">
                <CheckCircle size={14} /> Marcar pagados ({pendingSelected})
              </button>
            )}
            <button onClick={() => selectionMode ? exitSelectionPay() : setSelectionMode(true)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${selectionMode ? 'bg-surface-600 text-white border border-white/[0.08]' : 'text-gray-400 hover:text-white hover:bg-surface-600'}`}>
              {selectionMode ? 'Cancelar' : 'Gestionar'}
            </button>
            {!selectionMode && (
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <Plus size={16} /> Registrar pago
              </button>
            )}
          </div>
        )}
      </div>

      {isCoach && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total recaudado', value: `$${(stats?.totalRecaudado ?? 0).toLocaleString('es-MX')} MXN`, color: 'text-green-400' },
            { label: 'Pendientes', value: stats?.pendiente ?? 0, color: 'text-yellow-400' },
            { label: 'Vencidos', value: stats?.vencido ?? 0, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {!isCoach && allPayments.filter(p => p.estado !== 'pagado').length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0" />
          <p className="text-sm text-yellow-300">
            Tienes <strong>{allPayments.filter(p => p.estado !== 'pagado').length}</strong> pago(s) pendiente(s). Puedes pagarlos en línea con tarjeta.
          </p>
        </div>
      )}

      <div className="flex gap-1 p-1 card rounded-lg w-fit mb-5">
        {(['todos', 'pendiente', 'pagado', 'vencido'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${filter === f ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Selection bar */}
      {isCoach && selectionMode && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-surface-700 rounded-xl border border-white/[0.06]">
          <button onClick={handleSelectAllPay} className="flex items-center gap-2.5 text-sm text-gray-300 hover:text-white transition-colors">
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${allSelectedPay ? 'bg-brand-500 border-brand-500' : someSelectedPay ? 'border-brand-500 bg-surface-800' : 'border-gray-500 bg-surface-800'}`}>
              {allSelectedPay && <Check size={12} className="text-white" />}
              {someSelectedPay && <span className="w-2 h-0.5 bg-brand-400 rounded-full" />}
            </div>
            {allSelectedPay ? 'Deseleccionar todos' : selectedIds.size > 0 ? `${selectedIds.size} de ${filtered.length} seleccionados` : `Seleccionar todos (${filtered.length})`}
          </button>
        </div>
      )}

      {/* Desktop table */}
      <div className="card rounded-xl overflow-x-auto hidden sm:block">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-dark-700">
              {isCoach && selectionMode && <th className="px-3 py-3 w-10" />}
              {isCoach && <th className="text-left text-xs font-medium text-gray-400 px-5 py-3 uppercase tracking-wide">Corredor</th>}
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3 uppercase tracking-wide">Concepto</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3 uppercase tracking-wide">Monto</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3 uppercase tracking-wide">Estado</th>
              <th className="text-left text-xs font-medium text-gray-400 px-5 py-3 uppercase tracking-wide">Vencimiento</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const { cls, icon: Icon } = estadoStyles[p.estado] ?? estadoStyles.pendiente;
              const isSelected = selectedIds.has(p.id);
              return (
                <tr key={p.id} className={`border-b border-dark-700/50 hover:bg-surface-700/30 transition-colors ${isSelected ? 'bg-brand-500/5' : ''}`}
                  onClick={selectionMode && isCoach ? () => handleTogglePay(p.id) : undefined}
                  style={selectionMode && isCoach ? { cursor: 'pointer' } : undefined}>
                  {isCoach && selectionMode && (
                    <td className="px-3 py-3">
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-brand-500 border-brand-500' : 'border-gray-500'}`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                    </td>
                  )}
                  {isCoach && (
                    <td className="px-5 py-3 text-sm text-white">
                      {p.runner?.nombre} {p.runner?.apellido}
                    </td>
                  )}
                  <td className="px-5 py-3 text-sm text-gray-300 capitalize">{p.concepto.replace('_', ' ')}</td>
                  <td className="px-5 py-3 text-sm font-medium text-white">
                    ${p.monto.toLocaleString('es-MX')} <span className="text-xs text-gray-500">{p.moneda}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${cls}`}>
                      <Icon size={11} /> {p.estado}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-400">
                    <div>{p.fechaVencimiento ? format(new Date(p.fechaVencimiento), "d MMM yyyy", { locale: es }) : '—'}</div>
                    {p.duracion && <div className="text-xs text-indigo-400 mt-0.5">{p.duracion} {p.duracionUnidad}</div>}
                    {p.fechaPago && <div className="text-xs text-green-400 mt-0.5">Pagado {format(new Date(p.fechaPago), "d MMM", { locale: es })}</div>}
                  </td>
                  <td className="px-5 py-3">
                    {isCoach && !selectionMode ? (
                      <div className="flex items-center gap-1 justify-end">
                        {p.estado === 'pendiente' && (
                          <button onClick={() => markPaidMutation.mutate(p.id)} title="Marcar pagado"
                            className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors">
                            Pagado
                          </button>
                        )}
                        {p.estado !== 'pagado' && (
                          <button onClick={() => remindMutation.mutate(p.id)} title="Enviar recordatorio por correo"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-all">
                            {remindMsg === p.id ? <CheckCircle size={14} className="text-green-400" /> : <Bell size={14} />}
                          </button>
                        )}
                        <button onClick={() => openEditPay(p)} title="Editar"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all"><Edit2 size={14} /></button>
                        <button onClick={() => { if (confirm('¿Eliminar este pago?')) deletePayMutation.mutate(p.id); }} title="Eliminar"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"><Trash2 size={14} /></button>
                      </div>
                    ) : !isCoach && p.estado !== 'pagado' ? (
                      <button
                        onClick={() => checkoutMutation.mutate(p.id)}
                        disabled={checkoutMutation.isPending}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors disabled:opacity-50"
                      >
                        <CreditCard size={12} />
                        {checkoutMutation.isPending ? 'Cargando...' : 'Pagar'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isCoach ? (selectionMode ? 7 : 6) : 5} className="text-center py-10 text-gray-500">Sin pagos registrados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="card p-10 text-center text-gray-500 text-sm">Sin pagos registrados</div>
        ) : filtered.map((p) => {
          const { cls, icon: Icon } = estadoStyles[p.estado] ?? estadoStyles.pendiente;
          return (
            <div key={p.id} className={`card p-4 ${selectionMode && isCoach ? 'cursor-pointer' : ''} ${selectedIds.has(p.id) ? 'ring-2 ring-brand-500' : ''}`}
              onClick={selectionMode && isCoach ? () => handleTogglePay(p.id) : undefined}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  {isCoach && <p className="text-sm font-bold text-white truncate">{p.runner?.nombre} {p.runner?.apellido}</p>}
                  <p className="text-xs text-gray-400 capitalize">{p.concepto.replace('_', ' ')}</p>
                </div>
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${cls}`}>
                  <Icon size={11} /> {p.estado}
                </span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-lg font-black text-white">${p.monto.toLocaleString('es-MX')} <span className="text-xs text-gray-500 font-normal">{p.moneda}</span></p>
                  {p.fechaVencimiento && <p className="text-[11px] text-gray-500">Vence {format(new Date(p.fechaVencimiento), "d MMM yyyy", { locale: es })}</p>}
                  {p.fechaPago && <p className="text-[11px] text-green-400">Pagado {format(new Date(p.fechaPago), "d MMM", { locale: es })}</p>}
                </div>
                {!selectionMode && (isCoach ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {p.estado === 'pendiente' && (
                      <button onClick={() => markPaidMutation.mutate(p.id)} className="text-xs px-2 py-1.5 rounded-lg bg-green-500/20 text-green-400">Pagado</button>
                    )}
                    {p.estado !== 'pagado' && (
                      <button onClick={() => remindMutation.mutate(p.id)} className="p-2 rounded-lg text-gray-400 hover:text-brand-400 bg-surface-600">
                        {remindMsg === p.id ? <CheckCircle size={15} className="text-green-400" /> : <Bell size={15} />}
                      </button>
                    )}
                    <button onClick={() => openEditPay(p)} className="p-2 rounded-lg text-gray-400 hover:text-white bg-surface-600"><Edit2 size={15} /></button>
                    <button onClick={() => { if (confirm('¿Eliminar este pago?')) deletePayMutation.mutate(p.id); }} className="p-2 rounded-lg text-gray-400 hover:text-red-400 bg-surface-600"><Trash2 size={15} /></button>
                  </div>
                ) : p.estado !== 'pagado' ? (
                  <button onClick={() => checkoutMutation.mutate(p.id)} disabled={checkoutMutation.isPending}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium disabled:opacity-50">
                    <CreditCard size={13} /> Pagar
                  </button>
                ) : null)}
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="card rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Registrar pago</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {/* Target: individual runner or whole group */}
              <div className="flex gap-1 p-1 bg-surface-700 rounded-xl">
                {([['runner', 'Corredor'], ['group', 'Grupo']] as const).map(([t, l]) => (
                  <button key={t} type="button" onClick={() => setPayTarget(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${payTarget === t ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'}`}>
                    {l}
                  </button>
                ))}
              </div>

              {payTarget === 'group' ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Grupo</label>
                  {groups.length === 0 ? (
                    <p className="text-xs text-gray-500 bg-surface-700 rounded-lg px-3 py-2.5">Aún no tienes grupos. Créalos en Corredores → Grupos.</p>
                  ) : (
                    <select value={groupId} onChange={e => setGroupId(e.target.value)} className="input w-full text-sm">
                      <option value="">Seleccionar grupo...</option>
                      {groups.map(g => <option key={g.id} value={g.id}>{g.nombre} ({g._count?.members ?? g.members.length})</option>)}
                    </select>
                  )}
                  <p className="text-[11px] text-gray-500 mt-1.5">Se creará el mismo pago para todos los corredores del grupo.</p>
                </div>
              ) : (
              <div ref={dropdownRef} className="relative">
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Corredor</label>
                <div
                  className="input w-full flex items-center gap-2 cursor-pointer"
                  onClick={() => setRunnerDropdown(true)}
                >
                  <Search size={14} className="text-gray-500 flex-shrink-0" />
                  <input
                    value={runnerSearch}
                    onChange={e => { setRunnerSearch(e.target.value); setRunnerDropdown(true); if (!e.target.value) setForm({ ...form, runnerId: '' }); }}
                    onFocus={() => setRunnerDropdown(true)}
                    placeholder={form.runnerId ? runners.find(r => String(r.id) === form.runnerId) ? `${runners.find(r => String(r.id) === form.runnerId)!.nombre} ${runners.find(r => String(r.id) === form.runnerId)!.apellido}` : 'Buscar corredor...' : 'Buscar corredor...'}
                    className="flex-1 bg-transparent outline-none text-sm text-white placeholder-gray-500"
                  />
                  <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
                </div>
                {runnerDropdown && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface-700 border border-white/[0.08] rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {runners.filter(r => r.activo && `${r.nombre} ${r.apellido}`.toLowerCase().includes(runnerSearch.toLowerCase())).length === 0 ? (
                      <p className="px-3 py-3 text-sm text-gray-500">No se encontraron corredores</p>
                    ) : (
                      runners.filter(r => r.activo && `${r.nombre} ${r.apellido}`.toLowerCase().includes(runnerSearch.toLowerCase())).map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => { setForm({ ...form, runnerId: String(r.id) }); setRunnerSearch(`${r.nombre} ${r.apellido}`); setRunnerDropdown(false); }}
                          className={`w-full text-left px-3 py-2.5 text-sm hover:bg-surface-600 transition-colors flex items-center gap-2 ${String(r.id) === form.runnerId ? 'text-brand-400 bg-brand-500/10' : 'text-white'}`}
                        >
                          <span className="w-7 h-7 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {r.nombre[0]}{r.apellido[0]}
                          </span>
                          {r.nombre} {r.apellido}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Concepto</label>
                <select value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                  className="w-full input">
                  {['membresia', 'plan_personalizado', 'evento', 'uniforme'].map((c) => (
                    <option key={c} value={c}>{c.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Monto (MXN)</label>
                  <input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}
                    className="w-full input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Estado inicial</label>
                  <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}
                    className="w-full input">
                    {['pendiente', 'pagado', 'vencido'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Fecha de vencimiento</label>
                  <input type="date" value={form.fechaVencimiento} onChange={e => setForm({ ...form, fechaVencimiento: e.target.value })}
                    className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Fecha de pago</label>
                  <input type="date" value={form.fechaPago} onChange={e => setForm({ ...form, fechaPago: e.target.value })}
                    className="input w-full text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Duración del plan <span className="text-gray-600">(opcional)</span></label>
                <div className="flex gap-2">
                  <input type="number" min="1" value={form.duracion}
                    onChange={e => setForm({ ...form, duracion: e.target.value })}
                    placeholder="Ej: 3"
                    className="input text-sm w-24 flex-shrink-0" />
                  <select value={form.duracionUnidad} onChange={e => setForm({ ...form, duracionUnidad: e.target.value })}
                    className="input text-sm flex-1">
                    {['horas','días','semanas','meses','años'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {groupMsg && (
              <p className={`text-xs mt-3 ${groupMsg.startsWith('✓') ? 'text-green-400' : 'text-yellow-400'}`}>{groupMsg}</p>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 rounded-lg border border-dark-600 text-sm text-gray-300 hover:text-white transition-colors">Cancelar</button>
              {payTarget === 'group' ? (
                <button onClick={() => groupChargeMutation.mutate({
                    concepto: form.concepto,
                    monto: Number(form.monto),
                    moneda: form.moneda,
                    estado: form.estado,
                    duracion: form.duracion ? Number(form.duracion) : undefined,
                    duracionUnidad: form.duracion ? form.duracionUnidad : undefined,
                    fechaVencimiento: form.fechaVencimiento || undefined,
                    notas: form.notas || undefined,
                  })}
                  disabled={groupChargeMutation.isPending || !groupId || !form.monto || Number(form.monto) <= 0}
                  className="flex-1 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-sm font-medium text-white transition-colors disabled:opacity-50">
                  {groupChargeMutation.isPending ? 'Creando...' : 'Cobrar al grupo'}
                </button>
              ) : (
                <button onClick={() => createMutation.mutate({
                    ...form,
                    runnerId: Number(form.runnerId),
                    monto: Number(form.monto),
                    duracion: form.duracion ? Number(form.duracion) : undefined,
                    duracionUnidad: form.duracion ? form.duracionUnidad : undefined,
                    fechaPago: form.fechaPago || undefined,
                    fechaVencimiento: form.fechaVencimiento || undefined,
                  })}
                  disabled={createMutation.isPending || !form.runnerId || !form.monto || Number(form.monto) <= 0}
                  className="flex-1 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-sm font-medium text-white transition-colors disabled:opacity-50">
                  {createMutation.isPending ? 'Guardando...' : 'Registrar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit payment modal */}
      {editPay && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setEditPay(null)}>
          <div onClick={e => e.stopPropagation()} className="card rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Editar pago</h2>
              <button onClick={() => setEditPay(null)} className="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>
            {isCoach && <p className="text-xs text-gray-500 mb-4">{editPay.runner?.nombre} {editPay.runner?.apellido}</p>}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Concepto</label>
                <select value={editForm.concepto} onChange={e => setEditForm({ ...editForm, concepto: e.target.value })} className="w-full input">
                  {['membresia', 'plan_personalizado', 'evento', 'uniforme'].map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Monto (MXN)</label>
                  <input type="number" value={editForm.monto} onChange={e => setEditForm({ ...editForm, monto: e.target.value })} className="w-full input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Estado</label>
                  <select value={editForm.estado} onChange={e => setEditForm({ ...editForm, estado: e.target.value })} className="w-full input">
                    {['pendiente', 'pagado', 'vencido'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Vencimiento</label>
                  <input type="date" value={editForm.fechaVencimiento} onChange={e => setEditForm({ ...editForm, fechaVencimiento: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Fecha de pago</label>
                  <input type="date" value={editForm.fechaPago} onChange={e => setEditForm({ ...editForm, fechaPago: e.target.value })} className="input w-full text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Notas</label>
                <textarea value={editForm.notas} onChange={e => setEditForm({ ...editForm, notas: e.target.value })} rows={2} className="input w-full text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditPay(null)} className="flex-1 px-4 py-2 rounded-lg border border-dark-600 text-sm text-gray-300 hover:text-white transition-colors">Cancelar</button>
              <button onClick={() => editPayMutation.mutate({
                  concepto: editForm.concepto,
                  monto: Number(editForm.monto),
                  estado: editForm.estado,
                  fechaVencimiento: editForm.fechaVencimiento || null,
                  fechaPago: editForm.fechaPago || null,
                  notas: editForm.notas || null,
                })}
                disabled={editPayMutation.isPending || !editForm.monto || Number(editForm.monto) <= 0}
                className="flex-1 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-sm font-medium text-white transition-colors disabled:opacity-50">
                {editPayMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
