# Submission Copy

## Title

TSPerf Type Lens

## Short Description

VS Code extension for measuring TypeScript type load latency and visible type complexity directly in the editor.

## Algora Submission Text

TSPerf Type Lens is a VS Code extension that measures TypeScript hover/type-provider latency and estimates visible type complexity from editor-returned type text. It surfaces results through CodeLens labels, status bar summaries, cached hover details, an explorer measurements view, editor heatmap decorations, and JSON/CSV benchmark export.

It also includes an optional bundled TypeScript server plugin that logs lower-level language-service timing for quick info, completions, definitions, and semantic diagnostics when VS Code loads contributed TypeScript server plugins.

Local verification:

- `npm run check`
- Extension syntax check
- TypeScript server plugin syntax check
- Complexity scoring and hover extraction tests
- JSON/CSV export serialization tests
- TypeScript server plugin wrapping/logging tests
- Package surface test

Artifacts:

- Source archive: `dist/tsperf-type-lens-source-0.1.0-final.zip`
- VSIX package: `dist/tsperf-type-lens-0.1.0-final.vsix`

## GitHub Release Notes

Initial public release of TSPerf Type Lens.

Features:

- Measure TypeScript type-provider latency at cursor or declaration positions.
- Batch-measure visible TypeScript/JavaScript editors.
- Show measured latency and complexity through CodeLens, status bar state, hover detail, and explorer tree view.
- Highlight medium/slow symbols with editor heatmap decorations.
- Export JSON/CSV benchmark evidence.
- Include optional TypeScript server plugin timing for language-service calls.

## Marketplace Description

TSPerf Type Lens helps TypeScript developers find expensive type surfaces inside VS Code. It measures editor-observable type load latency, estimates displayed type complexity, highlights medium/slow symbols, and exports benchmark evidence for regression tracking or performance reports.

## Auth-Gated Submit Steps

1. Create a GitHub repo, for example `fellsway-group/tsperf-type-lens`.
2. Upload/extract `dist/tsperf-type-lens-source-0.1.0-final.zip` as the repo source.
3. Create a GitHub release and attach `dist/tsperf-type-lens-0.1.0-final.vsix`.
4. Publish the VSIX to the Visual Studio Marketplace or make the release asset public.
5. Submit the GitHub URL and Marketplace/release URL at https://algora.io/challenges/tsperf.

