/**
 * Calculs purs pour les graphiques (testés séparément du dessin).
 */

/** Arrondit vers le haut à une valeur "ronde" (1, 2, 2.5, 3, 4, 5, 10 × 10^n). */
export function niceCeil(value: number): number {
  if (value <= 0) return 0;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const steps = [1, 2, 2.5, 3, 4, 5, 10];
  const nice = steps.find((s) => fraction <= s) ?? 10;
  return nice * base;
}

/** Graduations régulières de 0 au maximum arrondi. */
export function yTicks(maxValue: number, count = 4): number[] {
  const top = niceCeil(maxValue / count) * count || count;
  const step = top / count;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

export type Point = { x: number; y: number };

/** Courbe lissée passant par tous les points (Catmull-Rom → Bézier). */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  if (points.length === 1) return `M${first.x},${first.y}`;

  let d = `M${first.x},${first.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    const c1 = { x: p1.x + (p2.x - p0.x) * t, y: p1.y + (p2.y - p0.y) * t };
    const c2 = { x: p2.x - (p3.x - p1.x) * t, y: p2.y - (p3.y - p1.y) * t };
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
  }
  return d;
}

/** Parts en pourcentage, arrondies pour que leur somme fasse exactement 100. */
export function percentages(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const floored = raw.map(Math.floor);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i]! += 1;
    remainder -= 1;
  }
  return floored;
}
