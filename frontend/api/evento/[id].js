// Vercel serverless function: serves the public event page (/evento/:id) with
// event-specific Open Graph tags so shared links show a rich preview (image,
// title, date) on WhatsApp, Facebook, Instagram, Twitter, etc.
//
// Real users still get the full SPA: we fetch the built index.html and inject
// the OG tags into <head>. If anything fails we fall back to the plain SPA so
// the public registration page never breaks.

const API_BASE =
  process.env.VITE_API_URL || 'https://jtz-app-production.up.railway.app/api';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
  const { id } = req.query;
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;

  // 1. Always fetch the SPA shell first — this is what makes the page work.
  let html = '';
  try {
    const r = await fetch(`${origin}/index.html`);
    html = await r.text();
  } catch {
    // Can't get the shell → let Vercel serve the static file normally.
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, `/index.html`);
  }

  // 2. Try to enrich with event-specific OG tags. Non-fatal on failure.
  try {
    const r = await fetch(`${API_BASE}/public/events/${id}`);
    if (r.ok) {
      const ev = await r.json();
      const fecha = (() => {
        try {
          return new Date(ev.fecha).toLocaleDateString('es-MX', {
            weekday: 'long', day: 'numeric', month: 'long',
          });
        } catch { return ''; }
      })();
      const title = `${ev.nombre} · JTZ Running Club`;
      const precio = ev.precio === 0 ? 'Entrada libre' : `$${ev.precio} MXN`;
      const desc =
        (ev.descripcion && ev.descripcion.slice(0, 160)) ||
        [fecha, `${ev.lugar}${ev.ciudad ? ', ' + ev.ciudad : ''}`, precio]
          .filter(Boolean).join(' · ');
      const url   = `${origin}/evento/${id}`;
      const image = `${API_BASE}/public/events/${id}/image`;
      const hasImg = !!ev.imagen;

      const tags = [
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="JTZ Running Club">`,
        `<meta property="og:title" content="${esc(title)}">`,
        `<meta property="og:description" content="${esc(desc)}">`,
        `<meta property="og:url" content="${esc(url)}">`,
        hasImg ? `<meta property="og:image" content="${esc(image)}">` : '',
        hasImg ? `<meta property="og:image:width" content="1200">` : '',
        `<meta name="twitter:card" content="${hasImg ? 'summary_large_image' : 'summary'}">`,
        `<meta name="twitter:title" content="${esc(title)}">`,
        `<meta name="twitter:description" content="${esc(desc)}">`,
        hasImg ? `<meta name="twitter:image" content="${esc(image)}">` : '',
        `<meta name="description" content="${esc(desc)}">`,
      ].filter(Boolean).join('\n    ');

      // Replace the document <title> and inject the OG tags before </head>.
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
      html = html.replace('</head>', `    ${tags}\n  </head>`);
    }
  } catch {
    // keep plain SPA html
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Short CDN cache so updated event details/images refresh reasonably fast.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).send(html);
}
