import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon, Upload, X, Check, ExternalLink } from 'lucide-react';
import { siteApi } from '../services/api';

// Compress an image client-side to a base64 JPEG data URL.
async function compressImage(file: File, maxW = 1600, quality = 0.78): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
  });
  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'); if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

function PhotoField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { onChange(await compressImage(file)); } finally { setBusy(false); e.target.value = ''; }
  };
  return (
    <div>
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      {value ? (
        <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] group">
          <img src={value} alt={label} className="w-full h-44 object-cover" />
          <button onClick={() => onChange('')} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white/90 hover:bg-black/80">
            <X size={15} />
          </button>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/[0.12] rounded-2xl py-8 cursor-pointer hover:border-brand-500/40 hover:bg-brand-500/5 transition-all ${busy ? 'opacity-60' : ''}`}>
          {busy ? <div className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" /> : <Upload size={22} className="text-brand-400" />}
          <span className="text-sm text-gray-400">{busy ? 'Procesando…' : 'Subir foto'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={handle} disabled={busy} />
        </label>
      )}
    </div>
  );
}

export default function SitePhotos() {
  const { data } = useQuery({ queryKey: ['site-config'], queryFn: async () => (await siteApi.get()).data });
  const [hero, setHero] = useState('');
  const [comunidad, setComunidad] = useState('');
  const [accion, setAccion] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) { setHero(data.heroImagen ?? ''); setComunidad(data.comunidadImagen ?? ''); setAccion(data.accionImagen ?? ''); }
  }, [data]);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await siteApi.update({ heroImagen: hero, comunidadImagen: comunidad, accionImagen: accion });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch { alert('Error al guardar. Intenta con imágenes más pequeñas.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-brand-500/15 flex items-center justify-center">
          <ImageIcon size={24} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Fotos del sitio público</h1>
          <p className="text-gray-400 text-sm">Estas fotos aparecen en la página pública del club (jtz-app.vercel.app/inicio)</p>
        </div>
      </div>

      <div className="space-y-6">
        <PhotoField label="Portada (hero)" hint="Foto épica de montaña/trail — se ve a pantalla completa arriba" value={hero} onChange={setHero} />
        <PhotoField label="Comunidad" hint="Foto grupal del club" value={comunidad} onChange={setComunidad} />
        <PhotoField label="Acción" hint="Corredor en acción — banda a la mitad de la página" value={accion} onChange={setAccion} />
      </div>

      <div className="flex items-center gap-3 mt-8">
        <button onClick={save} disabled={saving} className="btn-primary px-6 py-2.5 text-sm font-bold disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar fotos'}
        </button>
        {saved && <span className="text-green-400 text-sm flex items-center gap-1"><Check size={15} /> Guardado</span>}
        <a href="/inicio" target="_blank" rel="noreferrer" className="ml-auto text-sm text-brand-400 hover:text-brand-300 flex items-center gap-1">
          Ver el sitio <ExternalLink size={14} />
        </a>
      </div>
      <p className="text-[11px] text-gray-500 mt-3">Las imágenes se optimizan solas. Tras guardar, refresca la página pública para verlas.</p>
    </div>
  );
}
