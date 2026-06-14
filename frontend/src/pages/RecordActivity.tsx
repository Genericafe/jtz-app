import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Pause, Square, MapPin, Zap, Heart, Clock, ChevronLeft, CheckCircle } from 'lucide-react';
import { integrationsApi } from '../services/api';
import { useActivityRecorder, formatPace, formatElapsed } from '../hooks/useActivityRecorder';

const TIPOS = [
  { value: 'correr', label: 'Correr' },
  { value: 'trail', label: 'Trail' },
  { value: 'ciclismo', label: 'Ciclismo' },
  { value: 'natacion', label: 'Natación' },
  { value: 'otro', label: 'Otro' },
];

export default function RecordActivity() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { state, start, pause, resume, finish, reset, getGpx } = useActivityRecorder();
  const [tipo, setTipo] = useState('correr');
  const [nombre, setNombre] = useState('');
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const actName = nombre.trim() || `${TIPOS.find(t => t.value === tipo)?.label ?? 'Actividad'} — ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}`;
      const gpx = state.track.length > 1 ? getGpx(actName) : undefined;
      const duracionMin = Math.round(state.elapsed / 60);
      const ritmoMinKm = state.paceMinKm ?? undefined;

      return integrationsApi.logActivity({
        nombre: actName,
        tipo,
        distanciaKm: parseFloat(state.distanceKm.toFixed(3)),
        duracionMin,
        ...(ritmoMinKm ? { ritmoMinKm: parseFloat(ritmoMinKm.toFixed(2)) } : {}),
        ...(state.fcActual ? { fcPromedio: state.fcActual } : {}),
        ...(gpx ? { gpxContent: gpx, gpxNombre: `${actName}.gpx` } : {}),
        fuente: 'app',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-activities'] });
      setSaved(true);
    },
  });

  // Pantalla de éxito
  if (saved) {
    return (
      <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-8 text-center">
        <CheckCircle size={64} className="text-green-400 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">¡Actividad guardada!</h2>
        <p className="text-gray-400 mb-2">{state.distanceKm.toFixed(2)} km · {formatElapsed(state.elapsed)}</p>
        <p className="text-gray-400 mb-8">Ritmo {formatPace(state.paceMinKm)} /km</p>
        <button
          onClick={() => { reset(); navigate('/actividades'); }}
          className="px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold transition-colors"
        >
          Ver mis actividades
        </button>
      </div>
    );
  }

  // Pantalla de resumen post-actividad
  if (state.status === 'finished') {
    return (
      <div className="min-h-screen bg-dark-900 p-6 flex flex-col">
        <button onClick={() => { reset(); navigate(-1); }} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6">
          <ChevronLeft size={20} /> Descartar
        </button>
        <h2 className="text-xl font-bold text-white mb-6">Resumen de actividad</h2>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatCard label="Distancia" value={`${state.distanceKm.toFixed(2)} km`} />
          <StatCard label="Tiempo" value={formatElapsed(state.elapsed)} />
          <StatCard label="Ritmo promedio" value={`${formatPace(state.paceMinKm)} /km`} />
          <StatCard label="Puntos GPS" value={String(state.track.length)} />
        </div>

        <div className="space-y-3 mb-6">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tipo de actividad</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="w-full bg-dark-700 border border-dark-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand-500"
            >
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nombre (opcional)</label>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Entrenamiento matutino"
              className="w-full bg-dark-700 border border-dark-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand-500 placeholder-gray-600"
            />
          </div>
        </div>

        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full py-4 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl font-bold text-lg transition-colors disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Guardando...' : 'Guardar actividad'}
        </button>
        {saveMutation.isError && (
          <p className="text-red-400 text-sm text-center mt-3">Error al guardar. Intenta de nuevo.</p>
        )}
      </div>
    );
  }

  // Pantalla principal de grabación
  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pt-safe">
        {state.status === 'idle' ? (
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white">
            <ChevronLeft size={20} /> Cancelar
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${state.status === 'running' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
            <span className="text-sm text-gray-400">{state.status === 'running' ? 'Grabando' : 'Pausado'}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-brand-400" />
          <span className="text-xs text-gray-500">GPS</span>
        </div>
      </div>

      {/* Tipo (solo en idle) */}
      {state.status === 'idle' && (
        <div className="px-6 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {TIPOS.map(t => (
              <button
                key={t.value}
                onClick={() => setTipo(t.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  tipo === t.value ? 'bg-brand-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Métricas principales */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        {/* Tiempo */}
        <div className="text-center">
          <div className="text-7xl font-mono font-bold text-white tracking-tight">
            {formatElapsed(state.elapsed)}
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-1 text-gray-500 text-sm">
            <Clock size={14} /> Tiempo
          </div>
        </div>

        {/* Grid de métricas */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
          <div className="bg-dark-800 rounded-2xl p-4 text-center border border-dark-700">
            <div className="text-3xl font-bold text-white">{state.distanceKm.toFixed(2)}</div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
              <Zap size={11} /> km
            </div>
          </div>
          <div className="bg-dark-800 rounded-2xl p-4 text-center border border-dark-700">
            <div className="text-3xl font-bold text-white">{formatPace(state.currentPaceMinKm ?? state.paceMinKm)}</div>
            <div className="text-xs text-gray-500 mt-0.5">min/km actual</div>
          </div>
          <div className="bg-dark-800 rounded-2xl p-4 text-center border border-dark-700">
            <div className="text-3xl font-bold text-white">{formatPace(state.paceMinKm)}</div>
            <div className="text-xs text-gray-500 mt-0.5">ritmo promedio</div>
          </div>
          <div className="bg-dark-800 rounded-2xl p-4 text-center border border-dark-700">
            <div className={`text-3xl font-bold ${state.fcActual ? 'text-red-400' : 'text-gray-600'}`}>
              {state.fcActual ?? '--'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
              <Heart size={11} /> bpm
            </div>
          </div>
        </div>

        {/* Puntos GPS acumulados */}
        {state.track.length > 0 && (
          <p className="text-xs text-gray-600">{state.track.length} puntos GPS grabados</p>
        )}

        {state.error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
            {state.error}
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="flex items-center justify-center gap-6 p-8 pb-safe">
        {state.status === 'idle' && (
          <button
            onClick={start}
            className="w-24 h-24 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30 transition-all active:scale-95"
          >
            <Play size={36} className="text-white ml-1" fill="white" />
          </button>
        )}

        {state.status === 'running' && (
          <>
            <button
              onClick={pause}
              className="w-20 h-20 rounded-full bg-dark-700 border border-dark-600 hover:bg-dark-600 flex items-center justify-center transition-all active:scale-95"
            >
              <Pause size={28} className="text-white" fill="white" />
            </button>
            <button
              onClick={finish}
              className="w-20 h-20 rounded-full bg-red-500/90 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/20 transition-all active:scale-95"
            >
              <Square size={28} className="text-white" fill="white" />
            </button>
          </>
        )}

        {state.status === 'paused' && (
          <>
            <button
              onClick={resume}
              className="w-20 h-20 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30 transition-all active:scale-95"
            >
              <Play size={28} className="text-white ml-1" fill="white" />
            </button>
            <button
              onClick={finish}
              className="w-20 h-20 rounded-full bg-red-500/90 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/20 transition-all active:scale-95"
            >
              <Square size={28} className="text-white" fill="white" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
