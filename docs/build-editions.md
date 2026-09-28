# Build editions

[Back to Locality](../README.md) · [Developer guide](developer-guide.md) · [User guide](user-guide.md) · [Tools reference](tools.md)

Locality ships four editions with the same chat interface and local/LAN model
connection. Each package includes only its selected optional capabilities.

| Edition | Command executor | Built-in web tools |
| --- | --- | --- |
| `no-commands` | Absent | Absent |
| `safe-list` | Regex policy and literal argument execution | Absent |
| `commands` | General shell/native execution | Absent |
| `advanced` | Same general executor | Brave Search, SearXNG, and public webpage reading |

The packages share the extension ID `local.locality`. Installing another edition
replaces the installed edition while retaining chats and common preferences.
For approval behavior and configuration, see the [tools reference](tools.md).

## Build and package

Follow the [developer setup](developer-guide.md#set-up-and-build) to install
dependencies and run checks before packaging.

`npm run build` builds Commands into `dist/`. To build a different edition, use
one of `no-commands`, `safe-list`, `commands`, or `advanced`:

```bash
node esbuild.config.mjs --profile=safe-list
```

To build and package all four editions:

```bash
npm run package:vsix
```

Packaging audits the bundles, staged contents, and actual VSIX archives before
placing the packages in `artifacts/`. Local filenames include the version from
`package.json`, such as `locality-2.0.0-safe-list.vsix`.

To package one edition during development:

```bash
npm run package:vsix -- --profile=safe-list
```

Install the resulting package with the VS Code CLI:

```bash
code --install-extension artifacts/locality-2.0.0-safe-list.vsix
```

Alternatively, use **Extensions: Install from VSIX…** in VS Code's Command
Palette. Add `--force` to the CLI command when replacing a local build of the
same version. Node.js is needed for development, not for installing a released
VSIX.

## Release downloads

The [release workflow](../.github/workflows/release.yml) runs when a `v*` tag is
pushed. After tests, checks, packaging, and isolation audits, it copies the four
versioned files from `artifacts/` into `.build/release-assets/` with stable names:

- `locality-no-commands.vsix`
- `locality-safe-list.vsix`
- `locality-commands.vsix`
- `locality-advanced.vsix`

Only these copies are uploaded to the GitHub release. Local build filenames and
the version inside each VSIX stay unchanged. All four copies must be prepared
successfully before the upload step runs.

The README's [download links](../README.md#four-levels-of-locality) use
`https://github.com/liandir/locality/releases/latest/download/<filename>`.
They follow the release marked **Latest** on GitHub and need no version-specific
updates. The release must contain the stable filenames for those links to work.

## Ownership and isolation

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

## Verification

Follow the [contributor guide](../AGENTS.md) when changing the implementation.
Edition and tool coverage includes:

- Build probes for every edition, chat mode, transport, and compatibility family,
  plus deliberate forbidden imports to verify build rejection.
- Safe-list policy checks for quoting, full-command matches, path escapes,
  symlinks, deletion, Git helpers, and approval changes.
- Web-search and webpage checks for endpoint policy, credentials, redirects,
  bounded responses, and changed destinations.
- Shared Git checks for staged diffs, repository selection, and unavailable
  integration.

Run `npm run package:vsix` after changing optional tools or build wiring. This
runs the bundle and archive isolation audits for all four editions. Finish with
`git diff --check`.

Safe list is a command policy, not OS sandboxing. Custom programs can access the
network or run further code, and filesystem checks do not isolate execution from
other local processes. See the [safe-list limits](tools.md#safe-list-configuration)
for supported commands, platforms, and repository layouts.
