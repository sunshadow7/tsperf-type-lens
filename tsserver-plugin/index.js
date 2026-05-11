"use strict";

const DEFAULT_CONFIG = {
  enabled: true,
  slowTypeThresholdMs: 250,
  logLevel: "slowOnly"
};

let currentConfig = { ...DEFAULT_CONFIG };

function init() {
  return {
    create(info) {
      const proxy = Object.create(null);
      for (const key of Object.keys(info.languageService)) {
        const value = info.languageService[key];
        proxy[key] = typeof value === "function" ? value.bind(info.languageService) : value;
      }

      wrapLanguageServiceMethod(info, proxy, "getQuickInfoAtPosition", summarizeQuickInfo);
      wrapLanguageServiceMethod(info, proxy, "getCompletionsAtPosition", summarizeCompletionInfo);
      wrapLanguageServiceMethod(info, proxy, "getDefinitionAtPosition", summarizeArrayResult);
      wrapLanguageServiceMethod(info, proxy, "getSemanticDiagnostics", summarizeArrayResult);

      log(info, "plugin loaded");
      return proxy;
    },
    onConfigurationChanged(config) {
      currentConfig = {
        ...DEFAULT_CONFIG,
        ...(config || {})
      };
    }
  };
}

function wrapLanguageServiceMethod(info, proxy, methodName, summarizeResult) {
  const original = info.languageService[methodName];
  if (typeof original !== "function") {
    return;
  }

  proxy[methodName] = function wrappedLanguageServiceMethod(...args) {
    if (!currentConfig.enabled) {
      return original.apply(info.languageService, args);
    }

    const started = nowMs();
    try {
      const result = original.apply(info.languageService, args);
      recordTiming(info, methodName, args, started, summarizeResult(result));
      return result;
    } catch (error) {
      recordTiming(info, methodName, args, started, `threw ${error?.name || "Error"}`);
      throw error;
    }
  };
}

function recordTiming(info, methodName, args, started, summary) {
  const elapsedMs = Math.max(0, Math.round(nowMs() - started));
  if (currentConfig.logLevel === "off") {
    return;
  }

  const slow = elapsedMs >= Number(currentConfig.slowTypeThresholdMs ?? DEFAULT_CONFIG.slowTypeThresholdMs);
  if (!slow && currentConfig.logLevel !== "verbose") {
    return;
  }

  const fileName = typeof args[0] === "string" ? args[0] : "unknown";
  const position = typeof args[1] === "number" ? args[1] : undefined;
  const location = position === undefined ? fileName : `${fileName}:${position}`;
  log(info, `${methodName} ${elapsedMs}ms ${slow ? "slow" : "ok"} ${location} ${summary}`.trim());
}

function summarizeQuickInfo(result) {
  if (!result) {
    return "no quick info";
  }

  const text = displayPartsToText(result.displayParts);
  const metrics = calculateComplexity(text);
  return `complexity=${metrics.score}/100 label=${metrics.label} length=${metrics.length}`;
}

function summarizeCompletionInfo(result) {
  if (!result?.entries) {
    return "no completions";
  }

  return `entries=${result.entries.length}`;
}

function summarizeArrayResult(result) {
  if (!Array.isArray(result)) {
    return "no array result";
  }

  return `items=${result.length}`;
}

function displayPartsToText(parts) {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts.map((part) => part.text || "").join("").replace(/\s+/g, " ").trim();
}

function calculateComplexity(typeText) {
  if (!typeText) {
    return {
      score: 0,
      label: "No hover data",
      length: 0
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
    length
  };
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

function log(info, message) {
  try {
    info.project.projectService.logger.info(`[TSPerf Type Lens] ${message}`);
  } catch {
    // tsserver logging must never affect language service behavior.
  }
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

module.exports = init;
