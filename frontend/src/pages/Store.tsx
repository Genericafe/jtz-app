import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Package, X, ShoppingCart, Truck, CheckCircle, ImagePlus, Trash2, Edit2 } from 'lucide-react';
import { productsApi, runnersApi } from '../services/api';
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

  const buyMutation = useMutation({
    mutationFn: () => productsApi.buyNow({ items: [{ productId: product.id, cantidad: qty }], notas: nota || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-orders'] }); onClose(); },
  });

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
          <p className="text-xs text-gray-400 capitalize mt-0.5">{tipoLabel[product.tipo] ?? product.tipo}{product.talla ? ` · Talla ${product.talla}` : ''}{product.color ? ` · ${product.color}` : ''}</p>
          <p className="text-brand-400 font-black text-xl mt-2">${product.precio.toLocaleString('es-MX')} MXN</p>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <label className="text-sm text-gray-400">Cantidad</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg bg-surface-600 text-white font-bold flex items-center justify-center hover:bg-surface-500 transition-colors">-</button>
            <span className="w-8 text-center font-bold text-white">{qty}</span>
            <button onClick={() => setQty(q => Math.min(product.stock, q + 1))} className="w-8 h-8 rounded-lg bg-surface-600 text-white font-bold flex items-center justify-center hover:bg-surface-500 transition-colors">+</button>
          </div>
          <span className="text-xs text-gray-500 ml-auto">${(product.precio * qty).toLocaleString('es-MX')} MXN</span>
        </div>

        <div className="mt-3">
          <label className="text-xs text-gray-400 mb-1 block">Nota (opcional)</label>
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: talla confirmada, color preferido..." className="input w-full text-sm" />
        </div>

        <p className="text-xs text-gray-500 mt-3 bg-surface-600 rounded-lg p-3">
          El pago se realiza directamente al coach (efectivo / transferencia). Tu pedido quedará en estado <strong className="text-yellow-400">pendiente</strong> hasta que el coach confirme el pago.
        </p>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
          <button onClick={() => buyMutation.mutate()} disabled={buyMutation.isPending}
            className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <ShoppingCart size={15} /> {buyMutation.isPending ? 'Enviando...' : 'Hacer pedido'}
          </button>
        </div>
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

  // Coach: orders paid but not delivered
  const pendingDeliveries = orders.filter(o => o.estado === 'pagado');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">Tienda JTZ</h1>
          <p className="text-gray-500 text-sm mt-0.5">{isCoach ? 'Inventario y pedidos del equipo' : 'Uniformes y artículos del club'}</p>
        </div>
        {isCoach && (
          <div className="flex gap-2">
            <button onClick={() => setShowOrder(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.08] text-sm text-gray-300 hover:text-white hover:bg-surface-600 transition-all">
              <ShoppingCart size={15} /> Nuevo pedido
            </button>
            <button onClick={() => setShowProductForm(true)} className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
              <Plus size={15} /> Agregar producto
            </button>
          </div>
        )}
      </div>

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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {products.map(p => (
            <div key={p.id} className="card overflow-hidden hover:border-white/[0.12] transition-all group">
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
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditProduct(p)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-all" title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => { if (confirm(`¿Eliminar "${p.nombre}"?`)) deleteProductMutation.mutate(p.id); }}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
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
          ))}
          {products.length === 0 && (
            <div className="col-span-full text-center py-20 text-gray-500">
              <Package size={36} className="mx-auto mb-3 opacity-30" />
              <p>Sin productos en inventario</p>
            </div>
          )}
        </div>
      )}

      {/* ── Orders table ─────────────────────────────────────────────────── */}
      {tab === 'pedidos' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/[0.06]">
              <tr>
                {isCoach && <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Corredor</th>}
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Artículos</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Total</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Estado</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Fecha</th>
                {isCoach && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody>
              {(isCoach ? orders : myOrders).map(o => (
                <tr key={o.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  {isCoach && <td className="px-5 py-3 font-medium text-white">{o.runner?.nombre} {o.runner?.apellido}</td>}
                  <td className="px-5 py-3 text-gray-400">
                    {o.items?.map(i => `${i.product?.nombre} ×${i.cantidad}`).join(', ') ?? `${o.items?.length ?? 0} art.`}
                  </td>
                  <td className="px-5 py-3 font-semibold text-white">${o.total.toLocaleString('es-MX')}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${estadoBadge[o.estado] ?? estadoBadge.pendiente}`}>{o.estado}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{format(new Date(o.createdAt), "d MMM yyyy", { locale: es })}</td>
                  {isCoach && (
                    <td className="px-5 py-3">
                      <select value={o.estado} onChange={e => updateOrderMutation.mutate({ id: o.id, estado: e.target.value })}
                        className="text-xs bg-surface-600 border border-white/[0.08] rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-brand-500/50">
                        {['pendiente', 'pagado', 'entregado', 'cancelado'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
              {(isCoach ? orders : myOrders).length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-gray-500">Sin pedidos</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
