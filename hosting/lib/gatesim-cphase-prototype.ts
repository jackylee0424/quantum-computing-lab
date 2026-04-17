export const CPHASE_PROTOTYPE_MERMAID = String.raw`flowchart LR
  subgraph control[Control lane in the gold /gatesim circuit]
    q0["q0: |0⟩"] --> h1["H"] --> cu["CU = CPHASE(λ)"] --> pg["P(φ)"] --> h2["H"] --> mq0["Measure q0"]
  end

  subgraph target[Target / eigenstate lane]
    q1["q1: |ψ⟩ / eigenstate lane"] --> cu --> mq1["Measure q1"]
  end

  cu -. conditional phase .-> kick["phase kickback onto q0"]
  kick -. prototype lens .-> evo["H-CU-H prototype for quantum algorithms evolution"]
`;

export const CPHASE_PROTOTYPE_NOTES = [
  "This gold /gatesim CPHASE circuit is the prototype H-CU-H motif: prepare a control lane in superposition, apply a controlled unitary, then interfere with a final Hadamard.",
  "In the Cleve 1998 phase kickback framing, the target lane supplies the eigenstate or oracle context while the measurable phase information is kicked back onto q0.",
  "That makes the diagram a compact bridge from a visual CPHASE demo to the evolution of quantum algorithms built from phase kickback, interference, and readout.",
];