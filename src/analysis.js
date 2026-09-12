import Papa from "papaparse";
import { mean, sampleStandardDeviation } from "simple-statistics";
import jstat from "jstat";

export const ROWS = [..."ABCDEFGH"];
export const COLS = Array.from({ length: 12 }, (_, i) => i + 1);
export const emptyPlate = () => ROWS.map(() => COLS.map(() => ""));

export function parsePlate(text, numeric = true) {
  if (typeof text !== "string" || text.length > 200000)
    throw Error("Input exceeds the 200,000-character limit.");
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ""), {
    delimiter: text.includes("\t") ? "\t" : ",",
    skipEmptyLines: false,
  });
  if (parsed.errors.length) throw Error("Invalid CSV or TSV quoting.");
  let rows = parsed.data.map((row) => row.map((cell) => cell.trim()));
  while (rows.length && rows.at(-1).length === 1 && rows.at(-1)[0] === "")
    rows.pop();
  if (rows.length === 9) {
    const header =
      rows[0].length === 13 && rows[0][0] === "" ? rows[0].slice(1) : rows[0];
    if (
      header.length === 12 &&
      header.every((cell, i) => cell === String(i + 1))
    )
      rows = rows.slice(1);
  }
  if (rows.length !== 8)
    throw Error(
      "Expected exactly 8 plate rows, with an optional 1-12 column header.",
    );
  return rows.map((row, r) => {
    if (row.length === 13 && row[0].toUpperCase() === ROWS[r])
      row = row.slice(1);
    if (row.length !== 12)
      throw Error("Row " + ROWS[r] + " must contain exactly 12 wells.");
    return row.map((cell, c) => {
      if (!numeric) {
        if (cell.length > 80)
          throw Error(ROWS[r] + (c + 1) + ": sample ID is too long.");
        return cell;
      }
      if (
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(cell) ||
        !Number.isFinite(Number(cell))
      )
        throw Error(
          ROWS[r] +
            (c + 1) +
            ": enter a finite number; missing wells cannot be skipped.",
        );
      return Number(cell);
    });
  });
}

export function parseSampleList(text) {
  if (text.length > 4000) throw Error("Sample list is too long.");
  const values = [];
  for (const token of text.split(/[,;\s]+/).filter(Boolean)) {
    const range = token.match(/^([a-zA-Z]*)(\d+)-([a-zA-Z]*)(\d+)$/);
    if (!range) values.push(token);
    else {
      const [, prefix, from, other, to] = range;
      if (other && other.toUpperCase() !== prefix.toUpperCase())
        throw Error("Range prefixes must match.");
      const start = Number(from),
        end = Number(to);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        Math.abs(end - start) >= 96
      )
        throw Error("A range can contain at most 96 IDs.");
      const width = from.startsWith("0") ? from.length : 0;
      for (let n = Math.min(start, end); n <= Math.max(start, end); n++)
        values.push(prefix + String(n).padStart(width, "0"));
    }
    if (values.length > 192) throw Error("Too many sample IDs in one group.");
  }
  return [...new Set(values.map((value) => value.trim().toUpperCase()))];
}

export function describe(values) {
  if (!values.length || values.some((v) => !Number.isFinite(v)))
    throw Error("Statistics require finite values.");
  const average = mean(values);
  const sd = values.length > 1 ? sampleStandardDeviation(values) : null;
  const sem = sd === null ? null : sd / Math.sqrt(values.length);
  if (!Number.isFinite(average) || (sd !== null && !Number.isFinite(sd)))
    throw Error("Values are too large for reliable calculation.");
  const cv = average > 0 && sd !== null ? (sd / average) * 100 : null;
  return {
    n: values.length,
    mean: average,
    sd,
    sem,
    cv: Number.isFinite(cv) ? cv : null,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function analyzePlate({
  signal,
  reference,
  subtractRef,
  plateIds,
  groups,
  analysisUnit = "sample",
}) {
  const validate = (matrix, label, numeric) => {
    if (
      !Array.isArray(matrix) ||
      matrix.length !== 8 ||
      matrix.some(
        (row) =>
          !Array.isArray(row) ||
          row.length !== 12 ||
          row.some((v) =>
            numeric ? !Number.isFinite(v) : typeof v !== "string",
          ),
      )
    )
      throw Error(label + " must be an 8 x 12 plate.");
  };
  validate(signal, "Signal", true);
  validate(plateIds, "Sample map", false);
  if (subtractRef) validate(reference, "Reference", true);
  const lookup = new Map(),
    names = new Set();
  groups.forEach((group, i) => {
    const name = group.name.trim();
    if (!name || names.has(name.toUpperCase()))
      throw Error("Group names must be nonempty and unique.");
    names.add(name.toUpperCase());
    const ids = parseSampleList(group.sampleIds);
    if (!ids.length) throw Error(name + ": add at least one sample ID.");
    for (const id of ids) {
      if (lookup.has(id)) throw Error(id + " belongs to more than one group.");
      lookup.set(id, i);
    }
  });
  if (!groups.length) throw Error("Add at least one group.");
  const dataMatrix = signal.map((row, r) =>
    row.map((v, c) => v - (subtractRef ? reference[r][c] : 0)),
  );
  if (dataMatrix.flat().some((v) => !Number.isFinite(v)))
    throw Error("Reference subtraction produced an out-of-range number.");
  const collected = groups.map((group) => ({
    name: group.name.trim(),
    values: [],
    wells: [],
    sampleIds: [],
  }));
  const ungrouped = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 12; c++) {
      const sampleId = plateIds[r][c].trim();
      if (!sampleId) continue;
      const value = dataMatrix[r][c],
        well = ROWS[r] + (c + 1),
        index = lookup.get(sampleId.toUpperCase());
      if (index === undefined) ungrouped.push({ sampleId, well, value });
      else {
        collected[index].values.push(value);
        collected[index].wells.push(well);
        collected[index].sampleIds.push(sampleId);
      }
    }
  const stats = collected.map((group) => {
    if (!group.values.length)
      throw Error(group.name + ": no matching wells on the plate.");
    const wells = group.values.map((value, i) => ({
      value,
      well: group.wells[i],
      sampleId: group.sampleIds[i],
    }));
    if (analysisUnit === "well")
      return {
        ...group,
        ...describe(group.values),
        wellValues: wells,
        wellN: wells.length,
      };
    const samples = new Map();
    for (const well of wells) {
      const key = well.sampleId.toUpperCase();
      if (!samples.has(key)) samples.set(key, []);
      samples.get(key).push(well);
    }
    const units = [...samples.values()].map((repeats) => ({
      value: mean(repeats.map((w) => w.value)),
      sampleId: repeats[0].sampleId,
      wells: repeats.map((w) => w.well).join(", "),
    }));
    const values = units.map((unit) => unit.value);
    return {
      name: group.name,
      values,
      wells: units.map((u) => u.wells),
      sampleIds: units.map((u) => u.sampleId),
      ...describe(values),
      wellValues: wells,
      wellN: wells.length,
    };
  });
  return {
    stats,
    dataMatrix,
    ungrouped,
    plateIds: plateIds.map((row) => [...row]),
    corrected: subtractRef,
    analysisUnit,
  };
}

export function compareGroups(stats, method, first = 0, second = 1) {
  if (method === "none") return null;
  const chosen = method === "welch" ? [stats[first], stats[second]] : stats;
  if (method === "welch" && first === second)
    throw Error("Choose two different groups.");
  if (chosen.length < 2 || chosen.some((s) => !s || s.n < 2 || s.sd === null))
    throw Error(
      "Each comparison group needs at least two independent samples.",
    );
  if (method === "welch") {
    const [a, b] = chosen,
      va = a.sd ** 2 / a.n,
      vb = b.sd ** 2 / b.n,
      total = va + vb;
    if (!Number.isFinite(total) || total <= 0)
      throw Error("The comparison needs nonzero sample variance.");
    const t = (a.mean - b.mean) / Math.sqrt(total),
      df = total ** 2 / (va ** 2 / (a.n - 1) + vb ** 2 / (b.n - 1));
    const p = Math.min(
      1,
      Math.max(0, 2 * jstat.studentt.cdf(-Math.abs(t), df)),
    );
    if (![p, t, df].every(Number.isFinite))
      throw Error("Values are too extreme for a finite t-test result.");
    return {
      method: "Welch two-sided t-test",
      p,
      statistic: t,
      df,
      label: a.name + " vs " + b.name,
    };
  }
  if (method === "anova") {
    const arrays = chosen.map((s) => s.values);
    if (chosen.every((s) => s.sd === 0))
      throw Error("ANOVA needs nonzero within-group variance.");
    const statistic = jstat.anovafscore(...arrays);
    const df1 = chosen.length - 1,
      df2 = chosen.reduce((sum, s) => sum + s.n, 0) - chosen.length;
    const p = 1 - jstat.centralF.cdf(statistic, df1, df2);
    if (!Number.isFinite(p) || !Number.isFinite(statistic))
      throw Error("Could not calculate a finite ANOVA result.");
    return {
      method: "One-way ANOVA",
      p: Math.min(1, Math.max(0, p)),
      statistic,
      df: [df1, df2],
      label: "All groups",
    };
  }
  throw Error("Unknown statistical test.");
}
