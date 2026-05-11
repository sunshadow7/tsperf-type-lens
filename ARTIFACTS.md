# Submission Artifacts

Generated: 2026-05-10

## Files

- `dist/tsperf-type-lens-0.1.0.vsix`
  - VS Code extension package generated with `vsce package`.
  - Patched to include `extension/node_modules/tsperf-type-lens-tsserver-plugin/index.js` and `package.json` for the optional TypeScript server plugin.
- `dist/tsperf-type-lens-source-0.1.0-final.zip`
  - Clean source archive for GitHub upload or Algora attachment.
  - Includes source, tests, fixture, launch config, changelog, submission notes, and local tsserver plugin source.
  - Excludes `node_modules`, npm caches, and generated `dist` working directories.

## Verification

Local command:

```powershell
npm run check
```

Passing coverage:

- Extension syntax check.
- TypeScript server plugin syntax check.
- Complexity scoring and hover extraction self-test.
- JSON/CSV export serialization self-test.
- TypeScript server plugin wrapping/logging self-test.
- Package surface test.

VSIX archive contents verified to include:

- `extension/package.json`
- `extension/extension.js`
- `extension/tsserver-plugin/index.js`
- `extension/node_modules/tsperf-type-lens-tsserver-plugin/index.js`
- `extension/readme.md`
- `extension/changelog.md`
- `extension/LICENSE.txt`

## Auth-Gated Actions

These require the owner's logged-in accounts and cannot be completed locally without credentials:

1. Publish source to GitHub under an MIT license.
2. Publish or upload the VSIX to the Visual Studio Marketplace using a Microsoft publisher token.
3. Submit the GitHub URL and Marketplace/VSIX URL through Algora.
