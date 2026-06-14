import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { integrationsApi } from '../services/api';
import {
  Activity, Plus, RefreshCw, Trash2, CheckCircle, AlertTriangle,
  Zap, Heart, Flame, TrendingUp, Clock, Route, Upload, X, Link, LinkOff,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const TIPOS = [
  { id: 'correr',    label: 'Correr',    emoji: '🏃' },
  { id: 'trail',     label: 'Trail',     emoji: '🏔️' },
  { id: 'ciclismo',  label: 'Ciclismo',  emoji: '🚴' },
  { id: 'natacion',  label: 'Natación',  emoji: '🏊' },
  { id: 'otro',      label: 'Otro',      emoji: '💪' },
];

const FUENTE_BADGE: Record<string, string> = {
  strava:  'bg-orange-500/15 text-orange-400',
  gpx:     'bg-blue-500/15 text-blue-400',
  manual:  'bg-gray-500/15 text-gray-400',
};

interface Activity {
  id: number; nombre?: string; tipo: string; fuente: string;
  fecha: string; distanciaKm?: number; duracionMin?: number;
  ritmoMinKm?: number; fcPromedio?: number; fcMax?: number;
  elevacionM?: number; caloriasKcal?: number; potenciaW?: number; notas?: string;
}

function fmtPace(minKm?: number) {
  if (!minKm) return '—';
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')} /km`;
}

function fmtDuration(min?: number) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

export default function MyActivities() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nombre: '', tipo: 'correr', fecha: new Date().toISOString().slice(0, 16),
    distanciaKm: '', duracionMin: '', fcPromedio: '', fcMax: '',
    elevacionM: '', caloriasKcal: '', notas: '',
  });

  // Handle Strava redirect
  useEffect(() => {
    const ok    = searchParams.get('strava_ok');
    const error = searchParams.get('strava_error');
    if (ok) {
      setSyncMsg('✓ Strava conectado correctamente');
      qc.invalidateQueries({ queryKey: ['strava-status'] });
      setSearchParams({}, { replace: true });
      syncStrava();
    } else if (error) {
      const msgs: Record<string, string> = {
        acceso_denegado: 'Cancelaste la conexión con Strava.',
        fallo_token: 'Error al conectar con Strava. Intenta de nuevo.',
      };
      setSyncMsg(`⚠ ${msgs[error] ?? `Error: ${error}`}`);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const { data: statusData } = useQuery({
    queryKey: ['strava-status'],
    queryFn: () => integrationsApi.stravaStatus(),
  });
  const status = statusData?.data as { configured: boolean; connected: boolean } | undefined;

  const { data: activitiesData, isLoading } = useQuery({
    queryKey: ['my-activities'],
    queryFn: () => integrationsApi.getActivities(),
  });
  const activities: Activity[] = activitiesData?.data ?? [];

  const logMutation = useMutation({
    mutationFn: (d: object) => integrationsApi.logActivity(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-activities'] }); setShowForm(false); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => integrationsApi.deleteActivity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-activities'] }),
  });

  const resetForm = () => setForm({
    nombre: '', tipo: 'correr', fecha: new Date().toISOString().slice(0, 16),
    distanciaKm: '', duracionMin: '', fcPromedio: '', fcMax: '',
    elevacionM: '', caloriasKcal: '', notas: '',
  });

  const connectStrava = async () => {
    try {
      const res = await integrationsApi.stravaConnect();
      window.location.href = res.data.url;
    } catch (err: any) {
      setSyncMsg(`⚠ ${err.response?.data?.error ?? 'Error al conectar'}`);
    }
  };

  const disconnectStrava = async () => {
    await integrationsApi.stravaDisconnect();
    qc.invalidateQueries({ queryKey: ['strava-status'] });
    setSyncMsg('Strava desconectado.');
  };

  const syncStrava = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await integrationsApi.stravaSync();
      setSyncMsg(`✓ ${res.data.imported} actividades importadas de Strava`);
      qc.invalidateQueries({ queryKey: ['my-activities'] });
    } catch (err: any) {
      setSyncMsg(`⚠ ${err.response?.data?.error ?? 'Error al sincronizar'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleGpxFile = async (file: File) => {
    const content = await file.text();
    // Extract basic info from GPX
    const distMatch = content.match(/<extensions>[\s\S]*?<\/extensions>/);
    const nameMatch = content.match(/<name>(.*?)<\/name>/);
    logMutation.mutate({
      tipo: 'correr',
      nombre: nameMatch?.[1] ?? file.name.replace('.gpx', ''),
      fecha: new Date().toISOString(),
      gpxContent: content,
      gpxNombre: file.name,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const distKm  = form.distanciaKm ? Number(form.distanciaKm) : undefined;
    const durMin  = form.duracionMin  ? Number(form.duracionMin)  : undefined;
    logMutation.mutate({
      nombre:       form.nombre || undefined,
      tipo:         form.tipo,
      fecha:        form.fecha,
      distanciaKm:  distKm,
      duracionMin:  durMin,
      fcPromedio:   form.fcPromedio   ? Number(form.fcPromedio)   : undefined,
      fcMax:        form.fcMax        ? Number(form.fcMax)        : undefined,
      elevacionM:   form.elevacionM   ? Number(form.elevacionM)   : undefined,
      caloriasKcal: form.caloriasKcal ? Number(form.caloriasKcal) : undefined,
      notas:        form.notas || undefined,
    });
  };

  const tipoEmoji = (t: string) => TIPOS.find(x => x.id === t)?.emoji ?? '💪';

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Mis actividades</h1>
          <p className="text-gray-500 text-sm mt-0.5">Historial de entrenamientos y carreras</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
          <Plus size={15} /> Registrar
        </button>
      </div>

      {/* Strava connection card */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="#FC4C02" className="w-5 h-5">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-white">Strava</p>
              <p className="text-xs text-gray-500">
                {status?.connected
                  ? 'Conectado — tus actividades se importan automáticamente'
                  : 'Conecta para importar actividades de Garmin, Apple Watch, etc.'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {status?.connected ? (
              <>
                <button onClick={syncStrava} disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/20 text-xs font-semibold hover:bg-orange-500/25 transition-all disabled:opacity-50">
                  <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Sincronizando…' : 'Sincronizar'}
                </button>
                <button onClick={disconnectStrava}
                  className="p-2 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all">
                  <LinkOff size={15} />
                </button>
              </>
            ) : (
              <button onClick={connectStrava}
                disabled={status?.configured === false}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all disabled:opacity-40">
                <Link size={13} />
                {status?.configured === false ? 'No configurado' : 'Conectar Strava'}
              </button>
            )}
          </div>
        </div>

        {syncMsg && (
          <p className={`text-xs mt-3 px-3 py-2 rounded-lg ${
            syncMsg.startsWith('✓') ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
          }`}>{syncMsg}</p>
        )}

        {!status?.configured && (
          <p className="text-xs text-gray-600 mt-3">
            El coach necesita agregar <code className="bg-surface-600 px-1 rounded">STRAVA_CLIENT_ID</code> y <code className="bg-surface-600 px-1 rounded">STRAVA_CLIENT_SECRET</code> en Railway para habilitar la integración.
          </p>
        )}

        {/* Other platforms note */}
        <div className="mt-4 pt-4 border-t border-white/[0.05] flex flex-wrap gap-2">
          {[
            { name: 'Garmin', note: 'Sincroniza a Strava automáticamente' },
            { name: 'Apple Watch', note: 'Exporta a Strava o usa GPX' },
            { name: 'Polar / Suunto', note: 'Sincroniza a Strava automáticamente' },
            { name: 'COROS', note: 'Sincroniza a Strava automáticamente' },
          ].map(p => (
            <div key={p.name} className="flex items-center gap-1.5 text-xs text-gray-500 bg-surface-700 px-2.5 py-1.5 rounded-lg">
              <CheckCircle size={11} className="text-gray-600 flex-shrink-0" />
              <span><strong className="text-gray-400">{p.name}</strong> — {p.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* GPX drop zone */}
      <label className="card p-4 border-dashed border-white/[0.12] flex items-center gap-3 cursor-pointer hover:border-brand-500/40 hover:bg-brand-500/5 transition-all">
        <Upload size={18} className="text-brand-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-white">Subir archivo GPX</p>
          <p className="text-xs text-gray-500">Exporta el GPX desde tu app y súbelo aquí</p>
        </div>
        <input ref={fileRef} type="file" accept=".gpx" className="hidden"
          onChange={e => e.target.files?.[0] && handleGpxFile(e.target.files[0])} />
      </label>

      {/* Activity list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="card p-8 text-center text-gray-500">Cargando actividades…</div>
        ) : activities.length === 0 ? (
          <div className="card p-10 text-center">
            <span className="text-4xl block mb-3">🏃</span>
            <p className="text-gray-400 font-semibold">Sin actividades registradas</p>
            <p className="text-gray-600 text-sm mt-1">Conecta Strava o registra manualmente tu primer entrenamiento</p>
          </div>
        ) : (
          activities.map(a => (
            <div key={a.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-surface-700 flex items-center justify-center text-xl flex-shrink-0">
                    {tipoEmoji(a.tipo)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-sm truncate">
                      {a.nombre ?? TIPOS.find(t => t.id === a.tipo)?.label ?? a.tipo}
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(a.fecha), "d 'de' MMMM yyyy", { locale: es })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${FUENTE_BADGE[a.fuente] ?? FUENTE_BADGE.manual}`}>
                    {a.fuente === 'strava' ? 'Strava' : a.fuente === 'gpx' ? 'GPX' : 'Manual'}
                  </span>
                  <button onClick={() => { if (confirm('¿Eliminar actividad?')) deleteMutation.mutate(a.id); }}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
                {a.distanciaKm != null && (
                  <div className="bg-surface-700 rounded-xl p-2.5 text-center">
                    <p className="text-base font-black text-white">{a.distanciaKm.toFixed(2)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">km</p>
                  </div>
                )}
                {a.duracionMin != null && (
                  <div className="bg-surface-700 rounded-xl p-2.5 text-center">
                    <p className="text-base font-black text-white">{fmtDuration(a.duracionMin)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5"><Clock size={9} /> Duración</p>
                  </div>
                )}
                {a.ritmoMinKm != null && (
                  <div className="bg-surface-700 rounded-xl p-2.5 text-center">
                    <p className="text-base font-black text-white">{fmtPace(a.ritmoMinKm)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Ritmo</p>
                  </div>
                )}
                {a.fcPromedio != null && (
                  <div className="bg-surface-700 rounded-xl p-2.5 text-center">
                    <p className="text-base font-black text-red-400">{a.fcPromedio}<span className="text-xs font-normal"> bpm</span></p>
                    <p className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5"><Heart size={9} /> FC prom</p>
                  </div>
                )}
                {a.elevacionM != null && (
                  <div className="bg-surface-700 rounded-xl p-2.5 text-center">
                    <p className="text-base font-black text-blue-400">{Math.round(a.elevacionM)}<span className="text-xs font-normal"> m</span></p>
                    <p className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5"><TrendingUp size={9} /> Elevación</p>
                  </div>
                )}
                {a.caloriasKcal != null && (
                  <div className="bg-surface-700 rounded-xl p-2.5 text-center">
                    <p className="text-base font-black text-orange-400">{a.caloriasKcal}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5"><Flame size={9} /> kcal</p>
                  </div>
                )}
                {a.potenciaW != null && (
                  <div className="bg-surface-700 rounded-xl p-2.5 text-center">
                    <p className="text-base font-black text-yellow-400">{a.potenciaW}<span className="text-xs font-normal"> W</span></p>
                    <p className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5"><Zap size={9} /> Potencia</p>
                  </div>
                )}
              </div>

              {a.notas && (
                <p className="text-xs text-gray-500 mt-2 px-1 italic">"{a.notas}"</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Manual log modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:px-4">
          <div className="card w-full sm:max-w-lg max-h-[92vh] overflow-y-auto animate-slide-up rounded-b-none sm:rounded-2xl">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06] sticky top-0 bg-surface-800 z-10">
              <h2 className="font-black text-white">Registrar actividad</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="btn-ghost p-2"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">Tipo</label>
                <div className="grid grid-cols-5 gap-2">
                  {TIPOS.map(t => (
                    <button key={t.id} type="button" onClick={() => setForm(f => ({ ...f, tipo: t.id }))}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                        form.tipo === t.id
                          ? 'bg-brand-500/20 border-brand-500/50 text-white'
                          : 'bg-surface-600 border-white/[0.06] text-gray-400 hover:text-white'
                      }`}>
                      <span>{t.emoji}</span>
                      <span className="text-[10px]">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nombre (opcional)</label>
                  <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej: Trail mañanero" className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Fecha y hora</label>
                  <input type="datetime-local" value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    className="input w-full text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Distancia (km)</label>
                  <input type="number" step="0.01" value={form.distanciaKm}
                    onChange={e => setForm(f => ({ ...f, distanciaKm: e.target.value }))}
                    placeholder="5.78" className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Duración (min)</label>
                  <input type="number" step="0.1" value={form.duracionMin}
                    onChange={e => setForm(f => ({ ...f, duracionMin: e.target.value }))}
                    placeholder="51.5" className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">FC promedio (bpm)</label>
                  <input type="number" value={form.fcPromedio}
                    onChange={e => setForm(f => ({ ...f, fcPromedio: e.target.value }))}
                    placeholder="168" className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">FC máxima (bpm)</label>
                  <input type="number" value={form.fcMax}
                    onChange={e => setForm(f => ({ ...f, fcMax: e.target.value }))}
                    placeholder="203" className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Elevación (m)</label>
                  <input type="number" value={form.elevacionM}
                    onChange={e => setForm(f => ({ ...f, elevacionM: e.target.value }))}
                    placeholder="269" className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Calorías (kcal)</label>
                  <input type="number" value={form.caloriasKcal}
                    onChange={e => setForm(f => ({ ...f, caloriasKcal: e.target.value }))}
                    placeholder="464" className="input w-full text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  rows={2} placeholder="¿Cómo te sentiste? ¿Algo especial del entrenamiento?"
                  className="input w-full text-sm resize-none" />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={logMutation.isPending}
                  className="flex-1 btn-primary py-2.5 text-sm font-semibold">
                  {logMutation.isPending ? 'Guardando…' : 'Guardar actividad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
