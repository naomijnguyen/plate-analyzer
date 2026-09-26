import ResultsChart from "./ResultsChart";

// Presentation only: both pages consume the same analyzed result snapshot.
export default function GraphsPage({
  result,
  errorMode,
  setErrorMode,
  showPoints,
  setShowPoints,
  annotation,
  onResults,
}) {
  return (
    <section aria-labelledby="graphs-heading" className="graphs-page">
      <div className="section-heading">
        <div>
          <h2 id="graphs-heading">Graphs</h2>
          <p className="muted">{result.assay.name || "Group comparison"}</p>
        </div>
        <button onClick={onResults}>Back to results</button>
      </div>
      {result.stats.length ? (
        <div className="graph-workspace">
          <aside aria-labelledby="graph-settings-heading" className="graph-settings">
            <h3 id="graph-settings-heading">Graph settings</h3>
            <label>
              Error bars
              <select value={errorMode} onChange={(e) => setErrorMode(e.target.value)}>
                <option value="sd">SD</option>
                <option value="sem">SEM</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={showPoints}
                onChange={(e) => setShowPoints(e.target.checked)}
              />
              Individual samples
            </label>
            <p className="muted">
              Bars show group means. Each point represents one sample
              {result.elisa
                ? " after calibration and dilution adjustment."
                : ", averaged across its technical repeats."}
            </p>
            <p className="muted">
              SD shows sample spread; SEM shows uncertainty in the mean.
              Error bars are unavailable for groups with fewer than two samples.
            </p>
          </aside>
          <div className="graph-preview">
            <ResultsChart
              stats={result.stats}
              errorMode={errorMode}
              showPoints={showPoints}
              units={result.assay.units}
              annotation={annotation}
            />
            <p className="muted" aria-label="Graph comparison">
              {annotation || "No comparison calculated. Select and run a statistical test on Results."}
            </p>
          </div>
        </div>
      ) : (
        <p>No grouped samples are available to plot. Review sample assignments and calibration on Results.</p>
      )}
    </section>
  );
}
