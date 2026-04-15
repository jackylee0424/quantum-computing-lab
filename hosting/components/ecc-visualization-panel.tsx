import { Ecc3DVisualization, type MeasurementFile } from "@/components/ecc-3d-visualization";
import type { CurvePoint } from "@/lib/ecc";

type Props = {
  showVisualization: boolean;
  p: number;
  pointOrder: number;
  curvePoints: CurvePoint[];
  generatorPoint: CurvePoint | null;
  generatedPoints: CurvePoint[];
  publicPoint: CurvePoint | null;
  measurementFile: MeasurementFile | null;
  allowMeasurementUpload: boolean;
  onSelectGenerator: (point: CurvePoint) => void;
  onMeasurementFileChange: (file: MeasurementFile | null, filename?: string) => void;
};

export function EccVisualizationPanel({
  showVisualization,
  p,
  pointOrder,
  curvePoints,
  generatorPoint,
  generatedPoints,
  publicPoint,
  measurementFile,
  allowMeasurementUpload,
  onSelectGenerator,
  onMeasurementFileChange,
}: Props) {
  if (!showVisualization) return null;

  return (
    <div className="card" style={{ marginTop: "12px", textAlign: "left" }}>
      <div className="viz-container" style={{ borderRadius: "12px", overflow: "hidden", border: "1px solid #232846" }}>
        <Ecc3DVisualization
          p={p}
          pointOrder={pointOrder}
          curvePoints={curvePoints}
          generatorPoint={generatorPoint}
          generatedPoints={generatedPoints}
          publicPoint={publicPoint}
          onSelectGenerator={onSelectGenerator}
          measurementFile={measurementFile}
          onMeasurementFileChange={onMeasurementFileChange}
          allowMeasurementUpload={allowMeasurementUpload}
        />
      </div>
    </div>
  );
}
