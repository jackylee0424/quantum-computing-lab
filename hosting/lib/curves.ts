import type { CurvePoint } from "@/lib/ecc";

type CurveCandidate = {
  base_point: [number, number];
  order: number;
  p: number;
  curve_size?: number;
  field?: string;
};

export type PredefinedCurve = {
  n: number;
  p: number;
  order: number;
  h: number;
  G: CurvePoint;
  field?: string;
};

const CURVE_CANDIDATES_BY_ORDER: Record<string, CurveCandidate[]> = {
  "21": [{ base_point: [1, 16], order: 21, p: 31, field: "mersenne" }],
  "63": [{ base_point: [145, 194], order: 63, p: 251 }],
  "127": [{ base_point: [1, 32], order: 127, p: 127, field: "mersenne" }],
  "255": [{ base_point: [165, 35], order: 255, p: 509 }],
  "511": [{ base_point: [730, 415], order: 511, p: 1567 }],
  "1023": [{ base_point: [698, 1568], order: 1023, p: 4091 }],
  "2047": [{ base_point: [3170, 10848], order: 2047, p: 12281 }],
  "4095": [{ base_point: [35218, 17097], order: 4095, p: 40949 }],
  "8011": [{ base_point: [1, 256], order: 8011, p: 8191, field: "mersenne" }],
  "16383": [{ base_point: [59274, 10901], order: 16383, p: 65239 }],
  "32767": [{ base_point: [94333, 113222], order: 32767, p: 131779 }],
  "65535": [{ base_point: [116665, 37319], order: 65535, p: 262139 }],
  "130719": [{ base_point: [3, 107193], order: 130719, p: 131071, field: "mersenne" }],
  "262143": [{ base_point: [1026048, 667569], order: 262143, p: 1048571 }],
  "522847": [{ base_point: [1, 2048], order: 522847, p: 524287, field: "mersenne" }],
  "1048575": [{ base_point: [4530570, 6223415], order: 1048575, p: 6291449 }],
  "2147444533": [{ base_point: [1, 131072], order: 2147444533, p: 2147483647, field: "mersenne" }],
};

function bitLength(n: number): number {
  let bits = 0;
  while (n > 0) {
    bits++;
    n >>>= 1;
  }
  return Math.max(bits, 1);
}

function normalizeCurveCandidate(candidate: CurveCandidate, nKey: string): PredefinedCurve | null {
  const n = Number(candidate.order ?? nKey);
  const p = Number(candidate.p);
  const curveOrder = Number(candidate.curve_size ?? candidate.order ?? n);
  const [gx, gy] = candidate.base_point ?? [NaN, NaN];
  const h = Number.isFinite(curveOrder) && Number.isFinite(n) && n > 0 ? Math.floor(curveOrder / n) : 1;

  if (!Number.isFinite(n) || n <= 1) return null;
  if (!Number.isFinite(p) || p <= 2) return null;
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;

  return { n, p, order: curveOrder, h, G: { x: gx, y: gy }, field: candidate.field };
}

export function buildPredefinedCurves(): PredefinedCurve[] {
  const curves: PredefinedCurve[] = [];
  const seen = new Set<string>();

  for (const [nKey, candidates] of Object.entries(CURVE_CANDIDATES_BY_ORDER)) {
    for (const candidate of candidates) {
      const curve = normalizeCurveCandidate(candidate, nKey);
      if (!curve) continue;
      const key = `${curve.n}|${curve.p}|${curve.G.x}|${curve.G.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      curves.push(curve);
    }
  }

  curves.sort((a, b) => a.n - b.n || a.p - b.p);
  return curves;
}

export function optionLabelForCurve(curve: PredefinedCurve): string {
  const kBits = bitLength((curve.n - 1) >>> 0);
  return `${kBits}-bit k, n=${curve.n}, y²=x³+7 mod ${curve.p}`;
}

export function quantumEstimates(n: number) {
  const s = bitLength(n);
  const sqrtN = Math.ceil(Math.sqrt(n));
  const n13 = Math.ceil(Math.pow(n, 1 / 3));

  return {
    s,
    classical: {
      bruteOps: n,
      bsgsOps: 2 * sqrtN,
      pollardOps: sqrtN,
    },
    quantum: {
      groverBruteOps: sqrtN,
      collisionOps_n13: n13,
    },
  };
}

export function shorEstimates({ n, p }: { n: number; p: number }) {
  const s = bitLength(n);
  const lp = bitLength(p);

  return {
    s,
    lp,
    logicalQubits: 2 * s + 8 * lp + 20,
    toffoli: Math.round(40 * s * Math.pow(lp, 3)),
    tDepth: Math.round(12 * s * Math.pow(lp, 2)),
  };
}

export function controlQubitBoundsForP(p: number): { min: number; max: number } {
  if (p === 31) return { min: 3, max: 5 };
  if (p === 127) return { min: 3, max: 7 };
  return { min: 3, max: 10 };
}

export function recommendedControlQubitsForOrder(order: number): number {
  if (!Number.isFinite(order) || order <= 1) return 3;
  return Math.max(3, Math.ceil(Math.log2(order)) + 1);
}
