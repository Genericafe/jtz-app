import { useState, useRef, useCallback, useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

// Foreground-service-backed GPS so tracking continues with the screen locked.
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

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
  headingDeg: number | null;
}

export function bearingDeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const d2r = Math.PI / 180;
  const φ1 = from.lat * d2r, φ2 = to.lat * d2r;
  const Δλ = (to.lng - from.lng) * d2r;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
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
    elevationGainM: 0, currentAltitudeM: null, headingDeg: null,
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
        await BackgroundGeolocation.removeWatcher({ id: watchIdRef.current as string });
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

  // Shared point processor for both native and web callbacks.
  // `nativeBearing` is the device compass/course heading when the platform
  // provides one (background-geolocation does); otherwise it is computed.
  const processPoint = (point: TrackPoint, nativeBearing?: number | null) => {
    setState(s => {
      if (s.status === 'paused') return s;
      const prev = lastPointRef.current;
      let addedKm = 0;
      if (prev) {
        addedKm = haversineKm(prev, point);
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

      // Heading — prefer the device's native bearing; fall back to the bearing
      // between the previous and current GPS points while moving.
      let headingDeg = s.headingDeg;
      if (nativeBearing != null && nativeBearing >= 0) {
        headingDeg = nativeBearing;
      } else if (prev && addedKm > 0.002) {
        headingDeg = bearingDeg(prev, point);
      }

      return {
        ...s,
        distanceKm: s.distanceKm + addedKm,
        track: [...s.track, point],
        elevationGainM,
        currentAltitudeM: point.ele ?? s.currentAltitudeM,
        headingDeg,
      };
    });
  };

  const startGpsWatch = async () => {
    if (isNative) {
      // ── Native background GPS (Android / iOS) ─────────────────────────────
      // Uses a foreground service so tracking continues with the screen locked.
      try {
        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: 'Grabando tu actividad. Toca para volver a la app.',
            backgroundTitle:   'JTZ Running Club',
            requestPermissions: true,
            stale: false,
            distanceFilter: 5,
          },
          (location, error) => {
            if (error) {
              if (error.code === 'NOT_AUTHORIZED') {
                setState(s => ({ ...s, error: 'Permiso de ubicación denegado. Actívalo en Configuración del dispositivo.' }));
              } else {
                setState(s => ({ ...s, error: `GPS: ${error.message}` }));
              }
              return;
            }
            if (!location) return;
            processPoint(
              {
                lat: location.latitude,
                lng: location.longitude,
                ele: location.altitude ?? undefined,
                time: new Date(location.time ?? Date.now()).toISOString(),
                accuracy: location.accuracy ?? undefined,
              },
              location.bearing,
            );
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
      elevationGainM: 0, currentAltitudeM: null, headingDeg: null,
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
