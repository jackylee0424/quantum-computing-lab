"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";

type MermaidDiagramProps = {
  chart: string;
  className?: string;
  title?: string;
};

let initialized = false;

export function MermaidDiagram({ chart, className, title = "Mermaid diagram" }: MermaidDiagramProps) {
  const reactId = useId();
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function renderChart() {
      try {
        if (!initialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "loose",
            theme: "dark",
          });
          initialized = true;
        }

        const elementId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
        const { svg: renderedSvg } = await mermaid.render(elementId, chart);
        if (!cancelled) {
          setSvg(renderedSvg);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render Mermaid diagram.");
          setSvg("");
        }
      }
    }

    renderChart();
    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  return (
    <div className={className}>
      <pre aria-label="Gold CPHASE Mermaid source" hidden>{chart}</pre>
      {svg ? (
        <div aria-label={title} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : error ? (
        <div role="alert">{error}</div>
      ) : (
        <div aria-label={`${title} loading`}>Rendering diagram…</div>
      )}
    </div>
  );
}
