import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi, publicApi } from '../services/api';
import { eventsApi } from '../services/api';
import { ArrowLeft, Users, Send, Download, Trash2, CheckCircle, Clock, X, Copy, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Lead {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string;
  ciudad?: string;
  estado: string;
  monto: number;
  createdAt: string;
}

const estadoBadge: Record<string, string> = {
  pendiente:  'bg-yellow-500/15 text-yellow-400',
  pagado:     'bg-green-500/15 text-green-400',
  confirmado: 'bg-blue-500/15 text-blue-400',
  cancelado:  'bg-red-500/15 text-red-400',
};

export default function EventLeads() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [copied, setCopied] = useState(false);
  const [broadcast, setBroadcast] = useState({ subject: '', mensaje: '', soloConfirmados: false });
  const [sendResult, setSendResult] = useState<{ ok: boolean; sent?: number } | null>(null);

  const { data: eventData } = useQuery({
    queryKey: ['event', id],
    queryFn: () => publicApi.getEvent(Number(id)),
  });
  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads', id],
    queryFn: () => leadsApi.list(Number(id)),
  });

  const event = eventData?.data;
  const leads: Lead[] = leadsData?.data ?? [];

  const broadcastMutation = useMutation({
    mutationFn: (data: object) => leadsApi.broadcast(Number(id), data),
    onSuccess: (res) => { setSendResult({ ok: true, sent: res.data.sent }); setBroadcast({ subject: '', mensaje: '', soloConfirmados: false }); },
    onError: () => setSendResult({ ok: false }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ leadId, estado }: { leadId: number; estado: string }) => leadsApi.updateStatus(leadId, estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (leadId: number) => leadsApi.delete(leadId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', id] }),
  });

  const landingUrl = `${window.location.origin}/evento/${id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(landingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const stats = {
    total: leads.length,
    pagados: leads.filter(l => l.estado === 'pagado').length,
    confirmados: leads.filter(l => l.estado === 'confirmado').length,
    pendientes: leads.filter(l => l.estado === 'pendiente').length,
    recaudado: leads.filter(l => l.estado === 'pagado').reduce((s, l) => s + l.monto, 0),
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/eventos')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white mb-5 transition-colors">
        <ArrowLeft size={16} /> Eventos
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white">{event?.nombre ?? 'Cargando...'}</h1>
          <p className="text-gray-400 text-sm mt-0.5">Inscritos · Base de datos del evento</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={copyLink}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-600 border border-white/[0.08] text-sm text-gray-300 hover:text-white transition-all">
            {copied ? <><CheckCircle size={14} className="text-green-400" /> Copiado</> : <><Copy size={14} /> Copiar link</>}
          </button>
          <a href={landingUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-600 border border-white/[0.08] text-sm text-gray-300 hover:text-white transition-all">
            <ExternalLink size={14} /> Ver landing
          </a>
          <a href={leadsApi.exportUrl(Number(id))}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-600 border border-white/[0.08] text-sm text-gray-300 hover:text-white transition-all">
            <Download size={14} /> Exportar CSV
          </a>
          <button onClick={() => { setShowBroadcast(true); setSendResult(null); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-all">
            <Send size={14} /> Enviar correo masivo
          </button>
        </div>
      </div>

      {/* Landing page URL */}
      <div className="card p-4 mb-5 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-0.5">Enlace de inscripción (comparte en redes sociales)</p>
          <p className="text-sm text-brand-400 font-mono truncate">{landingUrl}</p>
        </div>
        <button onClick={copyLink} className="btn-ghost px-3 py-2 text-xs flex items-center gap-1.5 flex-shrink-0">
          <Copy size={13} /> {copied ? 'Copiado ✓' : 'Copiar'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total', value: stats.total, color: 'text-white' },
          { label: 'Confirmados', value: stats.confirmados, color: 'text-blue-400' },
          { label: 'Pagados', value: stats.pagados, color: 'text-green-400' },
          { label: 'Pendientes', value: stats.pendientes, color: 'text-yellow-400' },
          { label: 'Recaudado', value: `$${stats.recaudado.toLocaleString('es-MX')}`, color: 'text-brand-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Leads table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Cargando inscritos...</div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={36} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-500">Aún no hay inscritos</p>
            <p className="text-xs text-gray-600 mt-1">Comparte el link del evento para empezar a recibir inscripciones</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.05]">
                {['Nombre', 'Email', 'Tel / Ciudad', 'Estado', 'Monto', 'Fecha', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-white/[0.03] hover:bg-surface-600/30 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-white">{lead.nombre} {lead.apellido}</td>
                  <td className="px-5 py-3 text-sm text-gray-400">{lead.email}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {lead.telefono && <div>{lead.telefono}</div>}
                    {lead.ciudad && <div>{lead.ciudad}</div>}
                  </td>
                  <td className="px-5 py-3">
                    <select value={lead.estado}
                      onChange={e => updateMutation.mutate({ leadId: lead.id, estado: e.target.value })}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium border-0 cursor-pointer ${estadoBadge[lead.estado] ?? estadoBadge.pendiente}`}
                      style={{ background: 'transparent' }}>
                      {['pendiente', 'confirmado', 'pagado', 'cancelado'].map(s => (
                        <option key={s} value={s} className="bg-surface-600 text-white">{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-sm font-bold text-white">
                    {lead.monto > 0 ? `$${lead.monto.toLocaleString('es-MX')}` : 'Gratis'}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {format(new Date(lead.createdAt), "d MMM", { locale: es })}
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => deleteMutation.mutate(lead.id)}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Broadcast modal */}
      {showBroadcast && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-lg animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-black text-white">Correo masivo</h2>
                <p className="text-xs text-gray-400 mt-0.5">{event?.nombre}</p>
              </div>
              <button onClick={() => setShowBroadcast(false)} className="btn-ghost p-2"><X size={18} /></button>
            </div>

            {sendResult ? (
              <div className={`p-6 rounded-xl text-center ${sendResult.ok ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                {sendResult.ok ? (
                  <>
                    <CheckCircle size={36} className="mx-auto text-green-400 mb-3" />
                    <p className="text-white font-bold">¡Correos enviados!</p>
                    <p className="text-gray-400 text-sm mt-1">{sendResult.sent} {sendResult.sent === 1 ? 'correo enviado' : 'correos enviados'} exitosamente</p>
                  </>
                ) : (
                  <>
                    <p className="text-red-400 font-bold">Error al enviar</p>
                    <p className="text-gray-400 text-sm mt-1">Verifica la configuración de email en el servidor</p>
                  </>
                )}
                <button onClick={() => setShowBroadcast(false)} className="mt-4 btn-primary px-6 py-2 text-sm">Cerrar</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Asunto del correo</label>
                  <input value={broadcast.subject} onChange={e => setBroadcast({ ...broadcast, subject: e.target.value })}
                    placeholder="Ej: Información importante sobre el evento" className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Mensaje</label>
                  <textarea value={broadcast.mensaje} onChange={e => setBroadcast({ ...broadcast, mensaje: e.target.value })}
                    rows={6} placeholder="Escribe aquí el mensaje para todos los inscritos..." className="input w-full resize-none" />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={broadcast.soloConfirmados}
                    onChange={e => setBroadcast({ ...broadcast, soloConfirmados: e.target.checked })}
                    className="w-4 h-4 rounded accent-brand-500" />
                  <span className="text-sm text-gray-300">Solo enviar a confirmados y pagados</span>
                </label>
                <div className="bg-surface-600 rounded-xl p-3 flex items-center gap-2">
                  <Clock size={14} className="text-brand-400 flex-shrink-0" />
                  <p className="text-xs text-gray-400">
                    Se enviará a <strong className="text-white">
                      {broadcast.soloConfirmados
                        ? `${stats.confirmados + stats.pagados} inscritos confirmados/pagados`
                        : `${stats.total} inscritos en total`}
                    </strong>
                  </p>
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setShowBroadcast(false)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
                  <button onClick={() => broadcastMutation.mutate(broadcast)} disabled={broadcastMutation.isPending || !broadcast.subject || !broadcast.mensaje}
                    className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
                    <Send size={14} />
                    {broadcastMutation.isPending ? 'Enviando...' : 'Enviar correos'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
