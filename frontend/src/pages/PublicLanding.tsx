import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, MapPin, ArrowRight, Trophy, Users, TrendingUp, ShoppingBag } from 'lucide-react';
import { publicApi } from '../services/api';
import { formatEvent } from '../utils/eventDate';
import PublicHeader from '../components/PublicHeader';

interface PubEvent { id: number; nombre: string; tipo: string; fecha: string; lugar: string; ciudad?: string; distanciaKm?: number; precio: number; imagen?: string }

const typeGrad: Record<string, string> = {
  carrera: 'bg-carrera', trail: 'bg-trail', entrenamiento: 'bg-entrenamiento', social: 'bg-social',
};
const typeEmoji: Record<string, string> = { carrera: '🏃', trail: '🏔️', entrenamiento: '💪', social: '🎉' };

export default function PublicLanding() {
  const { data } = useQuery({
    queryKey: ['public-events'],
    queryFn: async () => (await publicApi.listEvents()).data as PubEvent[],
  });
  const upcoming = (data ?? []).filter(e => new Date(e.fecha) >= new Date()).slice(0, 3);

  return (
    <div className="min-h-screen bg-surface-900 text-white">
      <PublicHeader active="/inicio" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 topo-bg opacity-50" />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-500/20 blur-[140px]" />
        <div className="relative max-w-5xl mx-auto px-4 py-20 sm:py-28 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-300 mb-4">Trail · Ruta · Comunidad</p>
          <h1 className="heading-display text-5xl sm:text-7xl leading-[0.95] gradient-text">JTZ Running Club</h1>
          <p className="text-gray-300 text-lg sm:text-xl max-w-2xl mx-auto mt-6 leading-relaxed">
            Un club de corredores en Ensenada. Entrena con plan, corre nuestras carreras y trails,
            y forma parte de una comunidad que suma kilómetros juntos.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mt-8">
            <Link to="/carreras" className="btn-primary px-6 py-3 text-sm font-bold flex items-center gap-2">
              Ver carreras <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="px-6 py-3 rounded-xl text-sm font-bold border border-white/15 text-white hover:bg-white/5 transition-colors">
              Soy del club · Entrar
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Trophy, t: 'Carreras y trails', d: 'Eventos oficiales del club con inscripción en línea, ruta GPX y resultados.' },
            { icon: TrendingUp, t: 'Entrena con datos', d: 'Planes, seguimiento de carga, condición física y análisis de cada sesión.' },
            { icon: Users, t: 'Comunidad', d: 'Retos, insignias, ranking del club y acompañamiento del coach en vivo.' },
          ].map(f => (
            <div key={f.t} className="card p-5">
              <div className="w-11 h-11 rounded-xl bg-brand-500/15 flex items-center justify-center mb-3">
                <f.icon size={20} className="text-brand-400" />
              </div>
              <h3 className="font-bold text-white">{f.t}</h3>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming races */}
      {upcoming.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-12">
          <div className="flex items-center justify-between mb-5">
            <h2 className="heading-display text-2xl text-white">Próximas carreras</h2>
            <Link to="/carreras" className="text-sm text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1">
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>
          <div className="space-y-4">
            {upcoming.map(ev => (
              <Link key={ev.id} to={`/evento/${ev.id}`}
                className="card overflow-hidden flex flex-col sm:flex-row hover:border-white/[0.14] transition-all group">
                <div className="relative w-full sm:w-48 h-36 sm:h-auto flex-shrink-0">
                  {ev.imagen
                    ? <img src={ev.imagen} alt={ev.nombre} className="w-full h-full object-cover" />
                    : <div className={`${typeGrad[ev.tipo] ?? 'bg-carrera'} w-full h-full flex items-center justify-center text-4xl`}>{typeEmoji[ev.tipo] ?? '🏃'}</div>}
                  <div className="absolute top-2 left-2 bg-black/55 backdrop-blur rounded-lg px-2 py-1 text-center">
                    <p className="text-[9px] text-white/80 uppercase leading-none">{formatEvent(ev.fecha, 'MMM')}</p>
                    <p className="text-base font-black text-white leading-none">{formatEvent(ev.fecha, 'd')}</p>
                  </div>
                </div>
                <div className="flex-1 p-4 flex flex-col justify-center">
                  <h3 className="heading-display text-xl text-white leading-tight">{ev.nombre}</h3>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-gray-400">
                    <span className="flex items-center gap-1"><Calendar size={13} /> {formatEvent(ev.fecha, "d MMM · HH:mm 'h'")}</span>
                    <span className="flex items-center gap-1"><MapPin size={13} /> {ev.lugar}{ev.ciudad ? `, ${ev.ciudad}` : ''}</span>
                    {ev.distanciaKm ? <span className="flex items-center gap-1"><Trophy size={13} /> {ev.distanciaKm} km</span> : null}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-black text-white">{ev.precio === 0 ? <span className="text-green-400">Gratis</span> : `$${ev.precio.toLocaleString('es-MX')}`}</span>
                    <span className="text-sm font-bold text-brand-400 flex items-center gap-1 group-hover:gap-2 transition-all">Inscribirme <ArrowRight size={14} /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Store CTA */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <Link to="/tienda-publica" className="card p-6 flex items-center gap-4 hover:border-white/[0.14] transition-all group">
          <div className="w-14 h-14 rounded-2xl bg-brand-500/15 flex items-center justify-center flex-shrink-0">
            <ShoppingBag size={26} className="text-brand-400" />
          </div>
          <div className="flex-1">
            <h3 className="heading-display text-xl text-white">Tienda del club</h3>
            <p className="text-sm text-gray-400">Jerseys, playeras y accesorios oficiales JTZ.</p>
          </div>
          <ArrowRight size={20} className="text-gray-500 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] mt-8">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-500">JTZ Running Club · Ensenada, Baja California</p>
          <div className="flex gap-4 text-sm">
            <Link to="/carreras" className="text-gray-400 hover:text-white">Carreras</Link>
            <Link to="/tienda-publica" className="text-gray-400 hover:text-white">Tienda</Link>
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-semibold">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
