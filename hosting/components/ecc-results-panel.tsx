import type { ReactNode, RefObject, UIEventHandler } from "react";

type Props = {
  results: ReactNode;
  warningsResults: ReactNode;
  warnings: string;
  showResultsTitle: boolean;
  showWarningsTitle: boolean;
  warningsLogRef: RefObject<HTMLDivElement | null>;
  onWarningsLogScroll: UIEventHandler<HTMLDivElement>;
};

export function EccResultsPanel({
  results,
  warningsResults,
  warnings,
  showResultsTitle,
  showWarningsTitle,
  warningsLogRef,
  onWarningsLogScroll,
}: Props) {
  return (
    <div className="two" style={{ marginTop: "12px", textAlign: "left" }}>
      <section className="card">
        {showResultsTitle && <h3 id="resultsTitle">Classical computing</h3>}
        <div id="results" className="mono muted">{results}</div>
      </section>
      <section className="card">
        {showWarningsTitle && (
          <h3 id="warningsTitle" style={{ display: showWarningsTitle ? "block" : "none" }}>
            Quantum computing
          </h3>
        )}
        <div
          id="warningsResults"
          className="mono muted"
          style={{ display: warningsResults ? "block" : "none" }}
        >
          {warningsResults}
        </div>
        <div
          id="warnings"
          ref={warningsLogRef}
          onScroll={onWarningsLogScroll}
          className="log mono"
          style={{ color: "#2563eb", display: warnings ? "block" : "none", background: "transparent", padding: "7px", marginTop: "12px" }}
        >
          {warnings}
        </div>
      </section>
    </div>
  );
}
