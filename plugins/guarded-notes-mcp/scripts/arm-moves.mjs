#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 nextgencods

import { randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const APP_DIR = join(homedir(), "Library", "Application Support", "Guarded Notes MCP");
const ARM_FILE = join(APP_DIR, "move-arm.json");
const lifetimeMinutes = 10;
let planToken = String(process.argv[2] || "");
let planDigest = String(process.argv[3] || "");

if (!input.isTTY || !output.isTTY) {
  console.error("Safety refusal: this command must be run interactively in a Terminal window.");
  process.exit(1);
}

const rl = createInterface({ input, output });
if (!planToken && !planDigest) {
  planToken = String(await rl.question("Paste the exact plan token: ")).trim();
  planDigest = String(await rl.question("Paste the exact 64-character plan digest: ")).trim();
}
if (!/^[A-Za-z0-9_-]{32}$/.test(planToken) || !/^[a-f0-9]{64}$/.test(planDigest)) {
  console.error("Usage: node arm-moves.mjs <plan-token> <64-character-plan-digest>");
  console.error("Create a fresh plan and copy the exact command returned by the plugin.");
  rl.close();
  process.exit(1);
}

console.log("\nGuarded Notes MCP — one-use move authorization\n");
console.log("This enables exactly one reviewed move/rollback batch for 10 minutes.");
console.log("It does not enable deletion or editing; those capabilities do not exist.\n");
console.log(`Plan digest: ${planDigest}`);
console.log("Compare this digest with the reviewed plan before continuing.\n");

const answer = await rl.question("Type the plan's exact confirmation phrase to continue: ");
rl.close();

const digestCode = planDigest.slice(0, 12).toUpperCase();
const confirmationPattern = new RegExp(`^(?:APPLY|ROLLBACK) \\d+ MOVES \\+ \\d+ FOLDERS \\[${digestCode}\\]$`);
if (!confirmationPattern.test(answer)) {
  console.error("Not armed. Nothing changed.");
  process.exit(1);
}

mkdirSync(APP_DIR, { recursive: true, mode: 0o700 });
const before = lstatSync(APP_DIR);
if (
  !before.isDirectory() ||
  before.isSymbolicLink() ||
  (typeof process.getuid === "function" && before.uid !== process.getuid())
) {
  console.error("Safety refusal: private storage is not a secure owner-only directory.");
  process.exit(1);
}
chmodSync(APP_DIR, 0o700);
const after = lstatSync(APP_DIR);
if ((after.mode & 0o077) !== 0) {
  console.error("Safety refusal: private storage permissions could not be restricted to the current user.");
  process.exit(1);
}
const now = Date.now();
const payload = {
  version: 1,
  scope: "move-notes",
  oneUse: true,
  planToken,
  planDigest,
  confirmation: answer,
  createdAt: new Date(now).toISOString(),
  expiresAt: now + lifetimeMinutes * 60_000,
  nonce: randomUUID(),
};
const temp = `${ARM_FILE}.tmp-${process.pid}-${randomUUID()}`;
let renamed = false;
try {
  writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(temp, 0o600);
  renameSync(temp, ARM_FILE);
  renamed = true;
} finally {
  if (!renamed) {
    try { unlinkSync(temp); } catch {}
  }
}

console.log(`\nArmed for one batch until ${new Date(payload.expiresAt).toLocaleString()}.`);
console.log("Closing the Terminal window does not extend the expiry.\n");
