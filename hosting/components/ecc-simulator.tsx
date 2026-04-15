"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { EccControlsPanel } from "@/components/ecc-controls-panel";
import { Ecc3DVisualization, type MeasurementFile } from "@/components/ecc-3d-visualization";
import {
  INF_POINT as INF,
  calculateCurvePoints,
  countCurveOrder,
  gcd,
  isOnCurve,
  legendreSymbol,
  mod,
  modAdd,
  modInv,
  modMul,
  pointAdd,
  pointDouble,
  pointKey,
  pointNeg,
  primeFactorsUnique,
  scalarMult,
  sqrtModP3Mod4,
  type CurvePoint,
} from "@/lib/ecc";
import {
  buildPredefinedCurves,
  controlQubitBoundsForP,
  optionLabelForCurve,
  quantumEstimates,
  recommendedControlQubitsForOrder,
  shorEstimates,
  type PredefinedCurve,
} from "@/lib/curves";

function bsgsDiscreteLog(target: CurvePoint, base: CurvePoint, n: number, p: number, dbg?: (msg: string) => void): { k: number | null; m: number } {
  if (target.inf) return { k: 0, m: 1 };
  const m = Math.floor(Math.sqrt(n)) + 1;

  const baby = new Map();
  let Pj = INF;
  for (let j = 0; j < m; j++) {
    baby.set(pointKey(Pj), j);
    Pj = pointAdd(Pj, base, p);
  }
  dbg && dbg(`BSGS: m=${m}, baby steps=${baby.size}`);

  const mG = scalarMult(m, base, p);
  const step = pointNeg(mG, p);

  let gamma = target;
  for (let i = 0; i <= m; i++) {
    const key = pointKey(gamma);
    if (baby.has(key)) {
      const j = baby.get(key);
      const k = (i * m + j) % n;
      const check = scalarMult(k, base, p);
      if (
        check.inf === target.inf &&
        (check.inf || (check.x === target.x && check.y === target.y))
      ) {
        dbg && dbg(`BSGS hit: i=${i}, j=${j}, k=${k}`);
        return { k, m };
      }
      dbg &&
        dbg(
          `BSGS spurious hit (key collision/duplicate): i=${i}, j=${j}, k=${k}`,
        );
    }
    gamma = pointAdd(gamma, step, p);
    if ((i & 0x3f) === 0) dbg && dbg(`BSGS giant step i=${i}`);
  }
  dbg && dbg(`BSGS miss after m=${m}`);
  return { k: null, m };
}

function randU32(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] >>> 0;
}
function randInt(lo: number, hi: number): number {
  const span = (hi - lo + 1) >>> 0;
  return lo + (randU32() % span);
}
function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}
function nextPrimeFrom(x: number): number {
  let n = x | 0;
  if (n <= 2) return 2;
  if (n % 2 === 0) n++;
  while (!isPrime(n)) n += 2;
  return n;
}
function isMersenneForm(n: number): boolean {
  const m = n + 1;
  return (m & (m - 1)) === 0;
}
function bitLength(n: number): number {
  let b = 0;
  while (n > 0) {
    b++;
    n >>>= 1;
  }
  return Math.max(b, 1);
}
function randomPointOnCurve(p: number): CurvePoint {
  for (let t = 0; t < 5000; t++) {
    const x = randInt(0, p - 1);
    const rhs = modAdd(modMul(modMul(x, x, p), x, p), 7 % p, p);
    const ls = legendreSymbol(rhs, p);
    if (ls === 0) return { inf: false, x, y: 0 };
    if (ls === 1) {
      const y = sqrtModP3Mod4(rhs, p);
      const y2 = randU32() & 1 ? y : y === 0 ? 0 : p - y;
      return { inf: false, x, y: y2 };
    }
  }
  return INF;
}
function hasExactOrder(G: CurvePoint, n: number, primeFacs: number[], p: number): boolean {
  const nG = scalarMult(n, G, p);
  if (!nG.inf) return false;
  for (const q of primeFacs) {
    const t = Math.floor(n / q);
    const tG = scalarMult(t, G, p);
    if (tG.inf) return false;
  }
  return true;
}

// Generate all multiples of a generator point
function generateMultiples(G: CurvePoint, p: number, maxCount: number = 1000): CurvePoint[] {
  const multiples: CurvePoint[] = [];
  let current = G;
  
  for (let i = 0; i < maxCount; i++) {
    if (current.inf) break;
    multiples.push({ x: current.x, y: current.y });
    current = pointAdd(current, G, p);
  }
  
  return multiples;
}

function hasseUpperBound(p: number): number {
  const sqrtP = Math.floor(Math.sqrt(Math.max(0, p)));
  return p + 1 + 2 * sqrtP + 5;
}

function computePointOrder(P: CurvePoint | null | undefined, p: number): number | null {
  if (!P || P.inf) return null;
  if (!Number.isFinite(P.x) || !Number.isFinite(P.y)) return null;
  if (!Number.isFinite(p) || p <= 1) return null;
  if (!isOnCurve(P, p)) return null;

  const maxIters = hasseUpperBound(p);
  let acc = INF;
  for (let i = 1; i <= maxIters; i++) {
    acc = pointAdd(acc, P, p);
    if (acc.inf) return i;
  }

  return null;
}

function fmtPoint(P: any): string {
  if (P.inf) return "INF";
  return `(${P.x}, ${P.y})`;
}

export function EccSimulatorPage() {
  const router = useRouter();

  const [selected, setSelected] = useState<any>(null);
  const [publicQ, setPublicQ] = useState<any>(null);
  const [isComputingPublicQ, setIsComputingPublicQ] = useState(false);
  const [isRecoveringK, setIsRecoveringK] = useState(false);
  const [qMode, setQMode] = useState("k");
  const [kInput, setKInput] = useState("");
  const [qXInput, setQXInput] = useState("");
  const [qYInput, setQYInput] = useState("");
  const [status, setStatus] = useState("");
  const [selectedInfo, setSelectedInfo] = useState("");
  const [pubInfo, setPubInfo] = useState("");
  const [results, setResults] = useState("<span class=\"muted\">No runs yet.</span>");
  const [warningsResults, setWarningsResults] = useState("");
  const [warnings, setWarnings] = useState("");
  const [log, setLog] = useState("");
  const [showKeyArea, setShowKeyArea] = useState(false);
  const [showRecover, setShowRecover] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  const [showWarningsTitle, setShowWarningsTitle] = useState(false);
  const [showResultsTitle, setShowResultsTitle] = useState(true);
  const [orderSelect, setOrderSelect] = useState("");
  const [predefinedCurves, setPredefinedCurves] = useState<PredefinedCurve[]>([]);
  const [visualizationGenerator, setVisualizationGenerator] = useState<any>(null);
  const [visualizationOrder, setVisualizationOrder] = useState<number | null>(null);
  const [measurementFile, setMeasurementFile] = useState<MeasurementFile | null>(null);
  const [isRemoteMersenneTaskActive, setIsRemoteMersenneTaskActive] = useState(false);

  // Remote Shor (Mersenne) run settings
  const [phaseRegisterQubits, setPhaseRegisterQubits] = useState<string>("auto");
  const [shots, setShots] = useState<string>("10000");

  const logRef = useRef<string[]>([]);
  const qpuLogTextRef = useRef<string>("");
  const warningsLogRef = useRef<HTMLDivElement | null>(null);
  const isWarningsPinnedRef = useRef(true);
  const skipNextOrderSelectApplyRef = useRef(false);
  const activeRemoteRunParamsRef = useRef<
    | {
        p: number;
        order: number;
        base_point: [number, number];
      }
    | null
  >(null);
  const firebaseFunctionsUrl =
    process.env.NEXT_PUBLIC_QPU_FIREBASE_FUNCTIONS_URL || "http://127.0.0.1:5001/x402sol/us-central1";

  const handleWarningsLogScroll = useCallback(() => {
    const el = warningsLogRef.current;
    if (!el) return;
    const bottomGap = el.scrollHeight - el.scrollTop - el.clientHeight;
    isWarningsPinnedRef.current = bottomGap < 24;
  }, []);

  

  useEffect(() => {
    // Auto-scroll log when new lines arrive, but only if user is already near the bottom.
    const el = warningsLogRef.current;
    if (!el) return;
    if (!warnings) {
      isWarningsPinnedRef.current = true;
      return;
    }
    if (!isWarningsPinnedRef.current) return;

    // Defer until after React paints updated content.
    const raf = requestAnimationFrame(() => {
      const node = warningsLogRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [warnings]);

  const effectiveCurveParams = useMemo(() => {
    if (!selected) return null;
    const G = visualizationGenerator ?? selected.G;
    const n = visualizationOrder ?? selected.n;
    return {
      p: Number(selected.p),
      n: Number(n),
      G,
      isCustomGenerator:
        !!visualizationGenerator &&
        (!!selected?.G &&
          (visualizationGenerator?.x !== selected.G.x ||
            visualizationGenerator?.y !== selected.G.y)),
    };
  }, [selected, visualizationGenerator, visualizationOrder]);

  const applyCurveSelection = useCallback((sel: any) => {
    console.time('applyCurveSelection');
    setSelected(sel);
    setShowKeyArea(true);
    logRef.current = [];
    setLog("");
    setWarningsResults("");
    setWarnings("");
    setShowWarnings(false);
    setShowWarningsTitle(false);
    setShowResultsTitle(true);
    setResults(`<span class="muted">Ready to generate keys.</span>`);
    setPublicQ(null);
    setQMode("k");
    setQXInput("");
    setQYInput("");
    setPubInfo("");
    setShowRecover(false);
    setVisualizationGenerator(sel.G);
    setVisualizationOrder(Number(sel.n));

    // Reset remote run settings when changing curves.
    setPhaseRegisterQubits("auto");
    setShots("10000");

    const mersenne = sel.field === "mersenne";
    if (mersenne) setStatus(`Selected curve is ready (p is a prime).`);
    else setStatus("Curve ready. Enter k to compute Q.");

    const info = `n=${sel.n},  p=${sel.p},  G=${fmtPoint(sel.G)}, curve: y² = x³ + 7 mod ${sel.p} ${mersenne ? "prime field)" : "prime field"}`;
    setSelectedInfo(info);
    console.timeEnd('applyCurveSelection');
  }, []);

  const effectiveControlQubits = useMemo(() => {
    if (!selected) return 3;
    const orderForSizing = Number(effectiveCurveParams?.n ?? selected.n);
    const pForBounds = Number(effectiveCurveParams?.p ?? selected.p);
    const bounds = controlQubitBoundsForP(pForBounds);
    const clamp = (v: number) => Math.min(bounds.max, Math.max(bounds.min, v));

    if (phaseRegisterQubits === "auto") {
      return clamp(recommendedControlQubitsForOrder(orderForSizing));
    }
    const parsed = Number(phaseRegisterQubits);
    if (!Number.isFinite(parsed) || parsed <= 0) return clamp(recommendedControlQubitsForOrder(orderForSizing));
    return clamp(Math.floor(parsed));
  }, [effectiveCurveParams?.n, effectiveCurveParams?.p, phaseRegisterQubits, selected]);

  const phaseRegisterBounds = useMemo(() => {
    if (!selected) return { min: 3, max: 10 };
    const pForBounds = Number(effectiveCurveParams?.p ?? selected.p);
    return controlQubitBoundsForP(pForBounds);
  }, [effectiveCurveParams?.p, selected]);

  const recommendedPhaseRegisterQubits = useMemo(() => {
    if (!selected) return 3;
    const orderForSizing = Number(effectiveCurveParams?.n ?? selected.n);
    const raw = recommendedControlQubitsForOrder(orderForSizing);
    return Math.min(phaseRegisterBounds.max, Math.max(phaseRegisterBounds.min, raw));
  }, [effectiveCurveParams?.n, phaseRegisterBounds.max, phaseRegisterBounds.min, selected]);

  const effectiveShots = useMemo(() => {
    const parsed = Number(shots);
    if (!Number.isFinite(parsed) || parsed <= 0) return 10000;
    return Math.min(1_000_000, Math.max(1, Math.floor(parsed)));
  }, [shots]);

  // Memoized curve points for visualization (only for p = 127 and p = 31)
  const curvePoints = useMemo(() => {
    if (!selected || (selected.p !== 127 && selected.p !== 31)) return [];
    console.time('calculateCurvePoints');
    const result = calculateCurvePoints(selected.p);
    console.timeEnd('calculateCurvePoints');
    return result;
  }, [selected]);

  // Memoized generated multiples for visualization
  const generatedMultiples = useMemo(() => {
    if (!visualizationGenerator || !selected || !(selected.p === 127 || selected.p === 31)) return [];
    console.time('generateMultiples');
    const maxCount = Number(visualizationOrder ?? selected.n);
    const result = generateMultiples(visualizationGenerator, selected.p, Number.isFinite(maxCount) ? maxCount : selected.n);
    console.timeEnd('generateMultiples');
    return result;
  }, [visualizationGenerator, visualizationOrder, selected]);

  // Show visualization only for p = 127 or p = 31
  const showVisualization = selected && (selected.p === 127 || selected.p === 31);

  useEffect(() => {
    const curves = buildPredefinedCurves();
    setPredefinedCurves(curves);
    setStatus(curves.length ? "Select a predefined curve." : "No predefined curves available.");
    if (curves.length > 0) {
      // Set the first curve's order as default
      setOrderSelect(String(curves[0].n));
    }
  }, []);

  // Apply curve when orderSelect changes
  useEffect(() => {
    if (skipNextOrderSelectApplyRef.current) {
      skipNextOrderSelectApplyRef.current = false;
      return;
    }
    if (orderSelect && predefinedCurves.length > 0) {
      const n = Number(orderSelect);
      const matches = predefinedCurves.filter((c) => c.n === n);
      const sel = matches.length ? matches[Math.floor(Math.random() * matches.length)] : null;
      if (sel) {
        applyCurveSelection(sel);
      }
    }
  }, [applyCurveSelection, orderSelect, predefinedCurves]);

  const handleMeasurementFileChange = useCallback(
    (file: MeasurementFile | null, filename?: string) => {
      setMeasurementFile(file);
      if (!file) return;

      const pFrom = Number((file as any)?.curve_parameters?.p ?? (file as any)?.p);
      const nFrom = Number(
        (file as any)?.curve_parameters?.max_point_order ??
          (file as any)?.curve_parameters?.curve_size ??
          (file as any)?.curve_parameters?.order,
      );
      const base = (file as any)?.curve_parameters?.base_point;
      const gx = Number(Array.isArray(base) ? base[0] : NaN);
      const gy = Number(Array.isArray(base) ? base[1] : NaN);
      const field = (file as any)?.curve_parameters?.field;

      if (!Number.isFinite(pFrom) || !Number.isFinite(nFrom) || !Number.isFinite(gx) || !Number.isFinite(gy)) return;
      if (pFrom !== 31 && pFrom !== 127) return;

      const exact = predefinedCurves.find((c) => c.p === pFrom && c.n === nFrom && c.G?.x === gx && c.G?.y === gy);
      const fallback = predefinedCurves.find((c) => c.p === pFrom && c.n === nFrom);
      const sel = exact ?? fallback ?? { n: nFrom, p: pFrom, order: nFrom, h: 1, G: { x: gx, y: gy }, field };

      skipNextOrderSelectApplyRef.current = true;
      setOrderSelect(String(sel.n));
      applyCurveSelection(sel);
    },
    [applyCurveSelection, predefinedCurves],
  );

  const logLine = (s: string, cls = "muted") => {
    logRef.current.push(`<div class="${cls}">${s}</div>`);
    setLog(logRef.current.join(""));
  };

  const resetQpuLog = () => {
    qpuLogTextRef.current = "";
    setWarnings("");
  };

  const appendQpuLog = (line: string) => {
    qpuLogTextRef.current += `${line}\n`;
    setWarnings(qpuLogTextRef.current);
  };

  const clearLog = () => {
    logRef.current = [];
    qpuLogTextRef.current = "";
    setLog("");
    setWarningsResults("");
    setWarnings("");
    setShowWarnings(false);
    setShowWarningsTitle(false);
    setShowResultsTitle(true);
  };

  const resetPublicQUI = ({ resetResults = true } = {}) => {
    if (isComputingPublicQ || isRecoveringK) return;
    setPublicQ(null);
    setPubInfo("");
    setShowRecover(false);
    if (resetResults) setResults(`<span class="muted">No runs yet.</span>`);
    setWarningsResults("");
    setWarnings("");
    setShowWarnings(false);
    setShowWarningsTitle(false);
  };

  const updateQModeUI = () => {
    resetPublicQUI({ resetResults: false });
    if (selected) {
      setStatus(qMode === "k" ? "Curve ready. Enter k to compute Q." : "Curve ready. Enter Q to recover k.");
    }
  };

  // Keep this function for manual apply if needed
  const applySelectedCurve = ({ logSelection = true } = {}) => {
    // Trigger via state change instead
    const n = Number(orderSelect);
    if (n > 0) {
      setOrderSelect(String(n)); // This will trigger the useEffect
    }
  };

  const computePublicPoint = async (k: number) => {
    const p = Number(selected?.p);
    const G = effectiveCurveParams?.G ?? selected?.G;
    return scalarMult(k, G, p);
  };

  const bruteForceRecover = async () => {
    const p = Number(effectiveCurveParams?.p ?? selected?.p);
    const n = Number(effectiveCurveParams?.n ?? selected?.n);
    const G = effectiveCurveParams?.G ?? selected?.G;
    const Q = publicQ;
    const t0 = performance.now();

    if (Q.inf) {
      return { k: 0, ms: performance.now() - t0, ops: n };
    }

    for (let i = 0; i < n; i++) {
      const Pi = scalarMult(i, G, p);
      if (!Pi.inf && Pi.x === Q.x && Pi.y === Q.y) {
        return { k: i, ms: performance.now() - t0, ops: n, usedGPU: false };
      }
      if (i % 64 === 0) await new Promise(r => setTimeout(r, 0));
    }
    return { k: null, ms: performance.now() - t0, ops: n, usedGPU: false };
  };

  const bsgsRecover = async () => {
    const p = Number(effectiveCurveParams?.p ?? selected?.p);
    const n = Number(effectiveCurveParams?.n ?? selected?.n);
    const G = effectiveCurveParams?.G ?? selected?.G;
    const Q = publicQ;
    const t0 = performance.now();

    const { k, m } = bsgsDiscreteLog(Q, G, n, p, (msg) => console.log(msg));
    return { k, ms: performance.now() - t0, m, usedGPU: false };
  };

  const pollardsRhoRecover = async () => {
    const p = Number(effectiveCurveParams?.p ?? selected?.p);
    const n = Number(effectiveCurveParams?.n ?? selected?.n);
    const G = effectiveCurveParams?.G ?? selected?.G;
    const Q = publicQ;
    const t0 = performance.now();

    if (Q.inf) return { k: 0, ms: performance.now() - t0, iters: 0, note: "Q=∞" };

    function step(state: any) {
      let { X, a, b } = state;
      const bucket = X.inf ? 0 : X.x % 3;
      if (bucket === 0) {
        X = pointAdd(X, G, p);
        a = (a + 1) % n;
      } else if (bucket === 1) {
        X = pointDouble(X, p);
        a = (2 * a) % n;
        b = (2 * b) % n;
      } else {
        X = pointAdd(X, Q, p);
        b = (b + 1) % n;
      }
      return { X, a, b };
    }

    const maxRestarts = 18;
    const maxIters = 400000;

    for (let r = 0; r < maxRestarts; r++) {
      let a0 = randInt(0, n - 1);
      let b0 = randInt(0, n - 1);
      let X0 = pointAdd(scalarMult(a0, G, p), scalarMult(b0, Q, p), p);

      let tort = { X: X0, a: a0, b: b0 };
      let hare = step({ X: X0, a: a0, b: b0 });

      for (let iter = 1; iter <= maxIters; iter++) {
        tort = step(tort);
        hare = step(step(hare));

        if (
          (tort.X.inf && hare.X.inf) ||
          (!tort.X.inf &&
            !hare.X.inf &&
            tort.X.x === hare.X.x &&
            tort.X.y === hare.X.y)
        ) {
          const da = (tort.a - hare.a) % n;
          const db = (hare.b - tort.b) % n;
          const A = mod(da, n);
          const B = mod(db, n);

          const g = gcd(B, n);
          if (g === 0) break;
          if (A % g !== 0) break;
          const n1 = Math.floor(n / g);
          const A1 = Math.floor(A / g);
          const B1 = Math.floor(B / g);

          const inv = modInv(B1, n1);
          if (inv === null) break;

          const k0 = modMul(A1, inv, n1);

          for (let t = 0; t < g; t++) {
            const kcand = k0 + t * n1;
            const Pcand = scalarMult(kcand, G, p);
            if (!Pcand.inf && Pcand.x === Q.x && Pcand.y === Q.y) {
              return { k: kcand, ms: performance.now() - t0, iters: iter, restarts: r };
            }
            if (Q.inf && Pcand.inf) return { k: kcand, ms: performance.now() - t0, iters: iter, restarts: r };
          }
          break;
        }

        if (iter % 4096 === 0) await new Promise(r => setTimeout(r, 0));
      }
    }
    return { k: null, ms: performance.now() - t0, iters: null, note: "No solution found in restart budget." };
  };

  const handleOrderSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setOrderSelect(e.target.value);
    // Reset results immediately
    setResults(`<span class="muted">Selecting curve...</span>`);
    setWarningsResults("");
    setWarnings("");
    setShowWarnings(false);
    setShowWarningsTitle(false);
    setShowResultsTitle(true);
    setPubInfo("");
    // The useEffect will handle applying the curve
  };

  const handleQModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value;
    setQMode(newMode);
    // Reset results and public Q
    setResults(`<span class="muted">No runs yet.</span>`);
    setWarningsResults("");
    setWarnings("");
    setShowWarnings(false);
    setShowWarningsTitle(false);
    setShowResultsTitle(true);
    setPublicQ(null);
    setPubInfo("");
    setShowRecover(false);
    setQXInput("");
    setQYInput("");
    setKInput("");
    if (selected) {
      const msg = newMode === "k" ? "Generating public point from private key (k)." : "Entering public point manually (x, y).";
      setStatus(msg);
    }
  };

  const handlePhaseRegisterQubitsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPhaseRegisterQubits(e.target.value);
    // Keep results stable; this affects the next remote run.
  };

  const handleShotsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setShots(e.target.value);
    // Keep results stable; this affects the next remote run.
  };

  const handleKInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setKInput(value);
    if (isComputingPublicQ || isRecoveringK) return;
    
    // Reset results when user changes input
    resetPublicQUI({ resetResults: true });
    
    if (!selected || qMode !== "k") return;

    const n = Number(effectiveCurveParams?.n ?? selected.n);
    const t = value.trim();
    if (!t) {
      setPubInfo("");
      return;
    }

    const k = Number(t);
    const isNonNegInt = /^\d+$/.test(t) && Number.isSafeInteger(k);
    if (!isNonNegInt) {
      setPubInfo(`Invalid k. Must be a non-negative integer.`);
      return;
    }
    if (k <= 1 || k >= n) {
      setPubInfo(`Invalid k. Enter an integer with 1 < k < n (${n}).`);
      return;
    }
    // Valid k
    setPubInfo(`Valid k = ${k}. Click 'Generate public point (Q=kG)' to proceed.`);
  };

  const handlePubBtnClick = async () => {
    if (!selected) return;
    if (qMode !== "k") return;
    if (isComputingPublicQ || isRecoveringK) return;
    const n = Number(effectiveCurveParams?.n ?? selected.n);
    const t = kInput.trim();
    const k = Number(t);
    const isNonNegInt = t !== "" && /^\d+$/.test(t) && Number.isSafeInteger(k);
    if (!isNonNegInt || k <= 1 || k >= n) {
      setPubInfo(`Invalid k. Enter an integer with 1 < k < n (${n}).`);
      return;
    }
    setIsComputingPublicQ(true);
    setShowRecover(false);
    setPubInfo("Computing Q = kG…");
    logLine(`Computing public point Q = ${k}·G…`, "muted");

    try {
      const t0 = performance.now();
      const Q = await computePublicPoint(k);
      const ms = performance.now() - t0;

      setPublicQ(Q);
      setPubInfo(`Q = kG = ${fmtPoint(Q)}`);
      logLine(`Public Q computed: ${fmtPoint(Q)} (${ms.toFixed(2)} ms)`, "ok");
      setShowRecover(true);
    } finally {
      setIsComputingPublicQ(false);
    }
  };

  const handleQXInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQXInput(e.target.value);
    if (isComputingPublicQ || isRecoveringK) return;
    // Reset results when user changes input
    resetPublicQUI({ resetResults: true });
    setPubInfo("Entering manual point coordinates. Complete both x and y, then click 'Use manual Q'.");
  };

  const handleQYInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQYInput(e.target.value);
    if (isComputingPublicQ || isRecoveringK) return;
    // Reset results when user changes input
    resetPublicQUI({ resetResults: true });
    setPubInfo("Entering manual point coordinates. Complete both x and y, then click 'Use manual Q'.");
  };

  const handleSetQBtnClick = () => {
    if (!selected) return;
    if (qMode !== "manual") return;

    const p = Number(effectiveCurveParams?.p ?? selected?.p);
    const n = Number(effectiveCurveParams?.n ?? selected?.n);

    try {
      const Q = {
        inf: false,
        x: parseInt(qXInput),
        y: parseInt(qYInput),
      };

      if (!isOnCurve(Q, p)) {
        logLine(`Invalid Q: point is not on curve y² = x³ + 7 (mod p).`, "bad");
        return;
      }

      setPublicQ(Q);
      setPubInfo(`Q = ${fmtPoint(Q)}`);
      logLine(`Manual public Q set: ${fmtPoint(Q)}`, "ok");

      const inSubgroup = scalarMult(n, Q, p).inf;
      if (!inSubgroup) {
        logLine(`Warning: n*Q != INF; Q may not be in the subgroup generated by G (k-recovery may fail).`, "warn");
      }

      setShowRecover(true);
    } catch (e) {
      logLine(String(e), "bad");
    }
  };

  const handleVisualizationGeneratorSelect = useCallback((point: any) => {
    if (!selected) return;
    const p = Number(selected.p);

    const normalizedPoint = {
      inf: false,
      x: Number(point?.x),
      y: Number(point?.y),
    };

    const ord = computePointOrder(normalizedPoint, p);

    setVisualizationGenerator(point);
    setVisualizationOrder(ord);
    setPublicQ(null);
    setShowRecover(false);
    if (ord) {
      setPubInfo(`Generator changed to G=${fmtPoint(normalizedPoint)} (order n=${ord}). Recompute Q to update the visualization.`);
    } else {
      setPubInfo(`Generator changed to G=${fmtPoint(normalizedPoint)}. Recompute Q to update the visualization.`);
    }
  }, [selected]);

  const formatTaskLogs = (logs: any) => {
    if (!logs) return "";
    const entries = Array.isArray(logs) ? logs : Object.values(logs);
    const normalized = entries
      .map((entry: any) => {
        if (!entry) return null;
        if (typeof entry === "string") return { message: entry, timestamp: 0 };
        if (typeof entry.message !== "string") return null;
        return { message: entry.message, timestamp: Number(entry.timestamp || 0) };
      })
      .filter(Boolean) as Array<{ message: string; timestamp: number }>;
    normalized.sort((a, b) => a.timestamp - b.timestamp);
    return normalized.map((entry) => entry.message).join("\n");
  };

  const pollMersenneTask = async (taskId: string) => {
    const timeoutMs = 10 * 60 * 1000;
    const pollIntervalMs = 5000;
    const startedAt = Date.now();
    let logCursor = 0;
    const logMaxBytes = 65536;
    let didSetMeasurement = false;

    const drainFinalLogs = async (finalStatus: string | undefined) => {
      // Best-effort: status can flip to COMPLETED before the last log append is flushed.
      // Drain until no new bytes arrive (cursor stops advancing) or we hit a small retry limit.
      let attempts = 0;
      while (attempts < 12) {
        attempts++;
        let data: any = null;
        try {
          const response = await fetch(
            `${firebaseFunctionsUrl}/buildandrunmersennefield?taskId=${encodeURIComponent(taskId)}&logCursor=${logCursor}&logMaxBytes=${logMaxBytes}`,
          );
          data = await response.json();
        } catch {
          break;
        }

        let advanced = false;
        if (typeof data?.logChunk === "string") {
          const chunk = data.logChunk as string;
          if (chunk) {
            qpuLogTextRef.current += chunk;
            setWarnings(qpuLogTextRef.current);
          }
          const nxt = data?.nextLogCursor;
          if (typeof nxt === "number" && Number.isFinite(nxt) && nxt >= 0) {
            const next = Math.floor(nxt);
            advanced = next > logCursor;
            logCursor = next;
          } else if (typeof nxt === "string") {
            const parsed = Number(nxt);
            if (Number.isFinite(parsed) && parsed >= 0) {
              const next = Math.floor(parsed);
              advanced = next > logCursor;
              logCursor = next;
            }
          }
        }

        // Stop once the cursor stops moving and no chunk is received.
        if (!advanced) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (finalStatus) {
        appendQpuLog(`(final status: ${finalStatus})`);
      }
    };

    while (true) {
      let data: any = null;
      try {
        const response = await fetch(
          `${firebaseFunctionsUrl}/buildandrunmersennefield?taskId=${encodeURIComponent(taskId)}&logCursor=${logCursor}&logMaxBytes=${logMaxBytes}`,
        );
        data = await response.json();
      } catch (err) {
        appendQpuLog(`Polling error: ${String(err)}`);
      }

      // Preferred: cursor-based streaming log.
      if (typeof data?.logChunk === "string") {
        const chunk = data.logChunk as string;
        if (chunk) {
          qpuLogTextRef.current += chunk;
          setWarnings(qpuLogTextRef.current);
        }

        const nxt = data?.nextLogCursor;
        if (typeof nxt === "number" && Number.isFinite(nxt) && nxt >= 0) {
          logCursor = Math.floor(nxt);
        } else if (typeof nxt === "string") {
          const parsed = Number(nxt);
          if (Number.isFinite(parsed) && parsed >= 0) logCursor = Math.floor(parsed);
        }
      } else if (data?.logs) {
        // Legacy fallback: list/dict logs
        const logText = formatTaskLogs(data.logs);
        if (logText) {
          qpuLogTextRef.current = logText + (logText.endsWith("\n") ? "" : "\n");
          setWarnings(qpuLogTextRef.current);
        }
      }

      const status = data?.status;
      const result = data?.result;
      const error = data?.error;
      const queuePosition = data?.queue_position ?? result?.queue_position;
      const recoveredK =
        result?.post_process?.recovered_k ?? result?.post_process?.recoveredK;
      const statusHtml = [
        "<div><b>Shor's ECDLP prime field</b></div>",
        `<div class="mono">Task ID: ${taskId}</div>`,
        status ? `<div class="mono">Status: ${status}</div>` : "",
        status === "QUEUED" && queuePosition !== undefined && queuePosition !== null
          ? `<div class="mono">Queue position: ${queuePosition} (keep this page open)</div>`
          : "",
        recoveredK !== undefined && recoveredK !== null
          ? `<div class="mono">Recovered k: ${recoveredK}</div>`
          : "",
        result?.post_process_error
          ? `<div class="bad">Post-process error: ${result.post_process_error}</div>`
          : "",
        error ? `<div class="bad">Error: ${error}</div>` : "",
      ]
        .filter(Boolean)
        .join("");

      setWarningsResults(statusHtml);
      setShowWarningsTitle(true);

      // If the backend includes measurement counts inline, use them to drive the 3D measurement animation.
      // (This replaces the manual drop-zone workflow for live runs.)
      if (status === "COMPLETED" && result && !didSetMeasurement) {
        const counts = result?.measurement_counts;
        if (counts && typeof counts === "object") {
          const runInfo = result?.run_info;
          const buildInfo = runInfo?.build_info;
          const pFromRun = Number(buildInfo?.p_mod ?? selected?.p);
          const nFromRun = Number(buildInfo?.order ?? selected?.n);
          const controlA = Number(buildInfo?.control_qubits_A ?? result?.control_qubits_A ?? result?.control_qubits);
          const controlB = Number(buildInfo?.control_qubits_B ?? result?.control_qubits_B ?? result?.control_qubits);

          const totalQubits = Number(buildInfo?.total_qubits ?? 0);
          const totalGates = Number(buildInfo?.gates_written ?? 0);

          const secretK = (() => {
            const t = (qMode === "k" ? kInput : "").trim();
            const k = Number(t);
            return t && Number.isFinite(k) ? k : undefined;
          })();

          const measurement: MeasurementFile = {
            origin: "qpu-simulation",
            p: pFromRun,
            measurement_counts: counts as Record<string, number>,
            control_qubits_A: Number.isFinite(controlA) ? controlA : undefined,
            control_qubits_B: Number.isFinite(controlB) ? controlB : undefined,
            shots: Number(result?.shots ?? data?.shots ?? 10000),
            secret_k: secretK,
            recovered_k: recoveredK ?? undefined,
            curve_parameters: {
              base_point: activeRemoteRunParamsRef.current?.base_point ?? (selected?.G ? [Number(selected.G.x), Number(selected.G.y)] : undefined),
              max_point_order: activeRemoteRunParamsRef.current?.order ?? nFromRun,
              p: pFromRun,
            },
            total_qubits: Number.isFinite(totalQubits) ? totalQubits : 0,
            total_gates: Number.isFinite(totalGates) ? totalGates : 0,
          };

          setMeasurementFile(measurement);
          didSetMeasurement = true;
        }
      }

      if (status === "COMPLETED" || status === "FAILED") {
        await drainFinalLogs(status);
        break;
      }

      if (Date.now() - startedAt > timeoutMs) {
        appendQpuLog("Polling timeout reached; stopping updates.");
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  };

  const runMersenneQpu = async (QSnapshot: any) => {
    if (!selected || !QSnapshot || QSnapshot.inf) return;

    resetQpuLog();
    setMeasurementFile(null);
    setIsRemoteMersenneTaskActive(true);
    setShowWarningsTitle(true);
    setWarningsResults(
      "<div><b>Remote Shor (prime field)</b></div><div class=\"mono\">Status: SUBMITTING</div>",
    );
    appendQpuLog("Submitting remote Shor prime field task...");

    const order = Number(effectiveCurveParams?.n ?? selected.n);
    const controlQubits = effectiveControlQubits;
    const basePoint = effectiveCurveParams?.G ?? selected.G;
    activeRemoteRunParamsRef.current = {
      p: Number(selected.p),
      order,
      base_point: [Number(basePoint.x), Number(basePoint.y)],
    };

    const payload = {
      curve_params: {
        n_control_qubits: controlQubits,
        order,
        p_mod: Number(selected.p),
        a_param: 0,
        b_param: 7,
        base_point: [Number(basePoint.x), Number(basePoint.y)],
        public_point: [Number(QSnapshot.x), Number(QSnapshot.y)],
      },
      shots: effectiveShots,
      use_deferred_affine: false,
      log_level: 1,
    };

    try {
      const response = await fetch(
        `${firebaseFunctionsUrl}/buildandrunmersennefield`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = err?.error || "Failed to submit Shor task";
        appendQpuLog(msg);
        setWarningsResults(
          `<div><b>Remote Shor (prime field)</b></div><div class="bad">${msg}</div>`,
        );
        return;
      }

      const submission = await response.json();
      const taskId = submission?.taskId;
      if (!taskId) {
        appendQpuLog("Missing taskId in response.");
        return;
      }

      appendQpuLog(`Task submitted: ${taskId}`);
      await pollMersenneTask(taskId);
    } catch (err) {
      const msg = `Submission error: ${String(err)}`;
      appendQpuLog(msg);
      setWarningsResults(
        `<div><b>Remote Shor (prime field)</b></div><div class="bad">${msg}</div>`,
      );
    } finally {
      setIsRemoteMersenneTaskActive(false);
    }
  };

  const handleRecoverClick = async () => {
    setShowWarnings(false);
    setShowWarningsTitle(false);
    setShowResultsTitle(true);
    if (isComputingPublicQ || isRecoveringK) return;
    if (!selected || !publicQ) return;
    setIsRecoveringK(true);
    const QSnapshot = publicQ;
    clearLog();
    setResults(`<span class="muted">Running k-recovery routines…</span>`);
    setIsComputingPublicQ(true);

    const { n, p } = selected;
    const isMersenne = selected?.field === "mersenne";

    logLine(`Target: recover k from Q = kG over subgroup of order n=${n}`, "muted");
    logLine(`Curve: y² = x³ + 7 (mod p), p=${p}`, "muted");
    logLine(`Backend: CPU`, "ok");
    if (!isPrime(p)) {
      logLine(`Warning: p=${p} is not prime; estimates assume a prime field.`, "warn");
    }

    try {
      const b1_cpu = await bruteForceRecover();
      logLine(`CPU Brute force: ${b1_cpu.k === null ? "not found" : "k=" + b1_cpu.k} | time=${b1_cpu.ms.toFixed(2)}ms`, b1_cpu.k === null ? "bad" : "ok");

      const b2_cpu = await bsgsRecover();
      logLine(`CPU BSGS: ${b2_cpu.k === null ? "not found" : "k=" + b2_cpu.k} | time=${b2_cpu.ms.toFixed(2)}ms`, b2_cpu.k === null ? "bad" : "ok");

      const b3_cpu = await pollardsRhoRecover();
      logLine(`CPU Pollard's rho: ${b3_cpu.k === null ? "not found" : "k=" + b3_cpu.k} | time=${b3_cpu.ms.toFixed(2)}ms`, b3_cpu.k === null ? "warn" : "ok");

      const qe = quantumEstimates(n);
      logLine(`n bit-length s=${qe.s}`, "muted");
      logLine(`Classical work (very rough group-op counts):`, "muted");
      logLine(`  brute force:~${qe.classical.bruteOps}`, "muted");
      logLine(`  BSGS: ~${qe.classical.bsgsOps}`, "muted");
      logLine(`  Pollard's rho: ~${qe.classical.pollardOps}`, "muted");
      logLine(`Quantum-style heuristics (informal):`, "muted");
      logLine(`  Grover-accelerated brute force: ~√n ≈ ${qe.quantum.groverBruteOps}`, "muted");
      logLine(`  Quantum collision-finding heuristic: ~n^(1/3) ≈ ${qe.quantum.collisionOps_n13}`, "muted");

      const se = shorEstimates({ n, p });
      logLine(`Inputs: n≈2^${se.s}-1, p bit-length≈${se.lp}`, "muted");
      logLine(`Estimated logical qubits: ~${se.logicalQubits}`, "muted");
      logLine(`Estimated Toffoli gates: ~${se.toffoli}`, "muted");
      logLine(`Estimated circuit depth: ~${se.tDepth}`, "muted");
      logLine(`Note: These are coarse educational estimates; real circuits depend heavily on reversible modular arithmetic design.`, "warn");
      
      const effectiveG = effectiveCurveParams?.G ?? selected.G;

      setResults(`
        ${!isPrime(p) ? `<div class="warn">Warning: p=${p} is not prime; estimates assume a prime field.</div>` : ""}
        <div><span class="muted">Curve:</span> <span class="mono">y² = x³ + 7 mod p</span></div>
        <div><span class="muted">p:</span> <span class="mono">${p}</span></div>
        <div><span class="muted">Order n:</span> <span class="mono">${n}</span></div>
        <div><span class="muted">Generator G:</span> <span class="mono">${fmtPoint(effectiveG)}</span></div>
        <div><span class="muted">Secret k size:</span> <span class="mono">${qe.s} bits</span></div>
        <div><span class="muted">Public Q:</span> <span class="mono">${fmtPoint(QSnapshot)}</span></div>
        <div class="sep"></div>
        <div><b>Recovered k (CPU):</b></div>
        <div class="mono">
          1) Brute force:<br/>${b1_cpu.k === null ? "<span class='bad'>not found</span>" : `<span class='ok'>${b1_cpu.k}</span>`} (${b1_cpu.ms.toFixed(2)} ms)<br><br>
          2) Baby-step Giant-step (BSGS):<br/>${b2_cpu.k === null ? "<span class='bad'>not found</span>" : `<span class='ok'>${b2_cpu.k}</span>`} (${b2_cpu.ms.toFixed(2)} ms)<br><br>
          3) Pollard's rho:<br/>${b3_cpu.k === null ? "<span class='warn'>not found</span>" : `<span class='ok'>${b3_cpu.k}</span>`} (${b3_cpu.ms.toFixed(2)} ms)<br>
        </div>
      `);

      if (isMersenne && p === 31) {
        await runMersenneQpu(QSnapshot);
      } else {
        setWarningsResults(`
          <div><b>Quantum Pollard's rho (estimates only):</b></div>
          <div class="mono">
            Classical work (~group-ops):<br>
            &nbsp;&nbsp;brute force: <span class='bad'>${`~${qe.classical.bruteOps}`}</span><br>
            &nbsp;&nbsp;BSGS: <span class='bad'>${`~${qe.classical.bsgsOps}`}</span><br>
            &nbsp;&nbsp;Pollard's rho: <span class='bad'>${`~${qe.classical.pollardOps}`}</span><br>
            Quantum-style heuristics (estimation):<br>
            &nbsp;&nbsp;Grover-accelerated brute force: ~sqrt(n) approx <span class='bad'>${`~${qe.quantum.groverBruteOps}`}</span><br>
            &nbsp;&nbsp;Quantum collision-finding heuristic: ~n^(1/3) approx <span class='bad'>${`~${qe.quantum.collisionOps_n13}`}</span>
          </div>
          <div class="sep"></div>
          <div><b>Shor's algorithm (resource estimates only):</b></div>
          <div class="mono">
            Estimated logical qubits: <span class='bad'>~${se.logicalQubits}</span><br>
            Estimated Toffoli gates: <span class='bad'>~${se.toffoli}</span><br>
            Estimated circuit depth: <span class='bad'>~${se.tDepth}</span>
          </div>
        `);
        setShowWarningsTitle(true);
      }
    } finally {
      setIsComputingPublicQ(false);
      setIsRecoveringK(false);
    }
  };

  return (
    <div className="landing-page flex min-h-screen flex-col px-2 sm:px-4 text-center relative">
      <style>
        {`
#ecdlpOverlay0 { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:transparent; color:#1a1d2e; overflow:auto; }
#ecdlpOverlay0 header { padding: 18px 18px 10px; border-bottom: 1px solid #d0d4e0; }
#ecdlpOverlay0 h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: .2px; }
#ecdlpOverlay0 .sub { margin-top: 6px; color:#4a5568; font-size: 13px; line-height: 1.35; }
#ecdlpOverlay0 main { padding: 18px; max-width: 1100px; margin: 0 auto; }
#ecdlpOverlay0 .row { display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end; }
#ecdlpOverlay0 label { display:block; font-size: 12px; color:#4a5568; margin-bottom:6px; }
#ecdlpOverlay0 input, #ecdlpOverlay0 button, #ecdlpOverlay0 select { background: rgba(255, 255, 255, 0.9); color:#1a1d2e; border:1px solid #cbd5e0; border-radius: 10px; padding: 10px 12px; font-size: 14px; outline: none; }
#ecdlpOverlay0 select { background: rgba(255, 255, 255, 0.95); }
#ecdlpOverlay0 select option { background: rgba(255, 255, 255); color:#1a1d2e; }
#ecdlpOverlay0 input { width: 260px; }
#ecdlpOverlay0 button { cursor:pointer; font-weight: 650;}
#ecdlpOverlay0 button:disabled { opacity:.55; cursor:not-allowed; }
#ecdlpOverlay0 .pill { display:inline-block; padding: 6px 10px; border-radius:999px; background:#e8ecf4; border:1px solid #cbd5e0; color:#4a5568; font-size: 12px; }
#ecdlpOverlay0 .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 12px; margin-top: 12px; }
#ecdlpOverlay0 .card { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); border:1px solid #d0d4e0; border-radius: 16px; padding: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.08); overflow: hidden; min-width: 0; }
#ecdlpOverlay0 .card h3 { margin:0 0 8px; font-size: 14px; color:#2d3748; }
#ecdlpOverlay0 .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 13px; overflow-wrap: break-word; word-break: break-word; }
#ecdlpOverlay0 .muted { color:#718096; }
#ecdlpOverlay0 .sep { height:1px; background:#e2e8f0; margin: 12px 0; }
#ecdlpOverlay0 .log { white-space: pre-wrap; overflow-wrap: break-word; word-break: break-word; background: rgba(247, 250, 252, 0.9); backdrop-filter: blur(10px); border:1px solid #d0d4e0; border-radius: 16px; padding: 12px; max-height: 340px; overflow:auto; display: block; }
#ecdlpOverlay0 .ok { color:#22863a; }
#ecdlpOverlay0 .warn { color:#b08800; }
#ecdlpOverlay0 .bad { color:#d73a49; }
#ecdlpOverlay0 .three { display:grid; grid-template-columns: repeat(3, minmax(240px, 1fr)); gap:12px; align-items:start; }
#ecdlpOverlay0 .two { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
#ecdlpOverlay0 .resp-w { width: 250px; }
#ecdlpOverlay0 .viz-container { height: 750px; }
@media (max-width: 860px) {
  #ecdlpOverlay0 .two { grid-template-columns: 1fr; }
  #ecdlpOverlay0 .three { grid-template-columns: 1fr; }
  #ecdlpOverlay0 input { width: 100%; font-size: 16px; }
  #ecdlpOverlay0 select { width: 100%; font-size: 16px; }
  #ecdlpOverlay0 button { width: 100%; }
  #ecdlpOverlay0 .viz-container button { width: auto; }
  #ecdlpOverlay0 .resp-w { width: 100%; }
  #ecdlpOverlay0 .row { flex-direction: column; align-items: stretch; }
  #ecdlpOverlay0 header { padding: 12px 10px 8px; }
  #ecdlpOverlay0 main { padding: 12px 2px; }
  #ecdlpOverlay0 h1 { font-size: 15px; line-height: 1.3; }
  #ecdlpOverlay0 .sub { font-size: 12px; }
  #ecdlpOverlay0 .card { padding: 10px; }
  #ecdlpOverlay0 .viz-container { height: 525px; }
  #ecdlpOverlay0 .log { max-height: 240px; }
  #ecdlpOverlay0 .ecdlpTopRow { flex-direction: column; align-items: center; text-align: center; }
  #ecdlpOverlay0 .ecdlpTopRow > div { max-width: 100%; }
}
#ecdlpOverlay0 input[type="checkbox"], #ecdlpOverlay0 input[type="radio"] { width:auto; }
#ecdlpOverlay0 .inline { display:flex; align-items:center; gap:10px; margin-top: 22px; }
#ecdlpOverlay0 .inline label { margin: 0; }
#ecdlpOverlay0 .inline input[type="checkbox"] { width:16px; height:16px; padding:0; accent-color:#22863a; }
#ecdlpOverlay0 .ecdlpTopRow { display:flex; justify-content:center; gap:12px; align-items:center; text-align:center; width:100%; }
#ecdlpOverlay0 .ecdlpTopRow > div { width:100%; max-width: 920px; margin: 0 auto; }
#ecdlpOverlay0 #ecdlpBackBtn0 { background:transparent; border:1px solid #cbd5e0; color:#1a1d2e; border-radius:10px; padding:8px 10px; font-size: 12px; }
#ecdlpOverlay0 .history-table-wrap { margin-top: 18px; overflow-x: auto; }
#ecdlpOverlay0 .history-table { width: 100%; border-collapse: collapse; min-width: 760px; font-size: 12px; }
#ecdlpOverlay0 .history-table th, #ecdlpOverlay0 .history-table td { border: 1px solid #d0d4e0; padding: 8px 10px; vertical-align: top; text-align: left; }
#ecdlpOverlay0 .history-table th { background: rgba(37, 99, 235, 0.08); color: #1e3a8a; font-weight: 700; }
#ecdlpOverlay0 .history-table td { background: rgba(255, 255, 255, 0.72); }
        `}
      </style>
      <div id="ecdlpOverlay0">
        <header>
          <div className="ecdlpTopRow">
            <div>
              <h1 style={{ color: "#2563eb" }}>Quantum Computing Lab <small style={{ fontSize: "0.6em", color: "#5f6063" }}>by ScienceVR (Alpha Preview)</small></h1><br/>
              <div className="sub" style={{ margin: "0px", textAlign: "left" }}>The goal of this project is to provide an interactive, educational sandbox for learning about quantum algorithms and their classical counterparts, with a focus on Shor&apos;s algorithm for the Elliptic Curve Discrete Logarithm Problem (ECDLP). This simulator allows you to explore the problem space, run classical k-recovery algorithms, and see resource estimates for quantum approaches. For a deeper dive into the history and math behind these algorithms, check out the timeline below.</div>
              <div className="sub" style={{ marginTop: "6px", textAlign: "center", maxWidth: "800px", marginInline: "auto" }}>
                
                
                {/* <a href="/poc_stats_demo.json" target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "underline" }}>Download this measurement data from Shor's algorithm (p=31)</a> */}
                
                
                <div className="history-table-wrap">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Algorithm / Paper</th>
                        <th>Year</th>
                        <th>Problem Solved</th>
                        <th>Key Innovation</th>
                        <th>Math/Group Structure</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Deutsch <a href="https://www.youtube.com/watch?v=mpkYPEaifUg&list=PLqdVnC7OWuEcfKRZXsrooK_EPzwmWSi-N" target="_blank" rel="noreferrer" style={{textDecoration: "underline"}}>(6 lectures)</a></td>
                        <td>1985</td>
                        <td>Is f(0) = f(1)?</td>
                        <td>First quantum parallelism</td>
                        <td><span className="mono">Z<sub>2</sub></span></td>
                      </tr>
                      <tr>
                        <td>Deutsch-Jozsa</td>
                        <td>1992</td>
                        <td>Constant vs. balanced</td>
                        <td>Exponential speedup</td>
                        <td><span className="mono">Z<sub>2</sub><sup>n</sup></span></td>
                      </tr>
                      <tr>
                        <td>Bernstein-Vazirani</td>
                        <td>1993</td>
                        <td>Find bitstring s</td>
                        <td>Single-shot string extraction</td>
                        <td><span className="mono">Z<sub>2</sub><sup>n</sup></span> (linear)</td>
                      </tr>
                      <tr>
                        <td>Simon&apos;s</td>
                        <td>1994</td>
                        <td>Find XOR period s</td>
                        <td>Hidden subgroup approach</td>
                        <td><span className="mono">Z<sub>2</sub><sup>n</sup></span> (group)</td>
                      </tr>
                      <tr>
                        <td>Shor&apos;s (Discrete Log)</td>
                        <td>1994</td>
                        <td><span className="mono">g<sup>x</sup> ≡ a (mod p)</span></td>
                        <td>QFT for 2D periods</td>
                        <td><span className="mono">Z<sub>p-1</sub> × Z<sub>p-1</sub></span></td>
                      </tr>
                      <tr>
                        <td>Shor&apos;s (Factoring)</td>
                        <td>1994</td>
                        <td>Factors of N</td>
                        <td>Order-finding to factoring</td>
                        <td><span className="mono">Z<sub>r</sub> ⊂ Z<sub>N</sub></span></td>
                      </tr>
                      <tr>
                        <td>Grover&apos;s</td>
                        <td>1996</td>
                        <td>Unstructured search</td>
                        <td>Amplitude amplification</td>
                        <td>Quadratic (<span className="mono">sqrt(N)</span>)</td>
                      </tr>
                      <tr>
                        <td>Cleve et al. (Revisited)</td>
                        <td>1998</td>
                        <td>Unified framework</td>
                        <td>Deterministic phase kickback</td>
                        <td>The circuit model</td>
                      </tr>
                      <tr>
                        <td>Shor&apos;s (ECDLP)</td>
                        <td>Later</td>
                        <td>Find k in P = kQ</td>
                        <td>2D QFT over elliptic curves</td>
                        <td>Elliptic curve group</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <br/>Check out <b><a href="/gatesim" target="_blank" rel="noreferrer">CPHASE gate circuit simulator</a></b> (designed based on Artur Ekert's <a href="https://www.youtube.com/watch?v=pzC4pUK8s8A&list=PLkespgaZN4gm6tZLD8rnsiENRrg6pXX4q" target="_blank" rel="noreferrer" style={{textDecoration: "underline"}}>talks</a> and Craig Gidney's <a href="https://github.com/Strilanc/Quirk" target="_blank" rel="noreferrer" style={{textDecoration: "underline"}}>Quirk</a>).
              </div>
            </div>
          </div>
        </header>

        <main>
          <section className="card">
            <h1 style={{ color: "#2563eb", marginBottom: "12px" }}>Elliptic Curve Discrete Logarithm Problem (ECDLP) Simulator</h1>
            <div className="sub" style={{ margin: "0px", textAlign: "left" }}>
            This is an Elliptic Curve Cryptography (ECC) simulator focusing on SECP256k1-like curves: y² = x³ + 7 mod p (with much smaller p and order N in this simulator). The 256-bit prime field P and 256-bit order N that are impossible to solve in both classic and quantum settings. <span>Pick a curve based on the subgroup of order <span className="mono">n = 2^s - 1</span>, then generate a public point (public key) <span className="mono">Q = kG</span>{' '}
                and run k-recovery routines. </span>
              </div>
          </section>
          <EccControlsPanel
            status={status}
            orderSelect={orderSelect}
            predefinedCurves={predefinedCurves}
            showKeyArea={showKeyArea}
            qMode={qMode}
            kInput={kInput}
            qXInput={qXInput}
            qYInput={qYInput}
            pubInfo={pubInfo}
            showRecover={showRecover}
            isComputingPublicQ={isComputingPublicQ}
            isRecoveringK={isRecoveringK}
            selected={selected}
            phaseRegisterQubits={phaseRegisterQubits}
            recommendedPhaseRegisterQubits={recommendedPhaseRegisterQubits}
            phaseRegisterBounds={phaseRegisterBounds}
            shots={shots}
            isRemoteMersenneTaskActive={isRemoteMersenneTaskActive}
            onOrderSelectChange={handleOrderSelectChange}
            onQModeChange={handleQModeChange}
            onKInputChange={handleKInputChange}
            onQXInputChange={handleQXInputChange}
            onQYInputChange={handleQYInputChange}
            onPubBtnClick={handlePubBtnClick}
            onSetQBtnClick={handleSetQBtnClick}
            onRecoverClick={handleRecoverClick}
            onPhaseRegisterQubitsChange={handlePhaseRegisterQubitsChange}
            onShotsChange={handleShotsChange}
            optionLabelForCurve={optionLabelForCurve}
          />

          {showVisualization && (
            <div className="card" style={{ marginTop: "12px", textAlign: "left" }}>
              {/* <h3>Interactive Visualization</h3>
              <div className="mono muted" style={{ marginBottom: "10px" }}>
                y² = x³ + 7 mod {selected.p}, n={selected.n}, G=({selected.G.x}, {selected.G.y})
                {visualizationGenerator && (selected.G.x !== visualizationGenerator.x || selected.G.y !== visualizationGenerator.y) && (
                  <span> | new n={generatedMultiples.length + 1}, G=({visualizationGenerator.x}, {visualizationGenerator.y})</span>
                )}
              </div> */}
              <div className="viz-container" style={{ borderRadius: "12px", overflow: "hidden", border: "1px solid #232846" }}>
                <Ecc3DVisualization
                  p={selected.p}
                  pointOrder={Number(effectiveCurveParams?.n ?? selected.n)}
                  curvePoints={curvePoints}
                  generatorPoint={visualizationGenerator}
                  generatedPoints={generatedMultiples}
                  publicPoint={publicQ}
                  onSelectGenerator={handleVisualizationGeneratorSelect}
                  measurementFile={measurementFile}
                  onMeasurementFileChange={handleMeasurementFileChange}
                  allowMeasurementUpload={!isRemoteMersenneTaskActive}
                />
              </div>
            </div>
          )}

          <div className="two" style={{ marginTop: "12px", textAlign: "left" }}>
            <section className="card">
              {showResultsTitle && <h3 id="resultsTitle">Classical computing</h3>}
              <div id="results" className="mono muted" dangerouslySetInnerHTML={{ __html: results }}></div>
            </section>
            <section className="card">
              {showWarningsTitle && <h3 id="warningsTitle" style={{ display: showWarningsTitle ? "block" : "none" }}>Quantum computing</h3>}
              <div id="warningsResults" className="mono muted" style={{ display: warningsResults ? "block" : "none" }} dangerouslySetInnerHTML={{ __html: warningsResults }}></div>
              <div
                id="warnings"
                ref={warningsLogRef}
                onScroll={handleWarningsLogScroll}
                className="log mono"
                style={{ color: "#2563eb", display: warnings ? "block" : "none", background: "transparent", padding: "7px", marginTop: "12px" }}
              >
                {warnings}
              </div>
              {/* <div id="log" className="log mono muted" dangerouslySetInnerHTML={{ __html: log }}></div> */}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
