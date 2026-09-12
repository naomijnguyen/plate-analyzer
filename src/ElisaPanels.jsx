import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { Plus, Trash2, Download } from "lucide-react";
import Papa from "papaparse";
import { fourPL } from "./elisa.js";
import { whiteBackground } from "./ResultsChart.jsx";

const fmt = (v) =>
  v === null || v === undefined ? "N/A" : Number(v.toPrecision(5)).toString();
export function downloadCSV(rows, name) {
  const url = URL.createObjectURL(
    new Blob([Papa.unparse(rows, { escapeFormulae: true })], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Calibration({
  standards,
  setStandards,
  plateIds,
  dilutions,
  setDilutions,
  units,
  setUnits,
}) {
  const known = new Set(standards.map((s) => s.id.trim().toUpperCase()));
  const samples = [
    ...new Set(
      plateIds
        .flat()
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && !known.has(s)),
    ),
  ];
  return (
    <>
      <section>
        <div className="section-heading">
          <h2>Standard concentrations</h2>
          <label>
            Concentration units
            <input
              aria-label="Concentration units"
              maxLength={30}
              value={units}
              onChange={(e) => setUnits(e.target.value)}
            />
          </label>
        </div>
        <div className="muted">
          4PL · Increasing response · Unweighted standard means · No blank
          subtraction
        </div>
        <div className="calibration-rows">
          {standards.map((s, i) => (
            <div className="calibration-row" key={i}>
              <label>
                Standard ID
                <input
                  aria-label={"Standard ID " + (i + 1)}
                  value={s.id}
                  maxLength={80}
                  onChange={(e) =>
                    setStandards(
                      standards.map((v, j) =>
                        j === i ? { ...v, id: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Concentration
                <input
                  aria-label={"Standard concentration " + (i + 1)}
                  type="number"
                  min="0"
                  step="any"
                  value={s.concentration}
                  onChange={(e) =>
                    setStandards(
                      standards.map((v, j) =>
                        j === i ? { ...v, concentration: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <button
                className="icon-button danger"
                title="Remove standard"
                aria-label={"Remove standard " + (i + 1)}
                onClick={() =>
                  setStandards(standards.filter((_, j) => j !== i))
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="icon-button"
          title="Add standard"
          aria-label="Add standard"
          disabled={standards.length >= 24}
          onClick={() =>
            setStandards([...standards, { id: "", concentration: "" }])
          }
        >
          <Plus size={18} />
        </button>
      </section>
      <section>
        <h2>Sample dilutions</h2>
        {!samples.length ? (
          <span className="muted">No unknown samples in the plate map</span>
        ) : (
          <div className="dilution-grid">
            {samples.map((id) => (
              <label key={id}>
                {id} · Dilution factor
                <input
                  aria-label={"Dilution " + id}
                  type="number"
                  min="1"
                  step="any"
                  value={dilutions[id] ?? 1}
                  onChange={(e) =>
                    setDilutions({ ...dilutions, [id]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function ElisaResults({ result }) {
  const canvas = useRef(null),
    { curve, samples } = result,
    units = result.assay.units;
  useEffect(() => {
    const points = Array.from({ length: 151 }, (_, i) => {
      const x = (curve.xmax * i) / 150;
      return { x, y: fourPL(curve.parameters, x) };
    });
    const chart = new Chart(canvas.current, {
      type: "scatter",
      plugins: [whiteBackground],
      data: {
        datasets: [
          {
            label: "4PL fit",
            type: "line",
            data: points,
            borderColor: "#267f76",
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: "Standard means",
            data: curve.standards.map((s) => ({ x: s.x, y: s.y })),
            backgroundColor: "#a64164",
            pointRadius: 5,
          },
          {
            label: "Unknowns (before dilution)",
            data: samples
              .filter((s) => s.concentration !== null)
              .map((s) => ({ x: s.concentration, y: s.mean, id: s.id })),
            backgroundColor: "#bd7c18",
            pointStyle: "triangle",
            pointRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: { type: "linear", min: 0, title: { display: true, text: units } },
          y: { title: { display: true, text: "Absorbance (OD)" } },
        },
        plugins: {
          legend: { labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (item) =>
                (item.raw.id ? item.raw.id + ": " : item.dataset.label + ": ") +
                fmt(item.parsed.x) +
                " " +
                units +
                ", " +
                fmt(item.parsed.y) +
                " OD",
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [curve, samples, units]);
  function exportSamples() {
    downloadCSV(
      samples.map((s) => ({
        sample: s.id,
        group: s.group,
        wells: s.wells.map((w) => w.well).join(";"),
        technical_repeats: s.n,
        mean_OD: s.mean,
        SD_OD: s.sd,
        CV_percent: s.cv,
        dilution_factor: s.dilution,
        interpolated_concentration: s.concentration,
        adjusted_concentration: s.adjusted,
        units,
        status: s.status,
      })),
      "elisa-sample-concentrations.csv",
    );
  }
  function exportCurve() {
    downloadCSV(
      curve.standards.map((s) => ({
        standard: s.id,
        nominal_concentration: s.x,
        units,
        well_count: s.n,
        mean_OD: s.y,
        SD_OD: s.sd,
        CV_percent: s.cv,
        fitted_OD: s.fitted,
        residual_OD: s.y - s.fitted,
        back_calculated: s.backCalculated,
        recovery_percent:
          s.x > 0 && s.backCalculated !== null
            ? (s.backCalculated / s.x) * 100
            : null,
        bottom: curve.parameters[0],
        top: curve.parameters[1],
        midpoint: curve.parameters[2],
        slope: curve.parameters[3],
        R_squared: curve.r2,
        RMSE_OD: curve.rmse,
        model:
          "Increasing 4PL; unweighted standard means; no blank subtraction",
      })),
      "elisa-standard-curve.csv",
    );
  }
  return (
    <>
      <section>
        <div className="section-heading">
          <h2>ELISA standard curve</h2>
          <button onClick={exportCurve}>
            <Download size={17} />
            Curve CSV
          </button>
        </div>
        <div className="muted">
          4PL · R² {fmt(curve.r2)} · RMSE {fmt(curve.rmse)} OD · Calibration{" "}
          {fmt(curve.xmin)}–{fmt(curve.xmax)} {units}
        </div>
        {curve.warnings.map((w) => (
          <div className="warning" role="status" key={w}>
            {w}
          </div>
        ))}
        <div className="plot">
          <canvas
            ref={canvas}
            role="img"
            aria-label="ELISA four-parameter standard curve"
          />
        </div>
        <button
          className="icon-button"
          title="Download standard curve PNG"
          aria-label="Download standard curve PNG"
          onClick={() => {
            const a = document.createElement("a");
            a.href = canvas.current.toDataURL("image/png");
            a.download = "elisa-standard-curve.png";
            a.click();
          }}
        >
          <Download size={18} />
        </button>
        <details>
          <summary>Parameters and standard back-calculations</summary>
          <div className="well-values">
            {["Bottom", "Top", "Midpoint", "Slope"].map((label, i) => (
              <span key={label}>
                {label}: {fmt(curve.parameters[i])}
              </span>
            ))}
          </div>
          <div className="table-scroll">
            <table className="numeric">
              <thead>
                <tr>
                  {[
                    "Standard",
                    "Nominal",
                    "Mean OD",
                    "SD OD",
                    "CV (%)",
                    "Fitted OD",
                    "Residual OD",
                    "Back-calculated",
                    "Recovery (%)",
                  ].map((v) => (
                    <th key={v}>{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {curve.standards.map((s) => (
                  <tr key={s.id}>
                    <th>{s.id}</th>
                    {[
                      s.x,
                      s.y,
                      s.sd,
                      s.cv,
                      s.fitted,
                      s.y - s.fitted,
                      s.backCalculated,
                      s.x > 0 && s.backCalculated !== null
                        ? (s.backCalculated / s.x) * 100
                        : null,
                    ].map((v, i) => (
                      <td key={i}>{fmt(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section>
        <div className="section-heading">
          <h2>Sample concentrations ({units})</h2>
          <button onClick={exportSamples}>
            <Download size={17} />
            Samples CSV
          </button>
        </div>
        <div className="table-scroll">
          <table className="numeric">
            <thead>
              <tr>
                {[
                  "Sample",
                  "Group",
                  "Repeats",
                  "Mean OD",
                  "SD OD",
                  "CV (%)",
                  "Dilution",
                  "Interpolated",
                  "Adjusted",
                  "Status",
                ].map((v) => (
                  <th key={v}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.id}>
                  <th>{s.id}</th>
                  <td>{s.group}</td>
                  {[
                    s.n,
                    s.mean,
                    s.sd,
                    s.cv,
                    s.dilution,
                    s.concentration,
                    s.adjusted,
                  ].map((v, i) => (
                    <td key={i}>{fmt(v)}</td>
                  ))}
                  <td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {samples.some((s) => s.adjusted === null) && (
          <div className="warning" role="status">
            {samples.filter((s) => s.adjusted === null).length} out-of-range
            samples excluded from group summaries and statistical tests.
          </div>
        )}
        {result.excludedGroups.length > 0 && (
          <div className="warning">
            No in-range samples: {result.excludedGroups.join(", ")}
          </div>
        )}
      </section>
    </>
  );
}
