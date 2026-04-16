import type { CurvePoint } from "@/lib/ecc";

export type ManualPointParseResult = {
  point: CurvePoint | null;
  error: string | null;
};

function parseBoundedCoordinate(raw: string, axis: "x" | "y", p: number): number | null {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed >= p) return null;
  return parsed;
}

export function parseManualPointInput({ qXInput, qYInput, p }: { qXInput: string; qYInput: string; p: number }): ManualPointParseResult {
  const x = parseBoundedCoordinate(qXInput, "x", p);
  if (x === null) {
    return { point: null, error: "Q.x must be an integer in the range 0 <= x < p." };
  }

  const y = parseBoundedCoordinate(qYInput, "y", p);
  if (y === null) {
    return { point: null, error: "Q.y must be an integer in the range 0 <= y < p." };
  }

  return {
    point: { inf: false, x, y },
    error: null,
  };
}
