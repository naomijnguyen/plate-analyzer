# 96-Well Plate Analyzer

[Live demo](https://naomijnguyen.github.io/plate-analyzer/) · [Portfolio project](https://www.naomijnguyen.com/docs/plate-analyzer) · [Calculation notes](docs/TECHNICAL.md) · [Architecture and hosting](docs/ARCHITECTURE.md)

I started this as a quick prototype to make plate data easier to work with: map the wells, define the groups, and get a graph without rebuilding the same spreadsheet each time. This version adds an ELISA calibration workflow and keeps the underlying well readings available alongside the results.

![ELISA analysis with synthetic plate data](assets/elisa-demo.png)

## What it does

- Keeps plate maps separate from instrument readings, with CSV/TSV map import and editable wells.
- Fits an increasing-response 4PL standard curve, interpolates unknown samples, and applies dilution factors.
- Combines technical repeats by sample ID before group comparisons. Each circle represents one sample, not one well.
- Plots group bars with optional sample circles, SD/SEM error bars, and optional Welch t-test or one-way ANOVA results.
- Exports well readings, concentrations, curve diagnostics, group summaries, and PNG graphs. Out-of-range samples stay visible and flagged.

Everything runs in the browser. Plate data is not uploaded to an analysis service, and there are no API keys or model calls. Working data is held in memory, so refresh clears it; export results before leaving. The hosting provider still serves the site and handles normal web requests.

## Try it

Open the [demo](https://naomijnguyen.github.io/plate-analyzer/) or run the app locally, choose **Group comparison** or **ELISA quantification**, and select **Load example**. Both examples are synthetic. The ELISA example includes a diluted sample and an out-of-range sample.

For your own plate, enter or import sample IDs on **Plate map**, then paste the separate 8 x 12 reading grid on **Data**. Technical repeats share an ID. Groups accept lists or ranges such as `S1-S6, S9`. ELISA standard IDs, known concentrations, and sample dilution factors live on **Calibration**. Excel ranges can be pasted or exported as CSV/TSV; native workbook import is not included.

## Run locally

Use Node.js 22.13 or newer and npm.

```sh
npm ci
npm run dev
```

Open the address printed by Vite. To check or build it:

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The browser tests build and exercise the production app on desktop and phone-sized viewports. GitHub Actions checks pushes and pull requests, then deploys successful `main` builds to Pages. A separate `npm run build:portfolio` prepares assets for `/apps/plate-analyzer/` if we later self-host the app. That alternative route is not live. Hosting and embedding details are in [Architecture](docs/ARCHITECTURE.md).

## Decisions worth a look

Missing readings are rejected rather than shifted into neighboring wells. Editing inputs clears old results. ELISA calculations average repeat OD before nonlinear interpolation, then apply the dilution factor once. Out-of-range readings are not extrapolated or substituted with zero.

The [calculation notes](docs/TECHNICAL.md) cover fitting bounds, standard recovery, repeat handling, test assumptions, and exports. The [tests](tests) include synthetic recovery checks and numerical fixtures independently calculated with SciPy. This is a research prototype, not a validated assay-analysis package; the next comparison is a real de-identified plate analyzed with the same settings in an established tool.

## Source and dependencies

Start with [plate parsing and group statistics](src/analysis.js), [ELISA fitting](src/elisa.js), or [workflow state](src/PlateAnalyzer.jsx). Plots and calibration controls are separate components under `src/`.

React/React DOM power the interface; Chart.js handles plotting; Papa Parse reads CSV/TSV; simple-statistics, jStat, and ml-levenberg-marquardt handle the math; Lucide supplies icons. Vite builds the app, and Playwright checks the browser workflows. Installed versions are recorded in `package-lock.json`. Python is not required to run or test the app.

## Credits and history

Built by **Jennifer Naomi Nguyen** with AI-assisted coding. Claude was a development collaborator on the original prototype; the 1.2.0 revision was developed with Codex through workflow decisions, calculation checks, and iteration with Jennifer. This is a curated source edition derived from the 1.1.0 prototype, not a copy of its private repository history. See the [changelog](CHANGELOG.md).

The [BioLegend CXCL10/IP-10 protocol](https://www.biolegend.com/Files/Images/media_assets/pro_detail/datasheets/439904_V02_JYH.pdf) was a reference for the ELISA workflow. All bundled readings and screenshots are synthetic; no vendor endorsement is implied. The original [MIT license](LICENSE) is preserved.
