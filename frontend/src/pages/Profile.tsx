import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runnersApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { User, CheckCircle, AlertCircle } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({ nombre: '', apellido: '', telefono: '', ciudad: '', estado: '' });

  const { data: meData, isLoading } = useQuery({
    queryKey: ['runner-me'],
    queryFn: () => runnersApi.me(),
  });

  const me = meData?.data;

  useEffect(() => {
    if (me) {
      setForm({
        nombre: me.nombre ?? '',
        apellido: me.apellido ?? '',
        telefono: me.telefono ?? '',
        ciudad: me.ciudad ?? '',
        estado: me.estado ?? 'México',
      });
    }
  }, [me]);

  const updateMutation = useMutation({
    mutationFn: (data: object) => runnersApi.updateMe(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runner-me'] });
      setSaved(true);
      setSaveError('');
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Error al guardar. Intenta de nuevo.';
      setSaveError(msg);
    },
  });

  const nivelBadge: Record<string, string> = {
    principiante: 'bg-green-500/15 text-green-400',
    intermedio:   'bg-blue-500/15 text-blue-400',
    avanzado:     'bg-purple-500/15 text-purple-400',
    elite:        'bg-brand-500/15 text-brand-400',
  };

  if (isLoading) return <div className="p-4 lg:p-8 text-gray-400">Cargando...</div>;

  return (
    <div className="p-4 lg:p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Mi perfil</h1>
        <p className="text-gray-400 text-sm mt-0.5">Actualiza tu información personal</p>
      </div>

      <div className="bg-dark-800 border border-dark-700 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-dark-700">
          <div className="w-14 h-14 rounded-full bg-brand-500/20 flex items-center justify-center">
            <User size={24} className="text-brand-400" />
          </div>
          <div>
            <p className="font-semibold text-white text-lg">{me?.nombre} {me?.apellido}</p>
            <p className="text-sm text-gray-400">{user?.email}</p>
            <span className={`text-xs px-2 py-0.5 rounded mt-1 inline-block capitalize ${nivelBadge[me?.nivel] ?? nivelBadge.principiante}`}>
              {me?.nivel}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([
            ['nombre', 'Nombre'],
            ['apellido', 'Apellido'],
            ['telefono', 'Teléfono'],
            ['ciudad', 'Ciudad'],
            ['estado', 'Estado'],
          ] as [keyof typeof form, string][]).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
              <input
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          ))}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Correo electrónico</label>
            <input
              value={user?.email ?? ''}
              disabled
              className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2.5 text-sm text-gray-500 cursor-not-allowed"
            />
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-dark-700 space-y-3">
          {saved && (
            <div className="flex items-center gap-1.5 text-sm text-green-400 bg-green-500/10 rounded-lg px-3 py-2">
              <CheckCircle size={15} /> Cambios guardados correctamente
            </div>
          )}
          {saveError && (
            <div className="flex items-center gap-1.5 text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              <AlertCircle size={15} /> {saveError}
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={() => { setSaveError(''); updateMutation.mutate(form); }}
              disabled={updateMutation.isPending}
              className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>

      {me && (
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
            Información del equipo
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">Miembro desde</p>
              <p className="text-white">{new Date(me.createdAt).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Nivel</p>
              <p className="text-white capitalize">{me.nivel}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
