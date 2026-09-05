import { useEffect, useRef, useState } from 'react';
import { X, Pause, Play, SkipForward, Square, Trophy, AlertCircle } from 'lucide-react';
import { type Estructura, type FlatStep, type StepTipo, flatten, fmtTiempo, fmtValor } from '../utils/intervals';

const CUE: Record<StepTipo, { label: string; color: string; ring: string }> = {
  calentamiento: { label: 'CALENTAMIENTO', color: 'text-amber-300',  ring: 'from-amber-500/30' },
  trabajo:       { label: '¡FUERTE!',       color: 'text-brand-300',  ring: 'from-brand-500/40' },
  descanso:      { label: 'RECUPERA',       color: 'text-gray-300',   ring: 'from-gray-500/20' },
  enfriamiento:  { label: 'ENFRIAMIENTO',   color: 'text-sky-300',    ring: 'from-sky-500/30' },
};

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const la1 = a.lat * toR, la2 = b.lat * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function IntervalPlayer({ estructura, nombre, onClose }:
  { estructura: Estructura; nombre?: string; onClose: () => void }) {
  const steps = useRef<FlatStep[]>(flatten(estructura)).current;

  const [idx, setIdx] = useState(-1);           // -1 = not started
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [covered, setCovered] = useState(0);    // meters in current step
  const [remain, setRemain] = useState(0);      // seconds left in current time step
  const [totalDist, setTotalDist] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [gpsWarn, setGpsWarn] = useState(false);

  const audioRef = useRef<AudioContext | null>(null);
  const watchRef = useRef<number | null>(null);
  const wakeRef = useRef<any>(null);
  const tickRef = useRef<any>(null);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);
  const totalDistRef = useRef(0);
  const stepStartDist = useRef(0);
  const stepStartTime = useRef(0);
  const pausedAccum = useRef(0);   // ms spent paused in current step
  const pauseStart = useRef(0);
  const startedAt = useRef(0);
  const lastBeepSec = useRef(-1);
  const idxRef = useRef(-1);

  const beep = (freq: number, ms = 140, type: OscillatorType = 'sine', vol = 0.25) => {
    try {
      const ac = audioRef.current; if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + ms / 1000);
      o.start(); o.stop(ac.currentTime + ms / 1000);
    } catch { /* no audio */ }
  };
  const cueFor = (tipo: StepTipo) => {
    if (tipo === 'trabajo') { beep(880, 220, 'square', 0.3); navigator.vibrate?.([180, 60, 180]); }
    else if (tipo === 'descanso') { beep(440, 260, 'sine'); navigator.vibrate?.(150); }
    else { beep(600, 200, 'sine'); navigator.vibrate?.(120); }
  };

  const cleanup = () => {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    wakeRef.current?.release?.().catch(() => {}); wakeRef.current = null;
  };
  useEffect(() => cleanup, []); // on unmount

  const goToStep = (n: number) => {
    if (n >= steps.length) { finish(); return; }
    idxRef.current = n; setIdx(n);
    stepStartDist.current = totalDistRef.current;
    stepStartTime.current = Date.now();
    pausedAccum.current = 0; lastBeepSec.current = -1;
    setCovered(0);
    setRemain(steps[n].modo === 'tiempo' ? steps[n].valor : 0);
    cueFor(steps[n].tipo);
  };

  const finish = () => {
    setDone(true); setIdx(steps.length);
    cleanup();
    beep(660, 160); setTimeout(() => beep(880, 160), 180); setTimeout(() => beep(1100, 300), 380);
    navigator.vibrate?.([200, 80, 200, 80, 300]);
  };

  const start = async () => {
    try { audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { /* */ }
    try { wakeRef.current = await (navigator as any).wakeLock?.request('screen'); } catch { /* */ }
    startedAt.current = Date.now();

    if (navigator.geolocation) {
      watchRef.current = navigator.geolocation.watchPosition(
        (p) => {
          const pt = { lat: p.coords.latitude, lng: p.coords.longitude };
          const acc = p.coords.accuracy ?? 999;
          if (lastPos.current && acc < 40) {
            const d = haversineM(lastPos.current, pt);
            if (d > 2 && d < 60) { totalDistRef.current += d; setTotalDist(totalDistRef.current); }
          }
          lastPos.current = pt;
        },
        () => setGpsWarn(true),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
      );
    } else setGpsWarn(true);

    tickRef.current = setInterval(() => {
      if (paused || idxRef.current < 0) return;
      const step = steps[idxRef.current]; if (!step) return;
      setTotalTime(Math.floor((Date.now() - startedAt.current) / 1000));
      if (step.modo === 'tiempo') {
        const elapsed = (Date.now() - stepStartTime.current - pausedAccum.current) / 1000;
        const left = Math.max(0, step.valor - elapsed);
        setRemain(left);
        const whole = Math.ceil(left);
        if (whole <= 3 && whole > 0 && whole !== lastBeepSec.current) { lastBeepSec.current = whole; beep(760, 90); }
        if (left <= 0) goToStep(idxRef.current + 1);
      } else {
        const cov = totalDistRef.current - stepStartDist.current;
        setCovered(cov);
        if (cov >= step.valor) goToStep(idxRef.current + 1);
      }
    }, 250);

    goToStep(0);
  };

  const togglePause = () => {
    setPaused(p => {
      const now = Date.now();
      if (!p) { pauseStart.current = now; }
      else { pausedAccum.current += now - pauseStart.current; }
      return !p;
    });
  };

  const cur = idx >= 0 && idx < steps.length ? steps[idx] : null;
  const next = idx >= 0 && idx + 1 < steps.length ? steps[idx + 1] : null;
  const cue = cur ? CUE[cur.tipo] : null;
  const pct = cur ? (cur.modo === 'tiempo'
    ? Math.min(100, ((cur.valor - remain) / cur.valor) * 100)
    : Math.min(100, (covered / cur.valor) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-[60] bg-surface-900 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{nombre || 'Workout guiado'}</p>
          {!done && idx >= 0 && <p className="text-[11px] text-gray-500">Paso {idx + 1} de {steps.length}</p>}
        </div>
        <button onClick={() => { cleanup(); onClose(); }} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-surface-700"><X size={18} /></button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {idx === -1 ? (
          <>
            <p className="text-gray-400 max-w-xs mb-8">Al iniciar, la app te va guiando por cada intervalo con sonido y vibración. Mantén la pantalla abierta.</p>
            <button onClick={start} className="btn-primary px-10 py-4 text-lg font-bold flex items-center gap-2 shadow-glow">
              <Play size={22} fill="white" /> Iniciar workout
            </button>
          </>
        ) : done ? (
          <>
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-5"><Trophy size={40} className="text-green-400" /></div>
            <h2 className="heading-display text-3xl mb-2">¡Workout completado!</h2>
            <div className="flex gap-6 mt-3 text-center">
              <div><p className="text-2xl font-black">{fmtTiempo(totalTime)}</p><p className="text-xs text-gray-500">tiempo</p></div>
              <div><p className="text-2xl font-black">{(totalDist / 1000).toFixed(2)}</p><p className="text-xs text-gray-500">km</p></div>
            </div>
            <button onClick={() => { cleanup(); onClose(); }} className="btn-primary px-8 py-3 text-sm font-bold mt-8">Cerrar</button>
          </>
        ) : cur && cue ? (
          <>
            <p className={`heading-display text-5xl sm:text-6xl mb-2 ${cue.color}`}>{cue.label}</p>
            {cur.totalSeries && <p className="text-sm text-gray-400 mb-4">Serie {cur.serie} de {cur.totalSeries}</p>}

            {/* Big metric */}
            <div className="my-4">
              {cur.modo === 'tiempo' ? (
                <p className="text-7xl sm:text-8xl font-black tabular-nums">{fmtTiempo(remain)}</p>
              ) : (
                <p className="text-6xl sm:text-7xl font-black tabular-nums">
                  {Math.round(covered)}<span className="text-2xl text-gray-500"> / {cur.valor} m</span>
                </p>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-sm h-2 rounded-full bg-surface-700 overflow-hidden mb-3">
              <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>

            <p className="text-sm text-gray-500">Objetivo: <span className="text-gray-300 font-semibold">{fmtValor(cur)}</span></p>
            {next && <p className="text-xs text-gray-600 mt-1">Sigue: {CUE[next.tipo].label.toLowerCase()} · {fmtValor(next)}</p>}

            {cur.modo === 'distancia' && gpsWarn && (
              <p className="mt-4 text-xs text-amber-400 flex items-center gap-1.5 max-w-xs"><AlertCircle size={13} /> Sin señal GPS: usa "Siguiente" para avanzar manualmente.</p>
            )}
          </>
        ) : null}
      </div>

      {/* Controls */}
      {idx >= 0 && !done && (
        <div className="px-4 py-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            <p className="tabular-nums">{fmtTiempo(totalTime)} · {(totalDist / 1000).toFixed(2)} km</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={togglePause} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-700 border border-white/[0.08] text-sm font-semibold hover:bg-surface-600">
              {paused ? <><Play size={15} /> Seguir</> : <><Pause size={15} /> Pausa</>}
            </button>
            <button onClick={() => goToStep(idx + 1)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-sm font-semibold">
              <SkipForward size={15} /> Siguiente
            </button>
            <button onClick={finish} className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25" title="Terminar">
              <Square size={15} fill="currentColor" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
