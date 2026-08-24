# Plugin security notes

Guarded Notes MCP intentionally exposes only Apple Notes inventory, read,
snapshot, planning, folder-creation, note-move, operation-review, and rollback
planning capabilities. It has no delete or content-edit surface and no network
client.

The macOS Automation permission granted to Node can expose ordinary unlocked
note data to this local process. Tool responses can expose selected data to the
connected MCP client and its model provider. Do not include real note content,
identifiers, account names, usernames, or local paths in public bug reports.

Runtime caches, manifests, snapshots, jobs, authorization state, and operation
journals can contain private note metadata or bounded content. They are stored
under `~/Library/Application Support/Guarded Notes MCP/` with owner-only
permissions. Protect the macOS account and storage with normal OS security such
as FileVault.

Revoke Notes Automation permission in **System Settings > Privacy & Security >
Automation** to disable Apple Notes access. Run `scripts/disarm-moves.mjs` to
cancel an unused move authorization.

Report vulnerabilities privately using GitHub's **Security > Report a
vulnerability** form in
[nextgencods/guarded-notes-mcp](https://github.com/nextgencods/guarded-notes-mcp/security).
See the repository's `SECURITY.md` and `docs/SECURITY-MODEL.md` for the complete
policy and threat model.
