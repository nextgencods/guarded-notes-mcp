# Provenance and authorship

## Project origin

Guarded Notes MCP is an independently authored project created and maintained
under the direction of [nextgencods](https://github.com/nextgencods). The public
release was prepared from a clean source tree specifically for this repository;
personal Apple Notes data and the surrounding development conversation are not
part of the project or its Git history.

AI-assisted engineering tools were used during design, implementation, review,
testing, documentation, and release preparation. The maintainer selected the
requirements, directed the work, reviewed the output, chose the licence, and
controls publication. See [AUTHORS.md](../AUTHORS.md).

## Third-party code

Version 1.0.0 contains no vendored third-party source and declares no npm
runtime or development dependencies. Runtime modules import only Node.js
built-ins and invoke the macOS system executable `/usr/bin/osascript`.

The repository uses GitHub-hosted Actions in CI. Their pinned revisions are
automation dependencies, not incorporated into the distributed plugin. The
workflows and Dependabot configuration make those revisions visible and
reviewable.

The project implements public protocols and system automation interfaces. The
existence of other Apple Notes MCP servers does not imply shared source. See the
[related-project comparison](COMPARISON.md) for functional overlap and links.

## Copyright and licence

Copyright © 2026 nextgencods. The repository is offered under the
[MIT License](../LICENSE), which permits use, copying, modification,
distribution, sublicensing, and sale subject to preservation of the copyright
and licence notice.

The licence makes the source reusable; it does not transfer the maintainer's
copyright or grant rights to third-party trademarks. The commit history,
release tags, checksums, `CITATION.cff`, `AUTHORS.md`, and copyright notice form
a public record of this release. They are useful provenance evidence, not a
substitute for legal registration or jurisdiction-specific legal advice.

## Release integrity

Every tagged release must match the versions in the repository package, plugin
manifest, and MCP server. CI validates the public tree, then the release
workflow creates source archives and a `SHA256SUMS.txt` file. Published GitHub
releases are configured as immutable.

To verify a downloaded archive, compare its SHA-256 digest with the checksum in
the same GitHub release. See [Releasing](RELEASING.md) for the maintainer
procedure.

## Trademark boundary

Guarded Notes MCP uses product names only to describe compatibility. It is not
affiliated with, endorsed by, or sponsored by Apple Inc. or OpenAI. See
[NOTICE](../NOTICE) for the complete attribution.
