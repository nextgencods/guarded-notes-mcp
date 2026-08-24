#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 nextgencods

import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const armFile = join(homedir(), "Library", "Application Support", "Guarded Notes MCP", "move-arm.json");
if (existsSync(armFile)) {
  unlinkSync(armFile);
  console.log("Guarded Notes MCP move authorization removed.");
} else {
  console.log("Guarded Notes MCP was already disarmed.");
}
