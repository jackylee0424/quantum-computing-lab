import { describe, expect, it } from "vitest";

import { calculateCurvePoints, countCurveOrder, isOnCurve } from "../lib/ecc";

describe("calculateCurvePoints", () => {
  it("returns only valid points for primes congruent to 1 mod 4", () => {
    const p = 509;
    const points = calculateCurvePoints(p);

    expect(points.length).toBe(countCurveOrder(p) - 1);
    for (const point of points) {
      expect(isOnCurve(point, p)).toBe(true);
    }
  });
});
