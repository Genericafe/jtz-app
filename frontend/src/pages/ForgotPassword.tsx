import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, MailCheck, ArrowLeft } from 'lucide-react';
import { authApi } from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
    } catch { /* respond the same either way */ }
    setSent(true);
    setLoading(false);
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
          <h1 className="heading-display text-4xl leading-none text-white">Recuperar acceso</h1>
          <p className="text-gray-500 text-sm mt-2">Te enviaremos un enlace para crear una nueva contraseña</p>
        </div>

        {sent ? (
          <div className="card p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-500/15 mx-auto">
              <MailCheck size={26} className="text-brand-400" />
            </div>
            <h2 className="text-xl text-white">Revisa tu correo</h2>
            <p className="text-gray-400 text-sm">
              Si <strong className="text-white">{email}</strong> tiene una cuenta, te enviamos un enlace para
              restablecer tu contraseña. Vence en 1 hora.
            </p>
            <p className="text-gray-500 text-xs">¿No lo ves? Revisa spam o correo no deseado.</p>
            <Link to="/login" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm mt-2">
              <ArrowLeft size={16} /> Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-8 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Correo electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                required
                className="input w-full"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm">
              {loading ? 'Enviando…' : 'Enviar enlace de recuperación'}
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
