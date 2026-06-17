import { useSearchParams } from 'react-router-dom';
import { Activity, MapPin } from 'lucide-react';
import MyActivities from './MyActivities';
import RoutesPage from './Routes';

// Single "Actividades" section that hosts both the activity history and the
// saved routes as tabs. Each child page stays a self-contained component
// (rendered with `embedded` so the hub owns the page padding/width) — clean to
// maintain, no logic duplicated.
const TABS = [
  { key: 'actividades', label: 'Actividades', icon: Activity },
  { key: 'rutas',       label: 'Rutas',       icon: MapPin },
] as const;

export default function ActivitiesHub() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'rutas' ? 'rutas' : 'actividades';
  const setTab = (t: string) =>
    setParams(t === 'rutas' ? { tab: 'rutas' } : {}, { replace: true });

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Section tabs */}
      <div className="flex bg-surface-700 rounded-xl p-1 mb-5 w-full sm:w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === key ? 'bg-brand-500 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'rutas' ? <RoutesPage embedded /> : <MyActivities embedded />}
    </div>
  );
}
