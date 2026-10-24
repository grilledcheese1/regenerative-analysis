// Seeded RNG helpers. Same seed gives identical output.
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const r = (x, d = 3) => Number(x.toFixed(d));
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function makeRng(seed) {
  let a = seed | 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const uni = (lo, hi) => lo + (hi - lo) * next();
  const int = (lo, hi) => Math.floor(uni(lo, hi + 1));
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const chance = (p) => next() < p;
  const normal = (m, sd) => {
    const u = 1 - next(), v = next();
    return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { next, uni, int, pick, chance, normal };
}
