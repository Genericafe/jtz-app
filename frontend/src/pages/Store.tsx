import { useRef, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Package, X, ShoppingCart, Truck, CheckCircle, ImagePlus, Trash2, Edit2, CreditCard, Check } from 'lucide-react';
import { productsApi, runnersApi, stripeApi } from '../services/api';
import { Product, Order, Runner } from '../types';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const estadoBadge: Record<string, string> = {
  pendiente: 'bg-yellow-500/15 text-yellow-400',
  pagado:    'bg-blue-500/15 text-blue-400',
  entregado: 'bg-green-500/15 text-green-400',
  cancelado: 'bg-red-500/15 text-red-400',
};

const tipoLabel: Record<string, string> = {
  jersey: 'Jersey', short: 'Short', accesorio: 'Accesorio', calzado: 'Calzado',
};

// ── Image thumbnail ─────────────────────────────────────────────────────────
function ProductImage({ imagen, nombre, size = 'md' }: { imagen?: string | null; nombre: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-48' : size === 'md' ? 'h-36' : 'h-16 w-16';
  if (imagen) {
    return <img src={imagen} alt={nombre} className={`${dim} w-full object-cover rounded-xl`} />;
  }
  return (
    <div className={`${dim} w-full bg-surface-600 rounded-xl flex items-center justify-center`}>
      <Package size={size === 'lg' ? 32 : size === 'md' ? 24 : 18} className="text-gray-600" />
    </div>
  );
}

// ── Buy modal (runner) ──────────────────────────────────────────────────────
function BuyModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState(1);
  const [nota, setNota] = useState('');
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState('');

  const cashMutation = useMutation({
    mutationFn: () => productsApi.buyNow({ items: [{ productId: product.id, cantidad: qty }], notas: nota || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-orders'] }); onClose(); },
  });

  const handleStripeCheckout = async () => {
    setStripeLoading(true);
    setStripeError('');
    try {
      const res = await stripeApi.createOrderCheckout({
        items: [{ productId: product.id, cantidad: qty }],
        notas: nota || undefined,
      });
      window.location.href = res.data.url;
    } catch (err: any) {
      setStripeError(err?.response?.data?.error ?? 'Error al iniciar el pago. Intenta de nuevo.');
      setStripeLoading(false);
    }
  };

  const total = product.precio * qty;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="card p-6 w-full max-w-sm animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-white text-lg">Confirmar pedido</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        <ProductImage imagen={product.imagen} nombre={product.nombre} size="lg" />

        <div className="mt-4">
          <p className="font-semibold text-white">{product.nombre}</p>
          <p className="text-xs text-gray-400 capitalize mt-0.5">
            {tipoLabel[product.tipo] ?? product.tipo}
            {product.talla ? ` · Talla ${product.talla}` : ''}
            {product.color ? ` · ${product.color}` : ''}
          </p>
          <p className="text-brand-400 font-black text-xl mt-2">${product.precio.toLocaleString('es-MX')} MXN</p>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <label className="text-sm text-gray-400">Cantidad</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg bg-surface-600 text-white font-bold flex items-center justify-center hover:bg-surface-500 transition-colors">−</button>
            <span className="w-8 text-center font-bold text-white">{qty}</span>
            <button onClick={() => setQty(q => Math.min(product.stock, q + 1))} className="w-8 h-8 rounded-lg bg-surface-600 text-white font-bold flex items-center justify-center hover:bg-surface-500 transition-colors">+</button>
          </div>
          <span className="text-sm font-bold text-white ml-auto">${total.toLocaleString('es-MX')} MXN</span>
        </div>

        <div className="mt-3">
          <label className="text-xs text-gray-400 mb-1 block">Nota (opcional)</label>
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: talla confirmada, color preferido..." className="input w-full text-sm" />
        </div>

        {stripeError && (
          <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 mt-3">{stripeError}</p>
        )}

        {/* Pago con tarjeta (Stripe) */}
        <button
          onClick={handleStripeCheckout}
          disabled={stripeLoading || cashMutation.isPending}
          className="w-full mt-4 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {stripeLoading
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Redirigiendo a Stripe…</>
            : <><CreditCard size={15} /> Pagar con tarjeta — ${total.toLocaleString('es-MX')} MXN</>
          }
        </button>

        {/* Separador */}
        <div className="flex items-center gap-2 my-3">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="text-xs text-gray-600">o</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        {/* Pago en efectivo / transferencia */}
        <button
          onClick={() => cashMutation.mutate()}
          disabled={cashMutation.isPending || stripeLoading}
          className="w-full py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white hover:border-white/[0.2] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <ShoppingCart size={14} />
          {cashMutation.isPending ? 'Enviando pedido…' : 'Pagar en efectivo / transferencia'}
        </button>
        <p className="text-[11px] text-gray-600 text-center mt-1.5">
          El pedido quedará pendiente hasta que el coach confirme el pago
        </p>

        <button onClick={onClose} className="w-full mt-2 text-xs text-gray-600 hover:text-gray-400 transition-colors py-1">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Coach: product form ─────────────────────────────────────────────────────
function ProductForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ nombre: '', tipo: 'jersey', precio: '', costo: '', stock: '', talla: '', color: '', imagen: '' });

  const createMutation = useMutation({
    mutationFn: (d: object) => productsApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); onClose(); },
  });

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, imagen: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black text-white">Nuevo producto</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        {/* Image upload */}
        <div className="mb-4">
          {form.imagen ? (
            <div className="relative">
              <img src={form.imagen} alt="preview" className="w-full h-40 object-cover rounded-xl" />
              <button onClick={() => setForm(f => ({ ...f, imagen: '' }))}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="w-full h-32 rounded-xl border-2 border-dashed border-white/[0.12] flex flex-col items-center justify-center gap-2 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all text-gray-500 hover:text-brand-400">
              <ImagePlus size={24} />
              <span className="text-sm">Subir imagen del producto</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Nombre</label>
            <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="input w-full text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as 'jersey' | 'short' | 'accesorio' | 'calzado' })} className="input w-full text-sm">
                {Object.entries(tipoLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Stock</label>
              <input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="input w-full text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Precio venta (MXN)</label>
              <input type="number" value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })} className="input w-full text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Costo proveedor</label>
              <input type="number" value={form.costo} onChange={e => setForm({ ...form, costo: e.target.value })} className="input w-full text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Talla</label>
              <input value={form.talla} onChange={e => setForm({ ...form, talla: e.target.value })} className="input w-full text-sm" placeholder="XS, S, M, L, XL..." />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Color</label>
              <input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="input w-full text-sm" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
          <button onClick={() => createMutation.mutate({ ...form, precio: Number(form.precio), costo: Number(form.costo), stock: Number(form.stock), imagen: form.imagen || undefined })}
            disabled={createMutation.isPending || !form.nombre || !form.precio}
            className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-40">
            {createMutation.isPending ? 'Guardando...' : 'Guardar producto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Coach: edit product form ────────────────────────────────────────────────
function EditProductForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    nombre: product.nombre,
    tipo: product.tipo,
    precio: String(product.precio),
    costo: String(product.costo),
    stock: String(product.stock),
    talla: product.talla ?? '',
    color: product.color ?? '',
    imagen: product.imagen ?? '',
  });

  const updateMutation = useMutation({
    mutationFn: (d: object) => productsApi.update(product.id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); onClose(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg ?? 'Error al guardar. Intenta de nuevo.');
    },
  });

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, imagen: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black text-white">Editar producto</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        {/* Image */}
        <div className="mb-4">
          {form.imagen ? (
            <div className="relative">
              <img src={form.imagen} alt="preview" className="w-full h-40 object-cover rounded-xl" />
              <button onClick={() => setForm(f => ({ ...f, imagen: '' }))}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors">
                <Trash2 size={13} />
              </button>
              <button onClick={() => fileRef.current?.click()}
                className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors">
                <ImagePlus size={13} />
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="w-full h-32 rounded-xl border-2 border-dashed border-white/[0.12] flex flex-col items-center justify-center gap-2 hover:border-brand-500/40 hover:bg-brand-500/5 transition-all text-gray-500 hover:text-brand-400">
              <ImagePlus size={24} />
              <span className="text-sm">Subir imagen</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">Nombre</label>
            <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="input w-full text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as 'jersey' | 'short' | 'accesorio' | 'calzado' })} className="input w-full text-sm">
                {Object.entries(tipoLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Stock</label>
              <input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="input w-full text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Precio venta</label>
              <input type="number" value={form.precio} onChange={e => setForm({ ...form, precio: e.target.value })} className="input w-full text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Costo proveedor</label>
              <input type="number" value={form.costo} onChange={e => setForm({ ...form, costo: e.target.value })} className="input w-full text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Talla</label>
              <input value={form.talla} onChange={e => setForm({ ...form, talla: e.target.value })} className="input w-full text-sm" placeholder="XS, S, M, L, XL..." />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">Color</label>
              <input value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="input w-full text-sm" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
          <button
            onClick={() => updateMutation.mutate({ ...form, precio: Number(form.precio), costo: Number(form.costo), stock: Number(form.stock), imagen: form.imagen || null })}
            disabled={updateMutation.isPending || !form.nombre || !form.precio}
            className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-40">
            {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function Store() {
  const { isCoach } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'catalogo' | 'pedidos'>('catalogo');
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [showOrder, setShowOrder] = useState(false);
  const [buyProduct, setBuyProduct] = useState<Product | null>(null);
  const [orderForm, setOrderForm] = useState({ runnerId: '', items: [{ productId: '', cantidad: '1' }] });
  // Multi-select — productos
  const [selProdMode, setSelProdMode] = useState(false);
  const [selProdIds, setSelProdIds] = useState<Set<number>>(new Set());
  const [bulkProdPending, setBulkProdPending] = useState(false);
  // Multi-select — órdenes
  const [selOrdMode, setSelOrdMode] = useState(false);
  const [selOrdIds, setSelOrdIds] = useState<Set<number>>(new Set());
  const [bulkOrdPending, setBulkOrdPending] = useState(false);
  const [stripeResult, setStripeResult] = useState<'success' | 'cancelled' | null>(null);

  // Detectar regreso desde Stripe y verificar el pago
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const orderId   = params.get('order_id');
    const success   = params.get('order_success');
    const cancelled = params.get('order_cancelled');

    if (cancelled) {
      setStripeResult('cancelled');
      window.history.replaceState({}, '', '/tienda');
      return;
    }

    if (success && sessionId && orderId) {
      stripeApi.verifyOrderPayment(sessionId, orderId)
        .then(() => {
          qc.invalidateQueries({ queryKey: ['my-orders'] });
          setStripeResult('success');
          setTab('pedidos');
        })
        .catch(() => setStripeResult('success')); // mostrar éxito igual — el webhook es el respaldo
      window.history.replaceState({}, '', '/tienda');
    }
  }, [qc]);

  const { data: productsData } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const { data: ordersData }   = useQuery({ queryKey: ['orders'],   queryFn: () => productsApi.orders(),   enabled: isCoach });
  const { data: myOrdersData } = useQuery({ queryKey: ['my-orders'], queryFn: () => productsApi.myOrders(), enabled: !isCoach });
  const { data: runnersData }  = useQuery({ queryKey: ['runners'],  queryFn: () => runnersApi.list(),      enabled: isCoach });

  const products: Product[] = productsData?.data ?? [];
  const orders: Order[]     = ordersData?.data ?? [];
  const myOrders: Order[]   = myOrdersData?.data ?? [];
  const runners: Runner[]   = runnersData?.data ?? [];

  const createOrderMutation = useMutation({
    mutationFn: (d: object) => productsApi.createOrder(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setShowOrder(false); },
  });

  const updateOrderMutation = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) => productsApi.updateOrder(id, estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id: number) => productsApi.deleteProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  // Helpers productos
  const toggleProd = (id: number) => setSelProdIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelProd = () => { setSelProdMode(false); setSelProdIds(new Set()); };
  const handleBulkDeleteProds = async () => {
    if (!confirm(`¿Eliminar ${selProdIds.size} producto(s)?`)) return;
    setBulkProdPending(true);
    try { await Promise.all(Array.from(selProdIds).map(id => productsApi.deleteProduct(id))); qc.invalidateQueries({ queryKey: ['products'] }); exitSelProd(); }
    finally { setBulkProdPending(false); }
  };

  // Helpers órdenes
  const toggleOrd = (id: number) => setSelOrdIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const exitSelOrd = () => { setSelOrdMode(false); setSelOrdIds(new Set()); };
  const coachOrders: Order[] = isCoach ? orders : myOrders;
  const handleBulkDeliver = async () => {
    const targets = coachOrders.filter(o => selOrdIds.has(o.id) && o.estado === 'pagado');
    if (!targets.length) return alert('Solo se pueden marcar como entregadas las órdenes con estado "pagado".');
    if (!confirm(`¿Marcar ${targets.length} orden(es) como entregadas?`)) return;
    setBulkOrdPending(true);
    try { await Promise.all(targets.map(o => productsApi.updateOrder(o.id, 'entregado'))); qc.invalidateQueries({ queryKey: ['orders'] }); exitSelOrd(); }
    finally { setBulkOrdPending(false); }
  };

  // Coach: orders paid but not delivered
  const pendingDeliveries = orders.filter(o => o.estado === 'pagado');

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-white">Tienda JTZ</h1>
          <p className="text-gray-500 text-sm mt-0.5">{isCoach ? 'Inventario y pedidos del equipo' : 'Uniformes y artículos del club'}</p>
        </div>
        {isCoach && (
          <div className="flex gap-2 flex-wrap">
            {/* Bulk actions — productos */}
            {tab === 'catalogo' && selProdMode && selProdIds.size > 0 && (
              <button onClick={handleBulkDeleteProds} disabled={bulkProdPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-all disabled:opacity-40">
                <Trash2 size={14} /> Eliminar ({selProdIds.size})
              </button>
            )}
            {/* Bulk actions — órdenes */}
            {tab === 'pedidos' && selOrdMode && selOrdIds.size > 0 && (
              <button onClick={handleBulkDeliver} disabled={bulkOrdPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-green-400 hover:bg-green-500/10 border border-green-500/20 transition-all disabled:opacity-40">
                <Truck size={14} /> Marcar entregados ({selOrdIds.size})
              </button>
            )}
            {/* Gestionar */}
            {tab === 'catalogo' && (
              <button onClick={() => selProdMode ? exitSelProd() : setSelProdMode(true)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${selProdMode ? 'bg-surface-600 text-white border border-white/[0.08]' : 'text-gray-400 hover:text-white hover:bg-surface-600'}`}>
                {selProdMode ? 'Cancelar' : 'Gestionar'}
              </button>
            )}
            {tab === 'pedidos' && (
              <button onClick={() => selOrdMode ? exitSelOrd() : setSelOrdMode(true)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${selOrdMode ? 'bg-surface-600 text-white border border-white/[0.08]' : 'text-gray-400 hover:text-white hover:bg-surface-600'}`}>
                {selOrdMode ? 'Cancelar' : 'Gestionar'}
              </button>
            )}
            {!selProdMode && !selOrdMode && (
              <>
                <button onClick={() => setShowOrder(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-300 hover:text-white hover:bg-surface-600 transition-all">
                  <ShoppingCart size={15} /> Nuevo pedido
                </button>
                <button onClick={() => setShowProductForm(true)} className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
                  <Plus size={15} /> Agregar producto
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Banner resultado Stripe ──────────────────────────────────────── */}
      {stripeResult === 'success' && (
        <div className="mb-5 flex items-start gap-3 p-4 rounded-2xl bg-green-500/10 border border-green-500/20">
          <CheckCircle size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-green-400">¡Pago completado!</p>
            <p className="text-xs text-green-600 mt-0.5">Tu pedido fue registrado y está siendo procesado por el coach.</p>
          </div>
          <button onClick={() => setStripeResult(null)} className="text-green-600 hover:text-green-400 transition-colors"><X size={15} /></button>
        </div>
      )}
      {stripeResult === 'cancelled' && (
        <div className="mb-5 flex items-start gap-3 p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
          <ShoppingCart size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-yellow-400">Pago cancelado</p>
            <p className="text-xs text-yellow-600 mt-0.5">No se realizó ningún cargo. Puedes intentarlo de nuevo cuando quieras.</p>
          </div>
          <button onClick={() => setStripeResult(null)} className="text-yellow-600 hover:text-yellow-400 transition-colors"><X size={15} /></button>
        </div>
      )}

      {/* ── COACH: pending deliveries banner ─────────────────────────────── */}
      {isCoach && pendingDeliveries.length > 0 && (
        <div className="mb-6 card p-5 border-brand-500/20 bg-brand-500/5">
          <h2 className="text-sm font-bold text-brand-400 flex items-center gap-2 mb-3">
            <Truck size={16} /> Entregas pendientes ({pendingDeliveries.length})
          </h2>
          <div className="space-y-2">
            {pendingDeliveries.map(o => (
              <div key={o.id} className="flex items-center gap-4 p-3 bg-surface-700 rounded-xl border border-white/[0.06]">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{o.runner?.nombre} {o.runner?.apellido}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {o.items?.map(i => `${i.product?.nombre} ×${i.cantidad}`).join(', ')} · ${o.total.toLocaleString('es-MX')} MXN
                  </p>
                </div>
                <span className="text-xs text-gray-500 hidden sm:block">{format(new Date(o.createdAt), "d MMM", { locale: es })}</span>
                <button
                  onClick={() => updateOrderMutation.mutate({ id: o.id, estado: 'entregado' })}
                  disabled={updateOrderMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/25 text-xs font-semibold hover:bg-green-500/25 transition-all disabled:opacity-50">
                  <CheckCircle size={13} /> Entregado
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-surface-700 border border-white/[0.06] rounded-xl w-fit mb-6">
        <button onClick={() => setTab('catalogo')}
          className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === 'catalogo' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'}`}>
          {isCoach ? 'Inventario' : 'Catálogo'}
        </button>
        <button onClick={() => setTab('pedidos')}
          className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === 'pedidos' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'}`}>
          {isCoach ? 'Todos los pedidos' : 'Mis pedidos'}
        </button>
      </div>

      {/* ── Catalog / Inventory ───────────────────────────────────────────── */}
      {tab === 'catalogo' && (
        <>
          {isCoach && selProdMode && (
            <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-surface-700 rounded-xl border border-white/[0.06]">
              <button
                onClick={() => setSelProdIds(selProdIds.size === products.length ? new Set() : new Set(products.map(p => p.id)))}
                className="flex items-center gap-2.5 text-sm text-gray-300 hover:text-white transition-colors"
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  selProdIds.size === products.length ? 'bg-brand-500 border-brand-500'
                  : selProdIds.size > 0 ? 'border-brand-500 bg-surface-800'
                  : 'border-gray-500 bg-surface-800'
                }`}>
                  {selProdIds.size === products.length && <Check size={12} className="text-white" />}
                  {selProdIds.size > 0 && selProdIds.size < products.length && <span className="w-2 h-0.5 bg-brand-400 rounded-full" />}
                </div>
                {selProdIds.size === products.length
                  ? 'Deseleccionar todos'
                  : selProdIds.size > 0
                  ? `${selProdIds.size} de ${products.length} seleccionados`
                  : `Seleccionar todos (${products.length})`}
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {products.map(p => {
              const isSelProd = selProdIds.has(p.id);
              return (
                <div
                  key={p.id}
                  onClick={isCoach && selProdMode ? () => toggleProd(p.id) : undefined}
                  className={`card overflow-hidden transition-all group relative ${
                    isCoach && selProdMode
                      ? `cursor-pointer ${isSelProd ? 'border-brand-500 bg-brand-500/5' : 'hover:border-white/[0.12]'}`
                      : 'hover:border-white/[0.12]'
                  }`}
                >
                  {isCoach && selProdMode && (
                    <div className="absolute top-3 right-3 z-10">
                      <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all shadow ${
                        isSelProd ? 'bg-brand-500 border-brand-500' : 'border-gray-400 bg-surface-700/90'
                      }`}>
                        {isSelProd && <Check size={14} className="text-white" />}
                      </div>
                    </div>
                  )}
                  <ProductImage imagen={p.imagen} nombre={p.nombre} size="md" />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="font-bold text-white text-sm">{p.nombre}</p>
                        <p className="text-xs text-gray-500 capitalize mt-0.5">{tipoLabel[p.tipo] ?? p.tipo}</p>
                      </div>
                      <p className="text-brand-400 font-black text-base whitespace-nowrap">${p.precio.toLocaleString('es-MX')}</p>
                    </div>

                    {(p.talla || p.color) && (
                      <div className="flex gap-1.5 mb-3 flex-wrap">
                        {p.talla  && <span className="text-xs bg-surface-600 text-gray-400 px-2 py-0.5 rounded-full">Talla {p.talla}</span>}
                        {p.color  && <span className="text-xs bg-surface-600 text-gray-400 px-2 py-0.5 rounded-full">{p.color}</span>}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      {isCoach ? (
                        <div className="flex items-center justify-between w-full">
                          <div className="flex gap-3 text-center text-xs">
                            <div>
                              <p className="text-gray-500">Costo</p>
                              <p className="font-semibold text-white">${p.costo.toLocaleString('es-MX')}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Stock</p>
                              <p className={`font-semibold ${p.stock < 5 ? 'text-red-400' : 'text-white'}`}>{p.stock}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Margen</p>
                              <p className="font-semibold text-green-400">${(p.precio - p.costo).toLocaleString('es-MX')}</p>
                            </div>
                          </div>
                          {!selProdMode && (
                            <div className="flex items-center gap-1">
                              <button onClick={(e) => { e.stopPropagation(); setEditProduct(p); }}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-all" title="Editar">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); if (confirm(`¿Eliminar "${p.nombre}"?`)) deleteProductMutation.mutate(p.id); }}
                                className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Eliminar">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${p.stock > 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                            {p.stock > 0 ? `${p.stock} disponibles` : 'Sin stock'}
                          </span>
                        </div>
                      )}
                      {!isCoach && p.stock > 0 && (
                        <button onClick={() => setBuyProduct(p)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold transition-all active:scale-95">
                          <ShoppingCart size={12} /> Comprar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {products.length === 0 && (
              <div className="col-span-full text-center py-20 text-gray-500">
                <Package size={36} className="mx-auto mb-3 opacity-30" />
                <p>Sin productos en inventario</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Orders table ─────────────────────────────────────────────────── */}
      {tab === 'pedidos' && (
        <>
          {isCoach && selOrdMode && (
            <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-surface-700 rounded-xl border border-white/[0.06]">
              <button
                onClick={() => setSelOrdIds(selOrdIds.size === orders.length ? new Set() : new Set(orders.map(o => o.id)))}
                className="flex items-center gap-2.5 text-sm text-gray-300 hover:text-white transition-colors"
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  selOrdIds.size === orders.length ? 'bg-brand-500 border-brand-500'
                  : selOrdIds.size > 0 ? 'border-brand-500 bg-surface-800'
                  : 'border-gray-500 bg-surface-800'
                }`}>
                  {selOrdIds.size === orders.length && <Check size={12} className="text-white" />}
                  {selOrdIds.size > 0 && selOrdIds.size < orders.length && <span className="w-2 h-0.5 bg-brand-400 rounded-full" />}
                </div>
                {selOrdIds.size === orders.length
                  ? 'Deseleccionar todos'
                  : selOrdIds.size > 0
                  ? `${selOrdIds.size} de ${orders.length} seleccionados`
                  : `Seleccionar todos (${orders.length})`}
              </button>
            </div>
          )}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/[0.06]">
                <tr>
                  {isCoach && selOrdMode && <th className="px-3 py-3 w-10" />}
                  {isCoach && <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Corredor</th>}
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Artículos</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Estado</th>
                  <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Fecha</th>
                  {isCoach && !selOrdMode && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody>
                {(isCoach ? orders : myOrders).map(o => {
                  const isSelOrd = selOrdIds.has(o.id);
                  return (
                    <tr
                      key={o.id}
                      onClick={isCoach && selOrdMode ? () => toggleOrd(o.id) : undefined}
                      className={`border-b border-white/[0.04] transition-colors ${
                        isCoach && selOrdMode ? `cursor-pointer ${isSelOrd ? 'bg-brand-500/5' : 'hover:bg-white/[0.02]'}` : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      {isCoach && selOrdMode && (
                        <td className="px-3 py-3">
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelOrd ? 'bg-brand-500 border-brand-500' : 'border-gray-500'}`}>
                            {isSelOrd && <Check size={12} className="text-white" />}
                          </div>
                        </td>
                      )}
                      {isCoach && <td className="px-5 py-3 font-medium text-white">{o.runner?.nombre} {o.runner?.apellido}</td>}
                      <td className="px-5 py-3 text-gray-400">
                        {o.items?.map(i => `${i.product?.nombre} ×${i.cantidad}`).join(', ') ?? `${o.items?.length ?? 0} art.`}
                      </td>
                      <td className="px-5 py-3 font-semibold text-white">${o.total.toLocaleString('es-MX')}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${estadoBadge[o.estado] ?? estadoBadge.pendiente}`}>{o.estado}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{format(new Date(o.createdAt), "d MMM yyyy", { locale: es })}</td>
                      {isCoach && !selOrdMode && (
                        <td className="px-5 py-3">
                          <select value={o.estado} onChange={e => updateOrderMutation.mutate({ id: o.id, estado: e.target.value })}
                            className="text-xs bg-surface-600 border border-white/[0.08] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-brand-500/50">
                            {['pendiente', 'pagado', 'entregado', 'cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {(isCoach ? orders : myOrders).length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-500">Sin pedidos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Coach: new order modal ────────────────────────────────────────── */}
      {showOrder && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="card p-6 w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-white">Nuevo pedido</h2>
              <button onClick={() => setShowOrder(false)} className="btn-ghost p-1.5"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Corredor</label>
                <select value={orderForm.runnerId} onChange={e => setOrderForm({ ...orderForm, runnerId: e.target.value })}
                  className="input w-full text-sm">
                  <option value="">Seleccionar...</option>
                  {runners.filter(r => r.activo).map(r => <option key={r.id} value={r.id}>{r.nombre} {r.apellido}</option>)}
                </select>
              </div>
              {orderForm.items.map((item, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Producto</label>
                    <select value={item.productId} onChange={e => {
                      const items = [...orderForm.items];
                      items[i] = { ...items[i], productId: e.target.value };
                      setOrderForm({ ...orderForm, items });
                    }} className="input w-full text-sm">
                      <option value="">Seleccionar...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Cant.</label>
                    <input type="number" min="1" value={item.cantidad} onChange={e => {
                      const items = [...orderForm.items];
                      items[i] = { ...items[i], cantidad: e.target.value };
                      setOrderForm({ ...orderForm, items });
                    }} className="input w-full text-sm" />
                  </div>
                </div>
              ))}
              <button onClick={() => setOrderForm({ ...orderForm, items: [...orderForm.items, { productId: '', cantidad: '1' }] })}
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors">+ Agregar producto</button>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowOrder(false)} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button onClick={() => createOrderMutation.mutate({
                runnerId: Number(orderForm.runnerId),
                items: orderForm.items.filter(i => i.productId).map(i => ({ productId: Number(i.productId), cantidad: Number(i.cantidad) })),
              })} disabled={createOrderMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-50">
                {createOrderMutation.isPending ? 'Creando...' : 'Crear pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductForm && <ProductForm onClose={() => setShowProductForm(false)} />}
      {editProduct && <EditProductForm product={editProduct} onClose={() => setEditProduct(null)} />}
      {buyProduct && <BuyModal product={buyProduct} onClose={() => setBuyProduct(null)} />}
    </div>
  );
}
