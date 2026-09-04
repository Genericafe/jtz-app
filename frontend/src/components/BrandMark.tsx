// JTZ Trail isotype — a clean vector take on the official hexagon badge:
// a double-outlined vertical hexagon (peaks top & bottom) with the "JTZ"
// monogram. Scalable, crisp at any size, inherits currentColor so it works
// white on the brand tile or tinted anywhere. The adjacent "JTZ / Trail"
// wordmark carries the full name; this mark echoes the badge shape.
export default function BrandMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {/* Outer hexagon shield */}
      <path d="M12 1.7 L20.5 6.65 V17.35 L12 22.3 L3.5 17.35 V6.65 Z"
        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Inner engraved line */}
      <path d="M12 4.2 L18.3 7.9 V16.1 L12 19.8 L5.7 16.1 V7.9 Z"
        fill="none" stroke="currentColor" strokeWidth="0.7" strokeOpacity="0.45" strokeLinejoin="round" />
      {/* JTZ monogram */}
      <text x="12" y="14.6" textAnchor="middle" fontFamily="'Space Grotesk', system-ui, sans-serif"
        fontWeight="700" fontSize="7.6" letterSpacing="-0.4" fill="currentColor">JTZ</text>
    </svg>
  );
}
