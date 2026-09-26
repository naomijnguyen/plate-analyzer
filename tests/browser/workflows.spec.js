import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

const tab = (page, name) =>
  page.getByRole("navigation").getByRole("button", { name });
async function example(page, elisa = false) {
  await page.goto("./");
  if (elisa) await page.getByLabel("Analysis workflow").selectOption("elisa");
  await page.getByRole("button", { name: "Load example", exact: true }).click();
  await tab(page, /Data/).click();
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
}
async function checkCharts(page) {
  await expect(page.locator("canvas").first()).toBeVisible();
  for (const canvas of await page.locator("canvas").all()) {
    await expect
      .poll(() =>
        canvas.evaluate(
          (c) => c.getContext("2d").getImageData(0, 0, 1, 1).data[3],
        ),
      )
      .toBe(255);
    const colored = await canvas.evaluate((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i + 3] && Math.min(d[i], d[i + 1], d[i + 2]) < 180) n++;
      return n;
    });
    expect(colored).toBeGreaterThan(1000);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("group charts use samples, support tests, and export a graph", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await example(page);
  await expect(page.locator("table.results tbody tr")).toHaveCount(3);
  await expect(
    page.locator("table.results tbody tr").first().getByRole("cell").nth(0),
  ).toHaveText("10");
  await expect(
    page.locator("table.results tbody tr").first().getByRole("cell").nth(1),
  ).toHaveText("30");
  await expect(
    page.getByLabel("Statistical test", { exact: true }),
  ).toHaveValue("none");
  await page
    .getByLabel("Statistical test", { exact: true })
    .selectOption("welch");
  await page.getByRole("button", { name: "Calculate comparison" }).click();
  await expect(page.getByRole("alert")).toContainText("Confirm independent");
  await page.getByLabel(/Independent samples;/).check();
  await page.getByRole("button", { name: "Calculate comparison" }).click();
  await expect(page.locator("output")).toContainText("Welch");
  await page
    .getByLabel("Statistical test", { exact: true })
    .selectOption("anova");
  await page.getByLabel(/Independent samples;/).check();
  await page.getByRole("button", { name: "Calculate comparison" }).click();
  await expect(page.locator("output")).toContainText("ANOVA");
  const comparison = page.getByRole("table", { name: "Statistical comparison results" });
  await expect(comparison).toContainText("All groups");
  await expect(comparison).toContainText("None (unadjusted)");
  await expect(comparison).toContainText(/p [=<]/);
  await tab(page, /Graphs/).click();
  await expect(page.getByLabel("Graph comparison", { exact: true })).toContainText("ANOVA");
  await checkCharts(page);
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download graph PNG", exact: true })
    .click();
  const download = await event;
  await download.saveAs(info.outputPath("groups.png"));
  expect((await fs.stat(info.outputPath("groups.png"))).size).toBeGreaterThan(
    5000,
  );
  await page.screenshot({
    path: info.outputPath("group-results.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("ELISA handles repeats, dilution, range flags, and CSV exports locally", async ({
  page,
}, info) => {
  const errors = [],
    external = [],
    writes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (
      new URL(request.url()).origin !== new URL(info.project.use.baseURL).origin
    )
      external.push(request.url());
    if (request.method() !== "GET") writes.push(request.url());
  });
  await example(page, true);
  await expect(
    page.getByRole("heading", { name: "ELISA standard curve", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("table.results tbody tr").nth(1).getByRole("cell").nth(0),
  ).toHaveText("5");
  await expect(
    page.locator("table.results tbody tr").nth(1).getByRole("cell").nth(1),
  ).toHaveText("15");
  await expect(page.getByRole("status")).toContainText("1 out-of-range");
  await checkCharts(page);
  for (const [label, file] of [
    ["Samples CSV", "samples.csv"],
    ["Curve CSV", "curve.csv"],
    ["Wells CSV", "wells.csv"],
    ["Summary CSV", "summary.csv"],
  ]) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    await (await event).saveAs(info.outputPath(file));
  }
  const samples = await fs.readFile(info.outputPath("samples.csv"), "utf8");
  expect(samples).toContain("Above calibration range");
  expect(samples).toContain("adjusted_concentration");
  await page.screenshot({
    path: info.outputPath("elisa-results.png"),
    fullPage: true,
  });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("elisa-preview.png") });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  expect(writes).toEqual([]);
});

test("map imports stay separate from readings and edits invalidate results", async ({
  page,
}) => {
  await example(page);
  await tab(page, /Plate map/).click();
  await page.getByLabel("Sample A1", { exact: true }).fill("UPDATED");
  await expect(tab(page, /Results/)).toBeDisabled();
  await expect(tab(page, /Graphs/)).toBeDisabled();
  const rows = Array.from({ length: 8 }, () => Array(12).fill(""));
  rows[0][0] = "IMPORTED";
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "map.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(rows.map((row) => row.join(",")).join("\n")),
    });
  await expect(page.getByLabel("Sample A1", { exact: true })).toHaveValue(
    "IMPORTED",
  );
  await expect(page.getByLabel("Sample A2", { exact: true })).toHaveValue("");
  await tab(page, /Data/).click();
  await expect(page.getByLabel("Signal data", { exact: true })).not.toHaveValue(
    "",
  );
  await page.getByLabel("Signal data", { exact: true }).fill("bad");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("8 plate rows");
});

test("calibration edits clear concentrations and invalid factors are rejected", async ({
  page,
}) => {
  await example(page, true);
  await tab(page, /Calibration/).click();
  await page.getByLabel("Dilution S2", { exact: true }).fill("0");
  await expect(tab(page, /Results/)).toBeDisabled();
  await expect(tab(page, /Graphs/)).toBeDisabled();
  await tab(page, /Data/).click();
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("dilution factor");
});


for (const elisa of [false, true]) {
  test(`${elisa ? "ELISA" : "group"} graphs are separate and preserve settings and results`, async ({ page }) => {
    await page.goto("./");
    await expect(tab(page, /Graphs/)).toBeDisabled();
    await expect(tab(page, /Results/)).toBeDisabled();
    await example(page, elisa);
    await expect(tab(page, /Results/)).toHaveAttribute("aria-current", "step");
    await expect(page.getByRole("button", { name: "Download graph PNG", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Error bars", { exact: true })).toHaveCount(0);
    const originalRows = await page.locator("table.results").innerText();
    await page.getByRole("button", { name: "Open graphs", exact: true }).click();
    await expect(tab(page, /Graphs/)).toHaveAttribute("aria-current", "step");
    await expect(page.getByRole("heading", { name: "Graphs", exact: true })).toBeVisible();
    await expect(page.locator("table.results")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Plate heatmap" })).toHaveCount(0);
    await expect(page.getByLabel("Statistical test", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Graph comparison", { exact: true })).toContainText("No comparison calculated");
    const mode = page.getByLabel("Error bars", { exact: true });
    const points = page.getByLabel("Individual samples", { exact: true });
    const canvas = page.getByRole("img", { name: /Group means/ });
    await expect(mode).toHaveValue("sd");
    await expect(points).toBeChecked();
    await checkCharts(page);
    const sdImage = await canvas.evaluate((c) => c.toDataURL());
    await mode.selectOption("sem");
    await expect(canvas).toHaveAttribute("aria-label", "Group means with SEM error bars and individual samples");
    await expect.poll(() => canvas.evaluate((c) => c.toDataURL())).not.toBe(sdImage);
    const semImage = await canvas.evaluate((c) => c.toDataURL());
    await mode.selectOption("none");
    await expect(canvas).toHaveAttribute("aria-label", "Group means without error bars and individual samples");
    await expect.poll(() => canvas.evaluate((c) => c.toDataURL())).not.toBe(semImage);
    const withPoints = await canvas.evaluate((c) => c.toDataURL());
    await points.uncheck();
    await expect.poll(() => canvas.evaluate((c) => c.toDataURL())).not.toBe(withPoints);
    await mode.selectOption("sem");
    await page.getByRole("button", { name: "Back to results", exact: true }).click();
    await expect(page.locator("table.results")).toHaveText(originalRows);
    await tab(page, /Graphs/).click();
    await expect(mode).toHaveValue("sem");
    await expect(points).not.toBeChecked();
    await expect(canvas).toHaveAttribute("aria-label", "Group means with SEM error bars");
    await mode.selectOption("sd");
    await points.check();
    await checkCharts(page);
  });
}

test("changed comparison settings and data clear graph annotations", async ({ page }) => {
  await example(page);
  await page.getByLabel("Statistical test", { exact: true }).selectOption("welch");
  await page.getByLabel(/Independent samples;/).check();
  await page.getByRole("button", { name: "Calculate comparison" }).click();
  const comparisonText = await page.locator("output").innerText();
  await tab(page, /Graphs/).click();
  await expect(page.getByLabel("Graph comparison", { exact: true })).toContainText("Control vs Treatment");
  await tab(page, /Results/).click();
  await expect(page.locator("output")).toHaveText(comparisonText);
  await page.getByLabel("Second group", { exact: true }).selectOption("2");
  await expect(page.getByRole("table", { name: "Statistical comparison results" })).toHaveCount(0);
  await tab(page, /Graphs/).click();
  await expect(page.getByLabel("Graph comparison", { exact: true })).toContainText("No comparison calculated");
  await tab(page, /Data/).click();
  const signal = page.getByLabel("Signal data", { exact: true });
  await signal.fill((await signal.inputValue()).replace(/^-?[0-9.]+/, "0.5"));
  await expect(tab(page, /Graphs/)).toBeDisabled();
  await expect(tab(page, /Results/)).toBeDisabled();
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await tab(page, /Graphs/).click();
  await expect(page.getByLabel("Graph comparison", { exact: true })).toContainText("No comparison calculated");
});
