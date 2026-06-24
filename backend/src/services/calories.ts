// MET-based calorie estimate for an activity.
//
// Returns kcal, or `undefined` when there isn't enough data (no weight or no
// duration). Weight is the dominant factor, which is why we only estimate once
// the runner has set their `peso` in their profile.
//
// References: running energy cost is ~1.036 kcal per kg per km and largely
// independent of pace; cycling/swimming/other use standard MET values
// (kcal = MET × weight_kg × hours).
export function estimateCalories(
  tipo:        string | undefined,
  distanciaKm: number | null | undefined,
  duracionMin: number | null | undefined,
  pesoKg:      number | null | undefined,
): number | undefined {
  if (!pesoKg || pesoKg <= 0 || !duracionMin || duracionMin <= 0) return undefined;

  const hours = duracionMin / 60;
  const dist  = distanciaKm && distanciaKm > 0 ? distanciaKm : 0;
  const speed = dist > 0 ? dist / hours : 0; // km/h

  switch (tipo) {
    case 'correr':
    case 'trail':
      if (dist > 0) return Math.round(pesoKg * dist * 1.036);
      return Math.round(9 * pesoKg * hours); // no distance → assume moderate run

    case 'ciclismo': {
      const met = speed < 16 ? 4 : speed < 19 ? 6 : speed < 22 ? 8 : speed < 25 ? 10 : 12;
      return Math.round(met * pesoKg * hours);
    }

    case 'natacion':
      return Math.round(7 * pesoKg * hours);

    default: // "otro" / unknown
      return Math.round(5 * pesoKg * hours);
  }
}
