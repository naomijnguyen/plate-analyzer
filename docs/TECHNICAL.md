# Calculation Notes

[Project overview and setup](../README.md)

These notes describe the calculation conventions implemented in the public research prototype. They are not an assay validation report.

## Map first, readings separately

The plate map contains sample IDs, not readings. Type into its wells, paste a grid, or upload CSV/TSV. A repeated ID identifies technical repeats of the same sample. IDs are matched without case sensitivity. Use short IDs without spaces, commas, or semicolons for group membership, such as `S1`, `Control01`, or `Donor_A`.

Paste instrument readings on the Data tab as an independent grid. Both inputs use 8 rows by 12 columns. Optional A-H row labels and a 1-12 column header are accepted. Reading grids require all 96 finite numeric values, including unused wells; missing cells are rejected instead of shifting subsequent values. The map may leave unused wells unlabelled. Only labelled wells contribute to summaries.

Groups accept IDs or ranges, for example `S1-S6, S9`. A sample cannot belong to two groups. Inspect the displayed sample counts and contributing wells to confirm the assignment. Native Excel workbooks and instrument-specific export formats are not parsed in this revision; Excel ranges can be pasted as TSV or exported as CSV. A Worker-based importer remains a future option, not a dependency.

## ELISA quantification

1. Assign a shared ID to repeats of each standard level and each unknown sample.
2. In Calibration, match those standard IDs to known concentrations and set concentration units. The editable initial values are a CXCL10-style series, not a universal kit configuration.
3. Enter each sample's pre-assay dilution factor: `1` for undiluted, `2` for a twofold dilution. These factors must describe sample preparation relative to the standards; do not add a second factor for equal assay-volume additions to standards and samples.
4. Enter signal readings and optionally a separate reference-wavelength grid. Reference subtraction happens per well before averaging. No blank-well subtraction is silently applied.
5. Analyze to see the curve, standard back-calculations, per-sample concentrations, and group charts. Groups are optional for concentration-only analysis.

The calculation order is corrected well OD -> mean technical-repeat OD -> interpolate once -> multiply by the sample dilution factor. We do not average separately interpolated well concentrations, since nonlinear inversion makes those different calculations.

The implemented increasing-response four-parameter logistic model is:

```text
y = bottom + (top - bottom) / (1 + (midpoint / x)^slope)
```

At x=0 the response is the bottom asymptote. The zero standard participates in fitting, but the reporting interval starts at the lowest nonzero standard. The fit uses unweighted least squares on standard-level mean OD, using `ml-levenberg-marquardt` with nine deterministic starting points. The chart uses a linear concentration axis so zero remains visible; the optimizer does not perform a log-log linear regression.

At least six distinct levels, including five nonzero levels, are required by this implementation. Concentration and OD are normalized during optimization. Normalized bottom bounds are -5 to 1; response-span bounds are 0.05 to 100; midpoint bounds are (lowest positive / highest concentration) \* exp(-7) to exp(7); slope bounds are 0.05 to 20. Fits reaching these bounds are rejected. These are numerical safeguards, not biological acceptance criteria.

Unknowns must be inside both the observed positive-standard endpoint response interval and the fitted concentration interval. Out-of-range samples remain in the sample table and exports with a status and no numeric concentration. They are excluded from group summaries/tests, with a visible warning; groups with no usable samples are listed separately. No extrapolation or substitution of zero is performed. A relative 1e-8 tolerance handles floating-point comparisons at the endpoints.

The results include OD repeat SD/CV, residuals, standard back-calculated concentrations, recovery percentages, R-squared, and RMSE. An R-squared below 0.98 or a nonmonotonic standard series triggers a review warning; that threshold is only a display heuristic, not a kit-specified acceptance rule. Inspect the curve and recovery values, not just R-squared. This revision does not estimate parameter confidence intervals, fit uncertainty, LOD/LOQ, or automatically accept/reject an assay. The kit's published sensitivity is not treated as this run's quantification limit.

Reference: [BioLegend Human CXCL10/IP-10 ELISA protocol, catalog 439904](https://www.biolegend.com/Files/Images/media_assets/pro_detail/datasheets/439904_V02_JYH.pdf), particularly Assay Procedure 17 and Calculation of Results. It describes 450 nm with optional 570 nm subtraction, assay-specific standards, dilution adjustment, and 4PL or 5PL analysis. This revision implements 4PL only. The example readings are synthetic and are not BioLegend experimental data; no endorsement is implied.

## Group charts and tests

For raw group analysis, technical repeats are averaged within sample ID. For ELISA, each sample contributes its dilution-adjusted concentration. Every circle is one sample value, and every bar is the mean across those sample values. `n` counts samples, not repeated wells. SD uses the sample denominator n-1; SEM is SD/sqrt(n). Dispersion is unavailable for n=1, and CV is unavailable when the mean is nonpositive.

Error bars can be SD, SEM, or off. Statistical testing starts off and requires an explicit assumption confirmation:

- Two-sided Welch t-test for a selected pair of independent groups with approximately normal sample distributions; equal variance is not assumed.
- Ordinary one-way ANOVA across all groups, assuming independent samples, normal residuals, and equal variances. Its p-value is omnibus, not evidence that any particular pair differs.

Tests use `jstat` and require at least two samples per compared group. Unique IDs do not establish biological independence: paired donors, repeated doses on the same sample, or nested experiments need another analysis. P-values are unadjusted; there are no post-hoc comparisons or multiple-testing corrections here. Selecting tests repeatedly or excluding out-of-range samples can change interpretation. The app displays p-values regardless of which side of 0.05 they fall on.

## Exports and source

- Wells CSV retains labelled well values; ELISA exports include raw signal, optional reference, and corrected OD, including standards and out-of-range unknowns.
- Samples CSV includes technical-repeat summaries, dilution factors, interpolated/adjusted concentrations, and status.
- Curve CSV includes standard-level measurements, residuals, recovery, fitted parameters, and fit diagnostics.
- Summary CSV contains group counts/statistics and the currently selected calculated comparison, if any. A single omnibus or pairwise result is repeated as analysis metadata on the group rows; it is not a separate test per row.
- PNG exports show the curve or group chart with a white background. The group graph records the chosen error-bar type and calculated comparison.

Interesting code: [plate parsing and group statistics](../src/analysis.js), [ELISA fitting and interpolation](../src/elisa.js), [ELISA controls and curve](../src/ElisaPanels.jsx), [group plotting](../src/ResultsChart.jsx), and [workflow state](../src/PlateAnalyzer.jsx).

## Checks and scope

`npm test` covers import coordinates, malformed/missing data, bounded ID ranges, reference correction, sample aggregation, dilution handling, calibration endpoints, out-of-range values, known 4PL parameters, a noisy fit, and statistical comparisons. Noisy-fit parameters and test results are checked against independently computed SciPy 1.13.1 fixtures; SciPy is not a runtime dependency.

This is a research prototype with synthetic-data verification, not a validated assay-analysis package. Next evidence to collect is agreement with an established analysis tool on a real de-identified plate, using the same fit model, weighting, exclusion rules, and dilution conventions. Treatment dose-response fitting, paired/repeated-measures tests, 5PL, and Excel automation are separate future decisions.
