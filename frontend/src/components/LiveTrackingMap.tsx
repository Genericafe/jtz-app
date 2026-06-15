import { useEffect, useRef, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapPoint { lat: number; lng: number; accuracy?: number }

interface Props {
  track: MapPoint[];
  referenceRoute?: MapPoint[];
  currentPos?: MapPoint;
  className?: string;
}

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`;

const lineFeature = (points: MapPoint[]) => ({
  type: 'Feature' as const,
  geometry: { type: 'LineString' as const, coordinates: points.map(p => [p.lng, p.lat]) },
  properties: {},
});

const emptyLine = () => ({
  type: 'Feature' as const,
  geometry: { type: 'LineString' as const, coordinates: [] as number[][] },
  properties: {},
});

const pointFeature = (p: MapPoint) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
  properties: {},
});

const LiveTrackingMap = memo(function LiveTrackingMap({
  track, referenceRoute, currentPos, className = '',
}: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<maplibregl.Map | null>(null);
  const autoFollowRef = useRef(true);
  const readyRef      = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const startCenter: [number, number] =
      referenceRoute && referenceRoute.length > 0
        ? [referenceRoute[0].lng, referenceRoute[0].lat]
        : currentPos
          ? [currentPos.lng, currentPos.lat]
          : [-99.133, 19.432];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: startCenter,
      zoom: 15,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.on('dragstart', () => { autoFollowRef.current = false; });

    // Center on real position if no reference route and no current pos yet
    if (!referenceRoute?.length && !currentPos && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mapRef.current) return;
          mapRef.current.setCenter([pos.coords.longitude, pos.coords.latitude]);
          mapRef.current.setZoom(15);
        },
        () => {},
        { timeout: 8000, maximumAge: 60000 },
      );
    }

    map.on('load', () => {
      readyRef.current = true;

      // Reference route
      map.addSource('ref-route', {
        type: 'geojson',
        data: (referenceRoute && referenceRoute.length >= 2 ? lineFeature(referenceRoute) : emptyLine()) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
      map.addLayer({
        id: 'ref-route-casing',
        type: 'line',
        source: 'ref-route',
        paint: { 'line-color': '#1e3a5f', 'line-width': 8, 'line-opacity': 0.6 },
      });
      map.addLayer({
        id: 'ref-route-line',
        type: 'line',
        source: 'ref-route',
        paint: { 'line-color': '#60a5fa', 'line-width': 4, 'line-opacity': 0.85, 'line-dasharray': [2, 2] },
      });

      if (referenceRoute && referenceRoute.length >= 2) {
        new maplibregl.Marker({ color: '#22c55e' })
          .setLngLat([referenceRoute[0].lng, referenceRoute[0].lat]).addTo(map);
        const last = referenceRoute[referenceRoute.length - 1];
        new maplibregl.Marker({ color: '#ef4444' })
          .setLngLat([last.lng, last.lat]).addTo(map);

        const bounds = referenceRoute.reduce(
          (b, p) => b.extend([p.lng, p.lat] as [number, number]),
          new maplibregl.LngLatBounds(
            [referenceRoute[0].lng, referenceRoute[0].lat],
            [referenceRoute[0].lng, referenceRoute[0].lat],
          ),
        );
        map.fitBounds(bounds, { padding: 60, maxZoom: 17 });
      }

      // Live track
      map.addSource('live-track', {
        type: 'geojson',
        data: (track.length >= 2 ? lineFeature(track) : emptyLine()) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
      map.addLayer({
        id: 'live-track-casing',
        type: 'line',
        source: 'live-track',
        paint: { 'line-color': '#052e16', 'line-width': 8, 'line-opacity': 0.5 },
      });
      map.addLayer({
        id: 'live-track-line',
        type: 'line',
        source: 'live-track',
        paint: { 'line-color': '#22c55e', 'line-width': 4, 'line-opacity': 0.95 },
      });

      // Current position dot
      const initPos = currentPos ?? (track.length > 0 ? track[track.length - 1] : null);
      map.addSource('current-pos', {
        type: 'geojson',
        data: (initPos ? pointFeature(initPos) : {
          type: 'Feature', geometry: { type: 'Point', coordinates: startCenter }, properties: {},
        }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
      map.addLayer({
        id: 'pos-glow',
        type: 'circle',
        source: 'current-pos',
        paint: { 'circle-radius': 18, 'circle-color': '#3b82f6', 'circle-opacity': 0.15 },
      });
      map.addLayer({
        id: 'pos-dot',
        type: 'circle',
        source: 'current-pos',
        paint: {
          'circle-radius': 9,
          'circle-color': '#3b82f6',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });
    });

    mapRef.current = map;
    return () => {
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update live track
  useEffect(() => {
    if (!readyRef.current || !mapRef.current || track.length < 2) return;
    (mapRef.current.getSource('live-track') as maplibregl.GeoJSONSource | undefined)
      ?.setData(lineFeature(track) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  }, [track]);

  // Update current position
  useEffect(() => {
    if (!currentPos || !mapRef.current || !readyRef.current) return;
    (mapRef.current.getSource('current-pos') as maplibregl.GeoJSONSource | undefined)
      ?.setData(pointFeature(currentPos) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (autoFollowRef.current) {
      mapRef.current.panTo([currentPos.lng, currentPos.lat], { duration: 800 });
    }
  }, [currentPos]);

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
  );
});

export default LiveTrackingMap;
