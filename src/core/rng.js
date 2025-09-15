/**
 * Tiny seeded RNG so our background/particles are deterministic per session.
 */
export function makeRng(seed = 123456789) {
  let s = seed >>> 0;
  return function rand() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}