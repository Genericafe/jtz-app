import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, Tag } from 'lucide-react';
import { publicApi } from '../services/api';
import PublicHeader from '../components/PublicHeader';

interface Product { id: number; nombre: string; descripcion?: string; tipo: string; precio: number; stock: number; talla?: string; color?: string; imagen?: string }

export default function PublicStore() {
  const { data, isLoading } = useQuery({
    queryKey: ['public-products'],
    queryFn: async () => (await publicApi.listProducts()).data as Product[],
  });
  const products = data ?? [];

  return (
    <div className="min-h-screen bg-surface-900 text-white">
      <PublicHeader active="/tienda-publica" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="heading-display text-3xl text-white mb-1">Tienda JTZ</h1>
        <p className="text-gray-400 text-sm mb-6">Producto oficial del club. Inicia sesión para comprar.</p>

        {isLoading ? (
          <p className="text-gray-500 py-16 text-center">Cargando…</p>
        ) : products.length === 0 ? (
          <div className="text-center py-20"><ShoppingBag size={40} className="text-gray-600 mx-auto mb-3" /><p className="text-gray-500">Aún no hay productos disponibles</p></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {products.map(p => (
              <div key={p.id} className="card overflow-hidden group">
                <div className="relative aspect-square bg-surface-700">
                  {p.imagen
                    ? <img src={p.imagen} alt={p.nombre} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><ShoppingBag size={40} className="text-gray-600" /></div>}
                  {p.stock <= 0 && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><span className="text-xs font-bold text-white bg-red-500/80 px-2 py-1 rounded">Agotado</span></div>}
                </div>
                <div className="p-3">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 flex items-center gap-1"><Tag size={10} /> {p.tipo}</p>
                  <h3 className="text-sm font-bold text-white leading-tight mt-0.5 line-clamp-2">{p.nombre}</h3>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                    {p.talla && <span>Talla {p.talla}</span>}
                    {p.color && <span>· {p.color}</span>}
                  </div>
                  <p className="text-base font-black text-white mt-2">${p.precio.toLocaleString('es-MX')}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 card p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <p className="font-bold text-white">¿Quieres comprar?</p>
            <p className="text-sm text-gray-400">Inicia sesión con tu cuenta del club para hacer tu pedido.</p>
          </div>
          <Link to="/login" className="btn-primary px-6 py-2.5 text-sm font-bold flex-shrink-0">Iniciar sesión</Link>
        </div>
      </div>
    </div>
  );
}
