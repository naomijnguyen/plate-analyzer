import { useState, useEffect } from "react";
import {
  Upload,
  Trash2,
  Plus,
  FlaskConical,
  Download,
  ArrowRight,
  Check,
} from "lucide-react";
import Papa from "papaparse";
import {
  ROWS,
  COLS,
  emptyPlate,
  parsePlate,
  parseSampleList,
  analyzePlate,
  compareGroups,
} from "./analysis.js";
import { COLORS } from "./ResultsChart";
import GraphsPage from "./GraphsPage.jsx";
import { analyzeElisa, standardPreset, fourPL } from "./elisa.js";
import { Calibration, ElisaResults, downloadCSV } from "./ElisaPanels.jsx";
import "./style.css";

const fmt = (v, digits = 4) =>
  v === null ? "N/A" : Number(v.toPrecision(digits)).toString();
const initialAssay = {
  name: "",
  units: "OD",
  signalWL: "450",
  refWL: "570",
  subtractRef: false,
};
export default function PlateAnalyzer() {
  const [step, setStep] = useState("map"),
    [assay, setAssay] = useState(initialAssay);
  const [plateIds, setPlateIds] = useState(emptyPlate),
    [groups, setGroups] = useState([]);
  const [bulk, setBulk] = useState(""),
    [rawSignal, setRawSignal] = useState(""),
    [rawRef, setRawRef] = useState("");
  const [parsed, setParsed] = useState(null),
    [result, setResult] = useState(null),
    [error, setError] = useState("");
  const [draft, setDraft] = useState({ name: "", sampleIds: "" }),
    [errorMode, setErrorMode] = useState("sd"),
    [showPoints, setShowPoints] = useState(true);
  const [workflow, setWorkflow] = useState("groups"),
    [standards, setStandards] = useState(standardPreset),
    [dilutions, setDilutions] = useState({}),
    [concentrationUnits, setConcentrationUnits] = useState("pg/mL");
  const [testMode, setTestMode] = useState("none"),
    [first, setFirst] = useState(0),
    [second, setSecond] = useState(1),
    [independent, setIndependent] = useState(false),
    [comparison, setComparison] = useState(null),
    [testError, setTestError] = useState("");
  useEffect(() => {
    document
      .querySelector("nav button[aria-current]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [step]);
  const resetTest = () => {
    setComparison(null);
    setTestError("");
  };
  const reset = () => {
    setResult(null);
    setError("");
    resetTest();
  };
  function changeAssay(key, value) {
    reset();
    setParsed(null);
    setAssay({ ...assay, [key]: value });
  }
  function changeMap(value) {
    reset();
    setPlateIds(value);
  }
  function changeGroups(value) {
    reset();
    setGroups(value);
  }
  function parseInputs() {
    return {
      signal: parsePlate(rawSignal),
      reference: assay.subtractRef ? parsePlate(rawRef) : null,
    };
  }
  function checkData() {
    try {
      const next = parseInputs();
      setParsed(next);
      setError("");
    } catch (e) {
      setParsed(null);
      setResult(null);
      setError(e.message);
    }
  }
  function analyze() {
    try {
      const next = parseInputs();
      const input = {
        ...next,
        subtractRef: assay.subtractRef,
        plateIds,
        groups,
      };
      const answer =
        workflow === "elisa"
          ? analyzeElisa({ ...input, standards, dilutions })
          : analyzePlate(input);
      if (workflow === "elisa" && !concentrationUnits.trim())
        throw Error("Enter concentration units.");
      setParsed(next);
      resetTest();
      setIndependent(false);
      setResult({
        ...answer,
        assay: {
          ...assay,
          units: workflow === "elisa" ? concentrationUnits : assay.units,
        },
      });
      setStep("results");
      setError("");
    } catch (e) {
      setResult(null);
      setError(e.message);
    }
  }
  function applyMap(text) {
    try {
      changeMap(parsePlate(text, false));
      setBulk("");
    } catch (e) {
      setError(e.message);
    }
  }
  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 200000) throw Error("File exceeds 200 KB.");
      applyMap(await file.text());
    } catch (err) {
      setError(err.message);
    }
    e.target.value = "";
  }
  function addGroup() {
    try {
      if (!draft.name.trim()) throw Error("Enter a group name.");
      if (!parseSampleList(draft.sampleIds).length)
        throw Error("Enter sample IDs.");
      if (groups.length >= 12) throw Error("Up to 12 groups per plate.");
      changeGroups([...groups, { ...draft, name: draft.name.trim() }]);
      setDraft({ name: "", sampleIds: "" });
    } catch (e) {
      setError(e.message);
    }
  }
  function sample() {
    if (workflow === "elisa") {
      const preset = standardPreset(),
        ids = emptyPlate(),
        signal = ROWS.map(() => COLS.map(() => 0.03));
      preset.forEach((s, r) => {
        for (let c = 0; c < 3; c++) {
          ids[r][c] = s.id;
          signal[r][c] =
            fourPL([0.08, 2.8, 180, 1.25], Number(s.concentration)) +
            (c - 1) * 0.002;
        }
      });
      for (let n = 0; n < 12; n++)
        for (let repeat = 0; repeat < 3; repeat++) {
          const index = n * 3 + repeat,
            r = Math.floor(index / 9),
            c = (index % 9) + 3;
          ids[r][c] = "S" + (n + 1);
          signal[r][c] =
            fourPL([0.08, 2.8, 180, 1.25], n === 11 ? 2000 : 40 + n * 25) +
            (repeat - 1) * 0.003;
        }
      setPlateIds(ids);
      setGroups([
        { name: "Control", sampleIds: "S1-S6" },
        { name: "Treatment", sampleIds: "S7-S12" },
      ]);
      setStandards(preset);
      setDilutions({ S2: 2 });
      setConcentrationUnits("pg/mL");
      setRawSignal(Papa.unparse(signal, { delimiter: "\t" }));
      setRawRef("");
      setAssay({ ...initialAssay, name: "Synthetic CXCL10-style ELISA" });
      setParsed({ signal, reference: null });
      reset();
      setIndependent(false);
      setStep("map");
      return;
    }
    const ids = ROWS.map((_, r) =>
      COLS.map((_, c) =>
        r * 4 + (c % 4) >= 30
          ? ""
          : ["C", "T", "H"][Math.floor(c / 4)] +
            (Math.floor((r * 4 + (c % 4)) / 3) + 1),
      ),
    );
    const signal = ROWS.map((_, r) =>
      COLS.map((_, c) =>
        Number(
          (
            [-0.15, 0.65, 1.2][Math.floor(c / 4)] +
            (((r * 7 + c * 3) % 11) - 5) * 0.045
          ).toFixed(3),
        ),
      ),
    );
    const exampleGroups = [
      { name: "Control", sampleIds: "C1-C10" },
      { name: "Treatment", sampleIds: "T1-T10" },
      { name: "High dose", sampleIds: "H1-H10" },
    ];
    setPlateIds(ids);
    setGroups(exampleGroups);
    setRawSignal(Papa.unparse(signal, { delimiter: "\t" }));
    setRawRef("");
    setAssay({ ...initialAssay, name: "Synthetic example" });
    setParsed({ signal, reference: null });
    reset();
    setIndependent(false);
    setStep("map");
  }
  function exportValues() {
    if (result.elisa) {
      downloadCSV(
        result.plateIds.flatMap((row, r) =>
          row.flatMap((id, c) =>
            id
              ? [
                  {
                    sample: id,
                    well: ROWS[r] + (c + 1),
                    signal_OD: parsed.signal[r][c],
                    reference_OD: result.corrected
                      ? parsed.reference[r][c]
                      : null,
                    corrected_OD: result.dataMatrix[r][c],
                  },
                ]
              : [],
          ),
        ),
        "elisa-well-readings.csv",
      );
      return;
    }
    const rows = result.stats.flatMap((s) =>
      s.wellValues.map((w) => ({
        group: s.name,
        sample: w.sampleId,
        well: w.well,
        value: w.value,
        units: result.assay.units,
      })),
    );
    rows.push(
      ...result.ungrouped.map((w) => ({
        group: "Ungrouped",
        sample: w.sampleId,
        well: w.well,
        value: w.value,
        units: result.assay.units,
      })),
    );
    const url = URL.createObjectURL(
      new Blob([Papa.unparse(rows, { escapeFormulae: true })], {
        type: "text/csv",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "plate-well-values.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportSummary() {
    downloadCSV(
      result.stats.map((s) => ({
        group: s.name,
        n_samples: s.n,
        n_wells: s.wellN,
        excluded_samples: s.excluded ?? 0,
        mean: s.mean,
        SD: s.sd,
        SEM: s.sem,
        CV_percent: s.cv,
        min: s.min,
        max: s.max,
        units: result.assay.units,
        test: comparison?.method ?? "None",
        comparison: comparison?.label ?? "",
        p_value: comparison?.p ?? null,
        statistic: comparison?.statistic ?? null,
        degrees_of_freedom: comparison ? String(comparison.df) : "",
        p_adjustment: "None",
      })),
      "plate-group-summary.csv",
    );
  }
  const groupFor = (id) =>
    groups.findIndex((g) => {
      try {
        return parseSampleList(g.sampleIds).includes(id.trim().toUpperCase());
      } catch {
        return false;
      }
    });
  function runTest() {
    try {
      if (testMode !== "none" && !independent)
        throw Error(
          "Confirm independent samples and the selected test assumptions first.",
        );
      setComparison(compareGroups(result.stats, testMode, first, second));
      setTestError("");
    } catch (e) {
      setComparison(null);
      setTestError(e.message);
    }
  }
  const pLabel = comparison
    ? comparison.p < 1e-12
      ? "p < 1e-12"
      : "p = " + comparison.p.toPrecision(4)
    : "";
  const annotation = comparison
    ? comparison.method + " · " + comparison.label + " · " + pLabel
    : "";
  return (
    <main>
      <header className="app-header">
        <div className="brand">
          <FlaskConical size={27} />
          <div>
            <h1>Plate Analyzer</h1>
            <span>96 wells · Local analysis</span>
          </div>
        </div>
        <button onClick={sample}>Load example</button>
      </header>
      <nav aria-label="Analysis steps">
        {[
          ["map", "Plate map"],
          ...(workflow === "elisa" ? [["calibration", "Calibration"]] : []),
          ["groups", "Groups"],
          ["data", "Data"],
          ["results", "Results"],
          ["graphs", "Graphs"],
        ].map(([key, label], i) => (
          <button
            key={key}
            aria-current={step === key ? "step" : undefined}
            disabled={(key === "results" || key === "graphs") && !result}
            onClick={() => {
              setStep(key);
              setError("");
            }}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {step === "map" && (
        <>
          <section>
            <h2>Assay</h2>
            <div className="fields">
              <label>
                Analysis
                <select
                  aria-label="Analysis workflow"
                  value={workflow}
                  onChange={(e) => {
                    reset();
                    setWorkflow(e.target.value);
                  }}
                >
                  <option value="groups">Group comparison</option>
                  <option value="elisa">ELISA quantification</option>
                </select>
              </label>
              {[
                ["name", "Assay name"],
                ["units", "Units"],
                ["signalWL", "Signal wavelength (nm)"],
                ["refWL", "Reference wavelength (nm)"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    maxLength={80}
                    value={assay[key]}
                    onChange={(e) => changeAssay(key, e.target.value)}
                  />
                </label>
              ))}
              <label className="check">
                <input
                  type="checkbox"
                  checked={assay.subtractRef}
                  onChange={(e) => changeAssay("subtractRef", e.target.checked)}
                />
                Subtract reference
              </label>
            </div>
          </section>
          <section>
            <div className="section-heading">
              <h2>Sample IDs</h2>
              <div className="actions">
                <label className="upload" title="Upload CSV or TSV">
                  <Upload size={17} />
                  Upload
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={upload}
                  />
                </label>
                <button
                  className="icon-button danger"
                  title="Clear plate map"
                  aria-label="Clear plate map"
                  onClick={() => changeMap(emptyPlate())}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <div className="import-row">
              <textarea
                aria-label="Sample ID grid"
                placeholder="CSV or TSV sample map"
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                maxLength={200000}
              />
              <button onClick={() => applyMap(bulk)}>Apply map</button>
            </div>
            <div className="table-scroll">
              <table className="plate">
                <thead>
                  <tr>
                    <th></th>
                    {COLS.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, r) => (
                    <tr key={row}>
                      <th>{row}</th>
                      {COLS.map((col, c) => {
                        const index = groupFor(plateIds[r][c]);
                        return (
                          <td key={col}>
                            <input
                              aria-label={"Sample " + row + col}
                              maxLength={80}
                              value={plateIds[r][c]}
                              placeholder={row + col}
                              style={
                                index < 0
                                  ? {}
                                  : {
                                      backgroundColor:
                                        COLORS[index % COLORS.length] + "18",
                                      borderColor:
                                        COLORS[index % COLORS.length],
                                    }
                              }
                              onChange={(e) =>
                                changeMap(
                                  plateIds.map((rr, ri) =>
                                    rr.map((v, ci) =>
                                      ri === r && ci === c ? e.target.value : v,
                                    ),
                                  ),
                                )
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <footer>
            <button
              className="primary"
              onClick={() =>
                setStep(workflow === "elisa" ? "calibration" : "groups")
              }
            >
              {workflow === "elisa" ? "Calibration" : "Groups"}
              <ArrowRight size={17} />
            </button>
          </footer>
        </>
      )}
      {step === "calibration" && (
        <>
          <Calibration
            standards={standards}
            setStandards={(value) => {
              reset();
              setStandards(value);
            }}
            plateIds={plateIds}
            dilutions={dilutions}
            setDilutions={(value) => {
              reset();
              setDilutions(value);
            }}
            units={concentrationUnits}
            setUnits={(value) => {
              reset();
              setConcentrationUnits(value);
            }}
          />
          <footer>
            <button className="primary" onClick={() => setStep("groups")}>
              Groups
              <ArrowRight size={17} />
            </button>
          </footer>
        </>
      )}
      {step === "groups" && (
        <>
          <section>
            <h2>Experimental groups</h2>
            <div className="group-list">
              {groups.map((g, i) => (
                <div className="group-row" key={i}>
                  <span
                    className="swatch"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <label>
                    Group name
                    <input
                      maxLength={80}
                      value={g.name}
                      onChange={(e) =>
                        changeGroups(
                          groups.map((v, j) =>
                            j === i ? { ...v, name: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Sample IDs
                    <input
                      maxLength={4000}
                      value={g.sampleIds}
                      onChange={(e) =>
                        changeGroups(
                          groups.map((v, j) =>
                            j === i ? { ...v, sampleIds: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="icon-button danger"
                    aria-label={"Remove " + g.name}
                    title={"Remove " + g.name}
                    onClick={() =>
                      changeGroups(groups.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
            <div className="group-row new-group">
              <span />
              <label>
                Group name
                <input
                  maxLength={80}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                Sample IDs
                <input
                  maxLength={4000}
                  placeholder="S1-S6, S9"
                  value={draft.sampleIds}
                  onChange={(e) =>
                    setDraft({ ...draft, sampleIds: e.target.value })
                  }
                />
              </label>
              <button
                className="icon-button"
                title="Add group"
                aria-label="Add group"
                onClick={addGroup}
              >
                <Plus size={20} />
              </button>
            </div>
          </section>
          <footer>
            <button className="primary" onClick={() => setStep("data")}>
              Data
              <ArrowRight size={17} />
            </button>
          </footer>
        </>
      )}
      {step === "data" && (
        <>
          <section>
            <div className="data-grid">
              <label>
                Signal · {assay.signalWL} nm
                <textarea
                  aria-label="Signal data"
                  maxLength={200000}
                  value={rawSignal}
                  onChange={(e) => {
                    reset();
                    setParsed(null);
                    setRawSignal(e.target.value);
                  }}
                  placeholder="8 rows × 12 numeric values"
                />
              </label>
              {assay.subtractRef && (
                <label>
                  Reference · {assay.refWL} nm
                  <textarea
                    aria-label="Reference data"
                    maxLength={200000}
                    value={rawRef}
                    onChange={(e) => {
                      reset();
                      setParsed(null);
                      setRawRef(e.target.value);
                    }}
                    placeholder="8 rows × 12 numeric values"
                  />
                </label>
              )}
            </div>
            <div className="actions">
              <button onClick={checkData}>
                <Check size={17} />
                Check data
              </button>
              {parsed && (
                <span className="status">
                  96 signal wells
                  {parsed.reference ? " · 96 reference wells" : ""}
                </span>
              )}
            </div>
            {parsed && (
              <div className="table-scroll">
                <table className="numeric">
                  <thead>
                    <tr>
                      <th></th>
                      {COLS.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.signal.map((row, r) => (
                      <tr key={r}>
                        <th>{ROWS[r]}</th>
                        {row.map((v, c) => (
                          <td key={c}>{fmt(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <footer>
            <button className="primary" onClick={analyze}>
              Analyze
              <ArrowRight size={17} />
            </button>
          </footer>
        </>
      )}
      {step === "results" && result && (
        <>
          {result.elisa && <ElisaResults result={result} />}
          <section>
            <div className="section-heading">
              <div>
                <h2>{result.assay.name || "Group results"}</h2>
                <span className="muted">
                  {result.elisa
                    ? "Dilution-adjusted sample concentrations"
                    : "Technical-repeat means per sample"}{" "}
                  · {result.corrected ? "Reference subtracted" : "Signal only"}
                </span>
              </div>
              <div className="actions">
                <button onClick={exportValues}>
                  <Download size={17} />
                  Wells CSV
                </button>
                <button onClick={exportSummary} disabled={!result.stats.length}>
                  <Download size={17} />
                  Summary CSV
                </button>
              </div>
            </div>
            <div className="table-scroll">
              <table className="numeric results">
                <thead>
                  <tr>
                    {[
                      "Group",
                      "n (samples)",
                      "Wells",
                      "Mean",
                      "SD",
                      "SEM",
                      "CV (%)",
                      "Min",
                      "Max",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.stats.map((s, i) => (
                    <tr key={s.name}>
                      <th>
                        <span
                          className="swatch"
                          style={{ background: COLORS[i % COLORS.length] }}
                        />
                        {s.name}
                      </th>
                      {[
                        "n",
                        "wellN",
                        "mean",
                        "sd",
                        "sem",
                        "cv",
                        "min",
                        "max",
                      ].map((k) => (
                        <td key={k}>{fmt(s[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {result.stats.length > 0 && (
            <section>
              <h2>Statistical comparisons</h2>
              <p className="muted">
                Select a test for your experimental design. Comparisons use sample-level
                values, not individual technical-repeat wells. P-values are unadjusted;
                ANOVA reports an overall group difference, not pairwise comparisons.
              </p>
              <div className="test-controls">
                <label>
                  Statistical test
                  <select
                    aria-label="Statistical test"
                    value={testMode}
                    onChange={(e) => {
                      setTestMode(e.target.value);
                      setIndependent(false);
                      resetTest();
                    }}
                  >
                    <option value="none">None</option>
                    <option value="welch">Welch t-test (unpaired)</option>
                    <option value="anova">One-way ANOVA</option>
                  </select>
                </label>
                {testMode === "welch" && (
                  <div className="actions">
                    {[
                      [first, setFirst, "First group"],
                      [second, setSecond, "Second group"],
                    ].map(([value, set, label]) => (
                      <label key={label}>
                        {label}
                        <select
                          aria-label={label}
                          value={value}
                          onChange={(e) => {
                            set(Number(e.target.value));
                            resetTest();
                          }}
                        >
                          {result.stats.map((s, i) => (
                            <option value={i} key={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
                {testMode !== "none" && (
                  <>
                    <label className="check test-assumptions">
                      <input
                        type="checkbox"
                        checked={independent}
                        onChange={(e) => {
                          setIndependent(e.target.checked);
                          resetTest();
                        }}
                      />
                      {testMode === "anova"
                        ? "Independent samples; normal residuals and equal variances assumed"
                        : "Independent samples; approximately normal sample distributions assumed"}
                    </label>
                    <button onClick={runTest}>Calculate comparison</button>
                  </>
                )}
                {testError && (
                  <div role="alert" className="error">
                    {testError}
                  </div>
                )}
                {!comparison && <p className="muted">P-value not calculated. Select a test and confirm its assumptions.</p>}
                {comparison && (
                  <output>
                    {annotation} ·{" "}
                    {comparison.p < 0.05 ? "p < 0.05" : "p ≥ 0.05"}
                  </output>
                )}
              </div>
              {comparison && (
                <div className="table-scroll">
                  <table className="numeric" aria-label="Statistical comparison results">
                    <thead>
                      <tr>
                        {["Test", "Comparison", "P-value", "Statistic", "Degrees of freedom", "Adjustment"].map((label) => (
                          <th scope="col" key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">{comparison.method}</th>
                        <td>{comparison.label}</td>
                        <td>{pLabel}</td>
                        <td>{fmt(comparison.statistic)}</td>
                        <td>{Array.isArray(comparison.df) ? comparison.df.join(", ") : fmt(comparison.df)}</td>
                        <td>None (unadjusted)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          <footer>
            <button className="primary" onClick={() => setStep("graphs")}>
              Open graphs <ArrowRight size={17} />
            </button>
          </footer>
          <section>
            <div className="section-heading">
              <h2>Plate heatmap</h2>
              <span className="muted">
                {fmt(Math.min(...result.dataMatrix.flat()))} to{" "}
                {fmt(Math.max(...result.dataMatrix.flat()))}{" "}
                {result.elisa ? "OD" : result.assay.units}
              </span>
            </div>
            <div className="table-scroll">
              <table className="heatmap">
                <thead>
                  <tr>
                    <th></th>
                    {COLS.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.dataMatrix.map((row, r) => (
                    <tr key={r}>
                      <th>{ROWS[r]}</th>
                      {row.map((v, c) => {
                        const values = result.dataMatrix.flat(),
                          lo = Math.min(...values),
                          hi = Math.max(...values),
                          norm = (v - lo) / (hi - lo || 1);
                        return (
                          <td
                            key={c}
                            title={
                              ROWS[r] +
                              (c + 1) +
                              " · " +
                              (result.plateIds[r][c] || "Unlabelled")
                            }
                            style={{
                              backgroundColor:
                                "hsl(166 30% " + (94 - norm * 48) + "%)",
                            }}
                          >
                            {fmt(v, 3)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2>Contributing wells</h2>
            {result.stats.map((s) => (
              <details key={s.name}>
                <summary>
                  {s.name} · {s.n} samples · {s.wellN} wells
                </summary>
                <div className="well-values">
                  {s.wellValues.map((w) => (
                    <span key={w.well}>
                      {w.well} · {w.sampleId}: {fmt(w.value)}
                    </span>
                  ))}
                </div>
              </details>
            ))}
            {result.ungrouped.length > 0 && (
              <details>
                <summary>Ungrouped · {result.ungrouped.length} wells</summary>
                <div className="well-values">
                  {result.ungrouped.map((w) => (
                    <span key={w.well}>
                      {w.well} · {w.sampleId}: {fmt(w.value)}
                    </span>
                  ))}
                </div>
              </details>
            )}
          </section>
        </>
      )}
      {step === "graphs" && result && (
        <GraphsPage
          result={result}
          errorMode={errorMode}
          setErrorMode={setErrorMode}
          showPoints={showPoints}
          setShowPoints={setShowPoints}
          annotation={annotation}
          onResults={() => setStep("results")}
        />
      )}
    </main>
  );
}
