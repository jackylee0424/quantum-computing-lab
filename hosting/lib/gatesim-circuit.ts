export type Complex = { re: number; im: number };
export type Q1PresetMode = "zero" | "one" | "minus" | "psi";
export type GateEnabledState = { h1: boolean; cphase: boolean; phase: boolean; h2: boolean };
export type GateSimInput = {
  q0InitialBit: 0 | 1;
  q1State: { theta: number; phi: number };
  q1CircuitVisible: boolean;
  gateEnabled: GateEnabledState;
  lambdaDeg: number;
  phaseGateDeg: number;
};

export type GateSimResult = {
  states: {
    s0: Complex[];
    s1: Complex[];
    s2: Complex[];
    s3: Complex[];
  };
  q0Probabilities: { p0: number; p1: number };
  q1Probabilities: { p0: number; p1: number };
  stageProbabilities: {
    q0: [number, number, number, number];
    q1: [number, number, number, number];
  };
  blochVectors: {
    q0: Array<{ x: number; y: number; z: number }>;
    q1: Array<{ x: number; y: number; z: number }>;
  };
};

function C(re: number, im = 0): Complex {
  return { re, im };
}

function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

function cMul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cConj(a: Complex): Complex {
  return { re: a.re, im: -a.im };
}

function cScale(a: Complex, s: number): Complex {
  return { re: a.re * s, im: a.im * s };
}

function cAbs2(a: Complex): number {
  return a.re * a.re + a.im * a.im;
}

function cExpI(phi: number): Complex {
  return { re: Math.cos(phi), im: Math.sin(phi) };
}

function kron2(a0: Complex, a1: Complex, b0: Complex, b1: Complex): Complex[] {
  return [cMul(a0, b0), cMul(a0, b1), cMul(a1, b0), cMul(a1, b1)];
}

function applyHOnQ0(st: Complex[]): Complex[] {
  const inv = 1 / Math.sqrt(2);
  const [a00, a01, a10, a11] = st;
  return [
    cScale(cAdd(a00, a10), inv),
    cScale(cAdd(a01, a11), inv),
    cScale(cSub(a00, a10), inv),
    cScale(cSub(a01, a11), inv),
  ];
}

function applyControlledPhase(st: Complex[], lambda: number): Complex[] {
  const out = st.slice();
  out[3] = cMul(out[3], cExpI(lambda));
  return out;
}

function applyPhaseOnQ0(st: Complex[], phi: number): Complex[] {
  const out = st.slice();
  const phase = cExpI(phi);
  out[2] = cMul(out[2], phase);
  out[3] = cMul(out[3], phase);
  return out;
}

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function reducedBlochVectors(st: Complex[]) {
  const [a00, a01, a10, a11] = st;

  const rho0_00 = cAbs2(a00) + cAbs2(a01);
  const rho0_11 = cAbs2(a10) + cAbs2(a11);
  const rho0_01 = cAdd(cMul(a00, cConj(a10)), cMul(a01, cConj(a11)));

  const rho1_00 = cAbs2(a00) + cAbs2(a10);
  const rho1_11 = cAbs2(a01) + cAbs2(a11);
  const rho1_01 = cAdd(cMul(a00, cConj(a01)), cMul(a10, cConj(a11)));

  return {
    r0: { x: 2 * rho0_01.re, y: rho0_00 - rho0_11, z: -2 * rho0_01.im },
    r1: { x: 2 * rho1_01.re, y: rho1_00 - rho1_11, z: -2 * rho1_01.im },
  };
}

export function q1PresetState(mode: Q1PresetMode): { theta: number; phi: number } {
  if (mode === "zero") return { theta: 0, phi: 0 };
  if (mode === "one") return { theta: Math.PI, phi: 0 };
  if (mode === "minus") return { theta: Math.PI / 2, phi: Math.PI };
  return { theta: Math.PI, phi: 0 };
}

export function computeGateSimCircuit(input: GateSimInput): GateSimResult {
  const lambda = (((input.lambdaDeg % 360) + 360) % 360) * Math.PI / 180;
  const phaseGatePhi = (((input.phaseGateDeg % 360) + 360) % 360) * Math.PI / 180;

  const b0 = C(Math.cos(input.q1State.theta / 2), 0);
  const b1 = cMul(cExpI(input.q1State.phi), C(Math.sin(input.q1State.theta / 2), 0));
  const a0 = input.q0InitialBit === 0 ? C(1, 0) : C(0, 0);
  const a1 = input.q0InitialBit === 0 ? C(0, 0) : C(1, 0);
  const cphaseActive = input.gateEnabled.cphase && input.q1CircuitVisible;
  const phaseGateActive = input.gateEnabled.phase;

  const s0 = kron2(a0, a1, b0, b1);
  const s1 = input.gateEnabled.h1 ? applyHOnQ0(s0) : s0.slice();
  const s2Base = cphaseActive ? applyControlledPhase(s1, lambda) : s1.slice();
  const s2 = phaseGateActive ? applyPhaseOnQ0(s2Base, phaseGatePhi) : s2Base;
  const s3 = input.gateEnabled.h2 ? applyHOnQ0(s2) : s2.slice();

  const bS0 = reducedBlochVectors(s0);
  const bS1 = reducedBlochVectors(s1);
  const bS2 = reducedBlochVectors(s2);
  const bS3 = reducedBlochVectors(s3);

  const p1_q0 = cAbs2(s3[2]) + cAbs2(s3[3]);
  const p0_q0 = 1 - p1_q0;
  const p1_q1 = cAbs2(s3[1]) + cAbs2(s3[3]);
  const p0_q1 = 1 - p1_q1;

  return {
    states: { s0, s1, s2, s3 },
    q0Probabilities: { p0: p0_q0, p1: p1_q0 },
    q1Probabilities: { p0: p0_q1, p1: p1_q1 },
    stageProbabilities: {
      q0: [
        clamp((1 + bS0.r0.y) / 2, 0, 1),
        clamp((1 + bS1.r0.y) / 2, 0, 1),
        clamp((1 + bS2.r0.y) / 2, 0, 1),
        p0_q0,
      ],
      q1: [
        clamp((1 + bS0.r1.y) / 2, 0, 1),
        clamp((1 + bS1.r1.y) / 2, 0, 1),
        clamp((1 + bS2.r1.y) / 2, 0, 1),
        p0_q1,
      ],
    },
    blochVectors: {
      q0: [bS0.r0, bS1.r0, bS2.r0, bS3.r0],
      q1: [bS0.r1, bS1.r1, bS2.r1, bS3.r1],
    },
  };
}
