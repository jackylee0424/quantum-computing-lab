import { gcd, mod, modInv } from "@/lib/ecc";

export function solveLinearCongruence(a: number, b: number, m: number): number[] {
  const lhs = mod(a, m);
  const rhs = mod(b, m);
  const divisor = gcd(lhs, m);
  if (rhs % divisor !== 0) return [];

  const a1 = lhs / divisor;
  const b1 = rhs / divisor;
  const m1 = m / divisor;
  const inv = modInv(a1, m1);
  if (inv === null) return [];

  const x0 = mod(inv * b1, m1);
  const solutions: number[] = [];
  for (let t = 0; t < divisor; t++) solutions.push(x0 + t * m1);
  return solutions;
}

export function parseMeasurementOutcomeBits(bits: string, tA: number, tB: number): { a: number; b: number } | null {
  const value = bits.trim();
  if (value.length !== tA + tB) return null;
  const a = Number.parseInt(value.slice(0, tA), 2);
  const b = Number.parseInt(value.slice(tA), 2);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b };
}

export function estimateKsFromMeasurement(bits: string, opts: { n: number; tA: number; tB: number }): number[] {
  const parsed = parseMeasurementOutcomeBits(bits, opts.tA, opts.tB);
  if (!parsed) return [];

  const powA = 2 ** opts.tA;
  const powB = 2 ** opts.tB;
  const u = mod(Math.round((parsed.a * opts.n) / powA), opts.n);
  const v = mod(Math.round((parsed.b * opts.n) / powB), opts.n);
  return solveLinearCongruence(v, u, opts.n);
}
