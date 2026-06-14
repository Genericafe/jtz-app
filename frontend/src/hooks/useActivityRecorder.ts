import { useState, useRef, useCallback, useEffect } from 'react';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export interface TrackPoint { lat: number; lng: number; ele?: number; time: string; }

export interface RecorderState {
  status: 'idle' | 'running' | 'paused' | 'finished';
  elapsed: number;          // seconds
  distanceKm: number;
  paceMinKm: number | null; // min/km promedio
  currentPaceMinKm: number | null;
  fcActual: number | null;
  track: TrackPoint[];
  error: string | null;
}

function haversineKm(a: TrackPoint, b: TrackPoint) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function buildGpx(track: TrackPoint[], name: string): string {
  const pts = track
    .map(p => `    <trkpt lat="${p.lat}" lon="${p.lng}">${p.ele != null ? `<ele>${p.ele}</ele>` : ''}<time>${p.time}</time></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="JTZ Running Club">
  <trk><name>${name}</name><trkseg>
${pts}
  </trkseg></trk>
</gpx>`;
}

export function useActivityRecorder() {
  const [state, setState] = useState<RecorderState>({
    status: 'idle', elapsed: 0, distanceKm: 0,
    paceMinKm: null, currentPaceMinKm: null,
    fcActual: null, track: [], error: null,
  });

  const watchIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPointRef = useRef<TrackPoint | null>(null);
  const recentDistRef = useRef<{ time: number; dist: number }[]>([]);

  const clearTimer = () => { if (timerRef.current) clearInterval(timerRef.current); };
  const clearWatch = async () => {
    if (watchIdRef.current) {
      await Geolocation.clearWatch({ id: watchIdRef.current });
      watchIdRef.current = null;
    }
  };

  const start = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Geolocation.requestPermissions();
      }

      setState(s => ({ ...s, status: 'running', error: null }));

      // Timer cada segundo
      timerRef.current = setInterval(() => {
        setState(s => {
          if (s.status !== 'running') return s;
          const elapsed = s.elapsed + 1;
          const paceMinKm = s.distanceKm > 0.05 ? elapsed / 60 / s.distanceKm : null;

          // Pace actual: promedio de los últimos 30 segundos
          const now = Date.now();
          const window = recentDistRef.current.filter(p => now - p.time < 30_000);
          recentDistRef.current = window;
          const recentDist = window.reduce((a, b) => a + b.dist, 0);
          const recentSecs = window.length > 0 ? (now - window[0].time) / 1000 : 0;
          const currentPaceMinKm = recentDist > 0.01 && recentSecs > 5
            ? recentSecs / 60 / recentDist : null;

          return { ...s, elapsed, paceMinKm, currentPaceMinKm };
        });
      }, 1000);

      // GPS watch
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 10000 },
        (pos: Position | null, err?: any) => {
          if (err || !pos) return;
          const point: TrackPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ele: pos.coords.altitude ?? undefined,
            time: new Date(pos.timestamp).toISOString(),
          };
          setState(s => {
            if (s.status === 'paused') return s;
            let addedKm = 0;
            if (lastPointRef.current) {
              addedKm = haversineKm(lastPointRef.current, point);
              if (addedKm < 0.0005) return s; // filtrar ruido < 0.5m
              recentDistRef.current.push({ time: Date.now(), dist: addedKm });
            }
            lastPointRef.current = point;
            return { ...s, distanceKm: s.distanceKm + addedKm, track: [...s.track, point] };
          });
        }
      );
      watchIdRef.current = id;
    } catch (e: any) {
      setState(s => ({ ...s, status: 'idle', error: e.message ?? 'Error GPS' }));
    }
  }, []);

  const pause = useCallback(async () => {
    clearTimer();
    await clearWatch();
    if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Medium });
    setState(s => ({ ...s, status: 'paused' }));
  }, []);

  const resume = useCallback(async () => {
    setState(s => ({ ...s, status: 'running' }));
    timerRef.current = setInterval(() => {
      setState(s => {
        if (s.status !== 'running') return s;
        return { ...s, elapsed: s.elapsed + 1 };
      });
    }, 1000);
    const id = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 10000 },
      (pos: Position | null, err?: any) => {
        if (err || !pos) return;
        const point: TrackPoint = {
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          ele: pos.coords.altitude ?? undefined,
          time: new Date(pos.timestamp).toISOString(),
        };
        setState(s => {
          if (s.status === 'paused') return s;
          let addedKm = 0;
          if (lastPointRef.current) {
            addedKm = haversineKm(lastPointRef.current, point);
            if (addedKm < 0.0005) return s;
          }
          lastPointRef.current = point;
          return { ...s, distanceKm: s.distanceKm + addedKm, track: [...s.track, point] };
        });
      }
    );
    watchIdRef.current = id;
  }, []);

  const finish = useCallback(async () => {
    clearTimer();
    await clearWatch();
    if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Heavy });
    setState(s => ({ ...s, status: 'finished' }));
  }, []);

  const reset = useCallback(() => {
    lastPointRef.current = null;
    recentDistRef.current = [];
    setState({ status: 'idle', elapsed: 0, distanceKm: 0, paceMinKm: null, currentPaceMinKm: null, fcActual: null, track: [], error: null });
  }, []);

  const getGpx = useCallback((name: string) => buildGpx(state.track, name), [state.track]);

  useEffect(() => () => { clearTimer(); clearWatch(); }, []);

  return { state, start, pause, resume, finish, reset, getGpx };
}

export function formatPace(minKm: number | null): string {
  if (!minKm || !isFinite(minKm)) return '--:--';
  const mins = Math.floor(minKm);
  const secs = Math.round((minKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
