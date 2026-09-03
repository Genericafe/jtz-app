import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';

const NAV: [string, string][] = [
  ['/inicio', 'Inicio'],
  ['/carreras', 'Carreras'],
  ['/seguir', 'Seguir en vivo'],
  ['/tienda-publica', 'Tienda'],
];

export default function PublicHeader({ active }: { active?: string }) {
  return (
    <header className="sticky top-0 z-40 bg-surface-900/90 backdrop-blur border-b border-white/[0.06]">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/inicio" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-hero flex items-center justify-center shadow-glow-sm">
            <Zap size={18} className="text-white" fill="white" />
          </div>
          <div>
            <p className="heading-display text-xl leading-none gradient-text">JTZ</p>
            <p className="text-[10px] text-gray-500 -mt-0.5">Running Club</p>
          </div>
        </Link>
        <nav className="flex items-center gap-0.5 sm:gap-1">
          {NAV.map(([to, label]) => (
            <Link key={to} to={to}
              className={`px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active === to ? 'text-brand-400' : 'text-gray-400 hover:text-white'}`}>
              {label}
            </Link>
          ))}
          <Link to="/login" className="btn-primary px-4 py-2 text-sm ml-1">Entrar</Link>
        </nav>
      </div>
    </header>
  );
}
