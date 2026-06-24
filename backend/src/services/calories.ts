// MET-based calorie estimate for an activity.
//
// Returns kcal, or `undefined` when there isn't enough data (no weight or no
// duration). Weight is the dominant factor, which is why we only estimate once
// the runner has set their `peso` in their profile.
//
// Factors considered:
//  - Weight: always.
//  - Distance: running/trail (energy cost ~1.036 kcal/kg/km, largely pace-independent).
//  - Time: cycling/swimming/other (MET × weight × hours).
//  - Speed/pace: cycling (selects the MET tier).
//  - Elevation gain: running/trail/other — extra cost of climbing, m·g·h adjusted
//    for ~25% muscular efficiency ≈ 0.0085 kcal per kg per metre ascended.
//
// Pace is deliberately NOT used for running: covering 1 km costs roughly the
// same energy whether fast or slow — only the time to spend it changes.
const CLIMB_KCAL_PER_KG_PER_M = 0.0085;

export function estimateCalories(
  tipo:        string | undefined,
  distanciaKm: number | null | undefined,
  duracionMin: number | null | undefined,
  pesoKg:      number | null | undefined,
  elevGainM?:  number | null | undefined,
): number | undefined {
  if (!pesoKg || pesoKg <= 0 || !duracionMin || duracionMin <= 0) return undefined;

  const hours = duracionMin / 60;
  const dist  = distanciaKm && distanciaKm > 0 ? distanciaKm : 0;
  const speed = dist > 0 ? dist / hours : 0; // km/h
  const gain  = elevGainM && elevGainM > 0 ? elevGainM : 0;
  const climbKcal = pesoKg * gain * CLIMB_KCAL_PER_KG_PER_M;

  switch (tipo) {
    case 'correr':
    case 'trail': {
      const flat = dist > 0 ? pesoKg * dist * 1.036 : 9 * pesoKg * hours;
      return Math.round(flat + climbKcal);
    }

    case 'ciclismo': {
      // Cycling MET already scales with speed, which captures most of the
      // climbing effort (you slow down going up), so we don't double-count it.
      const met = speed < 16 ? 4 : speed < 19 ? 6 : speed < 22 ? 8 : speed < 25 ? 10 : 12;
      return Math.round(met * pesoKg * hours);
    }

    case 'natacion':
      return Math.round(7 * pesoKg * hours);

    default: // "otro" / unknown — treat like on-foot effort, climb included
      return Math.round(5 * pesoKg * hours + climbKcal);
  }
}
