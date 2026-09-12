import test from "node:test";
import assert from "node:assert/strict";
import {
  fit4PL,
  fourPL,
  inverse4PL,
  analyzeElisa,
  standardPreset,
} from "../src/elisa.js";
import {
  emptyPlate,
  analyzePlate,
  describe,
  compareGroups,
} from "../src/analysis.js";

const near = (a, b, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const parameters = [0.08, 2.8, 180, 1.25];
const xs = [0, 15.6, 31.3, 62.5, 125, 250, 500, 1000];
function fixture() {
  const plateIds = emptyPlate(),
    signal = emptyPlate().map((row) => row.map(() => 0)),
    reference = emptyPlate().map((row) => row.map(() => 0.03));
  standardPreset().forEach((s, r) => {
    for (let c = 0; c < 3; c++) {
      plateIds[r][c] = s.id;
      signal[r][c] =
        fourPL(parameters, Number(s.concentration)) + (c - 1) * 0.001;
    }
  });
  [40, 100, 1500, 5, 15.6, 1000].forEach((x, r) => {
    for (let c = 3; c < 6; c++) {
      plateIds[r][c] = "S" + (r + 1);
      signal[r][c] = fourPL(parameters, x) + (c - 4) * 0.002;
    }
  });
  return {
    signal,
    reference,
    plateIds,
    standards: standardPreset(),
    groups: [
      { name: "A", sampleIds: "S1-S3" },
      { name: "B", sampleIds: "S4-S6" },
    ],
    dilutions: { S1: 2 },
    subtractRef: false,
  };
}
test("4PL recovers synthetic parameters and inverts known concentrations", () => {
  const curve = fit4PL(xs.map((x) => ({ x, y: fourPL(parameters, x) })));
  parameters.forEach((p, i) => near(curve.parameters[i], p, 1e-5));
  near(curve.r2, 1);
  near(curve.rmse, 0);
  [15.6, 40, 125, 1000].forEach((x) =>
    near(inverse4PL(curve.parameters, fourPL(parameters, x)), x, 1e-5),
  );
  assert.equal(inverse4PL(parameters, 3), null);
  assert.equal(inverse4PL(parameters, -1), null);
});
test("noisy unweighted fit agrees with independent SciPy 1.13.1 curve_fit", () => {
  const y = [
    0.081, 0.19515959488605938, 0.36259384113292453, 0.6424136954450971,
    1.1473103005217085, 1.702369948014578, 2.2159029119087643, 2.50956218783571,
  ];
  const expected = [
    0.07938696618631179, 2.7964009006902306, 179.5213717200514,
    1.2516201845013437,
  ];
  const curve = fit4PL(xs.map((x, i) => ({ x, y: y[i] })));
  expected.forEach((v, i) => near(curve.parameters[i], v, 2e-4));
});
test("ELISA averages repeat OD, interpolates once, then applies dilution", () => {
  const result = analyzeElisa(fixture());
  near(result.samples[0].concentration, 40, 1e-5);
  near(result.samples[0].adjusted, 80, 1e-5);
  assert.equal(result.samples[0].n, 3);
  assert.equal(result.stats[0].n, 2);
  assert.equal(result.stats[0].wellN, 6);
  near(result.stats[0].mean, 90, 1e-5);
  assert.equal(result.stats[0].excluded, 1);
  assert.equal(result.samples[2].adjusted, null);
  assert.match(result.samples[2].status, /Above/);
  assert.equal(result.samples[3].adjusted, null);
  assert.match(result.samples[3].status, /Below/);
  assert.equal(result.samples[4].status, "In range");
  assert.equal(result.samples[5].status, "In range");
});
test("reference correction is per well and does not double-apply dilution", () => {
  const input = fixture();
  input.subtractRef = true;
  input.signal = input.signal.map((row) => row.map((v) => v + 0.03));
  const result = analyzeElisa(input);
  near(result.samples[0].adjusted, 80, 1e-5);
  near(result.samples[0].wells[0].reference, 0.03);
});
test("calibration-only results allow ungrouped samples", () => {
  const input = fixture();
  input.groups = [];
  const result = analyzeElisa(input);
  assert.equal(result.stats.length, 0);
  assert.equal(result.samples.length, 6);
  assert.equal(result.samples[0].group, "Ungrouped");
});
test("invalid or ambiguous standards and dilutions are rejected", () => {
  let input = fixture();
  input.standards[1].concentration = "";
  assert.throws(() => analyzeElisa(input), /concentrations/);
  input = fixture();
  input.standards[1].concentration = "0";
  assert.throws(() => analyzeElisa(input), /distinct/);
  input = fixture();
  input.standards[1].id = "MISSING";
  assert.throws(() => analyzeElisa(input), /no wells/);
  input = fixture();
  input.groups[0].sampleIds = "STD1";
  assert.throws(() => analyzeElisa(input), /standard/);
  input = fixture();
  input.groups[1].sampleIds = "S1";
  assert.throws(() => analyzeElisa(input), /more than one/);
  for (const factor of [0, -1, "", Infinity, "oops"]) {
    input = fixture();
    input.dilutions.S1 = factor;
    assert.throws(() => analyzeElisa(input), /dilution/);
  }
  assert.throws(() => fit4PL(xs.map((x) => ({ x, y: 1 }))), /increasing/);
  assert.throws(() => fit4PL(xs.map((x) => ({ x, y: 10 - x }))), /increasing/);
  assert.throws(() => fit4PL(xs.slice(0, 4).map((x) => ({ x, y: x }))), /six/);
});
test("technical repeat counts never become independent sample counts", () => {
  const plateIds = emptyPlate(),
    signal = emptyPlate().map((row) => row.map(() => 0));
  [1, 2, 3, 7, 8, 9].forEach((value, c) => {
    signal[0][c] = value;
    plateIds[0][c] = c < 3 ? "S1" : "S2";
  });
  const result = analyzePlate({
    signal,
    plateIds,
    groups: [{ name: "A", sampleIds: "S1-S2" }],
  });
  assert.deepEqual(result.stats[0].values, [2, 8]);
  assert.equal(result.stats[0].n, 2);
  assert.equal(result.stats[0].wellN, 6);
  near(result.stats[0].mean, 5);
});
test("Welch and one-way ANOVA agree with independent SciPy 1.13.1 results", () => {
  const stats = [
    [1, 2, 4, 5],
    [2, 4, 6, 9, 10],
    [3, 5, 7, 11],
  ].map((values, i) => ({ name: String(i), values, ...describe(values) }));
  const welch = compareGroups(stats, "welch");
  near(welch.statistic, -1.8253457759381804, 1e-10);
  near(welch.df, 6.356750451160056, 1e-10);
  near(welch.p, 0.1149818889711674, 1e-7);
  const anova = compareGroups(stats, "anova");
  near(anova.statistic, 1.7243446976186394, 1e-10);
  near(anova.p, 0.22730039101550795, 1e-7);
  assert.equal(compareGroups(stats, "none"), null);
  assert.throws(() => compareGroups(stats, "welch", 0, 0), /different/);
  assert.throws(
    () => compareGroups([{ ...describe([1]), values: [1] }], "anova"),
    /two independent/,
  );
  const constant = [1, 2].map((v) => ({ ...describe([v, v]), values: [v, v] }));
  assert.throws(() => compareGroups(constant, "welch"), /variance/);
  assert.throws(() => compareGroups(constant, "anova"), /variance/);
});
