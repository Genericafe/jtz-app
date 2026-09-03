import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, Tag, Plus, Minus, X, Loader2, CheckCircle2 } from 'lucide-react';
import { publicApi } from '../services/api';
import PublicHeader from '../components/PublicHeader';

interface Product { id: number; nombre: string; descripcion?: string; tipo: string; precio: number; stock: number; talla?: string; color?: string; imagen?: string }

export default function PublicStore() {
  const { data, isLoading } = useQuery({
    queryKey: ['public-products'],
    queryFn: async () => (await publicApi.listProducts()).data as Product[],
  });
  const products = data ?? [];

  const [params, setParams] = useSearchParams();
  const [cart, setCart] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [loadingPay, setLoadingPay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  // After returning from Stripe, verify the session and show a thank-you.
  useEffect(() => {
    const sid = params.get('session_id');
    if (params.get('success') && sid) {
      publicApi.verifySession(sid).then(() => { setPaid(true); setCart({}); }).catch(() => setPaid(true));
      params.delete('success'); params.delete('session_id'); setParams(params, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (id: number, stock: number) =>
    setCart(c => ({ ...c, [id]: Math.min((c[id] ?? 0) + 1, stock) }));
  const sub = (id: number) =>
    setCart(c => { const n = (c[id] ?? 0) - 1; const copy = { ...c }; if (n <= 0) delete copy[id]; else copy[id] = n; return copy; });

  const lines = useMemo(
    () => Object.entries(cart).map(([id, qty]) => ({ p: products.find(p => p.id === Number(id))!, qty }))
      .filter(l => l.p),
    [cart, products],
  );
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.p.precio * l.qty, 0);

  const checkout = async () => {
    setError(null); setLoadingPay(true);
    try {
      const items = lines.map(l => ({ productId: l.p.id, cantidad: l.qty }));
      const { data } = await publicApi.storeCheckout({ items });
      if (data?.url) window.location.href = data.url;
      else setError('No se pudo iniciar el pago.');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'No se pudo iniciar el pago. Intenta de nuevo.');
    } finally { setLoadingPay(false); }
  };

  return (
    <div className="min-h-screen bg-surface-900 text-white">
      <PublicHeader active="/tienda-publica" />
      <div className="max-w-5xl mx-auto px-4 py-8 pb-32">
        <div className="flex items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="heading-display text-3xl text-white mb-1">Merch Oficial JTZ</h1>
            <p className="text-gray-400 text-sm">Producto oficial del club.</p>
          </div>
          {count > 0 && (
            <button onClick={() => setCartOpen(true)} className="btn-primary px-4 py-2.5 text-sm font-bold flex items-center gap-2 flex-shrink-0">
              <ShoppingBag size={16} /> {count}
            </button>
          )}
        </div>

        {paid && (
          <div className="mb-6 card p-5 border border-green-500/30 bg-green-500/[0.06] flex items-start gap-3">
            <CheckCircle2 className="text-green-400 flex-shrink-0 mt-0.5" size={22} />
            <div>
              <p className="font-bold text-white">¡Gracias por tu compra! 🎉</p>
              <p className="text-sm text-gray-300">Tu pedido quedó registrado. Te llegará un correo de confirmación y el coach se pondrá en contacto para la entrega.</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-gray-500 py-16 text-center">Cargando…</p>
        ) : products.length === 0 ? (
          <div className="text-center py-20"><ShoppingBag size={40} className="text-gray-600 mx-auto mb-3" /><p className="text-gray-500">Aún no hay productos disponibles</p></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {products.map(p => {
              const inCart = cart[p.id] ?? 0;
              const agotado = p.stock <= 0;
              return (
                <div key={p.id} className="card overflow-hidden group flex flex-col">
                  <div className="relative aspect-square bg-surface-700">
                    {p.imagen
                      ? <img src={p.imagen} alt={p.nombre} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><ShoppingBag size={40} className="text-gray-600" /></div>}
                    {agotado && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><span className="text-xs font-bold text-white bg-red-500/80 px-2 py-1 rounded">Agotado</span></div>}
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center gap-1"><Tag size={10} /> {p.tipo}</p>
                    <h3 className="text-sm font-bold text-white leading-tight mt-0.5 line-clamp-2">{p.nombre}</h3>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                      {p.talla && <span>Talla {p.talla}</span>}
                      {p.color && <span>· {p.color}</span>}
                    </div>
                    <p className="text-base font-black text-white mt-2">${p.precio.toLocaleString('es-MX')}</p>
                    <div className="mt-3">
                      {agotado ? (
                        <button disabled className="w-full py-2 rounded-xl text-xs font-bold bg-surface-600 text-gray-500 cursor-not-allowed">Agotado</button>
                      ) : inCart === 0 ? (
                        <button onClick={() => add(p.id, p.stock)} className="w-full py-2 rounded-xl text-xs font-bold bg-brand-500 hover:bg-brand-600 text-white transition-colors active:scale-95">Agregar</button>
                      ) : (
                        <div className="flex items-center justify-between bg-surface-600 rounded-xl">
                          <button onClick={() => sub(p.id)} className="p-2.5 text-white hover:text-brand-400"><Minus size={14} /></button>
                          <span className="text-sm font-bold text-white">{inCart}</span>
                          <button onClick={() => add(p.id, p.stock)} className="p-2.5 text-white hover:text-brand-400 disabled:opacity-40" disabled={inCart >= p.stock}><Plus size={14} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky cart bar */}
      {count > 0 && !cartOpen && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t border-white/[0.08] bg-surface-800/95 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-400">{count} artículo{count > 1 ? 's' : ''}</p>
              <p className="text-lg font-black text-white">${total.toLocaleString('es-MX')}</p>
            </div>
            <button onClick={() => setCartOpen(true)} className="btn-primary px-6 py-3 text-sm font-bold flex items-center gap-2">
              <ShoppingBag size={16} /> Ver carrito
            </button>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCartOpen(false)} />
          <div className="relative w-full max-w-md bg-surface-800 h-full flex flex-col border-l border-white/[0.08] animate-slide-up">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
              <h2 className="heading-display text-xl text-white">Tu carrito</h2>
              <button onClick={() => setCartOpen(false)} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-surface-600"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {lines.map(({ p, qty }) => (
                <div key={p.id} className="flex gap-3 items-center card p-2.5">
                  <div className="w-14 h-14 rounded-lg bg-surface-700 overflow-hidden flex-shrink-0">
                    {p.imagen ? <img src={p.imagen} alt={p.nombre} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ShoppingBag size={18} className="text-gray-600" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{p.nombre}</p>
                    <p className="text-xs text-gray-500">${p.precio.toLocaleString('es-MX')}</p>
                  </div>
                  <div className="flex items-center gap-1 bg-surface-600 rounded-lg">
                    <button onClick={() => sub(p.id)} className="p-1.5 text-white hover:text-brand-400"><Minus size={13} /></button>
                    <span className="text-sm font-bold text-white w-5 text-center">{qty}</span>
                    <button onClick={() => add(p.id, p.stock)} className="p-1.5 text-white hover:text-brand-400 disabled:opacity-40" disabled={qty >= p.stock}><Plus size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-white/[0.08] space-y-3">
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Total</span>
                <span className="text-2xl font-black text-white">${total.toLocaleString('es-MX')}</span>
              </div>
              <button onClick={checkout} disabled={loadingPay || count === 0}
                className="btn-primary w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                {loadingPay ? <><Loader2 size={16} className="animate-spin" /> Redirigiendo…</> : <>Pagar ${total.toLocaleString('es-MX')}</>}
              </button>
              <p className="text-[11px] text-gray-500 text-center">Pago seguro con Stripe · No necesitas crear cuenta. Los datos de envío se piden en el pago.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
