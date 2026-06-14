import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, MapPin, Users, X, Calendar, Clock, Trophy, Share2, ExternalLink, CreditCard, CheckCircle, User, Trash2, Sparkles, Mail, Edit2, Download, FileSpreadsheet, Upload, Route } from 'lucide-react';
import { eventsApi, publicApi, runnersApi, default as api } from '../services/api';
import { Event } from '../types';
import { useAuth } from '../context/AuthContext';
import { format, isAfter, formatDistanceToNow } from 'date-fns';
import { generarTextoEvento } from '../utils/formatearTexto';
import { es } from 'date-fns/locale';

interface NominatimResult {
  display_name: string;
  address: {
    road?: string; suburb?: string; neighbourhood?: string; amenity?: string;
    village?: string; city?: string; town?: string; municipality?: string;
    county?: string; state?: string;
  };
}

function LocationInput({ value, onChange, onLocationSelect }: {
  value: string;
  onChange: (v: string) => void;
  onLocationSelect: (lugar: string, ciudad: string, estado: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const extractFields = (addr: NominatimResult['address'], displayName: string) => {
    const lugar = addr.road || addr.suburb || addr.neighbourhood || addr.amenity || addr.village || displayName.split(',')[0].trim();
    const ciudad = addr.city || addr.town || addr.municipality || addr.county || addr.village || '';
    const estado = addr.state || '';
    return { lugar, ciudad, estado };
  };

  const search = async (q: string) => {
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=mx&addressdetails=1`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setOpen(data.length > 0);
    } catch { /* ignore */ }
  };

  const handleChange = (v: string) => {
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 350);
  };

  const select = (r: NominatimResult) => {
    const { lugar, ciudad, estado } = extractFields(r.address, r.display_name);
    onChange(lugar);
    onLocationSelect(lugar, ciudad, estado);
    setSuggestions([]);
    setOpen(false);
  };

  const useGPS = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
            { headers: { 'Accept-Language': 'es' } }
          );
          const data: NominatimResult = await res.json();
          const { lugar, ciudad, estado } = extractFields(data.address, data.display_name);
          onChange(lugar);
          onLocationSelect(lugar, ciudad, estado);
        } finally {
          setGpsLoading(false);
        }
      },
      () => setGpsLoading(false)
    );
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={value}
          onChange={e => handleChange(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Escribe o usa GPS…"
          className="input w-full text-sm pr-9"
        />
        <button type="button" onClick={useGPS} title="Usar mi ubicación actual"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-brand-400 transition-colors">
          {gpsLoading
            ? <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            : <MapPin size={15} />}
        </button>
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-surface-700 border border-white/[0.1] rounded-xl shadow-xl overflow-hidden">
          {suggestions.map((s, i) => {
            const { lugar, ciudad, estado } = extractFields(s.address, s.display_name);
            return (
              <button key={i} type="button" onMouseDown={() => select(s)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-600 transition-colors border-b border-white/[0.04] last:border-0 flex flex-col gap-0.5">
                <span className="font-medium text-white">{lugar}</span>
                <span className="text-xs text-gray-500">{[ciudad, estado].filter(Boolean).join(', ')}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const typeGradient: Record<string, string> = {
  carrera: 'from-orange-500 to-red-600',
  trail: 'from-green-500 to-emerald-700',
  entrenamiento: 'from-blue-500 to-indigo-700',
  social: 'from-purple-500 to-pink-600',
};

function RegisterModal({ ev, onClose, runnerMe }: {
  ev: Event;
  onClose: () => void;
  runnerMe?: { nombre: string; apellido: string; telefono?: string; ciudad?: string; user?: { email: string } };
}) {
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    ciudad: '',
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill from profile once available
  useEffect(() => {
    if (runnerMe) {
      setForm({
        nombre:   runnerMe.nombre ?? '',
        apellido: runnerMe.apellido ?? '',
        email:    runnerMe.user?.email ?? '',
        telefono: runnerMe.telefono ?? '',
        ciudad:   runnerMe.ciudad ?? '',
      });
    }
  }, [runnerMe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (ev.precio === 0) {
        await publicApi.registerFree(ev.id, form);
        setDone(true);
      } else {
        const res = await publicApi.checkout(ev.id, form);
        window.location.href = res.data.url;
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Ocurrió un error. Intenta de nuevo.');
      setLoading(false);
    }
  };

  const gradient = typeGradient[ev.tipo] ?? typeGradient.carrera;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-md overflow-hidden animate-slide-up">
        {/* Event header */}
        <div className={`bg-gradient-to-r ${gradient} p-5 relative`}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/20 text-white/70 hover:text-white transition-colors">
            <X size={16} />
          </button>
          <p className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-1">{ev.tipo}</p>
          <h2 className="text-lg font-black text-white leading-tight pr-8">{ev.nombre}</h2>
          <div className="flex items-center gap-3 mt-2 text-white/80 text-xs flex-wrap">
            <span className="flex items-center gap-1"><Calendar size={11} /> {format(new Date(ev.fecha), "d 'de' MMMM · HH:mm 'hrs'", { locale: es })}</span>
            <span className="flex items-center gap-1"><MapPin size={11} /> {ev.lugar}</span>
            {ev.distanciaKm && <span className="flex items-center gap-1"><Trophy size={11} /> {ev.distanciaKm} km</span>}
          </div>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-400" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">¡Inscripción confirmada!</h3>
            <p className="text-gray-400 text-sm">Revisa tu correo — te enviamos los detalles del evento.</p>
            <button onClick={onClose} className="mt-5 btn-primary px-8 py-2.5 text-sm">Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Price badge */}
            <div className="flex items-center justify-between px-4 py-3 bg-surface-600 rounded-xl border border-white/[0.06]">
              <span className="text-sm text-gray-300">Inscripción</span>
              <span className="font-black text-white text-lg">
                {ev.precio === 0 ? <span className="text-green-400">Gratis</span> : `$${ev.precio.toLocaleString('es-MX')} MXN`}
              </span>
            </div>

            {runnerMe && (
              <div className="flex items-center gap-2 text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2">
                <User size={12} />
                Datos cargados de tu perfil — verifica que sean correctos
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nombre *</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                  required className="input w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Apellido *</label>
                <input value={form.apellido} onChange={e => setForm({ ...form, apellido: e.target.value })}
                  required className="input w-full text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Correo electrónico *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                required placeholder="Recibirás la confirmación aquí" className="input w-full text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Teléfono</label>
                <input type="tel" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })}
                  placeholder="664-123-4567" className="input w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Ciudad</label>
                <input value={form.ciudad} onChange={e => setForm({ ...form, ciudad: e.target.value })}
                  placeholder="Tijuana" className="input w-full text-sm" />
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">{error}</p>
            )}

            <button type="submit" disabled={loading}
              className={`w-full py-3.5 rounded-xl font-black text-white text-sm transition-all active:scale-95 disabled:opacity-50 bg-gradient-to-r ${gradient} shadow-md flex items-center justify-center gap-2`}>
              {loading ? 'Un momento...' : ev.precio === 0 ? (
                <><CheckCircle size={16} /> Inscribirme gratis</>
              ) : (
                <><CreditCard size={16} /> Pagar ${ev.precio.toLocaleString('es-MX')} e inscribirme</>
              )}
            </button>

            {ev.precio > 0 && (
              <p className="text-center text-xs text-gray-500">
                🔒 Pago seguro con Stripe · Tarjeta de crédito o débito
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function ShareModal({ ev, onClose }: { ev: Event; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const tipoEmoji: Record<string, string> = { carrera: '🏃', trail: '🏔️', entrenamiento: '💪', social: '🎉' };
  const emoji = tipoEmoji[ev.tipo] ?? '🏃';
  const fecha = format(new Date(ev.fecha), "EEEE d 'de' MMMM · HH:mm 'hrs'", { locale: es });
  const precio = ev.precio === 0 ? 'Entrada libre' : `$${ev.precio.toLocaleString('es-MX')} MXN`;

  const promo = `${emoji} ¡EVENTO JTZ RUNNING CLUB!

📌 ${ev.nombre}
📅 ${fecha}
📍 ${ev.lugar}${ev.ciudad ? `, ${ev.ciudad}` : ''}${ev.distanciaKm ? `\n🏁 Distancia: ${ev.distanciaKm} km` : ''}
💰 ${precio}

¡Únete a nosotros y demuestra de qué estás hecho! 💥
Inscripciones e info: comunícate con tu coach.

#JTZRunning #JTZ #RunningMexico #${ev.tipo}`;

  const encoded = encodeURIComponent(promo);

  const copyText = async () => {
    await navigator.clipboard.writeText(promo);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const platforms = [
    {
      name: 'WhatsApp',
      bg: 'bg-[#25D366]',
      action: () => window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank'),
      direct: true,
      svg: (
        <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      ),
    },
    {
      name: 'X / Twitter',
      bg: 'bg-black border border-white/20',
      action: () => window.open(`https://twitter.com/intent/tweet?text=${encoded}`, '_blank'),
      direct: true,
      svg: (
        <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      ),
    },
    {
      name: 'Telegram',
      bg: 'bg-[#2AABEE]',
      action: () => window.open(`https://t.me/share/url?url=https%3A%2F%2Fjtz.mx&text=${encoded}`, '_blank'),
      direct: true,
      svg: (
        <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      ),
    },
    {
      name: 'Facebook',
      bg: 'bg-[#1877F2]',
      action: async () => { await copyText(); window.open('https://www.facebook.com/', '_blank'); },
      direct: false,
      svg: (
        <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
    },
    {
      name: 'Instagram',
      bg: 'bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400',
      action: async () => { await copyText(); window.open('https://www.instagram.com/', '_blank'); },
      direct: false,
      svg: (
        <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
        </svg>
      ),
    },
    {
      name: 'Strava',
      bg: 'bg-[#FC4C02]',
      action: async () => { await copyText(); window.open('https://www.strava.com/dashboard', '_blank'); },
      direct: false,
      svg: (
        <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="card p-6 w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-white text-lg">Promover evento</h3>
            <p className="text-sm text-gray-500">{ev.nombre}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2"><X size={18} /></button>
        </div>

        {/* Message preview */}
        <div className="bg-surface-600 rounded-xl p-4 mb-4 border border-white/[0.06]">
          <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Vista previa del mensaje</p>
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{promo}</p>
        </div>

        {copied && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/20 text-sm text-green-400 text-center font-medium animate-fade-in">
            ✓ Texto copiado — pégalo en tu publicación
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-3">
          {platforms.map((p) => (
            <button key={p.name} onClick={p.action}
              className="flex flex-col items-center gap-2 p-3 rounded-xl hover:scale-105 active:scale-95 transition-all duration-150 relative overflow-hidden">
              <div className={`w-12 h-12 rounded-2xl ${p.bg} flex items-center justify-center shadow-lg`}>
                {p.svg}
              </div>
              <span className="text-xs text-gray-300 font-medium">{p.name}</span>
              {p.direct
                ? <span className="text-[10px] text-green-400">✓ Directo</span>
                : <span className="text-[10px] text-yellow-400">📋 Copia texto</span>
              }
            </button>
          ))}
        </div>

        <button onClick={copyText}
          className="w-full py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white hover:bg-surface-600 transition-all flex items-center justify-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Copiar texto al portapapeles
        </button>
      </div>
    </div>
  );
}

const typeConfig: Record<string, { gradient: string; emoji: string; label: string; textColor: string }> = {
  carrera:       { gradient: 'bg-carrera',       emoji: '🏃', label: 'Carrera',       textColor: 'text-orange-200' },
  trail:         { gradient: 'bg-trail',          emoji: '🏔️', label: 'Trail',         textColor: 'text-green-200' },
  entrenamiento: { gradient: 'bg-entrenamiento',  emoji: '💪', label: 'Entrenamiento', textColor: 'text-blue-200' },
  social:        { gradient: 'bg-social',         emoji: '🎉', label: 'Social',        textColor: 'text-purple-200' },
};

// ── Coach: modal with registered people table + Excel export ──────────────────
// ── GPX upload para coach ─────────────────────────────────────────────────────
function GpxUpload({ eventId, currentGpxNombre }: { eventId: number; currentGpxNombre?: string | null }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle');
  const [nombre, setNombre] = useState(currentGpxNombre ?? null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('uploading');
    try {
      const content = await file.text();
      await api.post(`/events/${eventId}/gpx`, { gpxContent: content, gpxNombre: file.name });
      setNombre(file.name);
      setStatus('ok');
      qc.invalidateQueries({ queryKey: ['events'] });
      setTimeout(() => setStatus('idle'), 4000);
    } catch {
      setStatus('error');
    }
    e.target.value = '';
  };

  return (
    <div className="bg-surface-700 rounded-xl p-4 border border-white/[0.06]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Route size={15} className="text-brand-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white">Ruta GPX del evento</p>
            <p className="text-xs text-gray-500 truncate max-w-[200px]">
              {nombre ?? 'Sin archivo GPX todavía'}
            </p>
          </div>
        </div>
        <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
          status === 'uploading' ? 'opacity-50 cursor-not-allowed' :
          'bg-brand-500/10 text-brand-400 border-brand-500/20 hover:bg-brand-500/20'
        }`}>
          <Upload size={13} />
          {status === 'uploading' ? 'Subiendo…' : nombre ? 'Reemplazar GPX' : 'Subir GPX'}
          <input type="file" accept=".gpx" className="hidden" onChange={handleFile} disabled={status === 'uploading'} />
        </label>
      </div>
      {status === 'ok' && (
        <p className="text-xs text-green-400 mt-2">✓ GPX subido — se envió por correo a todos los inscritos pagados</p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-400 mt-2">Error al subir. Verifica el archivo e intenta de nuevo.</p>
      )}
    </div>
  );
}

// ── Modal de detalle de evento para corredor inscrito ─────────────────────────
function RunnerEventDetailModal({ ev, isPaid, onClose }: { ev: Event; isPaid: boolean; onClose: () => void }) {
  const [gpxLoading, setGpxLoading] = useState(false);
  const [gpxStatus, setGpxStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const cfg = typeConfig[ev.tipo] ?? typeConfig.carrera;

  const downloadGpx = async () => {
    setGpxLoading(true);
    try {
      const res = await api.get(`/events/${ev.id}/gpx`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = ev.gpxNombre ?? 'ruta.gpx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setGpxStatus('ok');
    } catch {
      setGpxStatus('error');
    } finally {
      setGpxLoading(false);
    }
  };

  const openQr = async () => {
    if (qrUrl) { setShowQr(true); return; }
    setQrLoading(true);
    try {
      const res = await api.get(`/events/${ev.id}/gpx-token`);
      setQrUrl(res.data.url);
      setShowQr(true);
    } catch {
      setGpxStatus('error');
    } finally {
      setQrLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:px-4">
      <div className="card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up rounded-b-none sm:rounded-2xl">
        {/* Header con gradiente */}
        <div className={`${cfg.gradient} p-5 relative rounded-t-2xl`}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/20 text-white/70 hover:text-white transition-colors">
            <X size={16} />
          </button>
          <p className="text-white/70 text-xs font-semibold uppercase tracking-wide mb-1">{cfg.label}</p>
          <h2 className="text-xl font-black text-white leading-tight pr-8">{ev.nombre}</h2>
          <div className="flex flex-wrap gap-3 mt-2 text-white/80 text-xs">
            <span className="flex items-center gap-1"><Calendar size={11} /> {format(new Date(ev.fecha), "d 'de' MMMM · HH:mm 'hrs'", { locale: es })}</span>
            <span className="flex items-center gap-1"><MapPin size={11} /> {ev.lugar}{ev.ciudad ? `, ${ev.ciudad}` : ''}</span>
            {ev.distanciaKm && <span className="flex items-center gap-1"><Trophy size={11} /> {ev.distanciaKm} km</span>}
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Badge inscrito */}
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-300">
                {isPaid ? '¡Inscripción confirmada y pagada!' : '¡Inscripción confirmada!'}
              </p>
              <p className="text-xs text-green-400/70 mt-0.5">Recibirás actualizaciones del coach por correo</p>
            </div>
          </div>

          {/* Descripción */}
          {ev.descripcion && (
            <div className="bg-surface-700 rounded-xl p-4 border border-white/[0.06]">
              <p className="text-sm text-gray-300 leading-relaxed">{ev.descripcion}</p>
            </div>
          )}

          {/* Ruta GPX */}
          {ev.gpxNombre && isPaid && (
            <div className="bg-surface-700 rounded-xl p-4 border border-white/[0.06] space-y-3">
              <div className="flex items-center gap-2">
                <Route size={15} className="text-brand-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Ruta oficial GPX</p>
                  <p className="text-xs text-gray-500 truncate">{ev.gpxNombre}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={downloadGpx} disabled={gpxLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-brand-500/15 text-brand-400 border border-brand-500/20 text-xs font-semibold hover:bg-brand-500/25 transition-all disabled:opacity-50">
                  <Download size={13} /> {gpxLoading ? 'Descargando…' : 'Descargar'}
                </button>
                <button onClick={openQr} disabled={qrLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/20 text-xs font-semibold hover:bg-purple-500/25 transition-all disabled:opacity-50">
                  {qrLoading
                    ? <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3"/></svg>
                  }
                  Ver QR
                </button>
              </div>

              {/* QR panel */}
              {showQr && qrUrl && (
                <div className="flex flex-col items-center gap-3 pt-2 border-t border-white/[0.06]">
                  <p className="text-xs text-gray-400 text-center">Escanea con tu celular para descargar el GPX directamente</p>
                  <div className="bg-white p-3 rounded-2xl shadow-lg">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrUrl)}&color=000000&bgcolor=ffffff&margin=0`}
                      alt="QR ruta GPX"
                      className="w-[180px] h-[180px] sm:w-[220px] sm:h-[220px]"
                    />
                  </div>
                  <p className="text-[11px] text-gray-600 text-center">Válido por 1 hora · Funciona en Garmin, Strava, Komoot</p>
                  <button onClick={() => setShowQr(false)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                    Ocultar QR
                  </button>
                </div>
              )}

              {gpxStatus === 'ok' && <p className="text-xs text-green-400">✓ Descarga iniciada — importa el GPX en Garmin, Strava o Komoot</p>}
              {gpxStatus === 'error' && <p className="text-xs text-red-400">Error. Intenta de nuevo.</p>}
            </div>
          )}

          {ev.gpxNombre && !isPaid && (
            <div className="bg-surface-700 rounded-xl p-4 border border-white/[0.06] opacity-60">
              <div className="flex items-center gap-2">
                <Route size={16} className="text-gray-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-400">Ruta GPX disponible</p>
                  <p className="text-xs text-gray-500">Solo disponible para inscritos con pago confirmado</p>
                </div>
              </div>
            </div>
          )}

          <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function CoachEventDetailModal({ ev, onClose }: { ev: Event; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['event-detail', ev.id],
    queryFn: () => eventsApi.get(ev.id),
  });

  const detail = data?.data;
  type RegistroRow = { Nombre: string; Email: string; Teléfono: string; Ciudad: string; Nivel: string; Estado: string; Monto: number; Fuente: string; Fecha: string };

  const rows: RegistroRow[] = [
    ...((detail?.registros ?? []).map((r: {
      runner: { nombre: string; apellido: string; nivel: string; telefono?: string; ciudad?: string; user?: { email: string } };
      pagado: boolean; createdAt: string;
    }) => ({
      Nombre:    `${r.runner.nombre} ${r.runner.apellido}`,
      Email:     r.runner.user?.email ?? '',
      Teléfono:  r.runner.telefono ?? '',
      Ciudad:    r.runner.ciudad ?? '',
      Nivel:     r.runner.nivel ?? '',
      Estado:    r.pagado ? 'Pagado' : 'Pendiente',
      Monto:     r.pagado ? ev.precio : 0,
      Fuente:    'App',
      Fecha:     format(new Date(r.createdAt), "d MMM yyyy", { locale: es }),
    }))),
    ...((detail?.leads ?? []).map((l: {
      nombre: string; apellido: string; email: string; telefono?: string; ciudad?: string;
      estado: string; monto: number; createdAt: string;
    }) => ({
      Nombre:    `${l.nombre} ${l.apellido}`,
      Email:     l.email,
      Teléfono:  l.telefono ?? '',
      Ciudad:    l.ciudad ?? '',
      Nivel:     '',
      Estado:    l.estado.charAt(0).toUpperCase() + l.estado.slice(1),
      Monto:     l.monto,
      Fuente:    'Landing',
      Fecha:     format(new Date(l.createdAt), "d MMM yyyy", { locale: es }),
    }))),
  ];

  const totalRecaudado = rows.reduce((s, r) => s + (r.Monto ?? 0), 0);

  const exportCSV = () => {
    const headers: (keyof RegistroRow)[] = ['Nombre', 'Email', 'Teléfono', 'Ciudad', 'Nivel', 'Estado', 'Monto', 'Fuente', 'Fecha'];
    const csvRows = rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM → Excel abre tildes correctamente
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ev.nombre.replace(/\s+/g, '_')}_inscritos.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const estadoBadge = (estado: string) => {
    const base = 'text-xs px-2.5 py-1 rounded-full font-semibold';
    if (estado === 'Pagado' || estado === 'Confirmado') return `${base} bg-green-500/15 text-green-400`;
    if (estado === 'Pendiente') return `${base} bg-yellow-500/15 text-yellow-400`;
    return `${base} bg-gray-500/15 text-gray-400`;
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="card w-full sm:max-w-5xl h-[92vh] sm:max-h-[88vh] flex flex-col animate-slide-up rounded-b-none sm:rounded-2xl">

        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-6 border-b border-white/[0.06] flex-shrink-0">
          <div className="min-w-0 mr-3">
            <h2 className="text-base sm:text-lg font-black text-white truncate">{ev.nombre}</h2>
            <div className="flex items-center gap-3 mt-1 text-xs sm:text-sm text-gray-400 flex-wrap">
              <span className="hidden sm:inline">{format(new Date(ev.fecha), "d 'de' MMMM yyyy · HH:mm 'hrs'", { locale: es })}</span>
              <span className="flex items-center gap-1"><Users size={12} />{rows.length} inscrito{rows.length !== 1 ? 's' : ''}</span>
              {totalRecaudado > 0 && (
                <span className="text-green-400 font-semibold">${totalRecaudado.toLocaleString('es-MX')} MXN</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/15 text-green-400 border border-green-500/25 text-xs sm:text-sm font-semibold hover:bg-green-500/25 transition-all">
              <FileSpreadsheet size={14} /> <span className="hidden sm:inline">Descargar</span> Excel
            </button>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-surface-600 transition-all">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="p-12 text-center text-gray-400">Cargando inscritos…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={36} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-500 text-sm">Aún no hay inscritos en este evento</p>
            </div>
          ) : (
            <>
              {/* Desktop / tablet table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="sticky top-0 bg-surface-800 border-b border-white/[0.06]">
                    <tr>
                      {['Nombre', 'Email', 'Teléfono', 'Ciudad', 'Estado', 'Monto', 'Fuente', 'Fecha'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{r.Nombre}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate">{r.Email || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{r.Teléfono || '—'}</td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{r.Ciudad || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={estadoBadge(r.Estado)}>{r.Estado}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold whitespace-nowrap">
                          {r.Monto > 0
                            ? <span className="text-white">${Number(r.Monto).toLocaleString('es-MX')}</span>
                            : <span className="text-green-400 text-xs">Gratis</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.Fuente === 'App' ? 'bg-brand-500/15 text-brand-400' : 'bg-purple-500/15 text-purple-400'}`}>
                            {r.Fuente}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{r.Fecha}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-white/[0.04]">
                {rows.map((r, i) => (
                  <div key={i} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white text-sm truncate">{r.Nombre}</span>
                      <span className={estadoBadge(r.Estado)}>{r.Estado}</span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">{r.Email || '—'}</p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{r.Teléfono || '—'}</span>
                      <span>{r.Ciudad || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.Fuente === 'App' ? 'bg-brand-500/15 text-brand-400' : 'bg-purple-500/15 text-purple-400'}`}>
                        {r.Fuente}
                      </span>
                      <span className="text-sm font-bold text-white">
                        {r.Monto > 0 ? `$${Number(r.Monto).toLocaleString('es-MX')}` : <span className="text-green-400 text-xs font-semibold">Gratis</span>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EventCard({ ev, onRegisterClick, onViewDetail, myRegistrations, isCoach, onShare, onDelete, onEdit }: {
  ev: Event;
  onRegisterClick?: (ev: Event) => void;
  onViewDetail?: (ev: Event) => void;
  myRegistrations?: Set<number>;
  isCoach: boolean;
  onShare: (ev: Event) => void;
  onDelete?: (id: number) => void;
  onEdit?: (ev: Event) => void;
}) {
  const cfg = typeConfig[ev.tipo] ?? typeConfig.carrera;
  const isPast = !isAfter(new Date(ev.fecha), new Date());
  const isRegistered = myRegistrations?.has(ev.id);

  const handleCardClick = () => {
    if (isCoach) {
      // navegado desde el botón "Ver inscritos" o clic en card
    } else if (isRegistered) {
      onViewDetail?.(ev);
    } else if (!isPast) {
      onRegisterClick?.(ev);
    }
  };

  return (
    <div
      className={`card overflow-hidden group transition-all duration-200 hover:border-white/[0.12] hover:-translate-y-0.5 ${isPast ? 'opacity-60' : ''} ${!isCoach && !isPast ? 'cursor-pointer' : isCoach ? 'cursor-pointer' : ''}`}
      onClick={handleCardClick}
    >
      {/* Gradient banner */}
      <div className={`${cfg.gradient} relative h-32 p-4 flex flex-col justify-between`}>
        <div className="flex items-start justify-between">
          <span className="text-3xl">{cfg.emoji}</span>
          <span className="text-xs bg-black/25 backdrop-blur rounded-full px-2.5 py-1 text-white font-semibold">
            {cfg.label}
          </span>
        </div>
        <div>
          <p className="text-white font-bold text-base leading-tight line-clamp-2">{ev.nombre}</p>
        </div>
        {/* Date badge */}
        <div className="absolute top-4 right-4">
          <div className="bg-black/30 backdrop-blur rounded-xl p-2 text-center min-w-[44px]">
            <p className="text-xs text-white/70 uppercase leading-none">
              {format(new Date(ev.fecha), 'MMM', { locale: es })}
            </p>
            <p className="text-xl font-black text-white leading-none">
              {format(new Date(ev.fecha), 'd')}
            </p>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4">
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <MapPin size={12} className="flex-shrink-0" />
            <span className="truncate">{ev.lugar}{ev.ciudad ? `, ${ev.ciudad}` : ''}{ev.estado ? `, ${ev.estado}` : ''}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Clock size={12} className="flex-shrink-0" />
            {format(new Date(ev.fecha), "HH:mm 'hrs'", { locale: es })} ·{' '}
            {isPast
              ? formatDistanceToNow(new Date(ev.fecha), { locale: es, addSuffix: true })
              : formatDistanceToNow(new Date(ev.fecha), { locale: es, addSuffix: true })}
          </div>
          {ev.distanciaKm && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Trophy size={12} className="flex-shrink-0" /> {ev.distanciaKm} km
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {/* Inscritos — solo visible para el coach */}
          {isCoach ? (
            <div className="flex items-center gap-1.5">
              <Users size={12} className="text-gray-500" />
              <span className="text-xs text-gray-400">
                {ev._count?.registros ?? 0}{ev.cupoMaximo ? `/${ev.cupoMaximo}` : ''} inscritos
              </span>
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">
              {ev.precio === 0 ? 'Gratis' : `$${ev.precio.toLocaleString('es-MX')}`}
            </span>
            <button onClick={(e) => { e.stopPropagation(); onShare(ev); }}
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-surface-500 transition-all" title="Compartir">
              <Share2 size={13} />
            </button>
            {isCoach && onEdit && (
              <button onClick={(e) => { e.stopPropagation(); onEdit(ev); }}
                className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-all" title="Editar evento">
                <Edit2 size={13} />
              </button>
            )}
            {isCoach && onDelete && (
              <button onClick={(e) => { e.stopPropagation(); if (confirm(`¿Eliminar "${ev.nombre}"?`)) onDelete(ev.id); }}
                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-all" title="Eliminar evento">
                <Trash2 size={13} />
              </button>
            )}
            {!isCoach && !isPast && (
              isRegistered ? (
                <button onClick={e => { e.stopPropagation(); onViewDetail?.(ev); }}
                  className="text-xs px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 font-medium flex items-center gap-1 hover:bg-green-500/25 transition-colors">
                  <CheckCircle size={11} /> Inscrito · ver detalle
                </button>
              ) : (
                <button onClick={() => onRegisterClick?.(ev)}
                  className="text-xs px-3 py-1.5 rounded-full bg-brand-500 hover:bg-brand-600 text-white font-semibold transition-colors active:scale-95">
                  Inscribirme
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Events() {
  const { isCoach, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editEvent, setEditEvent] = useState<Event | null>(null);
  const [shareEvent, setShareEvent] = useState<Event | null>(null);
  const [registerEvent, setRegisterEvent] = useState<Event | null>(null);
  const [runnerDetailEvent, setRunnerDetailEvent] = useState<Event | null>(null);
  const [filter, setFilter] = useState<'todos' | 'carrera' | 'trail' | 'entrenamiento' | 'social'>('todos');
  const [form, setForm] = useState({
    nombre: '', tipo: 'carrera', descripcion: '', fecha: '', lugar: '',
    ciudad: '', estado: '', distanciaKm: '', cupoMaximo: '', precio: '0',
    notificarCorredores: false,
  });
  const [editForm, setEditForm] = useState({
    nombre: '', tipo: 'carrera', descripcion: '', fecha: '', lugar: '',
    ciudad: '', estado: '', distanciaKm: '', cupoMaximo: '', precio: '0',
  });
  const [improvingText, setImprovingText] = useState(false);

  const { data } = useQuery({ queryKey: ['events'], queryFn: () => eventsApi.list() });
  const { data: meData } = useQuery({
    queryKey: ['runner-me'],
    queryFn: () => runnersApi.me(),
    enabled: !isCoach,
  });

  const events: Event[] = data?.data ?? [];
  const myRegistrations = new Set<number>([
    ...(meData?.data?.eventRegistrations ?? []).map((r: { eventId: number }) => r.eventId),
    ...(meData?.data?.paidLeadEventIds ?? []),
  ]);

  const createMutation = useMutation({
    mutationFn: (d: object) => eventsApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setShowForm(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => eventsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => eventsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); setEditEvent(null); },
  });

  const openEdit = (ev: Event) => {
    const fechaLocal = new Date(ev.fecha).toISOString().slice(0, 16);
    setEditForm({
      nombre:      ev.nombre,
      tipo:        ev.tipo,
      descripcion: ev.descripcion ?? '',
      fecha:       fechaLocal,
      lugar:       ev.lugar,
      ciudad:      ev.ciudad ?? '',
      estado:      ev.estado ?? '',
      distanciaKm: ev.distanciaKm?.toString() ?? '',
      cupoMaximo:  ev.cupoMaximo?.toString() ?? '',
      precio:      ev.precio.toString(),
    });
    setEditEvent(ev);
  };

  const improveText = () => {
    setImprovingText(true);
    const texto = generarTextoEvento({
      nombre:      form.nombre,
      tipo:        form.tipo,
      lugar:       form.lugar,
      ciudad:      form.ciudad,
      fecha:       form.fecha,
      distanciaKm: form.distanciaKm,
      precio:      form.precio,
      descripcion: form.descripcion,
    });
    setForm(f => ({ ...f, descripcion: texto }));
    setTimeout(() => setImprovingText(false), 200);
  };

  const shown = filter === 'todos' ? events : events.filter(e => e.tipo === filter);
  const upcoming = shown.filter(e => isAfter(new Date(e.fecha), new Date()));
  const past = shown.filter(e => !isAfter(new Date(e.fecha), new Date()));

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">Eventos</h1>
          <p className="text-gray-500 text-sm mt-0.5">Carreras, trails y encuentros del equipo JTZ</p>
        </div>
        {isCoach && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
            <Plus size={16} /> Crear evento
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { key: 'todos', label: 'Todos' },
          { key: 'carrera', label: '🏃 Carrera' },
          { key: 'trail', label: '🏔️ Trail' },
          { key: 'entrenamiento', label: '💪 Entrenamiento' },
          { key: 'social', label: '🎉 Social' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`text-sm px-4 py-1.5 rounded-full font-medium transition-all duration-150 ${
              filter === key
                ? 'bg-brand-500 text-white shadow-glow-sm'
                : 'bg-surface-700 text-gray-400 hover:text-white border border-white/[0.06]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {upcoming.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Calendar size={12} /> Próximos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {upcoming.map((ev) => (
              <div key={ev.id} className="flex flex-col gap-2">
                <EventCard ev={ev} onRegisterClick={!isCoach ? setRegisterEvent : undefined} onViewDetail={!isCoach ? setRunnerDetailEvent : undefined} myRegistrations={myRegistrations} isCoach={isCoach} onShare={setShareEvent} onDelete={isCoach ? (id) => deleteMutation.mutate(id) : undefined} onEdit={isCoach ? openEdit : undefined} />
                {isCoach && (
                  <div className="flex gap-2">
                    <button onClick={() => navigate(`/eventos/${ev.id}/inscritos`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 border border-brand-500/20 transition-all">
                      <Users size={13} /> Ver inscritos ({ev._count?.registros ?? 0})
                    </button>
                    <a href={`/evento/${ev.id}`} target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-surface-600 hover:bg-surface-500 text-gray-300 border border-white/[0.06] transition-all">
                      <ExternalLink size={13} />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Anteriores</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {past.slice(0, 6).map((ev) => (
              <EventCard key={ev.id} ev={ev} onViewDetail={!isCoach ? setRunnerDetailEvent : undefined} myRegistrations={myRegistrations} isCoach={isCoach} onShare={setShareEvent} onDelete={isCoach ? (id) => deleteMutation.mutate(id) : undefined} onEdit={isCoach ? openEdit : undefined} />
            ))}
          </div>
        </div>
      )}

      {shown.length === 0 && (
        <div className="text-center py-20">
          <span className="text-6xl">🏃</span>
          <p className="text-gray-500 mt-4">No hay eventos en esta categoría</p>
        </div>
      )}

      {shareEvent && <ShareModal ev={shareEvent} onClose={() => setShareEvent(null)} />}
      {runnerDetailEvent && (
        <RunnerEventDetailModal
          ev={runnerDetailEvent}
          isPaid={myRegistrations.has(runnerDetailEvent.id)}
          onClose={() => setRunnerDetailEvent(null)}
        />
      )}

      {registerEvent && (
        <RegisterModal
          ev={registerEvent}
          runnerMe={meData?.data}
          onClose={() => { setRegisterEvent(null); qc.invalidateQueries({ queryKey: ['runner-me'] }); }}
        />
      )}

      {/* Create event modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">Crear evento</h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Tipo de evento</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(typeConfig).map(([key, cfg]) => (
                    <button key={key} onClick={() => setForm({ ...form, tipo: key })}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-medium transition-all ${
                        form.tipo === key ? 'bg-brand-500/20 border-brand-500/50 text-white' : 'bg-surface-600 border-white/[0.06] text-gray-400 hover:text-white'
                      }`}>
                      <span className="text-lg">{cfg.emoji}</span>{cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nombre del evento</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="input w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Lugar</label>
                <LocationInput
                  value={form.lugar}
                  onChange={v => setForm(f => ({ ...f, lugar: v }))}
                  onLocationSelect={(lugar, ciudad, estado) => setForm(f => ({ ...f, lugar, ciudad, estado }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Fecha y hora</label>
                  <input type="datetime-local" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Ciudad</label>
                  <input value={form.ciudad} placeholder="Ej: Tijuana" onChange={(e) => setForm({ ...form, ciudad: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Estado</label>
                  <input value={form.estado} placeholder="Ej: Baja California" onChange={(e) => setForm({ ...form, estado: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Distancia (km)</label>
                  <input type="number" value={form.distanciaKm} onChange={(e) => setForm({ ...form, distanciaKm: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Precio (MXN)</label>
                  <input type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} className="input w-full text-sm" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-400">Descripción</label>
                  <button type="button" onClick={improveText} disabled={improvingText || (!form.nombre && !form.tipo)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-brand-500/15 text-brand-400 hover:bg-brand-500/25 transition-all disabled:opacity-40">
                    <Sparkles size={12} />
                    {improvingText ? 'Generando…' : '✨ Generar texto'}
                  </button>
                </div>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  rows={3}
                  spellCheck
                  lang="es-MX"
                  placeholder="Escribe la descripción… el corrector nativo subrayará errores mientras escribes"
                  className="input w-full text-sm resize-none"
                />
              </div>

              {/* Notify runners checkbox */}
              <label className="flex items-center gap-3 p-3 rounded-xl bg-surface-600 border border-white/[0.06] cursor-pointer hover:border-brand-500/30 transition-all">
                <input type="checkbox" checked={form.notificarCorredores}
                  onChange={e => setForm({ ...form, notificarCorredores: e.target.checked })}
                  className="w-4 h-4 accent-brand-500 cursor-pointer" />
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-brand-400" />
                  <div>
                    <p className="text-sm font-semibold text-white">Notificar a todos los corredores</p>
                    <p className="text-xs text-gray-500">Se enviará un correo a todos los corredores activos al crear el evento</p>
                  </div>
                </div>
              </label>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={() => createMutation.mutate({
                  ...form,
                  distanciaKm: form.distanciaKm ? Number(form.distanciaKm) : undefined,
                  cupoMaximo:  form.cupoMaximo  ? Number(form.cupoMaximo)  : undefined,
                  precio:      Number(form.precio),
                })}
                disabled={createMutation.isPending}
                className="flex-1 btn-primary py-2.5 text-sm">
                {createMutation.isPending ? 'Creando...' : 'Crear evento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit event modal */}
      {editEvent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Edit2 size={18} className="text-brand-400" /> Editar evento
              </h2>
              <button onClick={() => setEditEvent(null)} className="btn-ghost p-2"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Tipo de evento</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(typeConfig).map(([key, cfg]) => (
                    <button key={key} onClick={() => setEditForm({ ...editForm, tipo: key })}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-medium transition-all ${
                        editForm.tipo === key ? 'bg-brand-500/20 border-brand-500/50 text-white' : 'bg-surface-600 border-white/[0.06] text-gray-400 hover:text-white'
                      }`}>
                      <span className="text-lg">{cfg.emoji}</span>{cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nombre del evento</label>
                <input value={editForm.nombre} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })} className="input w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Lugar</label>
                <LocationInput
                  value={editForm.lugar}
                  onChange={v => setEditForm(f => ({ ...f, lugar: v }))}
                  onLocationSelect={(lugar, ciudad, estado) => setEditForm(f => ({ ...f, lugar, ciudad, estado }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Fecha y hora</label>
                  <input type="datetime-local" value={editForm.fecha} onChange={e => setEditForm({ ...editForm, fecha: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Ciudad</label>
                  <input value={editForm.ciudad} onChange={e => setEditForm({ ...editForm, ciudad: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Estado</label>
                  <input value={editForm.estado} placeholder="Ej: Baja California" onChange={e => setEditForm({ ...editForm, estado: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Distancia (km)</label>
                  <input type="number" value={editForm.distanciaKm} onChange={e => setEditForm({ ...editForm, distanciaKm: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Precio (MXN)</label>
                  <input type="number" value={editForm.precio} onChange={e => setEditForm({ ...editForm, precio: e.target.value })} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Cupo máximo</label>
                  <input type="number" value={editForm.cupoMaximo} onChange={e => setEditForm({ ...editForm, cupoMaximo: e.target.value })} className="input w-full text-sm" placeholder="Sin límite" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-400">Descripción</label>
                  <button type="button"
                    onClick={() => {
                      const texto = generarTextoEvento({
                        nombre: editForm.nombre, tipo: editForm.tipo, lugar: editForm.lugar,
                        ciudad: editForm.ciudad, fecha: editForm.fecha,
                        distanciaKm: editForm.distanciaKm, precio: editForm.precio,
                        descripcion: editForm.descripcion,
                      });
                      setEditForm(f => ({ ...f, descripcion: texto }));
                    }}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-brand-500/15 text-brand-400 hover:bg-brand-500/25 transition-all">
                    <Sparkles size={12} /> ✨ Generar texto
                  </button>
                </div>
                <textarea value={editForm.descripcion} onChange={e => setEditForm({ ...editForm, descripcion: e.target.value })}
                  rows={3} spellCheck lang="es-MX" className="input w-full text-sm resize-none" />
              </div>

              {/* GPX upload */}
              <GpxUpload eventId={editEvent.id} currentGpxNombre={editEvent.gpxNombre} />
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditEvent(null)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => updateMutation.mutate({
                  id: editEvent.id,
                  data: {
                    ...editForm,
                    distanciaKm: editForm.distanciaKm ? Number(editForm.distanciaKm) : undefined,
                    cupoMaximo:  editForm.cupoMaximo  ? Number(editForm.cupoMaximo)  : undefined,
                    precio:      Number(editForm.precio),
                  },
                })}
                disabled={updateMutation.isPending}
                className="flex-1 btn-primary py-2.5 text-sm font-semibold">
                {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
