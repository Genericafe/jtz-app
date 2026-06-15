import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi, eventsApi, default as api } from '../services/api';
import { PLANTILLAS } from '../utils/emailTemplates';
import {
  ArrowLeft, Users, Send, Download, Copy, ExternalLink,
  CheckCircle, Sparkles, Mail, Route, Upload, Trash2,
  Calendar, MapPin, Trophy, Clock, FileSpreadsheet, X, ChevronDown,
  Share2, Instagram, Facebook, Shirt,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Row {
  key: string;
  nombre: string;
  email: string;
  telefono: string;
  ciudad: string;
  fechaNacimiento?: string;
  tallaPlayera?: string;
  estado: string;
  monto: number;
  fuente: string;
  utmSource?: string;
  utmMedium?: string;
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

const fuenteStyle: Record<string, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: 'bg-pink-500/15 text-pink-400' },
  facebook:  { label: 'Facebook',  color: 'bg-blue-500/15 text-blue-400' },
  whatsapp:  { label: 'WhatsApp',  color: 'bg-green-500/15 text-green-400' },
  app:       { label: 'App',       color: 'bg-brand-500/15 text-brand-400' },
  web:       { label: 'Web',       color: 'bg-gray-500/15 text-gray-400' },
};

function fuenteBadge(fuente: string) {
  const cfg = fuenteStyle[fuente] ?? { label: fuente || 'Web', color: 'bg-gray-500/15 text-gray-400' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
  );
}

// ── Share Panel ───────────────────────────────────────────────────────────────
function SharePanel({ landingUrl, eventNombre }: { landingUrl: string; eventNombre: string }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const channels = [
    {
      key: 'instagram',
      label: 'Instagram',
      icon: <Instagram size={15} />,
      color: 'bg-gradient-to-br from-pink-500 to-purple-600',
      utm: { utm_source: 'instagram', utm_medium: 'story' },
    },
    {
      key: 'facebook',
      label: 'Facebook',
      icon: <Facebook size={15} />,
      color: 'bg-blue-600',
      utm: { utm_source: 'facebook', utm_medium: 'post' },
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: <span className="text-sm">💬</span>,
      color: 'bg-green-600',
      utm: { utm_source: 'whatsapp', utm_medium: 'message' },
    },
  ];

  const buildUrl = (utm: Record<string, string>) => {
    const params = new URLSearchParams(utm).toString();
    return `${landingUrl}?${params}`;
  };

  const copyLink = (key: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const shareWhatsApp = (url: string) => {
    const text = encodeURIComponent(`¡Inscríbete al ${eventNombre}! 🏃\n${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: eventNombre, text: `¡Inscríbete al ${eventNombre}!`, url: landingUrl });
      } catch { /* cancelled */ }
    } else {
      copyLink('native', landingUrl);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Share2 size={16} className="text-brand-400" />
        <h2 className="text-sm font-bold text-white">Compartir evento</h2>
        <span className="text-xs text-gray-500 ml-1">· Cada canal tiene su propio link con seguimiento</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {channels.map(ch => {
          const url = buildUrl(ch.utm);
          const isCopied = copiedKey === ch.key;
          return (
            <div key={ch.key} className="bg-surface-800 rounded-xl border border-white/[0.06] overflow-hidden">
              <div className={`flex items-center gap-2 px-3 py-2 ${ch.color}`}>
                <span className="text-white">{ch.icon}</span>
                <span className="text-white text-xs font-bold">{ch.label}</span>
              </div>
              <div className="p-3 space-y-2">
                <p className="text-[10px] text-gray-500 font-mono break-all leading-relaxed">
                  ...{new URLSearchParams(ch.utm).toString()}
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => copyLink(ch.key, url)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isCopied ? 'bg-green-500/20 text-green-400' : 'bg-surface-600 text-gray-300 hover:text-white'
                    }`}>
                    {isCopied ? <><CheckCircle size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
                  </button>
                  {ch.key === 'whatsapp' ? (
                    <button onClick={() => shareWhatsApp(url)}
                      className="flex items-center justify-center px-2 py-1.5 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-all">
                      <ExternalLink size={11} />
                    </button>
                  ) : (
                    <button onClick={() => copyLink(ch.key + '-open', url)}
                      className="flex items-center justify-center px-2 py-1.5 rounded-lg bg-surface-600 text-gray-400 hover:text-white transition-all">
                      <ExternalLink size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 flex-wrap pt-1 border-t border-white/[0.05]">
        <button
          onClick={() => copyLink('base', landingUrl)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
            copiedKey === 'base'
              ? 'bg-green-500/15 border-green-500/30 text-green-400'
              : 'bg-surface-600 border-white/[0.08] text-gray-300 hover:text-white'
          }`}>
          {copiedKey === 'base' ? <><CheckCircle size={12} /> Copiado</> : <><Copy size={12} /> Link base (sin UTM)</>}
        </button>
        <button onClick={shareNative}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500/15 border border-brand-500/25 text-brand-400 text-xs font-semibold hover:bg-brand-500/25 transition-all">
          <Share2 size={12} /> Compartir desde el teléfono
        </button>
        <a href={landingUrl} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-600 border border-white/[0.08] text-xs text-gray-300 hover:text-white transition-all">
          <ExternalLink size={12} /> Ver landing
        </a>
      </div>

      <p className="text-xs text-gray-600">
        Cuando alguien se inscriba por un link con UTM, verás el canal en la columna <strong className="text-gray-400">Canal</strong> de la tabla de inscritos.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EventLeads() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [emailSubject, setEmailSubject] = useState('');
  const [emailMensaje, setEmailMensaje] = useState('');
  const [soloConfirmados, setSoloConfirmados] = useState(true);
  const [sendResult, setSendResult] = useState<'idle' | 'ok' | 'error'>('idle');
  const [sentCount, setSentCount] = useState(0);
  const [plantillaOpen, setPlantillaOpen] = useState(false);
  const [gpxStatus, setGpxStatus] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle');

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
      runner: { nombre: string; apellido: string; telefono?: string; ciudad?: string; fechaNacimiento?: string; user?: { email: string } };
      pagado: boolean; estado: string; createdAt: string;
      tallaPlayera?: string; fechaNacimiento?: string;
    }) => ({
      key: `app-${r.id}`,
      nombre: `${r.runner.nombre} ${r.runner.apellido}`,
      email: r.runner.user?.email ?? '',
      telefono: r.runner.telefono ?? '',
      ciudad: r.runner.ciudad ?? '',
      fechaNacimiento: r.fechaNacimiento ?? r.runner.fechaNacimiento,
      tallaPlayera: r.tallaPlayera,
      estado: r.pagado ? 'pagado' : (r.estado ?? 'inscrito'),
      monto: r.pagado ? (detail?.precio ?? 0) : 0,
      fuente: 'app',
      fecha: r.createdAt,
    }))),
    ...((detail?.leads ?? []).map((l: {
      id: number; nombre: string; apellido: string; email: string;
      telefono?: string; ciudad?: string; fechaNacimiento?: string; tallaPlayera?: string;
      estado: string; monto: number; createdAt: string;
      fuente?: string; utmSource?: string; utmMedium?: string;
    }) => ({
      key: `lead-${l.id}`,
      nombre: `${l.nombre} ${l.apellido}`,
      email: l.email,
      telefono: l.telefono ?? '',
      ciudad: l.ciudad ?? '',
      fechaNacimiento: l.fechaNacimiento,
      tallaPlayera: l.tallaPlayera,
      estado: l.estado,
      monto: l.monto,
      fuente: l.fuente ?? 'web',
      utmSource: l.utmSource,
      utmMedium: l.utmMedium,
      fecha: l.createdAt,
      leadId: l.id,
    }))),
  ];

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

  // Stats por canal
  const canalStats = uniqueRows.reduce<Record<string, number>>((acc, r) => {
    const key = r.fuente || 'web';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  // Stats de tallas
  const ORDEN_TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const tallaStats = ORDEN_TALLAS.map(t => ({
    talla: t,
    count: uniqueRows.filter(r => r.tallaPlayera === t).length,
  }));
  const totalConTalla = uniqueRows.filter(r => r.tallaPlayera).length;
  const sinTalla = uniqueRows.filter(r => !r.tallaPlayera).length;

  const downloadCSV = () => {
    if (!rows.length) return;
    const headers = ['Nombre', 'Email', 'Teléfono', 'Ciudad', 'Fecha Nac.', 'Talla', 'Estado', 'Monto (MXN)', 'Canal', 'UTM Source', 'UTM Medium', 'Fecha inscripción'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvRows = uniqueRows.map(r => [
      r.nombre, r.email, r.telefono, r.ciudad,
      r.fechaNacimiento ? format(new Date(r.fechaNacimiento), 'd/MM/yyyy') : '',
      r.tallaPlayera ?? '',
      r.estado, r.monto,
      r.fuente, r.utmSource ?? '', r.utmMedium ?? '',
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
      nombre: event.nombre, fecha: event.fecha, lugar: event.lugar,
      ciudad: event.ciudad, estado: event.estado,
      distanciaKm: event.distanciaKm, precio: event.precio,
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

      <button onClick={() => navigate('/eventos')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors">
        <ArrowLeft size={15} /> Volver a eventos
      </button>

      {/* Event header */}
      {event && (
        <div className="card p-4 lg:p-5">
          <h1 className="text-xl lg:text-2xl font-black text-white leading-tight mb-2">{event.nombre}</h1>
          <div className="flex flex-col gap-1 mb-4 text-sm text-gray-400">
            <span className="flex items-center gap-1.5">
              <Calendar size={13} className="flex-shrink-0" />
              <span className="capitalize">{format(new Date(event.fecha), "EEEE d 'de' MMMM · HH:mm 'hrs'", { locale: es })}</span>
              <span className="text-gray-600 text-xs whitespace-nowrap">({formatDistanceToNow(new Date(event.fecha), { locale: es, addSuffix: true })})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin size={13} className="flex-shrink-0" />
              {event.lugar}{event.ciudad ? `, ${event.ciudad}` : ''}
            </span>
            {event.distanciaKm && (
              <span className="flex items-center gap-1.5">
                <Trophy size={13} className="flex-shrink-0" /> {event.distanciaKm} km
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={downloadCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-600 border border-white/[0.08] text-xs text-gray-300 hover:text-white transition-all">
              <FileSpreadsheet size={12} /> Exportar CSV
            </button>
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

      {/* Canal breakdown */}
      {Object.keys(canalStats).length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Inscripciones por canal</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(canalStats).sort((a, b) => b[1] - a[1]).map(([canal, count]) => {
              const cfg = fuenteStyle[canal] ?? { label: canal, color: 'bg-gray-500/15 text-gray-400' };
              return (
                <div key={canal} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${cfg.color} bg-opacity-20`}>
                  <span className="text-xs font-bold">{cfg.label}</span>
                  <span className="text-xs font-black">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tallas de playera */}
      {totalConTalla > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Shirt size={15} className="text-brand-400" /> Tallas de playera
            </h2>
            <span className="text-xs text-gray-500">
              {totalConTalla} de {stats.total} registraron talla
            </span>
          </div>

          <div className="space-y-2.5">
            {tallaStats.map(({ talla, count }) => (
              <div key={talla} className="flex items-center gap-3">
                <span className="text-xs font-black text-white w-8 flex-shrink-0">{talla}</span>
                <div className="flex-1 bg-surface-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-brand-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: totalConTalla > 0 ? `${(count / totalConTalla) * 100}%` : '0%' }}
                  />
                </div>
                <span className={`text-sm font-black w-6 text-right flex-shrink-0 ${count > 0 ? 'text-white' : 'text-gray-700'}`}>
                  {count}
                </span>
              </div>
            ))}
          </div>

          {/* Resumen de pedido */}
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Resumen para pedir al proveedor</p>
            <div className="flex flex-wrap gap-2">
              {tallaStats.filter(t => t.count > 0).map(({ talla, count }) => (
                <div key={talla} className="flex items-center gap-1.5 bg-surface-700 border border-white/[0.08] rounded-xl px-3 py-2">
                  <span className="text-xs font-bold text-white">{talla}</span>
                  <span className="text-brand-400 font-black text-sm">×{count}</span>
                </div>
              ))}
            </div>
          </div>

          {sinTalla > 0 && (
            <p className="text-xs text-yellow-400 mt-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2">
              ⚠️ {sinTalla} inscrito{sinTalla > 1 ? 's' : ''} aún sin talla registrada — recuérdales completar su registro
            </p>
          )}
        </div>
      )}

      {/* Share panel */}
      {event && <SharePanel landingUrl={landingUrl} eventNombre={event.nombre} />}

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
              <table className="w-full text-sm">
                <thead className="bg-surface-800/60 border-b border-white/[0.05]">
                  <tr>
                    {['Nombre', 'Email', 'Teléfono', 'Talla', 'Fecha Nac.', 'Estado', 'Monto', 'Canal', 'Fecha', ''].map(h => (
                      <th key={h} className="text-left text-xs font-bold text-gray-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uniqueRows.map(row => (
                    <tr key={row.key} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{row.nombre}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[140px] truncate">{row.email || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{row.telefono || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {row.tallaPlayera
                          ? <span className="text-xs font-bold bg-surface-600 text-white px-2 py-0.5 rounded-lg">{row.tallaPlayera}</span>
                          : <span className="text-gray-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {row.fechaNacimiento ? format(new Date(row.fechaNacimiento), 'd/MM/yyyy') : '—'}
                      </td>
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
                      <td className="px-4 py-3 whitespace-nowrap">{fuenteBadge(row.fuente)}</td>
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
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {row.tallaPlayera && (
                      <span className="bg-surface-600 text-white px-2 py-0.5 rounded-lg font-bold">{row.tallaPlayera}</span>
                    )}
                    {row.fechaNacimiento && (
                      <span>{format(new Date(row.fechaNacimiento), 'd/MM/yyyy')}</span>
                    )}
                    {fuenteBadge(row.fuente)}
                    <span className="font-bold text-white ml-auto">
                      {row.monto > 0 ? `$${row.monto.toLocaleString('es-MX')}` : 'Gratis'}
                    </span>
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
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Asunto</label>
            <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
              placeholder="Asunto del correo…" className="input w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Mensaje</label>
            <textarea value={emailMensaje} onChange={e => setEmailMensaje(e.target.value)}
              rows={8} placeholder="Elige una plantilla o escribe el mensaje aquí…"
              className="input w-full text-sm resize-none font-mono" />
          </div>
        </div>

        {sendResult === 'ok' && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
            <p className="text-sm text-green-300">¡Listo! Se enviaron <strong>{sentCount}</strong> correos exitosamente.</p>
            <button onClick={() => setSendResult('idle')} className="ml-auto text-gray-500 hover:text-white"><X size={14} /></button>
          </div>
        )}
        {sendResult === 'error' && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">Error al enviar. Verifica la configuración de email.</p>
          </div>
        )}

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
