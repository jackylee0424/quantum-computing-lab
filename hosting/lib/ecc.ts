export type CurvePoint = {
  x: number;
  y: number;
  inf?: boolean;
};

export const INF_POINT: CurvePoint = { inf: true, x: 0, y: 0 };

export function mod(a: number, p: number): number {
  const r = a % p;
  return r < 0 ? r + p : r;
}

export function modAdd(a: number, b: number, p: number): number {
  const s = a + b;
  return s >= p ? s - p : s;
}

export function modSub(a: number, b: number, p: number): number {
  const d = a - b;
  return d < 0 ? d + p : d;
}

export function modMul(a: number, b: number, p: number): number {
  const left = mod(a, p);
  const right = mod(b, p);
  if (p <= 65535) return (left * right) % p;
  return Number((BigInt(left) * BigInt(right)) % BigInt(p));
}

export function modPow(a: number, e: number, p: number): number {
  let result = 1 % p;
  let x = mod(a, p);
  let n = e >>> 0;
  while (n > 0) {
    if (n & 1) result = modMul(result, x, p);
    x = modMul(x, x, p);
    n >>>= 1;
  }
  return result;
}

export function egcd(a: number, b: number): { g: number; x: number; y: number } {
  let x0 = 1;
  let y0 = 0;
  let x1 = 0;
  let y1 = 1;
  while (b !== 0) {
    const q = Math.floor(a / b);
    [a, b] = [b, a - q * b];
    [x0, x1] = [x1, x0 - q * x1];
    [y0, y1] = [y1, y0 - q * y1];
  }
  return { g: a, x: x0, y: y0 };
}

export function modInv(a: number, p: number): number | null {
  const { g, x } = egcd(mod(a, p), p);
  if (g !== 1) return null;
  return mod(x, p);
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function isOnCurve(point: CurvePoint, p: number): boolean {
  if (point.inf) return true;
  const left = modMul(point.y, point.y, p);
  const right = modAdd(modMul(modMul(point.x, point.x, p), point.x, p), 7 % p, p);
  return left === right;
}

export function pointNeg(point: CurvePoint, p: number): CurvePoint {
  if (point.inf) return INF_POINT;
  return { inf: false, x: point.x, y: point.y === 0 ? 0 : p - point.y };
}

export function pointDouble(point: CurvePoint, p: number): CurvePoint {
  if (point.inf || point.y === 0) return INF_POINT;

  const num = modMul(3, modMul(point.x, point.x, p), p);
  const den = modMul(2, point.y, p);
  const inv = modInv(den, p);
  if (inv === null) return INF_POINT;
  const lambda = modMul(num, inv, p);

  const x3 = modSub(modMul(lambda, lambda, p), modMul(2, point.x, p), p);
  const y3 = modSub(modMul(lambda, modSub(point.x, x3, p), p), point.y, p);
  return { inf: false, x: x3, y: y3 };
}

export function pointAdd(a: CurvePoint, b: CurvePoint, p: number): CurvePoint {
  if (a.inf) return b;
  if (b.inf) return a;

  if (a.x === b.x) {
    if ((a.y + b.y) % p === 0) return INF_POINT;
    return pointDouble(a, p);
  }

  const num = modSub(b.y, a.y, p);
  const den = modSub(b.x, a.x, p);
  const inv = modInv(den, p);
  if (inv === null) return INF_POINT;
  const lambda = modMul(num, inv, p);

  const x3 = modSub(modSub(modMul(lambda, lambda, p), a.x, p), b.x, p);
  const y3 = modSub(modMul(lambda, modSub(a.x, x3, p), p), a.y, p);
  return { inf: false, x: x3, y: y3 };
}

export function scalarMult(k: number, point: CurvePoint, p: number): CurvePoint {
  let n = k >>> 0;
  let result = INF_POINT;
  let addend = point;
  while (n > 0) {
    if (n & 1) result = pointAdd(result, addend, p);
    addend = pointDouble(addend, p);
    n >>>= 1;
  }
  return result;
}

export function pointKey(point: CurvePoint): string {
  return point.inf ? "INF" : `${point.x},${point.y}`;
}

export function primeFactorsUnique(n: number): number[] {
  const factors: number[] = [];
  let x = n;
  for (let d = 2; d * d <= x; d++) {
    if (x % d === 0) {
      factors.push(d);
      while (x % d === 0) x = Math.floor(x / d);
    }
  }
  if (x > 1) factors.push(x);
  return factors;
}

export function legendreSymbol(a: number, p: number): number {
  const value = mod(a, p);
  if (value === 0) return 0;
  return modPow(value, (p - 1) >>> 1, p);
}

export function sqrtModP3Mod4(a: number, p: number): number {
  if (a === 0) return 0;
  return modPow(a, (p + 1) >>> 2, p);
}

export function sqrtModPrime(a: number, p: number): number | null {
  const value = mod(a, p);
  if (value === 0) return 0;
  if (p === 2) return value;
  if (legendreSymbol(value, p) !== 1) return null;
  if (p % 4 === 3) return sqrtModP3Mod4(value, p);

  let q = p - 1;
  let s = 0;
  while ((q & 1) === 0) {
    q /= 2;
    s += 1;
  }

  let z = 2;
  while (legendreSymbol(z, p) !== p - 1) z += 1;

  let m = s;
  let c = modPow(z, q, p);
  let t = modPow(value, q, p);
  let r = modPow(value, (q + 1) / 2, p);

  while (t !== 1) {
    let i = 1;
    let t2i = modMul(t, t, p);
    while (i < m && t2i !== 1) {
      t2i = modMul(t2i, t2i, p);
      i += 1;
    }
    if (i === m) return null;

    const exponent = 2 ** (m - i - 1);
    const b = modPow(c, exponent, p);
    r = modMul(r, b, p);
    c = modMul(b, b, p);
    t = modMul(t, c, p);
    m = i;
  }

  return r;
}

export function countCurveOrder(p: number): number {
  let total = 1;
  for (let x = 0; x < p; x++) {
    const rhs = modAdd(modMul(modMul(x, x, p), x, p), 7 % p, p);
    const ls = legendreSymbol(rhs, p);
    if (ls === 0) total += 1;
    else if (ls === 1) total += 2;
  }
  return total;
}

export function calculateCurvePoints(p: number): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (let x = 0; x < p; x++) {
    const rhs = modAdd(modMul(modMul(x, x, p), x, p), 7 % p, p);
    const ls = legendreSymbol(rhs, p);
    if (ls === 0) {
      points.push({ x, y: 0 });
    } else if (ls === 1) {
      const y = sqrtModPrime(rhs, p);
      if (y === null) continue;
      points.push({ x, y });
      if (y !== 0) points.push({ x, y: p - y });
    }
  }
  return points;
}
