# Security Policy

## Supported versions

Security fixes are provided for the current major release.

| Version | Supported |
|---|:---:|
| 1.x | Yes |
| Earlier or modified distributions | No |

Users should upgrade to the newest published patch in the supported major line.
Fork maintainers are responsible for their modifications and releases.

## Report a vulnerability privately

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability-reporting flow:

<https://github.com/nextgencods/guarded-notes-mcp/security/advisories/new>

If that flow is unavailable, contact the maintainer through the method currently
listed on the [nextgencods GitHub profile](https://github.com/nextgencods) and ask
for a private reporting channel without disclosing vulnerability details.

Include only the minimum information needed to reproduce the problem:

- affected version and commit, when known;
- macOS and Node major versions;
- affected tool or component;
- impact and required preconditions;
- sanitized reproduction steps using synthetic Notes data; and
- a proposed mitigation, if available.

Never attach real note content, titles, identifiers, account/folder names,
snapshots, manifests, operation logs, authorization files, credentials, usernames,
or absolute home paths. Replace private values consistently with placeholders.

## What happens next

The maintainer will triage the report, may request a sanitized reproduction,
assess affected versions, and coordinate remediation and disclosure through the
private advisory. No fixed response or remediation time is promised.

Please allow a reasonable opportunity to investigate and release a fix before
public disclosure. The maintainer will credit reporters who request credit and
whose contribution can be acknowledged safely.

## Security scope

Reports are especially useful when they involve:

- bypass of the snapshot, plan, phrase, or one-use authorization checks;
- authorization reuse or a write occurring before authorization consumption;
- deletion or note-content modification through an exposed or unintended path;
- cross-account, shared, locked, nested-source, or stale-source move bypass;
- AppleScript/JXA or shell injection;
- absolute-path, credential, or note-content leakage beyond requested tool output;
- insecure permissions or path traversal in local runtime files;
- an undisclosed network, telemetry, package-download, or update path;
- prompt-injection handling that converts note text into unintended tool actions;
  or
- release-package or repository supply-chain compromise.

General support requests, expected macOS Automation prompts, a connected client's
documented remote model processing, and risks requiring prior compromise of the
same macOS account may fall outside the vulnerability scope. They can still be
reported privately when the distinction is uncertain.

## Security design

The complete threat model, controls, write protocol, residual risks, and test
boundary are documented in [docs/SECURITY-MODEL.md](docs/SECURITY-MODEL.md).
