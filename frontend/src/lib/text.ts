/** Names are typed in mixed styles ("STEPHEN CCHCHA", "david muturi"); show ALL-CAPS / all-lower names in Title Case. */
export function displayName(name?: string | null): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "";
  if (trimmed !== trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function initials(name?: string | null): string {
  // Skip "words" like "&" or "-" so "H & A Wholesalers" gives "HA", not "H&".
  const words = (name || "").trim().split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

/** Stable soft colour pair for an avatar, picked from the design-system tints. */
const AVATAR_TONES = [
  { bg: "#E8EEFB", fg: "#1E3A8A" },
  { bg: "#E1F5F2", fg: "#0D7468" },
  { bg: "#FBF3DD", fg: "#8A6410" },
  { bg: "#F1E8FD", fg: "#6328C4" },
  { bg: "#FCE7F0", fg: "#A61E5A" },
  { bg: "#E0F4F7", fg: "#076F88" },
];
export function avatarTone(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export const kes = (n: number) => `KES ${Math.round(Number(n || 0)).toLocaleString()}`;
