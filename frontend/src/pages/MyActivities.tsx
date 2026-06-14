import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { integrationsApi } from '../services/api';
import {
  Plus, Trash2, Heart, Flame, TrendingUp, Clock, Upload, X,
  Zap, CheckCircle, FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const TIPOS = [
  { id: 'correr',   label: 'Correr',   emoji: '🏃' },
  { id: 'trail',    label: 'Trail',    emoji: '🏔️' },
  { id: 'ciclismo', label: 'Ciclismo', emoji: '🚴' },
  { id: 'natacion', label: 'Natación', emoji: '🏊' },
  { id: 'otro',     label: 'Otro',     emoji: '💪' },
];

const DISPOSITIVOS = [
  {
    nombre: 'Garmin',
    logo: '⌚',
    pasos: [
      'Abre Garmin Connect en tu celular o en connect.garmin.com',
      'Selecciona la actividad',
      'Toca el ícono ••• (más opciones)',
      'Selecciona "Exportar archivo" → GPX',
    ],
  },
  {
    nombre: 'Apple Watch',
    logo: '🍎',
    pasos: [
      'Descarga la app "WorkOutDoors" o "Runalyze" en tu iPhone',
      'Conecta con Apple Health para importar actividades',
      'Selecciona la actividad y exporta como GPX',
      'O usa la app Fitness → Actividad → Compartir',
    ],
  },
  {
    nombre: 'Polar',
    logo: '🔴',
    pasos: [
      'Abre flow.polar.com en tu computadora',
      'Selecciona la actividad en el diario',
      'Clic en "Exportar sesión" → GPX',
    ],
  },
  {
    nombre: 'Suunto',
    logo: '🟦',
    pasos: [
      'Abre la app Suunto o suunto.com',
      'Selecciona la actividad',
      'Toca los 3 puntos → "Exportar" → GPX',
    ],
  },
  {
    nombre: 'COROS',
    logo: '⭕',
    pasos: [
      'Abre la app COROS en tu celular',
      'Selecciona la actividad en Training',
      'Toca el ícono de compartir → Exportar GPX',
    ],
  },
  {
    nombre: 'Strava',
    logo: '🟠',
    pasos: [
      'Abre la app o strava.com',
      'Selecciona la actividad',
      'Menú ••• → "Exportar GPX"',
    ],
  },
];

interface Activity {
  id: number; nombre?: string; tipo: string; fuente: string;
  fecha: string; distanciaKm?: number; duracionMin?: number;
  ritmoMinKm?: number; fcPromedio?: number; fcMax?: number;
  elevacionM?: number; caloriasKcal?: number; potenciaW?: number; notas?: string;
}

function fmtPace(minKm?: number) {
  if (!minKm) return null;
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')} /km`;
}

function fmtDuration(min?: number) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

const FUENTE_BADGE: Record<string, string> = {
  gpx:    'bg-brand-500/15 text-brand-400',
  manual: 'bg-gray-500/15 text-gray-400',
};

export default function MyActivities() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  const [form, setForm] = useState({
    nombre: '', tipo: 'correr',
    fecha: new Date().toISOString().slice(0, 16),
    distanciaKm: '', duracionMin: '', fcPromedio: '', fcMax: '',
    elevacionM: '', caloriasKcal: '', notas: '',
  });

  const { data: activitiesData, isLoading } = useQuery({
    queryKey: ['my-activities'],
    queryFn: () => integrationsApi.getActivities(),
  });
  const activities: Activity[] = activitiesData?.data ?? [];

  const logMutation = useMutation({
    mutationFn: (d: object) => integrationsApi.logActivity(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-activities'] });
      setShowForm(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => integrationsApi.deleteActivity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-activities'] }),
  });

  const resetForm = () => setForm({
    nombre: '', tipo: 'correr',
    fecha: new Date().toISOString().slice(0, 16),
    distanciaKm: '', duracionMin: '', fcPromedio: '', fcMax: '',
    elevacionM: '', caloriasKcal: '', notas: '',
  });

  const handleGpxFile = async (file: File) => {
    setUploading(true);
    setUploadMsg('');
    try {
      const content = await file.text();
      const nameMatch = content.match(/<name>(.*?)<\/name>/);
      await integrationsApi.logActivity({
        tipo: 'correr',
        nombre: nameMatch?.[1]?.trim() ?? file.name.replace('.gpx', ''),
        fecha: new Date().toISOString(),
        gpxContent: content,
        gpxNombre: file.name,
        fuente: 'gpx',
      });
      qc.invalidateQueries({ queryKey: ['my-activities'] });
      setUploadMsg('✓ Actividad importada correctamente');
      setTimeout(() => setUploadMsg(''), 4000);
    } catch {
      setUploadMsg('⚠ Error al importar. Verifica que sea un archivo .gpx válido');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const distKm = form.distanciaKm ? Number(form.distanciaKm) : undefined;
    const durMin = form.duracionMin  ? Number(form.duracionMin)  : undefined;
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

      {/* Header */}
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

      {/* GPX upload card */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-brand-400" />
            <h2 className="text-sm font-bold text-white">Subir actividad GPX</h2>
          </div>
          <button onClick={() => setShowGuide(g => !g)}
            className="text-xs text-gray-500 hover:text-brand-400 transition-colors flex items-center gap-1">
            <FileText size={12} /> ¿Cómo exportar GPX?
          </button>
        </div>

        <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all ${
          uploading
            ? 'border-brand-500/30 bg-brand-500/5'
            : 'border-white/[0.1] hover:border-brand-500/40 hover:bg-brand-500/5'
        }`}>
          {uploading ? (
            <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-brand-500/15 flex items-center justify-center">
              <Upload size={22} className="text-brand-400" />
            </div>
          )}
          <div className="text-center">
            <p className="text-sm font-semibold text-white">
              {uploading ? 'Importando actividad…' : 'Arrastra tu archivo GPX aquí'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {uploading ? 'Un momento…' : 'o haz clic para seleccionar · Compatible con Garmin, Apple Watch, Polar, Suunto, COROS'}
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".gpx" className="hidden"
            onChange={e => e.target.files?.[0] && handleGpxFile(e.target.files[0])}
            disabled={uploading} />
        </label>

        {uploadMsg && (
          <p className={`text-xs px-3 py-2 rounded-xl ${
            uploadMsg.startsWith('✓')
              ? 'bg-green-500/10 text-green-400'
              : 'bg-yellow-500/10 text-yellow-400'
          }`}>{uploadMsg}</p>
        )}

        {/* How to export guide */}
        {showGuide && (
          <div className="space-y-3 pt-2 border-t border-white/[0.06]">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Cómo exportar GPX desde tu dispositivo</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DISPOSITIVOS.map(d => (
                <div key={d.nombre} className="bg-surface-700 rounded-xl p-4">
                  <p className="text-sm font-bold text-white mb-2">
                    {d.logo} {d.nombre}
                  </p>
                  <ol className="space-y-1">
                    {d.pasos.map((paso, i) => (
                      <li key={i} className="text-xs text-gray-400 flex gap-2">
                        <span className="text-brand-400 font-bold flex-shrink-0">{i + 1}.</span>
                        {paso}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Activity list */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          Historial {activities.length > 0 && `· ${activities.length} actividades`}
        </h2>

        {isLoading ? (
          <div className="card p-8 text-center text-gray-500">Cargando actividades…</div>
        ) : activities.length === 0 ? (
          <div className="card p-10 text-center">
            <span className="text-5xl block mb-3">🏃</span>
            <p className="text-gray-400 font-semibold">Sin actividades registradas</p>
            <p className="text-gray-600 text-sm mt-1">
              Sube un archivo GPX o registra manualmente tu primer entrenamiento
            </p>
          </div>
        ) : (
          activities.map(a => {
            const metrics = [
              a.distanciaKm != null && { label: 'km', value: a.distanciaKm.toFixed(2), color: 'text-white' },
              fmtDuration(a.duracionMin) && { label: 'Duración', value: fmtDuration(a.duracionMin)!, color: 'text-white' },
              fmtPace(a.ritmoMinKm) && { label: 'Ritmo', value: fmtPace(a.ritmoMinKm)!, color: 'text-white' },
              a.fcPromedio != null && { label: 'FC prom', value: `${a.fcPromedio} bpm`, color: 'text-red-400', icon: <Heart size={10} /> },
              a.fcMax != null && { label: 'FC máx', value: `${a.fcMax} bpm`, color: 'text-red-300', icon: <Heart size={10} /> },
              a.elevacionM != null && { label: 'Elevación', value: `${Math.round(a.elevacionM)} m`, color: 'text-blue-400', icon: <TrendingUp size={10} /> },
              a.caloriasKcal != null && { label: 'Calorías', value: `${a.caloriasKcal} kcal`, color: 'text-orange-400', icon: <Flame size={10} /> },
              a.potenciaW != null && { label: 'Potencia', value: `${a.potenciaW} W`, color: 'text-yellow-400', icon: <Zap size={10} /> },
            ].filter(Boolean) as { label: string; value: string; color: string; icon?: React.ReactNode }[];

            return (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{tipoEmoji(a.tipo)}</span>
                    <div>
                      <p className="font-semibold text-white text-sm">
                        {a.nombre ?? TIPOS.find(t => t.id === a.tipo)?.label ?? a.tipo}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(a.fecha), "EEEE d 'de' MMMM · HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${FUENTE_BADGE[a.fuente] ?? FUENTE_BADGE.manual}`}>
                      {a.fuente === 'gpx' ? 'GPX' : 'Manual'}
                    </span>
                    <button onClick={() => { if (confirm('¿Eliminar esta actividad?')) deleteMutation.mutate(a.id); }}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {metrics.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {metrics.map(m => (
                      <div key={m.label} className="bg-surface-700 rounded-xl p-2.5 text-center">
                        <p className={`text-sm font-black ${m.color}`}>{m.value}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5 flex items-center justify-center gap-0.5">
                          {m.icon}{m.label}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {a.notas && (
                  <p className="text-xs text-gray-500 mt-2.5 italic">"{a.notas}"</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Manual log modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:px-4">
          <div className="card w-full sm:max-w-lg max-h-[92vh] overflow-y-auto animate-slide-up rounded-b-none sm:rounded-2xl">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06] sticky top-0 bg-surface-800 z-10">
              <h2 className="font-black text-white">Registrar manualmente</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="btn-ghost p-2"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">Tipo</label>
                <div className="grid grid-cols-5 gap-2">
                  {TIPOS.map(t => (
                    <button key={t.id} type="button"
                      onClick={() => setForm(f => ({ ...f, tipo: t.id }))}
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
                {[
                  { key: 'distanciaKm', label: 'Distancia (km)',   placeholder: '5.78',  step: '0.01' },
                  { key: 'duracionMin', label: 'Duración (min)',    placeholder: '51',    step: '1'    },
                  { key: 'fcPromedio',  label: 'FC promedio (bpm)', placeholder: '168',   step: '1'    },
                  { key: 'fcMax',       label: 'FC máxima (bpm)',   placeholder: '203',   step: '1'    },
                  { key: 'elevacionM',  label: 'Elevación (m)',     placeholder: '269',   step: '1'    },
                  { key: 'caloriasKcal',label: 'Calorías (kcal)',   placeholder: '464',   step: '1'    },
                ].map(({ key, label, placeholder, step }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">{label}</label>
                    <input type="number" step={step}
                      value={form[key as keyof typeof form]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="input w-full text-sm" />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Notas</label>
                <textarea value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
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
