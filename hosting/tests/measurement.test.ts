import { describe, expect, it } from "vitest";

import { normalizeMeasurementCounts, parseMeasurementOutcomeBits } from "../lib/measurement";

describe("parseMeasurementOutcomeBits", () => {
  it("rejects non-binary measurement strings", () => {
    expect(parseMeasurementOutcomeBits("10x1", 2, 2)).toBeNull();
    expect(parseMeasurementOutcomeBits("1112", 2, 2)).toBeNull();
  });
});

describe("normalizeMeasurementCounts", () => {
  it("rejects malformed measurement keys and non-integer counts", () => {
    expect(() => normalizeMeasurementCounts({ "10x1": 2 }, { expectedBitLength: 4 })).toThrow(/binary/i);
    expect(() => normalizeMeasurementCounts({ "1010": 1.5 }, { expectedBitLength: 4 })).toThrow(/integer/i);
  });
});
