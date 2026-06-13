import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Send, MessageCircle, ChevronRight } from 'lucide-react';
import { chatApi, runnersApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Runner } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface ChatMessage {
  id: number;
  senderId: number;
  content: string;
  leido: boolean;
  createdAt: string;
  fromMe: boolean;
}

interface ConversationEntry {
  runner: Runner & { userId: number };
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  hasMessages: boolean;
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, otherInitial }: { msg: ChatMessage; otherInitial: string }) {
  const time = formatDistanceToNow(new Date(msg.createdAt), { locale: es, addSuffix: true });

  if (msg.fromMe) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[70%]">
          <div className="bg-brand-500 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-glow-sm text-sm leading-relaxed">
            {msg.content}
          </div>
          <p className="text-xs text-gray-600 mt-1 text-right pr-1">{time}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 mb-3">
      <div className="w-7 h-7 rounded-full bg-surface-600 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0">
        {otherInitial}
      </div>
      <div className="max-w-[70%]">
        <div className="bg-surface-600 text-white px-4 py-2.5 rounded-2xl rounded-tl-sm border border-white/[0.06] text-sm leading-relaxed">
          {msg.content}
        </div>
        <p className="text-xs text-gray-600 mt-1 pl-1">{time}</p>
      </div>
    </div>
  );
}

// ─── Conversation panel (message list + input) ────────────────────────────────
function ConversationPanel({
  runnerId,
  runnerName,
  runnerInitial,
}: {
  runnerId: number;
  runnerName: string;
  runnerInitial: string;
}) {
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: ['chat-messages', runnerId],
    queryFn: () => chatApi.messages(runnerId).then((r) => r.data),
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => chatApi.send(runnerId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', runnerId] });
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-scroll to bottom when messages load or update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3 bg-surface-700">
        <div className="w-9 h-9 rounded-full bg-surface-600 border border-white/10 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
          {runnerInitial}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{runnerName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Lock size={10} className="text-brand-400" />
            <span className="text-xs text-brand-400 font-medium">Chat cifrado</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-0">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-600 flex items-center justify-center mb-4">
              <MessageCircle size={24} className="text-gray-500" />
            </div>
            <p className="text-gray-500 text-sm">No hay mensajes aún.</p>
            <p className="text-gray-600 text-xs mt-1">Sé el primero en escribir.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} otherInitial={runnerInitial} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/[0.06] bg-surface-800">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            rows={1}
            className="flex-1 bg-surface-600 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-brand-500/50 transition-colors leading-relaxed"
            style={{ minHeight: '42px', maxHeight: '120px' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            className="w-10 h-10 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5 text-center flex items-center justify-center gap-1">
          <Lock size={9} />
          Mensajes cifrados de extremo a extremo
        </p>
      </div>
    </div>
  );
}

// ─── Coach view ───────────────────────────────────────────────────────────────
function CoachChat() {
  const { runnerId: runnerIdParam } = useParams<{ runnerId?: string }>();
  const navigate = useNavigate();
  const selectedId = runnerIdParam ? parseInt(runnerIdParam, 10) : null;
  const [search, setSearch] = useState('');

  const { data: conversations = [], isLoading: loadingConvs } = useQuery<ConversationEntry[]>({
    queryKey: ['chat-conversations'],
    queryFn: () => chatApi.conversations().then((r) => r.data),
    refetchInterval: 3000,
  });

  const { data: allRunners = [] } = useQuery<Runner[]>({
    queryKey: ['runners'],
    queryFn: () => runnersApi.list().then((r) => r.data),
  });

  const selectedRunner = conversations.find((c) => c.runner.id === selectedId)?.runner
    ?? allRunners.find((r) => r.id === selectedId);

  // Sort: conversations with messages first (by last message date), then the rest
  const withMessages = conversations
    .filter((c) => c.hasMessages)
    .sort((a, b) =>
      new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
    );

  const runnerIdsWithMessages = new Set(withMessages.map((c) => c.runner.id));
  const withoutMessages = allRunners.filter((r) => !runnerIdsWithMessages.has(r.id) && r.activo);

  const getInitial = (nombre: string) => nombre.charAt(0).toUpperCase();

  const filteredWithMessages = withMessages.filter(c =>
    `${c.runner.nombre} ${c.runner.apellido}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredWithoutMessages = withoutMessages.filter(r =>
    `${r.nombre} ${r.apellido}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full bg-surface-800 rounded-2xl overflow-hidden border border-white/[0.06]">
      {/* Sidebar: runner list */}
      <div className="w-72 border-r border-white/[0.06] flex flex-col bg-surface-700 flex-shrink-0">
        <div className="px-4 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 mb-2">
            <Lock size={14} className="text-brand-400" />
            <h2 className="text-sm font-bold text-white">Chat privado</h2>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar corredor..."
            className="w-full bg-surface-600 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50 transition-colors"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Runners with messages */}
          {filteredWithMessages.length > 0 && (
            <>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Conversaciones
              </p>
              {filteredWithMessages.map((conv) => {
                const r = conv.runner;
                const isActive = r.id === selectedId;
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/chat/${r.id}`)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isActive ? 'bg-brand-500/10 border-r-2 border-brand-500' : 'hover:bg-surface-600'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-surface-600 border border-white/10 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {getInitial(r.nombre)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-medium text-white truncate">
                          {r.nombre} {r.apellido}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                      {conv.lastMessagePreview && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {conv.lastMessagePreview}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {/* All other runners (no messages yet) */}
          {filteredWithoutMessages.length > 0 && (
            <>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Todos los corredores
              </p>
              {loadingConvs ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                filteredWithoutMessages.map((r) => {
                  const isActive = r.id === selectedId;
                  return (
                    <button
                      key={r.id}
                      onClick={() => navigate(`/chat/${r.id}`)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isActive ? 'bg-brand-500/10 border-r-2 border-brand-500' : 'hover:bg-surface-600'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-surface-600 border border-white/10 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0">
                        {getInitial(r.nombre)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-300 truncate">
                          {r.nombre} {r.apellido}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-gray-600 flex-shrink-0" />
                    </button>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedId && selectedRunner ? (
          <ConversationPanel
            runnerId={selectedId}
            runnerName={`${selectedRunner.nombre} ${selectedRunner.apellido}`}
            runnerInitial={selectedRunner.nombre.charAt(0).toUpperCase()}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-surface-700 flex items-center justify-center mb-4">
              <Lock size={28} className="text-brand-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Chat cifrado</h3>
            <p className="text-gray-500 text-sm max-w-xs">
              Selecciona un corredor de la lista para ver o iniciar una conversación privada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Runner view ──────────────────────────────────────────────────────────────
function RunnerChat() {
  const { user } = useAuth();
  const myRunner = user?.runner;

  if (!myRunner) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-sm">Perfil de corredor no encontrado.</p>
      </div>
    );
  }

  const coachInitial = 'C';

  return (
    <div className="h-full bg-surface-800 rounded-2xl overflow-hidden border border-white/[0.06]">
      <ConversationPanel
        runnerId={myRunner.id}
        runnerName="Coach JTZ"
        runnerInitial={coachInitial}
      />
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function Chat() {
  const { isCoach } = useAuth();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex-shrink-0">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <MessageCircle size={20} className="text-brand-400" />
          {isCoach ? 'Chat privado' : 'Chat con coach'}
        </h1>
        <p className="text-gray-500 text-xs mt-0.5 flex items-center gap-1">
          <Lock size={10} className="text-brand-400" />
          Mensajes cifrados con AES-256-CBC
        </p>
      </div>
      <div className="flex-1 px-6 pb-6 overflow-hidden">
        {isCoach ? <CoachChat /> : <RunnerChat />}
      </div>
    </div>
  );
}
