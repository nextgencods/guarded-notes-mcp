#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 nextgencods

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = dirname(dirname(SCRIPT_PATH));
const PLUGIN_NAME = "guarded-notes-mcp";
const DISPLAY_NAME = "Guarded Notes MCP";
const OWNER = "nextgencods";
const LICENSE = "MIT";
const REPOSITORY_URL = `https://github.com/${OWNER}/${PLUGIN_NAME}`;
const PLUGIN_RELATIVE_PATH = `plugins/${PLUGIN_NAME}`;
const STRICT_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PLUGIN_IDENTIFIER = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const TEXT_EXTENSIONS = new Set([
  ".cff",
  ".json",
  ".md",
  ".mjs",
  ".txt",
  ".yaml",
  ".yml",
]);
const SKIPPED_DIRECTORIES = new Set([".git", "coverage", "dist", "node_modules"]);
const RUNTIME_STATE_DIRECTORIES = new Set([
  "Cache",
  "Content",
  "Jobs",
  "Manifests",
  "Operations",
  "Snapshots",
]);

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function unknownKeys(value, allowed, label, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) errors.push(`${label} contains unsupported field ${JSON.stringify(key)}.`);
  }
}

function readText(path, label, errors) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    errors.push(`${label} is missing or unreadable: ${error.message}`);
    return null;
  }
}

function readJson(path, label, errors) {
  const source = readText(path, label, errors);
  if (source === null) return null;
  try {
    const value = JSON.parse(source);
    if (!isObject(value)) {
      errors.push(`${label} must contain a JSON object.`);
      return null;
    }
    return value;
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function isHttpsUrl(value) {
  if (!nonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function arraysEqual(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function sameStringSet(actual, expected) {
  return Array.isArray(actual)
    && actual.every(nonEmptyString)
    && new Set(actual).size === actual.length
    && actual.length === expected.length
    && expected.every((value) => actual.includes(value));
}

function validateRelativeFile(root, rawPath, label, errors, { prefixRequired = true } = {}) {
  add(errors, nonEmptyString(rawPath), `${label} must be a non-empty relative path.`);
  if (!nonEmptyString(rawPath)) return null;
  if (prefixRequired) add(errors, rawPath.startsWith("./"), `${label} must begin with "./".`);
  const portable = rawPath.replaceAll("\\", "/");
  const parts = portable.split("/");
  add(
    errors,
    !isAbsolute(rawPath) && !parts.includes("..") && !parts.includes(""),
    `${label} must stay inside the repository.`,
  );
  const resolved = resolve(root, portable);
  const relativePath = relative(root, resolved);
  if (relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
    errors.push(`${label} resolves outside the repository.`);
    return null;
  }
  add(errors, existsSync(resolved) && lstatSync(resolved).isFile(), `${label} points to a missing file.`);
  return resolved;
}

function walk(root, current = root, files = [], directories = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      files.push({ path, symbolicLink: true });
    } else if (entry.isDirectory()) {
      directories.push(path);
      walk(root, path, files, directories);
    } else if (entry.isFile()) {
      files.push({ path, symbolicLink: false });
    }
  }
  return { files, directories };
}

function parseStringConstant(source, name) {
  const match = new RegExp(`const\\s+${name}\\s*=\\s*(["'])(.*?)\\1\\s*;`).exec(source);
  return match?.[2] ?? null;
}

function citationValue(source, key) {
  const match = new RegExp(`^${key}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, "m").exec(source);
  return match?.[1]?.trim() ?? null;
}

function validatePackage(root, errors) {
  const path = join(root, "package.json");
  const packageJson = readJson(path, "package.json", errors);
  if (!packageJson) return null;

  add(errors, packageJson.name === `${PLUGIN_NAME}-repository`, "package.json name must identify the Guarded Notes MCP repository.");
  add(errors, STRICT_SEMVER.test(packageJson.version ?? ""), "package.json version must be strict semantic versioning.");
  add(errors, packageJson.private === true, "package.json must remain private to prevent accidental npm publication.");
  add(errors, packageJson.type === "module", "package.json type must be module.");
  add(errors, packageJson.license === LICENSE, `package.json license must be ${LICENSE}.`);
  add(errors, packageJson.author === OWNER, `package.json author must be ${OWNER}.`);
  add(errors, packageJson.engines?.node === ">=22", "package.json must require Node.js >=22.");
  add(errors, packageJson.repository?.url === `git+${REPOSITORY_URL}.git`, "package.json repository URL is incorrect.");

  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const value = packageJson[field];
    add(errors, value === undefined || (isObject(value) && Object.keys(value).length === 0), `package.json ${field} must remain empty.`);
  }
  add(errors, packageJson.bundledDependencies === undefined, "package.json must not bundle dependencies.");

  for (const script of ["check", "test", "validate", "ci"]) {
    add(errors, nonEmptyString(packageJson.scripts?.[script]), `package.json scripts.${script} is required.`);
  }
  return packageJson;
}

function validatePluginManifest(root, errors) {
  const pluginRoot = join(root, PLUGIN_RELATIVE_PATH);
  const manifestPath = join(pluginRoot, ".codex-plugin", "plugin.json");
  const manifest = readJson(manifestPath, "plugin manifest", errors);
  if (!manifest) return null;

  unknownKeys(
    manifest,
    new Set([
      "id",
      "name",
      "version",
      "description",
      "skills",
      "apps",
      "mcpServers",
      "interface",
      "author",
      "homepage",
      "repository",
      "license",
      "keywords",
    ]),
    "plugin manifest",
    errors,
  );
  add(errors, PLUGIN_IDENTIFIER.test(manifest.name ?? ""), "plugin manifest name is not a valid plugin identifier.");
  add(errors, manifest.name === PLUGIN_NAME, `plugin manifest name must be ${PLUGIN_NAME}.`);
  add(errors, basename(pluginRoot) === manifest.name, "plugin directory and manifest names must match.");
  add(errors, STRICT_SEMVER.test(manifest.version ?? ""), "plugin manifest version must be strict semantic versioning.");
  add(errors, nonEmptyString(manifest.description), "plugin manifest description is required.");
  add(errors, manifest.license === LICENSE, `plugin manifest license must be ${LICENSE}.`);
  add(errors, manifest.homepage === `${REPOSITORY_URL}#readme`, "plugin manifest homepage is incorrect.");
  add(errors, manifest.repository === REPOSITORY_URL, "plugin manifest repository URL is incorrect.");

  add(errors, isObject(manifest.author), "plugin manifest author must be an object.");
  if (isObject(manifest.author)) {
    unknownKeys(manifest.author, new Set(["name", "email", "url"]), "plugin manifest author", errors);
    add(errors, manifest.author.name === OWNER, `plugin manifest author.name must be ${OWNER}.`);
    add(errors, manifest.author.url === `https://github.com/${OWNER}`, "plugin manifest author.url is incorrect.");
    if (manifest.author.email !== undefined) add(errors, nonEmptyString(manifest.author.email), "plugin manifest author.email must be non-empty.");
  }

  add(errors, Array.isArray(manifest.keywords) && manifest.keywords.length > 0, "plugin manifest keywords are required.");
  if (Array.isArray(manifest.keywords)) {
    add(errors, manifest.keywords.every(nonEmptyString), "plugin manifest keywords must be non-empty strings.");
    add(errors, new Set(manifest.keywords).size === manifest.keywords.length, "plugin manifest keywords must be unique.");
    for (const keyword of ["apple-notes", "mcp", "macos", "safety"]) {
      add(errors, manifest.keywords.includes(keyword), `plugin manifest keywords must include ${keyword}.`);
    }
  }

  add(errors, manifest.mcpServers === "./.mcp.json", "plugin manifest mcpServers must be ./.mcp.json.");
  validateRelativeFile(pluginRoot, manifest.mcpServers, "plugin manifest mcpServers", errors);
  if (manifest.skills !== undefined) validateRelativeFile(pluginRoot, manifest.skills, "plugin manifest skills", errors);
  if (manifest.apps !== undefined) validateRelativeFile(pluginRoot, manifest.apps, "plugin manifest apps", errors);

  const ui = manifest.interface;
  add(errors, isObject(ui), "plugin manifest interface must be an object.");
  if (!isObject(ui)) return manifest;
  unknownKeys(
    ui,
    new Set([
      "displayName",
      "shortDescription",
      "longDescription",
      "developerName",
      "category",
      "capabilities",
      "websiteURL",
      "privacyPolicyURL",
      "termsOfServiceURL",
      "brandColor",
      "composerIcon",
      "logo",
      "logoDark",
      "screenshots",
      "defaultPrompt",
      "default_prompt",
    ]),
    "plugin manifest interface",
    errors,
  );
  add(errors, ui.displayName === DISPLAY_NAME, `interface.displayName must be ${DISPLAY_NAME}.`);
  for (const field of ["shortDescription", "longDescription", "category"]) {
    add(errors, nonEmptyString(ui[field]), `interface.${field} is required.`);
  }
  add(errors, ui.developerName === OWNER, `interface.developerName must be ${OWNER}.`);
  add(errors, Array.isArray(ui.capabilities) && ui.capabilities.every(nonEmptyString), "interface.capabilities must be an array of non-empty strings.");
  if (Array.isArray(ui.capabilities)) {
    add(errors, new Set(ui.capabilities).size === ui.capabilities.length, "interface.capabilities must be unique.");
  }
  const prompts = ui.defaultPrompt ?? ui.default_prompt;
  add(errors, Array.isArray(prompts) && prompts.length >= 1 && prompts.length <= 3, "interface.defaultPrompt must contain one to three prompts.");
  if (Array.isArray(prompts)) {
    add(errors, prompts.every((prompt) => nonEmptyString(prompt) && prompt.length <= 128), "Each default prompt must be non-empty and at most 128 characters.");
  }
  add(errors, ui.brandColor === undefined || HEX_COLOR.test(ui.brandColor), "interface.brandColor must use #RRGGBB.");
  for (const field of ["websiteURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    if (ui[field] !== undefined) add(errors, isHttpsUrl(ui[field]), `interface.${field} must be an absolute HTTPS URL.`);
  }
  add(errors, ui.websiteURL === REPOSITORY_URL, "interface.websiteURL is incorrect.");
  add(errors, ui.privacyPolicyURL === `${REPOSITORY_URL}/blob/main/PRIVACY.md`, "interface.privacyPolicyURL is incorrect.");
  for (const field of ["composerIcon", "logo", "logoDark"]) {
    if (ui[field] !== undefined) validateRelativeFile(pluginRoot, ui[field], `interface.${field}`, errors);
  }
  if (ui.screenshots !== undefined) {
    add(errors, Array.isArray(ui.screenshots), "interface.screenshots must be an array.");
    if (Array.isArray(ui.screenshots)) {
      for (const [index, path] of ui.screenshots.entries()) {
        add(errors, typeof path === "string" && /^\.\/assets\/[^/]+\.png$/i.test(path), `interface.screenshots[${index}] must be a PNG under ./assets/.`);
        validateRelativeFile(pluginRoot, path, `interface.screenshots[${index}]`, errors);
      }
    }
  }
  return manifest;
}

function validateMcpManifest(root, errors) {
  const path = join(root, PLUGIN_RELATIVE_PATH, ".mcp.json");
  const mcp = readJson(path, ".mcp.json", errors);
  if (!mcp) return;
  unknownKeys(mcp, new Set(["mcpServers"]), ".mcp.json", errors);
  add(errors, isObject(mcp.mcpServers), ".mcp.json mcpServers must be an object.");
  if (!isObject(mcp.mcpServers)) return;
  add(errors, arraysEqual(Object.keys(mcp.mcpServers), [PLUGIN_NAME]), `.mcp.json must define only ${PLUGIN_NAME}.`);
  const server = mcp.mcpServers[PLUGIN_NAME];
  add(errors, isObject(server), `${PLUGIN_NAME} MCP configuration must be an object.`);
  if (!isObject(server)) return;
  unknownKeys(
    server,
    new Set(["command", "args", "cwd", "env_vars", "startup_timeout_sec", "tool_timeout_sec"]),
    `${PLUGIN_NAME} MCP configuration`,
    errors,
  );
  add(errors, server.command === "node", "MCP command must use portable PATH resolution: node.");
  add(errors, arraysEqual(server.args, ["./server.mjs"]), "MCP args must contain only ./server.mjs.");
  add(errors, server.cwd === ".", "MCP cwd must be the plugin root.");
  add(errors, sameStringSet(server.env_vars, ["HOME", "PATH", "TMPDIR"]), "MCP env_vars must contain HOME, PATH, and TMPDIR exactly once.");
  add(errors, Number.isInteger(server.startup_timeout_sec) && server.startup_timeout_sec > 0, "MCP startup_timeout_sec must be a positive integer.");
  add(errors, Number.isInteger(server.tool_timeout_sec) && server.tool_timeout_sec >= 60, "MCP tool_timeout_sec must be an integer of at least 60 seconds.");
}

function validateMarketplace(root, errors) {
  const marketplace = readJson(join(root, ".agents", "plugins", "marketplace.json"), "marketplace.json", errors);
  if (!marketplace) return;
  unknownKeys(marketplace, new Set(["name", "interface", "plugins"]), "marketplace.json", errors);
  add(errors, marketplace.name === OWNER, `marketplace name must be ${OWNER}.`);
  add(errors, marketplace.interface?.displayName === OWNER, `marketplace displayName must be ${OWNER}.`);
  add(errors, Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1, "marketplace must contain exactly one plugin.");
  const plugin = marketplace.plugins?.[0];
  if (!isObject(plugin)) return;
  unknownKeys(plugin, new Set(["name", "source", "policy", "category"]), "marketplace plugin", errors);
  add(errors, plugin.name === PLUGIN_NAME, `marketplace plugin name must be ${PLUGIN_NAME}.`);
  add(errors, plugin.source?.source === "local", "marketplace plugin source must be local.");
  add(errors, plugin.source?.path === `./${PLUGIN_RELATIVE_PATH}`, "marketplace plugin path is incorrect.");
  add(errors, plugin.policy?.installation === "AVAILABLE", "marketplace installation policy must be AVAILABLE.");
  add(errors, plugin.policy?.authentication === "ON_INSTALL", "marketplace authentication policy must be ON_INSTALL.");
  add(errors, nonEmptyString(plugin.category), "marketplace plugin category is required.");
}

function validateServer(root, packageJson, manifest, errors) {
  const pluginRoot = join(root, PLUGIN_RELATIVE_PATH);
  const serverPath = join(pluginRoot, "server.mjs");
  const server = readText(serverPath, "server.mjs", errors);
  if (server === null) return;
  const serverName = parseStringConstant(server, "SERVER_NAME");
  const serverVersion = parseStringConstant(server, "SERVER_VERSION");
  add(errors, serverName === PLUGIN_NAME, `SERVER_NAME must be ${PLUGIN_NAME}.`);
  if (packageJson && manifest) {
    add(errors, packageJson.version === manifest.version, "package.json and plugin manifest versions must match.");
    add(errors, serverVersion === manifest.version, "SERVER_VERSION and plugin manifest versions must match.");
  }
  add(errors, parseStringConstant(server, "OSASCRIPT") === "/usr/bin/osascript", "OSASCRIPT must remain pinned to /usr/bin/osascript.");
  add(errors, server.includes("spawn(OSASCRIPT,"), "Apple automation must be launched through the pinned OSASCRIPT constant.");
  add(errors, !server.includes("shell: true"), "Runtime child processes must never enable a shell.");
  add(errors, !/\bfetch\s*\(/.test(server), "Runtime server must not call fetch().");
  add(errors, !/\b(?:WebSocket|EventSource)\s*\(/.test(server), "Runtime server must not open web connections.");
  for (const moduleName of ["http", "https", "http2", "net", "tls", "dgram", "dns"]) {
    add(errors, !server.includes(`node:${moduleName}`), `Runtime server must not import node:${moduleName}.`);
  }
}

function validateCitationAndLicense(root, packageJson, errors) {
  const citation = readText(join(root, "CITATION.cff"), "CITATION.cff", errors);
  if (citation !== null && packageJson) {
    add(errors, citationValue(citation, "title") === DISPLAY_NAME, `CITATION.cff title must be ${DISPLAY_NAME}.`);
    add(errors, citationValue(citation, "version") === packageJson.version, "CITATION.cff version must match package.json.");
    add(errors, citationValue(citation, "repository-code") === REPOSITORY_URL, "CITATION.cff repository-code is incorrect.");
    add(errors, citationValue(citation, "license") === LICENSE, `CITATION.cff license must be ${LICENSE}.`);
    add(errors, /(?:^|\n)\s*- alias:\s*nextgencods\s*(?:\n|$)/.test(citation), `CITATION.cff must credit ${OWNER}.`);
  }

  const license = readText(join(root, "LICENSE"), "LICENSE", errors);
  if (license !== null) {
    add(errors, license.startsWith("MIT License\n"), "LICENSE must contain the MIT License.");
    add(errors, license.includes(`Copyright (c) 2026 ${OWNER}`), `LICENSE must credit ${OWNER}.`);
    add(errors, license.includes("Permission is hereby granted, free of charge"), "LICENSE is missing the MIT permission grant.");
  }
}

function validateChecksums(root, errors) {
  const pluginRoot = join(root, PLUGIN_RELATIVE_PATH);
  const checksumPath = join(pluginRoot, "SHA256SUMS");
  // Source-file hashes are optional. Release artifacts always receive a fresh
  // SHA256SUMS.txt in release.yml, which avoids committing perpetually stale
  // digests while the source is under active development.
  if (!existsSync(checksumPath)) return;
  const contents = readText(checksumPath, "plugin SHA256SUMS", errors);
  if (contents === null) return;
  const lines = contents.split(/\r?\n/).filter(Boolean);
  add(errors, lines.length > 0, "plugin SHA256SUMS must not be empty.");
  const seen = new Set();
  for (const [index, line] of lines.entries()) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) {
      errors.push(`plugin SHA256SUMS line ${index + 1} is malformed.`);
      continue;
    }
    const [, expected, rawPath] = match;
    add(errors, !seen.has(rawPath), `plugin SHA256SUMS contains duplicate path ${rawPath}.`);
    seen.add(rawPath);
    const resolved = validateRelativeFile(pluginRoot, rawPath, `plugin SHA256SUMS path ${rawPath}`, errors, { prefixRequired: false });
    if (!resolved) continue;
    const actual = createHash("sha256").update(readFileSync(resolved)).digest("hex");
    add(errors, actual === expected, `plugin SHA256SUMS digest is stale for ${rawPath}.`);
  }
}

function validateRepositoryHygiene(root, errors) {
  const requiredFiles = [
    ".agents/plugins/marketplace.json",
    ".editorconfig",
    ".gitattributes",
    ".gitignore",
    "AUTHORS.md",
    "CITATION.cff",
    "LICENSE",
    "NOTICE",
    "PRIVACY.md",
    "README.md",
    "SECURITY.md",
    "package.json",
    `${PLUGIN_RELATIVE_PATH}/.codex-plugin/plugin.json`,
    `${PLUGIN_RELATIVE_PATH}/.mcp.json`,
    `${PLUGIN_RELATIVE_PATH}/LICENSE`,
    `${PLUGIN_RELATIVE_PATH}/README.md`,
    `${PLUGIN_RELATIVE_PATH}/SECURITY.md`,
    `${PLUGIN_RELATIVE_PATH}/server.mjs`,
  ];
  for (const rawPath of requiredFiles) {
    add(errors, existsSync(join(root, rawPath)) && lstatSync(join(root, rawPath)).isFile(), `Required repository file is missing: ${rawPath}.`);
  }

  const { files, directories } = walk(root);
  for (const directory of directories) {
    if (RUNTIME_STATE_DIRECTORIES.has(basename(directory))) {
      errors.push(`Runtime Notes data directory must not be committed: ${relative(root, directory)}.`);
    }
  }
  for (const entry of files) {
    const relativePath = relative(root, entry.path).replaceAll(sep, "/");
    if (entry.symbolicLink) {
      errors.push(`Symbolic links are not allowed in the public archive: ${relativePath}.`);
      continue;
    }
    const name = basename(entry.path);
    if (
      name === ".DS_Store"
      || name === "move-arm.json"
      || name === "mutation.lock"
      || name === "mutation-epoch.json"
      || name.startsWith("mutation.lock.recovery-")
      || name.includes(".consumed-")
    ) {
      errors.push(`Private/generated file must not be committed: ${relativePath}.`);
    }
    if (name.startsWith(".env") && name !== ".env.example") {
      errors.push(`Environment file must not be committed: ${relativePath}.`);
    }
    if (!TEXT_EXTENSIONS.has(name.slice(name.lastIndexOf(".")))) continue;
    const source = readFileSync(entry.path, "utf8");
    if (name.endsWith(".mjs")) {
      add(errors, source.includes("// SPDX-License-Identifier: MIT"), `SPDX license header missing from ${relativePath}.`);
      add(errors, source.includes(`// Copyright (c) 2026 ${OWNER}`), `Copyright header missing from ${relativePath}.`);
    }
    if (relativePath === "scripts/validate-repository.mjs") continue;
    if (/\/Users\/[A-Za-z0-9._-]+\//.test(source) || /[A-Za-z]:\\Users\\[^\\\s]+\\/i.test(source)) {
      errors.push(`Personal absolute home path found in ${relativePath}.`);
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) {
      errors.push(`Private key material found in ${relativePath}.`);
    }
    if (/\bAKIA[0-9A-Z]{16}\b/.test(source) || /\bghp_[A-Za-z0-9]{30,}\b/.test(source)) {
      errors.push(`Credential-like token found in ${relativePath}.`);
    }
  }
}

function validateSyntax(root, errors) {
  const { files } = walk(root);
  for (const entry of files.filter((item) => !item.symbolicLink && item.path.endsWith(".mjs"))) {
    const result = spawnSync(process.execPath, ["--check", entry.path], {
      encoding: "utf8",
      shell: false,
      timeout: 20_000,
    });
    if (result.status !== 0) {
      const detail = String(result.stderr || result.stdout).trim().replaceAll(root, ".");
      errors.push(`JavaScript syntax check failed for ${relative(root, entry.path)}: ${detail}`);
    }
  }
}

export function validateReleaseTag(tag, version) {
  const errors = [];
  if (!nonEmptyString(tag) || !/^v.+/.test(tag)) {
    errors.push("Release tag must begin with v.");
    return errors;
  }
  const tagVersion = tag.slice(1);
  if (!STRICT_SEMVER.test(tagVersion)) errors.push("Release tag must be v followed by strict semantic versioning.");
  if (tagVersion !== version) errors.push(`Release tag ${tag} does not match repository version ${version}.`);
  return errors;
}

export function validateRepository({ root = DEFAULT_ROOT, tag = "" } = {}) {
  const resolvedRoot = resolve(root);
  const errors = [];
  const packageJson = validatePackage(resolvedRoot, errors);
  const manifest = validatePluginManifest(resolvedRoot, errors);
  validateMcpManifest(resolvedRoot, errors);
  validateMarketplace(resolvedRoot, errors);
  validateServer(resolvedRoot, packageJson, manifest, errors);
  validateCitationAndLicense(resolvedRoot, packageJson, errors);
  validateChecksums(resolvedRoot, errors);
  validateRepositoryHygiene(resolvedRoot, errors);
  validateSyntax(resolvedRoot, errors);
  if (tag) errors.push(...validateReleaseTag(tag, manifest?.version ?? packageJson?.version ?? ""));
  return errors;
}

function parseArguments(argv) {
  let tag = "";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--tag" || !argv[index + 1] || tag) {
      throw new Error("Usage: node scripts/validate-repository.mjs [--tag vX.Y.Z]");
    }
    tag = argv[index + 1];
    index += 1;
  }
  return { tag };
}

if (resolve(process.argv[1] ?? "") === SCRIPT_PATH) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const errors = validateRepository(options);
    if (errors.length > 0) {
      console.error("Repository validation failed:");
      for (const error of errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else {
      console.log(`Repository validation passed for ${DISPLAY_NAME}.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
