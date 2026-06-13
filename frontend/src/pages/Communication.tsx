import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Megaphone, AlertTriangle, Dumbbell, Calendar, Trash2, X, Heart } from 'lucide-react';
import { announcementsApi } from '../services/api';
import { Announcement } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const typeConfig: Record<string, { icon: typeof Megaphone; gradient: string; emoji: string; label: string }> = {
  general:      { icon: Megaphone,     gradient: 'from-blue-500/20 to-blue-600/5',   emoji: '📢', label: 'General' },
  urgente:      { icon: AlertTriangle, gradient: 'from-red-500/20 to-red-600/5',     emoji: '🚨', label: 'Urgente' },
  entrenamiento:{ icon: Dumbbell,      gradient: 'from-orange-500/20 to-orange-600/5',emoji: '💪', label: 'Entrenamiento' },
  evento:       { icon: Calendar,      gradient: 'from-purple-500/20 to-purple-600/5',emoji: '🎯', label: 'Evento' },
};

function PostCard({ ann, onDelete, isCoach }: { ann: Announcement; onDelete: (id: number) => void; isCoach: boolean }) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(Math.floor(Math.random() * 20) + 1);
  const cfg = typeConfig[ann.tipo] ?? typeConfig.general;

  const handleLike = () => {
    setLiked(!liked);
    setLikes(l => liked ? l - 1 : l + 1);
  };

  return (
    <div className={`card overflow-hidden animate-slide-up`}>
      {/* Post gradient header accent */}
      <div className={`h-1 bg-gradient-to-r ${cfg.gradient.replace('/20', '').replace('/5', '')}`} style={{
        background: ann.tipo === 'urgente' ? 'linear-gradient(90deg, #ef4444, #dc2626)' :
                    ann.tipo === 'entrenamiento' ? 'linear-gradient(90deg, #f97316, #ea580c)' :
                    ann.tipo === 'evento' ? 'linear-gradient(90deg, #a855f7, #9333ea)' :
                    'linear-gradient(90deg, #3b82f6, #2563eb)'
      }} />

      <div className="p-5">
        {/* Author row */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-hero flex items-center justify-center text-sm font-black text-white flex-shrink-0 shadow-glow-sm">
            J
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Coach JTZ</span>
              <span className="text-base">{cfg.emoji}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-600 text-gray-400 font-medium">{cfg.label}</span>
            </div>
            <p className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(ann.createdAt), { locale: es, addSuffix: true })}
            </p>
          </div>
          {isCoach && (
            <button onClick={() => onDelete(ann.id)} className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-all">
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {/* Content */}
        <h3 className="font-bold text-white mb-2">{ann.titulo}</h3>
        <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">{ann.contenido}</p>

        {/* Interactions */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.05]">
          <button onClick={handleLike}
            className={`flex items-center gap-1.5 text-xs transition-all ${liked ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}>
            <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
            <span>{likes}</span>
          </button>
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-gray-600">JTZ Running Club</span>
        </div>
      </div>
    </div>
  );
}

export default function Communication() {
  const { isCoach } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titulo: '', contenido: '', tipo: 'general' });

  const { data } = useQuery({ queryKey: ['announcements'], queryFn: () => announcementsApi.list() });
  const announcements: Announcement[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (d: object) => announcementsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      setShowForm(false);
      setForm({ titulo: '', contenido: '', tipo: 'general' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => announcementsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">Comunicación</h1>
          <p className="text-gray-500 text-sm mt-0.5">Feed del equipo JTZ</p>
        </div>
        {isCoach && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
            <Plus size={16} /> Publicar
          </button>
        )}
      </div>

      {/* Inline compose (coach only) */}
      {isCoach && !showForm && (
        <div className="card p-4 mb-5 flex items-center gap-3 cursor-pointer hover:border-white/[0.12] transition-all" onClick={() => setShowForm(true)}>
          <div className="w-9 h-9 rounded-full bg-hero flex items-center justify-center text-sm font-black text-white flex-shrink-0 shadow-glow-sm">J</div>
          <span className="text-sm text-gray-500">Publica un mensaje para el equipo...</span>
          <div className="ml-auto flex gap-2">
            {['💪', '🏃', '🎯', '📢'].map(e => (
              <span key={e} className="text-lg cursor-pointer hover:scale-125 transition-transform">{e}</span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {announcements.map((ann) => (
          <PostCard key={ann.id} ann={ann} onDelete={deleteMutation.mutate} isCoach={isCoach} />
        ))}
        {announcements.length === 0 && (
          <div className="text-center py-20">
            <span className="text-6xl">📢</span>
            <p className="text-gray-500 mt-4 text-sm">Aún no hay publicaciones</p>
            {isCoach && <p className="text-gray-600 text-xs mt-1">Sé el primero en publicar algo para el equipo</p>}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-lg animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">Nueva publicación</h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost p-2"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">Tipo de mensaje</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(typeConfig).map(([key, cfg]) => (
                    <button key={key} onClick={() => setForm({ ...form, tipo: key })}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-all ${
                        form.tipo === key ? 'bg-brand-500/20 border-brand-500/50 text-white' : 'bg-surface-600 border-white/[0.06] text-gray-400 hover:text-white'
                      }`}>
                      <span className="text-xl">{cfg.emoji}</span>{cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Título</label>
                <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="¿De qué trata este mensaje?" className="input w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Mensaje</label>
                <textarea value={form.contenido} onChange={(e) => setForm({ ...form, contenido: e.target.value })}
                  rows={5} placeholder="Escribe tu mensaje para el equipo..." className="input w-full text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}
                className="flex-1 btn-primary py-2.5 text-sm">
                {createMutation.isPending ? 'Publicando...' : '🚀 Publicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
