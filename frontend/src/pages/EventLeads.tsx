import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi, eventsApi, default as api } from '../services/api';
import { PLANTILLAS } from '../utils/emailTemplates';
import {
  ArrowLeft, Users, Send, Download, Copy, ExternalLink,
  CheckCircle, Sparkles, Mail, Route, Upload, Trash2,
  Calendar, MapPin, Trophy, Clock, FileSpreadsheet, X, ChevronDown,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Row {
  key: string;
  nombre: string;
  email: string;
  telefono: string;
  ciudad: string;
  estado: string;
  monto: number;
  fuente: 'App' | 'Landing';
  fecha: string;
  leadId?: number;
}

const estadoStyle: Record<string, string> = {
  pagado:     'bg-green-500/15 text-green-400',
  confirmado: 'bg-blue-500/15 text-blue-400',
  pendiente:  'bg-yellow-500/15 text-yellow-400',
  cancelado:  'bg-red-500/15 text-red-400',
  inscrito:   'bg-brand-500/15 text-brand-400',
};

export default function EventLeads() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Email composer state
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMensaje, setEmailMensaje] = useState('');
  const [soloConfirmados, setSoloConfirmados] = useState(true);
  const [sendResult, setSendResult] = useState<'idle' | 'ok' | 'error'>('idle');
  const [sentCount, setSentCount] = useState(0);
  const [plantillaOpen, setPlantillaOpen] = useState(false);

  // GPX state
  const [gpxStatus, setGpxStatus] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle');

  // Copy link
  const [copied, setCopied] = useState(false);

  const downloadCSV = () => {
    if (!rows.length) return;
    const headers = ['Nombre', 'Email', 'Teléfono', 'Ciudad', 'Estado', 'Monto (MXN)', 'Fuente', 'Fecha'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvRows = rows.map(r => [
      r.nombre, r.email, r.telefono, r.ciudad, r.estado, r.monto, r.fuente,
      format(new Date(r.fecha), "d/MM/yyyy HH:mm", { locale: es }),
    ].map(escape).join(','));
    const csv = '﻿' + [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(event?.nombre ?? 'inscritos').replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const { data: eventData, isLoading } = useQuery({
    queryKey: ['event-detail', id],
    queryFn: () => eventsApi.get(Number(id)),
  });

  const detail = eventData?.data;
  const event = detail;

  // Unify registros (app) + leads (landing) into one array
  const rows: Row[] = [
    ...((detail?.registros ?? []).map((r: {
      id: number;
      runner: { nombre: string; apellido: string; telefono?: string; ciudad?: string; user?: { email: string } };
      pagado: boolean; estado: string; createdAt: string;
    }) => ({
      key: `app-${r.id}`,
      nombre: `${r.runner.nombre} ${r.runner.apellido}`,
      email: r.runner.user?.email ?? '',
      telefono: r.runner.telefono ?? '',
      ciudad: r.runner.ciudad ?? '',
      estado: r.pagado ? 'pagado' : (r.estado ?? 'inscrito'),
      monto: r.pagado ? (detail?.precio ?? 0) : 0,
      fuente: 'App' as const,
      fecha: r.createdAt,
    }))),
    ...((detail?.leads ?? []).map((l: {
      id: number; nombre: string; apellido: string; email: string;
      telefono?: string; ciudad?: string; estado: string; monto: number; createdAt: string;
    }) => ({
      key: `lead-${l.id}`,
      nombre: `${l.nombre} ${l.apellido}`,
      email: l.email,
      telefono: l.telefono ?? '',
      ciudad: l.ciudad ?? '',
      estado: l.estado,
      monto: l.monto,
      fuente: 'Landing' as const,
      fecha: l.createdAt,
      leadId: l.id,
    }))),
  ];

  // Deduplicate by email (App takes priority)
  const seen = new Set<string>();
  const uniqueRows = rows.filter(r => {
    if (!r.email || seen.has(r.email)) return false;
    seen.add(r.email);
    return true;
  });

  const stats = {
    total: uniqueRows.length,
    pagados: uniqueRows.filter(r => r.estado === 'pagado').length,
    confirmados: uniqueRows.filter(r => r.estado === 'confirmado').length,
    pendientes: uniqueRows.filter(r => r.estado === 'pendiente').length,
    recaudado: uniqueRows.filter(r => r.estado === 'pagado').reduce((s, r) => s + r.monto, 0),
    destinatarios: soloConfirmados
      ? uniqueRows.filter(r => r.estado === 'pagado' || r.estado === 'confirmado').length
      : uniqueRows.length,
  };

  const deleteMutation = useMutation({
    mutationFn: (leadId: number) => leadsApi.delete(leadId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-detail', id] }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ leadId, estado }: { leadId: number; estado: string }) =>
      leadsApi.updateStatus(leadId, estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['event-detail', id] }),
  });

  const broadcastMutation = useMutation({
    mutationFn: () => leadsApi.broadcast(Number(id), {
      subject: emailSubject, mensaje: emailMensaje, soloConfirmados,
    }),
    onSuccess: (res) => {
      setSentCount(res.data.sent ?? 0);
      setSendResult('ok');
      setEmailSubject('');
      setEmailMensaje('');
    },
    onError: () => setSendResult('error'),
  });

  const aplicarPlantilla = (plantillaId: string) => {
    if (!event) return;
    const p = PLANTILLAS.find(t => t.id === plantillaId);
    if (!p) return;
    const { asunto, mensaje } = p.generar({
      nombre: event.nombre,
      fecha: event.fecha,
      lugar: event.lugar,
      ciudad: event.ciudad,
      estado: event.estado,
      distanciaKm: event.distanciaKm,
      precio: event.precio,
    });
    setEmailSubject(asunto);
    setEmailMensaje(mensaje);
    setPlantillaOpen(false);
  };

  const uploadGpx = async (file: File) => {
    setGpxStatus('uploading');
    try {
      const content = await file.text();
      await api.post(`/events/${id}/gpx`, { gpxContent: content, gpxNombre: file.name });
      setGpxStatus('ok');
      qc.invalidateQueries({ queryKey: ['event-detail', id] });
      setTimeout(() => setGpxStatus('idle'), 4000);
    } catch {
      setGpxStatus('error');
    }
  };

  const landingUrl = `${window.location.origin}/evento/${id}`;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">

      {/* Back */}
      <button onClick={() => navigate('/eventos')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors">
        <ArrowLeft size={15} /> Volver a eventos
      </button>

      {/* Event header card */}
      {event && (
        <div className="card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-white truncate">{event.nombre}</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} />
                  {format(new Date(event.fecha), "EEEE d 'de' MMMM · HH:mm 'hrs'", { locale: es })}
                  <span className="text-gray-600 text-xs">({formatDistanceToNow(new Date(event.fecha), { locale: es, addSuffix: true })})</span>
                </span>
                <span className="flex items-center gap-1.5"><MapPin size={13} /> {event.lugar}{event.ciudad ? `, ${event.ciudad}` : ''}</span>
                {event.distanciaKm && <span className="flex items-center gap-1.5"><Trophy size={13} /> {event.distanciaKm} km</span>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap flex-shrink-0">
              <button onClick={() => { navigator.clipboard.writeText(landingUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-600 border border-white/[0.08] text-xs text-gray-300 hover:text-white transition-all">
                {copied ? <><CheckCircle size={12} className="text-green-400" /> Copiado</> : <><Copy size={12} /> Copiar link</>}
              </button>
              <a href={landingUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-600 border border-white/[0.08] text-xs text-gray-300 hover:text-white transition-all">
                <ExternalLink size={12} /> Landing
              </a>
              <button onClick={downloadCSV}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-600 border border-white/[0.08] text-xs text-gray-300 hover:text-white transition-all">
                <FileSpreadsheet size={12} /> CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total inscritos', value: stats.total, color: 'text-white' },
          { label: 'Pagados', value: stats.pagados, color: 'text-green-400' },
          { label: 'Confirmados', value: stats.confirmados, color: 'text-blue-400' },
          { label: 'Pendientes', value: stats.pendientes, color: 'text-yellow-400' },
          { label: 'Recaudado', value: `$${stats.recaudado.toLocaleString('es-MX')}`, color: 'text-brand-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* GPX upload */}
      <div className="card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Route size={15} className="text-brand-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">Ruta GPX del evento</p>
              <p className="text-xs text-gray-500">{event?.gpxNombre ?? 'Sin archivo GPX — solo los inscritos pagados podrán descargarlo'}</p>
            </div>
          </div>
          <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
            gpxStatus === 'uploading' ? 'opacity-50' :
            'bg-brand-500/10 text-brand-400 border-brand-500/20 hover:bg-brand-500/20'
          }`}>
            <Upload size={13} />
            {gpxStatus === 'uploading' ? 'Subiendo…' : event?.gpxNombre ? 'Reemplazar GPX' : 'Subir GPX'}
            <input type="file" accept=".gpx" className="hidden"
              onChange={e => e.target.files?.[0] && uploadGpx(e.target.files[0])}
              disabled={gpxStatus === 'uploading'} />
          </label>
        </div>
        {gpxStatus === 'ok' && <p className="text-xs text-green-400 mt-2">✓ GPX subido y enviado por correo a todos los inscritos pagados</p>}
        {gpxStatus === 'error' && <p className="text-xs text-red-400 mt-2">Error al subir el archivo. Intenta de nuevo.</p>}
      </div>

      {/* Participants table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Users size={15} className="text-brand-400" /> Inscritos
            <span className="text-xs font-normal text-gray-500 ml-1">{uniqueRows.length} total</span>
          </h2>
        </div>

        {uniqueRows.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={36} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-500 text-sm">Aún no hay inscritos</p>
            <p className="text-xs text-gray-600 mt-1">Comparte el link del evento para empezar a recibir inscripciones</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-surface-800/60 border-b border-white/[0.05]">
                  <tr>
                    {['Nombre', 'Email', 'Teléfono', 'Ciudad', 'Estado', 'Monto', 'Fuente', 'Fecha', ''].map(h => (
                      <th key={h} className="text-left text-xs font-bold text-gray-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uniqueRows.map(row => (
                    <tr key={row.key} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{row.nombre}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate">{row.email || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{row.telefono || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{row.ciudad || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.leadId ? (
                          <select value={row.estado}
                            onChange={e => updateStatusMutation.mutate({ leadId: row.leadId!, estado: e.target.value })}
                            className={`text-xs px-2.5 py-1 rounded-full font-semibold border-0 cursor-pointer bg-transparent ${estadoStyle[row.estado] ?? estadoStyle.pendiente}`}
                            style={{ background: 'transparent' }}>
                            {['pendiente', 'confirmado', 'pagado', 'cancelado'].map(s => (
                              <option key={s} value={s} className="bg-surface-700 text-white">{s}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${estadoStyle[row.estado] ?? estadoStyle.inscrito}`}>
                            {row.estado}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">
                        {row.monto > 0
                          ? <span className="text-white">${row.monto.toLocaleString('es-MX')}</span>
                          : <span className="text-green-400 text-xs">Gratis</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          row.fuente === 'App' ? 'bg-brand-500/15 text-brand-400' : 'bg-purple-500/15 text-purple-400'
                        }`}>{row.fuente}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {format(new Date(row.fecha), "d MMM yyyy", { locale: es })}
                      </td>
                      <td className="px-4 py-3">
                        {row.leadId && (
                          <button onClick={() => deleteMutation.mutate(row.leadId!)}
                            className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.04]">
              {uniqueRows.map(row => (
                <div key={row.key} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white text-sm truncate">{row.nombre}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${estadoStyle[row.estado] ?? estadoStyle.inscrito}`}>
                      {row.estado}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{row.email}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{row.telefono || '—'} · {row.ciudad || '—'}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        row.fuente === 'App' ? 'bg-brand-500/15 text-brand-400' : 'bg-purple-500/15 text-purple-400'
                      }`}>{row.fuente}</span>
                      <span className="font-bold text-white">{row.monto > 0 ? `$${row.monto.toLocaleString('es-MX')}` : 'Gratis'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Email masivo */}
      <div className="card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-brand-400" />
          <h2 className="text-sm font-bold text-white">Correo masivo a inscritos</h2>
        </div>

        {/* Destinatarios */}
        <div className="flex gap-3">
          {[
            { key: true, label: `Solo pagados y confirmados (${stats.pagados + stats.confirmados})` },
            { key: false, label: `Todos los inscritos (${stats.total})` },
          ].map(({ key, label }) => (
            <button key={String(key)} onClick={() => setSoloConfirmados(key)}
              className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-medium transition-all ${
                soloConfirmados === key
                  ? 'bg-brand-500/15 border-brand-500/40 text-white'
                  : 'bg-surface-600 border-white/[0.06] text-gray-400 hover:text-white'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Selector de plantilla */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-400">Plantilla de mensaje</label>
            {(emailSubject || emailMensaje) && (
              <button onClick={() => { setEmailSubject(''); setEmailMensaje(''); }}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                Limpiar
              </button>
            )}
          </div>

          {/* Dropdown */}
          <div className="relative">
            <button onClick={() => setPlantillaOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-surface-600 border border-white/[0.08] text-sm text-gray-300 hover:text-white hover:border-brand-500/30 transition-all">
              <span className="flex items-center gap-2">
                <Sparkles size={14} className="text-brand-400" />
                Elegir plantilla para generar el mensaje…
              </span>
              <ChevronDown size={14} className={`transition-transform ${plantillaOpen ? 'rotate-180' : ''}`} />
            </button>

            {plantillaOpen && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-surface-700 border border-white/[0.1] rounded-xl shadow-xl overflow-hidden">
                {PLANTILLAS.map(p => (
                  <button key={p.id} onClick={() => aplicarPlantilla(p.id)}
                    className="w-full text-left px-4 py-3 hover:bg-surface-600 transition-colors border-b border-white/[0.04] last:border-0 flex items-start gap-3">
                    <span className="text-xl flex-shrink-0 mt-0.5">{p.emoji}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{p.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.descripcion}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1.5">
            La plantilla se rellena automáticamente con los datos del evento. Puedes editar el texto antes de enviar.
          </p>
        </div>

        {/* Subject + Body */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Asunto</label>
            <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
              placeholder="Asunto del correo…"
              className="input w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Mensaje</label>
            <textarea value={emailMensaje} onChange={e => setEmailMensaje(e.target.value)}
              rows={8} placeholder="Elige una plantilla o escribe el mensaje aquí…"
              className="input w-full text-sm resize-none font-mono" />
          </div>
        </div>

        {/* Send result */}
        {sendResult === 'ok' && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
            <p className="text-sm text-green-300">
              ¡Listo! Se enviaron <strong>{sentCount}</strong> correos exitosamente.
            </p>
            <button onClick={() => setSendResult('idle')} className="ml-auto text-gray-500 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}
        {sendResult === 'error' && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">Error al enviar. Verifica la configuración de email.</p>
          </div>
        )}

        {/* Send button */}
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-700 border border-white/[0.06]">
            <Clock size={13} className="text-brand-400 flex-shrink-0" />
            <p className="text-xs text-gray-400">
              Se enviará a <strong className="text-white">{stats.destinatarios} corredores</strong>
            </p>
          </div>
          <button
            onClick={() => { setSendResult('idle'); broadcastMutation.mutate(); }}
            disabled={broadcastMutation.isPending || !emailSubject || !emailMensaje || stats.destinatarios === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl btn-primary text-sm font-semibold disabled:opacity-50 transition-all">
            <Send size={14} />
            {broadcastMutation.isPending ? 'Enviando…' : 'Enviar correos'}
          </button>
        </div>
      </div>
    </div>
  );
}
