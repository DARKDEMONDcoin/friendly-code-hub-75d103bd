/**
 * Deterministic Tailwind gradient classname for an integration's letter
 * fallback tile, hashed from the integration id so the same app always
 * gets the same color across renders and sessions.
 */
const PALETTES = [
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-blue-500",
  "from-lime-500 to-emerald-500",
  "from-purple-500 to-indigo-500",
];

export function integrationGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}
