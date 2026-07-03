// Reverse geocoding via Geoapify — turns the start coordinate of an activity
// into a city name (for the "ciudades" badge). Needs GEOAPIFY_KEY in the env;
// degrades to null (feature simply inactive) when it isn't set.

export function firstGpxCoord(gpx: string): { lat: number; lon: number } | null {
  const m = gpx.match(/<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/i);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lon)) return null;
  return { lat, lon };
}

export async function reverseCity(lat: number, lon: number): Promise<string | null> {
  const key = process.env.GEOAPIFY_KEY;
  if (!key) return null;
  try {
    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&type=city&format=json&apiKey=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    const p = data.results?.[0];
    return p?.city ?? p?.town ?? p?.village ?? p?.municipality ?? p?.county ?? null;
  } catch {
    return null;
  }
}
