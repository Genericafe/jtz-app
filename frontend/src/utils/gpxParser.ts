export interface TrackPoint {
  lat: number;
  lng: number;
  ele?: number;
  time?: Date;
  hr?: number;
  cad?: number;
  power?: number;
}

export interface Split {
  km: number;
  distanciaKm: number;
  duracionMin: number;
  ritmoMinKm: number;
  fcPromedio?: number;
  potenciaW?: number;
}

export interface GpxParsedData {
  name?: string;
  tipo: string;
  fecha: Date;
  distanciaKm: number;
  duracionMin: number;
  tiempoElapsadoMin: number;
  ritmoMinKm: number;
  fcPromedio?: number;
  fcMax?: number;
  cadenciaPromedio?: number;
  cadenciaMax?: number;
  elevacionM: number;
  elevacionPerdidaM: number;
  caloriasKcal?: number;
  potenciaW?: number;
  potenciaMax?: number;
  potenciaPonderada?: number;
  potenciaPromedio30s?: number;
  trackPoints: TrackPoint[];
  splits: Split[];
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getExtNum(pt: Element, ...localNames: string[]): number | undefined {
  for (const name of localNames) {
    const els = pt.getElementsByTagNameNS('*', name);
    if (els.length > 0) {
      const v = parseInt(els[0].textContent?.trim() ?? '', 10);
      if (!isNaN(v) && v > 0) return v;
    }
  }
  return undefined;
}

function avg(arr: number[]): number | undefined {
  if (arr.length === 0) return undefined;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function detectTipo(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('trail')) return 'trail';
  if (n.includes('ciclismo') || n.includes('bike') || n.includes('bici') || n.includes('cycling') || n.includes('ride')) return 'ciclismo';
  if (n.includes('natacion') || n.includes('swim') || n.includes('pool')) return 'natacion';
  return 'correr';
}

export function parseGpx(content: string): GpxParsedData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');

  if (doc.querySelector('parsererror')) throw new Error('El archivo GPX no es válido');

  const nameEl = doc.getElementsByTagName('name')[0];
  const name = nameEl?.textContent?.trim();

  const trkpts = Array.from(doc.getElementsByTagName('trkpt'));
  if (trkpts.length === 0) throw new Error('No hay puntos de ruta en el archivo GPX');

  const points: TrackPoint[] = trkpts.map(pt => {
    const lat = parseFloat(pt.getAttribute('lat') ?? '0');
    const lng = parseFloat(pt.getAttribute('lon') ?? '0');
    const eleEl = pt.getElementsByTagName('ele')[0];
    const ele = eleEl ? parseFloat(eleEl.textContent?.trim() ?? '0') : undefined;
    const timeEl = pt.getElementsByTagName('time')[0];
    const time = timeEl?.textContent ? new Date(timeEl.textContent.trim()) : undefined;

    const hr = getExtNum(pt, 'hr', 'HeartRateBpm', 'heartrate');
    const cad = getExtNum(pt, 'cad', 'RunCadence', 'cadence');
    const power = getExtNum(pt, 'power', 'Watts', 'watts', 'PowerInWatts');

    return { lat, lng, ele, time, hr, cad, power };
  });

  // Distance
  let distanciaKm = 0;
  for (let i = 1; i < points.length; i++) {
    distanciaKm += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }

  // Elapsed time
  const startTime = points.find(p => p.time)?.time;
  const endTime = [...points].reverse().find(p => p.time)?.time;
  const tiempoElapsadoMin = startTime && endTime
    ? (endTime.getTime() - startTime.getTime()) / 60000 : 0;

  // Moving time: segments where speed > 0.3 m/s
  let movingMs = 0;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1], p2 = points[i];
    if (!p1.time || !p2.time) continue;
    const dtMs = p2.time.getTime() - p1.time.getTime();
    if (dtMs <= 0) continue;
    const dk = haversineKm(p1.lat, p1.lng, p2.lat, p2.lng) * 1000;
    const speed = dk / (dtMs / 1000); // m/s
    if (speed > 0.3) movingMs += dtMs;
  }
  const duracionMin = movingMs > 0 ? movingMs / 60000 : tiempoElapsadoMin;

  // Elevation gain / loss (smooth small noise with 0.5m threshold)
  let elevacionM = 0, elevacionPerdidaM = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].ele == null || points[i - 1].ele == null) continue;
    const diff = points[i].ele! - points[i - 1].ele!;
    if (diff > 0.5) elevacionM += diff;
    else if (diff < -0.5) elevacionPerdidaM += Math.abs(diff);
  }

  // HR stats
  const hrs = points.filter(p => p.hr != null && p.hr! > 30 && p.hr! < 250).map(p => p.hr!);
  const fcPromedio = avg(hrs);
  const fcMax = hrs.length > 0 ? Math.max(...hrs) : undefined;

  // Cadence stats
  const cads = points.filter(p => p.cad != null && p.cad! > 0).map(p => p.cad!);
  const cadenciaPromedio = avg(cads);
  const cadenciaMax = cads.length > 0 ? Math.max(...cads) : undefined;

  // Power stats
  const powers = points.filter(p => p.power != null && p.power! > 0 && p.power! < 3000).map(p => p.power!);
  const potenciaW = avg(powers);
  const potenciaMax = powers.length > 0 ? Math.max(...powers) : undefined;

  // Weighted/Normalized Power: 30s rolling avg → raise to 4th power → average → 4th root
  let potenciaPonderada: number | undefined;
  let potenciaPromedio30s: number | undefined;
  if (powers.length >= 30) {
    const W = 30;
    const rolling: number[] = [];
    for (let i = W - 1; i < powers.length; i++) {
      const slice = powers.slice(i - W + 1, i + 1);
      rolling.push(slice.reduce((a, b) => a + b, 0) / W);
    }
    potenciaPromedio30s = Math.round(Math.max(...rolling));
    potenciaPonderada = Math.round(
      Math.pow(rolling.reduce((a, v) => a + Math.pow(v, 4), 0) / rolling.length, 0.25)
    );
  }

  // Pace
  const ritmoMinKm = distanciaKm > 0.01 ? duracionMin / distanciaKm : 0;

  // Decimate track points for map display (max ~350 points)
  const step = Math.max(1, Math.floor(points.length / 350));
  const trackPoints = points
    .filter((_, i) => i % step === 0 || i === points.length - 1)
    .map(p => ({ lat: p.lat, lng: p.lng, ele: p.ele }));

  // 1km splits
  const splits: Split[] = [];
  let splitKmAcc = 0;
  let splitHrs: number[] = [];
  let splitPws: number[] = [];
  let splitStartTime = points[0]?.time;
  let splitNumber = 1;

  for (let i = 1; i < points.length; i++) {
    const dk = haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    splitKmAcc += dk;
    if (points[i].hr) splitHrs.push(points[i].hr!);
    if (points[i].power) splitPws.push(points[i].power!);

    if (splitKmAcc >= 1.0) {
      const splitEndTime = points[i].time;
      const splitMin = splitStartTime && splitEndTime
        ? (splitEndTime.getTime() - splitStartTime.getTime()) / 60000 : 0;
      splits.push({
        km: splitNumber++,
        distanciaKm: parseFloat(splitKmAcc.toFixed(2)),
        duracionMin: splitMin,
        ritmoMinKm: splitKmAcc > 0 ? splitMin / splitKmAcc : 0,
        fcPromedio: avg(splitHrs),
        potenciaW: avg(splitPws),
      });
      splitKmAcc = 0;
      splitHrs = [];
      splitPws = [];
      splitStartTime = points[i].time;
    }
  }
  // Último split parcial
  if (splitKmAcc > 0.1) {
    const splitEndTime = points[points.length - 1].time;
    const splitMin = splitStartTime && splitEndTime
      ? (splitEndTime.getTime() - splitStartTime.getTime()) / 60000 : 0;
    splits.push({
      km: splitNumber,
      distanciaKm: parseFloat(splitKmAcc.toFixed(2)),
      duracionMin: splitMin,
      ritmoMinKm: splitKmAcc > 0 ? splitMin / splitKmAcc : 0,
      fcPromedio: avg(splitHrs),
      potenciaW: avg(splitPws),
    });
  }

  return {
    name,
    tipo: detectTipo(name ?? ''),
    fecha: startTime ?? new Date(),
    distanciaKm: parseFloat(distanciaKm.toFixed(2)),
    duracionMin: Math.round(duracionMin),
    tiempoElapsadoMin: Math.round(tiempoElapsadoMin),
    ritmoMinKm,
    fcPromedio,
    fcMax,
    cadenciaPromedio,
    cadenciaMax,
    elevacionM: Math.round(elevacionM),
    elevacionPerdidaM: Math.round(elevacionPerdidaM),
    potenciaW,
    potenciaMax,
    potenciaPonderada,
    potenciaPromedio30s,
    trackPoints,
    splits,
  };
}
