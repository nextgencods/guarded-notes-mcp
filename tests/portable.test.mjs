// SPDX-License-Identifier: MIT
// Copyright (c) 2026 nextgencods

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { validateReleaseTag } from "../scripts/validate-repository.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginRoot = join(repositoryRoot, "plugins", "guarded-notes-mcp");
const serverPath = join(pluginRoot, "server.mjs");
const serverSource = readFileSync(serverPath, "utf8");

class FixturePublicError extends Error {}

function extractScript(name) {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*String\\.raw\\x60([\\s\\S]*?)\\x60;`);
  const match = serverSource.match(pattern);
  assert.ok(match, `Unable to locate ${name}`);
  return match[1];
}

function extractFunction(name, nextName) {
  const functionStart = serverSource.indexOf(`function ${name}`);
  const asyncStart = serverSource.lastIndexOf("async ", functionStart);
  const start = asyncStart >= 0 && asyncStart + 6 === functionStart ? asyncStart : functionStart;
  const syncEnd = serverSource.indexOf(`\nfunction ${nextName}`, start);
  const asyncEnd = serverSource.indexOf(`\nasync function ${nextName}`, start);
  const end = [syncEnd, asyncEnd].filter((value) => value > start).sort((a, b) => a - b)[0] ?? -1;
  assert.ok(start >= 0 && end > start, `Unable to locate function ${name}`);
  return serverSource.slice(start, end);
}

test("release tags must be strict semantic versions that match the repository", () => {
  assert.deepEqual(validateReleaseTag("v1.0.0", "1.0.0"), []);
  assert.match(validateReleaseTag("1.0.0", "1.0.0")[0], /begin with v/);
  assert.ok(validateReleaseTag("v1.0", "1.0.0").some((error) => /strict semantic/.test(error)));
  assert.ok(validateReleaseTag("v2.0.0", "1.0.0").some((error) => /does not match/.test(error)));
});

test("runtime modules use only Node built-ins and expose no network surface", () => {
  const runtimeFiles = [
    serverPath,
    join(pluginRoot, "scripts", "arm-moves.mjs"),
    join(pluginRoot, "scripts", "disarm-moves.mjs"),
  ];
  for (const path of runtimeFiles) {
    const source = readFileSync(path, "utf8");
    const imports = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
    assert.ok(imports.length > 0, `${path} should declare its imports explicitly`);
    assert.ok(imports.every((specifier) => specifier.startsWith("node:")), `${path} imported a non-built-in module`);
    assert.doesNotMatch(source, /\bimport\s*\(/, `${path} must not use dynamic imports`);
    assert.doesNotMatch(source, /\bfetch\s*\(/, `${path} must not call fetch`);
    assert.doesNotMatch(source, /\b(?:WebSocket|EventSource)\s*\(/, `${path} must not open web connections`);
  }
  for (const moduleName of ["http", "https", "http2", "net", "tls", "dgram", "dns"]) {
    assert.ok(!serverSource.includes(`node:${moduleName}`), `server imported node:${moduleName}`);
  }
  assert.match(serverSource, /const OSASCRIPT = "\/usr\/bin\/osascript";/);
  assert.match(serverSource, /spawn\(OSASCRIPT,/);
  assert.doesNotMatch(serverSource, /shell:\s*true/);
});

test("atomic private JSON fsyncs the file before rename and its directory after", () => {
  const events = [];
  const existing = new Set();
  const targetPath = "/private/record.json";
  const sandbox = {
    process: { pid: 42 },
    randomUUID: () => "12345678-1234-4123-8123-123456789abc",
    dirname,
    ensurePrivateDir: (path) => events.push(`ensure:${path}`),
    writeFileSync: (path) => {
      events.push(`write:${path}`);
      existing.add(path);
    },
    chmodSync: (path) => events.push(`chmod:${path}`),
    assertPrivateFile: (path) => events.push(`assert:${path}`),
    fsyncPrivatePath: (path) => events.push(`fsync:${path}`),
    renameSync: (from, to) => {
      events.push(`rename:${from}->${to}`);
      existing.delete(from);
      existing.add(to);
    },
    existsSync: (path) => existing.has(path),
    unlinkSync: (path) => {
      events.push(`unlink:${path}`);
      existing.delete(path);
    },
    api: null,
  };
  runInNewContext(
    `${extractFunction("atomicPrivateJson", "stableToken")}\napi = { atomicPrivateJson };`,
    sandbox,
  );
  sandbox.api.atomicPrivateJson(targetPath, { safe: true });

  const tempPath = `${targetPath}.tmp-42-12345678-1234-4123-8123-123456789abc`;
  const fileFsync = events.indexOf(`fsync:${tempPath}`);
  const rename = events.indexOf(`rename:${tempPath}->${targetPath}`);
  const directoryFsync = events.lastIndexOf("fsync:/private");
  assert.ok(fileFsync >= 0 && fileFsync < rename, "the temporary file must be durable before rename");
  assert.ok(rename < directoryFsync, "the containing directory must be synced after rename");
  assert.ok(existing.has(targetPath));
  assert.ok(!existing.has(tempPath));
});

test("mutation lock and epoch records coordinate independent processes", () => {
  const privateRoot = mkdtempSync(join(tmpdir(), "guarded-notes-lock-test-"));
  const lockPath = join(privateRoot, "mutation.lock.json");
  const epochPath = join(privateRoot, "mutation.epoch.json");
  let invalidations = 0;
  const sandbox = {
    APP_DIR: privateRoot,
    MUTATION_LOCK_FILE: lockPath,
    MUTATION_EPOCH_FILE: epochPath,
    PublicError: FixturePublicError,
    process,
    Date,
    randomUUID,
    basename,
    dirname,
    join,
    existsSync,
    readFileSync,
    readdirSync,
    writeFileSync,
    chmodSync,
    renameSync,
    unlinkSync,
    openSync,
    fsyncSync,
    closeSync,
    ensurePrivateDir: (path) => mkdirSync(path, { recursive: true, mode: 0o700 }),
    ensureStorage: () => mkdirSync(privateRoot, { recursive: true, mode: 0o700 }),
    assertPrivateFile: (path) => {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
        throw new FixturePublicError("unsafe fixture file");
      }
    },
    processIsAlive: (pid) => pid === process.pid,
    invalidateCaches: () => { invalidations += 1; },
    api: null,
  };

  try {
    runInNewContext(
      [
        extractFunction("fsyncPrivatePath", "atomicPrivateJson"),
        extractFunction("atomicPrivateJson", "stableToken"),
        extractFunction("writeExclusivePrivateJson", "processIsAlive"),
        extractFunction("readMutationLockRecord", "inspectMutationLock"),
        extractFunction("inspectMutationLock", "acquireMutationLock"),
        extractFunction("acquireMutationLock", "releaseMutationLock"),
        extractFunction("releaseMutationLock", "readMutationEpoch"),
        extractFunction("readMutationEpoch", "advanceMutationEpoch"),
        extractFunction("advanceMutationEpoch", "captureStableMutationEpoch"),
        extractFunction("captureStableMutationEpoch", "assertMutationEpochUnchanged"),
        extractFunction("assertMutationEpochUnchanged", "accountCachePath"),
        "api = { inspectMutationLock, acquireMutationLock, releaseMutationLock, readMutationEpoch, advanceMutationEpoch, captureStableMutationEpoch, assertMutationEpochUnchanged };",
      ].join("\n"),
      sandbox,
    );

    const firstLock = sandbox.api.acquireMutationLock("operation-first");
    assert.ok(existsSync(lockPath), "acquiring the lock must create a cross-process marker");
    assert.throws(
      () => sandbox.api.acquireMutationLock("operation-second"),
      /already running/,
    );
    sandbox.api.releaseMutationLock(firstLock);
    assert.equal(existsSync(lockPath), false);

    writeFileSync(lockPath, `${JSON.stringify({
      version: 1,
      scope: "apply-batch",
      operationId: "stale-operation",
      pid: 999_999,
      nonce: randomUUID(),
      createdAt: new Date().toISOString(),
    })}\n`, { mode: 0o600 });
    chmodSync(lockPath, 0o600);
    const recovered = sandbox.api.inspectMutationLock({ recoverStale: true });
    assert.equal(recovered.recovered, true);
    assert.equal(existsSync(lockPath), false, "a verified stale marker must not block later batches");

    const interruptedRecovery = {
      version: 1,
      scope: "apply-batch",
      operationId: "live-operation",
      pid: process.pid,
      nonce: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const recoveryPath = join(privateRoot, `mutation.lock.recovery-999999-${randomUUID()}`);
    writeFileSync(recoveryPath, `${JSON.stringify(interruptedRecovery)}\n`, { mode: 0o600 });
    chmodSync(recoveryPath, 0o600);
    const restored = sandbox.api.inspectMutationLock({ recoverStale: true });
    assert.equal(restored.active, true);
    assert.equal(restored.recovering, true);
    assert.equal(existsSync(recoveryPath), false);
    assert.equal(existsSync(lockPath), true, "a live owner's recovery marker must be restored to the lock path");
    sandbox.api.releaseMutationLock(interruptedRecovery);

    assert.equal(sandbox.api.readMutationEpoch(), "initial");
    const firstEpoch = sandbox.api.advanceMutationEpoch("operation-first");
    assert.equal(sandbox.api.captureStableMutationEpoch(), firstEpoch);
    const secondEpoch = sandbox.api.advanceMutationEpoch("operation-second");
    assert.notEqual(secondEpoch, firstEpoch);
    assert.throws(
      () => sandbox.api.assertMutationEpochUnchanged(firstEpoch),
      /changed during background preparation/,
    );
    assert.equal(invalidations, 1, "an epoch conflict must invalidate process-local caches");

    const activeLock = sandbox.api.acquireMutationLock("operation-third");
    assert.throws(
      () => sandbox.api.captureStableMutationEpoch(),
      /mutation batch is running/,
    );
    sandbox.api.releaseMutationLock(activeLock);
  } finally {
    rmSync(privateRoot, { recursive: true, force: true });
  }
});

test("apply journals every transition and reports deadline, failure, and uncertainty accurately", async () => {
  function makePlan() {
    return {
      token: "plan-token",
      digest: "digest",
      expiresAt: 1_000_000,
      confirmationPhrase: "APPLY TEST",
      kind: "move",
      rollbackOf: null,
      snapshotId: "snapshot-test",
      createFolders: [],
      moves: [1, 2].map((index) => ({
        noteId: `note-${index}`,
        title: `Note ${index}`,
        account: "iCloud",
        fromFolderId: `source-${index}`,
        fromFolder: "Inbox",
        toFolderId: "destination",
        toFolder: "Archive",
      })),
    };
  }

  async function runScenario(mutate) {
    const clock = { now: 0 };
    class ControlledDate extends Date {
      constructor(value) {
        super(value === undefined ? clock.now : value);
      }
      static now() {
        return clock.now;
      }
    }
    const journals = [];
    const mutationCalls = [];
    let releases = 0;
    const pendingPlans = new Map([["plan-token", makePlan()]]);
    const sandbox = {
      APPLY_BATCH_DEADLINE_MS: 225_000,
      APPLY_CLEANUP_RESERVE_MS: 5_000,
      PublicError: FixturePublicError,
      Date: ControlledDate,
      pendingPlans,
      folderCache: null,
      CREATE_FOLDER_SCRIPT: "create-fixture",
      MOVE_NOTE_JXA: "move-fixture",
      requireObject: (value) => {
        if (!value || typeof value !== "object") throw new FixturePublicError("object required");
      },
      requiredString: (value, label) => {
        if (typeof value !== "string" || !value) throw new FixturePublicError(`${label} required`);
        return value;
      },
      loadRecentSnapshot: () => ({ notes: [] }),
      randomBytes: () => Buffer.from("deadbeef", "hex"),
      operationPath: () => "/private/operation.json",
      acquireMutationLock: (operationId) => ({ operationId, nonce: "fixture" }),
      consumeArm: () => ({ createdAt: "1970-01-01T00:00:00.000Z" }),
      advanceMutationEpoch: () => "epoch-fixture",
      persistOperation: (_path, operation) => {
        journals.push(JSON.parse(JSON.stringify(operation)));
      },
      runMutationOsa: async (...args) => {
        mutationCalls.push(args);
        return await mutate({ callIndex: mutationCalls.length - 1, clock, args });
      },
      cleanOsaError: (value) => String(value),
      displayLocalPath: (path) => path,
      invalidateCaches: () => {},
      releaseMutationLock: () => { releases += 1; },
      api: null,
    };
    runInNewContext(
      [
        extractFunction("mutationTimeoutBefore", "automationTimedOut"),
        extractFunction("automationTimedOut", "finalizeUnattempted"),
        extractFunction("finalizeUnattempted", "applyChanges"),
        extractFunction("applyChanges", "listOperations"),
        "api = { applyChanges };",
      ].join("\n"),
      sandbox,
    );
    const response = await sandbox.api.applyChanges({ planToken: "plan-token", confirmation: "APPLY TEST" });
    return { response, journals, mutationCalls, releases };
  }

  const deadline = await runScenario(async ({ clock }) => {
    clock.now = 220_000;
    return "destination";
  });
  assert.equal(deadline.mutationCalls.length, 1);
  assert.equal(deadline.mutationCalls[0][2].timeoutMs, 60_000);
  assert.equal(deadline.response.status, "partial");
  assert.equal(deadline.response.movesSucceeded, 1);
  assert.equal(deadline.response.movesNotAttempted, 1);
  assert.deepEqual(deadline.response.results.map((item) => item.status), ["succeeded", "not-attempted"]);
  assert.match(deadline.response.results[1].reason, /deadline was reached/);
  assert.deepEqual(deadline.journals[0].results.map((item) => item.status), ["not-attempted", "not-attempted"]);
  assert.ok(deadline.journals.some((entry) => entry.results[0].status === "in-progress"));
  assert.ok(deadline.journals.some((entry) => entry.results[0].status === "succeeded"));
  assert.equal(deadline.journals.at(-1).status, "partial");
  assert.equal(deadline.releases, 1);

  const timeout = await runScenario(async () => {
    throw new FixturePublicError("Apple Notes did not respond before the safety timeout.");
  });
  assert.equal(timeout.response.status, "interrupted");
  assert.equal(timeout.response.movesUncertain, 1);
  assert.equal(timeout.response.movesNotAttempted, 1);
  assert.deepEqual(timeout.response.results.map((item) => item.status), ["uncertain", "not-attempted"]);
  assert.match(timeout.response.results[1].reason, /outcome is uncertain/);
  assert.equal(timeout.journals.at(-1).status, "interrupted");

  const completed = await runScenario(async ({ callIndex }) => {
    if (callIndex === 0) throw new FixturePublicError("ordinary move failure");
    return "destination";
  });
  assert.equal(completed.response.status, "completed", "all attempted items complete even when one fails safely");
  assert.equal(completed.response.movesFailed, 1);
  assert.equal(completed.response.movesSucceeded, 1);
  assert.deepEqual(completed.response.results.map((item) => item.status), ["failed", "succeeded"]);
  assert.equal(completed.journals.at(-1).status, "completed");
});

test("complete manifests enforce both the 200-note and approximately 1 MB caps", () => {
  const makeManifest = (notes) => ({
    version: 1,
    manifestId: "manifest-fixture",
    jobId: "organization-aaaaaaaaaaaaaaaaaaaaaaaa",
    account: "iCloud",
    snapshotId: "snapshot-fixture",
    noteCount: notes.length,
    notes,
  });
  const smallManifest = makeManifest(
    Array.from({ length: 200 }, (_, index) => ({ id: `note-${index}`, title: `Note ${index}`, snippet: "short" })),
  );
  const tooManyManifest = makeManifest(
    Array.from({ length: 201 }, (_, index) => ({ id: `note-${index}`, title: `Note ${index}` })),
  );
  const oversizedManifest = makeManifest(
    Array.from({ length: 200 }, (_, index) => ({ id: `note-${index}`, snippet: "x".repeat(6_000) })),
  );
  let activeManifest = smallManifest;
  let persists = 0;
  const job = {
    jobId: "organization-aaaaaaaaaaaaaaaaaaaaaaaa",
    account: "iCloud",
    status: "ready",
    phase: "ready",
    progress: {},
    cacheStats: {},
    diagnostics: {},
    snapshotId: "snapshot-fixture",
    manifestId: "manifest-fixture",
    manifestPath: "",
    reviewCursor: 0,
    updatedAt: 0,
  };
  const sandbox = {
    MAX_COMPLETE_MANIFEST_NOTES: 200,
    MAX_COMPLETE_MANIFEST_BYTES: 1_000_000,
    PublicError: FixturePublicError,
    Buffer,
    Date,
    displayLocalPath: (path) => path,
    loadOrganizationManifest: () => activeManifest,
    getOrganizationJob: () => job,
    persistOrganizationJob: () => { persists += 1; },
    requireObject: (value) => {
      if (!value || typeof value !== "object") throw new FixturePublicError("object required");
    },
    requiredString: (value, label) => {
      if (typeof value !== "string" || !value) throw new FixturePublicError(`${label} required`);
      return value;
    },
    integer: (value, label, fallback, minimum, maximum) => {
      const parsed = value === undefined ? fallback : value;
      if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new FixturePublicError(`${label} out of bounds`);
      }
      return parsed;
    },
    api: null,
  };
  runInNewContext(
    [
      extractFunction("serializedJsonBytes", "publicOrganizationJob"),
      extractFunction("publicOrganizationJob", "getOrganizationJob"),
      extractFunction("getOrganizationManifest", "readCachedContent"),
      "api = { serializedJsonBytes, publicOrganizationJob, getOrganizationManifest };",
    ].join("\n"),
    sandbox,
  );

  const included = sandbox.api.publicOrganizationJob(job, { includeManifest: true });
  assert.equal(included.manifest.notes.length, 200);
  assert.ok(sandbox.api.serializedJsonBytes(included) < 1_000_000);

  activeManifest = tooManyManifest;
  const countOmitted = sandbox.api.publicOrganizationJob(job, { includeManifest: true });
  assert.equal(countOmitted.manifest, undefined);
  assert.equal(countOmitted.manifestOmitted, true);
  assert.equal(countOmitted.manifestNoteCount, 201);

  activeManifest = oversizedManifest;
  const bytesOmitted = sandbox.api.publicOrganizationJob(job, { includeManifest: true });
  assert.equal(bytesOmitted.manifest, undefined);
  assert.equal(bytesOmitted.manifestOmitted, true);
  assert.ok(sandbox.api.serializedJsonBytes({ manifest: oversizedManifest }) > 1_000_000);

  assert.throws(
    () => sandbox.api.getOrganizationManifest({ jobId: job.jobId, mode: "complete" }),
    /exceeds the approximately 1 MB response limit/,
  );
  assert.equal(job.reviewCursor, 0, "an oversized response must not advance the persistent cursor");
  assert.equal(persists, 0, "an oversized response must not persist cursor progress");

  activeManifest = smallManifest;
  const complete = sandbox.api.getOrganizationManifest({ jobId: job.jobId, mode: "complete" });
  assert.equal(complete.returned, 200);
  assert.equal(complete.complete, true);
  assert.equal(job.reviewCursor, 200);
  assert.equal(persists, 1);

  activeManifest = tooManyManifest;
  job.reviewCursor = 0;
  const page = sandbox.api.getOrganizationManifest({ jobId: job.jobId, mode: "next", pageSize: 200 });
  assert.equal(page.returned, 200);
  assert.equal(page.remaining, 1);
  assert.equal(job.reviewCursor, 200);
});

test("snapshot body reads cap fields, note counts, chunk size, and concurrency", async () => {
  const fullBodyHtml = "h".repeat(70_000);
  const fullPlaintext = "p".repeat(80_000);
  const fixtureNote = {
    exists: () => true,
    body: () => fullBodyHtml,
    plaintext: () => fullPlaintext,
  };
  const scriptSandbox = {
    Application: () => ({ notes: { byId: () => fixtureNote } }),
    result: "",
  };
  runInNewContext(
    `${extractScript("READ_NOTES_JXA")}\nresult = run(["999999", "note-long"]);`,
    scriptSandbox,
  );
  const [bounded] = JSON.parse(scriptSandbox.result);
  assert.equal(bounded.bodyHtml.length, 50_000);
  assert.equal(bounded.plaintext.length, 50_000);
  assert.equal(bounded.bodyHtmlOriginalCharacters, 70_000);
  assert.equal(bounded.plaintextOriginalCharacters, 80_000);
  assert.equal(bounded.truncated, true);

  const automationCalls = [];
  const concurrencyRequests = [];
  const sandbox = {
    MAX_CONTENT_SNAPSHOT_NOTES: 100,
    MAX_CONTENT_SNAPSHOT_CHARS_PER_FIELD: 50_000,
    READ_NOTES_JXA: "read-notes-fixture",
    PublicError: FixturePublicError,
    mapLimit: async (items, concurrency, worker) => {
      concurrencyRequests.push({ items: items.length, concurrency });
      return await Promise.all(items.map(worker));
    },
    runOsa: async (_script, args, options) => {
      automationCalls.push({ args, options });
      return JSON.stringify(args.slice(1).map((id) => ({ id, ok: true, plaintext: "fixture" })));
    },
    api: null,
  };
  runInNewContext(
    `${extractFunction("readBodies", "readTexts")}\napi = { readBodies };`,
    sandbox,
  );

  await assert.rejects(
    sandbox.api.readBodies(Array.from({ length: 101 }, (_, index) => `note-${index}`)),
    /limited to 100 readable notes/,
  );
  assert.equal(automationCalls.length, 0, "an oversized request must fail before Apple Notes automation");

  const bodies = await sandbox.api.readBodies(Array.from({ length: 100 }, (_, index) => `note-${index}`));
  assert.equal(bodies.length, 100);
  assert.deepEqual(concurrencyRequests, [{ items: 4, concurrency: 2 }]);
  assert.equal(automationCalls.length, 4);
  assert.ok(automationCalls.every((call) => call.args[0] === "50000" && call.args.length === 26));
  assert.ok(automationCalls.every((call) => call.options.timeoutMs === 180_000));
});

test("adaptive organization reads stream bounded batches without retaining a full-library result", async () => {
  const readCalls = [];
  const callbackBatchSizes = [];
  let persisted = 0;
  let epochChecks = 0;
  const sandbox = {
    MAX_READ_BATCH: 50,
    Date,
    assertMutationEpochUnchanged: () => { epochChecks += 1; },
    mapLimit: async (items, _concurrency, worker) => await Promise.all(items.map(worker)),
    readTexts: async (ids, maxChars) => {
      readCalls.push({ ids: [...ids], maxChars });
      return ids.map((id) => ({ id, ok: true, plaintext: "fixture" }));
    },
    persistOrganizationJob: () => { persisted += 1; },
    api: null,
  };
  runInNewContext(
    `${extractFunction("readAdaptiveContent", "runOrganizationJob")}\napi = { readAdaptiveContent };`,
    sandbox,
  );
  const job = { diagnostics: { contentBatches: [] }, progress: {}, updatedAt: 0 };
  const result = await sandbox.api.readAdaptiveContent(
    Array.from({ length: 250 }, (_, index) => `note-${index}`),
    12_000,
    job,
    "epoch-fixture",
    async (batch) => { callbackBatchSizes.push(batch.length); },
  );

  assert.equal(result.processed, 250);
  assert.deepEqual(Object.keys(result), ["processed"]);
  assert.deepEqual(callbackBatchSizes, [100, 100, 50]);
  assert.equal(readCalls.length, 5);
  assert.ok(readCalls.every((call) => call.ids.length <= 50 && call.maxChars === 12_000));
  assert.equal(Math.max(...job.diagnostics.contentBatches.map((batch) => batch.returned)), 100);
  assert.equal(persisted, 3);
  assert.equal(epochChecks, 9);
});

test("content search obeys independent 500-note and 10-million-character limits", async () => {
  const notes = Array.from({ length: 600 }, (_, index) => ({
    id: `note-${index}`,
    title: `Title ${index}`,
    locked: false,
  }));
  let bodyText = "x".repeat(50_000);
  let calls = [];
  const sandbox = {
    MAX_CONTENT_SEARCH_NOTES: 500,
    MAX_CONTENT_SEARCH_CHARACTERS: 10_000_000,
    MAX_CONTENT_SEARCH_CHARS_PER_NOTE: 50_000,
    MAX_READ_BATCH: 50,
    PublicError: FixturePublicError,
    requireObject: (value) => {
      if (!value || typeof value !== "object") throw new FixturePublicError("object required");
    },
    requiredString: (value, label) => {
      if (typeof value !== "string" || !value) throw new FixturePublicError(`${label} required`);
      return value;
    },
    integer: (value, _label, fallback, minimum, maximum) => {
      const parsed = value === undefined ? fallback : value;
      if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new FixturePublicError("invalid integer");
      return parsed;
    },
    inventoryAll: async () => notes,
    readTexts: async (ids, maxChars) => {
      calls.push({ ids: [...ids], maxChars });
      return ids.map((id) => ({ id, ok: true, plaintext: bodyText, truncated: false }));
    },
    api: null,
  };
  runInNewContext(
    `${extractFunction("callTool", "successToolResult")}\napi = { callTool };`,
    sandbox,
  );

  const characterBound = await sandbox.api.callTool("personal_notes_search", {
    query: "needle-not-present",
    scope: "title-and-content",
    limit: 100,
  });
  assert.equal(characterBound.contentCandidatesScanned, 200);
  assert.equal(characterBound.contentCharactersScanned, 10_000_000);
  assert.equal(characterBound.contentSearchTruncated, true);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.ids.length <= 50 && call.maxChars === 50_000));

  bodyText = "x";
  calls = [];
  const noteBound = await sandbox.api.callTool("personal_notes_search", {
    query: "needle-not-present",
    scope: "title-and-content",
    limit: 100,
  });
  assert.equal(noteBound.contentCandidatesScanned, 500);
  assert.equal(noteBound.contentCharactersScanned, 500);
  assert.equal(noteBound.contentSearchTruncated, true);
  assert.equal(calls.length, 10);
  assert.ok(calls.every((call) => call.ids.length === 50));
});

test("portable MCP smoke test never contacts Apple Notes", () => {
  const isolatedHome = mkdtempSync(join(tmpdir(), "guarded-notes-portable-home-"));
  const requests = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "portable-test", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "ping" },
    { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "personal_notes_safety", arguments: {} } },
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "personal_notes_apply_changes", arguments: { planToken: "invalid", confirmation: "invalid" } } },
    { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "unknown_tool", arguments: {} } },
    { jsonrpc: "2.0", id: 7, method: "unknown/method", params: {} },
  ];
  try {
    const result = spawnSync(process.execPath, [serverPath], {
      cwd: pluginRoot,
      env: {
        ...process.env,
        HOME: isolatedHome,
        TMPDIR: isolatedHome,
      },
      input: `${requests.map((request) => JSON.stringify(request)).join("\n")}\n{malformed-json\n`,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      shell: false,
      timeout: 20_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(responses.length, 8, "notifications must not receive a response");

    const initialize = responses.find((response) => response.id === 1)?.result;
    assert.equal(initialize?.serverInfo?.name, "guarded-notes-mcp");
    assert.equal(initialize?.serverInfo?.version, "1.0.0");
    assert.deepEqual(responses.find((response) => response.id === 2)?.result, {});

    const tools = responses.find((response) => response.id === 3)?.result?.tools;
    assert.ok(Array.isArray(tools));
    assert.equal(tools.length, 20);
    assert.equal(new Set(tools.map((tool) => tool.name)).size, tools.length, "tool names must be unique");
    for (const tool of tools) {
      assert.match(tool.name, /^personal_notes_[a-z0-9_]+$/);
      assert.ok(tool.description.length > 0);
      assert.equal(tool.inputSchema?.type, "object");
      assert.equal(tool.inputSchema?.additionalProperties, false);
      for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
        assert.equal(typeof tool.annotations?.[hint], "boolean", `${tool.name} is missing ${hint}`);
      }
      assert.equal(tool.annotations.openWorldHint, false, `${tool.name} must remain closed-world`);
    }
    const destructive = tools.filter((tool) => tool.annotations.destructiveHint).map((tool) => tool.name);
    assert.deepEqual(destructive, ["personal_notes_apply_changes"]);
    assert.ok(!tools.some((tool) => /delete|update.*content/i.test(tool.name)));

    const safety = responses.find((response) => response.id === 4)?.result?.structuredContent;
    assert.equal(safety?.localOnly, true);
    assert.equal(safety?.networkCode, false);
    assert.equal(safety?.dependencies, 0);
    assert.equal(safety?.fullDiskAccessRequired, false);
    assert.equal(safety?.privateStorage, "~/Library/Application Support/Guarded Notes MCP");
    assert.ok(!safety?.privateStorage.includes(isolatedHome), "public status must redact the absolute home path");
    assert.equal(responses.find((response) => response.id === 5)?.result?.isError, true);
    assert.equal(responses.find((response) => response.id === 6)?.result?.isError, true);
    assert.equal(responses.find((response) => response.id === 7)?.error?.code, -32601);
    assert.equal(responses.find((response) => response.id === null)?.error?.code, -32700);

    assert.equal(
      existsSync(join(isolatedHome, "Library", "Application Support", "Guarded Notes MCP")),
      false,
      "read-only smoke calls must not create persistent state",
    );
  } finally {
    rmSync(isolatedHome, { recursive: true, force: true });
  }
});
