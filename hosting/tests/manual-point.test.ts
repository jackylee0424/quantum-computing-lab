import { describe, expect, it } from "vitest";

import { parseManualPointInput } from "../lib/manual-point";

describe("parseManualPointInput", () => {
  it("requires full-string integers within field bounds", () => {
    expect(parseManualPointInput({ qXInput: "12abc", qYInput: "14", p: 31 })).toEqual({
      error: 'Q.x must be an integer in the range 0 <= x < p.',
      point: null,
    });

    expect(parseManualPointInput({ qXInput: "-1", qYInput: "14", p: 31 })).toEqual({
      error: 'Q.x must be an integer in the range 0 <= x < p.',
      point: null,
    });

    expect(parseManualPointInput({ qXInput: "30", qYInput: "16", p: 31 })).toEqual({
      error: null,
      point: { inf: false, x: 30, y: 16 },
    });
  });
});
