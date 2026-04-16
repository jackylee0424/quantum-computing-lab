import { describe, expect, it } from "vitest";

import { buildPredefinedCurves, getInitialCurveSelectionState } from "../lib/curves";

describe("getInitialCurveSelectionState", () => {
  it("prepopulates the ECC page with a selectable default curve", () => {
    const curves = buildPredefinedCurves();
    const state = getInitialCurveSelectionState(curves);

    expect(curves.length).toBeGreaterThan(0);
    expect(state.selected).toEqual(curves[0]);
    expect(state.orderSelect).toBe(String(curves[0].n));
    expect(state.showKeyArea).toBe(true);
    expect(state.visualizationGenerator).toEqual(curves[0].G);
    expect(state.visualizationOrder).toBe(curves[0].n);
    expect(state.status).toMatch(/ready|select/i);
    expect(state.selectedInfo).toContain(`n=${curves[0].n}`);
  });
});
