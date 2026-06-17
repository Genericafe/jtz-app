import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPin, Plus, Play, Star, Globe, Lock, Trash2, Upload,
  Mountain, Bike, Waves, ChevronDown, X, BookOpen, Map,
} from 'lucide-react';
import { routesApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import RouteMapBuilder, { type BuiltRoute } from '../components/RouteMapBuilder';

type Tipo = 'correr' | 'trail' | 'ciclismo' | 'natacion' | 'otro';
type Tab = 'club' | 'mias' | 'publicas';

interface RouteItem {
  id: number;
  nombre: string;
  descripcion?: string;
  tipo: Tipo;
  distanciaKm?: number;
  gpxContent?: string;
  gpxNombre?: string;
  isPublic: boolean;
  isClubRoute: boolean;
  authorId: number;
  author: { id: number; role: string; runner?: { nombre: string; apellido: string } };
  createdAt: string;
}

const TIPO_ICONS: Record<Tipo, React.ReactNode> = {
  correr:   <MapPin size={14} />,
  trail:    <Mountain size={14} />,
  ciclismo: <Bike size={14} />,
  natacion: <Waves size={14} />,
  otro:     <BookOpen size={14} />,
};

const TIPO_LABELS: Record<Tipo, string> = {
  correr: 'Correr', trail: 'Trail', ciclismo: 'Ciclismo', natacion: 'Natación', otro: 'Otro',
};

const TIPO_COLORS: Record<Tipo, string> = {
  correr:   'text-brand-400 bg-brand-500/10',
  trail:    'text-amber-400 bg-amber-500/10',
  ciclismo: 'text-sky-400 bg-sky-500/10',
  natacion: 'text-cyan-400 bg-cyan-500/10',
  otro:     'text-gray-400 bg-gray-500/10',
};

interface CreateForm {
  nombre: string;
  descripcion: string;
  tipo: Tipo;
  distanciaKm: string;
  isPublic: boolean;
  gpxContent: string;
  gpxNombre: string;
}

const EMPTY_FORM: CreateForm = {
  nombre: '', descripcion: '', tipo: 'correr',
  distanciaKm: '', isPublic: false,
  gpxContent: '', gpxNombre: '',
};

export default function RoutesPage({ embedded = false }: { embedded?: boolean }) {
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const { user, isCoach } = useAuth();
  const [tab, setTab] = useState<Tab>('club');
  const [showForm, setShowForm]         = useState(false);
  const [showMapBuilder, setShowMapBuilder] = useState(false);
  const [form, setForm]     = useState<CreateForm>(EMPTY_FORM);
  const [gpxError, setGpxError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleMapRoute = (route: BuiltRoute) => {
    setForm(f => ({
      ...f,
      distanciaKm: route.distanceKm.toFixed(2),
      gpxContent:  route.gpxContent,
      gpxNombre:   'ruta-trazada.gpx',
    }));
    setShowMapBuilder(false);
    setShowForm(true);
  };

  const { data, isLoading } = useQuery<RouteItem[]>({
    queryKey: ['routes'],
    queryFn: () => routesApi.list().then(r => r.data),
    staleTime: 30_000,
  });

  const routes = data ?? [];

  const filtered = routes.filter(r => {
    if (tab === 'club')    return r.isClubRoute;
    if (tab === 'mias')    return r.authorId === user?.id;
    if (tab === 'publicas') return r.isPublic && !r.isClubRoute;
    return false;
  });

  const createMut = useMutation({
    mutationFn: () => routesApi.create({
      nombre:      form.nombre.trim(),
      descripcion: form.descripcion.trim() || undefined,
      tipo:        form.tipo,
      distanciaKm: form.distanciaKm ? parseFloat(form.distanciaKm) : undefined,
      isPublic:    form.isPublic,
      gpxContent:  form.gpxContent || undefined,
      gpxNombre:   form.gpxNombre  || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routes'] });
      setShowForm(false);
      setForm(EMPTY_FORM);
      setTab('mias');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => routesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  });

  const clubMut = useMutation({
    mutationFn: (id: number) => routesApi.toggleClub(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  });

  const handleGpx = (file: File) => {
    setGpxError('');
    if (!file.name.endsWith('.gpx')) { setGpxError('Solo archivos .gpx'); return; }
    if (file.size > 5_000_000) { setGpxError('El archivo es muy grande (máx 5 MB)'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      setForm(f => ({ ...f, gpxContent: (e.target?.result as string) ?? '', gpxNombre: file.name }));
    };
    reader.readAsText(file);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'club',     label: 'Del club' },
    { key: 'mias',     label: 'Mis rutas' },
    { key: 'publicas', label: 'Descubrir' },
  ];

  return (
    <div className={embedded ? '' : 'min-h-screen bg-dark-900 p-4 sm:p-6 max-w-3xl mx-auto'}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Rutas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Guarda y reutiliza tus rutas favoritas</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-colors"
        >
          <Plus size={16} /> Nueva ruta
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-dark-800 rounded-xl p-1 mb-6 border border-dark-700">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Route list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <MapPin size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">
            {tab === 'club' ? 'El coach aún no ha publicado rutas del club'
             : tab === 'mias' ? 'Aún no tienes rutas guardadas'
             : 'No hay rutas públicas disponibles'}
          </p>
          <p className="text-sm mt-1">
            {tab !== 'club' && 'Crea tu primera ruta con el botón "Nueva ruta"'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(route => (
            <RouteCard
              key={route.id}
              route={route}
              isCoach={isCoach}
              ownerId={user?.id}
              onStart={() => navigate(`/grabar?savedRouteId=${route.id}`)}
              onToggleClub={() => clubMut.mutate(route.id)}
              onDelete={() => {
                if (confirm(`¿Eliminar "${route.nombre}"?`)) deleteMut.mutate(route.id);
              }}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-dark-800 border border-dark-600 rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Nueva ruta</h2>
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Nombre *</label>
                <input
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Circuito del parque"
                  className="w-full bg-dark-700 border border-dark-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand-500 placeholder-gray-600"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Tipo</label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.keys(TIPO_LABELS) as Tipo[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setForm(f => ({ ...f, tipo: t }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        form.tipo === t
                          ? 'bg-brand-500 border-brand-400 text-white'
                          : 'border-dark-600 text-gray-400 hover:text-white hover:border-dark-500'
                      }`}
                    >
                      {TIPO_ICONS[t]} {TIPO_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Distancia aproximada (km)</label>
                <input
                  type="number" min="0" step="0.1"
                  value={form.distanciaKm}
                  onChange={e => setForm(f => ({ ...f, distanciaKm: e.target.value }))}
                  placeholder="Ej: 5.2"
                  className="w-full bg-dark-700 border border-dark-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand-500 placeholder-gray-600"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Descripción (opcional)</label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  rows={2}
                  placeholder="Superficie, dificultad, puntos de referencia..."
                  className="w-full bg-dark-700 border border-dark-600 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-brand-500 placeholder-gray-600 resize-none"
                />
              </div>

              {/* Route source */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Trayecto (opcional)</label>
                {form.gpxNombre ? (
                  <div className="flex items-center justify-between bg-dark-700 border border-green-500/30 rounded-xl px-4 py-3">
                    <span className="text-sm text-green-400 truncate">{form.gpxNombre}</span>
                    <button onClick={() => setForm(f => ({ ...f, gpxContent: '', gpxNombre: '' }))}
                      className="ml-2 text-gray-500 hover:text-red-400 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setShowForm(false); setShowMapBuilder(true); }}
                      className="flex items-center justify-center gap-2 border-2 border-dark-600 hover:border-brand-500 rounded-xl py-4 text-gray-400 hover:text-white transition-all text-sm font-medium"
                    >
                      <Map size={16} /> Trazar en mapa
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center justify-center gap-2 border-2 border-dashed border-dark-600 hover:border-brand-500 rounded-xl py-4 text-gray-400 hover:text-white transition-all text-sm font-medium"
                    >
                      <Upload size={16} /> Subir GPX
                    </button>
                  </div>
                )}
                <input ref={fileRef} type="file" accept=".gpx" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleGpx(e.target.files[0]); }} />
                {gpxError && <p className="text-red-400 text-xs mt-1">{gpxError}</p>}
              </div>

              {/* Visibility */}
              <button
                onClick={() => setForm(f => ({ ...f, isPublic: !f.isPublic }))}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                  form.isPublic
                    ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                    : 'bg-dark-700 border-dark-600 text-gray-400'
                }`}
              >
                <div className="flex items-center gap-2 text-sm">
                  {form.isPublic ? <Globe size={15} /> : <Lock size={15} />}
                  {form.isPublic ? 'Ruta pública (visible para todos)' : 'Ruta privada (solo tú)'}
                </div>
                <ChevronDown size={14} className={`transition-transform ${form.isPublic ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                className="flex-1 py-3 rounded-xl border border-dark-600 text-gray-400 hover:text-white text-sm font-medium transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => createMut.mutate()}
                disabled={!form.nombre.trim() || createMut.isPending}
                className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {createMut.isPending ? 'Guardando...' : 'Guardar ruta'}
              </button>
            </div>
            {createMut.isError && (
              <p className="text-red-400 text-xs text-center mt-3">Error al guardar. Intenta de nuevo.</p>
            )}
          </div>
        </div>
      )}

      {/* Map-based route builder */}
      {showMapBuilder && (
        <RouteMapBuilder
          tipoActividad={form.tipo}
          onConfirm={handleMapRoute}
          onCancel={() => { setShowMapBuilder(false); setShowForm(true); }}
        />
      )}
    </div>
  );
}

function RouteCard({
  route, isCoach, ownerId, onStart, onToggleClub, onDelete,
}: {
  route: RouteItem;
  isCoach: boolean;
  ownerId?: number;
  onStart: () => void;
  onToggleClub: () => void;
  onDelete: () => void;
}) {
  const isOwn = route.authorId === ownerId;
  const authorName = route.author.runner
    ? `${route.author.runner.nombre} ${route.author.runner.apellido}`
    : 'Coach';

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-2xl p-4 hover:border-dark-600 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {route.isClubRoute && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold uppercase tracking-wide">
                <Star size={9} fill="currentColor" /> Club
              </span>
            )}
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${TIPO_COLORS[route.tipo as Tipo]}`}>
              {TIPO_ICONS[route.tipo as Tipo]} {TIPO_LABELS[route.tipo as Tipo]}
            </span>
            {route.isPublic && !route.isClubRoute && (
              <span className="flex items-center gap-1 text-[10px] text-sky-400">
                <Globe size={9} /> Pública
              </span>
            )}
          </div>

          <h3 className="font-semibold text-white text-base leading-tight truncate">{route.nombre}</h3>

          {route.descripcion && (
            <p className="text-gray-500 text-xs mt-1 line-clamp-2">{route.descripcion}</p>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {route.distanciaKm && (
              <span className="text-white font-semibold">{route.distanciaKm.toFixed(1)} km</span>
            )}
            {route.gpxNombre && (
              <span className="text-green-500">GPX</span>
            )}
            <span>por {authorName}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <button
            onClick={onStart}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            <Play size={12} fill="white" /> Empezar
          </button>

          <div className="flex items-center gap-1">
            {isCoach && (
              <button
                onClick={onToggleClub}
                title={route.isClubRoute ? 'Quitar del club' : 'Publicar como ruta del club'}
                className={`p-1.5 rounded-lg transition-colors ${
                  route.isClubRoute
                    ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                    : 'text-gray-500 hover:text-amber-400 hover:bg-amber-500/10'
                }`}
              >
                <Star size={14} fill={route.isClubRoute ? 'currentColor' : 'none'} />
              </button>
            )}
            {(isOwn || isCoach) && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
