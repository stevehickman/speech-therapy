#!/usr/bin/env node
/**
 * analyze-deps.js
 * Scans all .js/.jsx files in the project, parses their import statements,
 * builds a dependency graph, checks for:
 *   - duplicate imports (same symbol imported from multiple files)
 *   - circular dependencies
 *   - unused exports
 * Then prints a full dependency tree.
 *
 * Usage: node analyze-deps.js [rootDir]
 *   rootDir defaults to the directory containing this script.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, relative, dirname, join, extname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(process.argv[2] ?? __dirname);

// ── 1. Collect all JS/JSX files ──────────────────────────────────────────────
function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, files);
    else if ([".js", ".jsx"].includes(extname(full))) files.push(full);
  }
  return files;
}

const allFiles = collectFiles(rootDir);

// ── 2. Parse imports & exports from each file ────────────────────────────────
const IMPORT_RE  = /^\s*import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+["']([^"']+)["']/gm;
// Matches: export const X, export function X, export class X, export default X
// Also handles: export default function X  (skips the word "function", captures "X")
const EXPORT_RE  = /^\s*export\s+(?:default\s+)?(?:(?:const|function|class)\s+)(\w+)/gm;
const REEXPORT_RE = /^\s*export\s+\{([^}]*)\}\s+from\s+["']([^"']+)["']/gm;

function parseFile(filePath) {
  const src = readFileSync(filePath, "utf8");
  const rel = relative(rootDir, filePath);

  // Imports
  const imports = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const names = m[1]
      ? m[1].split(",").map(s => s.trim().replace(/\s+as\s+\w+/, "")).filter(Boolean)
      : [m[2]]; // default import
    const specifier = m[3];
    imports.push({ names, specifier, line: src.slice(0, m.index).split("\n").length });
  }

  // Re-exports
  for (const m of src.matchAll(REEXPORT_RE)) {
    const names = m[1].split(",").map(s => s.trim()).filter(Boolean);
    imports.push({ names, specifier: m[2], line: src.slice(0, m.index).split("\n").length, reexport: true });
  }

  // Exports
  const exports = [];
  for (const m of src.matchAll(EXPORT_RE)) {
    exports.push(m[1]);
  }

  return { path: filePath, rel, imports, exports };
}

const fileMap = new Map(); // rel path → parsed info
for (const f of allFiles) {
  const info = parseFile(f);
  fileMap.set(info.rel, info);
}

// ── 3. Resolve specifiers to actual files ─────────────────────────────────────
function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null; // external package
  const candidates = [
    resolve(dirname(fromFile), specifier),
    resolve(dirname(fromFile), specifier + ".js"),
    resolve(dirname(fromFile), specifier + ".jsx"),
  ];
  for (const c of candidates) {
    const rel = relative(rootDir, c);
    if (fileMap.has(rel)) return rel;
  }
  return null; // file not found in project
}

// Build adjacency: file → Set of files it imports from
const graph = new Map(); // rel → Set<rel>
for (const [rel, info] of fileMap) {
  const deps = new Set();
  for (const imp of info.imports) {
    const resolved = resolveSpecifier(info.path, imp.specifier);
    if (resolved) deps.add(resolved);
  }
  graph.set(rel, deps);
}

// ── 4. Check for circular dependencies ───────────────────────────────────────
const cycles = [];
function detectCycles(node, visited = new Set(), stack = []) {
  if (stack.includes(node)) {
    const cycleStart = stack.indexOf(node);
    cycles.push([...stack.slice(cycleStart), node]);
    return;
  }
  if (visited.has(node)) return;
  visited.add(node);
  stack.push(node);
  for (const dep of (graph.get(node) ?? [])) {
    detectCycles(dep, visited, [...stack]);
  }
}
for (const node of graph.keys()) detectCycles(node);

// ── 5. Check for duplicate imports (same name imported by >1 route) ───────────
// For each file, check if any imported symbol name appears in multiple imports
const duplicateImports = [];
for (const [rel, info] of fileMap) {
  const seen = new Map(); // name → first import specifier
  for (const imp of info.imports) {
    for (const name of imp.names) {
      if (seen.has(name)) {
        duplicateImports.push({ file: rel, name, first: seen.get(name), second: imp.specifier });
      } else {
        seen.set(name, imp.specifier);
      }
    }
  }
}

// ── 6. Check for unused exports ───────────────────────────────────────────────
// Collect all imported names across the whole project
const allImportedNames = new Set();
for (const info of fileMap.values()) {
  for (const imp of info.imports) {
    for (const name of imp.names) allImportedNames.add(name);
  }
}
const unusedExports = [];
for (const [rel, info] of fileMap) {
  for (const exp of info.exports) {
    if (exp === "default") continue; // skip default exports
    if (!allImportedNames.has(exp)) {
      unusedExports.push({ file: rel, name: exp });
    }
  }
}

// ── 7. Topological sort (dependency order) ────────────────────────────────────
function topoSort() {
  const visited = new Set();
  const order = [];
  function visit(node) {
    if (visited.has(node)) return;
    visited.add(node);
    for (const dep of (graph.get(node) ?? [])) visit(dep);
    order.push(node);
  }
  for (const node of graph.keys()) visit(node);
  return order;
}
const topoOrder = topoSort();

// ── 8. Pretty-print the tree ──────────────────────────────────────────────────
const COLORS = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
  red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (color, str) => `${COLORS[color]}${str}${COLORS.reset}`;

console.log(c("bold", "\n╔══════════════════════════════════════════════════════╗"));
console.log(c("bold", "║         PPA Speech Therapy — Dependency Report        ║"));
console.log(c("bold", "╚══════════════════════════════════════════════════════╝\n"));

// Tree view
console.log(c("bold", "── Dependency Tree (leaves first) ──────────────────────\n"));
for (const rel of topoOrder) {
  const info = fileMap.get(rel);
  const deps = [...(graph.get(rel) ?? [])];
  const exports = info.exports;
  const isData = rel.startsWith("data/");
  const icon = isData ? "📄" : "⚛️ ";
  console.log(`${icon}  ${c(isData ? "cyan" : "green", rel)}`);
  if (deps.length) {
    console.log(`     ${c("dim", "imports from:")} ${deps.map(d => c("yellow", d)).join(", ")}`);
  }
  if (exports.length) {
    console.log(`     ${c("dim", "exports:    ")} ${exports.map(e => c("magenta", e)).join(", ")}`);
  }
  console.log();
}

// Load order
console.log(c("bold", "── Safe Load Order (no file loads before its dependencies) ──\n"));
topoOrder.forEach((rel, i) => {
  const deps = [...(graph.get(rel) ?? [])];
  console.log(`  ${String(i + 1).padStart(2, " ")}. ${rel}${deps.length ? c("dim", `  ← ${deps.join(", ")}`) : ""}`);
});

// Issues
console.log(c("bold", "\n── Issues ───────────────────────────────────────────────\n"));

if (cycles.length === 0 && duplicateImports.length === 0 && unusedExports.length === 0) {
  console.log(c("green", "  ✅  No issues found — dependency graph is clean.\n"));
} else {
  if (cycles.length) {
    console.log(c("red", `  ❌  Circular dependencies (${cycles.length}):`));
    for (const cycle of cycles) {
      console.log(`       ${cycle.join(" → ")}`);
    }
    console.log();
  }
  if (duplicateImports.length) {
    console.log(c("yellow", `  ⚠️   Duplicate imports (${duplicateImports.length}):`));
    for (const d of duplicateImports) {
      console.log(`       "${d.name}" imported in ${d.file} from both "${d.first}" and "${d.second}"`);
    }
    console.log();
  }
  if (unusedExports.length) {
    console.log(c("dim", `  ℹ️   Unused named exports (${unusedExports.length}) — may be intentional:`));
    for (const u of unusedExports) {
      console.log(`       ${u.name}  in  ${u.file}`);
    }
    console.log();
  }
}

console.log(c("dim", `  Scanned ${allFiles.length} files in ${rootDir}\n`));
