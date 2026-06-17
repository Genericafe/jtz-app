import { useEffect, useRef, useState } from 'react';
import { X, Image as ImageIcon, Download, Share2, Loader2 } from 'lucide-react';
import type { ActivityLog } from './ActivityStatsView';

const TIPO_EMOJI: Record<string, string> = {
  correr: '🏃', trail: '🏔️', ciclismo: '🚴', natacion: '🏊', otro: '💪',
};
const TIPO_LABEL: Record<string, string> = {
  correr: 'Carrera', trail: 'Trail', ciclismo: 'Ciclismo', natacion: 'Natación', otro: 'Actividad',
};

function fmtPace(minKm?: number) {
  if (!minKm || !isFinite(minKm) || minKm <= 0) return '--:--';
  const m = Math.floor(minKm), s = Math.round((minKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function fmtDur(min?: number) {
  if (!min) return '--';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

export default function ActivityShareCard({ activity, onClose }: {
  activity: ActivityLog;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [format, setFormat] = useState<'story' | 'square'>('story');
  const [busy, setBusy] = useState(false);
  const canShare = typeof navigator !== 'undefined' && !!(navigator as Navigator & { canShare?: (d: unknown) => boolean }).canShare;

  // ── Draw the card ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = 1080, H = format === 'story' ? 1920 : 1080;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    if (photo) {
      const ar = photo.width / photo.height, car = W / H;
      let dw, dh, dx, dy;
      if (ar > car) { dh = H; dw = H * ar; dx = (W - dw) / 2; dy = 0; }
      else { dw = W; dh = W / ar; dx = 0; dy = (H - dh) / 2; }
      ctx.drawImage(photo, dx, dy, dw, dh);
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#0a3a22'); g.addColorStop(0.6, '#06150d'); g.addColorStop(1, '#000');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // Bottom legibility gradient
    const og = ctx.createLinearGradient(0, H * 0.3, 0, H);
    og.addColorStop(0, 'rgba(0,0,0,0)'); og.addColorStop(0.55, 'rgba(0,0,0,0.55)'); og.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = og; ctx.fillRect(0, 0, W, H);
    // Top legibility gradient
    const tg = ctx.createLinearGradient(0, 0, 0, 220);
    tg.addColorStop(0, 'rgba(0,0,0,0.6)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 220);

    const shadow = () => { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 2; };
    const noShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };

    // ── Top brand ──
    shadow();
    ctx.fillStyle = '#22c55e';
    ctx.font = '700 40px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('⚡ JTZ RUNNING CLUB', 64, 96);

    // ── Bottom block ──
    const emoji = TIPO_EMOJI[activity.tipo] ?? '🏃';
    const label = TIPO_LABEL[activity.tipo] ?? 'Actividad';
    const date = new Date(activity.fecha).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

    let y = H - 64;

    // Stats row (bottom-most)
    const stats: { v: string; l: string }[] = [];
    if (activity.duracionMin != null) stats.push({ v: fmtDur(activity.duracionMin), l: 'Tiempo' });
    if (activity.ritmoMinKm != null && activity.ritmoMinKm > 0) stats.push({ v: `${fmtPace(activity.ritmoMinKm)}`, l: 'min/km' });
    if (activity.elevacionM != null && activity.elevacionM > 0) stats.push({ v: `${Math.round(activity.elevacionM)}`, l: 'Desnivel m' });
    if (activity.caloriasKcal != null) stats.push({ v: `${activity.caloriasKcal}`, l: 'Kcal' });
    if (activity.fcPromedio != null) stats.push({ v: `${activity.fcPromedio}`, l: 'ppm' });
    const shownStats = stats.slice(0, 4);

    if (shownStats.length) {
      const colW = (W - 128) / shownStats.length;
      shownStats.forEach((s, i) => {
        const cx = 64 + colW * i;
        shadow();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 52px Inter, system-ui, sans-serif';
        ctx.fillText(s.v, cx, y);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '600 26px Inter, system-ui, sans-serif';
        ctx.fillText(s.l.toUpperCase(), cx, y - 60);
      });
      y -= 130;
    }

    // Big distance
    if (activity.distanciaKm != null) {
      shadow();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 180px Inter, system-ui, sans-serif';
      const dist = activity.distanciaKm.toFixed(2);
      ctx.fillText(dist, 60, y);
      const dw = ctx.measureText(dist).width;
      ctx.fillStyle = '#22c55e';
      ctx.font = '800 64px Inter, system-ui, sans-serif';
      ctx.fillText('KM', 60 + dw + 24, y);
      y -= 200;
    }

    // Activity name + type + date
    shadow();
    ctx.fillStyle = '#22c55e';
    ctx.font = '700 34px Inter, system-ui, sans-serif';
    ctx.fillText(`${emoji} ${label.toUpperCase()}`, 64, y);
    y -= 52;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 48px Inter, system-ui, sans-serif';
    const name = activity.nombre ?? `${label} — ${new Date(activity.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}`;
    ctx.fillText(name.length > 26 ? name.slice(0, 25) + '…' : name, 64, y);
    y -= 56;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '500 30px Inter, system-ui, sans-serif';
    ctx.fillText(date.charAt(0).toUpperCase() + date.slice(1), 64, y);

    noShadow();
    ctx.textAlign = 'left';
  }, [photo, format, activity]);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => setPhoto(img);
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  };

  const toBlob = (): Promise<Blob | null> =>
    new Promise(res => canvasRef.current?.toBlob(b => res(b), 'image/jpeg', 0.92) ?? res(null));

  const download = async () => {
    setBusy(true);
    try {
      const blob = await toBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JTZ-${(activity.nombre ?? activity.tipo).replace(/\s+/g, '_')}.jpg`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally { setBusy(false); }
  };

  const share = async () => {
    setBusy(true);
    try {
      const blob = await toBlob();
      if (!blob) return;
      const file = new File([blob], 'JTZ-actividad.jpg', { type: 'image/jpeg' });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: 'Mi actividad JTZ' });
      } else {
        await download();
      }
    } catch { /* user cancelled */ } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 px-4 py-6 overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="card w-full max-w-sm max-h-[92vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06] sticky top-0 bg-surface-800 z-10">
          <h2 className="font-black text-white">Compartir actividad</h2>
          <button onClick={onClose} className="btn-ghost p-2"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Preview */}
          <div className="rounded-2xl overflow-hidden border border-white/[0.08] bg-black flex items-center justify-center">
            <canvas ref={canvasRef} className="w-full h-auto" style={{ maxHeight: '55vh', objectFit: 'contain' }} />
          </div>

          {/* Format toggle */}
          <div className="flex gap-1 p-1 bg-surface-700 rounded-xl">
            {([['story', 'Historia 9:16'], ['square', 'Cuadrado 1:1']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFormat(v)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${format === v ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Photo */}
          <button onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.1] text-sm text-gray-300 hover:text-white hover:border-brand-500/40 transition-all">
            <ImageIcon size={15} /> {photo ? 'Cambiar foto de fondo' : 'Agregar foto / tomar foto'}
          </button>
          {photo && (
            <button onClick={() => setPhoto(null)} className="w-full text-xs text-gray-500 hover:text-white -mt-2">Quitar foto</button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={download} disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.1] text-sm font-semibold text-gray-200 hover:bg-surface-600 transition-all disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Descargar
            </button>
            {canShare && (
              <button onClick={share} disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold transition-all disabled:opacity-50">
                <Share2 size={15} /> Compartir
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-500 text-center">
            Descarga la imagen y súbela como historia o post en Instagram, Facebook, TikTok o WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
}
