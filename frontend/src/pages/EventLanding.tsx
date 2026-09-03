import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicApi } from '../services/api';
import { Event } from '../types';
import { isAfter, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatEvent } from '../utils/eventDate';
import { MapPin, Calendar, Trophy, CheckCircle, Clock, Zap, CreditCard, Shirt, ArrowRight } from 'lucide-react';
import PublicHeader from '../components/PublicHeader';

const typeGradient: Record<string, string> = {
  carrera:       'from-orange-500 via-red-500 to-rose-700',
  trail:         'from-green-500 via-emerald-500 to-teal-700',
  entrenamiento: 'from-blue-500 via-indigo-500 to-violet-700',
  social:        'from-purple-500 via-pink-500 to-rose-600',
};
const typeEmoji: Record<string, string> = { carrera: '🏃', trail: '🏔️', entrenamiento: '💪', social: '🎉' };

// Strip hashtags + emojis + extra whitespace for a clean, professional read.
function cleanText(s: string): string {
  return s
    .replace(/#[\wÁÉÍÓÚáéíóúÑñ]+/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}️‍]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

function CountdownTimer({ fecha }: { fecha: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const tick = () => {
      const diff = new Date(fecha).getTime() - Date.now();
      if (diff <= 0) return;
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [fecha]);

  return (
    <div className="flex gap-3 justify-center">
      {[
        { value: timeLeft.days, label: 'días' },
        { value: timeLeft.hours, label: 'horas' },
        { value: timeLeft.minutes, label: 'min' },
        { value: timeLeft.seconds, label: 'seg' },
      ].map(({ value, label }) => (
        <div key={label} className="bg-black/30 backdrop-blur rounded-xl px-4 py-3 text-center min-w-[60px]">
          <p className="text-2xl font-black text-white tabular-nums">{String(value).padStart(2, '0')}</p>
          <p className="text-xs text-white/60">{label}</p>
        </div>
      ))}
    </div>
  );
}

type FormData = {
  nombre: string; apellido: string; email: string;
  telefono: string; ciudad: string;
  fechaNacimiento: string; tallaPlayera: string;
};

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const YEAR_NOW = new Date().getFullYear();
const AÑOS = Array.from({ length: 86 }, (_, i) => YEAR_NOW - 5 - i); // 5 to 90 years old

export default function EventLanding() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [event, setEvent] = useState<Event & { _count?: { leads: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'form' | 'processing' | 'success' | 'error'>('form');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [form, setForm] = useState<FormData>({
    nombre: '', apellido: '', email: '', telefono: '', ciudad: '',
    fechaNacimiento: '', tallaPlayera: '',
  });
  const [fnDia, setFnDia] = useState('');
  const [fnMes, setFnMes] = useState('');
  const [fnAño, setFnAño] = useState('');
  const [formError, setFormError] = useState('');
  const [catId, setCatId] = useState<number | null>(null);

  const handleFechaNacimiento = (dia: string, mes: string, año: string) => {
    if (dia && mes && año) {
      const iso = `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      setForm(f => ({ ...f, fechaNacimiento: iso }));
    } else {
      setForm(f => ({ ...f, fechaNacimiento: '' }));
    }
  };

  // Capture UTM / source from URL on mount
  const utmSource   = searchParams.get('utm_source')   ?? '';
  const utmMedium   = searchParams.get('utm_medium')   ?? '';
  const utmCampaign = searchParams.get('utm_campaign') ?? '';
  const fuente      = utmSource || 'web';

  useEffect(() => {
    publicApi.getEvent(Number(id))
      .then(r => setEvent(r.data))
      .catch(() => setStep('error'))
      .finally(() => setLoading(false));
  }, [id]);

  // Handle Stripe redirect back
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const success = searchParams.get('success');
    if (success && sessionId) {
      setStep('processing');
      publicApi.verifySession(sessionId)
        .then(r => setStep(r.data.ok ? 'success' : 'error'))
        .catch(() => setStep('error'));
    }
    if (searchParams.get('cancelled')) setStep('form');
  }, [searchParams]);

  const trackingData = { fuente, utmSource, utmMedium, utmCampaign };

  const cats: { id: number; nombre: string; distanciaKm?: number | null; precio: number; cupoMaximo?: number | null }[] =
    (event as any)?.categorias ?? [];
  const selectedCat = cats.find(c => c.id === catId) ?? null;
  const effPrice = selectedCat ? selectedCat.precio : (event?.precio ?? 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!event) return;
    if (cats.length > 0 && catId == null) { setFormError('Elige una categoría / distancia'); return; }

    const payload = { ...form, ...trackingData, categoriaId: catId ?? undefined };

    try {
      if (effPrice === 0) {
        setCheckoutLoading(true);
        await publicApi.registerFree(event.id, payload);
        setStep('success');
      } else {
        setCheckoutLoading(true);
        const res = await publicApi.checkout(event.id, payload);
        window.location.href = res.data.url;
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(msg ?? 'Ocurrió un error. Intenta de nuevo.');
      setCheckoutLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center">
      <Zap size={32} className="text-brand-400 animate-pulse" />
    </div>
  );

  if (!event || step === 'error') return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center text-center px-4">
      <div>
        <p className="text-6xl mb-4">😕</p>
        <h1 className="text-2xl font-black text-white mb-2">Evento no encontrado</h1>
        <p className="text-gray-400">El enlace puede haber expirado o el evento ya no está disponible.</p>
      </div>
    </div>
  );

  if (step === 'processing') return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center">
      <div className="text-center">
        <Clock size={40} className="text-brand-400 mx-auto animate-spin mb-4" />
        <p className="text-white font-bold">Verificando pago...</p>
      </div>
    </div>
  );

  if (step === 'success') return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} className="text-green-400" />
        </div>
        <h1 className="text-3xl font-black text-white mb-2">¡Inscripción confirmada!</h1>
        <p className="text-gray-400 mb-2">Revisa tu correo — te enviamos todos los detalles del evento.</p>
        <p className="text-lg font-bold text-brand-400 mt-4">{event.nombre}</p>
        <p className="text-gray-400 text-sm mt-1">
          {formatEvent(event.fecha, "EEEE d 'de' MMMM · HH:mm 'hrs'")}
        </p>
        <p className="text-gray-500 text-sm mt-1">{event.lugar}, {event.ciudad}</p>
        <div className="mt-8 p-5 bg-surface-700 rounded-2xl border border-white/[0.06]">
          <p className="text-sm text-gray-300">📩 Te enviamos la confirmación y los detalles a tu correo.</p>
          <p className="text-xs text-gray-500 mt-1">Si no lo ves, revisa tu carpeta de spam.</p>
          <div className="inline-flex items-center gap-2 mt-4 text-brand-400 font-bold text-sm">
            <Zap size={14} /> JTZ Running Club
          </div>
        </div>
      </div>
    </div>
  );

  const isPast = !isAfter(new Date(event.fecha), new Date());
  const gradient = typeGradient[event.tipo] ?? typeGradient.carrera;
  const emoji = typeEmoji[event.tipo] ?? '🏃';

  return (
    <div className="min-h-screen bg-surface-900">
      <PublicHeader />

      {/* Hero — full-bleed photo, clean editorial */}
      <div className="relative min-h-[70vh] sm:min-h-[78vh] flex items-end overflow-hidden">
        {event.imagen
          ? <img src={event.imagen} alt={event.nombre} className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 bg-surface-800"><div className="absolute inset-0 topo-bg opacity-30" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/45 to-black/25" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-6 pb-12 pt-24">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">JTZ Running Club</span>
            <span className="w-1 h-1 rounded-full bg-white/40" />
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70">
              <span className={`w-1.5 h-1.5 rounded-full ${isPast ? 'bg-gray-400' : 'bg-green-400'}`} /> {isPast ? 'Finalizado' : 'Inscripciones abiertas'}
            </span>
          </div>
          <h1 className="heading-display uppercase text-5xl sm:text-8xl text-white leading-[0.9] tracking-tight">{event.nombre}</h1>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mt-6 text-white/85 text-sm sm:text-base">
            <span className="flex items-center gap-2"><Calendar size={16} className="text-white/50" /> {formatEvent(event.fecha, "EEEE d 'de' MMMM · HH:mm 'h'")}</span>
            <span className="flex items-center gap-2"><MapPin size={16} className="text-white/50" /> {event.lugar}, {event.ciudad}</span>
            {event.distanciaKm ? <span className="flex items-center gap-2"><Trophy size={16} className="text-white/50" /> {event.distanciaKm} km</span> : null}
          </div>
          {!isPast && (
            <a href="#inscripcion" className="inline-flex items-center gap-2 mt-8 px-8 py-3.5 rounded-full bg-white text-surface-900 font-bold text-sm hover:bg-white/90 transition-all active:scale-95">
              Inscribirme <ArrowRight size={16} />
            </a>
          )}
        </div>
      </div>

      {/* Countdown strip */}
      {!isPast && (
        <div className="bg-surface-900 border-b border-white/[0.06]">
          <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-center sm:justify-start">
            <CountdownTimer fecha={event.fecha} />
          </div>
        </div>
      )}

      {/* Event details + form */}
      <div id="inscripcion" className="max-w-2xl mx-auto px-6 py-10 scroll-mt-20">
        {/* Info grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-y border-white/[0.08] divide-x divide-white/[0.06] mb-10">
          {[
            { label: 'Fecha', value: formatEvent(event.fecha, "d 'de' MMM") },
            { label: 'Hora',  value: formatEvent(event.fecha, "HH:mm 'h'") },
            { label: 'Lugar', value: `${event.lugar}, ${event.ciudad}` },
            { label: 'Distancia', value: event.distanciaKm ? `${event.distanciaKm} km` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="py-5 px-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
              <p className="text-base font-bold text-white mt-1 leading-tight">{value}</p>
            </div>
          ))}
        </div>

        {/* Description (hashtags + emojis stripped for a cleaner read) */}
        {event.descripcion && cleanText(event.descripcion).length > 0 && (
          <div className="mb-10">
            <h2 className="heading-display text-2xl text-white mb-3">Sobre el evento</h2>
            <p className="text-gray-300 leading-relaxed whitespace-pre-line text-[15px]">{cleanText(event.descripcion)}</p>
          </div>
        )}

        {isPast ? (
          <div className="border border-white/[0.08] rounded-2xl p-8 text-center">
            <p className="text-white font-bold text-lg">Este evento ya ocurrió</p>
            <p className="text-gray-500 text-sm mt-1">{formatDistanceToNow(new Date(event.fecha), { locale: es, addSuffix: true })}</p>
          </div>
        ) : (
          <div className="border border-white/[0.08] rounded-2xl overflow-hidden">
            {/* Form header */}
            <div className="bg-surface-700 border-b border-white/[0.06] p-6">
              <h2 className="text-xl font-black text-white">
                {cats.length > 0 && !selectedCat
                  ? 'Elige tu categoría'
                  : effPrice === 0 ? '¡Inscríbete gratis!' : `Inscríbete — $${effPrice.toLocaleString('es-MX')} MXN`}
              </h2>
              <p className="text-white/70 text-sm mt-0.5">
                {cats.length > 0 && !selectedCat
                  ? 'Selecciona la distancia en la que quieres participar'
                  : effPrice === 0
                    ? 'Completa el formulario y recibe los detalles por correo'
                    : 'Llena tus datos y completa el pago para reservar tu lugar'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Category / distance selector */}
              {cats.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2">Categoría / distancia *</label>
                  <div className="grid gap-2">
                    {cats.map(c => (
                      <button type="button" key={c.id} onClick={() => setCatId(c.id)}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${catId === c.id ? 'bg-brand-500/15 border-brand-500/50' : 'bg-surface-600 border-white/[0.06] hover:border-white/[0.15]'}`}>
                        <span>
                          <span className="text-sm font-bold text-white">{c.nombre}</span>
                          {c.distanciaKm != null && <span className="text-xs text-gray-400 ml-2">{c.distanciaKm} km</span>}
                        </span>
                        <span className="text-sm font-black text-white">{c.precio === 0 ? <span className="text-green-400">Gratis</span> : `$${c.precio.toLocaleString('es-MX')}`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Nombre + Apellido */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nombre *</label>
                  <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                    required placeholder="Ana" className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Apellido *</label>
                  <input value={form.apellido} onChange={e => setForm({ ...form, apellido: e.target.value })}
                    required placeholder="García" className="input w-full" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Correo electrónico *</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  required placeholder="ana@correo.com" className="input w-full" />
                <p className="text-xs text-gray-500 mt-1">Recibirás los detalles y confirmación aquí</p>
              </div>

              {/* Teléfono + Ciudad */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Teléfono</label>
                  <input type="tel" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })}
                    placeholder="664-123-4567" className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Ciudad</label>
                  <input value={form.ciudad} onChange={e => setForm({ ...form, ciudad: e.target.value })}
                    placeholder="Tijuana" className="input w-full" />
                </div>
              </div>

              {/* Fecha de nacimiento */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Fecha de nacimiento *</label>
                <div className="grid grid-cols-3 gap-2">
                  <select value={fnDia}
                    onChange={e => { setFnDia(e.target.value); handleFechaNacimiento(e.target.value, fnMes, fnAño); }}
                    className="input text-sm">
                    <option value="">Día</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={String(d)}>{d}</option>
                    ))}
                  </select>
                  <select value={fnMes}
                    onChange={e => { setFnMes(e.target.value); handleFechaNacimiento(fnDia, e.target.value, fnAño); }}
                    className="input text-sm">
                    <option value="">Mes</option>
                    {MESES.map((m, i) => (
                      <option key={i} value={String(i + 1)}>{m}</option>
                    ))}
                  </select>
                  <select value={fnAño}
                    onChange={e => { setFnAño(e.target.value); handleFechaNacimiento(fnDia, fnMes, e.target.value); }}
                    className="input text-sm">
                    <option value="">Año</option>
                    {AÑOS.map(y => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-gray-500 mt-1">Necesaria para clasificación por categoría</p>
              </div>

              {/* Talla de playera */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 mb-2">
                  <Shirt size={13} /> Talla de playera *
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {TALLAS.map(t => (
                    <button key={t} type="button" onClick={() => setForm({ ...form, tallaPlayera: t })}
                      className={`py-2.5 rounded-xl text-sm font-bold transition-all border ${
                        form.tallaPlayera === t
                          ? 'bg-brand-500 text-white border-brand-400 shadow-glow-sm'
                          : 'bg-surface-600 text-gray-400 border-white/[0.06] hover:text-white hover:border-white/[0.12]'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1.5">No se garantiza la talla si el evento se llena</p>
              </div>

              {formError && (
                <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">{formError}</p>
              )}

              <button type="submit"
                disabled={checkoutLoading || !form.fechaNacimiento || !form.tallaPlayera || (cats.length > 0 && catId == null)}
                className="w-full py-4 rounded-xl font-bold text-white text-base transition-all active:scale-95 disabled:opacity-50 bg-brand-500 hover:bg-brand-600">
                {checkoutLoading ? 'Un momento...'
                  : cats.length > 0 && catId == null ? 'Elige una categoría'
                  : effPrice === 0
                    ? '✓ Inscribirme gratis'
                    : `💳 Pagar $${effPrice.toLocaleString('es-MX')} e inscribirme`
                }
              </button>

              {effPrice > 0 && (
                <p className="text-xs text-center text-gray-500 flex items-center justify-center gap-1">
                  <CreditCard size={12} /> Pago seguro con Stripe · Tarjeta de crédito o débito
                </p>
              )}
            </form>
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 text-center">
          <div className="inline-flex items-center gap-2 text-gray-500 text-sm">
            <Zap size={14} className="text-brand-400" />
            <span><strong className="text-gray-300">JTZ Running Club</strong> · Coach Jotaze · México</span>
          </div>
        </div>
      </div>
    </div>
  );
}
