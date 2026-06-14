import { Capacitor } from '@capacitor/core';

export interface HealthWorkout {
  nombre: string;
  tipo: string;
  fecha: string;
  distanciaKm?: number;
  duracionMin?: number;
  fcPromedio?: number;
  fcMax?: number;
  caloriasKcal?: number;
  elevacionM?: number;
  // zonas HR (calculadas)
  zonaMin1?: number; zonaMin2?: number; zonaMin3?: number;
  zonaMin4?: number; zonaMin5?: number;
}

function garminTypeToTipo(type: string): string {
  const map: Record<string, string> = {
    running: 'correr', trail_running: 'trail', cycling: 'ciclismo',
    swimming: 'natacion', walking: 'otro', hiking: 'trail',
  };
  return map[type?.toLowerCase()] ?? 'otro';
}

export async function importFromAppleHealth(days = 7): Promise<HealthWorkout[]> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('@perfood/capacitor-healthkit') as any;
    const HK = mod.CapacitorHealthkit ?? mod.default;
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - days * 86400_000).toISOString();

    await HK.requestAuthorization({
      all: [], read: ['workouts', 'steps', 'calories', 'distance', 'heart_rate'], write: [],
    });

    const result = await HK.queryWorkouts({ startDate, endDate, limit: 20 });
    return ((result as any).workouts ?? []).map((w: any): HealthWorkout => ({
      nombre: w.workoutActivityType ?? 'Entrenamiento',
      tipo: garminTypeToTipo(w.workoutActivityType ?? ''),
      fecha: w.startDate ?? new Date().toISOString(),
      distanciaKm: w.totalDistance ? w.totalDistance / 1000 : undefined,
      duracionMin: w.duration ? Math.round(w.duration / 60) : undefined,
      caloriasKcal: w.totalEnergyBurned ? Math.round(w.totalEnergyBurned) : undefined,
      elevacionM: w.totalFlightsClimbed ? w.totalFlightsClimbed * 3 : undefined,
    }));
  } catch (e) {
    console.warn('[HealthKit]', e);
    return [];
  }
}

export async function importFromHealthConnect(days = 7): Promise<HealthWorkout[]> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('capacitor-health-connect') as any;
    const HC = mod.HealthConnect ?? mod.default;

    await HC.requestHealthPermissions({
      read: ['ExerciseSession', 'Distance', 'TotalCaloriesBurned', 'HeartRate', 'ElevationGained'],
      write: [],
    });

    const endTime = new Date();
    const startTime = new Date(Date.now() - days * 86400_000);
    const sessions = await HC.readRecords({
      type: 'ExerciseSession',
      timeRangeFilter: { operator: 'between', startTime, endTime },
    });

    return ((sessions as any).records ?? []).map((s: any): HealthWorkout => ({
      nombre: s.title ?? 'Entrenamiento',
      tipo: garminTypeToTipo(s.exerciseType ?? ''),
      fecha: s.startTime ?? new Date().toISOString(),
      duracionMin: s.startTime && s.endTime
        ? Math.round((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000)
        : undefined,
    }));
  } catch (e) {
    console.warn('[HealthConnect]', e);
    return [];
  }
}

export async function importFromHealth(days = 7): Promise<HealthWorkout[]> {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return importFromAppleHealth(days);
  if (platform === 'android') return importFromHealthConnect(days);
  return [];
}
