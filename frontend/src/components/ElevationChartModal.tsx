import { useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Mountain } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Pt { lat: number; lng: number; ele?: number }

interface Props {
  track: Pt[];
  onClose: () => void;
}

function haversineKm(a: Pt, b: Pt) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d2r, dLon = (b.lng - a.lng) * d2r;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function ElevationChartModal({ track, onClose }: Props) {
  const { data, gain, loss, min, max } = useMemo(() => {
    const withEle = track.filter(p => p.ele != null);
    if (withEle.length < 2) return { data: [], gain: 0, loss: 0, min: 0, max: 0 };

    // Downsample to keep the chart light on long activities.
    const step = Math.max(1, Math.floor(track.length / 240));
    const data: { d: number; m: number }[] = [];
    let cum = 0, gain = 0, loss = 0;
    let min = Infinity, max = -Infinity;
    let prevEle: number | null = null;

    for (let i = 0; i < track.length; i++) {
      if (i > 0) cum += haversineKm(track[i - 1], track[i]);
      const ele = track[i].ele;
      if (ele == null) continue;
      if (prevEle != null) {
        const diff = ele - prevEle;
        if (diff > 0.5) gain += diff; else if (diff < -0.5) loss += Math.abs(diff);
      }
      prevEle = ele;
      if (ele < min) min = ele;
      if (ele > max) max = ele;
      if (i % step === 0 || i === track.length - 1) {
        data.push({ d: +cum.toFixed(2), m: Math.round(ele) });
      }
    }
    return { data, gain: Math.round(gain), loss: Math.round(loss), min: Math.round(min), max: Math.round(max) };
  }, [track]);

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-800 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl flex flex-col border border-white/[0.08] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Mountain size={16} className="text-blue-400" /> Perfil de desnivel
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          {data.length < 2 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              No hay datos de altitud suficientes para esta actividad.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-surface-700 rounded-xl p-2.5">
                  <div className="flex items-center gap-1 text-[11px] text-gray-500"><TrendingUp size={11} className="text-green-400" /> Subida</div>
                  <p className="text-base font-black text-white">+{gain} m</p>
                </div>
                <div className="bg-surface-700 rounded-xl p-2.5">
                  <div className="flex items-center gap-1 text-[11px] text-gray-500"><TrendingDown size={11} className="text-red-400" /> Bajada</div>
                  <p className="text-base font-black text-white">-{loss} m</p>
                </div>
                <div className="bg-surface-700 rounded-xl p-2.5">
                  <div className="flex items-center gap-1 text-[11px] text-gray-500"><Mountain size={11} className="text-blue-400" /> Mín/Máx</div>
                  <p className="text-base font-black text-white">{min}/{max}</p>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eleFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="d" unit=" km" tick={{ fontSize: 10, fill: '#6b7280' }} stroke="rgba(255,255,255,0.1)" />
                  <YAxis unit=" m" tick={{ fontSize: 10, fill: '#6b7280' }} stroke="rgba(255,255,255,0.1)" width={48} domain={['dataMin - 5', 'dataMax + 5']} />
                  <Tooltip
                    contentStyle={{ background: '#1e2433', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
                    labelFormatter={(v) => `${v} km`}
                    formatter={(v: any) => [`${v} m`, 'Altitud']}
                  />
                  <Area type="monotone" dataKey="m" stroke="#60a5fa" strokeWidth={2} fill="url(#eleFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
