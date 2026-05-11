"use strict";

const assert = require("node:assert/strict");
const init = require("../tsserver-plugin");

const logs = [];
const plugin = init({});
plugin.onConfigurationChanged({
  enabled: true,
  slowTypeThresholdMs: 0,
  logLevel: "slowOnly"
});

const proxy = plugin.create({
  languageService: {
    getQuickInfoAtPosition() {
      return {
        displayParts: [
          { text: "type " },
          { text: "AgentTemplate" },
          { text: "<TPath extends string> = DeepReadonly<{ id: string; route: TPath }>" },
          { text: " | { kind: \"review\"; approvers: string[] }" }
        ]
      };
    },
    getCompletionsAtPosition() {
      return {
        entries: [{ name: "template" }, { name: "tools" }]
      };
    },
    getDefinitionAtPosition() {
      return [{ fileName: "fixture.ts", textSpan: { start: 0, length: 8 } }];
    },
    getSemanticDiagnostics() {
      return [];
    }
  },
  project: {
    projectService: {
      logger: {
        info(message) {
          logs.push(message);
        }
      }
    }
  }
});

assert.equal(typeof proxy.getQuickInfoAtPosition, "function");
const quickInfo = proxy.getQuickInfoAtPosition("fixture.ts", 42);
assert.equal(quickInfo.displayParts.length, 4);
assert.equal(proxy.getCompletionsAtPosition("fixture.ts", 42).entries.length, 2);
assert.equal(proxy.getDefinitionAtPosition("fixture.ts", 42).length, 1);
assert.equal(proxy.getSemanticDiagnostics("fixture.ts").length, 0);

assert.ok(logs.some((message) => message.includes("plugin loaded")));
assert.ok(logs.some((message) => message.includes("getQuickInfoAtPosition")));
assert.ok(logs.some((message) => message.includes("complexity=")));
assert.ok(logs.some((message) => message.includes("getCompletionsAtPosition")));

plugin.onConfigurationChanged({
  enabled: false,
  slowTypeThresholdMs: 0,
  logLevel: "verbose"
});
const beforeDisabledCall = logs.length;
proxy.getQuickInfoAtPosition("fixture.ts", 42);
assert.equal(logs.length, beforeDisabledCall);

console.log("tsserver-plugin-test ok");
