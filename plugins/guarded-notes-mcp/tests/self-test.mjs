#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 nextgencods

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const pluginDir = dirname(dirname(fileURLToPath(import.meta.url)));
const serverPath = join(pluginDir, "server.mjs");
const source = readFileSync(serverPath, "utf8");
const armSource = readFileSync(join(pluginDir, "scripts", "arm-moves.mjs"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractScript(name) {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*String\\.raw\\x60([\\s\\S]*?)\\x60;`);
  const match = source.match(pattern);
  assert(match, `Unable to locate ${name}`);
  return match[1];
}

function extractFunction(name, nextName) {
  const functionStart = source.indexOf(`function ${name}`);
  const asyncStart = source.lastIndexOf("async ", functionStart);
  const start = asyncStart >= 0 && asyncStart + 6 === functionStart ? asyncStart : functionStart;
  const syncEnd = source.indexOf(`\nfunction ${nextName}`, start);
  const asyncEnd = source.indexOf(`\nasync function ${nextName}`, start);
  const end = [syncEnd, asyncEnd].filter((value) => value > start).sort((a, b) => a - b)[0] ?? -1;
  assert(start >= 0 && end > start, `Unable to locate function ${name}`);
  return source.slice(start, end);
}

for (const forbiddenImport of [
  "node:http",
  "node:https",
  "node:http2",
  "node:net",
  "node:tls",
  "node:dgram",
  "node:dns",
]) {
  assert(!source.includes(`from \"${forbiddenImport}\"`), `Forbidden network import: ${forbiddenImport}`);
}
assert(!/\bfetch\s*\(/.test(source), "fetch() must not exist");
assert(!/\bWebSocket\s*\(/.test(source), "WebSocket must not exist");
assert(source.includes("spawn(OSASCRIPT,"), "External execution must be pinned to /usr/bin/osascript");
assert(!source.includes("spawnSync"), "The MCP server must not block on synchronous child processes");
assert(source.includes("personal-notes-content://"), "Private cached-content references are missing");
assert(source.includes("persistOrganizationJob"), "Organization jobs are not persisted");
assert(source.includes("setImmediate(() => void runOrganizationJob(job))"), "Organization work is not scheduled in the background");
assert(!source.includes('name: "delete'), "A delete tool must not exist");
assert(!source.includes('name: "update'), "A content-update tool must not exist");
assert(!source.includes("for (const note of value(() => account.notes(), []))"), "Inventory must not scan every account note before paging");
assert(source.includes('const requests = JSON.parse(String(argv[0] || "[]"))'), "Inventory must accept direct folder-page requests");
assert(source.includes("const scopedFolders = folderId ? folders.filter"), "Inventory must honor exact folder scope");
assert(source.includes("const page = await inventoryPage({ account, folderId, limit, offset });"), "Inventory tool must page at the Apple Notes boundary");
assert(/const output = await runOsa\(\s*INVENTORY_JXA/.test(source), "Automation errors must occur outside JSON parsing");
assert(source.includes("MAX_INVENTORY_AUTOMATION_NOTES = 50"), "Inventory automation must have a bounded batch size");
assert(source.includes("MAX_INVENTORY_TOOL_PAGE_SIZE = 100"), "Public inventory pages must stay below the tool timeout");
assert(source.includes('name: "personal_notes_read_batch"'), "A batch-read tool must be available");
assert(source.includes("ids.length > MAX_READ_BATCH"), "Batch reads must enforce a strict size limit");
assert(source.includes("setImmediate(() => void runReviewInventoryJob(job))"), "Smooth review preparation must run in the background");
assert(source.includes("job.reviewCursor += selected.length"), "Smooth review must manage its own position");
assert(source.includes("const cachedInventory = getCompleteInventory(account"), "Snapshots must reuse a completed inventory");
assert(!source.includes("inventoryAll({ fresh: true"), "Snapshots and plans must not force another full inventory");
const planChangesSource = extractFunction("planChanges", "operationPath");
assert(planChangesSource.includes("const notes = snapshot.notes"), "Move plans must use snapshot note metadata");
assert(!planChangesSource.includes("inventoryAll("), "Move plans must not rescan Apple Notes");
assert(source.includes("consumeArm(plan)"), "Move authorization must be bound to the exact in-memory plan");
assert(source.includes("arm.planDigest === plan.digest"), "Move authorization must verify the exact plan digest");
assert(source.includes("persistOperation(logPath, operation)"), "Move execution must persist an operation journal");
assert(source.includes("destinationFolderId: item.fromFolderId"), "Rollback must use the original stable folder ID");
assert(source.includes("page.nextOffset >= MAX_LIBRARY_NOTES"), "Inventory truncation must be detected");
assert(armSource.includes("planDigest") && armSource.includes("confirmation: answer"), "Arm script must bind digest and confirmation");

const scripts = [
  ["LIST_ACCOUNTS_SCRIPT", "AppleScript"],
  ["LIST_FOLDERS_JXA", "JavaScript"],
  ["INVENTORY_JXA", "JavaScript"],
  ["SIGNATURES_JXA", "JavaScript"],
  ["READ_METADATA_JXA", "JavaScript"],
  ["READ_NOTES_JXA", "JavaScript"],
  ["READ_TEXT_BATCH_JXA", "JavaScript"],
  ["CREATE_FOLDER_SCRIPT", "AppleScript"],
  ["MOVE_NOTE_JXA", "JavaScript"],
];
let compiledScriptCount = 0;
if (process.platform === "darwin") {
  const compileDir = mkdtempSync(join(tmpdir(), "guarded-notes-mcp-test-"));
  try {
    for (const [name, language] of scripts) {
      const outputPath = join(compileDir, `${name}.scpt`);
      const args = language === "JavaScript" ? ["-l", "JavaScript", "-o", outputPath, "-"] : ["-o", outputPath, "-"];
      const result = spawnSync("/usr/bin/osacompile", args, {
        input: extractScript(name),
        encoding: "utf8",
        timeout: 20_000,
        shell: false,
      });
      assert(result.status === 0, `${name} did not compile: ${String(result.stderr).trim()}`);
      compiledScriptCount += 1;
    }
  } finally {
    rmSync(compileDir, { recursive: true, force: true });
  }
}

function mockNote(id) {
  return {
    id: () => id,
    name: () => `Title ${id}`,
    creationDate: () => new Date("2026-01-01T00:00:00Z"),
    modificationDate: () => new Date("2026-01-02T00:00:00Z"),
    shared: () => false,
    passwordProtected: () => false,
    plaintext: () => `Text ${id} `.repeat(250),
    exists: () => true,
  };
}

function mockFolder(id, name, noteIds, children = []) {
  const folder = {
    id: () => id,
    name: () => name,
    shared: () => false,
    notes: () => noteIds.map(mockNote),
    folders: () => children,
  };
  for (const child of children) child.container = () => folder;
  return folder;
}

const nested = mockFolder("icloud-nested", "Nested", ["n1"]);
const googleFolder = mockFolder("google-root", "Google Notes", ["g1", "g2", "g3"]);
const iCloudFolder = mockFolder("icloud-root", "Notes", ["i1", "i2"], [nested]);
const accounts = [
  { name: () => "Google", folders: () => [googleFolder] },
  // Notes may expose a nested folder both through its parent and as an account root.
  { name: () => "iCloud", folders: () => [iCloudFolder, nested] },
];
googleFolder.container = () => accounts[0];
iCloudFolder.container = () => accounts[1];

const foldersById = new Map([
  [googleFolder.id(), googleFolder],
  [iCloudFolder.id(), iCloudFolder],
  [nested.id(), nested],
]);
const notesById = new Map(
  ["g1", "g2", "g3", "i1", "i2", "n1"].map((id) => [id, mockNote(id)])
);
const notesApp = {
  accounts: () => accounts,
  folders: { byId: (id) => foldersById.get(id) ?? { exists: () => false } },
  notes: { byId: (id) => notesById.get(id) ?? { exists: () => false } },
};

{
  const sourceFolder = {
    id: () => "source-folder",
    name: () => "Source",
    shared: () => false,
    folders: () => [],
  };
  const destinationFolder = {
    id: () => "destination-folder",
    name: () => "Destination",
    shared: () => false,
    folders: () => [],
    exists: () => true,
  };
  const account = {
    name: () => "iCloud",
    folders: () => [sourceFolder, destinationFolder],
  };
  const note = {
    id: () => "move-note",
    exists: () => true,
    shared: () => false,
    passwordProtected: () => false,
    container: () => sourceFolder,
  };
  let movedTo = null;
  const moveApp = {
    accounts: () => [account],
    notes: { byId: (id) => id === "move-note" ? note : { exists: () => false } },
    folders: { byId: (id) => id === "destination-folder" ? destinationFolder : { exists: () => false } },
    move: (item, options) => { assert(item === note, "Move used the wrong note"); movedTo = options.to; },
  };
  const sandbox = { Application: () => moveApp, result: "" };
  runInNewContext(
    `${extractScript("MOVE_NOTE_JXA")}\nresult = run(["move-note", "source-folder", "destination-folder", "iCloud", "Destination"]);`,
    sandbox
  );
  assert(sandbox.result === "destination-folder" && movedTo === destinationFolder, "Exact-ID move resolution failed");

  note.shared = () => { throw new Error("unavailable"); };
  let rejectedUnknownSharing = false;
  try {
    runInNewContext(
      `${extractScript("MOVE_NOTE_JXA")}\nresult = run(["move-note", "source-folder", "destination-folder", "iCloud", "Destination"]);`,
      { Application: () => moveApp, result: "" }
    );
  } catch {
    rejectedUnknownSharing = true;
  }
  assert(rejectedUnknownSharing, "Move must fail closed when note sharing status is unknown");
}

function runFixture(scriptName, args) {
  const sandbox = { Application: () => notesApp, result: "" };
  runInNewContext(`${extractScript(scriptName)}\nresult = run(${JSON.stringify(args)});`, sandbox);
  return JSON.parse(sandbox.result);
}

const iCloudFolders = runFixture("LIST_FOLDERS_JXA", ["iCloud"]);
assert(iCloudFolders.length === 2, "Repeated folder IDs were not removed");
assert(new Set(iCloudFolders.map((item) => item.id)).size === 2, "Folder inventory returned duplicate IDs");
assert(iCloudFolders.find((item) => item.id === "icloud-nested")?.path === "Notes/Nested", "Nested path was incorrect");

const pageRequests = [
  { folderId: "google-root", start: 1, limit: 2, account: "Google", folderName: "Google Notes" },
  { folderId: "icloud-root", start: 0, limit: 2, account: "iCloud", folderName: "Notes" },
  { folderId: "icloud-nested", start: 0, limit: 1, account: "iCloud", folderName: "Nested" },
];
const inventoryPage = runFixture("INVENTORY_JXA", [JSON.stringify(pageRequests)]);
assert(inventoryPage.rows.map((item) => item.id).join(",") === "g2,g3,i1,i2,n1", "Paged inventory returned the wrong slices");
assert(new Set(inventoryPage.rows.map((item) => item.id)).size === inventoryPage.rows.length, "Inventory returned duplicate note IDs");
const duplicatePage = runFixture("INVENTORY_JXA", [JSON.stringify([pageRequests[1], pageRequests[1]])]);
assert(duplicatePage.rows.length === 2 && duplicatePage.duplicatesSkipped === 2, "Inventory did not suppress repeated notes");
const signatures = runFixture("SIGNATURES_JXA", [JSON.stringify(pageRequests.map((item) => ({
  folderId: item.folderId,
  account: item.account,
  folderName: item.folderName,
})))]);
assert(signatures.length === 6, "Incremental signature scan returned the wrong note count");
assert(signatures.every((item) => item.id && item.modified), "Incremental signature rows were incomplete");

async function runInventoryPageFixture(input) {
  const sandbox = {
    INVENTORY_JXA: "fixture",
    MAX_INVENTORY_AUTOMATION_NOTES: 50,
    PublicError: Error,
    metadataCache: new Map(),
    mapLimit: async (items, _concurrency, worker) => await Promise.all(items.map(worker)),
    listFolders: (account) => runFixture("LIST_FOLDERS_JXA", [account]),
    runOsa: (_script, args) => JSON.stringify(runFixture("INVENTORY_JXA", args)),
    result: null,
  };
  runInNewContext(`${extractFunction("inventoryPage", "inventoryAll")}\nresult = inventoryPage(${JSON.stringify(input)});`, sandbox);
  return await sandbox.result;
}

const mappedFirstPage = await runInventoryPageFixture({ account: "iCloud", limit: 2, offset: 0 });
assert(mappedFirstPage.totalMatching === 3, "Unique-folder total was incorrect");
assert(mappedFirstPage.notes.map((item) => item.id).join(",") === "i1,i2", "First mapped inventory page was incorrect");
assert(mappedFirstPage.nextOffset === 2, "First mapped inventory cursor was incorrect");
const mappedSecondPage = await runInventoryPageFixture({ account: "iCloud", limit: 2, offset: 2 });
assert(mappedSecondPage.notes[0]?.id === "n1" && mappedSecondPage.nextOffset === null, "Second mapped inventory page was incorrect");
const mappedExactFolder = await runInventoryPageFixture({ account: "iCloud", folderId: "icloud-nested", limit: 20, offset: 0 });
assert(mappedExactFolder.totalMatching === 1 && mappedExactFolder.notes[0]?.id === "n1", "Exact-folder page was not scoped");

async function runBatchedInventoryPageFixture() {
  const calls = [];
  const sandbox = {
    INVENTORY_JXA: "fixture",
    MAX_INVENTORY_AUTOMATION_NOTES: 50,
    PublicError: Error,
    metadataCache: new Map(),
    mapLimit: async (items, _concurrency, worker) => await Promise.all(items.map(worker)),
    listFolders: () => [{ id: "large-folder", account: "iCloud", name: "Large", shared: false, directNoteCount: 120 }],
    runOsa: (_script, args) => {
      const batch = JSON.parse(args[0]);
      calls.push(batch);
      const rows = batch.flatMap((request) => Array.from({ length: request.limit }, (_, index) => ({
        id: `note-${request.start + index}`,
        title: "Fixture",
      })));
      return JSON.stringify({ rows, skippedUnreadable: 0, duplicatesSkipped: 0 });
    },
    result: null,
  };
  runInNewContext(`${extractFunction("inventoryPage", "inventoryAll")}\nresult = inventoryPage({ account: "iCloud", limit: 120, offset: 0 });`, sandbox);
  return { page: await sandbox.result, calls };
}

const batchedInventory = await runBatchedInventoryPageFixture();
assert(batchedInventory.page.notes.length === 120, "Batched inventory lost notes");
assert(
  batchedInventory.calls.map((batch) => batch.reduce((sum, request) => sum + request.limit, 0)).join(",") === "50,50,20",
  "Large inventory requests were not split into bounded automation batches"
);

const inventoryCacheSandbox = {
  COMPLETE_INVENTORY_TTL_MS: 2 * 60 * 60 * 1000,
  completeInventoryCache: new Map(),
  partialInventoryScans: new Map(),
  result: null,
};
runInNewContext(
  `${extractFunction("inventoryScopeKey", "getCompleteInventory")}\n` +
  `${extractFunction("getCompleteInventory", "rememberInventoryPage")}\n` +
  `${extractFunction("rememberInventoryPage", "inventoryAll")}\n` +
  `rememberInventoryPage({ account: "iCloud", offset: 0, page: { notes: [{ id: "a" }], nextOffset: 1 } });\n` +
  `rememberInventoryPage({ account: "iCloud", offset: 1, page: { notes: [{ id: "b" }], nextOffset: null } });\n` +
  `result = getCompleteInventory("iCloud", "");`,
  inventoryCacheSandbox
);
assert(
  inventoryCacheSandbox.result?.value?.map((item) => item.id).join(",") === "a,b",
  "Completed paged inventory was not cached for snapshot reuse"
);

const textBatch = runFixture("READ_TEXT_BATCH_JXA", ["1000", "i1", "i2", "missing"]);
assert(textBatch.length === 3 && textBatch[0].ok && textBatch[1].ok, "Batch note read failed");
assert(textBatch[0].plaintext.length === 1000 && textBatch[0].truncated, "Batch note cap was not enforced");
assert(textBatch[2].ok === false, "Missing batch note was not reported");

const requests = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "self-test", version: "1" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "personal_notes_safety", arguments: {} } },
  { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "personal_notes_apply_changes", arguments: { planToken: "invalid", confirmation: "invalid" } } },
];
const protocol = spawnSync(process.execPath, [serverPath], {
  input: `${requests.map((item) => JSON.stringify(item)).join("\n")}\n`,
  encoding: "utf8",
  timeout: 20_000,
  maxBuffer: 8 * 1024 * 1024,
  shell: false,
});
assert(protocol.status === 0, `MCP server failed: ${protocol.stderr}`);
const responses = protocol.stdout.trim().split("\n").map((line) => JSON.parse(line));
const tools = responses.find((item) => item.id === 2)?.result?.tools ?? [];
assert(tools.length >= 20, "Expected private Notes tools were not listed");
assert(tools.some((tool) => tool.name === "personal_notes_read_batch"), "Batch-read tool was not listed");
assert(tools.some((tool) => tool.name === "personal_notes_prepare_review"), "Smooth preparation tool was not listed");
assert(tools.some((tool) => tool.name === "personal_notes_review_status"), "Smooth progress tool was not listed");
assert(tools.some((tool) => tool.name === "personal_notes_review_next"), "Smooth sequential reader was not listed");
assert(tools.some((tool) => tool.name === "personal_notes_prepare_organization"), "Organization preparation tool was not listed");
assert(tools.some((tool) => tool.name === "personal_notes_organization_status"), "Organization status tool was not listed");
assert(tools.some((tool) => tool.name === "personal_notes_get_organization_manifest"), "Organization manifest tool was not listed");
assert(tools.some((tool) => tool.name === "personal_notes_read_cached_content"), "Private cached-content tool was not listed");
assert(
  tools.find((tool) => tool.name === "personal_notes_inventory")?.inputSchema?.properties?.limit?.maximum === 100,
  "Inventory tool exposed an unsafe page size"
);
assert(
  tools.find((tool) => tool.name === "personal_notes_export_snapshot")?.inputSchema?.required?.includes("account"),
  "Snapshot tool must require an exact account scope"
);
assert(
  tools.find((tool) => tool.name === "personal_notes_organization_status")?.inputSchema?.properties?.includeManifest?.default === false,
  "Organization status must omit the full manifest by default"
);
assert(
  tools.find((tool) => tool.name === "personal_notes_get_organization_manifest")?.inputSchema?.properties?.mode?.default === "next",
  "Organization manifests must default to bounded paging"
);
assert(!tools.some((tool) => /delete|update.*content/i.test(tool.name)), "Unsafe tool surfaced");
assert(responses.find((item) => item.id === 3)?.result?.structuredContent?.networkCode === false, "Safety status mismatch");
assert(responses.find((item) => item.id === 3)?.result?.structuredContent?.organizationStorage?.ownerOnly === true, "Persistent organization storage was not disclosed");
assert(responses.find((item) => item.id === 4)?.result?.isError === true, "Unknown move plan was not rejected");
assert(!protocol.stdout.includes(process.env.HOME || "<missing-home>"), "MCP output leaked the absolute home directory");
assert(!protocol.stdout.includes(pluginDir), "MCP output leaked the absolute plugin directory");

const compilationSummary = process.platform === "darwin"
  ? `${compiledScriptCount} automation scripts compiled`
  : `${scripts.length} automation scripts inspected (macOS compilation skipped)`;
console.log(`Self-test passed: ${compilationSummary}; ${tools.length} MCP tools verified; no network/delete/edit surface found.`);
