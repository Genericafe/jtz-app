import { PrismaClient } from '@prisma/client';

const STRAVA_API = 'https://www.strava.com/api/v3';

// ── Token management ──────────────────────────────────────────────────────────

export async function getValidStravaToken(
  runner: any,
  prisma: PrismaClient,
): Promise<string | null> {
  if (!runner.stravaAccessToken || !runner.stravaRefreshToken) return null;

  // Refresh if expired (or expiring in <5 min)
  const expiry = runner.stravaTokenExpiry ? new Date(runner.stravaTokenExpiry) : new Date(0);
  const needsRefresh = expiry.getTime() - Date.now() < 5 * 60 * 1000;

  if (!needsRefresh) return runner.stravaAccessToken;

  const clientId     = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return runner.stravaAccessToken; // use expired but try

  try {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
        refresh_token: runner.stravaRefreshToken,
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();

    await (prisma as any).runner.update({
      where: { id: runner.id },
      data: {
        stravaAccessToken:  data.access_token,
        stravaRefreshToken: data.refresh_token,
        stravaTokenExpiry:  new Date(data.expires_at * 1000),
      },
    });
    return data.access_token;
  } catch {
    return null;
  }
}

// ── Strava API calls ──────────────────────────────────────────────────────────

export async function fetchStravaActivity(token: string, id: number): Promise<any> {
  const res = await fetch(`${STRAVA_API}/activities/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava API ${res.status}`);
  return res.json();
}

export async function fetchStravaStreams(token: string, id: number): Promise<any> {
  const keys = 'latlng,altitude,heartrate,cadence,watts,time';
  const res  = await fetch(`${STRAVA_API}/activities/${id}/streams?keys=${keys}&key_by_type=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchRecentStravaActivities(token: string, after?: number): Promise<any[]> {
  const params = new URLSearchParams({ per_page: '30' });
  if (after) params.set('after', String(Math.floor(after / 1000)));
  const res = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json() as Promise<any[]>;
}

// ── URL resolver ──────────────────────────────────────────────────────────────

export async function resolveStravaActivityId(url: string): Promise<number | null> {
  // Direct strava.com URL
  const direct = url.match(/strava\.com\/activities\/(\d+)/);
  if (direct) return Number(direct[1]);

  // Short link (strava.app.link, strava.com/...share links)
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    // Try final URL first
    const finalUrl = res.url;
    const matchFinal = finalUrl.match(/strava\.com\/activities\/(\d+)/);
    if (matchFinal) return Number(matchFinal[1]);

    // Try body (Branch.io may render HTML with the destination URL embedded)
    const html = await res.text();
    const matchHtml = html.match(/strava\.com\/activities\/(\d+)/);
    if (matchHtml) return Number(matchHtml[1]);
  } catch {
    return null;
  }
  return null;
}

// ── GPX builder from Strava streams ──────────────────────────────────────────

const STRAVA_TYPE_MAP: Record<string, string> = {
  Run: 'correr', TrailRun: 'trail', VirtualRun: 'correr',
  Ride: 'ciclismo', VirtualRide: 'ciclismo', MountainBikeRide: 'ciclismo',
  Swim: 'natacion',
};

export function stravaTypeToLocal(stravaType: string): string {
  return STRAVA_TYPE_MAP[stravaType] ?? 'otro';
}

export function buildGpxFromStrava(activity: any, streams: any | null): string {
  const startDate = new Date(activity.start_date);
  let trkpts = '';

  if (streams?.latlng?.data && streams.latlng.data.length > 0) {
    const latlng: [number, number][] = streams.latlng.data;
    const alt:  number[] = streams.altitude?.data  ?? [];
    const hr:   number[] = streams.heartrate?.data ?? [];
    const cad:  number[] = streams.cadence?.data   ?? [];
    const time: number[] = streams.time?.data      ?? [];

    trkpts = latlng.map(([lat, lng], i) => {
      const t = new Date(startDate.getTime() + (time[i] ?? i) * 1000).toISOString();
      const eleTag = alt[i] != null ? `<ele>${alt[i].toFixed(1)}</ele>` : '';
      let ext = '';
      if (hr[i] != null || cad[i] != null) {
        ext = `<extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">${hr[i] != null ? `<gpxtpx:hr>${hr[i]}</gpxtpx:hr>` : ''}${cad[i] != null ? `<gpxtpx:cad>${cad[i]}</gpxtpx:cad>` : ''}</gpxtpx:TrackPointExtension></extensions>`;
      }
      return `    <trkpt lat="${lat}" lon="${lng}">${eleTag}<time>${t}</time>${ext}</trkpt>`;
    }).join('\n');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="JTZ Running Club (via Strava)">
  <trk>
    <name>${activity.name ?? 'Actividad Strava'}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

// ── Import one Strava activity into ActivityLog ───────────────────────────────

export async function importStravaActivityById(
  token:     string,
  actId:     number,
  runnerId:  number,
  prisma:    PrismaClient,
): Promise<any> {
  const [activity, streams] = await Promise.all([
    fetchStravaActivity(token, actId),
    fetchStravaStreams(token, actId),
  ]);

  const gpxContent = buildGpxFromStrava(activity, streams);
  const gpxNombre  = `strava_${actId}.gpx`;
  const distKm     = activity.distance ? activity.distance / 1000 : undefined;
  const durMin     = activity.moving_time ? Math.round(activity.moving_time / 60) : undefined;
  const elapsedMin = activity.elapsed_time ? Math.round(activity.elapsed_time / 60) : undefined;
  const ritmo      = distKm && durMin ? durMin / distKm : undefined;

  const log = await (prisma as any).activityLog.create({
    data: {
      runnerId,
      fuente:            'strava',
      stravaActivityId:  actId,
      nombre:            activity.name,
      tipo:              stravaTypeToLocal(activity.type ?? activity.sport_type ?? ''),
      fecha:             new Date(activity.start_date),
      distanciaKm:       distKm,
      duracionMin:       durMin,
      tiempoElapsadoMin: elapsedMin,
      ritmoMinKm:        ritmo,
      fcPromedio:        activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
      fcMax:             activity.max_heartrate     ? Math.round(activity.max_heartrate)     : undefined,
      cadenciaPromedio:  activity.average_cadence   ? Math.round(activity.average_cadence * 2) : undefined,
      elevacionM:        activity.total_elevation_gain,
      caloriasKcal:      activity.calories,
      potenciaW:         activity.average_watts    ? Math.round(activity.average_watts)    : undefined,
      gpxContent,
      gpxNombre,
    },
  });
  return log;
}
