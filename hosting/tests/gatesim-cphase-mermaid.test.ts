import { describe, expect, it } from "vitest";

import { CPHASE_PROTOTYPE_MERMAID, CPHASE_PROTOTYPE_NOTES } from "../lib/gatesim-cphase-prototype";

describe("CPHASE prototype mermaid diagram", () => {
  it("describes the H-CU-H phase-kickback prototype for /gatesim", () => {
    expect(CPHASE_PROTOTYPE_MERMAID).toContain("flowchart LR");
    expect(CPHASE_PROTOTYPE_MERMAID).toContain("q0[\"q0: |0⟩\"]");
    expect(CPHASE_PROTOTYPE_MERMAID).toContain("h1[\"H\"]");
    expect(CPHASE_PROTOTYPE_MERMAID).toContain("cu[\"CU = CPHASE(λ)\"]");
    expect(CPHASE_PROTOTYPE_MERMAID).toContain("h2[\"H\"]");
    expect(CPHASE_PROTOTYPE_MERMAID).toContain("q1[\"q1: |ψ⟩ / eigenstate lane\"]");
  });

  it("captures the Cleve 1998 framing and algorithm-evolution interpretation", () => {
    expect(CPHASE_PROTOTYPE_NOTES.some((note) => note.includes("Cleve"))).toBe(true);
    expect(CPHASE_PROTOTYPE_NOTES.some((note) => note.includes("phase kickback"))).toBe(true);
    expect(CPHASE_PROTOTYPE_NOTES.some((note) => note.includes("quantum algorithms"))).toBe(true);
  });
});
