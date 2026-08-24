# Contributing

Thank you for helping improve Guarded Notes MCP. Privacy and reversible behavior
are product requirements, so contributions are evaluated for safety as well as
functionality.

By submitting a contribution, you agree that it may be distributed under the
repository's [MIT License](LICENSE).

## Before opening an issue

1. Read [Support](SUPPORT.md) and [Troubleshooting](docs/TROUBLESHOOTING.md).
2. Search existing issues for the same behavior.
3. Reproduce the problem with synthetic notes where possible.
4. Remove note titles, text, identifiers, account and folder names, operation
   records, authorization values, usernames, and absolute paths.

Report vulnerabilities privately under [SECURITY.md](SECURITY.md), never through
a public issue.

## Development requirements

- Node.js 22 or newer.
- macOS for compiling the embedded AppleScript/JXA programs and for deliberate
  live testing.
- No npm install is required for the current runtime or self-test.

From the repository root, syntax-check the implementation and run its self-test:

```sh
node --check plugins/guarded-notes-mcp/server.mjs
node --check plugins/guarded-notes-mcp/scripts/arm-moves.mjs
node --check plugins/guarded-notes-mcp/scripts/disarm-moves.mjs
node --check plugins/guarded-notes-mcp/tests/self-test.mjs
node plugins/guarded-notes-mcp/tests/self-test.mjs
```

On macOS, the self-test compiles nine embedded automation programs. On other
platforms, that compilation step is skipped; a macOS run is still required before
release. The test uses fixtures and protocol requests and does not exercise a
real Notes library.

The root package also declares repository check, validation, test, and CI scripts.
Run the full declared suite when all referenced repository tooling is present:

```sh
npm run ci
```

## Safety invariants

Changes must preserve these invariants unless the maintainer approves an explicit
major-version redesign:

- No note deletion, folder deletion, or note-content editing capability.
- No cross-account moves.
- No moves of locked or shared notes, from shared/nested source folders, or into
  shared folders.
- No direct Notes database access or Full Disk Access requirement.
- No user-controlled text interpolated into AppleScript/JXA source.
- No move without a recent snapshot, exact unexpired plan, exact phrase, and
  externally created one-use authorization.
- Authorization consumed before the first mutation.
- Source-folder revalidation immediately before every move.
- Per-attempt operation records and separately authorized rollback planning.
- Note-derived text treated as untrusted data.
- No new network behavior, telemetry, package download, or automatic updater.
- Private runtime files remain excluded from Git.

A proposal that intentionally changes one of these boundaries should begin as a
design issue describing the user benefit, threat analysis, migration, test plan,
and safer alternatives.

## Pull-request workflow

1. Fork the repository and create a focused branch.
2. Keep unrelated refactors out of the change.
3. Add or update tests for behavior changes.
4. Update tool documentation, privacy disclosures, security model, and changelog
   when applicable.
5. Run the checks above and report exactly what was and was not tested.
6. Open a pull request using the repository template.

Do not include real Notes data in code, fixtures, screenshots, commit messages,
issues, or pull requests. Use obviously synthetic values such as `Example Note`,
`Test Account`, and `note-123`.

## Code and documentation style

- Keep the server dependency-free unless a reviewed design demonstrates a strong
  need and evaluates supply-chain impact.
- Prefer Node.js built-ins, explicit bounds, exact validation, and fail-closed
  behavior.
- Keep automation execution pinned to known executables with `shell: false`.
- Return actionable public errors without exposing absolute paths or private
  content.
- Use clear Markdown headings, relative repository links, and copy-paste-safe
  commands.
- Document current behavior, not planned behavior.

## Review criteria

The maintainer considers correctness, privacy, security boundaries, accessibility
of documentation, macOS compatibility, test quality, maintenance cost, and
backward compatibility. Submission does not guarantee acceptance. The maintainer
may ask for a smaller change or close work that conflicts with the project's
narrow safety scope.

Community participation is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).
