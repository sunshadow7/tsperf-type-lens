"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ignoredPrefixes = [
  ".git/",
  ".vscode/",
  ".npm-cache/",
  ".npm-install-cache/",
  ".npm-exec-cache/",
  "dist/",
  "test/",
  "test-fixtures/"
];
const ignoredExtensions = [".vsix", ".log"];

const files = [];
walk(root);

const requiredFiles = [
  "package.json",
  "extension.js",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "tsserver-plugin/package.json",
  "tsserver-plugin/index.js"
];

for (const file of requiredFiles) {
  assert.ok(files.includes(file), `expected package surface to include ${file}`);
}

for (const file of files) {
  assert.ok(!file.startsWith("test/"), `test file should not ship: ${file}`);
  assert.ok(!file.startsWith(".vscode/"), `VS Code launch config should not ship: ${file}`);
  assert.ok(!file.startsWith(".npm-cache/"), `npm cache should not ship: ${file}`);
}

console.log(`package-surface-test ok (${files.length} files)`);

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = toPackagePath(path.relative(root, absolutePath));

    if (shouldIgnore(relativePath, entry)) {
      continue;
    }

    if (entry.isDirectory()) {
      walk(absolutePath);
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
}

function shouldIgnore(relativePath, entry) {
  const normalized = entry.isDirectory() ? `${relativePath}/` : relativePath;
  if (ignoredPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  return ignoredExtensions.includes(path.extname(relativePath));
}

function toPackagePath(value) {
  return value.replace(/\\/g, "/");
}
