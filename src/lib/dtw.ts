export type Pt = { x: number; y: number };

/** Ré-échantillonne une polyligne en n points équidistants. */
export function resample(points: Pt[], n = 32): Pt[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => points[0]!);
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
    segs.push(d);
    total += d;
  }
  if (total === 0) return Array.from({ length: n }, () => points[0]!);
  const step = total / (n - 1);
  const out: Pt[] = [points[0]!];
  let acc = 0;
  let idx = 1;
  let target = step;
  while (out.length < n && idx < points.length) {
    const seg = segs[idx - 1]!;
    if (acc + seg >= target && seg > 0) {
      const t = (target - acc) / seg;
      out.push({
        x: points[idx - 1]!.x + t * (points[idx]!.x - points[idx - 1]!.x),
        y: points[idx - 1]!.y + t * (points[idx]!.y - points[idx - 1]!.y),
      });
      target += step;
    } else {
      acc += seg;
      idx++;
    }
  }
  while (out.length < n) out.push(points[points.length - 1]!);
  return out;
}

/** Distance DTW moyenne entre deux polylignes (mêmes unités que les points). */
export function dtw(a: Pt[], b: Pt[]): number {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return Infinity;
  let prev = new Float64Array(m).fill(Infinity);
  let cur = new Float64Array(m).fill(Infinity);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const cost = Math.hypot(a[i]!.x - b[j]!.x, a[i]!.y - b[j]!.y);
      const best =
        i === 0 && j === 0
          ? 0
          : Math.min(
              i > 0 ? prev[j]! : Infinity,
              j > 0 ? cur[j - 1]! : Infinity,
              i > 0 && j > 0 ? prev[j - 1]! : Infinity,
            );
      cur[j] = cost + best;
    }
    prev = cur;
    cur = new Float64Array(m).fill(Infinity);
  }
  return prev[m - 1]! / (n + m);
}

/** Distance de Fréchet discrète (itérative). */
export function frechet(a: Pt[], b: Pt[]): number {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return Infinity;
  const d = new Float64Array(n * m).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const cost = Math.hypot(a[i]!.x - b[j]!.x, a[i]!.y - b[j]!.y);
      let val: number;
      if (i === 0 && j === 0) val = cost;
      else if (i === 0) val = Math.max(d[j - 1]!, cost);
      else if (j === 0) val = Math.max(d[(i - 1) * m]!, cost);
      else
        val = Math.max(
          Math.min(d[(i - 1) * m + j]!, d[i * m + j - 1]!, d[(i - 1) * m + j - 1]!),
          cost,
        );
      d[i * m + j] = val;
    }
  }
  return d[n * m - 1]!;
}

/**
 * Score de ressemblance 0..1 entre un tracé utilisateur et un tracé de référence,
 * en tenant compte du sens du tracé (DTW) et de l'écart maximal (Fréchet).
 */
export function strokeScore(user: Pt[], ref: Pt[]): number {
  const a = resample(user, 32);
  const b = resample(ref, 32);
  const dt = dtw(a, b); // unités viewBox (109)
  const fr = frechet(a, b);
  const sd = Math.max(0, 1 - dt / 14);
  const sf = Math.max(0, 1 - fr / 32);
  return Math.max(0, Math.min(1, 0.6 * sd + 0.4 * sf));
}
