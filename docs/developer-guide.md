# Developer guide

[Back to Locality](../README.md) · [Build editions](build-editions.md) · [Contributor conventions](../AGENTS.md)

This guide covers working on Locality from source. To install a released
extension, follow the [installation instructions](../README.md#install).

## Set up and build

Use Node.js **20.19.0 or newer** (22.x recommended). From the repository root:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run build` builds the Commands edition into `dist/`. Use `npm run watch`
to rebuild it as you edit. Edit source files under `src/` and styles under
`media/`; generated files in `dist/` should not be edited by hand.

## Package and install

Build and audit all four editions with:

```bash
npm run package:vsix
```

Versioned packages are written to `artifacts/`. See the [build guide](build-editions.md#build-and-package)
for individual editions and local installation, and [release downloads](build-editions.md#release-downloads)
for the stable filenames used on GitHub.

## Contributor checks

Follow the repository's [contributor conventions](../AGENTS.md) for UI styling,
state management, network access, and edition boundaries.

- Run `npm run typecheck`, `npm run lint`, and `npm run build` after implementation changes.
- Run the relevant targeted Vitest file for changed behavior; use `npm test` when a change crosses multiple subsystems.
- Run `npm run package:vsix` after changing optional tools or build wiring to check all four editions and their bundle/archive isolation.
- Run `git diff --check` before handing off changes.
