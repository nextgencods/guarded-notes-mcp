# Governance

Guarded Notes MCP is currently a maintainer-led open-source project.

## Roles

### Maintainer

[nextgencods](https://github.com/nextgencods) is the current maintainer and has
final responsibility for:

- project scope and roadmap;
- security and privacy boundaries;
- contributor and moderation decisions;
- merging changes;
- versioning and publishing releases; and
- repository and plugin metadata.

### Contributors

Contributors propose issues, documentation, tests, code, and review feedback.
Repeated, constructive participation may lead to additional repository access,
but no access level or timeline is promised.

## Decision process

Routine changes are decided through issue and pull-request discussion. The
maintainer considers evidence, user impact, compatibility, test coverage,
security, privacy, and long-term maintenance cost.

Changes to any of the following require an explicit design discussion and are
normally major-version decisions:

- deletion or note-content mutation;
- network communication or telemetry;
- direct Notes database access;
- move authorization or rollback guarantees;
- persistent-data format or location;
- plugin identity or public tool names; and
- support for additional operating systems or note applications.

For security-sensitive changes, the maintainer may withhold exploit details until
a coordinated fix is ready.

## Releases

Only the maintainer may publish an official release under
`nextgencods/guarded-notes-mcp`. Releases follow the process in
[docs/RELEASING.md](docs/RELEASING.md). Git tags and GitHub releases are the
authoritative public versions.

Forks and modified distributions must not imply endorsement or official release
status.

## Conduct and moderation

Participation is subject to the [Code of Conduct](CODE_OF_CONDUCT.md). The
maintainer may edit, hide, lock, or remove content and restrict participation to
protect contributors or the project.

## Security authority

The maintainer may delay a release, revert a change, disable an affected feature,
or publish an urgent patch when a credible security or privacy risk exists. See
[SECURITY.md](SECURITY.md) for confidential reporting.

## Continuity

If the maintainer can no longer operate the project, they may nominate a successor
and document the transition publicly. Until such a transfer occurs, repository
ownership and release authority remain with nextgencods. The MIT License continues
to govern existing published versions regardless of project activity.
