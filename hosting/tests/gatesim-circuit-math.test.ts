import { describe, expect, it } from "vitest";

import { computeGateSimCircuit, q1PresetState } from "../lib/gatesim-circuit";

describe("computeGateSimCircuit", () => {
  it("keeps q0 at |0⟩ with no gates enabled", () => {
    const result = computeGateSimCircuit({
      q0InitialBit: 0,
      q1State: q1PresetState("one"),
      q1CircuitVisible: true,
      gateEnabled: { h1: false, cphase: false, phase: false, h2: false },
      lambdaDeg: 180,
      phaseGateDeg: 0,
    });

    expect(result.q0Probabilities.p0).toBeCloseTo(1, 6);
    expect(result.q0Probabilities.p1).toBeCloseTo(0, 6);
  });

  it("produces phase-kickback inversion for H-CPHASE-H with q1 = |1⟩ and λ = 180°", () => {
    const result = computeGateSimCircuit({
      q0InitialBit: 0,
      q1State: q1PresetState("one"),
      q1CircuitVisible: true,
      gateEnabled: { h1: true, cphase: true, phase: false, h2: true },
      lambdaDeg: 180,
      phaseGateDeg: 0,
    });

    expect(result.q0Probabilities.p0).toBeCloseTo(0, 6);
    expect(result.q0Probabilities.p1).toBeCloseTo(1, 6);
  });

  it("bypasses CPHASE when the second qubit lane is hidden", () => {
    const result = computeGateSimCircuit({
      q0InitialBit: 0,
      q1State: q1PresetState("one"),
      q1CircuitVisible: false,
      gateEnabled: { h1: true, cphase: true, phase: false, h2: true },
      lambdaDeg: 180,
      phaseGateDeg: 0,
    });

    expect(result.q0Probabilities.p0).toBeCloseTo(1, 6);
    expect(result.q0Probabilities.p1).toBeCloseTo(0, 6);
  });

  it("applies the single-qubit phase gate on q0 before the final H", () => {
    const result = computeGateSimCircuit({
      q0InitialBit: 0,
      q1State: q1PresetState("zero"),
      q1CircuitVisible: false,
      gateEnabled: { h1: true, cphase: false, phase: true, h2: true },
      lambdaDeg: 180,
      phaseGateDeg: 180,
    });

    expect(result.q0Probabilities.p0).toBeCloseTo(0, 6);
    expect(result.q0Probabilities.p1).toBeCloseTo(1, 6);
  });
});
