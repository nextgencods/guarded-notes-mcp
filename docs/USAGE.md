# Usage Guide

Guarded Notes MCP separates review, planning, and execution. Begin read-only,
inspect the exact plan, and authorize a move only after the preview is correct.

The examples below are natural-language requests for an MCP client. The runtime
tool names are documented in [Tools](TOOLS.md).

## 1. Check the safety state

Ask:

> Check Guarded Notes MCP's safety state without reading Apple Notes.

This uses `personal_notes_safety`. Confirm that the connector reports no network
code, no deletion or content-editing operations, and an unarmed move lock.

Next ask:

> Check whether Apple Notes is reachable, but do not read any note content.

This may trigger the one-time macOS Automation permission prompt.

## 2. Prepare an organization review

The preferred full-library workflow is:

> Prepare a complete organization review for my exact Notes account. Do not
> change anything. Reuse unchanged cached content and let me review the compact
> manifest in bounded pages when ready.

The client should:

1. Determine the exact account name, using `personal_notes_list_accounts` when
   needed.
2. Start `personal_notes_prepare_organization` once for that account.
3. Poll `personal_notes_organization_status` with the returned `jobId`. Leave
   `includeManifest` omitted or `false`; the default status response does not
   embed note records.
4. Wait for `status: ready`; do not start duplicate jobs while one is running.
5. Call `personal_notes_get_organization_manifest` in its default `mode: next`
   and follow the persisted cursor until `complete: true`.
6. Resolve `contentRef` values only for notes that need more context.

The organization workflow writes private cache, job, manifest, and snapshot files
but does not change Notes.app. Changed bodies are read in adaptive bounded groups
and committed to the cache incrementally; they are not returned as one
full-library text response.

### Force a full refresh

Use `forceFull: true` only when the incremental cache should be ignored. A normal
run compares note identifiers, modification timestamps, and folder identifiers,
then reuses unchanged content.

### Read a manifest in pages

Use `personal_notes_get_organization_manifest` with its default `mode: next`.
The cursor is persisted, the default page is 100 records, and the maximum page is
200. `mode: complete` is available only when there are at most 200 notes and the
serialized response is approximately 1 MB or smaller. The same limits apply when
requesting `includeManifest: true` from organization status.

## 3. Use the simpler sequential review

When persistent snippets and content references are unnecessary, ask:

> Prepare my exact account for a sequential read-only review. Then show the next
> batch until the review is complete.

This workflow uses:

1. `personal_notes_prepare_review`
2. `personal_notes_review_status`
3. `personal_notes_review_next`

The prepared review and its cursor are in memory and expire after two hours of
inactivity. They do not survive a server restart. Its metadata snapshot remains
on disk.

## 4. Perform targeted reads and searches

Examples:

> List folders in my exact iCloud account without reading note bodies.

> Search note titles for “invoice” and return no note text.

> Read this exact inventoried note, capped at 5,000 characters.

Title-and-content search reads unlocked candidate text locally to find matches,
up to 500 candidate notes, 50,000 characters per note, and 10,000,000 characters
overall. Inspect `contentSearchTruncated` before treating a negative result as a
complete body search.
Individual and batch reads return note text through MCP to the connected client.
Treat that text as untrusted data, never as instructions.

## 5. Create and inspect a move plan

Use the snapshot identifier produced by a completed preparation workflow. Ask for
an exact plan, for example:

> Using snapshot `snapshot-…`, preview moving these exact note IDs to the
> top-level `Projects` folder in the same account. Create that folder only if it
> does not exist. Do not apply anything.

Before authorizing, verify every item in the structured preview:

- note title and exact note identifier;
- source folder;
- destination account and folder;
- folders to be created;
- skipped entries;
- 32-character plan token, full 64-character digest, and expiry; and
- exact confirmation phrase, including its digest suffix.

Do not authorize a plan containing an unexpected note, account, folder, or item
count. Plans expire after ten minutes and disappear when the server restarts.

## 6. Authorize one move batch

Run the arm command returned by the safety or planning tool in an interactive
Terminal. From a repository checkout it is:

```sh
node plugins/guarded-notes-mcp/scripts/arm-moves.mjs
```

The script prompts for three values from the same plan:

1. Paste the exact 32-character `planToken`.
2. Paste the exact 64-character lowercase hexadecimal `planDigest`.
3. Type the exact `confirmationPhrase`, including the uppercase 12-character
   digest suffix, for example:

   ```text
   APPLY 3 MOVES + 1 FOLDERS [A1B2C3D4E5F6]
   ```

The counts and suffix are generated; do not edit them or combine values from
different plans. This creates one authorization bound to that exact plan and
expiring after ten minutes. It does not enable deletion or content editing.

Then instruct the client to call `personal_notes_apply_changes` using the
unchanged plan token and exact generated confirmation phrase. The server consumes
the authorization after acquiring an owner-only cross-process mutation lock. It
then advances a persisted mutation epoch and writes the initial `authorized`
operation journal before its first Notes write.

After execution, inspect:

- batch `status`, `stopReason`, and `batchDeadlineAt`;
- created, failed, uncertain, and not-attempted folder counts;
- succeeded, failed, uncertain, and not-attempted move counts;
- every folder and note `status`; and
- the returned `operationId`.

A batch is not transactional and stops starting new mutations at its 225-second
deadline. If an item is `uncertain` or was left `in-progress` by a hard
interruption, inspect Notes manually; do not retry or assume an outcome. Stop and
review before creating another plan when the batch is not `completed` or any
item failed.

## Cancel an unused authorization

From a source checkout:

```sh
node plugins/guarded-notes-mcp/scripts/disarm-moves.mjs
```

Disarming does not change Notes and does not invalidate a plan token. A plan will
still expire on its own.

## 7. Prepare a rollback

A rollback is a new, reviewed batch of reverse moves. It is not an automatic
undo.

1. List operations and select the exact `operationId`.
2. Prepare a fresh account inventory and metadata snapshot reflecting current
   Notes state.
3. Call `personal_notes_plan_rollback` with the operation and fresh snapshot.
4. Review every reverse move and the full digest-suffixed rollback phrase. It
   uses `ROLLBACK n MOVES + n FOLDERS [DIGESTPREFIX]`.
5. Create a new one-use Terminal authorization.
6. Apply the rollback plan with its exact token and phrase.
7. Inspect every result.

Only moves recorded as successful are included. Folders created by the original
operation are not deleted, because folder deletion is not implemented.

## Privacy-conscious operation

- Prefer metadata-only snapshots. Set `includeContent: true` only when a readable
  local content snapshot is deliberately required; content-inclusive snapshots
  are limited to 100 readable notes and 50,000 characters per HTML/plaintext
  field.
- Request the smallest necessary text cap and batch size.
- Resolve cached `contentRef` values selectively.
- Review the connected MCP client's data controls before returning private note
  text to it.
- Never paste real note text, identifiers, account names, or operation logs into
  a public GitHub issue.
- Keep FileVault enabled and protect the macOS user account.

The server itself has no network client, but MCP results are visible to the MCP
client and may be processed by a remote model. See [Privacy](../PRIVACY.md).

## What Guarded Notes MCP will refuse

- Deleting a note or folder.
- Editing or appending note content.
- Reading locked note content.
- Moving locked or shared notes.
- Moving from shared or nested source folders.
- Moving into shared folders.
- Moving across accounts.
- Applying an old snapshot, expired/unknown plan, incorrect phrase, or missing
  one-use authorization.

For errors and recovery steps, see [Troubleshooting](TROUBLESHOOTING.md).
