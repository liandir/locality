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

To build a different edition, use one of `no-commands`, `safe-list`, `commands`,
or `advanced`:

```bash
node esbuild.config.mjs --profile=safe-list
```

## Package and install

Build and audit all four editions with:

```bash
npm run package:vsix
```

Packaging audits the bundles, staged contents, and actual VSIX archives before
placing the packages in `artifacts/`. Local filenames include the version from
`package.json`, such as `locality-2.0.1-safe-list.vsix`.

To package one edition during development:

```bash
npm run package:vsix -- --profile=safe-list
```

Install the resulting package with the VS Code CLI:

```bash
code --install-extension artifacts/locality-2.0.1-safe-list.vsix
```

Alternatively, use **Extensions: Install from VSIX…** in VS Code's Command
Palette. Add `--force` to the CLI command when replacing a local build of the
same version. Node.js is needed for development, not for installing a released
VSIX.

## Release workflow

The [release workflow](../.github/workflows/release.yml) runs whenever `main` is
updated, including when a pull request is merged. It takes the version from
`package.json` and creates a matching tag on the exact commit it builds, such as
`v2.0.1`. It does not increment the version automatically.

Before merging a release PR into `main`, bump the version and commit both
`package.json` and `package-lock.json`. For example:

```bash
npm version 2.0.1 --no-git-tag-version
```

Use a new stable `major.minor.patch` version for each release. The workflow
rejects mismatched package/lockfile versions and an existing tag that points to
a different commit. You do not need to push a tag or create a release manually.

After tests, checks, packaging, and isolation audits, the workflow copies the
four versioned files from `artifacts/` into `.build/release-assets/` with stable
names:

- `locality-no-commands.vsix`
- `locality-safe-list.vsix`
- `locality-commands.vsix`
- `locality-advanced.vsix`

Only these copies are uploaded to the GitHub release. Local build filenames and
the version inside each VSIX stay unchanged. All four copies must be prepared
successfully before the upload step runs. The workflow uploads them to a draft,
then publishes it with generated release notes and marks it **Latest**.

If a run fails, rerun it from the Actions tab. A retry can finish uploading a
draft for the same commit; a completed release is left unchanged. You can also
run **Release VSIX** manually with **Run workflow**, selecting `main`. Manual
runs from other branches are skipped.

The README's [download links](../README.md#four-levels-of-locality) use
`https://github.com/liandir/locality/releases/latest/download/<filename>`.
They follow the release marked **Latest** on GitHub and need no version-specific
updates. The release must contain the stable filenames for those links to work.

## Edition architecture and isolation

`scripts/build-profiles.mjs` resolves `src/build/` facade imports to the selected
feature modules before esbuild loads their dependencies. Shared code never
imports a runtime registry of all editions. `src/features/commands/shared/`
contains process lifecycle and command UI, `full/` contains general execution,
and `safeList/` contains policy and constrained execution. `features/advanced/`
composes general commands with `features/webSearch/`. The `features/none/`
modules contribute no optional tools or executors.

The resolver rejects forbidden imports, including unused transitive imports.
Packaging audits input graphs, staged manifests, emitted bundles, and the actual
VSIX archives:

- No commands excludes subprocess imports, command schemas, job management,
  settings, controls, and command styles.
- Safe list excludes the general shell runner. Its code and settings exist only
  in Safe list.
- Web search, webpage reading, and their additional network policy exist only
  in Advanced.
- Source files, maps, development dependencies, and other editions' outputs are
  excluded from VSIXs.

All editions share `src/scm/commitMessage.ts` and the fixed VS Code Git adapter in
`src/scm/gitApi.ts`. Commit-message generation requires VS Code's built-in Git
extension; there is no direct subprocess fallback.

## Contributor checks

Follow the repository's [contributor conventions](../AGENTS.md) for UI styling,
state management, network access, and edition boundaries.

- Run `npm run typecheck`, `npm run lint`, and `npm run build` after implementation changes.
- Run the relevant targeted Vitest file for changed behavior; use `npm test` when a change crosses multiple subsystems.
- Run `npm run package:vsix` after changing optional tools or build wiring to check all four editions and their bundle/archive isolation.
- Run `git diff --check` before handing off changes.

Edition and tool coverage includes:

- Build probes for every edition, chat mode, transport, and compatibility family,
  plus deliberate forbidden imports to verify build rejection.
- Safe-list policy checks for quoting, full-command matches, path escapes,
  symlinks, deletion, Git helpers, and approval changes.
- Web-search and webpage checks for endpoint policy, credentials, redirects,
  bounded responses, and changed destinations.
- Shared Git checks for staged diffs, repository selection, and unavailable
  integration.
