// JTZ Trail isotype — a clean two-peak mountain with a subtle summit trail.
// Uses currentColor so it inherits the surrounding text color (white on the
// brand gradient tile). Replaces the old generic lightning-bolt logo.
export default function BrandMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {/* Mountain silhouette (two peaks) */}
      <path d="M2 20 L8.4 8.2 L11.6 13 L15 5.6 L22 20 Z" fill="currentColor" />
      {/* Snow notch on the main peak, punched out via the tile color */}
      <path d="M13.4 9 L15 5.6 L16.7 9 L15.4 8.1 L14.2 9.2 Z" fill="currentColor" fillOpacity="0.35" />
    </svg>
  );
}
