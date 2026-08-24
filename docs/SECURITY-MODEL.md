# Security Model

Guarded Notes MCP is designed to reduce accidental bulk changes and unnecessary
exposure while organizing a local Notes library. The safety controls are
defense-in-depth measures, not a sandbox around the macOS user account.

## Security goals

- Keep the server runtime local and free of network code.
- Avoid direct access to the Notes database and avoid Full Disk Access.
- Prevent note deletion, folder deletion, and note-content editing by omitting
  those capabilities entirely.
- Treat titles and note text as untrusted model input.
- Prevent a single MCP call from silently authorizing an unreviewed move batch.
- Preserve enough metadata to audit successful and failed moves and prepare a
  reverse-move plan.
- Avoid embedding user values in executable automation source.

## Non-goals

The project does not protect against:

- Malware, an administrator, or other code already running as the same macOS
  user.
- A modified Node executable, modified plugin checkout, compromised MCP client,
  or compromised Notes.app.
- Disclosure by the connected MCP client or model after a tool returns data.
- Changes made directly in Notes, by another automation, or by another device.
- Complete backup or restoration of formatting, attachments, sharing state, or
  every Notes implementation detail.

## Threats and controls

| Threat | Implemented controls |
|---|---|
| Accidental deletion or content overwrite | No delete-note, delete-folder, or content-update tool exists. |
| Unreviewed moves | Recent snapshot, exact preview, expiring in-memory plan, digest-suffixed phrase, and separate authorization bound to that plan's token and full digest are all required. |
| Reusing or mixing approvals | The arm record must match the plan token, 64-character digest, and exact phrase. It is renamed out of the active path and consumed before the first write; the in-memory token is removed when execution begins. |
| Stale source state | Each move checks that the note is still in the planned source folder immediately before moving it. |
| Shared or locked material | Locked notes, shared notes, shared source folders, and shared destinations are rejected for moves. Locked note text is not read. |
| Cross-account or hard-to-reverse moves | Cross-account moves and nested source folders are rejected; source and destination resolution uses exact metadata. |
| AppleScript injection | Dynamic values are passed as `osascript` argument-array values with `shell: false`; they are not inserted into script source. |
| Prompt injection in notes | Tool descriptions and results label titles and note content as untrusted data. |
| Local file exposure | Runtime directories use mode `0700`; files use `0600`; user-facing paths are redacted. |
| Supply-chain expansion | Runtime imports Node.js built-ins only and pins automation execution to `/usr/bin/osascript`. |
| Concurrent writes | An exclusive owner-only file lock coordinates apply batches across server processes; a dedicated queue serializes mutation automation within one process. |
| Snapshot publication racing a write | Background jobs capture a persisted mutation epoch and repeatedly confirm that the epoch is unchanged and no mutation lock is active before publishing artifacts. |
| Partial, interrupted, or timed-out work | A pre-mutation owner-only journal records every planned item and each state transition. A 225-second batch deadline stops later mutations; a timed-out current mutation is marked uncertain. |

## Write authorization protocol

A batch can reach Notes.app only when all of these checks pass:

1. **Recent snapshot** — the referenced snapshot exists and was created less
   than 24 hours ago.
2. **Validated plan** — the server resolves accounts, folders, and notes; rejects
   unsupported cases; calculates a digest; and returns the exact preview.
3. **Unexpired token** — the random plan token still exists in server memory and
   is no more than ten minutes old.
4. **Digest-bound phrase** — the client supplies the exact generated phrase. A
   forward plan uses `APPLY n MOVES + n FOLDERS [DIGESTPREFIX]`; a rollback uses
   `ROLLBACK` in place of `APPLY`. The suffix is the uppercase first 12 characters
   of the plan's SHA-256 digest.
5. **External authorization** — the user separately runs the arm script in an
   interactive Terminal, pastes the exact 32-character plan token and full
   64-character lowercase hexadecimal digest, then types that exact phrase.
6. **Cross-process exclusion** — apply exclusively creates an owner-only
   `mutation.lock`. A live owner blocks another batch. Only a structurally valid
   lock whose recorded process is no longer alive is eligible for conservative
   stale-lock recovery.
7. **One-use consumption** — after acquiring the mutation lock, the server
   atomically renames and consumes the arm record. Its token, digest, phrase,
   lifetime, scope, one-use flag, and nonce must match and validate.
8. **Pre-write epoch and journal** — before the first Notes mutation, the server
   advances the persisted mutation epoch, then writes an `authorized` journal
   with every planned item as `not-attempted`.
9. **Per-note revalidation** — immediately before each move, JXA verifies the
   exact current source-folder identifier and exact destination identifier.
10. **Deadline and state transitions** — the operation becomes `running` when an
    item starts. The batch stops starting mutations once its 225-second deadline,
    including a five-second cleanup reserve, leaves no safe execution time. Each
    item is journaled as `in-progress` before its call and then `succeeded`,
    `failed`, or `uncertain`; untouched items remain `not-attempted` with a
    reason.
11. **Final journal** — the batch is finalized as `completed`, `partial`, or
    `interrupted`. Atomic journal replacement synchronizes file data before
    rename and attempts to synchronize the containing directory afterward.

The MCP client cannot create the external authorization through a server tool.
The authorization is valid only for the exact plan values entered in Terminal;
closing the Terminal window does not extend its ten-minute expiry. The disarm
script removes an unused authorization.

## Planning restrictions

Plans allow no more than 20 top-level folder creations and 100 moves. They reject:

- missing, duplicate, locked, or shared notes;
- notes whose source folder is shared or not top-level;
- cross-account destinations;
- shared, missing, or ambiguous destination folders;
- destination names containing `/`, `.` or `..` as standalone names;
- protected `Recently Deleted` and `Trash` names;
- duplicate folder requests; and
- moves already satisfied by the current snapshot.

Planning is read-only with respect to Notes, although it keeps an expiring token
in server memory.

## Prompt-injection boundary

Apple Notes titles and bodies may contain text that resembles instructions. The
server returns an explicit warning with inventories, searches, individual reads,
batch reads, and cached-content reads. A capable client should preserve that
boundary and use note text only as data for the user's stated task.

This warning cannot guarantee model behavior. Users should review plans from the
tool's structured fields, not trust instructions quoted from a note.

## Local data protection

The local store can contain titles, account and folder names, note identifiers,
timestamps, snippets, capped plaintext, optional HTML/plaintext snapshot content,
and operation history. Standard mode bits limit ordinary access to the current
user, but FileVault and good macOS account security remain important.

No automatic retention policy removes these records. Snapshot expiry means only
that a snapshot can no longer authorize a new write. See [Privacy](../PRIVACY.md)
for the full inventory and cleanup procedure.

## Residual operational risks

- A batch may partly succeed. Review the returned per-item results before doing
  anything else.
- An Automation timeout has an inherently unknown result: Notes may or may not
  have completed the current mutation. The journal marks it `uncertain`, later
  items `not-attempted`, and the batch `interrupted`. Inspect Notes manually and
  create a fresh snapshot; never infer success or blindly retry.
- A hard process or machine interruption can leave a journal in `authorized` or
  `running`, including an item in `in-progress`. Treat an `in-progress` item as
  uncertain because the server cannot prove whether Notes committed the mutation
  before the journal update. There is no automatic outcome reconstruction.
- A rollback is a newly planned set of reverse moves, not a transactional undo.
  It requires current state, a fresh snapshot, a new plan, and a new one-use
  authorization, and it can also partly fail.
- Folder creation is not rolled back by deletion because no folder-deletion
  capability exists. An empty folder may remain after a failed or reversed batch.
- Metadata-only snapshots do not contain note bodies or attachments.
- Notes automation may behave differently across macOS releases or unusual
  account providers. The implementation reports failures rather than bypassing
  safety checks.
- An unreadable, malformed, conflicting, or apparently live mutation-lock record
  fails closed. PID reuse can make a dead owner's PID appear live. Manual
  inspection and recovery may be necessary; never remove a lock until all
  Guarded Notes MCP processes are stopped and current Notes state is understood.
- An unreadable or invalid persisted mutation epoch prevents safe background
  publication until the local state is inspected and recovered.
- Directory `fsync` is best-effort on filesystems or Node combinations that
  reject it; atomic rename and file synchronization still apply.
- Apple Notes exposes a note body as one property. A single exceptionally large
  note can therefore be transiently materialized by Automation before the
  server slices it to the requested or enforced field cap.

## Verification boundary

The repository checks verify source-level network exclusions, the absence of
exposed delete/content-update tools, key bounds and safety checks, JSON-RPC tool
discovery, fixture-based inventory behavior, exact-ID movement logic, and path
redaction. Portable regression tests also exercise lock/epoch coordination,
journal states and deadlines, durability ordering, complete-manifest caps,
bounded snapshot/search reads, and streamed organization batches. On macOS the
plugin self-test compiles nine embedded automation programs.

It does not exercise a real user's Notes library, the macOS permission dialog, a
complete live move, or a live rollback. Those actions require deliberate manual
testing with disposable notes.

For confidential vulnerability reporting, follow the root
[security policy](../SECURITY.md).
