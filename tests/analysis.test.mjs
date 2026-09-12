import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePlate,
  parseSampleList,
  describe,
  analyzePlate,
  emptyPlate,
} from "../src/analysis.js";
const matrix = () =>
  Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 12 }, (_, c) => r * 12 + c + 1),
  );
const tsv = (rows) => rows.map((r) => r.join("\t")).join("\n");
test("full plates, column headers, row labels, CSV and scientific notation preserve coordinates", () => {
  assert.deepEqual(parsePlate(tsv(matrix())), matrix());
  const labelled = matrix().map((row, r) => [
    String.fromCharCode(65 + r),
    ...row,
  ]);
  assert.deepEqual(
    parsePlate(
      tsv([["", ...Array.from({ length: 12 }, (_, i) => i + 1)], ...labelled]),
    ),
    matrix(),
  );
  assert.deepEqual(
    parsePlate(
      matrix()
        .map((r) => r.join(","))
        .join("\n"),
    ),
    matrix(),
  );
  const rows = matrix();
  rows[0][0] = "1e-3";
  assert.equal(parsePlate(tsv(rows))[0][0], 0.001);
});
test("missing, invalid, nonfinite and surplus wells are rejected rather than shifted", () => {
  for (const replacement of ["", "oops", "Infinity", "NaN", "0x10"]) {
    const rows = matrix();
    rows[2][4] = replacement;
    assert.throws(() => parsePlate(tsv(rows)), /C5/);
  }
  assert.throws(
    () => parsePlate(tsv(matrix().map((row) => row.slice(0, 10)))),
    /12 wells/,
  );
  const extra = matrix().map((row) => row.map((v) => v + 100));
  assert.throws(() => parsePlate(tsv([...extra, extra[0]])), /8 plate rows/);
  assert.throws(
    () => parsePlate(tsv(matrix().map((row) => [...row, 450]))),
    /12 wells/,
  );
});
test("map imports retain empty and quoted sample cells", () => {
  const rows = Array.from({ length: 8 }, () => Array(12).fill(""));
  rows[0][2] = "S3";
  assert.deepEqual(parsePlate(tsv(rows), false), rows);
  const csv = Array.from({ length: 8 }, () => Array(12).fill('""'));
  csv[0][0] = '"Sample, one"';
  assert.equal(
    parsePlate(csv.map((row) => row.join(",")).join("\n"), false)[0][0],
    "Sample, one",
  );
});
test("bounded ranges and case normalization", () => {
  assert.deepEqual(parseSampleList("S01-S03, s01"), ["S01", "S02", "S03"]);
  assert.throws(() => parseSampleList("S1-T3"), /prefix/);
  assert.throws(() => parseSampleList("1-100000000"), /96/);
});
test("hand-checkable sample statistics and undefined dispersion", () => {
  const s = describe([1, 2, 3]);
  assert.equal(s.mean, 2);
  assert.equal(s.sd, 1);
  assert.ok(Math.abs(s.sem - 1 / Math.sqrt(3)) < 1e-12);
  assert.equal(s.cv, 50);
  assert.equal(describe([4]).sd, null);
  assert.equal(describe([-1, 1]).cv, null);
  assert.equal(describe([-3, -1]).cv, null);
});
test("reference validation, overlap rejection, and exact well accounting", () => {
  const signal = matrix(),
    plateIds = emptyPlate();
  plateIds[0][0] = "S1";
  plateIds[0][1] = "S2";
  plateIds[0][2] = "unused";
  const args = {
    signal,
    plateIds,
    groups: [{ name: "Group", sampleIds: "S1-S2" }],
    subtractRef: true,
    reference: matrix().map((row) => row.map(() => 0.5)),
  };
  const result = analyzePlate(args);
  assert.deepEqual(result.stats[0].values, [0.5, 1.5]);
  assert.deepEqual(result.stats[0].wells, ["A1", "A2"]);
  assert.equal(result.ungrouped.length, 1);
  assert.throws(() => analyzePlate({ ...args, reference: null }), /Reference/);
  assert.throws(
    () =>
      analyzePlate({
        ...args,
        groups: [...args.groups, { name: "Other", sampleIds: "s1" }],
      }),
    /more than one/,
  );
  assert.throws(
    () =>
      analyzePlate({ ...args, groups: [{ name: "Empty", sampleIds: "S99" }] }),
    /no matching/,
  );
});
