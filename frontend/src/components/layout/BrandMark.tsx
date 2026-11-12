import { useId } from "react";

/*
 * Better Forks brand art, drawn as line work in `currentColor`.
 *
 * - BrandEmblem: chef's hat in front of a whisk, knife, spatula and rolling pin, with the name on a
 *   ribbon. Used in the expanded sidebar. Shapes that must hide the lines behind them (hat, ribbon)
 *   are filled with `--bm-bg`, so set that to the background the emblem sits on.
 * - BrandMark: the chef's hat on its own, for small places (collapsed sidebar). public/favicon.svg
 *   uses the same hat paths on a navy tile — keep them in sync.
 */

export function BrandEmblem({ className, title = "Better Forks Restaurant" }: { className?: string; title?: string }) {
  const curve = `bm-curve-${useId().replace(/:/g, "")}`;
  return (
    <svg
      className={className}
      viewBox="2 6 216 128"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title}
    >
      {/* whisk */}
      <g transform="rotate(-32 48 92)">
        <path d="M48 30c-11 0-15 18-15 30s6 20 15 20 15-8 15-20-4-30-15-30Z" />
        <path d="M48 30c-5 0-7 18-7 30s3 20 7 20 7-8 7-20-2-30-7-30Z" />
        <path d="M48 30v50" />
        <rect x="43" y="80" width="10" height="34" rx="4" />
      </g>
      {/* knife */}
      <g transform="rotate(-14 78 96)">
        <path d="M70 22c10 4 16 20 16 44v18H70Z" />
        <path d="M70 84h16" />
        <rect x="70" y="86" width="16" height="34" rx="4" />
      </g>
      {/* spatula */}
      <g transform="rotate(22 150 96)">
        <rect x="138" y="20" width="24" height="34" rx="6" />
        <path d="M144.5 27v20M150 27v20M155.5 27v20" />
        <path d="M150 54v40" />
        <rect x="145" y="92" width="10" height="26" rx="4" />
      </g>
      {/* rolling pin */}
      <g transform="rotate(36 178 88)">
        <rect x="169" y="46" width="18" height="58" rx="7" />
        <path d="M178 46V34M178 104v12" />
        <circle cx="178" cy="30" r="3.6" />
        <circle cx="178" cy="120" r="3.6" />
      </g>
      {/* chef's hat, filled so it sits in front of the tools */}
      <path
        style={{ fill: "var(--bm-bg, #0A1B2E)" }}
        d="M84 92V66c-12-2-18-12-16-22 2-12 14-18 24-14 4-12 14-18 22-18s18 6 22 18c10-4 22 2 24 14 2 10-4 20-16 22v26Z"
      />
      <path d="M84 80h56" />
      <path d="M100 66l-2-14M124 66l2-14M112 66V54" />
      {/* ribbon */}
      <g style={{ fill: "var(--bm-bg, #0A1B2E)" }}>
        <path d="M36 104 14 108l10 9-10 11 30-3Z" />
        <path d="M184 104l22 4-10 9 10 11-30-3Z" />
        <path d="M30 98c52-12 108-12 160 0v28c-52-12-108-12-160 0Z" />
      </g>
      <path id={curve} d="M40 117c46-10 94-10 140 0" stroke="none" />
      <text fontFamily="inherit" fontSize={13} fontWeight={800} letterSpacing={2.5} fill="currentColor" stroke="none" textAnchor="middle" aria-hidden="true">
        <textPath href={`#${curve}`} startOffset="50%">BETTER FORKS</textPath>
      </text>
    </svg>
  );
}

function BrandMark({ size = 32, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={4.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d="M18 55V41C10 39 6 32 8 25c2-7 9-10 15-7.5C25 11.5 28.5 9 32 9s7 2.5 9 8.5c6-2.5 13 .5 15 7.5 2 7-2 14-10 16v14Z" />
      <path d="M18 47h28" />
      <path d="M25 41l-.8-7M39 41l.8-7M32 41v-7" />
    </svg>
  );
}

export default BrandMark;
