import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { KeyRound, CheckCircle2, ArrowLeft } from 'lucide-react';
import { authApi } from '../services/api';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');
    if (password !== confirm) return setError('Las contraseñas no coinciden');
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'No se pudo restablecer. El enlace pudo haber vencido.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-surface-900 flex items-center justify-center px-4 overflow-hidden">
      <div className="absolute inset-0 topo-bg opacity-60" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-brand-500/20 blur-[120px]" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-hero mb-5 shadow-glow">
            <KeyRound size={30} className="text-white" />
          </div>
          <h1 className="heading-display text-4xl leading-none text-white">Nueva contraseña</h1>
          <p className="text-gray-500 text-sm mt-2">Crea una contraseña para tu cuenta</p>
        </div>

        {!token ? (
          <div className="card p-8 text-center space-y-3">
            <p className="text-red-400">Enlace inválido</p>
            <p className="text-gray-400 text-sm">Falta el código de recuperación. Solicita un enlace nuevo.</p>
            <Link to="/recuperar" className="btn-primary inline-block px-5 py-2.5 text-sm mt-1">Solicitar enlace</Link>
          </div>
        ) : done ? (
          <div className="card p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-500/15 mx-auto">
              <CheckCircle2 size={28} className="text-brand-400" />
            </div>
            <h2 className="text-xl text-white">¡Contraseña actualizada!</h2>
            <p className="text-gray-400 text-sm">Ya puedes iniciar sesión con tu nueva contraseña. Te llevamos al login…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-8 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Nueva contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required minLength={6} className="input w-full" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Confirmar contraseña</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••" required minLength={6} className="input w-full" />
            </div>
            {error && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">{error}</p>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm">
              {loading ? 'Guardando…' : 'Guardar contraseña'}
            </button>
            <Link to="/login" className="flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-white pt-1">
              <ArrowLeft size={15} /> Volver a iniciar sesión
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
