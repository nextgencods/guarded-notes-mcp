# Guarded Notes MCP plugin

This directory is the distributable Codex plugin for
[Guarded Notes MCP](https://github.com/nextgencods/guarded-notes-mcp): a
dependency-free, local MCP server for reviewing and safely organizing Apple
Notes on macOS.

## Safety boundaries

- No note deletion, folder deletion, or note-content editing tools.
- No network, analytics, telemetry, updater, or third-party runtime package.
- Locked, shared, nested, ambiguous-account, cross-account, and stale moves are
  rejected.
- Every batch requires a recent snapshot, an exact expiring plan, its exact
  digest-suffixed confirmation phrase, and a separate one-use Terminal
  authorization bound to the plan token and full 64-character digest.
- The server uses an owner-only cross-process mutation lock, advances a persisted
  mutation epoch before writes, revalidates each move at apply time, and keeps an
  atomic owner-only operation journal for review and rollback planning.
- Apply batches stop after a 225-second deadline. Journal entries distinguish
  succeeded, failed, uncertain, and not-attempted outcomes.
- Values are passed to `/usr/bin/osascript` as argument-array values, not
  interpolated into automation source.

Terminal authorization is an intentional control-separation and review step;
it is not a cryptographic proof of who is at the keyboard.

## Privacy boundary

The server has no network code. It reads ordinary unlocked note information
through the macOS Automation interface and stores bounded working data under:

```text
~/Library/Application Support/Guarded Notes MCP/
```

Some tool responses contain titles, snippets, or selected note text. Anything
returned through MCP can be processed or retained by the connected client and
its model provider. Use that client's privacy controls and request the least
content necessary. Attachments are not copied.

## Typical workflow

1. Check access with `personal_notes_status`.
2. Prepare or inspect a read-only organization manifest.
3. Create an exact move preview with `personal_notes_plan_changes`.
4. Review every proposed folder and move.
5. Run the arm command returned by the tool. In Terminal, paste the exact plan
   token and 64-character digest, then type the exact digest-suffixed phrase.
6. Apply the unchanged plan with its exact confirmation phrase.
7. Review the operation journal; create a fresh snapshot before planning a
   rollback.

An unused authorization can be cancelled with:

```sh
node scripts/disarm-moves.mjs
```

## Requirements

- macOS with Apple Notes
- Node.js 22 or newer available as `node`
- A local MCP client or Codex plugin host
- macOS Automation permission for the Node process to control Notes

Full Disk Access is not requested or required.

For installation, tools, architecture, security details, privacy, and support,
see the [repository documentation](https://github.com/nextgencods/guarded-notes-mcp#documentation).

## Licence and ownership

Copyright © 2026 [nextgencods](https://github.com/nextgencods). Released under
the [MIT License](LICENSE).

This project is independent and is not affiliated with, endorsed by, or
sponsored by Apple Inc. or OpenAI.
