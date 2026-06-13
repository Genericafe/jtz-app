import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Trophy } from 'lucide-react';

const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const GENEROS = [
  { value: 'femenino', label: 'Femenino' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'no_binario', label: 'No binario' },
  { value: 'prefiero_no_responder', label: 'Prefiero no responder' },
];

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    confirmar: '',
    telefono: '',
    fechaNacimiento: '',
    genero: '',
    pais: 'México',
    estado: '',
    ciudad: '',
    tallaCamiseta: '',
    nivel: 'principiante',
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmar) { setError('Las contraseñas no coinciden'); return; }
    if (form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { authApi } = await import('../services/api');
      await authApi.register({
        nombre: form.nombre,
        apellido: form.apellido,
        email: form.email,
        password: form.password,
        role: 'runner',
        telefono: form.telefono || undefined,
        fechaNacimiento: form.fechaNacimiento || undefined,
        genero: form.genero || undefined,
        pais: form.pais || undefined,
        estado: form.estado || undefined,
        ciudad: form.ciudad || undefined,
        tallaCamiseta: form.tallaCamiseta || undefined,
        nivel: form.nivel,
      });
      await login(form.email, form.password);
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Error al crear la cuenta. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-hero mb-4 shadow-glow">
            <Trophy size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-black gradient-text">Únete al equipo</h1>
          <p className="text-gray-500 mt-1">JTZ Running Club · México</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step >= s ? 'bg-brand-500 text-white shadow-glow-sm' : 'bg-surface-600 text-gray-500'
              }`}>{s}</div>
              {s < 2 && <div className={`flex-1 h-0.5 rounded-full transition-all ${step >= 2 ? 'bg-brand-500' : 'bg-surface-600'}`} />}
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {s === 1 ? 'Tu cuenta' : 'Tu perfil'}
              </span>
            </div>
          ))}
        </div>

        <div className="card p-6 lg:p-8">
          {step === 1 ? (
            <form onSubmit={handleNext} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nombre</label>
                  <input type="text" value={form.nombre} placeholder="Ana"
                    onChange={e => set('nombre', e.target.value)} required className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Apellido</label>
                  <input type="text" value={form.apellido} placeholder="García"
                    onChange={e => set('apellido', e.target.value)} required className="input w-full" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Correo electrónico</label>
                <input type="email" value={form.email} placeholder="ana@correo.com"
                  onChange={e => set('email', e.target.value)} required className="input w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Contraseña</label>
                <input type="password" value={form.password} placeholder="Mínimo 6 caracteres"
                  onChange={e => set('password', e.target.value)} required className="input w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Confirmar contraseña</label>
                <input type="password" value={form.confirmar} placeholder="••••••••"
                  onChange={e => set('confirmar', e.target.value)} required className="input w-full" />
              </div>

              {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">{error}</p>}

              <button type="submit" className="btn-primary w-full py-3 text-sm mt-2">
                Continuar →
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Fecha y género */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Fecha de nacimiento</label>
                  <input type="date" value={form.fechaNacimiento}
                    onChange={e => set('fechaNacimiento', e.target.value)}
                    className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Género</label>
                  <select value={form.genero} onChange={e => set('genero', e.target.value)} className="input w-full text-sm">
                    <option value="">Seleccionar...</option>
                    {GENEROS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Ubicación */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">País</label>
                <input type="text" value={form.pais} placeholder="México"
                  onChange={e => set('pais', e.target.value)} className="input w-full text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Estado / Provincia</label>
                  <input type="text" value={form.estado} placeholder="Baja California"
                    onChange={e => set('estado', e.target.value)} className="input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Ciudad</label>
                  <input type="text" value={form.ciudad} placeholder="Tijuana"
                    onChange={e => set('ciudad', e.target.value)} className="input w-full text-sm" />
                </div>
              </div>

              {/* Teléfono */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Teléfono <span className="text-gray-600">(opcional)</span></label>
                <input type="tel" value={form.telefono} placeholder="664-123-4567"
                  onChange={e => set('telefono', e.target.value)} className="input w-full text-sm" />
              </div>

              {/* Talla y nivel */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Talla de camiseta</label>
                  <select value={form.tallaCamiseta} onChange={e => set('tallaCamiseta', e.target.value)} className="input w-full text-sm">
                    <option value="">Seleccionar...</option>
                    {TALLAS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nivel actual</label>
                  <select value={form.nivel} onChange={e => set('nivel', e.target.value)} className="input w-full text-sm">
                    <option value="principiante">Principiante</option>
                    <option value="intermedio">Intermedio</option>
                    <option value="avanzado">Avanzado</option>
                    <option value="elite">Elite</option>
                  </select>
                </div>
              </div>

              {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">
                  ← Atrás
                </button>
                <button type="submit" disabled={loading} className="flex-1 btn-primary py-3 text-sm">
                  {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-semibold">Iniciar sesión</Link>
        </p>
      </div>
    </div>
  );
}
