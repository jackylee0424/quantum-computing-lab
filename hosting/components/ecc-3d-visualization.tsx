"use client";

import React, { useRef, useState, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Line, Html, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { estimateKsFromMeasurement } from "@/lib/measurement";
import type { CurvePoint as Point } from "@/lib/ecc";

type MeasurementCounts = Record<string, number>;

export type MeasurementFile = {
  // Used by the UI to distinguish QPU-simulation measurements from uploaded JSON.
  // NOTE: Even if an uploaded JSON contains its own origin, we overwrite it to "upload".
  origin?: "qpu-simulation" | "upload";

  p: number;
  measurement_counts: MeasurementCounts;
  control_qubits_A?: number;
  control_qubits_B?: number;
  control_qubits?: number;
  shots?: number;
  shots_sampled?: number;
  secret_k?: number;
  recovered_k?: number;
  curve_parameters?: {
    base_point?: [number, number];
    max_point_order?: number;
    p?: number;
  };
  
  total_qubits: number;
  total_gates: number;
};


interface CurvePointProps {
  point: Point;
  isGenerator: boolean;
  isGenerated: boolean;
  isPublic: boolean;
  generatedIndex?: number;
  onClick: () => void;
  scale: number;
}

const CurvePoint = React.memo(function CurvePoint({ point, isGenerator, isGenerated, isPublic, generatedIndex, onClick, scale }: CurvePointProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    if (meshRef.current) {
      if (isGenerator) {
        meshRef.current.scale.setScalar(0.4 + Math.sin(state.clock.elapsedTime * 3) * 0.1);
      } else if (isGenerated) {
        meshRef.current.scale.setScalar(0.35 + Math.sin(state.clock.elapsedTime * 2 + (generatedIndex || 0)) * 0.05);
      }
    }
  });

  const color = isPublic
    ? "#da631f"
    : isGenerator
    ? "#0ad124"
    : isGenerated
    ? "#4e21a3"
    : hovered
    ? "#88ccff"
    : "#4a9eff";

  const label = isPublic
    ? isGenerator
      ? `Q = G (${point.x}, ${point.y})`
      : isGenerated && generatedIndex !== undefined
      ? `Q = ${generatedIndex + 1}G (${point.x}, ${point.y})`
      : `Q (${point.x}, ${point.y})`
    : isGenerator
    ? `G (${point.x}, ${point.y})`
    : isGenerated && generatedIndex !== undefined
    ? `${generatedIndex + 1}G (${point.x}, ${point.y})`
    : null;

  return (
    <group position={[point.x * scale, 0.2, -point.y * scale]}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isPublic ? 0.7 : isGenerator ? 0.8 : isGenerated ? 0.5 : hovered ? 0.4 : 0.2}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>
      {/* Glow effect */}
      <mesh scale={1.5}>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={isPublic ? 0.35 : isGenerator ? 0.3 : isGenerated ? 0.2 : 0.1} />
      </mesh>

      {label && (
        <Billboard position={[0, 0.7, 0]} follow={true}>
          <Text
            fontSize={0.4}
            color={isPublic ? "#cc720b" : isGenerator ? "#08c008" : "#3e04aa"}
            anchorX="center"
            anchorY="bottom"
          >
            {label}
          </Text>
        </Billboard>
      )}

      {hovered && (
        <Html position={[0, 1.2, 0]} center>
          <div className="bg-card/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-mono text-foreground whitespace-nowrap border border-border">
            ({point.x}, {point.y})
          </div>
        </Html>
      )}
    </group>
  );
});

interface GridProps {
  p: number;
  scale: number;
}

const Grid = React.memo(function Grid({ p, scale }: GridProps) {
  const gridSize = p * scale;

  const lines = useMemo(() => {
    const result: [number, number, number][][] = [];

    // X-axis lines (along Z, but negative direction)
    for (let x = 0; x <= p; x++) {
      result.push([
        [x * scale, 0, 0],
        [x * scale, 0, -gridSize],
      ]);
    }

    // Z-axis lines (along X, but at negative Z positions)
    for (let z = 0; z <= p; z++) {
      result.push([
        [0, 0, -z * scale],
        [gridSize, 0, -z * scale],
      ]);
    }

    return result;
  }, [p, scale, gridSize]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gridSize / 2, -0.01, -gridSize / 2]}>
        <planeGeometry args={[gridSize + 1, gridSize + 1]} />
        <meshStandardMaterial color="#e8ecf0" transparent opacity={0.05} />
      </mesh>

      {/* Grid lines */}
      {lines.map((line, i) => (
        <Line key={i} points={line} color="#cbd5e0" lineWidth={1} />
      ))}

      <Billboard position={[gridSize / 2, 0.1, 1.2]} follow={true}>
        <Text fontSize={0.6} color="#4a5568" anchorX="center">
          x
        </Text>
      </Billboard>
      <Billboard position={[-1.2, 0.1, -gridSize / 2]} follow={true}>
        <Text fontSize={0.6} color="#4a5568" anchorX="center">
          y
        </Text>
      </Billboard>
      <Billboard position={[gridSize + 0.8, 0.1, 0.6]} follow={true}>
        <Text fontSize={0.35} color="#4a5568" anchorX="left">
          mod {p}
        </Text>
      </Billboard>
      <Billboard position={[-0.6, 0.1, -gridSize - 0.8]} follow={true}>
        <Text fontSize={0.35} color="#4a5568" anchorX="right">
          mod {p}
        </Text>
      </Billboard>

      {Array.from({ length: p + 1 }, (_, i) => (
        <group key={`markers-${i}`}>
          {i % Math.ceil(p / 8) === 0 && (
            <>
              <Billboard position={[i * scale, 0.1, 0.6]} follow={true}>
                <Text fontSize={0.35} color="#718096" anchorX="center">
                  {i}
                </Text>
              </Billboard>
              <Billboard position={[-0.6, 0.1, -i * scale]} follow={true}>
                <Text fontSize={0.35} color="#718096" anchorX="center">
                  {i}
                </Text>
              </Billboard>
            </>
          )}
        </group>
      ))}
    </group>
  );
});

interface ConnectionLinesProps {
  generatedPoints: Point[];
  scale: number;
}

function ConnectionLines({ generatedPoints, scale }: ConnectionLinesProps) {
  if (generatedPoints.length < 2) return null;

  const points = generatedPoints.map((p) => new THREE.Vector3(p.x * scale, 0.2, -p.y * scale));

  return <Line points={points} color="#ff6b6b" lineWidth={2} opacity={0.5} transparent />;
}

const CameraController = React.memo(function CameraController({ p, scale }: { p: number; scale: number }) {
  const { camera } = useThree();
  const center = (p * scale) / 2;

  useEffect(() => {
    const distance = p * scale * 1.2;
    camera.position.set(center + distance * 0.7, distance * 0.6, -center + distance * 0.7);
    camera.lookAt(center, 0, -center);
    camera.updateProjectionMatrix();
  }, [camera, center, p, scale]);

  return null;
});

interface Ecc3DVisualizationProps {
  p: number;
  pointOrder: number;
  curvePoints: Point[];
  generatorPoint: Point | null;
  generatedPoints: Point[];
  publicPoint: Point | null;
  onSelectGenerator: (point: Point) => void;
  measurementFile?: MeasurementFile | null;
  onMeasurementFileChange?: (file: MeasurementFile | null, filename?: string) => void;
  allowMeasurementUpload?: boolean;
}

function MeasurementVolumes({
  enabled,
  p,
  pointOrder,
  generatorPoint,
  generatedPoints,
  publicPointKey,
  measurementFile,
  measurementLoadError,
  scale,
  center,
  triggerRun,
}: {
  enabled: boolean;
  p: number;
  pointOrder: number;
  generatorPoint: Point | null;
  generatedPoints: Point[];
  publicPointKey: string | null;
  measurementFile: MeasurementFile | null;
  measurementLoadError: string | null;
  scale: number;
  center: number;
  triggerRun?: number;
}) {
  const { invalidate } = useThree();
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "running" | "done">("idle");
  const [shotsProcessed, setShotsProcessed] = useState(0);
  const [shotsTotal, setShotsTotal] = useState(0);
  const [votesSnapshot, setVotesSnapshot] = useState<number[]>([]);

  const intervalRef = useRef<number | null>(null);
  const votesRef = useRef<number[]>([]);
  const cursorRef = useRef(0);
  const shotSequenceRef = useRef<string[] | null>(null);
  const prevEnabledRef = useRef<boolean>(enabled);
  const prevDataKeyRef = useRef<string | null>(null);
  const prevTriggerRunRef = useRef<number | undefined>(triggerRun);

  const data = measurementFile;
  const loadError = measurementLoadError;

  const dataKey = useMemo(() => {
    if (!data) return null;
    const base = data.curve_parameters?.base_point;
    const baseKey = Array.isArray(base) && base.length === 2 ? `${base[0]},${base[1]}` : "";
    const outcomes = Object.keys(data.measurement_counts || {}).length;
    return `${data.p}|${data.secret_k ?? ""}|${data.recovered_k ?? ""}|${baseKey}|${outcomes}`;
  }, [data]);

  const compat = useMemo(() => {
    if (!data) return { ok: false as const, reason: "Drop a measurement JSON to start streaming votes." };
    if (data.p !== p) return { ok: false as const, reason: `Measurements are for p=${data.p}, current p=${p}` };
    const base = data.curve_parameters?.base_point;
    if (base && generatorPoint && !generatorPoint.inf) {
      if (generatorPoint.x !== base[0] || generatorPoint.y !== base[1]) {
        return {
          ok: false as const,
          reason: `Measurements are for G=(${base[0]}, ${base[1]}), current G=(${generatorPoint.x}, ${generatorPoint.y})`,
        };
      }
    }
    const n = data.curve_parameters?.max_point_order;
    if (n && n !== pointOrder) return { ok: false as const, reason: `Measurements are for n=${n}, current n=${pointOrder}` };
    return { ok: true as const, reason: "" };
  }, [data, generatorPoint, p, pointOrder]);

  useEffect(() => {
    if (!enabled) return;
    setStatus(data ? "ready" : "idle");
  }, [data, enabled]);

  // Reset streaming/votes whenever the measurement visualization is toggled ON or triggerRun changes.
  useEffect(() => {
    const wasEnabled = prevEnabledRef.current;
    prevEnabledRef.current = enabled;

    const nextKey = enabled ? dataKey : null;
    const hasNewData = nextKey !== null && nextKey !== prevDataKeyRef.current;
    const triggerChanged = prevTriggerRunRef.current !== triggerRun;
    prevTriggerRunRef.current = triggerRun;
    
    if (!enabled) {
      prevDataKeyRef.current = null;
      return;
    }
    if (wasEnabled && !hasNewData && !triggerChanged) return;
    prevDataKeyRef.current = nextKey;

    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    cursorRef.current = 0;
    shotSequenceRef.current = null;
    votesRef.current = Array.from({ length: pointOrder }, () => 0);
    setVotesSnapshot(Array.from({ length: pointOrder }, () => 0));
    setShotsProcessed(0);
    setShotsTotal(0);
    setStatus(data ? "ready" : "idle");
    invalidate();
  }, [data, dataKey, enabled, invalidate, pointOrder, triggerRun]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      setStatus((s) => (s === "running" ? "ready" : s));
      return;
    }
    if (!data || !compat.ok || !generatorPoint || generatorPoint.inf) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    if (!shotSequenceRef.current) {
      const entries = Object.entries(data.measurement_counts || {});
      const total = entries.reduce((acc, [, c]) => acc + (Number.isFinite(c) ? c : 0), 0);
      setShotsTotal(total);
      votesRef.current = Array.from({ length: pointOrder }, () => 0);
      setVotesSnapshot(Array.from({ length: pointOrder }, () => 0));
      cursorRef.current = 0;

      const seq: string[] = [];
      for (const [bits, count] of entries) {
        const c = Math.max(0, Math.floor(count));
        for (let i = 0; i < c; i++) seq.push(bits);
      }
      // Deterministic-ish shuffle for nicer streaming variety.
      let seed = 0x9e3779b9 ^ (data.secret_k ?? 0) ^ (data.recovered_k ?? 0);
      const randU32 = () => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return seed >>> 0;
      };
      for (let i = seq.length - 1; i > 0; i--) {
        const j = randU32() % (i + 1);
        [seq[i], seq[j]] = [seq[j], seq[i]];
      }
      shotSequenceRef.current = seq;
      setShotsProcessed(0);
    }

    const seq = shotSequenceRef.current;
    if (!seq || cursorRef.current >= seq.length) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      setStatus("done");
      return;
    }

    const tA =
      data.control_qubits_A ??
      data.control_qubits ??
      Math.floor((shotSequenceRef.current?.[0]?.length ?? 0) / 2);
    const tB =
      data.control_qubits_B ??
      data.control_qubits ??
      ((shotSequenceRef.current?.[0]?.length ?? 0) - tA);

    const tickMs = 80;
    const batchSize = 40;

    if (intervalRef.current) return;

    setStatus("running");
    intervalRef.current = window.setInterval(() => {
      const seqNow = shotSequenceRef.current;
      if (!seqNow) return;

      const end = Math.min(cursorRef.current + batchSize, seqNow.length);
      for (let i = cursorRef.current; i < end; i++) {
        const ks = estimateKsFromMeasurement(seqNow[i], { n: pointOrder, tA, tB });
        if (!ks.length) continue;
        const weight = 1 / ks.length;
        for (const k of ks) {
          if (k <= 0 || k >= pointOrder) continue;
          votesRef.current[k] += weight;
        }
      }
      cursorRef.current = end;

      setShotsProcessed(end);
      setVotesSnapshot([...votesRef.current]);
      invalidate();

      if (end >= seqNow.length) {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        intervalRef.current = null;
        setStatus("done");
      }
    }, tickMs);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [compat.ok, data, enabled, generatorPoint, invalidate, pointOrder, triggerRun]);

  const volumes = useMemo(() => {
    if (!enabled) return [];
    if (!generatorPoint || generatorPoint.inf) return [];
    if (!data || !compat.ok) return [];
    if (!votesSnapshot.length) return [];

    const maxVote = Math.max(1, ...votesSnapshot);
    const maxStretch = 16.0;

    // Find est_k: the k with maximum votes (the estimated private key from measurements)
    let est_k = 1;
    let maxVotesFound = 0;
    for (let k = 1; k < pointOrder; k++) {
      const v = votesSnapshot[k] ?? 0;
      if (v > maxVotesFound) {
        maxVotesFound = v;
        est_k = k;
      }
    }

    // Determine the target public point index where the highest vote must appear
    // Priority: secret_k from measurement file > search for publicPoint in generatedPoints
    let public_point_idx = -1;
    
    // First try secret_k from measurement file (this is the actual k we're trying to find)
    if (data.secret_k !== undefined && data.secret_k > 0 && data.secret_k < pointOrder) {
      public_point_idx = data.secret_k - 1; // secret_k corresponds to index secret_k - 1 in generatedPoints
    }
    
    // Fall back to searching for publicPoint in generatedPoints
    if (public_point_idx < 0 && publicPointKey) {
      for (let i = 0; i < generatedPoints.length; i++) {
        const pt = generatedPoints[i];
        if (pt && !pt.inf && `${pt.x},${pt.y}` === publicPointKey) {
          public_point_idx = i;
          break;
        }
      }
    }

    // If still not found, no shifting (fallback)
    if (public_point_idx < 0) {
      public_point_idx = est_k - 1;
    }

    const cycleLen = pointOrder - 1; // valid k range is [1, pointOrder-1], so indices [0, pointOrder-2]

    const result: Array<{
      k: number;
      point: Point;
      sy: number;
      isPublic: boolean;
      isTopVote: boolean;
      votes: number;
      norm: number;
    }> = [];

    for (let k = 1; k < pointOrder; k++) {
      const votes = votesSnapshot[k] ?? 0;
      if (votes <= 0) continue;

      // Compute the display index: shift so that est_k maps to public_point_idx
      // For k=est_k (highest votes), we want new_idx = public_point_idx
      // offset = k - est_k, so when k = est_k, offset = 0, new_idx = public_point_idx
      const offset = k - est_k;
      let new_idx = ((public_point_idx + offset) % cycleLen + cycleLen) % cycleLen;

      const point = generatedPoints[new_idx];
      if (!point || point.inf) continue;
      
      const pointKey = `${point.x},${point.y}`;
      const isPublic = publicPointKey === pointKey;
      const isTopVote = Math.abs(votes - maxVote) < 1e-9;
      const norm = Math.pow(votes / maxVote, 0.25); // adjusted from 2.5 for better visual scaling
      const sy = 0.6 + norm * maxStretch;
      // Display the original k value from votes (e.g., k=15) but positioned at shifted location (e.g., 13G)
      result.push({ k, point, sy, isPublic, isTopVote, votes, norm });
    }

    // Render tallest first (helps with transparency a bit).
    result.sort((a, b) => b.sy - a.sy);
    return result.map((v) => ({ ...v, sy: Math.max(0.6, v.sy), point: v.point }));
  }, [compat.ok, data, enabled, generatedPoints, generatorPoint, pointOrder, publicPointKey, votesSnapshot]);

  if (!enabled) return null;

  return (
    <>
      {volumes.map(({ k, point, sy, isPublic, isTopVote, votes, norm }) => {
        const clampedNorm = Math.min(1, Math.max(0, norm));
        const lowColor = new THREE.Color("#e8f4f8");
        const highColor = new THREE.Color("#b73bc79d");
        const topColor = new THREE.Color("#b73bc7");
        const volumeColor = isTopVote ? topColor : highColor;
        const colorObj = lowColor.lerp(highColor, clampedNorm);
        const labelColor = isTopVote ? topColor.getStyle() : colorObj.clone().lerp(new THREE.Color("#1a5a28"), 0.55).getStyle();
        const r = 0.28;
        const planeY = 0.2;
        const y = planeY;
        return (
          <group key={`meas-${k}`} position={[point.x * scale, y, -point.y * scale]}>
            <mesh scale={[1.0, sy, 1.0]}>
              <sphereGeometry args={[r, 18, 18]} />
              <meshStandardMaterial
                color={volumeColor}
                emissive={volumeColor}
                emissiveIntensity={isPublic ? 0.55 : 0.25 + 0.45 * clampedNorm}
                transparent
                opacity={0.35}
                depthWrite={false}
                metalness={0.2}
                roughness={0.35}
              />
            </mesh>
            <mesh scale={[1.06, sy * 1.02, 1.06]}>
              <sphereGeometry args={[r, 12, 12]} />
              <meshBasicMaterial color={lowColor} transparent opacity={0.12} depthWrite={false} />
            </mesh>
            <Billboard position={[0, r * sy + 0.55, 0]} follow={true}>
              <Text fontSize={0.32} color={labelColor} anchorX="center" outlineWidth={0.03} outlineColor="#ffffff">
                k={k} ({votes.toFixed(0)})
              </Text>
            </Billboard>
          </group>
        );
      })}

      {/* Lightweight status in 3D space (kept minimal to avoid clutter) */}
      {!compat.ok && (
        <Billboard position={[center, 3, -center]} follow={true}>
          <Text fontSize={0.35} color="#d73a49" anchorX="left" outlineWidth={0.04} outlineColor="#ffffff">
            {compat.reason}
          </Text>
        </Billboard>
      )}

      {loadError && (
        <Billboard position={[center, 2.4, -center]} follow={true}>
          <Text fontSize={0.35} color="#d73a49" anchorX="left" outlineWidth={0.04} outlineColor="#ffffff">
            Failed to load measurements: {loadError}
          </Text>
        </Billboard>
      )}

      {compat.ok && (
        <Billboard position={[center, 2.2, -center]} follow={true}>
          <Text fontSize={0.32} color="#4a5568" anchorX="left" outlineWidth={0.03} outlineColor="#ffffff">
            measurements: {shotsProcessed}/{shotsTotal} · {status}
          </Text>
        </Billboard>
      )}
    </>
  );
}

export const Ecc3DVisualization = React.memo(function Ecc3DVisualization({ 
  p, 
  pointOrder,
  curvePoints, 
  generatorPoint, 
  generatedPoints,
  publicPoint,
  onSelectGenerator,
  measurementFile,
  onMeasurementFileChange,
  allowMeasurementUpload = true,
}: Ecc3DVisualizationProps) {
  console.time('Ecc3DVisualization render');
  const scale = useMemo(() => Math.max(0.5, 8 / p), [p]);
  const center = useMemo(() => (p * scale) / 2, [p, scale]);
  const [localMeasurementFile, setLocalMeasurementFile] = useState<MeasurementFile | null>(null);
  const [localMeasurementName, setLocalMeasurementName] = useState<string | null>(null);
  const [localMeasurementLoadError, setLocalMeasurementLoadError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveMeasurementFile = measurementFile !== undefined ? measurementFile : localMeasurementFile;
  const effectiveMeasurementName = localMeasurementName;
  const effectiveMeasurementLoadError = localMeasurementLoadError;
  const measurementsEnabled = !!effectiveMeasurementFile;
  const publicKey = useMemo(() => {
    if (!publicPoint || publicPoint.inf) return null;
    return `${publicPoint.x},${publicPoint.y}`;
  }, [publicPoint]);

  const generatedSet = useMemo(() => {
    return new Set(generatedPoints.map((pt) => `${pt.x},${pt.y}`));
  }, [generatedPoints]);

  const handleMeasurementFile = React.useCallback(async (file: File) => {
      const name = file?.name || "measurements.json";
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== "object") throw new Error("JSON root must be an object.");
        const asAny = parsed as any;
        if (!Number.isFinite(asAny.p)) throw new Error('Missing/invalid "p" in JSON.');
        if (!asAny.measurement_counts || typeof asAny.measurement_counts !== "object") throw new Error('Missing/invalid "measurement_counts" in JSON.');

        // Treat any JSON loaded from disk as an upload, even if it was previously exported.
        asAny.origin = "upload";

        setLocalMeasurementFile(asAny as MeasurementFile);
        setLocalMeasurementName(name);
        setLocalMeasurementLoadError(null);
        onMeasurementFileChange?.(asAny as MeasurementFile, name);
      } catch (e) {
        const msg = String((e as any)?.message || e);
        setLocalMeasurementLoadError(msg);
        setLocalMeasurementFile(null);
        setLocalMeasurementName(null);
        onMeasurementFileChange?.(null);
      }
  }, [onMeasurementFileChange]);

  const clearMeasurements = React.useCallback(() => {
      setLocalMeasurementLoadError(null);
      setLocalMeasurementFile(null);
      setLocalMeasurementName(null);
      onMeasurementFileChange?.(null);
  }, [onMeasurementFileChange]);

  const [runTrigger, setRunTrigger] = useState<number>(0);

  const handleRunClick = React.useCallback(() => {
      // Reset generator to the one from the measurement file if available
      const basePoint = effectiveMeasurementFile?.curve_parameters?.base_point;
      if (basePoint && Array.isArray(basePoint) && basePoint.length === 2) {
        const [x, y] = basePoint;
        onSelectGenerator({ x, y });
      }
      setRunTrigger((prev) => prev + 1);
  }, [effectiveMeasurementFile, onSelectGenerator]);

  const downloadMeasurements = React.useCallback(() => {
      const data = effectiveMeasurementFile;
      if (!data) return;

      const normalized: MeasurementFile = {
        ...data,
        // Always include curve parameters in the downloaded payload.
        curve_parameters: {
          ...(data.curve_parameters ?? {}),
          base_point:
            data.curve_parameters?.base_point ??
            (generatorPoint && !generatorPoint.inf ? [generatorPoint.x, generatorPoint.y] : undefined),
          max_point_order: data.curve_parameters?.max_point_order ?? (Number.isFinite(pointOrder) ? pointOrder : undefined),
          p: data.curve_parameters?.p ?? (Number.isFinite(p) ? p : data.p),
        },
      };

      const safeP = normalized?.p ?? p;
      const safeN = normalized?.curve_parameters?.max_point_order ?? pointOrder;
      const kPart = normalized.secret_k !== undefined ? `_k${normalized.secret_k}` : "";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `ecc_measurements_p${safeP}_n${safeN}${kPart}_${stamp}.json`;

      const json = JSON.stringify(normalized, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
  }, [effectiveMeasurementFile, generatorPoint, p, pointOrder]);

  return (
    <div className="relative w-full h-full" style={{ position: "absolute", top: 0, left: 0, borderRadius: "12px", overflow: "hidden", border: "1px solid #d0d4e0" }}>
      <Canvas camera={{ fov: 50, near: 0.1, far: 1000 }} frameloop="demand">
        <color attach="background" args={["#f8f9fb"]} />
        <fog attach="fog" args={["#f8f9fb", 20, 100]} />

        <CameraController p={p} scale={scale} />

        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <pointLight position={[center, 15, -center]} intensity={1} color="#ffffff" />
        <pointLight position={[0, 10, 0]} intensity={0.5} color="#4a9eff" />
        <pointLight position={[p * scale, 10, -p * scale]} intensity={0.5} color="#00ffaa" />

        {/* Grid */}
        <Grid p={p} scale={scale} />

        {/* Curve points */}
        {curvePoints.map((point, i) => {
          const isGenerator = generatorPoint?.x === point.x && generatorPoint?.y === point.y;
          const pointKey = `${point.x},${point.y}`;
          const isGenerated = !isGenerator && generatedSet.has(pointKey);
          const isPublic = publicKey === pointKey;
          const generatedIndex = isGenerated
            ? generatedPoints.findIndex((gp) => gp.x === point.x && gp.y === point.y)
            : undefined;

          return (
            <CurvePoint
              key={`${point.x}-${point.y}`}
              point={point}
              isGenerator={isGenerator}
              isGenerated={isGenerated}
              isPublic={isPublic}
              generatedIndex={generatedIndex}
              onClick={() => onSelectGenerator(point)}
              scale={scale}
            />
          );
        })}

        <MeasurementVolumes
          enabled={measurementsEnabled}
          p={p}
          pointOrder={pointOrder}
          generatorPoint={generatorPoint}
          generatedPoints={generatedPoints}
          publicPointKey={publicKey}
          measurementFile={effectiveMeasurementFile}
          measurementLoadError={effectiveMeasurementLoadError}
          scale={scale}
          center={center}
          triggerRun={runTrigger}
        />

        <OrbitControls
          target={[center, 0, -center]}
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={5}
          maxDistance={100}
          makeDefault
        />
      </Canvas>

      {/* Measurement file drop/upload overlay */}
      {allowMeasurementUpload && <div className="hidden sm:flex absolute top-4 left-4 items-center gap-2">
        <div
          className={[
            "bg-card/80 backdrop-blur-sm rounded-lg border border-border text-xs",
            "px-3 py-2",
            "cursor-pointer select-none",
            dropActive ? "ring-2 ring-[#ffb347]/70 border-[#ffb347]/70" : "",
          ].join(" ")}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropActive(false);
            const file = e.dataTransfer?.files?.[0];
            if (file) void handleMeasurementFile(file);
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex flex-col leading-tight">
              <span className="text-foreground">
                {measurementsEnabled ? "Shor's ECC algorithm measurements loaded" : "Drop circuit measurement JSON"}
              </span>
              <span className="text-muted-foreground text-xs">
                {measurementsEnabled
                  ? `${effectiveMeasurementName ?? `p=${effectiveMeasurementFile?.p}`}${effectiveMeasurementFile?.secret_k !== undefined ? ` (k=${effectiveMeasurementFile.secret_k})` : ""}`
                  : "(or click to browse)"}
              </span>
            </div>

            {measurementsEnabled && (
              <div className="hidden sm:block">

                {/* run streaming vote button */}
                <button
                className="ml-2 rounded px-2 py-1 border border-border bg-background/40 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRunClick();
                }}
              >
                Run
              </button>

              {/* download button */}
              {effectiveMeasurementFile?.origin === "qpu-simulation" && (
                <button
                  className="ml-2 rounded px-2 py-1 border border-border bg-background/40 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadMeasurements();
                  }}
                >
                  Download
                </button>
              )}

                {/* clear button */}
              <button
                className="ml-2 rounded px-2 py-1 border border-border bg-background/40 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  clearMeasurements();
                }}
              >
                Clear
              </button>
              </div>
            )}


          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleMeasurementFile(file);
              e.currentTarget.value = "";
            }}
          />
        </div>

        {effectiveMeasurementLoadError && (
          <div className="bg-card/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-border text-xs text-[#ff6b6b] max-w-[340px]">
            {effectiveMeasurementLoadError}
          </div>
        )}
      </div>}

      {/* Legend overlay */}
      <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm rounded-lg p-3 border border-border">
        <div className="flex flex-col gap-2 text-xs"><b style={{ color: "#2563eb" }}>Elliptic Curve</b>
            y² = x³ + 7 mod {p}
          {generatorPoint && !generatorPoint.inf && (
            <div className="text-muted-foreground">
              <span className="muted">Selected G:</span> <span className="mono">({generatorPoint.x}, {generatorPoint.y})</span>
              {Number.isFinite(pointOrder) ? <span className="muted"> · n={pointOrder}</span> : null}
            </div>
          )}
          {/* <div className="flex items-center gap-2 mt-1">
            <div className="w-3 h-3 rounded-full bg-[#4a9eff]" />
            <span className="text-muted-foreground">Curve Point</span>
          </div> */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#00ffaa]" />
            <span className="text-muted-foreground">Generator (G)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ffb347]" />
            <span className="text-muted-foreground">Public Point (Q=kG)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#b19cd9]" />
            <span className="text-muted-foreground">Curve Point (nG)</span>
          </div>
          {/* <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#4a9eff]/40 border border-[#4a9eff]/60" />
            <span className="text-muted-foreground">Measurement votes (k candidates)</span>
          </div> */}
        </div>
      </div>

      {/* Mobile-only replay button */}
      {measurementsEnabled && (
        <button
          className="sm:hidden absolute bottom-3 right-3 z-10 flex items-center justify-center w-9 h-9 rounded bg-card/80 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            handleRunClick();
          }}
          aria-label="Replay animation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}

      {publicPoint && (
        <div className="absolute top-4 right-4 bg-card/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-border">
          <p className="text-xs text-muted-foreground">
            {publicPoint.inf
              ? "Q = INF (point at infinity)"
              : `Q = (${publicPoint.x}, ${publicPoint.y}) mod ${p}`}
          </p>
        </div>
      )}

      {/* Instructions overlay */}
      {/* <div className="absolute top-4 left-4 bg-card/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-border">
        <p className="text-xs text-muted-foreground">
          Drag to rotate • Scroll to zoom • Click a point to select generator
        </p>
      </div> */}
    </div>
  );
  console.timeEnd('Ecc3DVisualization render');
});
