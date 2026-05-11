"use strict";

let vscode;
try {
  vscode = require("vscode");
} catch {
  vscode = undefined;
}

const SUPPORTED_LANGUAGES = new Set([
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact"
]);
const TS_SERVER_PLUGIN_ID = "tsperf-type-lens-tsserver-plugin";

const DECLARATION_RE =
  /\b(export\s+)?(declare\s+)?(type|interface|class|enum|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;

const measurementCache = new Map();
let measuringHover = false;
let codeLensProvider;
let treeProvider;
let statusItem;
let mediumDecorationType;
let slowDecorationType;

function activate(context) {
  ensureVscodeApi();

  treeProvider = new MeasurementTreeProvider();
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusItem.command = "tsperfTypeLens.measureCursorType";
  statusItem.text = "$(watch) TSPerf";
  statusItem.tooltip = "Measure TypeScript type load latency at cursor";
  statusItem.show();

  codeLensProvider = new TypePerfCodeLensProvider();
  mediumDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(245, 158, 11, 0.16)",
    border: "1px solid rgba(245, 158, 11, 0.45)",
    overviewRulerColor: "rgba(245, 158, 11, 0.75)",
    overviewRulerLane: vscode.OverviewRulerLane.Right
  });
  slowDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    border: "1px solid rgba(239, 68, 68, 0.55)",
    overviewRulerColor: "rgba(239, 68, 68, 0.85)",
    overviewRulerLane: vscode.OverviewRulerLane.Right
  });

  context.subscriptions.push(
    statusItem,
    mediumDecorationType,
    slowDecorationType,
    vscode.window.createTreeView("tsperfTypeLens.measurements", {
      treeDataProvider: treeProvider,
      showCollapseAll: true
    }),
    vscode.languages.registerCodeLensProvider(
      Array.from(SUPPORTED_LANGUAGES).map((language) => ({ language })),
      codeLensProvider
    ),
    vscode.languages.registerHoverProvider(
      Array.from(SUPPORTED_LANGUAGES).map((language) => ({ language })),
      {
        provideHover(document, position) {
          if (measuringHover) {
            return undefined;
          }

          const measurement = findNearestMeasurement(document, position);
          if (!measurement) {
            return undefined;
          }

          return new vscode.Hover(renderMeasurementMarkdown(measurement));
        }
      }
    ),
    vscode.commands.registerCommand("tsperfTypeLens.measureCursorType", measureCursorType),
    vscode.commands.registerCommand("tsperfTypeLens.measureVisibleEditors", measureVisibleEditors),
    vscode.commands.registerCommand("tsperfTypeLens.measurePosition", measureCommandPosition),
    vscode.commands.registerCommand("tsperfTypeLens.exportMeasurements", exportMeasurements),
    vscode.commands.registerCommand("tsperfTypeLens.clearMeasurements", clearMeasurements)
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (!isSupportedDocument(event.textEditor.document)) {
        return;
      }
      const position = event.selections[0]?.active;
      const measurement = position ? findNearestMeasurement(event.textEditor.document, position) : undefined;
      updateStatus(measurement);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      deleteDocumentMeasurements(event.document.uri);
      refreshViews();
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => {
      updateAllDecorations();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateAllDecorations();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("tsperfTypeLens")) {
        configureTypescriptPlugin();
        refreshViews();
      }
    })
  );

  configureTypescriptPlugin();
}

async function measureCursorType() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isSupportedDocument(editor.document)) {
    vscode.window.showInformationMessage("Open a TypeScript or JavaScript file to measure type load latency.");
    return;
  }

  const measurement = await measureAtPosition(editor.document, editor.selection.active);
  if (!measurement) {
    return;
  }

  cacheMeasurement(measurement);
  refreshViews();
  updateStatus(measurement);
  vscode.window.showInformationMessage(formatMeasurementSummary(measurement));
}

async function measureVisibleEditors() {
  const editors = vscode.window.visibleTextEditors.filter((editor) => isSupportedDocument(editor.document));
  if (editors.length === 0) {
    vscode.window.showInformationMessage("No visible TypeScript or JavaScript editors to measure.");
    return;
  }

  const maxSymbols = getConfigNumber("maxSymbolsPerDocument", 40);
  let measured = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Measuring TypeScript symbol load times",
      cancellable: true
    },
    async (progress, token) => {
      for (const editor of editors) {
        const symbols = collectDeclarationPositions(editor.document).slice(0, maxSymbols);
        for (const symbol of symbols) {
          if (token.isCancellationRequested) {
            return;
          }

          progress.report({ message: `${symbol.name} in ${shortName(editor.document.uri)}` });
          const measurement = await measureAtPosition(editor.document, symbol.position);
          if (measurement) {
            cacheMeasurement(measurement);
            measured += 1;
          }
        }
      }
    }
  );

  refreshViews();
  const slow = getAllMeasurements().filter((measurement) => measurement.elapsedMs >= getSlowThresholdMs()).length;
  vscode.window.showInformationMessage(`TSPerf measured ${measured} symbols. ${slow} cached result(s) are above the slow threshold.`);
}

async function measureCommandPosition(args) {
  if (!args?.uri || typeof args.line !== "number" || typeof args.character !== "number") {
    return;
  }

  const document = await vscode.workspace.openTextDocument(args.uri);
  const measurement = await measureAtPosition(document, new vscode.Position(args.line, args.character));
  if (!measurement) {
    return;
  }

  cacheMeasurement(measurement);
  refreshViews();
  updateStatus(measurement);
}

async function measureAtPosition(document, position) {
  if (!isSupportedDocument(document)) {
    return undefined;
  }

  const wordRange = document.getWordRangeAtPosition(position);
  const symbol = wordRange ? document.getText(wordRange) : "(selection)";

  measuringHover = true;
  const started = Date.now();
  let hovers;
  try {
    hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", document.uri, position);
  } catch (error) {
    vscode.window.showWarningMessage(`TSPerf could not query the TypeScript hover provider: ${error.message}`);
    return undefined;
  } finally {
    measuringHover = false;
  }

  const elapsedMs = Date.now() - started;
  const typeText = extractTypeText(hovers);
  const metrics = calculateComplexity(typeText);

  return {
    uri: document.uri,
    documentVersion: document.version,
    languageId: document.languageId,
    line: position.line,
    character: position.character,
    symbol,
    elapsedMs,
    measuredAt: new Date().toISOString(),
    typeText,
    metrics
  };
}

function extractTypeText(hovers) {
  if (!Array.isArray(hovers) || hovers.length === 0) {
    return "";
  }

  const chunks = [];
  for (const hover of hovers) {
    for (const content of hover.contents || []) {
      if (typeof content === "string") {
        chunks.push(content);
      } else if (content && typeof content.value === "string") {
        chunks.push(content.value);
      }
    }
  }

  const joined = chunks.join("\n\n").trim();
  const codeBlocks = [...joined.matchAll(/```(?:ts|typescript|tsx|js|javascript|jsx)?\s*([\s\S]*?)```/gi)].map((match) =>
    match[1].trim()
  );

  const candidate = codeBlocks.sort((a, b) => b.length - a.length)[0] || joined;
  return candidate
    .replace(/\s+/g, " ")
    .replace(/\bimport\("[^"]+"\)\./g, "")
    .trim();
}

function calculateComplexity(typeText) {
  if (!typeText) {
    return {
      score: 0,
      label: "No hover data",
      length: 0,
      unionCount: 0,
      intersectionCount: 0,
      genericDepth: 0,
      conditionalHints: 0,
      mappedHints: 0
    };
  }

  const length = typeText.length;
  const unionCount = countMatches(typeText, /\|/g);
  const intersectionCount = countMatches(typeText, /&/g);
  const genericDepth = maxNestingDepth(typeText, "<", ">");
  const tupleObjectDepth = Math.max(maxNestingDepth(typeText, "{", "}"), maxNestingDepth(typeText, "[", "]"));
  const conditionalHints = countMatches(typeText, /\b(extends|infer|keyof|typeof)\b/g);
  const mappedHints = countMatches(typeText, /\bin\b|\bas\b|\[K\s+in\b/g);

  const score = Math.round(
    Math.min(100, length / 24 + unionCount * 4 + intersectionCount * 5 + genericDepth * 8 + tupleObjectDepth * 4 + conditionalHints * 7 + mappedHints * 5)
  );

  let label = "Simple";
  if (score >= 70) {
    label = "Pathological";
  } else if (score >= 45) {
    label = "Complex";
  } else if (score >= 20) {
    label = "Moderate";
  }

  return {
    score,
    label,
    length,
    unionCount,
    intersectionCount,
    genericDepth,
    tupleObjectDepth,
    conditionalHints,
    mappedHints
  };
}

function collectDeclarationPositions(document) {
  const positions = [];
  for (let line = 0; line < document.lineCount; line += 1) {
    const text = document.lineAt(line).text;
    DECLARATION_RE.lastIndex = 0;
    let match;
    while ((match = DECLARATION_RE.exec(text))) {
      const name = match[4];
      const character = match.index + match[0].lastIndexOf(name);
      positions.push({ name, position: new vscode.Position(line, character) });
    }
  }
  return positions;
}

class TypePerfCodeLensProvider {
  constructor() {
    this._onDidChangeCodeLenses = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  }

  provideCodeLenses(document) {
    if (!vscode.workspace.getConfiguration("tsperfTypeLens").get("showCodeLens", true)) {
      return [];
    }

    return collectDeclarationPositions(document).map((symbol) => {
      const measurement = findMeasurementOnLine(document.uri, document.version, symbol.position.line);
      const title = measurement
        ? `TSPerf: ${measurement.elapsedMs}ms, ${measurement.metrics.label} (${measurement.metrics.score}/100)`
        : "TSPerf: measure type load";

      return new vscode.CodeLens(new vscode.Range(symbol.position, symbol.position), {
        title,
        command: "tsperfTypeLens.measurePosition",
        arguments: [
          {
            uri: document.uri,
            line: symbol.position.line,
            character: symbol.position.character
          }
        ]
      });
    });
  }

  refresh() {
    this._onDidChangeCodeLenses.fire();
  }
}

class MeasurementTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  getTreeItem(item) {
    return item;
  }

  getChildren(item) {
    if (item) {
      return [];
    }

    return getAllMeasurements()
      .sort((a, b) => b.elapsedMs - a.elapsedMs)
      .map((measurement) => {
        const treeItem = new vscode.TreeItem(
          `${measurement.elapsedMs}ms ${measurement.symbol}`,
          vscode.TreeItemCollapsibleState.None
        );
        treeItem.description = `${measurement.metrics.label} ${measurement.metrics.score}/100`;
        treeItem.tooltip = renderMeasurementMarkdown(measurement);
        treeItem.command = {
          title: "Open Measurement",
          command: "vscode.open",
          arguments: [measurement.uri, { selection: new vscode.Range(measurement.line, measurement.character, measurement.line, measurement.character) }]
        };
        treeItem.iconPath = new vscode.ThemeIcon(measurement.elapsedMs >= getSlowThresholdMs() ? "warning" : "watch");
        return treeItem;
      });
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }
}

function renderMeasurementMarkdown(measurement) {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.isTrusted = false;
  markdown.appendMarkdown(`**TSPerf Type Lens**  \n`);
  markdown.appendMarkdown(`Type load: **${measurement.elapsedMs}ms**  \n`);
  markdown.appendMarkdown(`Complexity: **${measurement.metrics.label}** (${measurement.metrics.score}/100)  \n`);
  markdown.appendMarkdown(
    `Signals: length ${measurement.metrics.length}, union ${measurement.metrics.unionCount}, intersection ${measurement.metrics.intersectionCount}, generic depth ${measurement.metrics.genericDepth}  \n`
  );

  if (measurement.typeText) {
    markdown.appendCodeblock(truncate(measurement.typeText, 900), measurement.languageId.startsWith("javascript") ? "javascript" : "typescript");
  }

  return markdown;
}

function cacheMeasurement(measurement) {
  measurementCache.set(measurementKey(measurement.uri, measurement.documentVersion, measurement.line, measurement.character), measurement);
}

function findNearestMeasurement(document, position) {
  const sameDocument = getAllMeasurements().filter(
    (measurement) =>
      measurement.uri.toString() === document.uri.toString() &&
      measurement.documentVersion === document.version &&
      Math.abs(measurement.line - position.line) <= 1
  );

  sameDocument.sort((a, b) => Math.abs(a.line - position.line) - Math.abs(b.line - position.line));
  return sameDocument[0];
}

function findMeasurementOnLine(uri, version, line) {
  return getAllMeasurements().find(
    (measurement) => measurement.uri.toString() === uri.toString() && measurement.documentVersion === version && measurement.line === line
  );
}

function deleteDocumentMeasurements(uri) {
  for (const [key, measurement] of measurementCache.entries()) {
    if (measurement.uri.toString() === uri.toString()) {
      measurementCache.delete(key);
    }
  }
}

function clearMeasurements() {
  measurementCache.clear();
  refreshViews();
  updateStatus(undefined);
}

function refreshViews() {
  codeLensProvider?.refresh();
  treeProvider?.refresh();
  updateAllDecorations();
}

async function configureTypescriptPlugin() {
  if (!vscode?.extensions) {
    return;
  }

  const tsExtension = vscode.extensions.getExtension("vscode.typescript-language-features");
  if (!tsExtension) {
    return;
  }

  try {
    await tsExtension.activate();
    const api = tsExtension.exports?.getAPI?.(0);
    if (!api?.configurePlugin) {
      return;
    }

    api.configurePlugin(TS_SERVER_PLUGIN_ID, {
      enabled: vscode.workspace.getConfiguration("tsperfTypeLens").get("enableTsserverPlugin", true),
      slowTypeThresholdMs: getSlowThresholdMs(),
      logLevel: vscode.workspace.getConfiguration("tsperfTypeLens").get("tsserverLogLevel", "slowOnly")
    });
  } catch {
    // The hover-based path still works if the built-in TypeScript extension is unavailable.
  }
}

async function exportMeasurements() {
  ensureVscodeApi();

  const measurements = getAllMeasurements().sort((a, b) => b.elapsedMs - a.elapsedMs);
  if (measurements.length === 0) {
    vscode.window.showInformationMessage("No TSPerf measurements to export yet.");
    return;
  }

  const format = await vscode.window.showQuickPick(["JSON", "CSV"], {
    placeHolder: "Choose TSPerf export format"
  });
  if (!format) {
    return;
  }

  const defaultName = `tsperf-measurements-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.${format.toLowerCase()}`;
  const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri
    ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, defaultName)
    : vscode.Uri.file(defaultName);
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: {
      [format]: [format.toLowerCase()]
    },
    saveLabel: "Export TSPerf Measurements"
  });
  if (!target) {
    return;
  }

  const output = format === "JSON" ? JSON.stringify(serializeMeasurements(measurements), null, 2) : serializeMeasurementsAsCsv(measurements);
  await vscode.workspace.fs.writeFile(target, Buffer.from(output, "utf8"));
  vscode.window.showInformationMessage(`Exported ${measurements.length} TSPerf measurement(s) to ${target.fsPath || target.toString()}.`);
}

function serializeMeasurements(measurements) {
  return {
    exportedAt: new Date().toISOString(),
    slowThresholdMs: getSlowThresholdMs(),
    measurements: measurements.map((measurement) => ({
      file: measurement.uri.toString(),
      line: measurement.line + 1,
      character: measurement.character + 1,
      symbol: measurement.symbol,
      elapsedMs: measurement.elapsedMs,
      measuredAt: measurement.measuredAt,
      languageId: measurement.languageId,
      complexity: measurement.metrics,
      typeText: measurement.typeText
    }))
  };
}

function serializeMeasurementsAsCsv(measurements) {
  const rows = [
    [
      "file",
      "line",
      "character",
      "symbol",
      "elapsedMs",
      "complexityLabel",
      "complexityScore",
      "typeLength",
      "unionCount",
      "intersectionCount",
      "genericDepth",
      "measuredAt"
    ]
  ];

  for (const measurement of measurements) {
    rows.push([
      measurement.uri.toString(),
      measurement.line + 1,
      measurement.character + 1,
      measurement.symbol,
      measurement.elapsedMs,
      measurement.metrics.label,
      measurement.metrics.score,
      measurement.metrics.length,
      measurement.metrics.unionCount,
      measurement.metrics.intersectionCount,
      measurement.metrics.genericDepth,
      measurement.measuredAt
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function updateAllDecorations() {
  if (!vscode || !mediumDecorationType || !slowDecorationType) {
    return;
  }

  for (const editor of vscode.window.visibleTextEditors || []) {
    if (!vscode.workspace.getConfiguration("tsperfTypeLens").get("showHeatmap", true)) {
      editor.setDecorations(mediumDecorationType, []);
      editor.setDecorations(slowDecorationType, []);
      continue;
    }

    const measurements = getAllMeasurements().filter(
      (measurement) => measurement.uri.toString() === editor.document.uri.toString() && measurement.documentVersion === editor.document.version
    );

    const mediumRanges = [];
    const slowRanges = [];
    for (const measurement of measurements) {
      const line = Math.min(measurement.line, Math.max(0, editor.document.lineCount - 1));
      const lineRange = editor.document.lineAt(line).range;
      const range = new vscode.Range(
        line,
        Math.min(measurement.character, lineRange.end.character),
        line,
        Math.min(Math.max(measurement.character + Math.max(1, measurement.symbol.length), 1), lineRange.end.character)
      );

      const decoration = {
        range,
        hoverMessage: renderMeasurementMarkdown(measurement)
      };

      if (measurement.elapsedMs >= getSlowThresholdMs() || measurement.metrics.score >= 70) {
        slowRanges.push(decoration);
      } else if (measurement.metrics.score >= 45 || measurement.elapsedMs >= getSlowThresholdMs() / 2) {
        mediumRanges.push(decoration);
      }
    }

    editor.setDecorations(mediumDecorationType, mediumRanges);
    editor.setDecorations(slowDecorationType, slowRanges);
  }
}

function updateStatus(measurement) {
  if (!statusItem) {
    return;
  }

  if (!measurement) {
    statusItem.text = "$(watch) TSPerf";
    statusItem.tooltip = "Measure TypeScript type load latency at cursor";
    return;
  }

  const slow = measurement.elapsedMs >= getSlowThresholdMs();
  statusItem.text = `${slow ? "$(warning)" : "$(watch)"} ${measurement.elapsedMs}ms ${measurement.metrics.score}/100`;
  statusItem.tooltip = formatMeasurementSummary(measurement);
}

function formatMeasurementSummary(measurement) {
  return `${measurement.symbol}: ${measurement.elapsedMs}ms type load, ${measurement.metrics.label} complexity (${measurement.metrics.score}/100)`;
}

function measurementKey(uri, version, line, character) {
  return `${uri.toString()}::${version}::${line}::${character}`;
}

function getAllMeasurements() {
  return Array.from(measurementCache.values());
}

function isSupportedDocument(document) {
  return document && SUPPORTED_LANGUAGES.has(document.languageId) && document.uri.scheme !== "output";
}

function getConfigNumber(key, fallback) {
  if (!vscode?.workspace) {
    return fallback;
  }

  const value = vscode.workspace.getConfiguration("tsperfTypeLens").get(key, fallback);
  return Number.isFinite(value) ? value : fallback;
}

function getSlowThresholdMs() {
  return getConfigNumber("slowTypeThresholdMs", 250);
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function maxNestingDepth(text, open, close) {
  let depth = 0;
  let max = 0;
  for (const char of text) {
    if (char === open) {
      depth += 1;
      max = Math.max(max, depth);
    } else if (char === close) {
      depth = Math.max(0, depth - 1);
    }
  }
  return max;
}

function shortName(uri) {
  const parts = uri.path.split("/");
  return parts[parts.length - 1] || uri.toString();
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function ensureVscodeApi() {
  if (!vscode) {
    throw new Error("The VS Code API is only available inside the VS Code extension host.");
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  calculateComplexity,
  extractTypeText,
  serializeMeasurements,
  serializeMeasurementsAsCsv
};
