# Architecture and Hosting

[Overview](../README.md) · [Calculation notes](TECHNICAL.md)

## One browser app, two analysis paths

The plate map and readings are independent inputs. React owns the working state; calculation modules receive snapshots and return results. Editing a map, group, reading, standard, or dilution clears the previous result so it cannot be mistaken for the current analysis.

```text
Plate IDs + groups       Signal + optional reference readings
             \                 /
              validated 8 x 12 inputs
                         |
          +--------------+--------------+
          |                             |
   Group comparison                ELISA quantification
   mean OD per sample              standard-level mean OD
          |                             |
   group summaries                 increasing 4PL fit
          |                             |
          |                        unknown mean OD -> concentration
          |                             |
          |                        apply sample dilution
          |                             |
          +------ sample-level group summaries
                         |
               charts, tests, CSV/PNG
```

## Files to start with

| File                                          | Responsibility                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [PlateAnalyzer.jsx](../src/PlateAnalyzer.jsx) | Inputs, navigation, synthetic examples, state invalidation, and result views               |
| [analysis.js](../src/analysis.js)             | Coordinate-preserving parsing, group membership, repeat aggregation, and statistical tests |
| [elisa.js](../src/elisa.js)                   | Standard fitting, inversion, dilution adjustment, and range flags                          |
| [ElisaPanels.jsx](../src/ElisaPanels.jsx)     | Calibration controls, sample/standard tables, and exports                                  |
| [ResultsChart.jsx](../src/ResultsChart.jsx)   | Group bars, sample circles, error bars, and comparison annotation                          |
| [tests](../tests)                             | Numerical fixtures and end-to-end browser checks                                           |

The fitting and statistical work uses existing libraries. App-specific code decides which wells belong to a sample, the order of transformations, what gets flagged, and what appears in the exports. Those choices are documented in [Calculation notes](TECHNICAL.md).

## Hosting

This app builds to static HTML, CSS, and JavaScript. No Worker, database, model credentials, or assay-data endpoint is required. Loading the site still makes ordinary requests to the host; calculations and chosen input files stay in the browser tab.

The standalone demo is intended for GitHub Pages at `https://naomijnguyen.github.io/plate-analyzer/`. Build it with:

```sh
npm run build:pages
```

The included GitHub workflow checks the source and production browser flows before deployment. GitHub Pages must be enabled with GitHub Actions as its source. Actions are pinned to commit IDs; deployment has only Pages/OIDC permissions, while pull requests only run checks. No Cloudflare or model secrets belong in this repository.

The portfolio at `naomijnguyen.com` can embed the GitHub-hosted app in a cross-origin iframe and link to it directly for a full-screen view. The parent portfolio does not send its assistant passphrase, session state, or private content to the iframe. The embed needs scripts and downloads; it does not need camera, microphone, location, or top-level navigation permissions.

A self-hosted alternative is also prepared, but is not the chosen deployment:

```sh
npm run build:portfolio
```

That build expects its files at `/apps/plate-analyzer/`. The portfolio host would need an explicit static-asset route that preserves the analyzer's asset paths instead of falling back to the portfolio shell. Test that routing before switching from the GitHub-hosted embed. `npm run build` remains the root-path option for other hosts.

## Verification and release boundary

The browser checks exercise the built app rather than the development server, including subpath loading, desktop/mobile layout, repeat counts, chart pixels, test controls, invalidation, import, exports, and absence of analysis uploads. `TEST_DEPLOYMENT=portfolio npm run test:browser` checks the alternative portfolio base path. `TEST_BASE_URL` can point the same tests at the deployed app.

Publish source, docs, the lockfile, license, synthetic screenshot, and tests. Keep private assay files, local inputs, environment files, caches, browser traces, and credentials out of Git. `private: true` in package.json prevents accidental npm publication; it does not make a GitHub repository private.

This source edition starts a new public history. The earlier prototype remains intact elsewhere. A real-plate comparison using matching analysis settings is the next scientific verification step, separate from whether the software installs, runs, and deploys correctly.
