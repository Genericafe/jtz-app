import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, MapPin, Trophy, ArrowRight } from 'lucide-react';
import { publicApi } from '../services/api';
import { formatEvent } from '../utils/eventDate';
import PublicHeader from '../components/PublicHeader';

interface PubEvent { id: number; nombre: string; tipo: string; fecha: string; lugar: string; ciudad?: string; distanciaKm?: number; precio: number; imagen?: string; cupoMaximo?: number; _count?: { registros: number } }

const typeGrad: Record<string, string> = {
  carrera: 'bg-carrera', trail: 'bg-trail', entrenamiento: 'bg-entrenamiento', social: 'bg-social',
};
const typeEmoji: Record<string, string> = { carrera: '🏃', trail: '🏔️', entrenamiento: '💪', social: '🎉' };
const FILTERS = [['todos', 'Todos'], ['carrera', '🏃 Carrera'], ['trail', '🏔️ Trail'], ['social', '🎉 Social']] as const;

function Row({ ev, past }: { ev: PubEvent; past?: boolean }) {
  const full = ev.cupoMaximo ? (ev._count?.registros ?? 0) >= ev.cupoMaximo : false;
  const status = past ? { label: 'Finalizado', color: '#6b7280' }
    : full ? { label: 'Cupo lleno', color: '#ef4444' }
    : { label: 'Inscripciones abiertas', color: '#22c55e' };
  return (
    <Link to={`/evento/${ev.id}`}
      className={`card overflow-hidden flex flex-col sm:flex-row hover:border-white/[0.14] transition-all group ${past ? 'opacity-75' : ''}`}>
      <div className="hidden sm:block w-1.5 flex-shrink-0" style={{ background: status.color }} />
      <div className="relative w-full sm:w-56 h-40 sm:h-auto sm:min-h-[168px] flex-shrink-0">
        {ev.imagen
          ? <img src={ev.imagen} alt={ev.nombre} className="w-full h-full object-cover" />
          : <div className={`${typeGrad[ev.tipo] ?? 'bg-carrera'} w-full h-full flex items-center justify-center text-5xl`}>{typeEmoji[ev.tipo] ?? '🏃'}</div>}
        <div className="absolute top-3 left-3 bg-black/55 backdrop-blur rounded-xl px-2.5 py-1.5 text-center">
          <p className="text-[10px] text-white/80 uppercase leading-none">{formatEvent(ev.fecha, 'MMM')}</p>
          <p className="text-lg font-black text-white leading-none mt-0.5">{formatEvent(ev.fecha, 'd')}</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 px-3 pt-4 pb-1.5" style={{ background: `linear-gradient(to top, ${status.color}f0, transparent)` }}>
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-white uppercase tracking-wide">
            <span className="w-2 h-2 rounded-full bg-white" /> {status.label}
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-between gap-3">
        <div>
          <h3 className="heading-display text-xl sm:text-2xl text-white leading-tight">{ev.nombre}</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-2 mt-3">
            {ev.distanciaKm ? <div><p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Distancia</p><p className="text-sm font-bold text-white">{ev.distanciaKm} km</p></div> : null}
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Fecha</p><p className="text-sm font-bold text-white flex items-center gap-1"><Calendar size={12} className="text-gray-500" /> {formatEvent(ev.fecha, "d MMM · HH:mm 'h'")}</p></div>
            <div className="max-w-[220px]"><p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Ubicación</p><p className="text-sm font-bold text-white truncate flex items-center gap-1"><MapPin size={12} className="text-gray-500 flex-shrink-0" /> {ev.lugar}{ev.ciudad ? `, ${ev.ciudad}` : ''}</p></div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-base font-black text-white">{ev.precio === 0 ? <span className="text-green-400">Gratis</span> : `$${ev.precio.toLocaleString('es-MX')}`}</span>
          <span className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-brand-500 group-hover:bg-brand-600 text-white transition-all">
            Detalles <ArrowRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function PublicEvents() {
  const [filter, setFilter] = useState<string>('todos');
  const { data, isLoading } = useQuery({
    queryKey: ['public-events'],
    queryFn: async () => (await publicApi.listEvents()).data as PubEvent[],
  });
  const events = (data ?? []).filter(e => filter === 'todos' || e.tipo === filter);
  const upcoming = events.filter(e => new Date(e.fecha) >= new Date());
  const past = events.filter(e => new Date(e.fecha) < new Date());

  return (
    <div className="min-h-screen bg-surface-900 text-white">
      <PublicHeader active="/carreras" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="heading-display text-3xl text-white mb-1">Carreras y eventos</h1>
        <p className="text-gray-400 text-sm mb-6">Inscríbete en línea a las carreras, trails y encuentros del JTZ Running Club</p>

        <div className="flex gap-2 mb-6 flex-wrap">
          {FILTERS.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`text-sm px-4 py-1.5 rounded-full font-medium transition-all ${filter === key ? 'bg-brand-500 text-white' : 'bg-surface-700 text-gray-400 hover:text-white border border-white/[0.06]'}`}>
              {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-gray-500 py-16 text-center">Cargando…</p>
        ) : events.length === 0 ? (
          <div className="text-center py-20"><span className="text-6xl">🏃</span><p className="text-gray-500 mt-4">No hay eventos por ahora</p></div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Próximos</h2>
                <div className="space-y-4">{upcoming.map(ev => <Row key={ev.id} ev={ev} />)}</div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Anteriores</h2>
                <div className="space-y-4">{past.slice(0, 8).map(ev => <Row key={ev.id} ev={ev} past />)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
