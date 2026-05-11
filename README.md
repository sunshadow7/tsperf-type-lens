# TSPerf Type Lens

TSPerf Type Lens is a VS Code extension prototype for the Algora TSPerf challenge. It measures how long VS Code's TypeScript hover/type provider takes to resolve a symbol, then estimates the visible type's complexity from the returned type text.

The challenge target is a VS Code plugin that shows TypeScript type complexity / time to load. This first version focuses on a practical loop:

- CodeLens above declarations: `TSPerf: measure type load`
- Command palette action: `TSPerf Type Lens: Measure Type At Cursor`
- Visible-editor batch scan: `TSPerf Type Lens: Measure Visible TypeScript Symbols`
- Explorer side view: `TSPerf Measurements`
- Hover overlay for cached measurements
- Status bar summary for the nearest cached measurement
- Medium/slow heatmap decorations in the editor
- JSON/CSV export for benchmark evidence
- Optional TypeScript server plugin timing for quick info, completions, definitions, and semantic diagnostics

## How It Works

The extension asks VS Code to run the active TypeScript hover provider at a declaration or cursor position, times the result, and parses the returned hover text. It calculates a complexity score using visible signals: type text length, union/intersection count, generic nesting depth, object/tuple nesting, conditional type hints, and mapped type hints.

This measures editor-observable type load latency because it reflects the user-facing cost developers feel in VS Code. The extension also contributes `tsperf-type-lens-tsserver-plugin`, a TypeScript server plugin that logs lower-level language-service timing when VS Code loads contributed TypeScript plugins.

The TypeScript server plugin writes to the TypeScript server log instead of changing editor behavior. It is configured through the built-in VS Code TypeScript extension API when available.

## Local Development

Open this folder in VS Code, press `F5`, and run the extension host against `test-fixtures/complex-types.ts`.

No runtime dependencies are required beyond VS Code itself.

Run local checks without VS Code:

```powershell
npm run check
```

Optional packaging later:

```powershell
npm install
npx vsce package
```

## Submission Gap

For a serious prize submission, the next improvements are:

- Run the extension in Extension Development Host and capture screenshots/export output.
- Install/package the local `tsperf-type-lens-tsserver-plugin` dependency before creating a VSIX.
- Publish the extension source under MIT on GitHub.
- Package and submit the VSIX / Marketplace listing to Algora.
