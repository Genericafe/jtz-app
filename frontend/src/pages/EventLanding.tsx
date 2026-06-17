import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicApi } from '../services/api';
import { Event } from '../types';
import { isAfter, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatEvent } from '../utils/eventDate';
import { MapPin, Calendar, Trophy, CheckCircle, Clock, Zap, CreditCard, Shirt } from 'lucide-react';

const typeGradient: Record<string, string> = {
  carrera:       'from-orange-500 via-red-500 to-rose-700',
  trail:         'from-green-500 via-emerald-500 to-teal-700',
  entrenamiento: 'from-blue-500 via-indigo-500 to-violet-700',
  social:        'from-purple-500 via-pink-500 to-rose-600',
};
const typeEmoji: Record<string, string> = { carrera: '🏃', trail: '🏔️', entrenamiento: '💪', social: '🎉' };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!event) return;

    const payload = { ...form, ...trackingData };

    try {
      if (event.precio === 0) {
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
      {/* Hero */}
      <div className={`relative bg-gradient-to-br ${gradient} overflow-hidden`}>
        {event.imagen && (
          <img src={event.imagen} alt={event.nombre}
            className="absolute inset-0 w-full h-full object-cover opacity-40" />
        )}
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 bg-black/30 backdrop-blur rounded-full px-4 py-1.5 mb-6 text-white/80 text-sm font-medium">
            <Zap size={14} className="text-brand-400" /> JTZ Running Club
          </div>
          <div className="text-6xl mb-4">{emoji}</div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight">{event.nombre}</h1>
          {event.descripcion && <p className="text-white/80 text-lg mb-6 max-w-lg mx-auto">{event.descripcion}</p>}
          {!isPast && <CountdownTimer fecha={event.fecha} />}
        </div>
      </div>

      {/* Event details + form */}
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Info pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { icon: Calendar, label: 'Fecha', value: formatEvent(event.fecha, "d 'de' MMMM") },
            { icon: Clock,    label: 'Hora',  value: formatEvent(event.fecha, "HH:mm 'hrs'") },
            { icon: MapPin,   label: 'Lugar', value: `${event.lugar}, ${event.ciudad}` },
            { icon: Trophy,   label: 'Distancia', value: event.distanciaKm ? `${event.distanciaKm} km` : 'Por confirmar' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-surface-700 border border-white/[0.06] rounded-2xl p-4 text-center">
              <Icon size={18} className="text-brand-400 mx-auto mb-1" />
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-bold text-white mt-0.5 leading-tight">{value}</p>
            </div>
          ))}
        </div>

        {isPast ? (
          <div className="bg-surface-700 border border-white/[0.06] rounded-2xl p-8 text-center">
            <p className="text-4xl mb-3">🏁</p>
            <p className="text-white font-bold text-lg">Este evento ya ocurrió</p>
            <p className="text-gray-400 text-sm mt-1">{formatDistanceToNow(new Date(event.fecha), { locale: es, addSuffix: true })}</p>
          </div>
        ) : (
          <div className="bg-surface-700 border border-white/[0.06] rounded-2xl overflow-hidden">
            {/* Form header */}
            <div className={`bg-gradient-to-r ${gradient} p-5`}>
              <h2 className="text-xl font-black text-white">
                {event.precio === 0 ? '¡Inscríbete gratis!' : `Inscríbete — $${event.precio.toLocaleString('es-MX')} MXN`}
              </h2>
              <p className="text-white/70 text-sm mt-0.5">
                {event.precio === 0
                  ? 'Completa el formulario y recibe los detalles por correo'
                  : 'Llena tus datos y completa el pago para reservar tu lugar'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                disabled={checkoutLoading || !form.fechaNacimiento || !form.tallaPlayera}
                className={`w-full py-4 rounded-xl font-black text-white text-base transition-all active:scale-95 disabled:opacity-50 bg-gradient-to-r ${gradient} shadow-lg hover:shadow-xl`}>
                {checkoutLoading ? 'Un momento...' : event.precio === 0
                  ? '✓ Inscribirme gratis'
                  : `💳 Pagar $${event.precio.toLocaleString('es-MX')} e inscribirme`
                }
              </button>

              {event.precio > 0 && (
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
