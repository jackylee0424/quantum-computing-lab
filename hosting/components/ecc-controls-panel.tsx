import type { ChangeEvent } from "react";

import type { CurvePoint } from "@/lib/ecc";
import type { PredefinedCurve } from "@/lib/curves";

type Props = {
  status: string;
  orderSelect: string;
  predefinedCurves: PredefinedCurve[];
  showKeyArea: boolean;
  qMode: string;
  kInput: string;
  qXInput: string;
  qYInput: string;
  pubInfo: string;
  showRecover: boolean;
  isComputingPublicQ: boolean;
  isRecoveringK: boolean;
  selected: PredefinedCurve | null;
  phaseRegisterQubits: string;
  recommendedPhaseRegisterQubits: number;
  phaseRegisterBounds: { min: number; max: number };
  shots: string;
  isRemoteMersenneTaskActive: boolean;
  onOrderSelectChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onQModeChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onKInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onQXInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onQYInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPubBtnClick: () => void;
  onSetQBtnClick: () => void;
  onRecoverClick: () => void;
  onPhaseRegisterQubitsChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onShotsChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  optionLabelForCurve: (curve: PredefinedCurve) => string;
};

export function EccControlsPanel({
  status,
  orderSelect,
  predefinedCurves,
  showKeyArea,
  qMode,
  kInput,
  qXInput,
  qYInput,
  pubInfo,
  showRecover,
  isComputingPublicQ,
  isRecoveringK,
  selected,
  phaseRegisterQubits,
  recommendedPhaseRegisterQubits,
  phaseRegisterBounds,
  shots,
  isRemoteMersenneTaskActive,
  onOrderSelectChange,
  onQModeChange,
  onKInputChange,
  onQXInputChange,
  onQYInputChange,
  onPubBtnClick,
  onSetQBtnClick,
  onRecoverClick,
  onPhaseRegisterQubitsChange,
  onShotsChange,
  optionLabelForCurve,
}: Props) {
  return (
    <>
      <section className="card mt-3">
        <div className="row">
          <div>
            <label htmlFor="orderSelect">Select subgroup order n (predefined)</label>
            <select id="orderSelect" value={orderSelect} onChange={onOrderSelectChange}>
              {predefinedCurves.map((curve) => (
                <option key={`${curve.n}-${curve.p}-${curve.G.x}-${curve.G.y}`} value={curve.n} disabled={curve.n > 31}>
                  {optionLabelForCurve(curve)}
                </option>
              ))}
            </select>
          </div>
          <div id="status" className="sub" style={{ margin: "10px" }}>
            {status}
          </div>
        </div>
      </section>

      {showKeyArea && (
        <div id="keyArea" className="card" style={{ marginTop: "12px", textAlign: "left" }}>
          <div className="three">
            <div>
              <h3>Specify a public point (public key)</h3>
              <label htmlFor="phaseRegisterQubits">Generate public point (Q = kG) or use manual Q (x,y)</label>
              <div className="row">
                <div>
                  <select id="qMode" value={qMode} onChange={onQModeChange} className="resp-w" style={{ color: "#2563eb" }}>
                    <option value="k">Generate Q = kG</option>
                    <option value="manual">Manual Q (x,y)</option>
                  </select>
                </div>
              </div>

              {qMode === "k" && (
                <div className="row" id="fromKRow" style={{ marginTop: "10px" }}>
                  <div>
                    <label htmlFor="kInput">Choose secret k (1 &lt; k &lt; n)</label>
                    <input className="resp-w" style={{ color: "#2563eb" }} id="kInput" inputMode="numeric" placeholder="Enter k" value={kInput} onChange={onKInputChange} />
                  </div>
                  <button id="pubBtn" className="resp-w" style={{ color: "#2563eb" }} onClick={onPubBtnClick} disabled={isComputingPublicQ}>
                    Generate public point (Q=kG)
                  </button>
                </div>
              )}

              {qMode === "manual" && (
                <div className="row" id="manualQRow" style={{ marginTop: "10px" }}>
                  <div>
                    <label htmlFor="qXInput">Q.x (0 = x &lt; p)</label>
                    <input className="resp-w" style={{ color: "#2563eb" }} id="qXInput" inputMode="numeric" placeholder="Enter x" value={qXInput} onChange={onQXInputChange} />
                  </div>
                  <div>
                    <label htmlFor="qYInput">Q.y (0 = y &lt; p)</label>
                    <input className="resp-w" style={{ color: "#2563eb" }} id="qYInput" inputMode="numeric" placeholder="Enter y" value={qYInput} onChange={onQYInputChange} />
                  </div>
                  <button id="setQBtn" className="resp-w" style={{ color: "#2563eb" }} onClick={onSetQBtnClick}>
                    Use manual Q
                  </button>
                </div>
              )}

              <div id="pubInfo" className="mono" style={{ marginTop: "10px" }}>
                {pubInfo}
              </div>
              <div className="sep"></div>
              {showRecover && (
                <button id="recoverBtn" className="resp-w" style={{ color: "#2563eb" }} onClick={onRecoverClick} disabled={isRecoveringK}>
                  Recover k
                </button>
              )}
            </div>

            {selected?.p === 31 && (
              <div>
                <h3>Shor&apos;s Algorithm Phase Registers (a/b qubits)</h3>
                <div className="row">
                  <div>
                    <label htmlFor="phaseRegisterQubits">Control qubits (A=B)</label>
                    <select
                      id="phaseRegisterQubits"
                      value={phaseRegisterQubits}
                      onChange={onPhaseRegisterQubitsChange}
                      disabled={isRemoteMersenneTaskActive}
                    >
                      <option value="auto">
                        Auto
                        {selected ? ` (${recommendedPhaseRegisterQubits} control qubits)` : ""}
                      </option>
                      {selected && (
                        <option value="__recommended" disabled>
                          Recommended: {recommendedPhaseRegisterQubits} (ceil(log2(n))+1)
                        </option>
                      )}
                      {Array.from({ length: 8 }, (_, index) => 3 + index).map((value) => (
                        <option key={value} value={String(value)} disabled={value < phaseRegisterBounds.min || value > phaseRegisterBounds.max}>
                          {value} control qubits
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {selected?.p === 31 && (
              <div>
                <h3>Measurements/Shots</h3>
                <div className="row">
                  <div>
                    <label htmlFor="shotsSelect">Number of shots</label>
                    <select id="shotsSelect" value={shots} onChange={onShotsChange} disabled={isRemoteMersenneTaskActive}>
                      <option value="10000">10000</option>
                      <option value="2048">2048</option>
                      <option value="1024">1024</option>
                      <option value="1000">1000</option>
                      <option value="100">100</option>
                      <option value="10">10</option>
                      <option value="1">1</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
