# Installation

## Requirements

- macOS with Notes.app available.
- Node.js 22 or newer available as `node`.
- Codex in the ChatGPT desktop app, or another local MCP client that supports
  stdio servers.
- Permission to let the Node process automate Notes.app.

Guarded Notes MCP does not require an npm install, an API key, Full Disk Access,
or a remote service. Its runtime uses Node.js built-ins and
`/usr/bin/osascript`.

Check Node before installation:

```sh
node --version
command -v node
```

The first command must report version 22 or newer. The second must return a path
visible to applications launched in your normal desktop session.

## Install from GitHub in Codex

Add the repository as a plugin marketplace source, pinned to the release you
intend to run:

```sh
codex plugin marketplace add nextgencods/guarded-notes-mcp --ref v1.0.0
```

Then:

1. Restart the ChatGPT desktop app.
2. Open the Plugins Directory.
3. Select the `nextgencods` source.
4. Install and enable **Guarded Notes MCP**.
5. Start a new task so the new tool set is loaded.

Pinning a release tag makes the installed source reviewable and avoids silently
tracking later commits on `main`.

## Install from a local checkout

Clone and inspect the repository:

```sh
git clone https://github.com/nextgencods/guarded-notes-mcp.git
cd guarded-notes-mcp
git checkout v1.0.0
node plugins/guarded-notes-mcp/tests/self-test.mjs
```

Add the checkout as a local marketplace root, using its absolute path:

```sh
codex plugin marketplace add /absolute/path/to/guarded-notes-mcp
```

Restart the desktop app and install the plugin from the local source. A local
checkout is appropriate for development; a tagged GitHub source is preferable
for ordinary use.

## Other MCP clients

The bundled server uses newline-delimited JSON-RPC over stdio. Its entry point is:

```text
plugins/guarded-notes-mcp/server.mjs
```

The included `plugins/guarded-notes-mcp/.mcp.json` is the authoritative bundled
configuration. If another client uses a different configuration format, point a
Node 22+ process at `server.mjs`, set the working directory to the plugin
directory, and preserve the documented startup and tool timeouts. Consult that
client's documentation for its exact syntax and approval behavior.

## macOS Automation permission

The first tool that contacts Notes.app may cause macOS to ask whether Node may
control Notes. Approve the Automation request. Do not grant Full Disk Access;
Guarded Notes MCP does not read the Notes database.

To inspect or revoke the permission later:

1. Open **System Settings**.
2. Open **Privacy & Security**.
3. Open **Automation**.
4. Find the Node or host application entry and review its Notes access.

Revoking Automation access prevents the server from reading or moving notes.
It does not remove the plugin's existing local cache.

## Verify the installation

In a new task, ask:

> Check Guarded Notes MCP's safety state without reading my notes.

The client should select `personal_notes_safety`. Next, ask it to check whether
Notes is reachable. That second action may trigger the Automation prompt.

For a source checkout, the dependency-free self-test is:

```sh
node plugins/guarded-notes-mcp/tests/self-test.mjs
```

On macOS, the test also compiles the embedded AppleScript and JXA programs. It
uses fixtures and protocol requests; it does not perform a live organization or
move operation against the user's Notes library.

To run syntax checks, repository validation, portable safety regressions, and the
plugin self-test together:

```sh
npm run ci
```

## Upgrade

List configured marketplaces before changing them:

```sh
codex plugin marketplace list
```

Upgrade the `nextgencods` marketplace source when a reviewed release is
available:

```sh
codex plugin marketplace upgrade nextgencods
```

Restart the desktop app and verify the installed plugin version. Read the
[changelog](../CHANGELOG.md) before any upgrade, especially for changes to tool
schemas, storage, or the move safety gate.

## Disable or uninstall

Disable or uninstall Guarded Notes MCP from the Plugins Directory. To stop
tracking the GitHub marketplace source as well:

```sh
codex plugin marketplace remove nextgencods
```

Removing the plugin does not delete its runtime data. To remove that data, quit
the MCP client, open Finder, choose **Go > Go to Folder**, enter:

```text
~/Library/Application Support/Guarded Notes MCP/
```

Review the directory and move it to Trash. Removing it does not change Apple
Notes, but it removes cached text, manifests, snapshots, operation history, and
rollback metadata. Keep `Snapshots/` and `Operations/` until all recent moves
have been reviewed. Do not remove the directory while any Guarded Notes MCP
process is running: it also contains the cross-process `mutation.lock`, temporary
lock-recovery records, and persisted `mutation-epoch.json`. If apply was
interrupted or a lock is stranded, follow [Troubleshooting](TROUBLESHOOTING.md)
before removing safety state.

For installation failures, see [Troubleshooting](TROUBLESHOOTING.md).
