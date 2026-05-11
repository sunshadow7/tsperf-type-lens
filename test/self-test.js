"use strict";

const assert = require("node:assert/strict");

const {
  calculateComplexity,
  extractTypeText,
  serializeMeasurements,
  serializeMeasurementsAsCsv
} = require("../extension");

const hoverText = extractTypeText([
  {
    contents: [
      {
        value: [
          "```ts",
          "type AgentTemplate<TPath extends string> = DeepReadonly<{",
          "  id: string;",
          "  route: TPath;",
          "  policies: { kind: \"allow\"; scopes: string[] } | { kind: \"review\"; approvers: string[] };",
          "}>",
          "```"
        ].join("\n")
      }
    ]
  }
]);

assert.match(hoverText, /AgentTemplate/);
assert.doesNotMatch(hoverText, /```/);

const simple = calculateComplexity("type Id = string");
const complex = calculateComplexity(hoverText);

assert.equal(simple.label, "Simple");
assert.ok(complex.score > simple.score, "complex type should score higher than a scalar alias");
assert.ok(complex.unionCount >= 1, "union signals should be counted");
assert.ok(complex.genericDepth >= 1, "generic nesting should be counted");

const fakeMeasurement = {
  uri: {
    toString() {
      return "file:///workspace/example.ts";
    }
  },
  line: 9,
  character: 14,
  symbol: "AgentTemplate",
  elapsedMs: 312,
  measuredAt: "2026-05-10T21:00:00.000Z",
  languageId: "typescript",
  metrics: complex,
  typeText: hoverText
};

const json = serializeMeasurements([fakeMeasurement]);
assert.equal(json.measurements.length, 1);
assert.equal(json.measurements[0].line, 10);
assert.equal(json.measurements[0].complexity.score, complex.score);

const csv = serializeMeasurementsAsCsv([fakeMeasurement]);
assert.match(csv, /AgentTemplate/);
assert.match(csv, /elapsedMs/);
assert.match(csv, /312/);

console.log("self-test ok");
