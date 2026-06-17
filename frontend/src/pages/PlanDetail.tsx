import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plansApi, integrationsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, Calendar, Target, Dumbbell,
  ChevronDown, ChevronRight, Edit2, Check, X,
  Zap, TrendingUp, Shield, Bike, Waves, Trash2, BookmarkPlus, BookmarkCheck,
  GripVertical, Users, Upload, CheckCircle2, Clock3, AlertCircle, ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseGpx } from '../utils/gpxParser';
import ActivityStatsView, { ActivityLog } from '../components/ActivityStatsView';

interface TrainingDay {
  id: number; diaSemana: string; tipo: string;
  distanciaKm?: number; duracionMin?: number;
  intensidad: string; descripcion: string;
  videoUrl?: string;
}
interface TrainingWeek {
  id: number; numeroSemana: number; descripcion?: string; dias: TrainingDay[];
}
interface AssignedRunner {
  id: number; nombre: string; apellido: string; nivel: string;
}
interface Plan {
  id: number; nombre: string; descripcion?: string;
  duracionSemanas: number; nivel: string; objetivo?: string;
  semanas: TrainingWeek[];
  asignaciones?: { runner: AssignedRunner; group?: { id: number; nombre: string; color: string } | null }[];
  fechaInicio?: string; // runner's assignment start date (for exact day dates)
}

// "Día 1", "Día 3"… → its 0-based offset. Returns null for weekday labels.
function diaOffset(diaSemana: string): number | null {
  const m = diaSemana.match(/^D[íi]a\s*(\d+)/i);
  return m ? Number(m[1]) - 1 : null;
}

// "Rodaje" is cycling vocabulary; for running we use "trote". Sanitize at
// display time so existing plans (text already stored) also read correctly.
const fixRunTerms = (s?: string) =>
  (s ?? '').replace(/Rodaje/g, 'Trote').replace(/rodaje/g, 'trote');

// Map each training day of a plan to a real calendar date, given a start date.
// Weekday-labelled days align to real weekdays; "Día N" days are sequential.
const WEEKDAY_IDX: Record<string, number> = {
  lunes: 0, martes: 1, miércoles: 2, miercoles: 2, jueves: 3,
  viernes: 4, sábado: 5, sabado: 5, domingo: 6,
};
function planDayDates(plan: Plan, startDate: Date | null): Map<number, Date> {
  const map = new Map<number, Date>();
  if (!startDate) return map;
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  const startMon0 = (start.getDay() + 6) % 7;        // 0 = Monday
  const monday = new Date(start); monday.setDate(start.getDate() - startMon0);
  for (const s of plan.semanas) {
    for (const d of s.dias) {
      const off = diaOffset(d.diaSemana);            // "Día N" → N-1
      let date: Date;
      if (off != null) {
        date = new Date(start); date.setDate(start.getDate() + off);
      } else {
        const w = WEEKDAY_IDX[d.diaSemana.toLowerCase()];
        if (w == null) continue;
        date = new Date(monday);
        date.setDate(monday.getDate() + (s.numeroSemana - 1) * 7 + w);
      }
      map.set(d.id, date);
    }
  }
  return map;
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Collapsible group header in the "assigned runners" dropdown.
function GroupSection({ nombre, color, count, children }: {
  nombre: string; color: string; count: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-600/60 transition-colors text-left">
        <ChevronRight size={13} className={`text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-sm font-semibold text-white truncate flex-1">{nombre}</span>
        <span className="text-[11px] text-gray-500">{count}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ── Month-grid calendar of the plan's training days on real dates ─────────────
function PlanCalendar({ plan, startDate, dayDates, activityByDay, isCoach }: {
  plan: Plan;
  startDate: Date | null;
  dayDates: Map<number, Date>;
  activityByDay: Record<number, ActivityLog | null>;
  isCoach: boolean;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const byDate = new Map<string, TrainingDay[]>();
  plan.semanas.forEach(s => s.dias.forEach(d => {
    const dt = dayDates.get(d.id);
    if (!dt) return;
    const k = ymd(dt);
    const arr = byDate.get(k) ?? []; arr.push(d); byDate.set(k, arr);
  }));

  const base = startDate ?? today;
  const [cursor, setCursor] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const [selected, setSelected] = useState<string>(ymd(startDate ?? today));

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const firstMon0 = (first.getDay() + 6) % 7;
  const gridStart = new Date(first); gridStart.setDate(1 - firstMon0);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });

  const selDays = (byDate.get(selected) ?? []).filter(d => d.tipo !== 'descanso');
  const selDate = new Date(selected + 'T00:00:00');

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface-600 transition-colors">
          <ChevronRight size={16} className="rotate-180" />
        </button>
        <h3 className="text-sm font-black text-white capitalize">{format(cursor, 'MMMM yyyy', { locale: es })}</h3>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-surface-600 transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-gray-600 uppercase">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const k = ymd(d);
          const inMonth = d.getMonth() === month;
          const isToday = ymd(today) === k;
          const isSel = selected === k;
          const days = (byDate.get(k) ?? []).filter(x => x.tipo !== 'descanso');
          const done = days.some(x => activityByDay[x.id]);
          return (
            <button key={i} onClick={() => setSelected(k)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs transition-all relative
                ${isSel ? 'bg-brand-500/25 ring-1 ring-brand-500' : days.length ? 'bg-surface-700 hover:bg-surface-600' : 'hover:bg-surface-700/50'}
                ${!inMonth ? 'opacity-30' : ''}`}>
              <span className={`${isToday ? 'text-brand-400 font-black' : days.length ? 'text-white font-semibold' : 'text-gray-500'}`}>
                {d.getDate()}
              </span>
              {days.length > 0 && (
                <div className="flex items-center gap-0.5">
                  {days.slice(0, 3).map((x, j) => (
                    <span key={j} className="w-1.5 h-1.5 rounded-full"
                      style={{ background: done ? '#22c55e' : (tipoIcon[x.tipo]?.color?.includes('green') ? '#4ade80' : tipoIcon[x.tipo]?.color?.includes('orange') ? '#fb923c' : tipoIcon[x.tipo]?.color?.includes('red') ? '#f87171' : tipoIcon[x.tipo]?.color?.includes('blue') ? '#60a5fa' : '#9ca3af') }} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      <div className="mt-4 pt-4 border-t border-white/[0.06]">
        <p className="text-sm font-bold text-white capitalize mb-2">
          {format(selDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
        </p>
        {selDays.length === 0 ? (
          <p className="text-xs text-gray-500">Sin entrenamiento programado este día.</p>
        ) : (
          <div className="space-y-2">
            {selDays.map(d => {
              const act = activityByDay[d.id];
              const cfg = tipoIcon[d.tipo] ?? tipoIcon.descanso;
              return (
                <div key={d.id} className="flex items-start gap-3 bg-surface-700 rounded-xl p-3 border border-white/[0.06]">
                  <span className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${cfg.bg}`}>
                    <span className={cfg.color}>{cfg.icon}</span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white">{tipoLabel[d.tipo] ?? d.tipo.replace(/_/g, ' ')}</p>
                      {d.distanciaKm != null && <span className="text-xs text-gray-400">{d.distanciaKm} km</span>}
                      {!isCoach && (act
                        ? <span className="flex items-center gap-1 text-[10px] text-green-400 font-medium"><CheckCircle2 size={10} /> Hecho</span>
                        : <span className="flex items-center gap-1 text-[10px] text-gray-500"><Clock3 size={10} /> Pendiente</span>)}
                    </div>
                    {d.descripcion && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{fixRunTerms(d.descripcion)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const tipoLabel: Record<string, string> = {
  rodaje_facil:       'Trote Fácil',
  rodaje_largo:       'Trote Largo',
  rodaje_moderado:    'Trote Moderado',
  tempo:              'Tempo / Umbral',
  intervalos:         'Intervalos',
  fuerza:             'Fuerza / Pesas',
  cross_training:     'Cross Training',
  trail_tecnico:      'Trail Técnico',
  hyrox_especifico:   'HYROX Específico',
  brick_triatlon:     'Brick Triatlón',
  natacion:           'Natación',
  descanso:           'Descanso',
  recuperacion_activa:'Recuperación Activa',
  wod_crossfit:       'WOD CrossFit',
  wod_crossfit_largo: 'WOD CrossFit Largo',
};

const tipoIcon: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  rodaje_facil:      { icon: <Zap size={14}/>,    color: 'text-green-400',  bg: 'bg-green-500/15' },
  rodaje_largo:      { icon: <TrendingUp size={14}/>, color: 'text-blue-400', bg: 'bg-blue-500/15' },
  rodaje_moderado:   { icon: <Zap size={14}/>,    color: 'text-teal-400',   bg: 'bg-teal-500/15' },
  tempo:             { icon: <Zap size={14}/>,    color: 'text-orange-400', bg: 'bg-orange-500/15' },
  intervalos:        { icon: <Zap size={14}/>,    color: 'text-red-400',    bg: 'bg-red-500/15' },
  fuerza:            { icon: <Dumbbell size={14}/>, color: 'text-purple-400', bg: 'bg-purple-500/15' },
  cross_training:    { icon: <Bike size={14}/>,   color: 'text-cyan-400',   bg: 'bg-cyan-500/15' },
  trail_tecnico:     { icon: <TrendingUp size={14}/>, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  hyrox_especifico:  { icon: <Dumbbell size={14}/>, color: 'text-brand-400', bg: 'bg-brand-500/15' },
  brick_triatlon:    { icon: <Bike size={14}/>,   color: 'text-sky-400',    bg: 'bg-sky-500/15' },
  natacion:          { icon: <Waves size={14}/>,  color: 'text-teal-400',   bg: 'bg-teal-500/15' },
  descanso:          { icon: <Shield size={14}/>, color: 'text-gray-500',   bg: 'bg-gray-500/10' },
  recuperacion_activa:{ icon: <Shield size={14}/>, color: 'text-gray-400',  bg: 'bg-gray-500/15' },
  wod_crossfit:      { icon: <Dumbbell size={14}/>, color: 'text-yellow-400', bg: 'bg-yellow-500/15' },
  wod_crossfit_largo:{ icon: <Dumbbell size={14}/>, color: 'text-yellow-300', bg: 'bg-yellow-500/10' },
};

const intensidadColor: Record<string, string> = {
  descanso: 'text-gray-500', muy_suave: 'text-gray-400', suave: 'text-green-400',
  'suave-moderado': 'text-teal-400', moderado: 'text-blue-400',
  'moderado-intenso': 'text-orange-400', intenso: 'text-red-400', máximo: 'text-red-600',
};

const diasLabel: Record<string, string> = {
  lunes: 'Lun', martes: 'Mar', 'miércoles': 'Mié', jueves: 'Jue',
  viernes: 'Vie', sábado: 'Sáb', domingo: 'Dom',
};

// ──────────────────────────────────────────────────────────────────────────────
// Sub-componente: botón de upload de actividad para el corredor
// ──────────────────────────────────────────────────────────────────────────────
function RunnerUploadSection({
  day,
  myActivity,
  onUploaded,
}: {
  day: TrainingDay;
  myActivity: ActivityLog | null;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [viewActivity, setViewActivity] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: number) => integrationsApi.deleteActivity(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-activities'] }); onUploaded(); setViewActivity(false); },
  });

  const handleFile = async (file: File) => {
    setUploading(true);
    setMsg('');
    try {
      const content = await file.text();
      if (!content.includes('<gpx') && !content.includes('<trk')) {
        setMsg('El archivo no parece ser un GPX válido');
        return;
      }

      let parsed;
      try { parsed = parseGpx(content); } catch { parsed = null; }

      await integrationsApi.logActivity({
        diaId:               day.id,
        tipo:                parsed?.tipo ?? 'correr',
        nombre:              parsed?.name ?? file.name.replace('.gpx', ''),
        fecha:               (parsed?.fecha ?? new Date()).toISOString(),
        gpxContent:          content,
        gpxNombre:           file.name,
        distanciaKm:         parsed?.distanciaKm,
        duracionMin:         parsed?.duracionMin,
        tiempoElapsadoMin:   parsed?.tiempoElapsadoMin,
        ritmoMinKm:          parsed?.ritmoMinKm,
        fcPromedio:          parsed?.fcPromedio,
        fcMax:               parsed?.fcMax,
        cadenciaPromedio:    parsed?.cadenciaPromedio,
        cadenciaMax:         parsed?.cadenciaMax,
        elevacionM:          parsed?.elevacionM,
        elevacionPerdidaM:   parsed?.elevacionPerdidaM,
        potenciaW:           parsed?.potenciaW,
        potenciaMax:         parsed?.potenciaMax,
        potenciaPonderada:   parsed?.potenciaPonderada,
        potenciaPromedio30s: parsed?.potenciaPromedio30s,
      });

      qc.invalidateQueries({ queryKey: ['my-activities'] });
      onUploaded();
      setMsg('✓ Actividad enviada al entrenador');
      setTimeout(() => setMsg(''), 4000);
    } catch (err: any) {
      setMsg(err?.response?.data?.error ?? err?.message ?? 'Error al subir');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Sin actividad enviada: mostrar botón de upload
  if (!myActivity) {
    return (
      <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tu actividad</p>
        <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
          uploading
            ? 'border-brand-500/40 bg-brand-500/5'
            : 'border-white/[0.08] hover:border-brand-500/40 hover:bg-brand-500/5'
        }`}>
          {uploading
            ? <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            : <Upload size={15} className="text-brand-400 flex-shrink-0" />
          }
          <div>
            <p className="text-sm font-semibold text-white">
              {uploading ? 'Subiendo actividad…' : 'Subir archivo GPX'}
            </p>
            <p className="text-xs text-gray-500">Exporta desde Garmin, Apple Watch, COROS, Strava…</p>
          </div>
          <input ref={fileRef} type="file" accept=".gpx" className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            disabled={uploading} />
        </label>
        {msg && (
          <p className={`text-xs px-3 py-2 rounded-xl ${
            msg.startsWith('✓') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>{msg}</p>
        )}
      </div>
    );
  }

  // Con actividad enviada: mostrar estado + opción de ver/eliminar
  const isConfirmed = myActivity.confirmadoPorCoach;

  return (
    <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tu actividad</p>
        <div className="flex items-center gap-2">
          {isConfirmed
            ? (
              <span className="flex items-center gap-1 text-[11px] text-green-400 font-medium">
                <CheckCircle2 size={11} /> Confirmado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-yellow-400 font-medium">
                <Clock3 size={11} /> Pendiente de confirmación
              </span>
            )
          }
        </div>
      </div>

      {/* Resumen compacto */}
      <div
        className="bg-surface-700 rounded-xl p-3 border border-white/[0.05] cursor-pointer hover:border-white/[0.12] transition-all"
        onClick={() => setViewActivity(v => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">
              {myActivity.tipo === 'trail' ? '🏔️' : myActivity.tipo === 'ciclismo' ? '🚴' : '🏃'}
            </span>
            <div>
              <p className="text-sm font-semibold text-white">
                {myActivity.nombre ?? tipoLabel[myActivity.tipo] ?? myActivity.tipo}
              </p>
              <p className="text-xs text-gray-500">
                {format(new Date(myActivity.fecha), "d MMM · HH:mm", { locale: es })}
                {myActivity.gpxNombre && ` · ${myActivity.gpxNombre}`}
              </p>
            </div>
          </div>
          <ChevronRight size={14} className={`text-gray-500 transition-transform ${viewActivity ? 'rotate-90' : ''}`} />
        </div>

        {/* Mini stats */}
        <div className="flex flex-wrap gap-2 mt-2">
          {myActivity.distanciaKm != null && (
            <span className="text-xs text-gray-300 bg-surface-600 rounded-lg px-2 py-0.5">
              {myActivity.distanciaKm.toFixed(2)} km
            </span>
          )}
          {myActivity.duracionMin != null && (
            <span className="text-xs text-gray-300 bg-surface-600 rounded-lg px-2 py-0.5">
              {Math.floor(myActivity.duracionMin / 60) > 0
                ? `${Math.floor(myActivity.duracionMin / 60)}h ${myActivity.duracionMin % 60}m`
                : `${myActivity.duracionMin} min`}
            </span>
          )}
          {myActivity.fcPromedio != null && (
            <span className="text-xs text-red-400 bg-red-500/10 rounded-lg px-2 py-0.5">
              ♥ {myActivity.fcPromedio} bpm
            </span>
          )}
          {myActivity.elevacionM != null && myActivity.elevacionM > 0 && (
            <span className="text-xs text-blue-400 bg-blue-500/10 rounded-lg px-2 py-0.5">
              ↑ {Math.round(myActivity.elevacionM)} m
            </span>
          )}
        </div>
      </div>

      {/* Detalle completo */}
      {viewActivity && (
        <div className="bg-surface-800 rounded-xl p-4 border border-white/[0.05] space-y-4">
          <ActivityStatsView activity={myActivity} showGpxDetails />
          <div className="flex gap-2 pt-2 border-t border-white/[0.05]">
            <button
              onClick={() => { if (confirm('¿Eliminar esta actividad?')) deleteMutation.mutate(myActivity.id); }}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} /> Eliminar y volver a subir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-componente: sección del coach para ver y confirmar actividades del día
// ──────────────────────────────────────────────────────────────────────────────
function CoachDayActivities({ diaId, expanded }: { diaId: number; expanded: boolean }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['day-activities', diaId],
    queryFn: () => integrationsApi.getDayActivities(diaId),
    enabled: expanded,
  });

  const activities: (ActivityLog & { runner?: { id: number; nombre: string; apellido: string } })[] =
    data?.data ?? [];

  const confirmMutation = useMutation({
    mutationFn: (id: number) => integrationsApi.confirmActivity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['day-activities', diaId] }),
  });

  const unconfirmMutation = useMutation({
    mutationFn: (id: number) => integrationsApi.unconfirmActivity(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['day-activities', diaId] }),
  });

  const [viewId, setViewId] = useState<number | null>(null);

  if (!expanded) return null;
  if (isLoading) return (
    <div className="mt-4 pt-4 border-t border-white/[0.05]">
      <p className="text-xs text-gray-500">Cargando actividades…</p>
    </div>
  );

  if (activities.length === 0) return (
    <div className="mt-4 pt-4 border-t border-white/[0.05]">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Actividades enviadas</p>
      <p className="text-xs text-gray-600 italic">Ningún corredor ha enviado actividad para este día</p>
    </div>
  );

  return (
    <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-3">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
        Actividades enviadas · {activities.length}
      </p>

      {activities.map(act => (
        <div key={act.id} className="bg-surface-800 rounded-xl border border-white/[0.06] overflow-hidden">
          {/* Header del corredor */}
          <div
            className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
            onClick={() => setViewId(viewId === act.id ? null : act.id)}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {act.runner?.nombre?.[0]}{act.runner?.apellido?.[0]}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {act.runner?.nombre} {act.runner?.apellido}
                </p>
                <p className="text-xs text-gray-500">
                  {format(new Date(act.fecha), "d MMM · HH:mm", { locale: es })}
                  {act.distanciaKm != null && ` · ${act.distanciaKm.toFixed(2)} km`}
                  {act.duracionMin != null && ` · ${act.duracionMin} min`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {act.confirmadoPorCoach ? (
                <button
                  onClick={e => { e.stopPropagation(); unconfirmMutation.mutate(act.id); }}
                  disabled={unconfirmMutation.isPending}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 size={11} /> Confirmado
                </button>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); confirmMutation.mutate(act.id); }}
                  disabled={confirmMutation.isPending}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-brand-500/15 text-brand-400 border border-brand-500/20 hover:bg-brand-500/25 transition-colors disabled:opacity-50"
                >
                  <AlertCircle size={11} /> Confirmar
                </button>
              )}
              <ChevronRight size={13} className={`text-gray-500 transition-transform ${viewId === act.id ? 'rotate-90' : ''}`} />
            </div>
          </div>

          {/* Detalle expandible */}
          {viewId === act.id && (
            <div className="px-3 pb-3 border-t border-white/[0.05]">
              <div className="pt-3">
                <ActivityStatsView activity={act} showGpxDetails />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DayCard principal
// ──────────────────────────────────────────────────────────────────────────────
function DayCard({ day, dayDate, isCoach, planId, onUpdate, myActivity, onActivityChange, onDragStart, onDragOver, onDrop, isDragOver, isDragging }: {
  day: TrainingDay; dayDate?: Date | null; isCoach: boolean; planId: number;
  onUpdate: () => void;
  myActivity?: ActivityLog | null;
  onActivityChange?: () => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  isDragOver?: boolean;
  isDragging?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    tipo:        day.tipo,
    diaSemana:   day.diaSemana,
    distanciaKm: day.distanciaKm ?? '',
    duracionMin:  day.duracionMin ?? '',
    intensidad:   day.intensidad,
    descripcion:  day.descripcion,
    videoUrl:     day.videoUrl ?? '',
  });
  const qc = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: object) => plansApi.updateDay(day.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', planId] }); setEditing(false); onUpdate(); },
  });

  const isRest = day.tipo === 'descanso' || day.tipo === 'recuperacion_activa';
  const cfg = tipoIcon[day.tipo] ?? tipoIcon.descanso;

  // Badge de estado para runner
  const activityBadge = !isCoach && !isRest ? (
    myActivity?.confirmadoPorCoach
      ? <span className="flex items-center gap-1 text-[10px] text-green-400 font-medium"><CheckCircle2 size={10} /> Confirmado</span>
      : myActivity
        ? <span className="flex items-center gap-1 text-[10px] text-yellow-400 font-medium"><Clock3 size={10} /> Enviado</span>
        : null
  ) : null;

  return (
    <div
      draggable={isCoach}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-xl border transition-all select-none ${
        isDragOver  ? 'border-brand-500/60 bg-brand-500/10 scale-[1.01]' :
        isDragging  ? 'opacity-40 border-white/[0.03]' :
        isRest      ? 'border-white/[0.03] bg-surface-800/50' :
                      'border-white/[0.06] bg-surface-700 hover:border-white/[0.12]'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {isCoach && (
          <GripVertical size={14} className="text-gray-600 cursor-grab active:cursor-grabbing flex-shrink-0 -ml-1" />
        )}
        <span className="flex flex-col items-center w-10 flex-shrink-0 leading-tight">
          <span className="text-xs font-bold text-gray-500">{diasLabel[day.diaSemana] ?? (/^Día\s*\d+$/i.test(day.diaSemana) ? day.diaSemana.replace(/\s+/g, '').replace('Día', 'D') : day.diaSemana.slice(0,3).toUpperCase())}</span>
          {dayDate && (
            <span className="text-[10px] text-brand-400 font-semibold whitespace-nowrap">{format(dayDate, 'd MMM', { locale: es })}</span>
          )}
        </span>
        <span className={`flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 ${cfg.bg}`}>
          <span className={cfg.color}>{cfg.icon}</span>
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isRest ? 'text-gray-500' : 'text-white'}`}>
            {tipoLabel[day.tipo] ?? day.tipo.replace(/_/g, ' ')}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {day.distanciaKm && <span className="text-xs text-gray-400">{day.distanciaKm}km</span>}
            {day.duracionMin  && <span className="text-xs text-gray-400">{day.duracionMin}min</span>}
            {day.intensidad && day.intensidad !== 'descanso' && (
              <span className={`text-xs font-medium ${intensidadColor[day.intensidad] ?? 'text-gray-400'}`}>
                {day.intensidad.replace(/-/g, ' ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {activityBadge}
          {isCoach && (
            <button onClick={e => { e.stopPropagation(); setEditing(!editing); setExpanded(true); }}
              className="p-1.5 text-gray-600 hover:text-white hover:bg-surface-500 rounded-lg transition-all">
              <Edit2 size={13} />
            </button>
          )}
          <span className={`text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}>
            <ChevronRight size={14} />
          </span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-white/[0.05]">
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Tipo de actividad</label>
                  <select value={editForm.tipo}
                    onChange={e => setEditForm({ ...editForm, tipo: e.target.value })}
                    className="input w-full text-sm">
                    {Object.entries(tipoLabel).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Día de la semana</label>
                  <select value={editForm.diaSemana}
                    onChange={e => setEditForm({ ...editForm, diaSemana: e.target.value })}
                    className="input w-full text-sm">
                    {['lunes','martes','miércoles','jueves','viernes','sábado','domingo'].map(d => (
                      <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Distancia (km)</label>
                  <input type="number" value={editForm.distanciaKm}
                    onChange={e => setEditForm({ ...editForm, distanciaKm: e.target.value })}
                    className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Duración (min)</label>
                  <input type="number" value={editForm.duracionMin}
                    onChange={e => setEditForm({ ...editForm, duracionMin: e.target.value })}
                    className="input w-full text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Intensidad</label>
                <select value={editForm.intensidad}
                  onChange={e => setEditForm({ ...editForm, intensidad: e.target.value })}
                  className="input w-full text-sm">
                  {['descanso','muy_suave','suave','suave-moderado','moderado','moderado-intenso','intenso','máximo'].map(i => (
                    <option key={i} value={i}>{i.replace(/-/g,' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Descripción / Instrucciones</label>
                <textarea value={editForm.descripcion}
                  onChange={e => setEditForm({ ...editForm, descripcion: e.target.value })}
                  rows={4} className="input w-full text-sm resize-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Video de referencia <span className="text-gray-600">(YouTube, Vimeo, etc. — opcional)</span>
                </label>
                <input type="url" value={editForm.videoUrl}
                  onChange={e => setEditForm({ ...editForm, videoUrl: e.target.value })}
                  placeholder="https://youtube.com/watch?v=..."
                  className="input w-full text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] text-xs text-gray-400 hover:text-white transition-colors">
                  <X size={12} /> Cancelar
                </button>
                <button onClick={() => updateMutation.mutate({
                  tipo:        editForm.tipo,
                  diaSemana:   editForm.diaSemana,
                  distanciaKm: editForm.distanciaKm ? Number(editForm.distanciaKm) : null,
                  duracionMin:  editForm.duracionMin  ? Number(editForm.duracionMin)  : null,
                  intensidad:  editForm.intensidad,
                  descripcion: editForm.descripcion,
                  videoUrl:    editForm.videoUrl || null,
                })} disabled={updateMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-xs text-white font-semibold transition-colors disabled:opacity-50">
                  <Check size={12} /> {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{fixRunTerms(day.descripcion)}</p>
              {day.videoUrl && (
                <a href={day.videoUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors">
                  <ExternalLink size={13} />
                  Ver video de referencia
                </a>
              )}
            </div>
          )}

          {/* Sección de actividad del corredor (solo en días de entrenamiento) */}
          {!isCoach && !isRest && (
            <RunnerUploadSection
              day={day}
              myActivity={myActivity ?? null}
              onUploaded={onActivityChange ?? (() => {})}
            />
          )}

          {/* Sección del coach: ver actividades enviadas */}
          {isCoach && (
            <CoachDayActivities diaId={day.id} expanded={expanded} />
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Página principal PlanDetail
// ──────────────────────────────────────────────────────────────────────────────
export default function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isCoach } = useAuth();
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['plan', Number(id)],
    queryFn: () => plansApi.get(Number(id)),
  });

  // Actividades del corredor (solo si no es coach)
  const { data: activitiesData, refetch: refetchActivities } = useQuery({
    queryKey: ['my-activities'],
    queryFn: () => integrationsApi.getActivities(),
    enabled: !isCoach,
  });
  const myActivities: ActivityLog[] = activitiesData?.data ?? [];
  const activityByDay: Record<number, ActivityLog> = Object.fromEntries(
    myActivities.filter(a => a.diaId != null).map(a => [a.diaId!, a])
  );

  const deletePlanMutation = useMutation({
    mutationFn: () => plansApi.delete(Number(id)),
    onSuccess: () => navigate('/planes'),
  });

  const templateMutation = useMutation({
    mutationFn: () => plansApi.toggleTemplate(Number(id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', Number(id)] }),
  });

  const [editingPlan, setEditingPlan] = useState(false);
  const [planView, setPlanView] = useState<'lista' | 'calendario'>('lista');
  const [planForm, setPlanForm] = useState({ nombre: '', objetivo: '', descripcion: '' });
  const updatePlanMutation = useMutation({
    mutationFn: (data: object) => plansApi.update(Number(id), data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plan', Number(id)] }); setEditingPlan(false); },
  });
  const openEditPlan = () => {
    if (!plan) return;
    setPlanForm({ nombre: plan.nombre, objetivo: plan.objetivo ?? '', descripcion: plan.descripcion ?? '' });
    setEditingPlan(true);
  };

  // Intercambia el CONTENIDO de entrenamiento entre dos días; el día de la semana no cambia
  const swapDaysMutation = useMutation({
    mutationFn: async ({ source, target }: { source: TrainingDay; target: TrainingDay }) => {
      await plansApi.updateDay(source.id, {
        tipo:        target.tipo,
        distanciaKm: target.distanciaKm ?? null,
        duracionMin:  target.duracionMin ?? null,
        intensidad:  target.intensidad,
        descripcion: target.descripcion,
      });
      await plansApi.updateDay(target.id, {
        tipo:        source.tipo,
        distanciaKm: source.distanciaKm ?? null,
        duracionMin:  source.duracionMin ?? null,
        intensidad:  source.intensidad,
        descripcion: source.descripcion,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', Number(id)] }),
  });

  const handleDrop = (targetDay: TrainingDay) => {
    if (draggedId === null || draggedId === targetDay.id) { setDraggedId(null); setDragOverId(null); return; }
    const currentWeek = plan?.semanas.find(s => s.numeroSemana === selectedWeek);
    const sourceDay = currentWeek?.dias.find(d => d.id === draggedId);
    if (!sourceDay) return;
    swapDaysMutation.mutate({ source: sourceDay, target: targetDay });
    setDraggedId(null);
    setDragOverId(null);
  };

  const [showRunners, setShowRunners] = useState(false);
  const runnersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (runnersRef.current && !runnersRef.current.contains(e.target as Node)) setShowRunners(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const plan: Plan & { isTemplate?: boolean } | undefined = data?.data;

  if (isLoading) return <div className="p-4 lg:p-8 text-gray-400">Cargando plan...</div>;
  if (!plan) return <div className="p-4 lg:p-8 text-gray-400">Plan no encontrado</div>;

  const dayOrder = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const sortDias = (dias: TrainingDay[]) =>
    [...dias].sort((a, b) => dayOrder.indexOf(a.diaSemana) - dayOrder.indexOf(b.diaSemana));

  const week = plan.semanas.find(s => s.numeroSemana === selectedWeek);
  const totalKm = plan.semanas.reduce((s, w) => s + w.dias.reduce((d, day) => d + (day.distanciaKm ?? 0), 0), 0);
  const avgKmWeek = Math.round(totalKm / plan.duracionSemanas);
  const sesiones = week?.dias.filter(d => d.tipo !== 'descanso' && d.tipo !== 'recuperacion_activa').length ?? 0;
  const weekKm = week?.dias.reduce((s, d) => s + (d.distanciaKm ?? 0), 0) ?? 0;

  // A single-week plan (incl. day-based plans) doesn't need a week navigator.
  const isSingleWeek = plan.semanas.length <= 1;
  const startDate = plan.fechaInicio ? new Date(plan.fechaInicio) : null;
  const dateForDay = (diaSemana: string): Date | null => {
    if (!startDate) return null;
    const off = diaOffset(diaSemana);
    if (off == null) return null;
    const d = new Date(startDate);
    d.setDate(d.getDate() + off);
    return d;
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors">
          <ArrowLeft size={16} /> Volver
        </button>
        {isCoach && (
          <div className="flex items-center gap-2">
            <button
              onClick={openEditPlan}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/[0.08] bg-surface-600 text-gray-300 hover:text-white hover:border-brand-500/40 transition-all"
            >
              <Edit2 size={13} /> Editar
            </button>
            <button
              onClick={() => templateMutation.mutate()}
              title={plan.isTemplate ? 'Quitar de plantillas' : 'Guardar como plantilla'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                plan.isTemplate
                  ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/25'
                  : 'bg-surface-600 border-white/[0.08] text-gray-400 hover:text-yellow-400 hover:border-yellow-500/30'
              }`}
            >
              {plan.isTemplate ? <BookmarkCheck size={13} /> : <BookmarkPlus size={13} />}
              {plan.isTemplate ? 'Plantilla guardada' : 'Guardar plantilla'}
            </button>
            <button
              onClick={() => { if (confirm(`¿Eliminar "${plan.nombre}"?`)) deletePlanMutation.mutate(); }}
              disabled={deletePlanMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
            >
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="card p-6 mb-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-hero flex items-center justify-center flex-shrink-0 shadow-glow">
            <Dumbbell size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-white">{plan.nombre}</h1>
            <div className="flex flex-wrap gap-3 mt-2">
              <span className="badge bg-brand-500/15 text-brand-400 capitalize">{plan.nivel}</span>
              {plan.objetivo && <span className="badge bg-blue-500/15 text-blue-400">{plan.objetivo}</span>}
              <span className="badge bg-surface-500 text-gray-300 flex items-center gap-1">
                <Calendar size={11}/> {plan.duracionSemanas} semanas
              </span>
              <span className="badge bg-surface-500 text-gray-300 flex items-center gap-1">
                <Target size={11}/> ~{avgKmWeek} km/sem
              </span>
              {isCoach && (
                <div ref={runnersRef} className="relative">
                  <button
                    onClick={() => setShowRunners(v => !v)}
                    className="badge bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 flex items-center gap-1 hover:bg-indigo-500/25 transition-colors cursor-pointer"
                  >
                    <Users size={11} />
                    {plan.asignaciones?.length ?? 0} corredor{(plan.asignaciones?.length ?? 0) !== 1 ? 'es' : ''}
                  </button>
                  {showRunners && (
                    <div className="absolute left-0 top-full mt-2 z-50 w-64 bg-surface-700 border border-white/[0.08] rounded-xl shadow-xl overflow-hidden">
                      <p className="px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-white/[0.06]">
                        Corredores asignados
                      </p>
                      {!plan.asignaciones?.length ? (
                        <p className="px-3 py-3 text-sm text-gray-500">Sin corredores asignados</p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto">
                          {(() => {
                            const a = plan.asignaciones!;
                            // Group by group; ungrouped runners listed at the end.
                            const byGroup = new Map<number, { nombre: string; color: string; runners: AssignedRunner[] }>();
                            const solo: AssignedRunner[] = [];
                            a.forEach(({ runner, group }) => {
                              if (group) {
                                const g = byGroup.get(group.id) ?? { nombre: group.nombre, color: group.color, runners: [] };
                                g.runners.push(runner); byGroup.set(group.id, g);
                              } else solo.push(runner);
                            });
                            const RunnerRow = (runner: AssignedRunner, pad = false) => (
                              <button key={runner.id} onClick={() => navigate(`/corredores/${runner.id}`)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-600 transition-colors text-left ${pad ? 'pl-7' : ''}`}>
                                <div className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                  {runner.nombre[0]}{runner.apellido[0]}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-white font-medium truncate hover:underline">{runner.nombre} {runner.apellido}</p>
                                  <p className="text-[11px] text-gray-500 capitalize">{runner.nivel}</p>
                                </div>
                              </button>
                            );
                            return (
                              <>
                                {[...byGroup.entries()].map(([gid, g]) => (
                                  <GroupSection key={gid} nombre={g.nombre} color={g.color} count={g.runners.length}>
                                    {g.runners.map(r => RunnerRow(r, true))}
                                  </GroupSection>
                                ))}
                                {solo.length > 0 && (
                                  <>
                                    {byGroup.size > 0 && (
                                      <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-600 uppercase tracking-wider">Individuales</p>
                                    )}
                                    {solo.map(r => RunnerRow(r, false))}
                                  </>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {plan.descripcion && (
          <div className="mt-4 pt-4 border-t border-white/[0.05]">
            <details className="group">
              <summary className="text-xs font-semibold text-gray-400 cursor-pointer hover:text-white transition-colors flex items-center gap-1">
                <ChevronDown size={13} className="group-open:rotate-180 transition-transform" />
                Filosofía y principios del plan
              </summary>
              <p className="text-sm text-gray-400 leading-relaxed mt-3 whitespace-pre-line">{fixRunTerms(plan.descripcion)}</p>
            </details>
          </div>
        )}
      </div>

      {/* View toggle: list vs calendar */}
      <div className="flex items-center gap-1 p-1 bg-surface-700 rounded-xl w-fit mb-4">
        {([['lista', 'Lista'], ['calendario', 'Calendario']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setPlanView(v)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${planView === v ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'}`}>
            {v === 'calendario' && <Calendar size={13} />}{label}
          </button>
        ))}
      </div>

      {planView === 'calendario' ? (
        <div className="card p-5">
          {!startDate && isCoach && (
            <p className="text-xs text-gray-500 mb-3">Vista previa desde hoy. Cada corredor verá las fechas según su día de inicio asignado.</p>
          )}
          <PlanCalendar
            plan={plan}
            startDate={startDate ?? new Date()}
            dayDates={planDayDates(plan, startDate ?? new Date())}
            activityByDay={activityByDay}
            isCoach={isCoach}
          />
        </div>
      ) : (
      <div className={`grid grid-cols-1 gap-5 ${isSingleWeek ? '' : 'xl:grid-cols-4'}`}>
        {/* Week selector — hidden for single-week plans (redundant) */}
        {!isSingleWeek && (
        <div className="xl:col-span-1">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Semanas</h2>
          <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
            {plan.semanas.map(s => {
              const wKm = Math.round(s.dias.reduce((sum, d) => sum + (d.distanciaKm ?? 0), 0));
              const isSelected = s.numeroSemana === selectedWeek;
              const desc = s.descripcion?.split('·')[0]?.trim() ?? '';

              // Contar cuántas actividades hay en esta semana (para runner)
              const weekActivityCount = !isCoach
                ? s.dias.filter(d => activityByDay[d.id] != null).length
                : 0;
              const weekTotal = s.dias.filter(d => d.tipo !== 'descanso' && d.tipo !== 'recuperacion_activa').length;

              return (
                <button key={s.numeroSemana}
                  onClick={() => setSelectedWeek(s.numeroSemana)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                    isSelected ? 'bg-brand-500/20 border border-brand-500/30 text-white' : 'text-gray-400 hover:text-white hover:bg-surface-600'
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Semana {s.numeroSemana}</span>
                    <div className="flex items-center gap-1.5">
                      {wKm > 0 && <span className="text-xs text-gray-500">{wKm}km</span>}
                      {!isCoach && weekActivityCount > 0 && (
                        <span className="text-[10px] text-green-400 font-medium">{weekActivityCount}/{weekTotal}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{desc}</p>
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* Week detail */}
        <div className={isSingleWeek ? '' : 'xl:col-span-3'}>
          {week ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  {!isSingleWeek && <h2 className="text-lg font-black text-white">Semana {week.numeroSemana}</h2>}
                  <p className="text-sm text-gray-400">{fixRunTerms(week.descripcion)}</p>
                </div>
                <div className="flex gap-3 text-center">
                  <div className="bg-surface-700 rounded-xl px-3 py-2 border border-white/[0.06]">
                    <p className="text-sm font-black text-white">{weekKm > 0 ? `${weekKm.toFixed(1)}km` : '—'}</p>
                    <p className="text-xs text-gray-500">volumen</p>
                  </div>
                  <div className="bg-surface-700 rounded-xl px-3 py-2 border border-white/[0.06]">
                    <p className="text-sm font-black text-white">{sesiones}</p>
                    <p className="text-xs text-gray-500">sesiones</p>
                  </div>
                </div>
              </div>

              <div
                className="space-y-2"
                onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
              >
                {sortDias(week.dias).map(day => (
                  <DayCard
                    key={day.id}
                    day={day}
                    dayDate={dateForDay(day.diaSemana)}
                    isCoach={isCoach}
                    planId={plan.id}
                    onUpdate={() => qc.invalidateQueries({ queryKey: ['plan', plan.id] })}
                    myActivity={activityByDay[day.id] ?? null}
                    onActivityChange={() => refetchActivities()}
                    isDragging={draggedId === day.id}
                    isDragOver={dragOverId === day.id}
                    onDragStart={() => setDraggedId(day.id)}
                    onDragOver={(e) => { e.preventDefault(); if (draggedId !== day.id) setDragOverId(day.id); }}
                    onDrop={() => handleDrop(day)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="card p-12 text-center text-gray-500">Selecciona una semana</div>
          )}
        </div>
      </div>
      )}

      {/* Edit plan modal (coach) */}
      {editingPlan && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={() => setEditingPlan(false)}>
          <div onClick={e => e.stopPropagation()} className="card w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06] sticky top-0 bg-surface-800 z-10">
              <h2 className="font-black text-white">Editar plan</h2>
              <button onClick={() => setEditingPlan(false)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nombre del plan</label>
                <input value={planForm.nombre} onChange={e => setPlanForm(f => ({ ...f, nombre: e.target.value }))}
                  className="input w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Objetivo</label>
                <input value={planForm.objetivo} onChange={e => setPlanForm(f => ({ ...f, objetivo: e.target.value }))}
                  placeholder="Ej: Media Maratón 21K" className="input w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Filosofía y principios del plan</label>
                <textarea value={planForm.descripcion} onChange={e => setPlanForm(f => ({ ...f, descripcion: e.target.value }))}
                  rows={10} spellCheck lang="es-MX"
                  placeholder="Describe tu enfoque, filosofía y principios para este plan…"
                  className="input w-full text-sm resize-none leading-relaxed" />
                <p className="text-[11px] text-gray-500 mt-1">Este texto es lo que ven los corredores como filosofía del plan. Puedes ajustarlo a tu perspectiva.</p>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-white/[0.06] sticky bottom-0 bg-surface-800">
              <button onClick={() => setEditingPlan(false)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={() => updatePlanMutation.mutate({ nombre: planForm.nombre.trim(), objetivo: planForm.objetivo.trim() || null, descripcion: planForm.descripcion })}
                disabled={updatePlanMutation.isPending || !planForm.nombre.trim()}
                className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
                {updatePlanMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
