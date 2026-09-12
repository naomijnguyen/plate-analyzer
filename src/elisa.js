import { levenbergMarquardt } from "ml-levenberg-marquardt";
import { describe, parseSampleList, ROWS } from "./analysis.js";

export const standardPreset = () =>
  [0, 15.6, 31.3, 62.5, 125, 250, 500, 1000].map((concentration, i) => ({
    id: "STD" + i,
    concentration: String(concentration),
  }));
export const fourPL = ([bottom, top, midpoint, slope], x) =>
  bottom + (top - bottom) / (1 + (midpoint / x) ** slope);
export function inverse4PL(parameters, y) {
  const [bottom, top, midpoint, slope] = parameters;
  if (y <= bottom || y >= top) return null;
  const x = midpoint * ((y - bottom) / (top - y)) ** (1 / slope);
  return Number.isFinite(x) ? x : null;
}

export function fit4PL(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (
    sorted.length < 6 ||
    sorted.some(
      (p) => !Number.isFinite(p.x) || p.x < 0 || !Number.isFinite(p.y),
    ) ||
    new Set(sorted.map((p) => p.x)).size !== sorted.length
  )
    throw Error(
      "Use at least six distinct, finite standard concentrations, including at least five above zero.",
    );
  const positive = sorted.filter((p) => p.x > 0);
  if (positive.length < 5)
    throw Error("At least five nonzero standard levels are required.");
  const xmin = positive[0].x,
    xmax = positive.at(-1).x,
    ylow = Math.min(...sorted.map((p) => p.y)),
    span = Math.max(...sorted.map((p) => p.y)) - ylow;
  if (!(span > 1e-10) || sorted.at(-1).y <= sorted[0].y)
    throw Error(
      "Standards must show an increasing response for this sandwich-ELISA model.",
    );
  // Normalize concentration and response so the optimizer does not mix pg/mL and OD scales.
  const data = {
    x: sorted.map((p) => p.x / xmax),
    y: sorted.map((p) => (p.y - ylow) / span),
  };
  const model =
    ([bottom, logSpan, logMidpoint, logSlope]) =>
    (x) =>
      fourPL(
        [
          bottom,
          bottom + Math.exp(logSpan),
          Math.exp(logMidpoint),
          Math.exp(logSlope),
        ],
        x,
      );
  const min = [-5, Math.log(0.05), Math.log(xmin / xmax) - 7, Math.log(0.05)],
    max = [1, Math.log(100), 7, Math.log(20)];
  let best = null;
  for (const mid of [Math.sqrt(xmin * xmax) / xmax, 0.5, 2])
    for (const slope of [0.7, 1.5, 3]) {
      try {
        const fit = levenbergMarquardt(data, model, {
          initialValues: [-0.02, Math.log(1.5), Math.log(mid), Math.log(slope)],
          minValues: min,
          maxValues: max,
          centralDifference: true,
          gradientDifference: 1e-4,
          damping: 0.1,
          maxIterations: 250,
          errorTolerance: 1e-12,
          timeout: 2,
        });
        const p = fit.parameterValues,
          sse = data.x.reduce(
            (sum, x, i) => sum + (model(p)(x) - data.y[i]) ** 2,
            0,
          );
        if (
          p.every(Number.isFinite) &&
          Number.isFinite(sse) &&
          (!best || sse < best.sse)
        )
          best = { p, sse };
      } catch {
        /* Other starting points may still converge. */
      }
    }
  if (!best)
    throw Error(
      "The standard curve could not be fitted. Check the standard map and readings.",
    );
  if (best.p.some((v, i) => v - min[i] < 1e-4 || max[i] - v < 1e-4))
    throw Error(
      "The curve reached a fitting boundary. Review the standards before quantifying samples.",
    );
  const [a, b, c, d] = best.p,
    parameters = [
      ylow + span * a,
      ylow + span * (a + Math.exp(b)),
      xmax * Math.exp(c),
      Math.exp(d),
    ];
  const standards = sorted.map((p) => ({
    ...p,
    fitted: fourPL(parameters, p.x),
    backCalculated: inverse4PL(parameters, p.y),
  }));
  const sse = standards.reduce((sum, p) => sum + (p.y - p.fitted) ** 2, 0),
    average = describe(sorted.map((p) => p.y)).mean;
  const total = sorted.reduce((sum, p) => sum + (p.y - average) ** 2, 0);
  const warnings = [];
  if (sorted.some((p, i) => i > 0 && p.y <= sorted[i - 1].y))
    warnings.push(
      "Standard means are not strictly increasing; review the curve and replicate agreement.",
    );
  const r2 = 1 - sse / total;
  if (r2 < 0.98)
    warnings.push(
      "The curve has visible residual error. Review standard back-calculations before using concentrations.",
    );
  if (!parameters.every(Number.isFinite) || !Number.isFinite(r2))
    throw Error("Curve fitting produced an invalid result.");
  return {
    parameters,
    standards,
    r2,
    rmse: Math.sqrt(sse / sorted.length),
    xmin,
    xmax,
    warnings,
    responseMin: Math.max(positive[0].y, fourPL(parameters, xmin)),
    responseMax: Math.min(positive.at(-1).y, fourPL(parameters, xmax)),
  };
}

export function analyzeElisa({
  signal,
  reference,
  subtractRef,
  plateIds,
  groups,
  standards,
  dilutions = {},
}) {
  const validate = (m, numeric) =>
    Array.isArray(m) &&
    m.length === 8 &&
    m.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 12 &&
        row.every((v) =>
          numeric ? Number.isFinite(v) : typeof v === "string",
        ),
    );
  if (
    !validate(signal, true) ||
    !validate(plateIds, false) ||
    (subtractRef && !validate(reference, true))
  )
    throw Error("Readings and plate map must each contain 8 x 12 wells.");
  const dataMatrix = signal.map((row, r) =>
    row.map((v, c) => v - (subtractRef ? reference[r][c] : 0)),
  );
  if (dataMatrix.flat().some((v) => !Number.isFinite(v)))
    throw Error("Reference subtraction produced an invalid value.");
  const byId = new Map();
  plateIds.forEach((row, r) =>
    row.forEach((value, c) => {
      const id = value.trim().toUpperCase();
      if (!id) return;
      if (!byId.has(id)) byId.set(id, []);
      byId
        .get(id)
        .push({
          well: ROWS[r] + (c + 1),
          value: dataMatrix[r][c],
          signal: signal[r][c],
          reference: subtractRef ? reference[r][c] : null,
        });
    }),
  );
  const standardIds = new Set();
  const points = standards.map((s) => {
    const id = s.id.trim().toUpperCase(),
      x = Number(s.concentration);
    if (
      !id ||
      standardIds.has(id) ||
      String(s.concentration).trim() === "" ||
      !Number.isFinite(x) ||
      x < 0
    )
      throw Error(
        "Standard IDs must be unique and concentrations must be nonnegative numbers.",
      );
    standardIds.add(id);
    const wells = byId.get(id);
    if (!wells) throw Error(id + ": standard has no wells in the plate map.");
    return {
      id,
      x,
      y: describe(wells.map((w) => w.value)).mean,
      ...describe(wells.map((w) => w.value)),
      wells,
    };
  });
  const curve = fit4PL(points),
    membership = new Map(),
    names = new Set();
  groups.forEach((g, i) => {
    const name = g.name.trim();
    if (!name || names.has(name.toUpperCase()))
      throw Error("Group names must be nonempty and unique.");
    names.add(name.toUpperCase());
    const ids = parseSampleList(g.sampleIds);
    if (!ids.length) throw Error(name + ": add sample IDs.");
    ids.forEach((id) => {
      if (standardIds.has(id))
        throw Error(
          id + " is a standard and cannot also be a sample group member.",
        );
      if (membership.has(id))
        throw Error(id + " belongs to more than one group.");
      membership.set(id, i);
    });
  });
  const samples = [...byId]
    .filter(([id]) => !standardIds.has(id))
    .map(([id, wells]) => {
      const stats = describe(wells.map((w) => w.value)),
        rawFactor = dilutions[id] ?? 1,
        dilution = Number(rawFactor);
      if (
        String(rawFactor).trim() === "" ||
        !Number.isFinite(dilution) ||
        dilution < 1
      )
        throw Error(id + ": dilution factor must be at least 1.");
      let status = "In range",
        concentration = inverse4PL(curve.parameters, stats.mean);
      const tolerance = 1e-8 * Math.max(1, Math.abs(curve.responseMax));
      if (stats.mean < curve.responseMin - tolerance)
        status = "Below calibration range";
      else if (stats.mean > curve.responseMax + tolerance)
        status = "Above calibration range";
      else if (
        concentration === null ||
        concentration < curve.xmin * (1 - 1e-8) ||
        concentration > curve.xmax * (1 + 1e-8)
      )
        status = "Outside fitted range";
      if (status === "In range")
        concentration = Math.max(
          curve.xmin,
          Math.min(curve.xmax, concentration),
        );
      if (status !== "In range") concentration = null;
      const adjusted = concentration === null ? null : concentration * dilution;
      if (adjusted !== null && !Number.isFinite(adjusted))
        throw Error(id + ": dilution-adjusted concentration is too large.");
      return {
        id,
        wells,
        ...stats,
        dilution,
        concentration,
        adjusted,
        status,
        group: membership.has(id)
          ? groups[membership.get(id)].name.trim()
          : "Ungrouped",
      };
    });
  if (!samples.length)
    throw Error("Add at least one unknown sample to the plate map.");
  const excludedGroups = [];
  const stats = groups.flatMap((group, i) => {
    const members = samples.filter((s) => membership.get(s.id) === i);
    if (!members.length)
      throw Error(group.name + ": no matching sample wells.");
    const valid = members.filter((s) => s.adjusted !== null);
    if (!valid.length) {
      excludedGroups.push(group.name);
      return [];
    }
    const values = valid.map((s) => s.adjusted);
    return [
      {
        name: group.name.trim(),
        values,
        ...describe(values),
        wells: valid.map((s) => s.wells.map((w) => w.well).join(", ")),
        sampleIds: valid.map((s) => s.id),
        wellN: valid.reduce((n, s) => n + s.n, 0),
        excluded: members.length - valid.length,
        wellValues: valid.flatMap((s) =>
          s.wells.map((w) => ({ ...w, sampleId: s.id })),
        ),
      },
    ];
  });
  return {
    stats,
    curve,
    samples,
    excludedGroups,
    dataMatrix,
    plateIds: plateIds.map((row) => [...row]),
    corrected: subtractRef,
    analysisUnit: "sample",
    ungrouped: [],
    elisa: true,
  };
}
