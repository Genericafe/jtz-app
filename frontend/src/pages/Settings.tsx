import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { settingsApi, default as api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Mail, CheckCircle, Eye, EyeOff,
  Trash2, Send, ExternalLink, Settings as SettingsIcon,
  LogIn, Info,
} from 'lucide-react';

const PROVIDERS = [
  {
    id: 'google_oauth',
    name: 'Gmail (OAuth)',
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    id: 'outlook',
    name: 'Outlook',
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6">
        <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.32.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.1V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.29.1.29.43zm-8-6.88v3.56l1.44.84V5.12H16zm4.8 0H18.3v4.58l1.44.84V5.12h1.06zm.2 8.2l-5.9-3.45v6.89l5.9 3.44V13.32z" fill="#0078D4"/>
      </svg>
    ),
  },
  {
    id: 'smtp',
    name: 'Otro SMTP',
    logo: <SettingsIcon className="w-6 h-6 text-gray-400" />,
  },
];

function parseErrorMsg(msg: string, provider: string): { title: string; steps: string[] } | null {
  if (provider !== 'outlook' && provider !== 'smtp') return null;
  if (msg.includes('535') || msg.includes('BadCredentials') || msg.includes('Username and Password')) {
    return {
      title: 'Credenciales incorrectas',
      steps: [
        'Verifica que el correo y la contraseña sean correctos.',
        'Para Outlook con 2FA activa, genera una App Password en account.microsoft.com/security.',
      ],
    };
  }
  if (msg.includes('ECONNREFUSED') || msg.includes('connect')) {
    return { title: 'No se pudo conectar', steps: ['Revisa el servidor SMTP y el puerto.'] };
  }
  return null;
}

export default function Settings() {
  const { isCoach } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedProvider, setSelectedProvider] = useState('google_oauth');
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({
    provider: 'outlook' as string,
    fromName: 'JTZ Running Club',
    fromEmail: '',
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [oauthLoading, setOauthLoading] = useState(false);

  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['email-config'],
    queryFn: () => settingsApi.getEmailConfig(),
  });
  const existingConfig = configData?.data;

  // Handle redirect back from Google OAuth
  useEffect(() => {
    const ok    = searchParams.get('email_ok');
    const error = searchParams.get('email_error');
    if (ok) {
      setSaveStatus('success');
      qc.invalidateQueries({ queryKey: ['email-config'] });
      setSearchParams({}, { replace: true });
      setTimeout(() => setSaveStatus('idle'), 6000);
    } else if (error) {
      const msgs: Record<string, string> = {
        acceso_denegado:   'Cancelaste la autorización de Google.',
        sin_refresh_token: 'No se recibió el token de refresco. Intenta desconectar la app en myaccount.google.com/permissions y vuelve a conectar.',
        fallo_intercambio: 'Error al intercambiar el código con Google. Intenta de nuevo.',
      };
      setErrorMsg(msgs[error] ?? `Error de OAuth: ${error}`);
      setSaveStatus('error');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  // Populate form when existing config loads
  useEffect(() => {
    if (existingConfig) {
      setSelectedProvider(existingConfig.provider === 'google_oauth' ? 'google_oauth' : existingConfig.provider);
      if (existingConfig.provider !== 'google_oauth') {
        setForm({
          provider:  existingConfig.provider,
          fromName:  existingConfig.fromName,
          fromEmail: existingConfig.fromEmail,
          smtpHost:  existingConfig.smtpHost,
          smtpPort:  existingConfig.smtpPort,
          smtpUser:  existingConfig.provider !== 'smtp' ? existingConfig.fromEmail : existingConfig.smtpUser,
          smtpPass:  '',
        });
      }
    }
  }, [existingConfig]);

  // Start Google OAuth flow
  const startGoogleAuth = async () => {
    setOauthLoading(true);
    setSaveStatus('idle');
    setErrorMsg('');
    try {
      const res = await api.get('/settings/email/google/auth');
      window.location.href = res.data.url;
    } catch {
      setErrorMsg('No se pudo iniciar la autenticación con Google. Intenta de nuevo.');
      setSaveStatus('error');
      setOauthLoading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: (data: object) => settingsApi.saveEmailConfig(data),
    onSuccess: () => {
      setSaveStatus('success');
      qc.invalidateQueries({ queryKey: ['email-config'] });
      setTimeout(() => setSaveStatus('idle'), 5000);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string; detail?: string } } };
      setErrorMsg(e.response?.data?.detail ?? e.response?.data?.error ?? 'Error de conexión');
      setSaveStatus('error');
    },
  });

  const testMutation = useMutation({
    mutationFn: () => Promise.race([
      settingsApi.testEmailConfig(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000)),
    ]),
    onSuccess: () => { setSaveStatus('success'); setTimeout(() => setSaveStatus('idle'), 5000); },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } }; name?: string };
      if ((e as Error).message === 'timeout') {
        setErrorMsg('El envío tardó demasiado. Revisa tu bandeja de entrada — puede que el correo sí llegó.');
      } else {
        setErrorMsg(e.response?.data?.error ?? 'Error al enviar el correo de prueba.');
      }
      setSaveStatus('error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => settingsApi.deleteEmailConfig(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-config'] });
      setSaveStatus('idle');
      setErrorMsg('');
    },
  });

  const selectProvider = (id: string) => {
    setSelectedProvider(id);
    const smtpDefaults: Record<string, { host: string; port: number }> = {
      outlook: { host: 'smtp.office365.com', port: 587 },
      smtp:    { host: '', port: 587 },
    };
    if (id !== 'google_oauth') {
      const d = smtpDefaults[id] ?? smtpDefaults.smtp;
      setForm(f => ({ ...f, provider: id, smtpHost: d.host, smtpPort: d.port, smtpUser: id !== 'smtp' ? f.fromEmail : f.smtpUser }));
    }
    setSaveStatus('idle');
    setErrorMsg('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('testing');
    setErrorMsg('');
    saveMutation.mutate(form);
  };

  const isGoogleConnected = existingConfig?.verified && existingConfig?.provider === 'google_oauth';
  const parsedError = saveStatus === 'error' ? parseErrorMsg(errorMsg, selectedProvider) : null;

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">Configuración</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {isCoach ? 'Conecta tu correo para enviar confirmaciones y comunicados desde JTZ' : 'Ajustes de tu cuenta'}
        </p>
      </div>

      {/* Runners only see a simple info screen */}
      {!isCoach && (
        <div className="card p-6 text-center">
          <Mail size={32} className="mx-auto text-brand-400 mb-3" />
          <p className="text-white font-semibold mb-1">Tu correo está vinculado</p>
          <p className="text-sm text-gray-400">
            Los correos del club se envían a la dirección con la que te registraste.<br />
            Contacta a tu coach si necesitas actualizarla.
          </p>
        </div>
      )}

      {isCoach && (<>

      {/* Connected banner */}
      {existingConfig?.verified && (
        <div className={`flex items-center gap-3 rounded-2xl px-5 py-4 mb-6 border ${
          isGoogleConnected
            ? 'bg-green-500/10 border-green-500/20'
            : 'bg-blue-500/10 border-blue-500/20'
        }`}>
          <CheckCircle size={20} className="text-green-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-300">
              {isGoogleConnected ? 'Gmail conectado con Google OAuth' : 'Correo conectado'}
            </p>
            <p className="text-xs text-green-400/70 mt-0.5 truncate">{existingConfig.fromEmail}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => testMutation.mutate()} disabled={testMutation.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-all">
              <Send size={12} /> {testMutation.isPending ? 'Enviando...' : 'Probar'}
            </button>
            <button onClick={() => deleteMutation.mutate()}
              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Mail size={14} /> Proveedor de correo
        </h2>

        {/* Provider selector */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {PROVIDERS.map(p => (
            <button key={p.id} onClick={() => selectProvider(p.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                selectedProvider === p.id
                  ? 'bg-brand-500/15 border-brand-500/40 text-white'
                  : 'bg-surface-600 border-white/[0.06] text-gray-400 hover:text-white hover:border-white/20'
              }`}>
              {p.logo}
              <span className="text-xs font-semibold">{p.name}</span>
            </button>
          ))}
        </div>

        {/* ── Google OAuth panel ─────────────────────────────────────── */}
        {selectedProvider === 'google_oauth' && (
          <div className="space-y-4">
            <div className="bg-surface-700 border border-white/[0.06] rounded-xl p-5 space-y-3">
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <Info size={15} className="text-brand-400" /> ¿Cómo funciona?
              </p>
              {[
                'Haz click en el botón de abajo.',
                'Selecciona tu cuenta de Gmail y autoriza a JTZ a enviar correos.',
                'Listo — sin contraseñas, sin App Passwords. Los tokens se renuevan solos.',
              ].map((s, i) => (
                <div key={i} className="flex gap-3 text-sm text-gray-400">
                  <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>

            <button
              onClick={startGoogleAuth}
              disabled={oauthLoading || configLoading}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-white hover:bg-gray-100 transition-colors text-gray-800 font-semibold text-sm disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {oauthLoading ? 'Redirigiendo a Google...' : isGoogleConnected ? 'Reconectar con Google' : 'Continuar con Google'}
              {!oauthLoading && <LogIn size={16} />}
            </button>
          </div>
        )}

        {/* ── Outlook / SMTP manual form ─────────────────────────────── */}
        {selectedProvider !== 'google_oauth' && (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Nombre del remitente</label>
                <input value={form.fromName} onChange={e => setForm({ ...form, fromName: e.target.value })}
                  placeholder="JTZ Running Club" required className="input w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                  {selectedProvider === 'outlook' ? 'Tu correo Outlook' : 'Correo del remitente'}
                </label>
                <input type="email" value={form.fromEmail}
                  onChange={e => setForm({ ...form, fromEmail: e.target.value, smtpUser: selectedProvider !== 'smtp' ? e.target.value : form.smtpUser })}
                  placeholder={selectedProvider === 'outlook' ? 'tu@outlook.com' : 'coach@dominio.com'}
                  required className="input w-full text-sm" />
              </div>
            </div>

            {selectedProvider === 'smtp' && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">Servidor SMTP</label>
                    <input value={form.smtpHost} onChange={e => setForm({ ...form, smtpHost: e.target.value })}
                      placeholder="smtp.tudominio.com" required className="input w-full text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1.5">Puerto</label>
                    <input type="number" value={form.smtpPort} onChange={e => setForm({ ...form, smtpPort: Number(e.target.value) })}
                      className="input w-full text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">Usuario SMTP</label>
                  <input value={form.smtpUser} onChange={e => setForm({ ...form, smtpUser: e.target.value })}
                    placeholder="usuario@correo.com" required className="input w-full text-sm" />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Contraseña</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={form.smtpPass}
                  onChange={e => setForm({ ...form, smtpPass: e.target.value })}
                  placeholder={existingConfig ? 'Dejar vacío para no cambiar' : '••••••••'}
                  required={!existingConfig} className="input w-full text-sm pr-10" />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {selectedProvider === 'outlook' && (
                <p className="text-xs text-gray-500 mt-1.5">
                  Si tienes 2FA activa genera una App Password en{' '}
                  <a href="https://account.microsoft.com/security" target="_blank" rel="noreferrer"
                    className="text-brand-400 inline-flex items-center gap-0.5">
                    account.microsoft.com/security <ExternalLink size={10}/>
                  </a>
                </p>
              )}
            </div>

            {/* Status */}
            {saveStatus === 'testing' && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
                <Send size={14} className="animate-pulse" /> Verificando conexión SMTP...
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1.5">
                {parsedError ? (
                  <>
                    <p className="text-sm text-red-400 font-semibold">{parsedError.title}</p>
                    {parsedError.steps.map((s, i) => <p key={i} className="text-xs text-red-300/80">{i + 1}. {s}</p>)}
                  </>
                ) : (
                  <>
                    <p className="text-sm text-red-400 font-semibold">Error de conexión</p>
                    <p className="text-xs text-red-400/70">{errorMsg}</p>
                  </>
                )}
              </div>
            )}

            <button type="submit" disabled={saveMutation.isPending}
              className="w-full btn-primary py-3 text-sm font-semibold flex items-center justify-center gap-2">
              <Mail size={15} />
              {saveMutation.isPending ? 'Conectando...' : existingConfig ? 'Actualizar configuración' : 'Conectar correo'}
            </button>
          </form>
        )}

        {/* OAuth status/error shown outside the form */}
        {selectedProvider === 'google_oauth' && saveStatus === 'success' && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm text-green-300 mt-4">
            <CheckCircle size={14} /> ¡Gmail conectado! Se envió un correo de prueba a tu dirección.
          </div>
        )}
        {selectedProvider === 'google_oauth' && saveStatus === 'error' && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 mt-4">
            <p className="text-sm text-red-400 font-semibold">Error de autenticación</p>
            <p className="text-xs text-red-400/70 mt-0.5">{errorMsg}</p>
          </div>
        )}
      </div>

      <div className="mt-4 card p-5">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">¿Cómo funciona?</h3>
        <div className="space-y-2.5">
          {[
            { icon: '📧', text: 'Todos los correos de JTZ se enviarán desde TU dirección personal' },
            { icon: '✅', text: 'Confirmaciones de inscripción a eventos se envían automáticamente' },
            { icon: '📢', text: 'Los correos masivos a inscritos también salen desde tu cuenta' },
            { icon: '🔒', text: 'Con OAuth2 nunca necesitas contraseñas — Google gestiona todo' },
          ].map(({ icon, text }) => (
            <div key={icon} className="flex items-start gap-3 text-sm text-gray-400">
              <span className="text-base flex-shrink-0">{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
      </>)}
    </div>
  );
}
