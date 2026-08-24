# Comparison with related Apple Notes MCP projects

Last reviewed: 2026-08-24.

Guarded Notes MCP is not the first MCP integration for Apple Notes. Its specific
focus is different: **review and organization with deliberately narrow write
authority**. The public projects below generally optimize for broad note
management, native binaries, or semantic retrieval.

This table is based on each project's public README at the review date. `No` or
`Not documented` describes the published interface, not every line of its code.
Projects change; follow the links for their current behavior.

| Project | Primary focus | Runtime / Notes access | Read and search | Create or edit note content | Delete tools | Move or organize | Snapshot + expiring exact plan | Separate plan-bound one-use authorization | Rollback planning / operation journal |
|---|---|---|---|---|---|---|---|---|---|
| **Guarded Notes MCP (this project)** | Safety-gated review and organization | Node.js built-ins + AppleScript/JXA through `osascript` | Yes | **No** | **No** | Yes; top-level folder creation and note moves | **Required for moves** | **Required for moves** | **Yes** |
| [evg4b/apple-notes-mcp](https://github.com/evg4b/apple-notes-mcp) | General read/write MCP with opt-in scopes | Rust binary + ScriptingBridge | Yes | Yes, with write scope | Yes, with delete scope | General note management | Not documented | Not documented | Not documented |
| [sweetrb/apple-notes-mcp](https://github.com/sweetrb/apple-notes-mcp) | Broad Apple Notes management and export | Node.js + AppleScript; some optional database-backed features | Yes | Yes | Yes | Notes, folders, nested paths, and batch operations | Not documented | Not documented | Not documented |
| [TheInkedEngineer/apple-notes-mcp](https://github.com/TheInkedEngineer/apple-notes-mcp) | Native Swift Apple Notes MCP | Swift + `NSAppleScript` | Yes | Yes | Yes; folder deletion has a cascade confirmation | Notes and folders | Not documented | Not documented | Not documented |
| [griches/apple-mcp](https://github.com/griches/apple-mcp) | Multi-app Apple MCP suite, including Notes | Node.js/AppleScript for Notes | Yes | Yes | Yes | Notes and folders | Not documented; optional confirm mode is documented | Not documented | Not documented |
| [RafalWilinski/mcp-apple-notes](https://github.com/RafalWilinski/mcp-apple-notes) | Local semantic search and RAG | Bun + JXA + local embeddings/LanceDB | Yes, including semantic search | No in the documented feature set | No in the documented feature set | No in the documented feature set | No | No | No |

## What is genuinely distinctive here

The closest projects overlap at the Apple Notes + MCP + local macOS automation
level. Based on their published documentation, none describes Guarded Notes
MCP's complete move-control sequence:

1. bounded local inventory and recent metadata snapshot;
2. exact, short-lived plan with a digest and human-readable preview;
3. exact confirmation phrase tied to the counts and digest;
4. a separate, expiring, one-use Terminal authorization bound to that plan;
5. apply-time state revalidation;
6. an owner-only operation journal and a separately authorized rollback plan.

That is a product-design difference, not a claim that the general idea of an
Apple Notes MCP server is novel or legally exclusive.

## Choosing the right project

- Choose **Guarded Notes MCP** when organization safety and constrained writes
  matter more than creating or editing note bodies.
- Choose a general-purpose server when the assistant must create, edit, delete,
  export, or manage attachments.
- Choose the RAG-oriented project when semantic retrieval is the main goal.
- Choose a native Rust or Swift implementation when a compiled binary is more
  important than a dependency-free Node source package.

## Independence and legal scope

Guarded Notes MCP was independently authored and is distributed under MIT. A
repository-name search found no exact `guarded-notes-mcp` match at the review
date, but a search is not trademark clearance and cannot prove that no similar
private or unindexed work exists. The project does not copy third-party code;
functional overlap alone does not demonstrate source copying. Each project's
source, licence terms, attribution requirements, and other rights must still be
respected.

See [NOTICE](../NOTICE) for trademark attribution and [LICENSE](../LICENSE) for
the permissions granted for this repository.
