import { useEffect, useRef, memo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPoint { lat: number; lng: number; accuracy?: number }

interface Props {
  track: MapPoint[];
  referenceRoute?: MapPoint[];
  currentPos?: MapPoint;
  className?: string;
}

const LiveTrackingMap = memo(function LiveTrackingMap({
  track, referenceRoute, currentPos, className = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const trackLayerRef = useRef<L.Polyline | null>(null);
  const posMarkerRef = useRef<L.CircleMarker | null>(null);
  const accCircleRef = useRef<L.Circle | null>(null);
  const autoFollowRef = useRef(true);

  // Init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const startCenter: L.LatLngTuple =
      referenceRoute && referenceRoute.length > 0
        ? [referenceRoute[0].lat, referenceRoute[0].lng]
        : currentPos
          ? [currentPos.lat, currentPos.lng]
          : [19.43, -99.13];

    const map = L.map(containerRef.current, {
      center: startCenter,
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Reference route — blue dashed
    if (referenceRoute && referenceRoute.length >= 2) {
      const refPoly = L.polyline(
        referenceRoute.map(p => [p.lat, p.lng] as L.LatLngTuple),
        { color: '#60a5fa', weight: 4, opacity: 0.65, dashArray: '10 8' },
      ).addTo(map);

      // Start / end markers on reference route
      L.circleMarker([referenceRoute[0].lat, referenceRoute[0].lng],
        { radius: 7, color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1 },
      ).addTo(map).bindTooltip('Inicio de ruta', { permanent: false });

      const last = referenceRoute[referenceRoute.length - 1];
      L.circleMarker([last.lat, last.lng],
        { radius: 7, color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 },
      ).addTo(map).bindTooltip('Fin de ruta', { permanent: false });

      map.fitBounds(refPoly.getBounds(), { padding: [48, 48] });
    }

    // Live track — green
    trackLayerRef.current = L.polyline([], {
      color: '#22c55e', weight: 4, opacity: 0.9,
    }).addTo(map);

    // Current position marker
    posMarkerRef.current = L.circleMarker(startCenter, {
      radius: 9, color: '#fff', weight: 3,
      fillColor: '#3b82f6', fillOpacity: 1,
      interactive: false,
    }).addTo(map);

    // Accuracy circle
    accCircleRef.current = L.circle(startCenter, {
      radius: 15, color: '#3b82f6', weight: 1,
      fillColor: '#3b82f6', fillOpacity: 0.08,
      interactive: false,
    }).addTo(map);

    // Stop auto-follow when user drags the map
    map.on('dragstart', () => { autoFollowRef.current = false; });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update live track
  useEffect(() => {
    if (!trackLayerRef.current || track.length < 2) return;
    trackLayerRef.current.setLatLngs(track.map(p => [p.lat, p.lng] as L.LatLngTuple));
  }, [track]);

  // Update current position
  useEffect(() => {
    if (!currentPos || !mapRef.current) return;
    const ll = L.latLng(currentPos.lat, currentPos.lng);
    posMarkerRef.current?.setLatLng(ll);
    accCircleRef.current?.setLatLng(ll).setRadius(currentPos.accuracy ?? 15);
    if (autoFollowRef.current) {
      mapRef.current.panTo(ll, { animate: true, duration: 0.8 });
    }
  }, [currentPos]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
    />
  );
});

export default LiveTrackingMap;
