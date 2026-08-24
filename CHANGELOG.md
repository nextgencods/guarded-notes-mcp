# Changelog

All notable changes to Guarded Notes MCP are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-08-24

### Added

- MCP 2026-07-28 stateless discovery and per-request protocol metadata while retaining legacy initialize compatibility.
- Initial public release of the local stdio MCP server and Codex plugin.
- Twenty tools for safety inspection, account and folder discovery, bounded
  inventory, note reading, search, incremental organization, snapshots, move
  planning, operation history, and rollback planning.
- Persistent owner-only organization cache, capped content store, jobs,
  manifests, snapshots, and operation records.
- Background organization and sequential review workflows for large libraries,
  with bounded adaptive content groups committed incrementally.
- Exact preview and operation results for top-level folder creation and
  same-account note moves.
- Bounded manifest delivery: status omits note records by default, paged
  `mode=next` is the manifest-reader default, and complete responses are limited
  to 200 notes and approximately 1 MB.
- Content-inclusive snapshot limits of 100 readable notes and 50,000 characters
  per HTML/plaintext field, plus title-and-content search limits of 500 notes,
  10,000,000 characters total, and 50,000 characters per note.
- Dependency-free self-test with fixture-based protocol and automation checks.
- GitHub marketplace packaging, public documentation, privacy policy, security
  policy, and community contribution files.

### Security

- Omitted note deletion, folder deletion, and note-content editing capabilities.
- Required a recent snapshot, unexpired in-memory plan, exact confirmation
  phrase with a digest suffix, and separate one-use Terminal authorization bound
  to the plan token and full 64-character digest for every move or rollback
  batch.
- Added an owner-only cross-process mutation lock and persisted mutation epoch so
  concurrent apply batches are excluded and background artifacts fail rather
  than publishing across a mutation.
- Added a pre-mutation atomic operation journal, a 225-second apply deadline, and
  explicit succeeded, failed, uncertain, and not-attempted item states with
  completed, partial, and interrupted batch states.
- Blocked locked/shared notes, shared destinations, nested source folders,
  cross-account moves, ambiguous destinations, and protected system folders.
- Passed dynamic automation values through argument arrays with no shell.
- Used no third-party runtime dependencies, direct Notes database access,
  network client, telemetry, or update service.
- Added owner-only local file modes and user-facing runtime-path redaction.

[Unreleased]: https://github.com/nextgencods/guarded-notes-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nextgencods/guarded-notes-mcp/releases/tag/v1.0.0
