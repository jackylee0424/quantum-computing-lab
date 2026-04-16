import { describe, expect, it } from "vitest";

import { normalizeMeasurementCounts } from "../lib/measurement";

describe("normalizeMeasurementCounts", () => {
  it("merges duplicate outcomes that normalize to the same trimmed bitstring", () => {
    expect(
      normalizeMeasurementCounts(
        {
          " 1010": 2,
          "1010 ": 3,
          "0101": 1,
        },
        { expectedBitLength: 4 },
      ),
    ).toEqual([
      ["1010", 5],
      ["0101", 1],
    ]);
  });
});
