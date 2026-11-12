import type { CSSProperties } from 'react';

const SPOKES = 8;

// One brand colour per spoke, clockwise from the top (tokens in index.css).
const SPOKE_COLORS = [
  'var(--green-bright)',
  'var(--cyan)',
  'var(--teal)',
  'var(--gold)',
  'var(--amber)',
  'var(--red)',
  'var(--pink)',
  'var(--violet)',
];

// Spokes from 40% to 95% of the radius, stroke 24% of the radius, lead spoke
// at full strength fading to 20%. The whole glyph steps round via CSS
// (.app-loader), so each colour sweeps through every position in turn.
const spokes = Array.from({ length: SPOKES }, (_, i) => {
  const angle = (2 * Math.PI * i) / SPOKES - Math.PI / 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const behind = (SPOKES - i) % SPOKES;
  return {
    x1: dx * 20,
    y1: dy * 20,
    x2: dx * 47.5,
    y2: dy * 47.5,
    opacity: 1 - behind * (0.8 / (SPOKES - 1)),
    color: SPOKE_COLORS[i],
  };
});

interface AppLoaderProps {
  size?: number;
  /** Paints every spoke one colour instead of the brand palette (e.g. on a coloured button). */
  color?: string;
  /** Announced to screen readers; omit when the loader sits beside visible text. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

function AppLoader({ size = 18, color, label, className, style }: AppLoaderProps) {
  return (
    <svg
      className={className ? `app-loader ${className}` : 'app-loader'}
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      overflow="visible"
      style={style}
      {...(label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {spokes.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          // CSS vars don't resolve in presentation attributes, so stroke goes in style.
          style={{ stroke: color ?? s.color }}
          strokeWidth={12}
          strokeLinecap="round"
          opacity={s.opacity}
        />
      ))}
    </svg>
  );
}

export default AppLoader;
