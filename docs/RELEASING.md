# Releasing

This document is for maintainers of Guarded Notes MCP. The current maintainer and
release authority are defined in [Governance](../GOVERNANCE.md).

## Version policy

The project uses semantic versioning:

- **Major**: incompatible tool schema, plugin identity, storage migration, or
  safety-contract change.
- **Minor**: backward-compatible capability or tool addition.
- **Patch**: backward-compatible fix or documentation correction.

The release tag uses `vMAJOR.MINOR.PATCH`; metadata files and server code use the
numeric version without `v`. The following must agree:

- root `package.json`;
- `plugins/guarded-notes-mcp/.codex-plugin/plugin.json`;
- the server's `SERVER_VERSION`; and
- `CITATION.cff`.

The stable plugin name is `guarded-notes-mcp`. Do not rename it in a minor or
patch release.

## Pre-release checklist

### Scope and history

- Confirm every included change is intended for the release.
- Update `CHANGELOG.md` with user-visible behavior, security changes, and
  migration notes.
- Verify copyright, author, repository, licence, and privacy-policy metadata.
- Review all commits and contributors included since the previous tag.
- Confirm no generated runtime data, archives, editor files, or local environment
  files are tracked.

### Security and privacy

- Inspect changes to tool schemas, automation source, process spawning, storage,
  permissions, redaction, and the move gate.
- Confirm no delete-note, delete-folder, or note-content mutation tool was added
  unintentionally.
- Confirm no HTTP, socket, telemetry, update, or package-download path was added.
- Search the complete Git history for credentials, tokens, personal paths, real
  note data, account names, operation records, and identifying screenshots.
- Ensure examples and images use synthetic data.
- Review `PRIVACY.md`, `SECURITY.md`, and `docs/SECURITY-MODEL.md` against the
  implementation.

### Verification

Run the repository's declared checks and inspect every failure:

```sh
npm run check
npm run validate
npm test
```

The self-test must be run on macOS before release so the embedded AppleScript and
JXA programs are compiled. Where supported by repository automation, run the
declared Node 22 and Node 24 jobs.

Perform a deliberate live smoke test with disposable synthetic notes on a test
account or library. Verify read-only startup, plan rejection cases, one-use arm
consumption, one small forward move, operation logging, and a separately
authorized rollback. Do not use valuable personal notes for a release test.

The fixture self-test is not evidence that macOS permissions or a complete live
move work on every machine.

### Documentation and installation

- Test the tagged marketplace installation in a clean local profile.
- Confirm `node` is visible to the desktop application and is version 22 or newer.
- Validate every documentation link and command.
- Confirm the GitHub About text, topics, social image, release badge, and supported
  version information are current.
- Verify the plugin appears as **Guarded Notes MCP** and exposes the documented 20
  tools.

## Tag and release

1. Merge the reviewed release commit into `main` with required checks green.
2. Create a signed, annotated version tag when signing is configured. Otherwise,
   create an annotated tag; do not use a lightweight tag:

   ```sh
   # With signing configured:
   git tag -s v1.0.0 -m "Guarded Notes MCP v1.0.0"

   # Or, without signing configured:
   git tag -a v1.0.0 -m "Guarded Notes MCP v1.0.0"

   git push origin v1.0.0
   ```

3. Pushing the tag triggers `.github/workflows/release.yml`. The workflow reruns
   CI and rejects a tag that does not exactly match repository version metadata.
4. The workflow builds source ZIP and tar archives directly from the tagged Git
   tree, verifies that each contains the plugin manifest, and generates
   `SHA256SUMS.txt`.
5. After all checks pass, the workflow publishes the GitHub release, marks stable
   versions latest (or prerelease versions as prereleases), and attaches only
   those generated artifacts and checksums.
6. Review the completed workflow and release immediately. Release immutability is
   enabled, so treat the tag push as the final publication action; assets cannot
   be replaced afterward.

## Post-release verification

- Download each asset and verify its checksum.
- Install from the exact release tag on a clean profile.
- Run the safety and reachability tools and verify the reported version.
- Confirm the licence is detected and the release is marked current on GitHub.
- Confirm the marketplace install instructions still resolve the tagged source.
- Monitor issues and private vulnerability reports for regressions without asking
  reporters to disclose note data.

## Failed release

Do not move or reuse a published version tag. Fix the problem on a new commit and
publish a new semantic version. If a release contains a vulnerability, use a
private repository security advisory to coordinate the fix, then publish the
advisory and replacement version together when appropriate.

If an immutable release must be withdrawn, clearly document why and direct users
to the corrected version; do not silently replace assets.
