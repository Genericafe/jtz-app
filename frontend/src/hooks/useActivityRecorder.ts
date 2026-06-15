import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export interface TrackPoint {
  lat: number; lng: number; ele?: number; time: string; accuracy?: number;
}

export interface RecorderState {
  status: 'idle' | 'running' | 'paused' | 'finished';
  elapsed: number;
  distanceKm: number;
  paceMinKm: number | null;
  currentPaceMinKm: number | null;
  fcActual: number | null;
  track: TrackPoint[];
  error: string | null;
  elevationGainM: number;
  currentAltitudeM: number | null;
}

function haversineKm(a: TrackPoint, b: TrackPoint) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d2r, dLng = (b.lng - a.lng) * d2r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function buildGpx(track: TrackPoint[], name: string): string {
  const pts = track
    .map(p =>
      `    <trkpt lat="${p.lat}" lon="${p.lng}">${p.ele != null ? `<ele>${p.ele}</ele>` : ''}<time>${p.time}</time></trkpt>`,
    )
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
    elevationGainM: 0, currentAltitudeM: null,
  });

  // Capacitor returns string IDs, browser returns numbers
  const watchIdRef      = useRef<string | number | null>(null);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPointRef    = useRef<TrackPoint | null>(null);
  const lastAltitudeRef = useRef<number | null>(null);
  const recentDistRef   = useRef<{ time: number; dist: number }[]>([]);
  const isNative      = Capacitor.isNativePlatform();

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const clearWatch = async () => {
    if (watchIdRef.current === null) return;
    try {
      if (isNative) {
        await Geolocation.clearWatch({ id: watchIdRef.current as string });
      } else {
        navigator.geolocation.clearWatch(watchIdRef.current as number);
      }
    } catch { /* ignore */ }
    watchIdRef.current = null;
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setState(s => {
        if (s.status !== 'running') return s;
        const elapsed = s.elapsed + 1;
        const paceMinKm = s.distanceKm > 0.05 ? elapsed / 60 / s.distanceKm : null;

        const now = Date.now();
        const window = recentDistRef.current.filter(p => now - p.time < 30_000);
        recentDistRef.current = window;
        const recentDist = window.reduce((a, b) => a + b.dist, 0);
        const recentSecs = window.length > 0 ? (now - window[0].time) / 1000 : 0;
        const currentPaceMinKm =
          recentDist > 0.01 && recentSecs > 5 ? recentSecs / 60 / recentDist : null;

        return { ...s, elapsed, paceMinKm, currentPaceMinKm };
      });
    }, 1000);
  };

  // Shared point processor for both native and web callbacks
  const processPoint = (point: TrackPoint) => {
    setState(s => {
      if (s.status === 'paused') return s;
      let addedKm = 0;
      if (lastPointRef.current) {
        addedKm = haversineKm(lastPointRef.current, point);
        if (addedKm < 0.0005) return s; // filter noise < 0.5 m
        recentDistRef.current.push({ time: Date.now(), dist: addedKm });
      }
      lastPointRef.current = point;

      // Elevation tracking — only count gains > 2 m to filter GPS altitude noise
      let elevationGainM = s.elevationGainM;
      if (point.ele != null) {
        if (lastAltitudeRef.current != null) {
          const diff = point.ele - lastAltitudeRef.current;
          if (diff > 2) elevationGainM += diff;
        }
        lastAltitudeRef.current = point.ele;
      }

      return {
        ...s,
        distanceKm: s.distanceKm + addedKm,
        track: [...s.track, point],
        elevationGainM,
        currentAltitudeM: point.ele ?? s.currentAltitudeM,
      };
    });
  };

  const startGpsWatch = async () => {
    if (isNative) {
      // ── Native Capacitor GPS (Android / iOS) ──────────────────────────────
      try {
        const perms = await Geolocation.requestPermissions();
        if (perms.location !== 'granted') {
          setState(s => ({ ...s, error: 'Permiso de ubicación denegado. Actívalo en Configuración del dispositivo.' }));
          return;
        }
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (position, err) => {
            if (err || !position) {
              if (err) setState(s => ({ ...s, error: `GPS: ${err.message}` }));
              return;
            }
            processPoint({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              ele: position.coords.altitude ?? undefined,
              time: new Date().toISOString(),
              accuracy: position.coords.accuracy ?? undefined,
            });
          },
        );
        watchIdRef.current = id;
      } catch (err: unknown) {
        setState(s => ({ ...s, error: (err as Error).message ?? 'Error al iniciar GPS' }));
      }
    } else {
      // ── Web fallback (browser) ────────────────────────────────────────────
      if (!navigator.geolocation) {
        setState(s => ({ ...s, error: 'GPS no disponible en este navegador' }));
        return;
      }
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          processPoint({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ele: pos.coords.altitude ?? undefined,
            time: new Date(pos.timestamp).toISOString(),
            accuracy: pos.coords.accuracy ?? undefined,
          });
        },
        (err) => setState(s => ({ ...s, error: err.message })),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    }
  };

  const start = useCallback(async () => {
    setState(s => ({ ...s, status: 'running', error: null }));
    startTimer();
    await startGpsWatch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = useCallback(async () => {
    clearTimer();
    await clearWatch();
    if (isNative) Haptics.impact({ style: ImpactStyle.Medium });
    setState(s => ({ ...s, status: 'paused' }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resume = useCallback(async () => {
    setState(s => ({ ...s, status: 'running' }));
    startTimer();
    await startGpsWatch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(async () => {
    clearTimer();
    await clearWatch();
    if (isNative) Haptics.impact({ style: ImpactStyle.Heavy });
    setState(s => ({ ...s, status: 'finished' }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    lastPointRef.current = null;
    lastAltitudeRef.current = null;
    recentDistRef.current = [];
    setState({
      status: 'idle', elapsed: 0, distanceKm: 0,
      paceMinKm: null, currentPaceMinKm: null,
      fcActual: null, track: [], error: null,
      elevationGainM: 0, currentAltitudeM: null,
    });
  }, []);

  const getGpx = useCallback(
    (name: string) => buildGpx(state.track, name),
    [state.track],
  );

  useEffect(() => () => {
    clearTimer();
    clearWatch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
