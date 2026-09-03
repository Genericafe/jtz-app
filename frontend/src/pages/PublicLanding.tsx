import { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, MapPin, ArrowRight, Trophy, Users, TrendingUp, ShoppingBag, ChevronDown } from 'lucide-react';
import { publicApi } from '../services/api';
import { formatEvent } from '../utils/eventDate';
import PublicHeader from '../components/PublicHeader';

interface PubEvent { id: number; nombre: string; tipo: string; fecha: string; lugar: string; ciudad?: string; distanciaKm?: number; precio: number; imagen?: string }

const typeGrad: Record<string, string> = {
  carrera: 'bg-carrera', trail: 'bg-trail', entrenamiento: 'bg-entrenamiento', social: 'bg-social',
};
const typeEmoji: Record<string, string> = { carrera: '🏃', trail: '🏔️', entrenamiento: '💪', social: '🎉' };
const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; };

// Fade + rise into view on scroll.
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); obs.disconnect(); } }, { threshold: 0.15 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}
      style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateY(28px)', transition: `opacity .7s ease ${delay}ms, transform .7s ease ${delay}ms` }}>
      {children}
    </div>
  );
}

export default function PublicLanding() {
  const { data } = useQuery({
    queryKey: ['public-events'],
    queryFn: async () => (await publicApi.listEvents()).data as PubEvent[],
  });
  const { data: site } = useQuery({
    queryKey: ['public-site'],
    queryFn: async () => (await publicApi.site()).data as { heroImagen?: string; comunidadImagen?: string; accionImagen?: string },
  });
  const upcoming = (data ?? []).filter(e => new Date(e.fecha) >= new Date()).slice(0, 3);

  return (
    <div className="bg-surface-900 text-white">
      <PublicHeader active="/inicio" />

      {/* ── HERO — cinematic photo/video ── */}
      <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900 via-surface-900 to-black topo-bg" />
        {/* Photo with slow Ken Burns motion (feels like video even without a clip) */}
        <img src={site?.heroImagen || '/fotos/hero.jpg'} alt="" onError={hideOnError}
          className="kenburns absolute inset-0 w-full h-full object-cover" />
        {/* Optional video background: drop /fotos/hero.mp4 and it plays automatically on top of the photo.
            Without a poster, if the clip is missing the video stays transparent and the photo above shows through. */}
        <video
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay muted loop playsInline
        >
          <source src="/fotos/hero.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-surface-900" />

        <div className="relative z-10 text-center px-4 max-w-4xl">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.4em] text-brand-300 mb-5 animate-fade-in">Trail · Ruta · Comunidad</p>
          <h1 className="heading-display text-6xl sm:text-8xl leading-[0.9] text-white drop-shadow-2xl">
            <span className="word-mask"><span className="word-rise" style={{ animationDelay: '.15s' }}>JTZ</span></span>{' '}
            <span className="word-mask"><span className="word-rise" style={{ animationDelay: '.32s' }}>TRAIL</span></span>
          </h1>
          <p className="text-white/90 text-lg sm:text-2xl max-w-2xl mx-auto mt-6 leading-relaxed">
            Corre. Sube. Vuela. Una comunidad que suma kilómetros juntos — en la ciudad, en el trail y donde sea.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mt-9">
            <Link to="/carreras" className="btn-primary px-7 py-3.5 text-sm font-bold flex items-center gap-2 shadow-glow">
              Ver carreras <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="px-7 py-3.5 rounded-xl text-sm font-bold border border-white/25 bg-white/5 backdrop-blur text-white hover:bg-white/10 transition-colors">
              Soy del club · Entrar
            </Link>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/50 animate-bounce">
          <ChevronDown size={26} />
        </div>
      </section>

      {/* ── Moving headline marquee ── */}
      <div className="marquee border-y border-white/[0.08] bg-surface-800 py-4">
        <div className="marquee-track">
          {Array.from({ length: 2 }).map((_, i) => (
            <span key={i} className="heading-display text-2xl sm:text-3xl text-white/90 uppercase tracking-tight">
              {['Trail', 'Ruta', 'Montaña', 'Comunidad', 'Aventura', 'JTZ Trail'].map((w) => (
                <span key={w} className="mx-6">{w} <span className="text-brand-500">•</span></span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section className="max-w-5xl mx-auto px-4 py-16 sm:py-20">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: Trophy, t: 'Carreras y trails', d: 'Eventos oficiales del club con inscripción en línea, ruta GPX y resultados.' },
            { icon: TrendingUp, t: 'Entrena con datos', d: 'Planes, carga de entrenamiento, condición física y análisis de cada sesión.' },
            { icon: Users, t: 'Comunidad', d: 'Retos, insignias, ranking del club y acompañamiento del coach en vivo.' },
          ].map((f, i) => (
            <Reveal key={f.t} delay={i * 100}>
              <div className="card p-6 h-full">
                <div className="w-12 h-12 rounded-xl bg-brand-500/15 flex items-center justify-center mb-4">
                  <f.icon size={22} className="text-brand-400" />
                </div>
                <h3 className="heading-display text-lg text-white">{f.t}</h3>
                <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">{f.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Community — editorial photo + text ── */}
      <section className="relative">
        <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-10 items-center py-16 sm:py-20">
          <Reveal>
            <div className="relative rounded-3xl overflow-hidden aspect-[4/3] bg-surface-700">
              <div className="absolute inset-0 topo-bg opacity-40 bg-trail" />
              <img src={site?.comunidadImagen || '/fotos/comunidad.jpg'} alt="Comunidad JTZ" onError={hideOnError} className="absolute inset-0 w-full h-full object-cover" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-300 mb-3">La comunidad</p>
              <h2 className="heading-display text-4xl sm:text-5xl text-white leading-tight">No corres solo.</h2>
              <p className="text-gray-300 text-lg mt-4 leading-relaxed">
                Somos corredores de todos los niveles que entrenan juntos en la sierra y la ciudad.
                Trail, ruta, montaña — cada semana sumamos kilómetros y nos empujamos a ser mejores.
              </p>
              <Link to="/login" className="inline-flex items-center gap-2 mt-6 text-brand-400 hover:text-brand-300 font-bold">
                Únete al club <ArrowRight size={16} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Action photo band ── */}
      <section className="relative h-[52vh] min-h-[380px] flex items-center justify-center overflow-hidden my-8">
        <div className="absolute inset-0 bg-carrera topo-bg" />
        <img src={site?.accionImagen || '/fotos/accion.jpg'} alt="" onError={hideOnError} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/45" />
        <Reveal className="relative z-10 text-center px-4">
          <h2 className="heading-display text-4xl sm:text-6xl text-white leading-tight drop-shadow-xl">¿Listo para tu próximo reto?</h2>
          <Link to="/carreras" className="btn-primary inline-flex items-center gap-2 mt-6 px-7 py-3.5 text-sm font-bold shadow-glow">
            Inscríbete a una carrera <ArrowRight size={16} />
          </Link>
        </Reveal>
      </section>

      {/* ── Upcoming races ── */}
      {upcoming.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="heading-display text-3xl text-white">Próximas carreras</h2>
            <Link to="/carreras" className="text-sm text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1">
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>
          <div className="space-y-4">
            {upcoming.map((ev, i) => (
              <Reveal key={ev.id} delay={i * 80}>
                <Link to={`/evento/${ev.id}`} className="card overflow-hidden flex flex-col sm:flex-row hover:border-white/[0.14] transition-all group">
                  <div className="relative w-full sm:w-52 h-40 sm:h-auto flex-shrink-0">
                    {ev.imagen
                      ? <img src={ev.imagen} alt={ev.nombre} className="w-full h-full object-cover" />
                      : <div className={`${typeGrad[ev.tipo] ?? 'bg-carrera'} w-full h-full flex items-center justify-center text-4xl`}>{typeEmoji[ev.tipo] ?? '🏃'}</div>}
                    <div className="absolute top-2 left-2 bg-black/55 backdrop-blur rounded-lg px-2 py-1 text-center">
                      <p className="text-[9px] text-white/80 uppercase leading-none">{formatEvent(ev.fecha, 'MMM')}</p>
                      <p className="text-base font-black text-white leading-none">{formatEvent(ev.fecha, 'd')}</p>
                    </div>
                  </div>
                  <div className="flex-1 p-5 flex flex-col justify-center">
                    <h3 className="heading-display text-xl text-white leading-tight">{ev.nombre}</h3>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-gray-400">
                      <span className="flex items-center gap-1"><Calendar size={13} /> {formatEvent(ev.fecha, "d MMM · HH:mm 'h'")}</span>
                      <span className="flex items-center gap-1"><MapPin size={13} /> {ev.lugar}{ev.ciudad ? `, ${ev.ciudad}` : ''}</span>
                      {ev.distanciaKm ? <span className="flex items-center gap-1"><Trophy size={13} /> {ev.distanciaKm} km</span> : null}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-black text-white">{ev.precio === 0 ? <span className="text-green-400">Gratis</span> : `$${ev.precio.toLocaleString('es-MX')}`}</span>
                      <span className="text-sm font-bold text-brand-400 flex items-center gap-1 group-hover:gap-2 transition-all">Detalles <ArrowRight size={14} /></span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ── Gallery — the club in the field ── */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-300 mb-3">En la montaña</p>
          <h2 className="heading-display text-3xl sm:text-4xl text-white leading-tight mb-6">Cada salida, una historia.</h2>
        </Reveal>
        {/* Big clean banner (no baked-in text) */}
        <Reveal>
          <div className="relative rounded-2xl overflow-hidden aspect-[16/9] sm:aspect-[16/7] bg-surface-700 group">
            <img src="/fotos/cima.jpg" alt="En la cima" onError={hideOnError}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
          </div>
        </Reveal>
        {/* Three even cards below — no overlap */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          {[
            { src: '/fotos/accion.jpg', alt: 'Corredor JTZ' },
            { src: '/fotos/montana.jpg', alt: 'Trail en montaña' },
            { src: '/fotos/trofeos.jpg', alt: 'Reconocimientos JTZ Trail' },
          ].map((g, i) => (
            <Reveal key={g.src} delay={i * 90}>
              <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-surface-700 group">
                <img src={g.src} alt={g.alt} onError={hideOnError}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Store CTA ── */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <Reveal>
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
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] mt-8">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-500">JTZ Trail</p>
          <div className="flex gap-4 text-sm">
            <Link to="/carreras" className="text-gray-400 hover:text-white">Carreras</Link>
            <Link to="/seguir" className="text-gray-400 hover:text-white">Seguir en vivo</Link>
            <Link to="/tienda-publica" className="text-gray-400 hover:text-white">Tienda</Link>
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-semibold">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
