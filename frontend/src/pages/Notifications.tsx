import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CreditCard, ClipboardList, UserCheck, ChevronRight, CheckCircle2 } from 'lucide-react';
import { remindersApi } from '../services/api';

interface Reminder {
  id: string;
  type: 'pago' | 'plan' | 'seguimiento';
  severity: 'alta' | 'media' | 'baja';
  runnerId: number;
  runnerNombre: string;
  titulo: string;
  detalle: string;
  fecha: string | null;
  link: string;
}

const TYPE_ICON = { pago: CreditCard, plan: ClipboardList, seguimiento: UserCheck };
const SEV = {
  alta:  { label: 'Urgente', dot: '#ef4444', chip: 'bg-red-500/15 text-red-400' },
  media: { label: 'Pronto',  dot: '#f59e0b', chip: 'bg-amber-500/15 text-amber-400' },
  baja:  { label: 'Revisar', dot: '#60a5fa', chip: 'bg-brand-500/15 text-brand-300' },
};

export default function Notifications() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['reminders'],
    queryFn: async () => (await remindersApi.list()).data as { reminders: Reminder[]; resumen: any },
    refetchInterval: 5 * 60 * 1000,
  });

  const reminders = useMemo(() => data?.reminders ?? [], [data]);
  const r = data?.resumen;

  if (isLoading) return <div className="p-4 lg:p-8 text-gray-400">Cargando notificaciones…</div>;

  return (
    <div className="p-4 lg:p-8 max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-brand-500/15 flex items-center justify-center">
          <Bell size={24} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Notificaciones</h1>
          <p className="text-gray-400 text-sm">Seguimiento, planes y pagos pendientes</p>
        </div>
      </div>

      {/* Resumen */}
      {r && reminders.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Summary n={r.pago} label="Pagos" icon={CreditCard} />
          <Summary n={r.plan} label="Planes" icon={ClipboardList} />
          <Summary n={r.seguimiento} label="Seguimiento" icon={UserCheck} />
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="card p-10 text-center">
          <CheckCircle2 size={40} className="text-brand-400 mx-auto mb-3" />
          <h2 className="text-lg text-white">¡Todo al día!</h2>
          <p className="text-gray-400 text-sm mt-1">No hay pagos, planes ni seguimientos pendientes.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {reminders.map(rem => {
            const Icon = TYPE_ICON[rem.type];
            const sev = SEV[rem.severity];
            return (
              <button
                key={rem.id}
                onClick={() => navigate(rem.link)}
                className="w-full card-hover p-4 flex items-center gap-3 text-left"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: sev.dot }} />
                <div className="w-9 h-9 rounded-xl bg-surface-600 flex items-center justify-center flex-shrink-0">
                  <Icon size={17} className="text-gray-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white truncate">{rem.titulo}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${sev.chip}`}>{sev.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{rem.detalle}</p>
                </div>
                <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Summary({ n, label, icon: Icon }: { n: number; label: string; icon: any }) {
  return (
    <div className="card p-3 text-center">
      <Icon size={16} className="text-gray-500 mx-auto mb-1" />
      <p className={`text-2xl font-bold ${n > 0 ? 'text-white' : 'text-gray-600'}`}>{n}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}
