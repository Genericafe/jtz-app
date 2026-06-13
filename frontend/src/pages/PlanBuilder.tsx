import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { plansApi } from '../services/api';
import { ArrowLeft, Zap, ChevronRight, Dumbbell, Target, Clock, Check } from 'lucide-react';

const GOALS = [
  { id: '5K',               emoji: '🏃', label: '5K',                    sub: 'Carrera corta · velocidad' },
  { id: '10K',              emoji: '🏃', label: '10K',                   sub: 'Distancia popular' },
  { id: '21K',              emoji: '🏅', label: 'Media Maratón 21K',     sub: '1:30-2:30h objetivo' },
  { id: '42K',              emoji: '🏆', label: 'Maratón 42K',           sub: 'La reina de las distancias' },
  { id: 'trail_21K',        emoji: '🏔️', label: 'Trail 21K',            sub: 'Montaña y terreno técnico' },
  { id: 'trail_42K',        emoji: '🏔️', label: 'Trail 42K',            sub: 'Ultra trail largo' },
  { id: 'ultratrail',       emoji: '⛰️', label: 'Ultratrail 50K+',      sub: 'Distancias extremas' },
  { id: 'hyrox',            emoji: '💥', label: 'HYROX',                 sub: '8 estaciones + carrera' },
  { id: 'crossfit',         emoji: '🔥', label: 'CrossFit / Funcional', sub: 'WODs + cardio' },
  { id: 'triatlon_sprint',  emoji: '🏊', label: 'Triatlón Sprint',      sub: '750m + 20km + 5km' },
  { id: 'triatlon_olimpico',emoji: '🏊', label: 'Triatlón Olímpico',    sub: '1.5km + 40km + 10km' },
  { id: 'ironman_703',      emoji: '🔱', label: 'Ironman 70.3',         sub: '1.9km + 90km + 21km' },
  { id: 'ironman',          emoji: '🔱', label: 'Ironman Full',         sub: '3.8km + 180km + 42km' },
  { id: 'fuerza_resistencia',emoji: '💪', label: 'Fuerza y Resistencia', sub: 'Fitness general' },
];

const NIVELES = [
  { id: 'principiante', label: 'Principiante', sub: 'Menos de 1 año corriendo / entrenando', color: 'text-green-400 bg-green-500/15 border-green-500/30' },
  { id: 'intermedio',   label: 'Intermedio',   sub: '1-3 años, compite regularmente',        color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' },
  { id: 'avanzado',     label: 'Avanzado',     sub: '3+ años, marcas competitivas',           color: 'text-purple-400 bg-purple-500/15 border-purple-500/30' },
  { id: 'elite',        label: 'Elite',        sub: 'Corredor de alto rendimiento',           color: 'text-brand-400 bg-brand-500/15 border-brand-500/30' },
];

// Default modalities per goal (mirrors backend DEFAULT_MODALIDADES)
const DEFAULT_MOD: Record<string, { ciclismo: boolean; natacion: boolean; fuerza: boolean; funcional: boolean }> = {
  '5K':              { ciclismo: false, natacion: false, fuerza: true,  funcional: false },
  '10K':             { ciclismo: false, natacion: false, fuerza: true,  funcional: false },
  '21K':             { ciclismo: false, natacion: false, fuerza: true,  funcional: false },
  '42K':             { ciclismo: false, natacion: false, fuerza: true,  funcional: false },
  trail_21K:         { ciclismo: false, natacion: false, fuerza: true,  funcional: false },
  trail_42K:         { ciclismo: false, natacion: false, fuerza: true,  funcional: false },
  ultratrail:        { ciclismo: false, natacion: false, fuerza: true,  funcional: false },
  hyrox:             { ciclismo: false, natacion: false, fuerza: true,  funcional: true  },
  crossfit:          { ciclismo: false, natacion: false, fuerza: true,  funcional: true  },
  triatlon_sprint:   { ciclismo: true,  natacion: true,  fuerza: false, funcional: false },
  triatlon_olimpico: { ciclismo: true,  natacion: true,  fuerza: false, funcional: false },
  ironman_703:       { ciclismo: true,  natacion: true,  fuerza: false, funcional: false },
  ironman:           { ciclismo: true,  natacion: true,  fuerza: false, funcional: false },
  fuerza_resistencia:{ ciclismo: false, natacion: false, fuerza: true,  funcional: true  },
};

const MODALIDADES_OPTIONS = [
  { key: 'ciclismo',  emoji: '🚴', label: 'Ciclismo',          sub: 'Bicicleta · cross-training sin impacto' },
  { key: 'natacion',  emoji: '🏊', label: 'Natación',           sub: 'Piscina · recuperación activa' },
  { key: 'fuerza',    emoji: '🏋️', label: 'Fuerza / Pesas',   sub: 'Gym · prevención de lesiones' },
  { key: 'funcional', emoji: '⚡', label: 'Funcional / CrossFit', sub: 'WODs · potencia y resistencia' },
] as const;

interface Modalidades { ciclismo: boolean; natacion: boolean; fuerza: boolean; funcional: boolean }

interface PreviewPlan {
  nombre: string; descripcion: string; filosofia: string;
  duracionSemanas: number; volumenPicoKm: number; principios: string[];
  semanas: { numeroSemana: number; fase: string; tipoSemana: string; volumenKm: number; cargaRelativa: number }[];
}

export default function PlanBuilder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState('');
  const [customGoal, setCustomGoal] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [nivel, setNivel] = useState('');
  const [duracion, setDuracion] = useState(12);
  const [sesiones, setSesiones] = useState(5);
  const [kmBase, setKmBase] = useState('');
  const [modalidades, setModalidades] = useState<Modalidades>({ ciclismo: false, natacion: false, fuerza: true, funcional: false });
  const [preview, setPreview] = useState<PreviewPlan | null>(null);

  // Load coach preferences and templates
  const { data: prefsData } = useQuery({ queryKey: ['coach-prefs'], queryFn: () => plansApi.getPreferences() });
  const { data: plansData } = useQuery({ queryKey: ['plans'], queryFn: () => plansApi.list() });

  const templates = (plansData?.data ?? []).filter((p: { isTemplate?: boolean }) => p.isTemplate);

  // Pre-fill from saved preferences on first load
  useEffect(() => {
    const prefs = prefsData?.data;
    if (!prefs) return;
    if (prefs.defaultNivel)    setNivel(prefs.defaultNivel);
    if (prefs.defaultDuracion) setDuracion(prefs.defaultDuracion);
    if (prefs.defaultSesiones) setSesiones(prefs.defaultSesiones);
  }, [prefsData]);

  // Reset modalidades to smart defaults when goal changes
  useEffect(() => {
    if (goal && DEFAULT_MOD[goal]) {
      setModalidades(DEFAULT_MOD[goal]);
    }
  }, [goal]);

  const previewMutation = useMutation({
    mutationFn: (data: object) => plansApi.preview(data),
    onSuccess: (res) => { setPreview(res.data); setStep(4); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Error al conectar con el servidor. Verifica que el backend esté corriendo.');
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: object) => plansApi.generate(data),
    onSuccess: (res) => {
      // Persist coach's choices as preferences for future plans
      plansApi.savePreferences({
        defaultNivel:    nivel,
        defaultDuracion: duracion,
        defaultSesiones: sesiones,
        lastGoal:        goal,
        modalidades,
      }).catch(() => {});
      navigate(`/planes/${res.data.id}`);
    },
  });

  const efectiveGoal = goal || customGoal;

  const config = {
    nivel,
    objetivo: efectiveGoal,
    duracionSemanas: duracion,
    sesionesSemanales: sesiones,
    kmBaseActual: kmBase ? Number(kmBase) : undefined,
    modalidades,
  };

  const tipoColor: Record<string, string> = {
    base: 'bg-green-500', construccion: 'bg-blue-500', peak: 'bg-orange-500',
    recuperacion: 'bg-gray-500', taper: 'bg-purple-500',
  };

  const toggleMod = (key: keyof Modalidades) => {
    setModalidades(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => step > 1 ? setStep(step - 1) : navigate('/planes')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-white mb-5 transition-colors">
        <ArrowLeft size={16} /> {step > 1 ? 'Atrás' : 'Planes'}
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <Zap size={24} className="text-brand-400" /> Crear plan inteligente
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">Basado en directrices World Athletics, HYROX, World Triathlon e Ironman</p>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1 mb-8">
        {['Objetivo', 'Nivel', 'Detalles', 'Vista previa'].map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1.5 rounded-full mb-1 transition-all ${i + 1 <= step ? 'bg-brand-500' : 'bg-surface-600'}`} />
            <p className={`text-xs text-center ${i + 1 === step ? 'text-white font-semibold' : 'text-gray-600'}`}>{label}</p>
          </div>
        ))}
      </div>

      {/* Step 1: Goal */}
      {step === 1 && (
        <div>
          {/* Saved templates shortcut */}
          {templates.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-yellow-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                ⭐ Plantillas guardadas
              </p>
              <div className="flex flex-wrap gap-2">
                {templates.map((t: { id: number; nombre: string; nivel: string; objetivo?: string; duracionSemanas: number }) => (
                  <button key={t.id} onClick={() => navigate(`/planes/${t.id}`)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/25 text-yellow-300 text-xs font-semibold hover:bg-yellow-500/20 transition-all">
                    <span>{t.nombre}</span>
                    <ChevronRight size={12} />
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-1">Abre una plantilla para ver su estructura o asignarla directamente</p>
            </div>
          )}

          <h2 className="text-lg font-bold text-white mb-4">¿Cuál es la misión del corredor?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GOALS.map(g => (
              <button key={g.id} onClick={() => { setGoal(g.id); setCustomGoal(''); setShowCustomInput(false); setStep(2); }}
                className="flex items-center gap-3 p-4 rounded-xl border border-white/[0.06] bg-surface-700 hover:bg-surface-600 hover:border-brand-500/40 transition-all text-left group">
                <span className="text-2xl">{g.emoji}</span>
                <div className="flex-1">
                  <p className="font-bold text-white text-sm">{g.label}</p>
                  <p className="text-xs text-gray-500">{g.sub}</p>
                </div>
                <ChevronRight size={16} className="text-gray-600 group-hover:text-brand-400 transition-colors" />
              </button>
            ))}

            {/* Custom / free-text goal */}
            {!showCustomInput ? (
              <button onClick={() => { setGoal(''); setShowCustomInput(true); }}
                className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-white/[0.12] bg-surface-800 hover:bg-surface-700 hover:border-brand-500/40 transition-all text-left group">
                <span className="text-2xl">✏️</span>
                <div className="flex-1">
                  <p className="font-bold text-white text-sm">Otro / Personalizado</p>
                  <p className="text-xs text-gray-500">Escribe el objetivo manualmente</p>
                </div>
                <ChevronRight size={16} className="text-gray-600 group-hover:text-brand-400 transition-colors" />
              </button>
            ) : (
              <div className="sm:col-span-2 flex flex-col gap-2 p-4 rounded-xl border border-brand-500/40 bg-surface-700">
                <label className="text-xs font-semibold text-brand-400">Objetivo personalizado</label>
                <input
                  autoFocus
                  value={customGoal}
                  onChange={e => setCustomGoal(e.target.value)}
                  placeholder="Ej: Carrera de montaña 30K, Resistencia general, etc."
                  className="input w-full text-sm"
                />
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setShowCustomInput(false)}
                    className="flex-1 py-2 rounded-xl border border-white/[0.08] text-xs text-gray-400 hover:text-white transition-colors">
                    Cancelar
                  </button>
                  <button
                    disabled={!customGoal.trim()}
                    onClick={() => { setGoal(''); setStep(2); }}
                    className="flex-1 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-colors disabled:opacity-40">
                    Continuar →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Level */}
      {step === 2 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Nivel del corredor</h2>
          <p className="text-sm text-gray-400 mb-5">Meta: {GOALS.find(g => g.id === goal)?.label ?? customGoal}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {NIVELES.map(n => (
              <button key={n.id} onClick={() => { setNivel(n.id); setStep(3); }}
                className={`flex items-center gap-4 p-5 rounded-xl border transition-all text-left ${n.color} hover:scale-[1.02]`}>
                <div>
                  <p className="font-black text-white text-base">{n.label}</p>
                  <p className="text-xs opacity-80 mt-0.5">{n.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Details + Modalidades */}
      {step === 3 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Parámetros del plan</h2>
          <p className="text-sm text-gray-400 mb-5">{GOALS.find(g => g.id === goal)?.label ?? customGoal} · {NIVELES.find(n => n.id === nivel)?.label}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
            <div className="card p-5">
              <label className="flex items-center gap-2 text-sm font-bold text-white mb-3">
                <Clock size={15} className="text-brand-400" /> Duración del plan
              </label>
              <div className="flex items-center gap-3">
                <input type="range" min={4} max={28} step={2} value={duracion}
                  onChange={e => setDuracion(Number(e.target.value))}
                  className="flex-1 accent-brand-500" />
                <span className="text-xl font-black text-brand-400 w-16 text-right">{duracion} sem</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {duracion < 8 ? 'Corto — ideal para mantenimiento o objetivo próximo' :
                 duracion < 14 ? 'Medio — tiempo adecuado para objetivo específico' :
                 duracion < 20 ? 'Largo — preparación completa con buenas adaptaciones' :
                 'Muy largo — programas de élite o distancias extremas'}
              </p>
            </div>

            <div className="card p-5">
              <label className="flex items-center gap-2 text-sm font-bold text-white mb-3">
                <Dumbbell size={15} className="text-brand-400" /> Sesiones por semana
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[3, 4, 5, 6, 7].map(n => (
                  <button key={n} onClick={() => setSesiones(n)}
                    className={`py-3 rounded-xl font-black text-sm transition-all ${sesiones === n ? 'bg-brand-500 text-white shadow-glow-sm' : 'bg-surface-600 text-gray-400 hover:text-white'}`}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {sesiones <= 3 ? 'Mínimo recomendado — necesita días de recuperación' :
                 sesiones <= 4 ? 'Estándar — equilibrio trabajo/recuperación' :
                 sesiones <= 5 ? 'Intermedio-Avanzado — alta eficiencia' :
                 'Avanzado — requiere buena base y recuperación activa'}
              </p>
            </div>

            <div className="card p-5 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm font-bold text-white mb-3">
                <Target size={15} className="text-brand-400" /> Base actual de km/semana <span className="text-gray-500 font-normal">(opcional)</span>
              </label>
              <input type="number" value={kmBase} onChange={e => setKmBase(e.target.value)}
                placeholder="Ej: 30 — ayuda al generador a calibrar el punto de partida"
                className="input w-full" />
            </div>
          </div>

          {/* Modalidades */}
          <div className="card p-5 mb-6">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap size={15} className="text-brand-400" /> Modalidades de entrenamiento
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Selecciona qué tipos de entrenamiento puede realizar el corredor. El plan solo incluirá las modalidades activadas.
              </p>
            </div>

            {/* Running siempre activo */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-500/10 border border-brand-500/25 mb-2">
              <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
                <Check size={14} className="text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>🏃</span>
                  <p className="text-sm font-semibold text-white">Carrera / Running</p>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400">Siempre activo</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Rodaje fácil, largo, tempo, intervalos — base del plan</p>
              </div>
            </div>

            {/* Opcionales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MODALIDADES_OPTIONS.map(({ key, emoji, label, sub }) => {
                const active = modalidades[key as keyof Modalidades];
                return (
                  <button
                    key={key}
                    onClick={() => toggleMod(key as keyof Modalidades)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      active
                        ? 'bg-surface-600 border-white/[0.12] text-white'
                        : 'bg-surface-800 border-white/[0.04] text-gray-500 hover:border-white/[0.08] hover:text-gray-300'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                      active ? 'bg-brand-500' : 'bg-surface-600'
                    }`}>
                      {active
                        ? <Check size={14} className="text-white" />
                        : <span className="text-xs opacity-50">○</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span>{emoji}</span>
                        <p className="text-sm font-semibold leading-tight">{label}</p>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-gray-600 mt-3 italic">
              Sugerencia para {GOALS.find(g => g.id === goal)?.label}: las modalidades están pre-configuradas según el objetivo. Puedes ajustarlas libremente.
            </p>
          </div>

          <button onClick={() => previewMutation.mutate(config)} disabled={previewMutation.isPending}
            className="btn-primary px-8 py-3.5 text-sm font-bold flex items-center gap-2 mx-auto">
            <Zap size={16} />
            {previewMutation.isPending ? 'Generando plan...' : 'Generar plan →'}
          </button>
          {previewMutation.isPending && (
            <p className="text-center text-xs text-gray-500 mt-2">Aplicando directrices World Athletics / HYROX / Ironman...</p>
          )}
        </div>
      )}

      {/* Step 4: Preview */}
      {step === 4 && preview && (
        <div>
          <div className="card p-6 mb-5">
            <h2 className="text-xl font-black text-white mb-1">{preview.nombre}</h2>
            <div className="flex gap-3 mb-4 flex-wrap">
              <span className="badge bg-brand-500/15 text-brand-400">{preview.duracionSemanas} semanas</span>
              <span className="badge bg-blue-500/15 text-blue-400">Pico: {preview.volumenPicoKm} km/sem</span>
              {/* Active modalities summary */}
              {[
                '🏃 Carrera',
                modalidades.ciclismo  && '🚴 Ciclismo',
                modalidades.natacion  && '🏊 Natación',
                modalidades.fuerza    && '🏋️ Fuerza',
                modalidades.funcional && '⚡ Funcional',
              ].filter(Boolean).map(m => (
                <span key={String(m)} className="badge bg-surface-500 text-gray-300">{m}</span>
              ))}
            </div>
            <p className="text-sm text-gray-300 leading-relaxed mb-4">{preview.filosofia}</p>

            {/* Volume chart */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Progresión de carga</p>
              <div className="flex items-end gap-0.5 h-16">
                {preview.semanas.map(s => {
                  const h = Math.max(8, (s.volumenKm / preview.volumenPicoKm) * 64);
                  const color = tipoColor[s.tipoSemana] ?? 'bg-gray-500';
                  return (
                    <div key={s.numeroSemana} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`Sem ${s.numeroSemana}: ${s.volumenKm}km`}>
                      <div className={`w-full ${color} rounded-t-sm opacity-80 group-hover:opacity-100 transition-opacity`} style={{ height: h }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-2 flex-wrap">
                {Object.entries(tipoColor).map(([tipo, color]) => (
                  <span key={tipo} className="flex items-center gap-1 text-xs text-gray-500">
                    <span className={`w-2 h-2 rounded-full ${color}`}/>{tipo.replace('_',' ')}
                  </span>
                ))}
              </div>
            </div>

            <details className="group">
              <summary className="text-xs font-semibold text-gray-400 cursor-pointer hover:text-white flex items-center gap-1">
                <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                Principios científicos del plan ({preview.principios.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {preview.principios.map((p, i) => (
                  <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                    <span className="text-brand-400 mt-0.5 flex-shrink-0">✓</span>{p}
                  </li>
                ))}
              </ul>
            </details>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">
              ← Modificar parámetros
            </button>
            <button onClick={() => saveMutation.mutate(config)} disabled={saveMutation.isPending}
              className="flex-1 btn-primary py-3 text-sm font-bold flex items-center justify-center gap-2">
              <Zap size={15} />
              {saveMutation.isPending ? 'Guardando plan...' : 'Guardar y personalizar →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
