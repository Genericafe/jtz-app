import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Trophy, Smartphone } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Correo o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-surface-900 flex items-center justify-center px-4 overflow-hidden">
      {/* Cinematic backdrop: topographic texture + azure glow */}
      <div className="absolute inset-0 topo-bg opacity-60" />
      <div className="absolute inset-0 bg-glow-green" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-brand-500/20 blur-[120px]" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-hero mb-5 shadow-glow">
            <Trophy size={32} className="text-white" />
          </div>
          <h1 className="heading-display text-6xl leading-none gradient-text">JTZ</h1>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.35em] text-brand-300">
            Trail · Ruta · Comunidad
          </p>
          <p className="text-gray-500 text-sm mt-2">Running Club · México</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-8 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="input w-full"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-sm"
          >
            {loading ? 'Entrando...' : 'Iniciar sesión'}
          </button>

          <div className="text-center space-y-2 pt-1">
            <Link to="/recuperar" className="text-sm text-brand-400 hover:text-brand-300 font-medium">
              ¿Olvidaste tu contraseña?
            </Link>
            <p className="text-xs text-gray-600">Demo: coach@jtz.mx / coach123</p>
            <p className="text-sm text-gray-400">
              ¿Eres nuevo en el equipo?{' '}
              <Link to="/registro" className="text-brand-400 hover:text-brand-300 font-semibold">
                Crear cuenta
              </Link>
            </p>
          </div>
        </form>

        <a
          href="/JTZ-app.apk"
          download
          className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 transition-colors text-sm font-semibold"
        >
          <Smartphone size={16} />
          Descargar app para Android
        </a>
        <p className="text-center text-xs text-gray-600 mt-2">
          Para instalarla, activa "Instalar de fuentes desconocidas" en tu teléfono.
        </p>
      </div>
    </div>
  );
}
