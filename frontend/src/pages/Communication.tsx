import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Megaphone, AlertTriangle, Dumbbell, Calendar, Trash2, X,
  Heart, Mail, Send, ChevronDown, ChevronUp, Sparkles, Users, Check,
} from 'lucide-react';
import { announcementsApi, runnersApi } from '../services/api';
import { Announcement, Runner } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { COMUNICADO_TIPOS, generarComunicado } from '../utils/coachEmailTemplates';

const typeConfig: Record<string, { icon: typeof Megaphone; gradient: string; emoji: string; label: string }> = {
  general:       { icon: Megaphone,     gradient: 'from-blue-500/20 to-blue-600/5',    emoji: '📢', label: 'General' },
  urgente:       { icon: AlertTriangle, gradient: 'from-red-500/20 to-red-600/5',      emoji: '🚨', label: 'Urgente' },
  entrenamiento: { icon: Dumbbell,      gradient: 'from-orange-500/20 to-orange-600/5',emoji: '💪', label: 'Entrenamiento' },
  evento:        { icon: Calendar,      gradient: 'from-purple-500/20 to-purple-600/5',emoji: '🎯', label: 'Evento' },
};

// ── PostCard ──────────────────────────────────────────────────────────────────
function PostCard({ ann, onDelete, isCoach }: { ann: Announcement; onDelete: (id: number) => void; isCoach: boolean }) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(Math.floor(Math.random() * 20) + 1);
  const cfg = typeConfig[ann.tipo] ?? typeConfig.general;

  return (
    <div className="card overflow-hidden animate-slide-up">
      <div className="h-1" style={{
        background:
          ann.tipo === 'urgente'       ? 'linear-gradient(90deg,#ef4444,#dc2626)' :
          ann.tipo === 'entrenamiento' ? 'linear-gradient(90deg,#f97316,#ea580c)' :
          ann.tipo === 'evento'        ? 'linear-gradient(90deg,#a855f7,#9333ea)' :
                                        'linear-gradient(90deg,#3b82f6,#2563eb)',
      }} />
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-hero flex items-center justify-center text-sm font-black text-white flex-shrink-0 shadow-glow-sm">J</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Coach JTZ</span>
              <span className="text-base">{cfg.emoji}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-600 text-gray-400 font-medium">{cfg.label}</span>
            </div>
            <p className="text-xs text-gray-500">{formatDistanceToNow(new Date(ann.createdAt), { locale: es, addSuffix: true })}</p>
          </div>
          {isCoach && (
            <button onClick={() => onDelete(ann.id)} className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-all">
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <h3 className="font-bold text-white mb-2">{ann.titulo}</h3>
        <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">{ann.contenido}</p>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.05]">
          <button onClick={() => { setLiked(!liked); setLikes(l => liked ? l - 1 : l + 1); }}
            className={`flex items-center gap-1.5 text-xs transition-all ${liked ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}>
            <Heart size={15} fill={liked ? 'currentColor' : 'none'} /> <span>{likes}</span>
          </button>
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-gray-600">JTZ Running Club</span>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Email al equipo ──────────────────────────────────────────────────────
function EmailTab() {
  const { data: runnersData } = useQuery({
    queryKey: ['runners'],
    queryFn: () => runnersApi.list(),
  });
  const allRunners: Runner[] = (runnersData?.data ?? []).filter((r: Runner) => r.activo);

  // Destinatarios
  const [seleccionarTodos, setSeleccionarTodos] = useState(true);
  const [idsSeleccionados, setIdsSeleccionados] = useState<Set<number>>(new Set());
  const [mostrarSelector, setMostrarSelector] = useState(false);

  const destinatarios = useMemo(() =>
    seleccionarTodos
      ? allRunners
      : allRunners.filter(r => idsSeleccionados.has(r.id)),
    [seleccionarTodos, idsSeleccionados, allRunners],
  );

  const toggleRunner = (id: number) => {
    setIdsSeleccionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Tipo de comunicado
  const [tipoId, setTipoId] = useState(COMUNICADO_TIPOS[0].id);
  const tipoSeleccionado = COMUNICADO_TIPOS.find(t => t.id === tipoId)!;

  // Redacción
  const [idea, setIdea] = useState('');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [generado, setGenerado] = useState(false);

  // Resultado del envío
  const [sendResult, setSendResult] = useState<{ ok: boolean; sent?: number; error?: string } | null>(null);
  const [sending, setSending] = useState(false);

  const handleGenerar = () => {
    if (!idea.trim()) return;
    const { asunto: a, cuerpo: c } = generarComunicado(tipoSeleccionado, idea);
    setAsunto(a);
    setCuerpo(c);
    setGenerado(true);
  };

  const handleEnviar = async () => {
    if (!asunto.trim() || !cuerpo.trim() || !destinatarios.length) return;
    setSending(true);
    setSendResult(null);
    try {
      const runnerIds = seleccionarTodos ? undefined : destinatarios.map(r => r.id);
      const res = await runnersApi.bulkEmail({ subject: asunto, mensaje: cuerpo, runnerIds });
      setSendResult({ ok: true, sent: res.data.sent });
      // Limpiar
      setIdea('');
      setAsunto('');
      setCuerpo('');
      setGenerado(false);
    } catch (err: any) {
      setSendResult({ ok: false, error: err?.response?.data?.error ?? 'Error al enviar' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">

      {/* Resultado */}
      {sendResult && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
          sendResult.ok
            ? 'bg-green-500/10 border-green-500/20'
            : 'bg-red-500/10 border-red-500/20'
        }`}>
          {sendResult.ok
            ? <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
            : <X size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          }
          <div className="flex-1 text-sm">
            {sendResult.ok
              ? <><span className="font-bold text-green-400">¡Correos enviados!</span><span className="text-green-600"> — {sendResult.sent} corredor{sendResult.sent !== 1 ? 'es' : ''} recibió el mensaje.</span></>
              : <><span className="font-bold text-red-400">Error: </span><span className="text-red-400">{sendResult.error}</span></>
            }
          </div>
          <button onClick={() => setSendResult(null)} className="text-gray-500 hover:text-gray-300 transition-colors"><X size={14} /></button>
        </div>
      )}

      {/* ── Destinatarios ── */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Users size={15} className="text-brand-400" />
          <h2 className="text-sm font-bold text-white">Destinatarios</h2>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div
              onClick={() => { setSeleccionarTodos(true); setIdsSeleccionados(new Set()); }}
              className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer ${seleccionarTodos ? 'bg-brand-500 border-brand-500' : 'border-white/[0.2]'}`}>
              {seleccionarTodos && <Check size={10} className="text-white" />}
            </div>
            <span className="text-sm text-white">
              Todos los corredores activos
              <span className="text-gray-500 ml-1.5">({allRunners.length})</span>
            </span>
          </label>
          <button
            onClick={() => setMostrarSelector(v => !v)}
            className="text-xs text-gray-500 hover:text-brand-400 transition-colors flex items-center gap-1">
            Seleccionar específicos
            {mostrarSelector ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {mostrarSelector && (
          <div className="border border-white/[0.06] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
            {allRunners.map(r => (
              <label key={r.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-600 cursor-pointer transition-colors border-b border-white/[0.03] last:border-0">
                <div
                  onClick={() => { setSeleccionarTodos(false); toggleRunner(r.id); }}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                    !seleccionarTodos && idsSeleccionados.has(r.id)
                      ? 'bg-brand-500 border-brand-500'
                      : 'border-white/[0.2]'
                  }`}>
                  {!seleccionarTodos && idsSeleccionados.has(r.id) && <Check size={10} className="text-white" />}
                </div>
                <span className="text-sm text-white">{r.nombre} {r.apellido}</span>
                <span className="text-xs text-gray-500 ml-auto capitalize">{r.nivel}</span>
              </label>
            ))}
          </div>
        )}

        {!seleccionarTodos && (
          <p className="text-xs text-gray-500">
            {idsSeleccionados.size === 0
              ? 'Ningún corredor seleccionado'
              : `${idsSeleccionados.size} corredor${idsSeleccionados.size !== 1 ? 'es' : ''} seleccionado${idsSeleccionados.size !== 1 ? 's' : ''}`
            }
          </p>
        )}
      </div>

      {/* ── Tipo de comunicado ── */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={15} className="text-brand-400" />
          <h2 className="text-sm font-bold text-white">Tipo de comunicado</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {COMUNICADO_TIPOS.map(t => (
            <button key={t.id} onClick={() => { setTipoId(t.id); setGenerado(false); }}
              className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-medium transition-all text-center ${
                tipoId === t.id
                  ? 'bg-brand-500/20 border-brand-500/50 text-white'
                  : 'bg-surface-700 border-white/[0.06] text-gray-400 hover:text-white hover:border-white/[0.12]'
              }`}>
              <span className="text-xl">{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 italic">{tipoSeleccionado.descripcion}</p>
      </div>

      {/* ── Redactor con lineamientos ── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={15} className="text-brand-400" />
          <h2 className="text-sm font-bold text-white">Redactor</h2>
          <span className="text-xs text-gray-600 ml-1">basado en lineamientos de comunicación coach-deportista</span>
        </div>

        {/* Idea del coach */}
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">
            ¿Qué quieres comunicar?
            <span className="text-gray-600 font-normal ml-1">— escribe la idea principal, puntos clave o instrucciones</span>
          </label>
          <textarea
            value={idea}
            onChange={e => { setIdea(e.target.value); setGenerado(false); }}
            rows={4}
            placeholder={tipoSeleccionado.placeholder}
            className="input w-full text-sm resize-none"
          />
        </div>

        <button
          onClick={handleGenerar}
          disabled={!idea.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-surface-600 border border-brand-500/30 text-brand-400 text-sm font-semibold hover:bg-brand-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          <Sparkles size={15} />
          {generado ? 'Regenerar comunicado' : 'Generar comunicado profesional'}
        </button>

        {/* Lineamientos que se aplican — visible antes de generar */}
        {!generado && (
          <div className="bg-surface-800 rounded-xl p-3 border border-white/[0.05]">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Lineamientos aplicados</p>
            <ul className="space-y-1 text-xs text-gray-500">
              <li>• Saludo personalizado con nombre del corredor</li>
              <li>• Propósito claro en las primeras líneas</li>
              <li>• Tu mensaje como núcleo del comunicado</li>
              <li>• Sabiduría de coaching contextual al tipo elegido</li>
              <li>• Llamada a la acción específica y accionable</li>
              <li>• Cierre profesional que refuerza identidad de equipo</li>
            </ul>
          </div>
        )}

        {/* Email generado */}
        {generado && (
          <div className="space-y-3 pt-2 border-t border-white/[0.06]">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Check size={12} className="text-green-400" /> Comunicado generado — edítalo antes de enviar
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Asunto del correo</label>
              <input
                value={asunto}
                onChange={e => setAsunto(e.target.value)}
                className="input w-full text-sm"
                placeholder="Asunto..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                Cuerpo del mensaje
                <span className="text-gray-600 font-normal ml-1">· {'{nombre}'} se reemplaza automáticamente</span>
              </label>
              <textarea
                value={cuerpo}
                onChange={e => setCuerpo(e.target.value)}
                rows={12}
                className="input w-full text-sm resize-none font-mono text-xs leading-relaxed"
              />
            </div>

            <button
              onClick={handleEnviar}
              disabled={sending || !asunto.trim() || !cuerpo.trim() || destinatarios.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {sending
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando…</>
                : <><Send size={15} /> Enviar a {destinatarios.length} corredor{destinatarios.length !== 1 ? 'es' : ''}</>
              }
            </button>

            {destinatarios.length === 0 && (
              <p className="text-xs text-yellow-400 text-center">Selecciona al menos un corredor para enviar</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Communication() {
  const { isCoach } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'feed' | 'email'>('feed');
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
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-white">Comunicación</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {tab === 'feed' ? 'Feed del equipo JTZ' : 'Enviar email al equipo'}
          </p>
        </div>
        {isCoach && tab === 'feed' && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
            <Plus size={16} /> Publicar
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-700 border border-white/[0.06] rounded-xl w-fit mb-5">
        <button onClick={() => setTab('feed')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
            tab === 'feed' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
          }`}>
          <Megaphone size={14} /> Feed
        </button>
        {isCoach && (
          <button onClick={() => setTab('email')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              tab === 'email' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'
            }`}>
            <Mail size={14} /> Email al equipo
          </button>
        )}
      </div>

      {/* Tab: Feed */}
      {tab === 'feed' && (
        <>
          {isCoach && !showForm && (
            <div className="card p-4 mb-5 flex items-center gap-3 cursor-pointer hover:border-white/[0.12] transition-all"
              onClick={() => setShowForm(true)}>
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
            {announcements.map(ann => (
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
        </>
      )}

      {/* Tab: Email al equipo */}
      {tab === 'email' && isCoach && <EmailTab />}

      {/* Modal nueva publicación */}
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
                <input value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })}
                  placeholder="¿De qué trata este mensaje?" className="input w-full text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Mensaje</label>
                <textarea value={form.contenido} onChange={e => setForm({ ...form, contenido: e.target.value })}
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
