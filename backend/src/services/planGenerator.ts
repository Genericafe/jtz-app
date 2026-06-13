/**
 * JTZ Training Plan Generator
 * Based on: World Athletics (IAAF), USATF, Running USA, HYROX official guidelines,
 * World Triathlon, Ironman training standards, CrossFit methodology.
 * Key principles: 80/20 rule, 10% volume progression, periodization, sport specificity.
 */

export type Nivel = 'principiante' | 'intermedio' | 'avanzado' | 'elite';
export type Objetivo =
  | '5K' | '10K' | '21K' | '42K'
  | 'trail_21K' | 'trail_42K' | 'ultratrail'
  | 'hyrox' | 'crossfit'
  | 'triatlon_sprint' | 'triatlon_olimpico' | 'ironman_703' | 'ironman'
  | 'fuerza_resistencia';

export interface Modalidades {
  ciclismo:  boolean; // cross-training en bicicleta
  natacion:  boolean; // natación
  fuerza:    boolean; // fuerza / pesas en gym
  funcional: boolean; // CrossFit / entrenamiento funcional
}

export const DEFAULT_MODALIDADES: Record<Objetivo, Modalidades> = {
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

export interface PlanConfig {
  nivel: Nivel;
  objetivo: Objetivo;
  duracionSemanas: number;
  sesionesSemanales: number;
  kmBaseActual?: number;
  nombreCorredor?: string;
  modalidades?: Partial<Modalidades>;
}

export interface DiaGenerado {
  diaSemana: string;
  tipo: string;
  distanciaKm?: number;
  duracionMin?: number;
  intensidad: string;
  descripcion: string;
  zona?: string;
}

export interface SemanaGenerada {
  numeroSemana: number;
  fase: string;
  tipoSemana: 'base' | 'construccion' | 'peak' | 'recuperacion' | 'taper';
  descripcion: string;
  volumenKm: number;
  cargaRelativa: number;
  dias: DiaGenerado[];
}

export interface PlanGenerado {
  nombre: string;
  descripcion: string;
  filosofia: string;
  nivel: string;
  objetivo: string;
  duracionSemanas: number;
  sesionesSemanales: number;
  volumenPicoKm: number;
  principios: string[];
  semanas: SemanaGenerada[];
}

// ─── Reference data ───────────────────────────────────────────────────────────

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const OBJETIVO_LABELS: Record<Objetivo, string> = {
  '5K': '5K', '10K': '10K', '21K': 'Media Maratón 21K', '42K': 'Maratón 42K',
  trail_21K: 'Trail 21K', trail_42K: 'Trail 42K', ultratrail: 'Ultratrail 50K+',
  hyrox: 'HYROX', crossfit: 'CrossFit / Fitness Funcional',
  triatlon_sprint: 'Triatlón Sprint', triatlon_olimpico: 'Triatlón Olímpico',
  ironman_703: 'Ironman 70.3', ironman: 'Ironman Full',
  fuerza_resistencia: 'Fuerza y Resistencia General',
};

const PEAK_KM: Record<Objetivo, Record<Nivel, number>> = {
  '5K':             { principiante: 30,  intermedio: 50,  avanzado: 75,  elite: 100 },
  '10K':            { principiante: 40,  intermedio: 65,  avanzado: 90,  elite: 120 },
  '21K':            { principiante: 55,  intermedio: 80,  avanzado: 110, elite: 150 },
  '42K':            { principiante: 70,  intermedio: 100, avanzado: 140, elite: 190 },
  trail_21K:        { principiante: 45,  intermedio: 70,  avanzado: 100, elite: 140 },
  trail_42K:        { principiante: 60,  intermedio: 90,  avanzado: 130, elite: 175 },
  ultratrail:       { principiante: 80,  intermedio: 110, avanzado: 150, elite: 200 },
  hyrox:            { principiante: 25,  intermedio: 40,  avanzado: 60,  elite: 80  },
  crossfit:         { principiante: 15,  intermedio: 25,  avanzado: 40,  elite: 55  },
  triatlon_sprint:  { principiante: 20,  intermedio: 35,  avanzado: 55,  elite: 75  },
  triatlon_olimpico:{ principiante: 30,  intermedio: 50,  avanzado: 75,  elite: 100 },
  ironman_703:      { principiante: 50,  intermedio: 75,  avanzado: 110, elite: 150 },
  ironman:          { principiante: 65,  intermedio: 100, avanzado: 145, elite: 200 },
  fuerza_resistencia:{ principiante: 20, intermedio: 35,  avanzado: 55,  elite: 75  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function r(n: number, d = 1) { return Math.round(n * 10 ** d) / 10 ** d; }

function phaseSplit(total: number): { base: number; build: number; peak: number; taper: number } {
  if (total <= 8)  return { base: 3, build: 3, peak: 1, taper: 1 };
  if (total <= 12) return { base: 4, build: 4, peak: 2, taper: 2 };
  if (total <= 16) return { base: 5, build: 6, peak: 3, taper: 2 };
  if (total <= 20) return { base: 6, build: 8, peak: 4, taper: 2 };
  return              { base: 7, build: 10, peak: 5, taper: Math.max(2, total - 22) };
}

function phaseOf(week: number, phases: ReturnType<typeof phaseSplit>): SemanaGenerada['tipoSemana'] {
  const { base, build, peak } = phases;
  if (week <= base) return week % 4 === 0 ? 'recuperacion' : 'base';
  if (week <= base + build) return week % 4 === 0 ? 'recuperacion' : 'construccion';
  if (week <= base + build + peak) return 'peak';
  return 'taper';
}

function volumen(week: number, peak: number, phases: ReturnType<typeof phaseSplit>, _total: number): number {
  const tipo = phaseOf(week, phases);
  const base = peak * 0.55;
  const { base: b, build, peak: p } = phases;

  if (tipo === 'recuperacion') return r(peak * 0.65);
  if (tipo === 'base') {
    const prog = (week - 1) / (b - 1 || 1);
    return r(base + (peak * 0.78 - base) * prog);
  }
  if (tipo === 'construccion') {
    const prog = (week - b - 1) / (build - 1 || 1);
    return r(peak * 0.78 + (peak - peak * 0.78) * prog);
  }
  if (tipo === 'peak') return r(peak * (1 - (week - b - build - 1) * 0.05));
  const taperWeek = week - (b + build + p);
  const taperFactor = 1 - (taperWeek / phases.taper) * 0.55;
  return r(peak * taperFactor);
}

// ─── Day session builders ──────────────────────────────────────────────────────

function rodajeFacil(km: number, extra = ''): DiaGenerado {
  return {
    diaSemana: '', tipo: 'rodaje_facil', distanciaKm: r(km),
    intensidad: 'suave', zona: 'Zona 1-2 (60-70% FCM)',
    descripcion: `Rodaje fácil ${km}km a ritmo conversacional. ${extra}Debes poder hablar sin dificultad. Activa el sistema aeróbico sin generar fatiga acumulada.`,
  };
}

function rodajeLargo(km: number, extra = ''): DiaGenerado {
  return {
    diaSemana: '', tipo: 'rodaje_largo', distanciaKm: r(km),
    intensidad: 'suave-moderado', zona: 'Zona 1-2 (65-75% FCM)',
    descripcion: `Rodaje largo ${km}km. ${extra}Los últimos 20-30% a ritmo objetivo de carrera. Fundamental para adaptaciones cardiovasculares y musculares de larga distancia.`,
  };
}

function tempo(km: number, extra = ''): DiaGenerado {
  return {
    diaSemana: '', tipo: 'tempo', distanciaKm: r(km),
    intensidad: 'moderado-intenso', zona: 'Zona 3-4 (80-88% FCM)',
    descripcion: `Tempo/umbral ${km}km. ${extra}Calentamiento 2km + ${km - 4}km a ritmo de umbral anaeróbico + enfriamiento 2km. Mejora la capacidad de sostener ritmos altos.`,
  };
}

function intervalos(reps: number, distM: number, series = 1, extra = ''): DiaGenerado {
  const km = r((reps * distM * series) / 1000 + 3);
  return {
    diaSemana: '', tipo: 'intervalos', distanciaKm: km,
    duracionMin: Math.round(km * 5.5),
    intensidad: 'intenso', zona: 'Zona 4-5 (88-96% FCM)',
    descripcion: `Intervalos: ${series > 1 ? series + 'x(' : ''}${reps}x${distM}m con recuperación 90s${series > 1 ? ')' : ''}. ${extra}Calentamiento 2km + series + enfriamiento 1km. Mejora VO₂máx y economía de carrera.`,
  };
}

function fuerza(tipo: 'general' | 'funcional' | 'tren_inferior' | 'core', min = 45): DiaGenerado {
  const descripciones = {
    general:     'Fuerza general: sentadillas 4x12, peso muerto 4x10, press banca 4x10, dominadas 4x8, plancha 4x45s, lunges 3x12. Base de fuerza funcional.',
    funcional:   'Fuerza funcional: thrusters 4x12, kettlebell swings 4x15, box jumps 3x10, push press 4x10, pull-ups 4x8, burpees 3x15. Potencia y resistencia muscular.',
    tren_inferior:'Tren inferior: sentadillas búlgaras 4x10, hip thrust 4x15, step-ups 3x12, calf raises 4x20, nordic curl 3x8. Prevención de lesiones y potencia de zancada.',
    core:        'Core y estabilidad: planchas laterales 3x45s, bird-dog 3x12, dead bug 3x10, hollow hold 3x30s, GHD sit-ups 3x15, Russian twist 3x20. Estabilidad para carrera eficiente.',
  };
  return {
    diaSemana: '', tipo: 'fuerza', duracionMin: min,
    intensidad: 'moderado', zona: 'RPE 6-7/10',
    descripcion: descripciones[tipo],
  };
}

function crossTraining(tipo: 'bicicleta' | 'natacion' | 'eliptica', min: number): DiaGenerado {
  const desc: Record<string, string> = {
    bicicleta: `Bicicleta ${min}min a intensidad moderada (Z2). Mantiene forma aeróbica sin impacto. Ideal para recuperación activa.`,
    natacion:  `Natación ${min}min técnica + aeróbico. Excelente para recuperación muscular y mejora de capacidad pulmonar.`,
    eliptica:  `Elíptica ${min}min Z2. Cardiovascular sin impacto, ideal después de días duros.`,
  };
  return {
    diaSemana: '', tipo: 'cross_training', duracionMin: min,
    intensidad: 'suave-moderado', zona: 'Zona 2 (70-75% FCM)',
    descripcion: desc[tipo],
  };
}

function descanso(activo = false): DiaGenerado {
  return {
    diaSemana: '', tipo: activo ? 'recuperacion_activa' : 'descanso',
    duracionMin: activo ? 30 : 0,
    intensidad: activo ? 'muy_suave' : 'descanso',
    descripcion: activo
      ? 'Recuperación activa: caminata 30min + movilidad articular 15min + foam rolling. Facilita la recuperación sin generar estrés.'
      : 'Descanso completo. Esencial para la supercompensación y adaptación al entrenamiento. Hidratación, sueño y nutrición adecuados.',
  };
}

function hyroxSession(semana: number, totalSemanas: number): DiaGenerado {
  const weeks4 = Math.floor(totalSemanas / 4);
  const phase = Math.floor((semana - 1) / weeks4);
  const sesiones = [
    'Simulacro HYROX parcial: 2x(1km + ski erg 1000m + sled push 50m + sled pull 50m). Aprende la estructura de la carrera y gestiona transiciones.',
    'HYROX funcional: 4x(1km + burpee broad jumps 80m + rowing 1000m). Intensidad Z3-4. Construye resistencia específica.',
    'HYROX intensivo: 6x(1km + wall balls 100 + sandbag lunges 200m + farmers carry 200m). Simula fatiga de competencia. Gestión de pace.',
    'HYROX completo simulacro: 8x(1km + una estación HYROX). Pace de competencia. Transiciones rápidas. Máxima especificidad.',
  ];
  return {
    diaSemana: '', tipo: 'hyrox_especifico',
    duracionMin: 60 + phase * 15,
    intensidad: ['moderado', 'moderado-intenso', 'intenso', 'máximo'][phase] ?? 'intenso',
    zona: 'Zona 3-4 (80-90% FCM)',
    descripcion: sesiones[Math.min(phase, 3)],
  };
}

function brickWorkout(bikeMin: number, runKm: number): DiaGenerado {
  return {
    diaSemana: '', tipo: 'brick_triatlon',
    duracionMin: bikeMin + Math.round(runKm * 5.5),
    distanciaKm: runKm,
    intensidad: 'moderado-intenso', zona: 'Zona 3 (75-85% FCM)',
    descripcion: `Brick: bicicleta ${bikeMin}min Z3 + carrera inmediata ${runKm}km a ritmo objetivo. Adapta al cuerpo a la transición ciclismo-carrera. Fundamental en triatlón.`,
  };
}

function nadando(metros: number, focus: string): DiaGenerado {
  return {
    diaSemana: '', tipo: 'natacion',
    duracionMin: Math.round(metros / 40),
    intensidad: 'moderado', zona: 'Zona 2-3',
    descripcion: `Natación ${metros}m: ${focus}. Calentamiento 200m + series principales + vuelta a la calma 200m.`,
  };
}

function serraniaTrail(km: number, desnivel: number): DiaGenerado {
  return {
    diaSemana: '', tipo: 'trail_tecnico', distanciaKm: km,
    intensidad: 'moderado', zona: 'Zona 2-3 (70-80% FCM) + gestión de técnica',
    descripcion: `Trail técnico ${km}km / D+ ${desnivel}m. Enfócate en técnica de descenso, uso de bastones (si aplica), hidratación cada 4-5km. Mantén RPE 6-7 subidas, libre en llanos.`,
  };
}

// ─── Substitutor: replaces a session with a running equivalent when a modality is disabled ──

function substituirConRodaje(km: number, intensidad: 'facil' | 'moderado' = 'facil'): DiaGenerado {
  if (intensidad === 'moderado') {
    return {
      diaSemana: '', tipo: 'rodaje_moderado', distanciaKm: r(km),
      intensidad: 'moderado', zona: 'Zona 2-3 (70-78% FCM)',
      descripcion: `Rodaje moderado ${km}km. Ritmo cómodo pero constante. Desarrolla eficiencia aeróbica y economía de carrera.`,
    };
  }
  return rodajeFacil(km);
}

// ─── Plan assembler per goal ───────────────────────────────────────────────────

function buildWeek(
  semana: number,
  tipo: SemanaGenerada['tipoSemana'],
  vol: number,
  sessions: number,
  objetivo: Objetivo,
  nivel: Nivel,
  fase: string,
  totalSemanas: number,
  mod: Modalidades,
): SemanaGenerada {
  const dias: DiaGenerado[] = buildDias(semana, tipo, vol, sessions, objetivo, nivel, totalSemanas, mod);

  return {
    numeroSemana: semana,
    fase,
    tipoSemana: tipo,
    descripcion: weekDescription(tipo, semana, objetivo),
    volumenKm: r(dias.reduce((s, d) => s + (d.distanciaKm ?? 0), 0)),
    cargaRelativa: tipo === 'taper' ? 50 : tipo === 'recuperacion' ? 65 : tipo === 'peak' ? 100 : 75,
    dias,
  };
}

function weekDescription(tipo: SemanaGenerada['tipoSemana'], semana: number, _objetivo: Objetivo): string {
  const desc: Record<SemanaGenerada['tipoSemana'], string> = {
    base:        'Semana de base: construye tu fundamento aeróbico. 80% fácil, 20% fuerza. Establece hábitos de entrenamiento.',
    construccion:'Semana de construcción: aumenta volumen e introduce trabajo de calidad. Intervalos y tempo.',
    peak:        'Semana pico: máxima carga. Sesiones de alta calidad. Descansa bien entre sesiones duras.',
    recuperacion:'Semana de recuperación: baja el volumen 20-30%. Permite la supercompensación y adaptación muscular.',
    taper:       `Semana ${semana} de tapering: reduce volumen pero mantén intensidad. Tu cuerpo se carga para la competencia.`,
  };
  return desc[tipo];
}

function buildDias(
  semana: number,
  tipo: SemanaGenerada['tipoSemana'],
  vol: number,
  sessions: number,
  objetivo: Objetivo,
  nivel: Nivel,
  totalSemanas: number,
  mod: Modalidades,
): DiaGenerado[] {

  const schedule: DiaGenerado[] = DIAS.map(d => ({ ...descanso(false), diaSemana: d }));
  const factor = tipo === 'recuperacion' ? 0.65 : tipo === 'taper' ? 0.5 : 1;
  const fv = factor;

  function assign(idx: number, day: DiaGenerado) {
    schedule[idx] = { ...day, diaSemana: DIAS[idx] };
  }

  // Helper: choose cross-training or running fallback
  function crossOrRun(km: number, ciclMin = 45): DiaGenerado {
    if (mod.ciclismo) return crossTraining('bicicleta', ciclMin);
    return substituirConRodaje(r(km), 'facil');
  }

  // Helper: choose strength or running fallback
  function fuerzaOrRun(tipo_f: 'general' | 'funcional' | 'tren_inferior' | 'core', kmFallback: number): DiaGenerado {
    if (mod.fuerza) return fuerza(tipo_f);
    return substituirConRodaje(r(kmFallback), 'facil');
  }

  // Helper: choose funcional or fuerza or running fallback
  function funcionalOrFallback(tipo_f: 'general' | 'funcional' | 'tren_inferior' | 'core', kmFallback: number): DiaGenerado {
    if (mod.funcional) return fuerza('funcional');
    if (mod.fuerza) return fuerza(tipo_f);
    return substituirConRodaje(r(kmFallback), 'facil');
  }

  // Helper: swimming or running fallback
  function natOrRun(metros: number, focus: string, kmFallback: number): DiaGenerado {
    if (mod.natacion) return nadando(metros, focus);
    return substituirConRodaje(r(kmFallback), 'facil');
  }

  // ─── Running plans (5K / 10K / 21K / 42K) ─────────────────────────────────
  if (['5K', '10K', '21K', '42K'].includes(objetivo)) {
    const longRun = objetivo === '5K' ? vol * 0.28 : objetivo === '10K' ? vol * 0.30 : objetivo === '21K' ? vol * 0.33 : vol * 0.35;
    const midRun  = vol * 0.18;
    const easyRun = vol * 0.14;
    const tempoKm = objetivo === '5K' ? 8 : objetivo === '10K' ? 10 : objetivo === '21K' ? 12 : 14;

    if (sessions >= 5) {
      assign(0, tipo === 'recuperacion' ? descanso(true) : crossOrRun(easyRun * 0.7));
      assign(1, tipo === 'peak' ? intervalos(8, objetivo === '5K' ? 400 : 800) : rodajeFacil(r(easyRun * fv)));
      assign(2, tipo !== 'taper' ? fuerzaOrRun(nivel === 'principiante' ? 'general' : 'tren_inferior', easyRun * 0.8) : descanso(true));
      assign(3, tipo !== 'recuperacion' ? tempo(r(tempoKm * fv)) : rodajeFacil(r(easyRun * 0.7)));
      assign(4, descanso(false));
      assign(5, tipo === 'taper' ? rodajeFacil(r(midRun * 0.5)) : rodajeFacil(r(midRun * fv)));
      assign(6, rodajeLargo(r(longRun * fv), objetivo === '42K' ? 'Últimos 10km a ritmo de maratón. ' : ''));
    } else if (sessions === 4) {
      assign(0, descanso(false));
      assign(1, tipo === 'peak' ? intervalos(6, 1000) : rodajeFacil(r(easyRun * fv)));
      assign(2, fuerzaOrRun('general', easyRun * 0.8));
      assign(3, tempo(r(tempoKm * fv)));
      assign(4, descanso(false));
      assign(5, rodajeFacil(r(midRun * fv)));
      assign(6, rodajeLargo(r(longRun * fv)));
    } else {
      assign(1, rodajeFacil(r(easyRun * fv)));
      assign(3, tipo === 'peak' ? intervalos(5, 800) : tempo(r(tempoKm * 0.8 * fv)));
      assign(5, rodajeFacil(r(midRun * fv)));
      assign(6, rodajeLargo(r(longRun * fv)));
    }
  }

  // ─── Trail ────────────────────────────────────────────────────────────────
  else if (objetivo.startsWith('trail') || objetivo === 'ultratrail') {
    const desnivel = nivel === 'principiante' ? 400 : nivel === 'intermedio' ? 700 : 1000;
    assign(0, descanso(true));
    assign(1, rodajeFacil(r(vol * 0.14 * fv), 'Terreno variado. '));
    assign(2, fuerzaOrRun('tren_inferior', vol * 0.12 * fv));
    assign(3, serraniaTrail(r(vol * 0.18 * fv), desnivel));
    assign(4, descanso(false));
    assign(5, tipo !== 'peak' ? fuerzaOrRun('core', vol * 0.12 * fv) : intervalos(6, 400, 1, 'En cuesta 8-12%. '));
    assign(6, serraniaTrail(r(vol * 0.35 * fv), desnivel * 2));
  }

  // ─── HYROX ────────────────────────────────────────────────────────────────
  else if (objetivo === 'hyrox') {
    assign(0, descanso(true));
    assign(1, funcionalOrFallback('funcional', vol * 0.2 * fv));
    assign(2, rodajeFacil(r(vol * 0.25 * fv)));
    assign(3, hyroxSession(semana, totalSemanas));
    assign(4, fuerzaOrRun('tren_inferior', vol * 0.2 * fv));
    assign(5, tipo !== 'recuperacion' ? rodajeFacil(r(vol * 0.35 * fv)) : descanso(true));
    assign(6, tipo !== 'taper' ? hyroxSession(Math.min(semana + 1, totalSemanas), totalSemanas) : rodajeFacil(r(vol * 0.2 * fv)));
  }

  // ─── CrossFit / Funcional ─────────────────────────────────────────────────
  else if (objetivo === 'crossfit') {
    assign(0, funcionalOrFallback('funcional', vol * 0.2 * fv));
    assign(1, rodajeFacil(r(vol * 0.3 * fv)));
    assign(2, fuerzaOrRun('general', vol * 0.2 * fv));
    assign(3, {
      diaSemana: '', tipo: 'wod_crossfit', duracionMin: 60,
      intensidad: 'intenso', zona: 'RPE 8-9/10',
      descripcion: `WOD: ${semana % 2 === 0 ? 'AMRAP 20min: 400m run + 15 wall balls + 10 pull-ups + 5 clean & jerk' : 'For Time: 5 rounds 800m run + 20 box jumps + 15 T2B + 10 deadlift @75% 1RM'}. Escala según nivel.`,
    });
    assign(4, descanso(true));
    assign(5, fuerzaOrRun('core', vol * 0.15 * fv));
    assign(6, tipo !== 'recuperacion' ? {
      diaSemana: '', tipo: 'wod_crossfit_largo', duracionMin: 75,
      intensidad: 'moderado-intenso', zona: 'RPE 7-8/10',
      descripcion: 'Hero WOD o chipper largo: trabajo de resistencia muscular y cardiovascular. Escala de forma que puedas completar sin comprometer técnica.',
    } : descanso(true));
  }

  // ─── Triatlón Sprint / Olímpico ───────────────────────────────────────────
  else if (objetivo === 'triatlon_sprint' || objetivo === 'triatlon_olimpico') {
    const isOlimpico = objetivo === 'triatlon_olimpico';
    assign(0, natOrRun(isOlimpico ? 2500 : 1500, 'Técnica de crol + series aeróbicas 8x50m', vol * 0.15 * fv));
    assign(1, mod.ciclismo ? crossTraining('bicicleta', isOlimpico ? 75 : 50) : rodajeFacil(r(vol * 0.18 * fv)));
    assign(2, rodajeFacil(r(vol * 0.25 * fv)));
    assign(3, natOrRun(isOlimpico ? 3000 : 2000, 'Resistencia: 10x100m a ritmo de carrera con 20s desc', vol * 0.18 * fv));
    assign(4, descanso(false));
    assign(5, (mod.ciclismo && mod.natacion) ? brickWorkout(isOlimpico ? 90 : 60, r(vol * 0.2 * fv)) : rodajeLargo(r(vol * 0.3 * fv)));
    assign(6, tipo !== 'recuperacion' ? rodajeLargo(r(vol * 0.3 * fv)) : descanso(true));
  }

  // ─── Ironman ──────────────────────────────────────────────────────────────
  else if (objetivo === 'ironman_703' || objetivo === 'ironman') {
    const is703 = objetivo === 'ironman_703';
    const bikeMin = is703 ? 150 : 240;
    assign(0, natOrRun(is703 ? 3500 : 5000, 'Técnica + resistencia aeróbica', vol * 0.2 * fv));
    assign(1, mod.ciclismo ? crossTraining('bicicleta', bikeMin * 0.4) : rodajeFacil(r(vol * 0.2 * fv)));
    assign(2, rodajeFacil(r(vol * 0.18 * fv)));
    assign(3, natOrRun(is703 ? 2500 : 3500, 'Velocidad: 20x50m sprint + 5x200m Z3', vol * 0.15 * fv));
    assign(4, fuerzaOrRun('core', vol * 0.12 * fv));
    assign(5, (mod.ciclismo && mod.natacion) ? brickWorkout(bikeMin * 0.7, r(vol * 0.25 * fv)) : rodajeLargo(r(vol * 0.35 * fv)));
    assign(6, rodajeLargo(r(vol * 0.35 * fv)));
  }

  // ─── Fuerza y Resistencia General ─────────────────────────────────────────
  else {
    assign(0, fuerzaOrRun('general', vol * 0.2 * fv));
    assign(1, rodajeFacil(r(vol * 0.25 * fv)));
    assign(2, funcionalOrFallback('funcional', vol * 0.2 * fv));
    assign(3, tipo === 'peak' ? intervalos(6, 800) : rodajeFacil(r(vol * 0.2 * fv)));
    assign(4, descanso(true));
    assign(5, fuerzaOrRun('tren_inferior', vol * 0.2 * fv));
    assign(6, rodajeLargo(r(vol * 0.3 * fv)));
  }

  return schedule;
}

// ─── Main generator ───────────────────────────────────────────────────────────

const KNOWN_GOALS = new Set(Object.keys(DEFAULT_MODALIDADES));

export function generatePlan(config: PlanConfig): PlanGenerado {
  const { nivel, duracionSemanas, sesionesSemanales, modalidades: modalidadesInput } = config;

  // Custom objectives fallback to '10K' structure but keep the custom label
  const customLabel = KNOWN_GOALS.has(config.objetivo) ? null : config.objetivo;
  const objetivo = (KNOWN_GOALS.has(config.objetivo) ? config.objetivo : '10K') as Objetivo;

  const peakKm = PEAK_KM[objetivo][nivel];
  const phases = phaseSplit(duracionSemanas);

  // Merge defaults with coach overrides
  const mod: Modalidades = {
    ...DEFAULT_MODALIDADES[objetivo],
    ...modalidadesInput,
  };

  const phaseNames: Record<string, string> = {
    base: 'Fase Base', construccion: 'Fase Construcción',
    peak: 'Fase Pico', recuperacion: 'Recuperación', taper: 'Tapering',
  };

  let currentPhase = 'base';
  const semanas: SemanaGenerada[] = [];

  for (let w = 1; w <= duracionSemanas; w++) {
    const tipo = phaseOf(w, phases);
    const vol = volumen(w, peakKm, phases, duracionSemanas);

    if (w <= phases.base)                              currentPhase = 'Fase Base';
    else if (w <= phases.base + phases.build)          currentPhase = 'Fase Construcción';
    else if (w <= phases.base + phases.build + phases.peak) currentPhase = 'Fase Pico';
    else                                               currentPhase = 'Tapering';

    semanas.push(buildWeek(w, tipo, vol, sesionesSemanales, objetivo, nivel, phaseNames[currentPhase] ?? currentPhase, duracionSemanas, mod));
  }

  const principios = principiosByGoal(objetivo, nivel, mod);

  const modalidadesLabel = [
    '🏃 Carrera',
    mod.ciclismo  && '🚴 Ciclismo / Cross Training',
    mod.natacion  && '🏊 Natación',
    mod.fuerza    && '🏋️ Fuerza / Pesas',
    mod.funcional && '⚡ Funcional / CrossFit',
  ].filter(Boolean).join(', ');

  return {
    nombre: `Plan ${customLabel ?? OBJETIVO_LABELS[objetivo]} — ${capitalize(nivel)} (${duracionSemanas} sem)`,
    descripcion: `Plan personalizado de ${duracionSemanas} semanas para ${customLabel ?? OBJETIVO_LABELS[objetivo]}. Modalidades: ${modalidadesLabel}. Diseñado siguiendo las directrices de World Athletics, USATF y protocolos internacionales de entrenamiento para ${capitalize(nivel)}es.`,
    filosofia: filosofiaByGoal(objetivo),
    nivel,
    objetivo: customLabel ?? OBJETIVO_LABELS[objetivo],
    duracionSemanas,
    sesionesSemanales,
    volumenPicoKm: peakKm,
    principios,
    semanas,
  };
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function principiosByGoal(objetivo: Objetivo, nivel: Nivel, mod: Modalidades): string[] {
  const base = [
    'Regla 80/20: 80% del entrenamiento en Zona 1-2 (aeróbico fácil), 20% en Zona 3-5 (calidad)',
    'Progresión máxima del 10% de volumen semanal (regla de oro del atletismo)',
    'Semana de recuperación cada 3-4 semanas para supercompensación',
    'Periodización: Base → Construcción → Pico → Tapering',
    'Descanso y sueño (7-9h) son tan importantes como el entrenamiento mismo',
  ];

  if (['5K', '10K', '21K', '42K'].includes(objetivo)) {
    base.push('Rodaje largo = 30-35% del volumen semanal (World Athletics guideline)');
    base.push('Trabajo de umbral anaeróbico: clave para mejorar ritmo de carrera sostenido');
    if (objetivo === '42K') base.push('Carrera de maratón: nunca aumentar volumen y velocidad al mismo tiempo (Lydiard Method)');
  }
  if (objetivo.startsWith('trail') || objetivo === 'ultratrail') {
    base.push('Entrenamiento en terreno específico: superficie, técnica de descenso, uso de bastones');
    base.push('Acumulación de desnivel como métrica clave (D+ semanal)');
  }
  if (objetivo === 'hyrox') {
    base.push('Especificidad HYROX: practicar cada estación en fatiga (post-carrera)');
    base.push('Objetivo pace: mantener ritmo de carrera constante entre estaciones');
  }
  if (objetivo.includes('triatlon') || objetivo.includes('ironman')) {
    base.push('Periodización tri-disciplina: no comprometer ninguna disciplina');
    base.push('Bricks (bike+run): fundamentales para adaptación neuromuscular en transiciones');
  }
  if (mod.fuerza) base.push('Fuerza complementaria: prevención de lesiones y mejora de economía de carrera');
  if (mod.ciclismo) base.push('Cross-training en bicicleta: carga aeróbica sin impacto, ideal para días de recuperación activa');

  // Warn if triathlon/ironman was selected without the needed modalities
  if ((objetivo.includes('triatlon') || objetivo.includes('ironman')) && (!mod.ciclismo || !mod.natacion)) {
    base.push('⚠️ Plan adaptado: el triatlón requiere ciclismo y natación para preparación completa. Activa esas modalidades para el plan óptimo.');
  }

  return base;
}

function filosofiaByGoal(objetivo: Objetivo): string {
  const map: Partial<Record<Objetivo, string>> = {
    '5K':   'Plan basado en la metodología de Jack Daniels (VDOT) y directrices IAAF para carreras de corta distancia. Énfasis en velocidad y VO₂máx.',
    '10K':  'Combinación de base aeróbica (Lydiard) y velocidad específica. Basado en estándares USATF para 10K.',
    '21K':  'Metodología Hansons Half Marathon: alta frecuencia de rodajes fáciles + trabajo específico de umbral. World Athletics certified.',
    '42K':  'Plan basado en Pfitzinger & Douglas (Advanced Marathoning) y protocolos IAAF. Énfasis en volumen progresivo y especificidad.',
    trail_21K:  'Directrices ITRA (International Trail Running Association). Entrenamiento vertical y técnico con progresión de desnivel.',
    ultratrail: 'Protocolos UTMB / ITRA. Volumen por tiempo (no solo km), nutrición en movimiento, manejo del sueño en distancias extremas.',
    hyrox:  'Plan oficial HYROX training methodology. Combinación de resistencia de carrera + fuerza funcional específica de las 8 estaciones.',
    crossfit: 'Basado en CrossFit L2 training guidelines. Tres vías energéticas, movimientos funcionales de alta intensidad y variedad constante.',
    triatlon_sprint: 'World Triathlon official training framework. Periodización tri-disciplina con énfasis en economía de movimiento y transiciones.',
    ironman: 'Ironman University & Precision Training. Fases de volumen base largo + especificidad de carrera. Nutrición y manejo de energía.',
  };
  return map[objetivo] ?? 'Plan de entrenamiento multidisciplinar basado en principios de fisiología del ejercicio y protocolos internacionales de preparación física.';
}
