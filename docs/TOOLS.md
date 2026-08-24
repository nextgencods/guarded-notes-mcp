# Tool Reference

Guarded Notes MCP version 1.0.0 exposes 20 MCP tools. The runtime tool namespace
is `personal_notes_*`; use these exact names even though the product is named
Guarded Notes MCP.

All schemas reject unknown properties. Bounds shown below are enforced by the
server, not suggestions.

## At a glance

| Tool | Notes effect | Local effect | Purpose |
|---|---|---|---|
| `personal_notes_safety` | None | None | Report the server's safety state and local storage locations. |
| `personal_notes_status` | Read | None | Verify that Notes.app is reachable. |
| `personal_notes_prepare_organization` | Read | Writes cache/job/snapshot/manifest files | Start the preferred incremental organization workflow. |
| `personal_notes_organization_status` | None | Reads local files | Poll a persistent organization job. |
| `personal_notes_get_organization_manifest` | None | Advances a persistent cursor | Return all or the next page of a completed manifest. |
| `personal_notes_read_cached_content` | None | Reads local cache | Resolve one opaque cached-content reference. |
| `personal_notes_prepare_review` | Read | Writes a snapshot | Start a simpler in-memory review workflow. |
| `personal_notes_review_status` | None | None | Poll an in-memory review job. |
| `personal_notes_review_next` | Read | Advances an in-memory cursor | Read the next prepared batch. |
| `personal_notes_list_accounts` | Read | None | List exact Notes account names. |
| `personal_notes_list_folders` | Read | None | List folder metadata and hierarchy. |
| `personal_notes_inventory` | Read | Updates memory cache | Read one metadata page. |
| `personal_notes_read` | Read | None | Read one note by exact identifier. |
| `personal_notes_read_batch` | Read | None | Read up to 50 inventoried notes. |
| `personal_notes_search` | Read | None | Search titles or titles and text. |
| `personal_notes_export_snapshot` | Read | Writes a snapshot | Save a recent complete inventory, with content optional. |
| `personal_notes_plan_changes` | Read | Stores an in-memory plan | Validate and preview folder creation and moves. |
| `personal_notes_apply_changes` | Creates folders and moves notes | Uses a lock/epoch and writes an operation journal | Apply one authorized plan. |
| `personal_notes_list_operations` | None | Reads operation records | List prior batches. |
| `personal_notes_plan_rollback` | Read | Stores an in-memory plan | Preview reverse moves for one operation. |

`personal_notes_prepare_organization` and `personal_notes_prepare_review` are
annotated as non-read-only because they write private local state, even though
they do not change Notes. `personal_notes_apply_changes` is the only tool marked
destructive.

## Safety and availability

### `personal_notes_safety`

Inputs: none.

Returns whether the server contains network code or third-party dependencies,
which operations are unavailable, the current one-use authorization state, the
arm command, and redacted private-storage paths. It does not contact Notes.app.

### `personal_notes_status`

Inputs: none.

Contacts Notes.app and returns reachability and account count. It may trigger the
first macOS Automation permission prompt. It does not require Full Disk Access.

## Preferred organization workflow

### `personal_notes_prepare_organization`

Starts an asynchronous incremental organization job for one exact account.

| Input | Required | Bounds/default |
|---|:---:|---|
| `account` | Yes | Exact name; 1–100 characters. |
| `snippetChars` | No | 200–2,000; default 600. |
| `maxContentChars` | No | 1,000–20,000 per note; default 5,000. |
| `forceFull` | No | Boolean; default `false`. |

The job inventories metadata, reuses unchanged cache entries, and reads capped
text for changed notes with a target group size that adapts between 25 and 100;
the final group may be smaller. Each group is split into calls of at most 50 notes
with concurrency at most two, then committed to the private cache before the next
group. The job creates a metadata-only snapshot and writes a compact manifest.
Starting the tool does not wait for completion.

### `personal_notes_organization_status`

| Input | Required | Bounds/default |
|---|:---:|---|
| `jobId` | Yes | 1–100 characters. |
| `includeManifest` | No | Boolean; default `false`. |

Returns status, phase, progress, cache statistics, timing diagnostics, and
snapshot and manifest identifiers. The manifest is omitted by default. With
`includeManifest: true`, it is embedded only when it contains at most 200 notes
and the complete response is approximately 1 MB or smaller; otherwise the result
sets omission metadata and directs the caller to the paged reader. Poll the
existing job rather than starting duplicates.

### `personal_notes_get_organization_manifest`

| Input | Required | Bounds/default |
|---|:---:|---|
| `jobId` | Yes | 1–100 characters. |
| `mode` | No | `complete` or `next`; default `next`. |
| `pageSize` | No | 1–200; default 100. Used by `next`. |

`next` returns the next page and advances the restart-safe persisted cursor.
`complete` is accepted only when the manifest has at most 200 notes and the
serialized response is approximately 1 MB or smaller; it then moves the cursor
to the end. Records can include identifiers, title, account, folder, timestamps,
protection flags, snippet, `contentRef`, and content-read error.

### `personal_notes_read_cached_content`

| Input | Required | Bounds/default |
|---|:---:|---|
| `contentRef` | Yes | Opaque reference; 1–200 characters. |
| `maxChars` | No | 1,000–200,000; default 20,000. |

Reads capped plaintext from the private cache without contacting Notes.app. The
result explicitly marks the content as untrusted and reports
`appleNotesRead: false`.

## Sequential review workflow

### `personal_notes_prepare_review`

| Input | Required | Bounds/default |
|---|:---:|---|
| `account` | Yes | Exact name; 1–100 characters. |
| `restart` | No | Boolean; default `false`. |

Starts an in-memory background metadata inventory and automatically creates a
metadata-only snapshot. Reuses a running or recent job for the same account
unless `restart` is true.

### `personal_notes_review_status`

Input: required `jobId`, 1–100 characters.

Returns progress and, when ready, the snapshot identifier needed for planning.
Completed and failed review jobs expire after two hours of inactivity and do not
survive a connector restart.

### `personal_notes_review_next`

| Input | Required | Bounds/default |
|---|:---:|---|
| `jobId` | Yes | 1–100 characters. |
| `maxNotes` | No | 1–50; default 50. |
| `maxCharsPerNote` | No | 1,000–50,000; default 12,000. |

Reads the next prepared batch, advances the review cursor, and reports progress
and per-note errors. Repeat until `reviewComplete` is true.

## Accounts, folders, inventory, and reading

### `personal_notes_list_accounts`

Inputs: none. Returns exact Notes account names.

### `personal_notes_list_folders`

Optional `account`: exact account name, at most 100 characters. Returns folder
identifier, path, account, direct note count, nesting metadata, and shared status.

### `personal_notes_inventory`

| Input | Required | Bounds/default |
|---|:---:|---|
| `account` | No | Exact account name; at most 100 characters. |
| `folderId` | No | Exact folder identifier; at most 500 characters. |
| `limit` | No | 1–100; default 100. |
| `offset` | No | 0–20,000; default 0. |

Returns metadata without note bodies. Start at offset `0` and follow
`nextOffset` until it is `null`. A complete sequential scan is retained in
memory for up to two hours and can be used by `personal_notes_export_snapshot`.

### `personal_notes_read`

| Input | Required | Bounds/default |
|---|:---:|---|
| `noteId` | Yes | Exact identifier; 1–500 characters. |
| `maxChars` | No | 1,000–200,000; default 20,000. |

Returns metadata and capped plaintext. Locked note content is rejected.

### `personal_notes_read_batch`

| Input | Required | Bounds/default |
|---|:---:|---|
| `noteIds` | Yes | 1–50 unique, exact identifiers already present in the current inventory. |
| `maxCharsPerNote` | No | 1,000–200,000; default 20,000. |
| `maxTotalChars` | No | 1,000–1,000,000; default 500,000. |

Returns per-note success or error data. Unknown, locked, unavailable, duplicate,
and output-capped requests are handled without bypassing the bounds.

### `personal_notes_search`

| Input | Required | Bounds/default |
|---|:---:|---|
| `query` | Yes | 1–200 characters. |
| `scope` | No | `title` or `title-and-content`; default `title`. |
| `limit` | No | 1–100; default 25. |

Title-and-content search may read plaintext from unlocked candidate notes, but
returns matching metadata rather than the candidate bodies. The content phase
scans at most 500 candidates, 50,000 characters per note, and 10,000,000
characters in total, in calls of at most 50 notes. The response reports candidate
and character counts plus `contentSearchTruncated` when a search bound prevents a
complete content scan.

## Snapshots, changes, and rollback

### `personal_notes_export_snapshot`

| Input | Required | Bounds/default |
|---|:---:|---|
| `account` | Yes | Exact name; 1–100 characters. |
| `includeContent` | No | Boolean; default `false`. |

Requires a complete inventory for that exact account in the current connector
session. A metadata-only snapshot stores titles, identifiers, folder/account
metadata, timestamps, and protection flags. `includeContent: true` also reads and
stores HTML and plaintext for unlocked notes, but only when the inventory has at
most 100 readable notes. Each HTML field and plaintext field is capped at 50,000
characters and reports original lengths/truncation. Attachments are never copied.

Snapshots can authorize a plan for 24 hours; expiration does not delete the file.

### `personal_notes_plan_changes`

Required inputs are `snapshotId` and `moves`. `createFolders` is optional.

```json
{
  "snapshotId": "snapshot-…",
  "createFolders": [
    { "account": "iCloud", "name": "Projects" }
  ],
  "moves": [
    {
      "noteId": "exact-note-id",
      "destinationAccount": "iCloud",
      "destinationFolder": "Projects"
    }
  ]
}
```

- `createFolders`: at most 20 entries; each requires exact `account` and one
  top-level `name`.
- `moves`: at most 100 entries; each requires `noteId`, `destinationAccount`, and
  `destinationFolder`.

The tool performs no Notes write. It returns an exact preview, a 32-character
random plan token, a 64-character SHA-256 digest, ten-minute expiry, exact
confirmation phrase, and arm command. A forward phrase is
`APPLY n MOVES + n FOLDERS [DIGESTPREFIX]`; a rollback uses `ROLLBACK` instead of
`APPLY`. The suffix is the digest's uppercase first 12 characters. See the
[security model](SECURITY-MODEL.md) for rejected cases.

### `personal_notes_apply_changes`

| Input | Required | Bounds |
|---|:---:|---|
| `planToken` | Yes | 1–200 characters. |
| `confirmation` | Yes | 1–100 characters; must exactly match the generated phrase. |

Requires a still-valid snapshot and plan plus a separate one-use Terminal
authorization containing the same plan token, full 64-character digest, and
exact digest-suffixed phrase. After acquiring an exclusive owner-only
cross-process lock, the server consumes that authorization, advances a persisted
mutation epoch, and writes the initial `authorized` journal before any Notes
write.

An apply batch has a 225-second deadline. Its operation state starts
`authorized`, becomes `running` when an item starts, and finishes `completed`,
`partial`, or `interrupted`. Every folder and move begins as `not-attempted`, is
journaled `in-progress` before Automation, and ends as `succeeded`, `failed`, or
`uncertain`. A timed-out call is `uncertain`; later items are left
`not-attempted`. The response includes the deadline, stop reason when present,
operation identifier, redacted journal path, counts, and per-item outcomes. This
is not transactional; inspect partial, interrupted, and uncertain results in
Notes before any new plan.

| Batch state | Meaning |
|---|---|
| `authorized` | Initial journal exists; no item has yet been recorded as started. A hard crash can leave this state on disk. |
| `running` | At least one item has started. A hard crash can leave this state on disk. |
| `completed` | Every item reached a known attempted outcome; individual items can still be `failed`. |
| `partial` | At least one item finished with a known outcome and later items were not attempted. |
| `interrupted` | An outcome is uncertain, no item could start, or an internal interruption stopped the batch. |

An `in-progress` item left by a hard process interruption is counted and handled
as uncertain during manual recovery; the connector cannot infer Notes' outcome.

### `personal_notes_list_operations`

Optional `limit`: 1–100, default 20. Returns summaries of the newest local
operation journals without contacting Notes.app, including completed, partial,
interrupted, uncertain, and not-attempted counts where present.

### `personal_notes_plan_rollback`

| Input | Required | Bounds |
|---|:---:|---|
| `operationId` | Yes | 1–120 characters. |
| `snapshotId` | Yes | Fresh snapshot identifier; 1–100 characters. |

Builds a new preview containing reverse moves for the successful moves in an
operation. It does not change Notes. Applying the returned rollback plan still
requires its exact phrase and a new one-use Terminal authorization.

## Errors and untrusted output

Expected validation, state, permission, and Notes automation failures are
returned as MCP tool errors. Internal errors are logged locally and returned as
a generic message. User-facing runtime paths replace the home and plugin
directories with `~` and `<plugin-directory>`.

Titles, snippets, plaintext, account names, and folder names remain user data and
may be sensitive even when a path is redacted. Every client must treat returned
note-derived fields as untrusted data and apply its own privacy policy.
