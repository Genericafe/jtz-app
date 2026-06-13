import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle, Clock, AlertTriangle, X, CreditCard } from 'lucide-react';
import { paymentsApi, runnersApi, stripeApi } from '../services/api';
import { Payment, Runner } from '../types';
import { useAuth } from '../context/AuthContext';
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
  const [filter, setFilter] = useState<'todos' | 'pendiente' | 'pagado' | 'vencido'>('todos');
  const [form, setForm] = useState({ runnerId: '', concepto: 'membresia', monto: '', moneda: 'MXN', estado: 'pendiente', fechaVencimiento: '', notas: '' });

  // Coach ve todos los pagos; runner ve sólo los suyos
  const { data: paymentsData } = useQuery({
    queryKey: ['payments'],
    queryFn: () => isCoach ? paymentsApi.list() : runnersApi.me(),
  });
  const { data: runnersData } = useQuery({ queryKey: ['runners'], queryFn: () => runnersApi.list(), enabled: isCoach });
  const { data: statsData } = useQuery({ queryKey: ['payment-stats'], queryFn: () => paymentsApi.stats(), enabled: isCoach });

  const allPayments: Payment[] = isCoach
    ? (paymentsData?.data ?? [])
    : (paymentsData?.data?.payments ?? []);

  const runners: Runner[] = runnersData?.data ?? [];
  const stats = statsData?.data;

  const createMutation = useMutation({
    mutationFn: (d: object) => paymentsApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['payment-stats'] }); setShowForm(false); },
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: number) => paymentsApi.markPaid(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['payment-stats'] }); },
  });

  const checkoutMutation = useMutation({
    mutationFn: (paymentId: number) => stripeApi.createCheckout(paymentId),
    onSuccess: (res) => { window.location.href = res.data.url; },
  });

  const filtered = filter === 'todos' ? allPayments : allPayments.filter((p) => p.estado === filter);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{isCoach ? 'Pagos' : 'Mis pagos'}</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {isCoach ? 'Membresías y planes personalizados' : 'Historial y pagos pendientes'}
          </p>
        </div>
        {isCoach && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Registrar pago
          </button>
        )}
      </div>

      {isCoach && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total recaudado', value: `$${(stats?.totalRecaudado ?? 0).toLocaleString('es-MX')} MXN`, color: 'text-green-400' },
            { label: 'Pendientes', value: stats?.pendiente ?? 0, color: 'text-yellow-400' },
            { label: 'Vencidos', value: stats?.vencido ?? 0, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-dark-800 border border-dark-700 rounded-xl p-5">
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

      <div className="flex gap-1 p-1 bg-dark-800 border border-dark-700 rounded-lg w-fit mb-5">
        {(['todos', 'pendiente', 'pagado', 'vencido'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${filter === f ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-700">
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
              return (
                <tr key={p.id} className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors">
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
                    {p.fechaVencimiento ? format(new Date(p.fechaVencimiento), "d MMM yyyy", { locale: es }) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    {isCoach && p.estado === 'pendiente' && (
                      <button onClick={() => markPaidMutation.mutate(p.id)}
                        className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors">
                        Marcar pagado
                      </button>
                    )}
                    {!isCoach && p.estado !== 'pagado' && (
                      <button
                        onClick={() => checkoutMutation.mutate(p.id)}
                        disabled={checkoutMutation.isPending}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors disabled:opacity-50"
                      >
                        <CreditCard size={12} />
                        {checkoutMutation.isPending ? 'Cargando...' : 'Pagar'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isCoach ? 6 : 5} className="text-center py-10 text-gray-500">Sin pagos registrados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Registrar pago</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Corredor</label>
                <select value={form.runnerId} onChange={(e) => setForm({ ...form, runnerId: e.target.value })}
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                  <option value="">Seleccionar corredor...</option>
                  {runners.filter(r => r.activo).map((r) => (
                    <option key={r.id} value={r.id}>{r.nombre} {r.apellido}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Concepto</label>
                <select value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                  {['membresia', 'plan_personalizado', 'evento', 'uniforme'].map((c) => (
                    <option key={c} value={c}>{c.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Monto (MXN)</label>
                  <input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Estado inicial</label>
                  <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                    {['pendiente', 'pagado', 'vencido'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Fecha de vencimiento</label>
                <input type="date" value={form.fechaVencimiento} onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })}
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 rounded-lg border border-dark-600 text-sm text-gray-300 hover:text-white transition-colors">Cancelar</button>
              <button onClick={() => createMutation.mutate({ ...form, runnerId: Number(form.runnerId), monto: Number(form.monto) })}
                disabled={createMutation.isPending}
                className="flex-1 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-sm font-medium text-white transition-colors disabled:opacity-50">
                {createMutation.isPending ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
