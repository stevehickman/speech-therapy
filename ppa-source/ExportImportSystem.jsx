// ── PPA Export / Import System ─────────────────────────────────────────────────
// Shared across: Naming, Repetition, Scripts, SentenceBuilder, Sentence Work, Video modules.
//
// File format: <basename>.ppa  (JSON, module-specific structure inside)
// Snapshot tracking: localStorage ppa_export_snapshots  → {filename: {itemId: contentHash}}
// Known files:       localStorage ppa_known_files        → {moduleId: [filename, ...]}

const PPA_EXT          = ".ppa";
const PPA_SNAPSHOTS_KEY = "ppa_export_snapshots";
const PPA_FILES_KEY    = "ppa_known_files";
const DICT_KEY        = "ppa_dictionary";   // unified word info for all modules
const DICT_NAMING_KEY = "ppa_naming_items"; // naming practice list (also read by SR engine)

// Thin wrappers — real implementations are in data/dictionary.js, which is
// bundled after the SB word-bank data that dictBuildSeed() depends on.
// Function declarations are hoisted so these forward calls are safe.
function ppaGetGraphic(word, fallback) { return dictGetGraphic(word, fallback); }
function ppaSyncGraphics(items)        { dictSyncFromNamingItems(items); }

// ── Core utilities ─────────────────────────────────────────────────────────────

function ppaGetSnapshots() {
  try { return JSON.parse(localStorage.getItem(PPA_SNAPSHOTS_KEY) || "{}"); } catch { return {}; }
}
function ppaSaveSnapshots(s) {
  try { localStorage.setItem(PPA_SNAPSHOTS_KEY, JSON.stringify(s)); } catch {}
}
function ppaGetKnownFilesAll() {
  try { return JSON.parse(localStorage.getItem(PPA_FILES_KEY) || "{}"); } catch { return {}; }
}
function ppaFilesForModule(moduleId) {
  return ppaGetKnownFilesAll()[moduleId] || [];
}
function ppaAddKnownFile(moduleId, filename) {
  const all = ppaGetKnownFilesAll();
  const list = all[moduleId] || [];
  if (!list.includes(filename)) {
    all[moduleId] = [...list, filename];
    try { localStorage.setItem(PPA_FILES_KEY, JSON.stringify(all)); } catch {}
  }
}
// Canonical ID for any exportable item (naming/video/sentenceBuilder use "id"; others use "_id")
function ppaItemId(item)  { return item.id ?? item._id ?? null; }

// Content hash: everything except meta-tracking fields
function ppaContentHash(item) {
  const { id: _i, _id: _i2, _sourceFile: _sf, _builtin: _b, ...content } = item;
  return JSON.stringify(Object.fromEntries(Object.entries(content).sort()));
}

function ppaIsItemDirty(item, snapshots) {
  const f = item._sourceFile;
  if (!f) return false;
  const id = ppaItemId(item);
  const stored = snapshots[f]?.[id];
  return stored !== undefined && stored !== ppaContentHash(item);
}

// Record export snapshots and update _sourceFile on items
function ppaRecordExportInMemory(items, filename) {
  const snaps = ppaGetSnapshots();
  if (!snaps[filename]) snaps[filename] = {};
  const updated = items.map(item => {
    snaps[filename][ppaItemId(item)] = ppaContentHash(item);
    return { ...item, _sourceFile: filename };
  });
  ppaSaveSnapshots(snaps);
  return updated;
}

// Trigger file download
function ppaDownload(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename + PPA_EXT;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Parse uploaded .ppa file
function ppaReadFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => {
      try {
        const d = JSON.parse(e.target.result);
        if (!d.ppaExport) reject(new Error("Not a valid .ppa file"));
        else resolve(d);
      } catch { reject(new Error("Invalid file content")); }
    };
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsText(file);
  });
}

// ── ExportDialog ───────────────────────────────────────────────────────────────
// Props:
//   moduleId     string
//   items        array of exportable (non-builtin) items
//   getLabel     fn(item) → display string
//   onExport     fn(selectedIds: Set, filename: string)
//   onClose      fn()

function PpaExportDialog({ moduleId, items, getLabel, onExport, onClose }) {
  const knownFiles = ppaFilesForModule(moduleId);
  // Default filename: most common _sourceFile among items, or ""
  const defaultFile = (() => {
    const counts = {};
    for (const it of items) if (it._sourceFile) counts[it._sourceFile] = (counts[it._sourceFile] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  })();

  const [useExisting, setUseExisting] = useState(!!(defaultFile && knownFiles.includes(defaultFile)));
  const [existingFile, setExistingFile] = useState(defaultFile || (knownFiles[0] || ""));
  const [newFile,      setNewFile]      = useState(defaultFile && !knownFiles.includes(defaultFile) ? defaultFile : "");
  const [selectedIds,  setSelectedIds]  = useState(() => new Set(items.map(ppaItemId)));

  const sanitize = s => s.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const effectiveFilename = useExisting ? existingFile : sanitize(newFile);
  const canExport = effectiveFilename.length > 0 && selectedIds.size > 0;

  const toggle = id => setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#FFFDF9", borderRadius: 20, padding: 24, maxWidth: 500, width: "100%",
        maxHeight: "85vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>📤</span>
          <span style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36", flex: 1 }}>Export to File</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999" }}>✕</button>
        </div>

        {/* Filename */}
        <div style={{ background: "#F5F0E8", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>Export file</div>
          {knownFiles.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {["Existing file", "New file"].map((label, i) => {
                const active = i === 0 ? useExisting : !useExisting;
                return (
                  <button key={label} onClick={() => setUseExisting(i === 0)}
                    style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `2px solid ${active ? "#4E8B80" : "#D5CFC4"}`,
                      background: active ? "#E8F4F2" : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                      color: active ? "#2D5A54" : "#666", fontFamily: "inherit" }}>{label}</button>
                );
              })}
            </div>
          )}
          {useExisting && knownFiles.length > 0 ? (
            <select value={existingFile} onChange={e => setExistingFile(e.target.value)}
              style={{ padding: "9px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 14,
                background: "#fff", outline: "none", fontFamily: "inherit" }}>
              {knownFiles.map(f => <option key={f} value={f}>{f}{PPA_EXT}</option>)}
            </select>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input value={newFile} onChange={e => setNewFile(e.target.value)}
                placeholder="e.g. clinic-words"
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "2px solid #D5CFC4",
                  fontSize: 14, outline: "none", background: "#fff", fontFamily: "inherit" }} />
              <span style={{ fontSize: 13, color: "#999", flexShrink: 0 }}>{PPA_EXT}</span>
            </div>
          )}
          {effectiveFilename && (
            <div style={{ fontSize: 12, color: "#7BAE9F" }}>Will save as: <strong>{effectiveFilename}{PPA_EXT}</strong></div>
          )}
        </div>

        {/* Item selection */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#555", flex: 1 }}>
              Items to export ({selectedIds.size} of {items.length})
            </span>
            <button onClick={() => setSelectedIds(new Set(items.map(ppaItemId)))}
              style={{ fontSize: 12, color: "#4E8B80", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>All</button>
            <button onClick={() => setSelectedIds(new Set())}
              style={{ fontSize: 12, color: "#999", background: "none", border: "none", cursor: "pointer" }}>None</button>
          </div>
          <div style={{ borderRadius: 12, border: "1px solid #E8E0D0", overflow: "hidden", maxHeight: 250, overflowY: "auto" }}>
            {items.length === 0 ? (
              <div style={{ padding: 20, color: "#999", textAlign: "center", fontSize: 14 }}>No custom items to export</div>
            ) : items.map(item => {
              const id = ppaItemId(item);
              const checked = selectedIds.has(id);
              return (
                <label key={id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                  borderBottom: "1px solid #F0EDE8", cursor: "pointer",
                  background: checked ? "#F0F7F5" : "transparent" }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(id)}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#4E8B80" }} />
                  <span style={{ flex: 1, fontSize: 14, color: "#2D3B36" }}>{getLabel(item)}</span>
                  {item._sourceFile && (
                    <span style={{ fontSize: 11, color: "#999", background: "#F5F0E8", borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
                      {item._sourceFile}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose}
            style={{ padding: "10px 20px", background: "#F5F0E8", border: "2px solid #D5CFC4",
              borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#666", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={() => canExport && onExport(selectedIds, effectiveFilename)} disabled={!canExport}
            style={{ padding: "10px 24px", background: canExport ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#C5BEB4",
              color: "#fff", border: "none", borderRadius: 10,
              cursor: canExport ? "pointer" : "default", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>
            📤 Export {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ReexportDialog ─────────────────────────────────────────────────────────────
// Props:
//   moduleId     string
//   dirtyItems   array of items that have been modified since export
//   getLabel     fn(item) → string
//   knownFiles   [filename, ...]
//   onReexport   fn(selections) where selections = { [itemId]: { checked, targetFile } }
//   onSkip       fn()

function PpaReexportDialog({ moduleId, dirtyItems, getLabel, knownFiles, onReexport, onSkip }) {
  const [sel, setSel] = useState(() => {
    const s = {};
    for (const item of dirtyItems) {
      const id = ppaItemId(item);
      s[id] = { checked: true, targetFile: item._sourceFile || (knownFiles[0] || "__new__"), newFile: "" };
    }
    return s;
  });

  const setField = (id, field, value) =>
    setSel(s => ({ ...s, [id]: { ...s[id], [field]: value } }));

  const getEffective = id => {
    const s = sel[id];
    return s.targetFile === "__new__" ? s.newFile.trim().replace(/[^a-zA-Z0-9_-]/g, "-") : s.targetFile;
  };

  const checked = dirtyItems.filter(it => sel[ppaItemId(it)]?.checked);
  const canGo = checked.length === 0 ||
    checked.every(it => { const f = getEffective(ppaItemId(it)); return f && f.length > 0; });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 3000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#FFFDF9", borderRadius: 20, padding: 24, maxWidth: 580, width: "100%",
        maxHeight: "88vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>

        {/* Header */}
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ fontSize: 26 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36" }}>
              {dirtyItems.length} item{dirtyItems.length !== 1 ? "s" : ""} modified since last export
            </div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 3 }}>
              Re-export now? Unselected items will not be updated in their files.
            </div>
          </div>
        </div>

        {/* Item list */}
        <div style={{ borderRadius: 12, border: "1px solid #E8E0D0", overflow: "hidden" }}>
          {dirtyItems.map(item => {
            const id = ppaItemId(item);
            const s = sel[id] || {};
            const fileList = [...new Set([...knownFiles, item._sourceFile].filter(Boolean))];
            return (
              <div key={id} style={{ padding: "12px 16px", borderBottom: "1px solid #F0EDE8",
                background: s.checked ? "#FFFDF9" : "#F8F8F8" }}>
                {/* Row 1: checkbox + label */}
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: s.checked ? 8 : 0 }}>
                  <input type="checkbox" checked={s.checked} onChange={e => setField(id, "checked", e.target.checked)}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#4E8B80" }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: s.checked ? "#2D3B36" : "#AAA" }}>
                    {getLabel(item)}
                  </span>
                  {!s.checked && (
                    <span style={{ fontSize: 12, color: "#BBB", fontStyle: "italic" }}>skip</span>
                  )}
                </label>
                {/* Row 2: file selector */}
                {s.checked && (
                  <div style={{ marginLeft: 26, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "#888", flexShrink: 0 }}>→ export to:</span>
                    <select value={s.targetFile} onChange={e => setField(id, "targetFile", e.target.value)}
                      style={{ flex: 1, minWidth: 120, padding: "6px 10px", borderRadius: 8, border: "2px solid #D5CFC4",
                        fontSize: 13, background: "#fff", outline: "none", fontFamily: "inherit" }}>
                      {fileList.map(f => <option key={f} value={f}>{f}{PPA_EXT}</option>)}
                      <option value="__new__">+ New file…</option>
                    </select>
                    {s.targetFile === "__new__" && (
                      <>
                        <input value={s.newFile} onChange={e => setField(id, "newFile", e.target.value)}
                          placeholder="filename"
                          style={{ width: 130, padding: "6px 8px", borderRadius: 8, border: "2px solid #4E8B80",
                            fontSize: 13, outline: "none", fontFamily: "inherit" }} />
                        <span style={{ fontSize: 12, color: "#999" }}>{PPA_EXT}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onSkip}
            style={{ padding: "10px 20px", background: "#F5F0E8", border: "2px solid #D5CFC4",
              borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#666", fontFamily: "inherit" }}>
            Skip & Close
          </button>
          {checked.length > 0 && (
            <button onClick={() => canGo && onReexport(sel, getEffective)} disabled={!canGo}
              style={{ padding: "10px 24px", background: canGo ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#C5BEB4",
                color: "#fff", border: "none", borderRadius: 10,
                cursor: canGo ? "pointer" : "default", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>
              📤 Re-export {checked.length} & Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PpaImportButton ────────────────────────────────────────────────────────────
// A hidden file input + visible button that reads .ppa files.
// Props:
//   onFiles  fn(files: File[])  — called with all selected files

function PpaImportButton({ onFiles, style = {} }) {
  const ref = useRef(null);
  return (
    <>
      <input ref={ref} type="file" accept={PPA_EXT} multiple style={{ display: "none" }}
        onChange={e => { if (e.target.files?.length) onFiles([...e.target.files]); e.target.value = ""; }} />
      <button onClick={() => ref.current?.click()}
        style={{ padding: "7px 14px", borderRadius: 9, border: "2px solid #4E8B80", background: "#E8F4F2",
          cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#2D5A54",
          display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", ...style }}>
        📥 Import
      </button>
    </>
  );
}

// ── PpaAdminToolbar ────────────────────────────────────────────────────────────
// Drop-in toolbar for admin headers: Export + Import buttons.
// Props:
//   onExport  fn()
//   onImport  fn(files: File[])

function PpaAdminToolbar({ onExport, onImport }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={onExport}
        style={{ padding: "7px 14px", borderRadius: 9, border: "2px solid #7BAE9F", background: "transparent",
          cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#7BAE9F",
          display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
        📤 Export
      </button>
      <PpaImportButton onFiles={onImport} />
    </div>
  );
}

// ── ppaHandleReexport ──────────────────────────────────────────────────────────
// Generic helper called by every module's onReexport callback.
// Parameters:
//   moduleId         string
//   dirtyItems       the items shown in the dialog (subset of all custom items)
//   allCustomItems   ALL non-builtin items in the module
//   selections       state from ReexportDialog { [id]: { checked, targetFile, newFile } }
//   getEffective     fn(id) → resolved filename
//   buildPayload     fn(filename, itemsForFile) → export payload object
//   applyUpdates     fn(updatedItems)  — save back the full custom items array with new _sourceFile

function ppaHandleReexport(moduleId, dirtyItems, allCustomItems, selections, getEffective, buildPayload, applyUpdates) {
  const snapshots = ppaGetSnapshots();
  const newSnaps  = { ...snapshots };

  // For each item with a _sourceFile, determine its NEW target file
  // (checked dirty items may move; all others stay at current _sourceFile)
  const resolveTarget = item => {
    const id = ppaItemId(item);
    const s  = selections[id];
    if (s?.checked) return getEffective(id);
    return item._sourceFile; // not in dialog or unchecked → stays
  };

  // Group ALL custom items by their resolved target file
  const fileGroups = {};
  for (const item of allCustomItems) {
    const target = resolveTarget(item);
    if (!target) continue;
    if (!fileGroups[target]) fileGroups[target] = [];
    fileGroups[target].push(item);
  }

  // Download each file and update snapshots
  for (const [filename, items] of Object.entries(fileGroups)) {
    ppaDownload(filename, buildPayload(filename, items));
    if (!newSnaps[filename]) newSnaps[filename] = {};
    for (const item of items) {
      newSnaps[filename][ppaItemId(item)] = ppaContentHash(item);
    }
    ppaAddKnownFile(moduleId, filename);
  }

  // Update _sourceFile on items that moved to a different file
  const updated = allCustomItems.map(item => {
    const newTarget = resolveTarget(item);
    return newTarget !== item._sourceFile ? { ...item, _sourceFile: newTarget } : item;
  });

  ppaSaveSnapshots(newSnaps);
  applyUpdates(updated);
}

// ── ppaHandleImport ────────────────────────────────────────────────────────────
// Generic helper for processing an array of .ppa File objects.
// Parameters:
//   moduleId       string
//   files          File[]
//   expectedId     moduleId expected in the file (or array of accepted moduleIds)
//   processData    fn(data, filename) → { newItems[], message }
//   onSuccess      fn(results: [{filename, message}])
//   onError        fn(filename, errorMessage)

async function ppaHandleImport(moduleId, files, expectedId, processData, onSuccess, onError) {
  const results = [];
  for (const file of files) {
    const filename = file.name.replace(/\.ppa$/i, "");
    try {
      const data = await ppaReadFile(file);
      const accepted = Array.isArray(expectedId) ? expectedId : [expectedId];
      if (!accepted.includes(data.moduleId)) {
        onError(filename, `This file is for the "${data.moduleId}" module.`);
        continue;
      }
      const { newItems, message } = processData(data, filename);

      // Record snapshots for imported items
      const snaps = ppaGetSnapshots();
      if (!snaps[filename]) snaps[filename] = {};
      for (const item of newItems) {
        snaps[filename][ppaItemId(item)] = ppaContentHash(item);
      }
      ppaSaveSnapshots(snaps);
      ppaAddKnownFile(moduleId, filename);
      results.push({ filename, message });
    } catch (err) {
      onError(filename, err.message);
    }
  }
  if (results.length > 0) onSuccess(results);
}

// ── Full State Backup / Restore ────────────────────────────────────────────────
// Backs up ALL ppa_* localStorage keys (module content, progress logs, export
// tracking, settings) into a single .ppabak file. Restoring writes them all back
// and reloads the page — surviving tool updates and redeployments.

const PPA_BAK_EXT         = ".ppabak";
const PPA_LAST_BACKUP_KEY  = "ppa_last_backup";   // {time, contentHash}

// Compute a fast hash of all content-bearing keys (excluding progress logs
// to avoid flagging the backup as stale every time a session is logged)
function ppaContentStateHash() {
  const CONTENT_KEYS = [
    "ppa_naming_items", "ppa_repetition_levels", "ppa_scripts",
    "ppa_sentence_completions", "ppa_sentence_constructions",
    "ppa_video_clips", "ppa_video_patches", "ppa_sb_library", DICT_KEY,
  ];
  let h = 0;
  for (const k of CONTENT_KEYS) {
    const v = localStorage.getItem(k) || "";
    for (let i = 0; i < v.length; i++) {
      h = (Math.imul(31, h) + v.charCodeAt(i)) | 0;
    }
  }
  return h.toString(16);
}

// Returns true when content has changed since last backup OR backup is older than maxAgeDays
function ppaBackupIsStale(maxAgeDays = 7) {
  try {
    const raw = localStorage.getItem(PPA_LAST_BACKUP_KEY);
    if (!raw) return true;
    const { time, contentHash } = JSON.parse(raw);
    if (ppaContentStateHash() !== contentHash) return true;
    const ageMs = Date.now() - new Date(time).getTime();
    return ageMs > maxAgeDays * 86400_000;
  } catch { return true; }
}

// Collect everything — all ppa_* keys — and download as .ppabak
function ppaDoBackup(basenameHint = "ppa-therapy-backup") {
  const allKeys = Object.keys(localStorage).filter(k => k.startsWith("ppa_"));
  const data = {};
  for (const k of allKeys) {
    try { data[k] = JSON.parse(localStorage.getItem(k)); }
    catch { data[k] = localStorage.getItem(k); }  // store as raw string if not valid JSON
  }
  const payload = {
    ppaBak: true, version: 1,
    createdAt: new Date().toISOString(),
    keyCount: allKeys.length,
    keys: data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const ts   = new Date().toISOString().slice(0, 10);
  a.href = url; a.download = `${basenameHint}-${ts}${PPA_BAK_EXT}`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  // Record this backup
  try {
    localStorage.setItem(PPA_LAST_BACKUP_KEY, JSON.stringify({
      time: new Date().toISOString(),
      contentHash: ppaContentStateHash(),
    }));
  } catch {}
}

// Read a .ppabak file and restore all keys, then reload
function ppaDoRestore(file, onError) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const payload = JSON.parse(e.target.result);
      if (!payload.ppaBak) { onError("Not a valid .ppabak file."); return; }
      const { keys } = payload;
      // Write every key back
      for (const [k, v] of Object.entries(keys)) {
        try {
          localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
        } catch (writeErr) {
          console.warn(`Restore: could not write key ${k}`, writeErr);
        }
      }
      // Update last-backup marker so the badge clears immediately after restore
      try {
        localStorage.setItem(PPA_LAST_BACKUP_KEY, JSON.stringify({
          time: new Date().toISOString(),
          contentHash: ppaContentStateHash(),
        }));
      } catch {}
      // Reload to pick up restored state in all module useState() initialisers
      window.location.reload();
    } catch (err) {
      onError(`Could not parse backup file: ${err.message}`);
    }
  };
  reader.onerror = () => onError("Could not read file.");
  reader.readAsText(file);
}

// ── BackupRestorePanel ─────────────────────────────────────────────────────────
// Rendered inside ProgressModule admin view as a self-contained card.
function BackupRestorePanel({ onBackupDone } = {}) {
  const restoreRef = useRef(null);
  const [restoreError, setRestoreError] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [justBacked, setJustBacked] = useState(false);

  const handleBackup = () => {
    ppaDoBackup("ppa-therapy-backup");
    setJustBacked(true);
    setTimeout(() => setJustBacked(false), 3000);
    onBackupDone?.();
  };

  const handleFileChosen = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!file.name.endsWith(PPA_BAK_EXT)) {
      setRestoreError(`Please choose a ${PPA_BAK_EXT} file.`);
      return;
    }
    setPendingFile(file);
    setRestoreConfirm(true);
    setRestoreError(null);
  };

  const handleConfirmRestore = () => {
    if (!pendingFile) return;
    ppaDoRestore(pendingFile, (msg) => {
      setRestoreError(msg);
      setRestoreConfirm(false);
      setPendingFile(null);
    });
  };

  // Count keys in localStorage
  const keyCount = Object.keys(localStorage).filter(k => k.startsWith("ppa_")).length;
  const isStale  = ppaBackupIsStale(7);
  const lastBak  = (() => {
    try {
      const raw = localStorage.getItem(PPA_LAST_BACKUP_KEY);
      if (!raw) return null;
      const { time } = JSON.parse(raw);
      return new Date(time).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    } catch { return null; }
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input ref={restoreRef} type="file" accept={PPA_BAK_EXT} style={{ display: "none" }}
        onChange={handleFileChosen} />

      {/* Restore confirmation overlay */}
      {restoreConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 5000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#FFFDF9", borderRadius: 18, padding: 28, maxWidth: 440, width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 28, textAlign: "center" }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#8B2D2D", textAlign: "center" }}>
              Replace all current data?
            </div>
            <div style={{ fontSize: 14, color: "#555", lineHeight: 1.6 }}>
              Restoring <strong>{pendingFile?.name}</strong> will overwrite all custom items, progress history,
              and settings with the backup contents. The page will reload automatically.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setRestoreConfirm(false); setPendingFile(null); }}
                style={{ flex: 1, padding: "11px 0", background: "#F5F0E8", border: "2px solid #D5CFC4",
                  borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#666", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={handleConfirmRestore}
                style={{ flex: 1, padding: "11px 0", background: "linear-gradient(135deg, #8B2D2D, #6B1D1D)",
                  border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700,
                  color: "#fff", fontFamily: "inherit" }}>
                Yes, Restore & Reload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        background: isStale ? "#FFF8E8" : "#F0F7F5", borderRadius: 10,
        border: `1px solid ${isStale ? "#F0D090" : "#B0D4CE"}` }}>
        <span style={{ fontSize: 20 }}>{isStale ? "🟡" : "✅"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: isStale ? "#8B6010" : "#2D5A54" }}>
            {isStale ? "Backup recommended" : "Backup up to date"}
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 1 }}>
            {lastBak ? `Last backup: ${lastBak}` : "No backup on record"} · {keyCount} data key{keyCount !== 1 ? "s" : ""} in storage
          </div>
        </div>
      </div>

      {/* Backup button */}
      <button onClick={handleBackup}
        style={{ padding: "12px 20px", background: justBacked ? "#3A7A6F" : "linear-gradient(135deg, #4E8B80, #3A7A6F)",
          color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700,
          fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: "background 0.3s" }}>
        {justBacked ? "✅ Backup downloaded!" : "💾 Download Full Backup"}
      </button>

      <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6, padding: "0 4px" }}>
        Saves all custom items, progress history, export file links, and settings
        to a <code style={{ background: "#F0EDE8", borderRadius: 4, padding: "1px 5px" }}>{PPA_BAK_EXT}</code> file.
        Keep it somewhere safe — restore it after any app update to recover your data.
      </div>

      {/* Restore button */}
      <button onClick={() => restoreRef.current?.click()}
        style={{ padding: "11px 20px", background: "#F5F0E8", border: "2px solid #D5CFC4",
          borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#555",
          fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        📥 Restore from Backup File…
      </button>

      {restoreError && (
        <div style={{ background: "#FFF0F0", borderRadius: 8, padding: "10px 14px", fontSize: 13,
          color: "#8B2D2D", border: "1px solid #F0A0A0" }}>
          ⚠️ {restoreError}
        </div>
      )}
    </div>
  );
}
