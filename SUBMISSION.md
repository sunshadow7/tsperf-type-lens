# Algora TSPerf Submission Notes

Target: https://algora.io/challenges/tsperf

## Project

TSPerf Type Lens is a VS Code extension that helps TypeScript developers find expensive type surfaces from inside the editor. It measures editor-observable type load latency and estimates visible type complexity, then gives the result back as CodeLens labels, status bar state, hover detail, heatmap decorations, a measurements tree, and exportable benchmark evidence.

## Why It Fits

- The challenge asks for a VS Code plugin showing TypeScript type complexity / time to load.
- The extension measures TypeScript hover/type-provider latency at cursor and declaration positions.
- It scores type complexity from visible type text signals: length, unions, intersections, generic nesting, object/tuple nesting, conditional type hints, and mapped type hints.
- It includes a bundled TypeScript server plugin for lower-level timing where VS Code loads contributed TypeScript server plugins.
- It exports JSON/CSV evidence so results can be attached to an issue, benchmark report, or prize submission.

## Demo Flow

1. Open `revenue/tsperf-type-lens` in VS Code.
2. Run `npm install` so the local `tsperf-type-lens-tsserver-plugin` file dependency is linked.
3. Press `F5` and choose `Run TSPerf Type Lens`.
4. In the Extension Development Host, open `test-fixtures/complex-types.ts`.
5. Run `TSPerf Type Lens: Measure Visible TypeScript Symbols`.
6. Inspect CodeLens output, heatmap decorations, the `TSPerf Measurements` explorer view, and status bar summaries.
7. Run `TSPerf Type Lens: Export Measurements` and save both JSON and CSV evidence.
8. Capture screenshots showing measured symbols and the exported benchmark data.

## Verification

Run:

```powershell
npm run check
```

Current local checks cover:

- Extension syntax.
- TypeScript server plugin syntax.
- Complexity scoring.
- Hover text extraction.
- JSON/CSV export serialization.
- TypeScript server plugin method wrapping and logging behavior.
- Package surface expectations, including excluding test, fixture, `.vscode`, and `.npm-cache` files.

## Generated Artifacts

- `dist/tsperf-type-lens-0.1.0.vsix`
- `dist/tsperf-type-lens-source-0.1.0-final.zip`

See `ARTIFACTS.md` for archive verification details.

## Known Limitations

- Hover timing reflects editor-observable latency, not a direct compiler trace.
- TypeScript server plugin timing is written to the TypeScript server log; it is not yet streamed into the extension UI.
- Packaging requires `npm install` first so VS Code can resolve the local TypeScript server plugin dependency.
- GUI screenshots still need to be captured in a local VS Code install.
