import { useState } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { publicApi } from '../services/api';

// Race-day recovery: a registered runner types their email and gets their
// personal magic link to start marking their activity (no account needed).
export default function ParticipantLinkBox({ eventId }: { eventId: number }) {
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [dorsal, setDorsal] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const find = async () => {
    setErr(null); setLoading(true);
    try {
      const { data } = await publicApi.participantLinkByEmail(eventId, email.trim());
      setUrl(data.url); setDorsal(data.dorsal ?? null); setNombre(data.nombre ?? '');
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'No encontramos tu inscripción.');
    } finally { setLoading(false); }
  };

  if (url) return (
    <div className="text-center">
      <p className="text-sm text-gray-300">Hola <span className="font-bold text-white">{nombre}</span>{dorsal != null && <> · Corredor <span className="font-black text-white">#{dorsal}</span></>}</p>
      <a href={url} className="btn-primary inline-flex items-center gap-2 mt-3 px-6 py-3 text-sm font-bold">
        <Play size={16} fill="white" /> Iniciar mi recorrido
      </a>
    </div>
  );

  return (
    <div>
      <p className="text-sm font-semibold text-white mb-1">¿Eres corredor inscrito?</p>
      <p className="text-xs text-gray-400 mb-3">Escribe tu correo de inscripción para obtener tu enlace y marcar tu actividad en vivo.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="tu@correo.com"
          className="input flex-1" onKeyDown={e => { if (e.key === 'Enter') find(); }} />
        <button onClick={find} disabled={loading || !email.trim()} className="btn-primary px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {loading ? <Loader2 size={15} className="animate-spin" /> : 'Obtener enlace'}
        </button>
      </div>
      {err && <p className="text-sm text-amber-400 mt-2">{err}</p>}
    </div>
  );
}
