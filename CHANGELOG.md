# Changelog

## Unreleased

- Added a dedicated Graphs page and presentation module reusing ResultsChart, with group mean bars, individual sample points, and SD error bars by default.
- Preserved graph settings and calculated comparisons when switching between Results and Graphs; input edits invalidate both pages.
- Kept statistical controls on Results and added a comparison table showing p-value, method, groups, statistic, degrees of freedom, and unadjusted status. No statistical calculation logic changed.
- Added desktop/mobile browser coverage for navigation, graph defaults and settings, result preservation, and comparison invalidation.

## 1.2.0 - 2026-09-12

Prepared for the first curated public source release, building on the workflow of the 1.1.0 prototype.

- Separate plate-map and reading inputs with strict coordinate-preserving CSV/TSV parsing.
- ELISA 4PL fitting, dilution adjustment, calibration diagnostics, and out-of-range flags.
- Sample-level aggregation of technical repeats, group bars, optional circles, SD/SEM, and optional unpaired tests.
- CSV/PNG exports, input-change invalidation, responsive views, and synthetic examples.
- Calculation fixtures, production browser checks, a portfolio-subpath build, and optional GitHub Pages deployment.

The prototype's private development history is not included. Public changes from this release onward are tracked here. Real-plate agreement testing remains future work; this release does not claim clinical or assay validation.
