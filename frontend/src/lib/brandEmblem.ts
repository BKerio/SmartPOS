/*
 * The Better Forks emblem (chef's hat in front of a whisk, knife, spatula and rolling pin, with the name
 * on a ribbon) as a standalone SVG string, for places that need an image rather than a React component:
 * PDF receipts. Same drawing as BrandEmblem in components/layout/BrandMark.tsx — keep the two in sync.
 */
export function brandEmblemSvg({ ink = "#111827", paper = "#FFFFFF", stroke = 4.6 } = {}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 6 216 128" width="1080" height="640"
  fill="none" stroke="${ink}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
  <g transform="rotate(-32 48 92)">
    <path d="M48 30c-11 0-15 18-15 30s6 20 15 20 15-8 15-20-4-30-15-30Z"/>
    <path d="M48 30c-5 0-7 18-7 30s3 20 7 20 7-8 7-20-2-30-7-30Z"/>
    <path d="M48 30v50"/><rect x="43" y="80" width="10" height="34" rx="4"/>
  </g>
  <g transform="rotate(-14 78 96)">
    <path d="M70 22c10 4 16 20 16 44v18H70Z"/><path d="M70 84h16"/><rect x="70" y="86" width="16" height="34" rx="4"/>
  </g>
  <g transform="rotate(22 150 96)">
    <rect x="138" y="20" width="24" height="34" rx="6"/><path d="M144.5 27v20M150 27v20M155.5 27v20"/>
    <path d="M150 54v40"/><rect x="145" y="92" width="10" height="26" rx="4"/>
  </g>
  <g transform="rotate(36 178 88)">
    <rect x="169" y="46" width="18" height="58" rx="7"/><path d="M178 46V34M178 104v12"/>
    <circle cx="178" cy="30" r="3.6"/><circle cx="178" cy="120" r="3.6"/>
  </g>
  <path fill="${paper}" d="M84 92V66c-12-2-18-12-16-22 2-12 14-18 24-14 4-12 14-18 22-18s18 6 22 18c10-4 22 2 24 14 2 10-4 20-16 22v26Z"/>
  <path d="M84 80h56"/><path d="M100 66l-2-14M124 66l2-14M112 66V54"/>
  <g fill="${paper}">
    <path d="M36 104 14 108l10 9-10 11 30-3Z"/><path d="M184 104l22 4-10 9 10 11-30-3Z"/>
    <path d="M30 98c52-12 108-12 160 0v28c-52-12-108-12-160 0Z"/>
  </g>
  <path id="r" d="M40 117c46-10 94-10 140 0" stroke="none"/>
  <text font-family="Arial, Helvetica, sans-serif" font-size="13.5" font-weight="700" letter-spacing="2.4" fill="${ink}" stroke="none" text-anchor="middle">
    <textPath href="#r" startOffset="50%">BETTER FORKS</textPath>
  </text>
</svg>`;
}

let cached: Promise<string | null> | null = null;

/** The emblem rendered to a high-resolution PNG data URL (cached). Resolves null if the browser can't. */
export function brandEmblemPng(): Promise<string | null> {
  if (!cached) {
    cached = new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 1080;
          canvas.height = 640;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => resolve(null);
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brandEmblemSvg())}`;
      } catch {
        resolve(null);
      }
    });
  }
  return cached;
}
