#!/usr/bin/env node
/**
 * bundle.js  —  Inline-bundler for ppa-speech-therapy
 *
 * Reads the dependency graph (same logic as analyze-deps.js), topologically sorts
 * the source files, then emits a single self-contained JSX by:
 *   1. Stripping all   import … from "./…"   lines (relative project imports only)
 *   2. Stripping all   export default / export const / export function  keywords
 *      (so the names remain available as plain identifiers)
 *   3. Concatenating in dependency order so every name is defined before use
 *   4. Appending a final  export default App  line
 *
 * External imports (react, etc.) are left untouched.
 *
 * Usage:
 *   node bundle.js [rootDir] [entryFile] [outputFile]
 *
 * Defaults:
 *   rootDir    = directory of this script
 *   entryFile  = ppa-speech-therapy_main.jsx
 *   outputFile = ppa-speech-therapy-bundle.jsx
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve, relative, dirname, join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const rootDir    = resolve(process.argv[2] ?? __dirname);
const entryFile  = process.argv[3] ?? "ppa-speech-therapy_main.jsx";
const outputFile = process.argv[4] ?? "ppa-speech-therapy-bundle.jsx";

const entryPath  = resolve(rootDir, entryFile);
const outputPath = resolve(rootDir, outputFile);

// -- 1. Collect all JS/JSX files -----------------------------------------------
function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, files);
    else if ([".js", ".jsx"].includes(extname(full))) files.push(full);
  }
  return files;
}

const allFiles = collectFiles(rootDir)
  .filter(f => f !== outputPath && !f.endsWith("bundle.js") && !f.endsWith("analyze-deps.js"));

// -- 2. Parse relative imports from each file ----------------------------------
const IMPORT_RE = /^\s*import\s+(?:\{[^}]*\}|\w+|\*\s+as\s+\w+)\s+from\s+["']([^"']+)["']/gm;

function isRelative(spec) { return spec.startsWith("."); }

function resolveSpecifier(fromFile, spec) {
  const candidates = [
    resolve(dirname(fromFile), spec),
    resolve(dirname(fromFile), spec + ".js"),
    resolve(dirname(fromFile), spec + ".jsx"),
  ];
  for (const c of candidates) {
    const rel = relative(rootDir, c);
    if (fileMap.has(rel)) return rel;
  }
  return null;
}

// Build file map: rel → { path, src }
const fileMap = new Map();
for (const f of allFiles) {
  fileMap.set(relative(rootDir, f), { path: f, src: readFileSync(f, "utf8") });
}

// Build adjacency graph
const graph = new Map(); // rel → Set<rel>
for (const [rel, { path, src }] of fileMap) {
  const deps = new Set();
  for (const m of src.matchAll(IMPORT_RE)) {
    if (isRelative(m[1])) {
      const resolved = resolveSpecifier(path, m[1]);
      if (resolved) deps.add(resolved);
    }
  }
  graph.set(rel, deps);
}

// -- 3. Topological sort starting from entryFile -------------------------------
const entryRel = relative(rootDir, entryPath);
const visited  = new Set();
const order    = [];

function visit(node) {
  if (visited.has(node)) return;
  visited.add(node);
  for (const dep of (graph.get(node) ?? [])) visit(dep);
  order.push(node);
}
visit(entryRel);

// Matches external (non-relative) import lines with named/default specifiers
const EXTERNAL_IMPORT_RE = /^[ \t]*import\s+(\{[^}]*\}|\w+|\*\s+as\s+\w+)\s+from\s+["']([^./][^"']*)["'];?\s*\n?/gm;

// Also strip ALL external import lines from file content (we'll re-emit them at top)
const ALL_IMPORT_LINE_RE  = /^[ \t]*import\s+(?:\{[^}]*\}|\w+|\*\s+as\s+\w+)\s+from\s+["'][^"']*["'];?\s*\n?/gm;

// -- 4b. Collect external imports from all files in order ---------------------
// Map: package → Set<named import>
const externalImports = new Map(); // package → Set<string>

for (const rel of order) {
  const { src } = fileMap.get(rel);
  for (const m of src.matchAll(EXTERNAL_IMPORT_RE)) {
    const specPart = m[1].trim();
    const pkg      = m[2];
    if (!externalImports.has(pkg)) externalImports.set(pkg, new Set());
    const nameSet = externalImports.get(pkg);
    if (specPart.startsWith("{")) {
      // Named imports: { useState, useRef, ... }
      specPart.slice(1, -1).split(",")
        .map(s => s.trim().replace(/\s+as\s+\w+/, "").trim())
        .filter(Boolean)
        .forEach(n => nameSet.add(n));
    } else if (specPart.startsWith("*")) {
      // Namespace import: keep as-is (rare)
      nameSet.add(specPart);
    } else {
      // Default import
      nameSet.add(`__default__${specPart}`);
    }
  }
}

// Build merged import lines
const mergedImports = [...externalImports.entries()].map(([pkg, names]) => {
  const defaults = [...names].filter(n => n.startsWith("__default__")).map(n => n.slice(11));
  const named    = [...names].filter(n => !n.startsWith("__default__") && !n.startsWith("*"));
  const ns       = [...names].filter(n => n.startsWith("*"));
  const parts = [
    ...defaults,
    ...ns,
    ...(named.length ? [`{ ${[...named].sort().join(", ")} }`] : []),
  ];
  return `import ${parts.join(", ")} from "${pkg}";`;
}).join("\n");
// Patterns to remove/transform:
//   • Relative import lines  →  remove entirely
//   • `export default function Foo`  →  `function Foo`
//   • `export default class Foo`     →  `class Foo`
//   • `export default Foo`  (bare re-export of identifier) → remove line
//     (the identifier is already defined above)
//   • `export { A, B }`  →  remove (named re-exports of already-defined names)
//   • `export const / function / class Foo`  →  `const / function / class Foo`

// Only strips imports whose specifier starts with . (relative project imports)
const RELATIVE_IMPORT_LINE_RE = /^[ \t]*import\s+(?:\{[^}]*\}|\w+|\*\s+as\s+\w+)\s+from\s+["']\.(?:[^"']*)["'];?\s*\n?/gm;
const EXPORT_DEFAULT_FN_RE    = /^export\s+default\s+(function|class)\s/gm;
const EXPORT_DEFAULT_BARE_RE  = /^export\s+default\s+\w+;\s*\n?/gm;
const EXPORT_NAMED_BRACE_RE   = /^export\s+\{[^}]*\}(?:\s+from\s+["'][^"']*["'])?;\s*\n?/gm;
const EXPORT_KEYWORD_RE       = /^export\s+((?:default\s+)?(?:const|let|var|function|class|async\s+function))\s/gm;

// Extract declared identifier from a top-level line
function declaredName(line) {
  const m = line.match(/^(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  return m ? m[1] : null;
}

// Skip top-level blocks whose name was already emitted by an earlier file.
// Tracks brace depth so only depth-0 declarations are considered for dedup;
// inner variables (e.g. `const showItems` inside a render function) are never
// mistakenly registered or removed.
function deduplicateDecls(src, seen) {
  const lines  = src.split("\n");
  const output = [];
  let depth = 0;
  let i     = 0;
  while (i < lines.length) {
    const line    = lines[i];
    const trimmed = line.trimStart();

    if (depth === 0) {
      const name = declaredName(trimmed);
      if (name && seen.has(name)) {
        // Skip this entire declaration.
        // Walk forward until the brace depth returns to 0.
        let localDepth = 0;
        let hasBlock   = false;
        while (i < lines.length) {
          for (const ch of lines[i]) {
            if (ch === "{") { localDepth++; hasBlock = true; }
            if (ch === "}") localDepth--;
          }
          i++;
          if (!hasBlock || localDepth === 0) break;
        }
        continue;
      }
      if (name) seen.add(name);
    }

    // Update running depth AFTER the depth-0 dedup check.
    for (const ch of line) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }

    output.push(line);
    i++;
  }
  return output.join("\n");
}

function stripExports(src, rel, seen) {
  let out = src;
  out = out.replace(ALL_IMPORT_LINE_RE,      "");           // remove ALL import lines (re-emitted merged at top)
  out = out.replace(EXPORT_DEFAULT_FN_RE,    "$1 ");        // export default function → function
  out = out.replace(EXPORT_DEFAULT_BARE_RE,  "");           // export default Foo; → remove
  out = out.replace(EXPORT_NAMED_BRACE_RE,   "");           // export { A, B } → remove
  out = out.replace(EXPORT_KEYWORD_RE,       "$1 ");        // export const/fn/class → bare
  out = deduplicateDecls(out, seen);                        // skip already-seen names
  return out.trim();
}

// -- 5. Emit the bundle --------------------------------------------------------
const BANNER = `/**
 * ppa-speech-therapy — BUNDLED (single-file build)
 * Generated by bundle.js on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC
 *
 * Source files included (in dependency order):
${order.map(r => ` *   ${r}`).join("\n")}
 *
 * DO NOT EDIT THIS FILE DIRECTLY.
 * Edit the source files, then regenerate with:  node bundle.js
 */

${mergedImports}

`;

const seen = new Set(); // tracks top-level names already emitted

const parts = order.map(rel => {
  const { src } = fileMap.get(rel);
  const stripped = stripExports(src, rel, seen);
  const divider  = `\n// ${"-".repeat(68)}\n// ${rel}\n// ${"-".repeat(68)}\n\n`;
  return divider + stripped;
});

// Append `export default App` for the artifact renderer
const FOOTER = `\n\nexport default App;\n`;

// Escape parser-hostile invisible unicode (ZWJ sequences, line/para separators, BOM)
// before writing — these are invisible in emoji strings but break some JS parsers.
// NOTE: \uFE0F (emoji variation selector-16), \u200D (ZWJ), and \u20E3 (keycap combiner)
// are intentionally NOT escaped — they are required for emoji to render correctly.
// Only escape true line-separator / BOM / invisible control chars that break parsers.
const UNSAFE_UNICODE = /[\u200B\u200C\u2028\u2029\uFEFF]/g;
function escapeCodepoint(ch) {
  return `\\u${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

const bundle = (BANNER + parts.join("\n\n") + FOOTER)
  .replace(UNSAFE_UNICODE, escapeCodepoint);

writeFileSync(outputPath, bundle, "utf8");

// -- 6. Report -----------------------------------------------------------------
const lines  = bundle.split("\n").length;
const kb     = (Buffer.byteLength(bundle, "utf8") / 1024).toFixed(1);
console.log(`\n✅  Bundle written to: ${relative(rootDir, outputPath)}`);
console.log(`   ${order.length} files  •  ${lines} lines  •  ${kb} KB\n`);
console.log("Files included:");
order.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. ${r}`));
console.log();


// ── 7. Parse verification (tsx) ──────────────────────────────────────────────
// Runs tsx to do a real JSX parse. Catches syntax errors that static analysis
// misses, e.g. bare newline characters embedded inside string literals.

const tsxCandidates = [
  resolve(rootDir, "../node_modules/.bin/tsx"),
  resolve(rootDir, "node_modules/.bin/tsx"),
  "/Users/stevehickman/.nvm/versions/node/v24.14.0/bin/tsx",
  "/home/claude/.npm-global/bin/tsx",
];
const tsxBin = tsxCandidates.find(p => existsSync(p));

if (!tsxBin) {
  console.warn("⚠️  tsx not found — skipping JSX parse verification\n");
} else {
  try {
    execSync(`${tsxBin} --no-cache ${outputPath}`, { timeout: 30_000, stdio: "pipe" });
    console.log("✅  JSX parse OK (tsx)\n");
  } catch (err) {
    const stderr = err.stderr?.toString() ?? "";
    const stdout = err.stdout?.toString() ?? "";
    const msg = (stderr || stdout || err.message)
      .split("\n").filter(Boolean).slice(0, 8).join("\n");
    console.error("\n❌  JSX PARSE ERROR — fix source files and re-run bundle.js");
    console.error(msg + "\n");
    process.exit(1);
  }
}
