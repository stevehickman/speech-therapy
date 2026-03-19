import { useState, useEffect } from "react";
import { REPETITION_LEVELS } from "./data/repetitionItems.js";
import {
  PPA_EXT,
  ppaGetSnapshots, ppaFilesForModule, ppaAddKnownFile,
  ppaItemId, ppaIsItemDirty, ppaRecordExportInMemory,
  ppaDownload, ppaHandleReexport, ppaHandleImport,
  PpaAdminToolbar, PpaExportDialog, PpaReexportDialog,
} from "./ExportImportSystem.jsx";
import { AdminPinEntry } from "./AdminPinEntry.jsx";
import { Btn, isDuplicateString } from "./shared.jsx";

export default function RepetitionModule({ addToLog }) {
  // ── data (seeded from REPETITION_LEVELS, persisted in localStorage) ────────
  const RM_MODULE_ID = "repetition";
  const RM_BUILTIN_NAMES = new Set(REPETITION_LEVELS.map(l => l.name));
  const rmSeed = () => REPETITION_LEVELS.map((l, i) => ({ ...l, _id: `rep-builtin-${i}`, _builtin: true }));
  const rmEnsureIds = ls => ls.map((l, i) => l._id ? l : { ...l, _id: `rep-${Date.now()}-${i}` });

  const [levels, setLevels] = useState(() => {
    try {
      const s = localStorage.getItem("ppa_repetition_levels");
      return s ? rmEnsureIds(JSON.parse(s)) : rmSeed();
    } catch { return rmSeed(); }
  });
  const saveLevels = (next) => { setLevels(next); localStorage.setItem("ppa_repetition_levels", JSON.stringify(next)); };
  useEffect(() => { saveLevels(levels); }, []); // seed localStorage on mount so backup captures it

  // ── practice state ──────────────────────────────────────────────────────────
  const [level, setLevel] = useState(0);
  const [idx, setIdx] = useState(0);
  const [showing, setShowing] = useState(true);
  const [result, setResult] = useState(null);
  const [score, setScore] = useState({ correct: 0, partial: 0, incorrect: 0 });

  // ── admin state ─────────────────────────────────────────────────────────────
  const [adminOpen, setAdminOpen] = useState(false);
  const [pinPassed, setPinPassed] = useState(false);
  const [adminLevel, setAdminLevel] = useState(0);
  const [newItem, setNewItem] = useState("");
  const [editingItem, setEditingItem] = useState(null); // { levelIdx, itemIdx }
  const [editText, setEditText] = useState("");
  const [newLevelName, setNewLevelName] = useState("");
  const [addingLevel, setAddingLevel] = useState(false);
  const [showExport,   setShowExport]   = useState(false);
  const [showReexport, setShowReexport] = useState(false);
  const [importToast,  setImportToast]  = useState(null);
  const [dupWarning, setDupWarning] = useState(null); // null | 'item' | 'level' | 'edit'
  const showDup = (key, revert) => { setDupWarning(key); setTimeout(() => { setDupWarning(null); revert?.(); }, 300); };

  const openAdmin = () => { setPinPassed(false); setAdminOpen(true); };
  const rmCustomLevels = () => levels.filter(l => !l._builtin);
  const rmGetLabel = l => l.name;
  const rmBuildPayload = (filename, lvls) => ({
    ppaExport: true, version: 1, moduleId: RM_MODULE_ID, filename,
    exportedAt: new Date().toISOString(), levels: lvls,
  });

  const handleRmExport = (selectedIds, filename) => {
    const toExport = rmCustomLevels().filter(l => selectedIds.has(ppaItemId(l)));
    const updated  = ppaRecordExportInMemory(toExport, filename);
    const idMap = Object.fromEntries(updated.map(l => [l._id, l]));
    saveLevels(levels.map(l => idMap[l._id] ?? l));
    ppaAddKnownFile(RM_MODULE_ID, filename);
    ppaDownload(filename, rmBuildPayload(filename, toExport));
    setShowExport(false);
  };

  const handleRmImport = (files) => {
    ppaHandleImport(RM_MODULE_ID, files, RM_MODULE_ID,
      (data, filename) => {
        const incoming = (data.levels || []).map(l => ({ ...rmEnsureIds([l])[0], _sourceFile: filename }));
        const existingIds = new Set(levels.map(l => l._id));
        const newLvls = incoming.filter(l => !existingIds.has(l._id));
        saveLevels([...levels, ...newLvls]);
        return { newItems: incoming, message: `${newLvls.length} levels from ${filename}${PPA_EXT}` };
      },
      results => setImportToast({ text: results.map(r => r.message).join(", ") }),
      (fn, msg) => alert(`Import error (${fn}${PPA_EXT}): ${msg}`)
    );
  };

  const closeAdmin = () => {
    const snaps = ppaGetSnapshots();
    const dirty = rmCustomLevels().filter(l => ppaIsItemDirty(l, snaps));
    if (dirty.length > 0) { setShowReexport(true); return; }
    setAdminOpen(false);
  };
  const forceCloseAdmin = () => setAdminOpen(false);

  const current = levels[level]?.items[idx % (levels[level]?.items.length || 1)] || "";

  const record = (r) => {
    setResult(r);
    setScore(s => ({ ...s, [r]: s[r] + 1 }));
    addToLog({ type: "repetition", item: current, result: r, time: new Date().toLocaleTimeString() });
  };

  const next = () => { setIdx(i => i + 1); setShowing(true); setResult(null); };

  // ── admin helpers ───────────────────────────────────────────────────────────
  const deleteItem = (li, ii) => {
    const next = levels.map((l, i) => i !== li ? l : { ...l, items: l.items.filter((_, j) => j !== ii) });
    saveLevels(next);
  };
  const addItem = (li) => {
    if (!newItem.trim()) return;
    if (isDuplicateString(levels[li].items, newItem)) { showDup('item', () => setNewItem("")); return; }
    const next = levels.map((l, i) => i !== li ? l : { ...l, items: [...l.items, newItem.trim()] });
    saveLevels(next); setNewItem("");
  };
  const saveEdit = () => {
    if (!editText.trim() || !editingItem) return;
    const { levelIdx, itemIdx } = editingItem;
    const others = levels[levelIdx].items.filter((_, j) => j !== itemIdx);
    if (isDuplicateString(others, editText)) { showDup('edit', () => setEditText(levels[levelIdx].items[itemIdx])); return; }
    const next = levels.map((l, i) => i !== levelIdx ? l : {
      ...l, items: l.items.map((it, j) => j === itemIdx ? editText.trim() : it),
    });
    saveLevels(next); setEditingItem(null); setEditText("");
  };
  const addLevel = () => {
    if (!newLevelName.trim()) return;
    if (isDuplicateString(levels.map(l => l.name), newLevelName)) { showDup('level', () => setNewLevelName("")); return; }
    saveLevels([...levels, { name: newLevelName.trim(), items: [], _id: `rep-custom-${Date.now()}` }]);
    setNewLevelName(""); setAddingLevel(false);
  };
  const deleteLevel = (li) => {
    if (levels.length <= 1) return;
    const next = levels.filter((_, i) => i !== li);
    saveLevels(next);
    if (adminLevel >= next.length) setAdminLevel(next.length - 1);
  };

  if (adminOpen) {
    return (
      <div style={{ position: "relative", height: "100%" }}>
        {/* Export/import dialogs */}
        {showExport && (
          <PpaExportDialog moduleId={RM_MODULE_ID} items={rmCustomLevels()} getLabel={rmGetLabel}
            onExport={handleRmExport} onClose={() => setShowExport(false)} />
        )}
        {showReexport && (
          <PpaReexportDialog moduleId={RM_MODULE_ID}
            dirtyItems={rmCustomLevels().filter(l => ppaIsItemDirty(l, ppaGetSnapshots()))}
            getLabel={rmGetLabel} knownFiles={ppaFilesForModule(RM_MODULE_ID)}
            onReexport={(s, gef) => { ppaHandleReexport(RM_MODULE_ID, [], rmCustomLevels(), s, gef, rmBuildPayload, updated => saveLevels([...levels.filter(l => l._builtin), ...updated])); forceCloseAdmin(); }}
            onSkip={forceCloseAdmin} />
        )}
        {importToast && (
          <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 4000, background: "#2D3B36",
            color: "#E8F4F2", borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)", display: "flex", gap: 12, alignItems: "center" }}>
            ✅ Imported: {importToast.text}
            <button onClick={() => setImportToast(null)} style={{ background: "none", border: "none",
              color: "#7BAE9F", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
        )}
        <div style={{ maxWidth: 620, margin: "0 auto", padding: 24 }}>
          {!pinPassed ? (
            <AdminPinEntry onSuccess={() => setPinPassed(true)} onCancel={forceCloseAdmin} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#2D3B36", borderRadius: 14, padding: "14px 20px" }}>
                <span style={{ fontSize: 20 }}>{"⚙️"}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#E8F4F2", flex: 1 }}>Repetition Admin</span>
                <PpaAdminToolbar onExport={() => setShowExport(true)} onImport={handleRmImport} />
                <button onClick={() => { saveLevels(REPETITION_LEVELS.map((l, i) => ({ ...l, _id: `rep-builtin-${i}`, _builtin: true }))); }} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #C07070", background: "transparent", color: "#E07070", cursor: "pointer", fontSize: 12 }}>Reset defaults</button>
                <button onClick={closeAdmin} style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid #4E8B80", background: "transparent", color: "#7BAE9F", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>✕ Close</button>
              </div>

              {/* Level tabs */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {levels.map((l, i) => (
                  <button key={i} onClick={() => setAdminLevel(i)}
                    style={{ padding: "8px 16px", borderRadius: 20, border: `2px solid ${adminLevel === i ? "#4E8B80" : "#D5CFC4"}`, background: adminLevel === i ? "#E8F4F2" : "#FFFDF9", color: adminLevel === i ? "#3A7A6F" : "#666", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                    {l.name} <span style={{ color: "#999", fontWeight: 400 }}>({l.items.length})</span>
                  </button>
                ))}
                <button onClick={() => setAddingLevel(true)} style={{ padding: "8px 14px", borderRadius: 20, border: "2px dashed #B0D4CE", background: "#F0F7F5", color: "#4E8B80", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>+ Level</button>
              </div>

              {/* Add new level */}
              {addingLevel && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#F0F7F5", borderRadius: 12, padding: "12px 16px", border: "1px solid #B0D4CE" }}>
                  {dupWarning === 'level' && <div style={{ fontSize: 12, color: "#C07070", fontWeight: 600 }}>Duplicate — ignored</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={newLevelName} onChange={e => setNewLevelName(e.target.value)} onKeyDown={e => e.key === "Enter" && addLevel()}
                      placeholder="Level name (e.g. Long Sentences)" autoFocus
                      style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid #B0D4CE", fontSize: 14, outline: "none" }} />
                    <button onClick={addLevel} style={{ padding: "8px 16px", background: "#4E8B80", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Add</button>
                    <button onClick={() => setAddingLevel(false)} style={{ padding: "8px 12px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 8, cursor: "pointer", color: "#666" }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Current level items */}
              {levels[adminLevel] && (
                <div style={{ background: "#FFFDF9", borderRadius: 16, border: "1px solid #E8E0D0", overflow: "hidden" }}>
                  <div style={{ padding: "12px 18px", background: "#F5F0E8", borderBottom: "1px solid #E8E0D0", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, color: "#2D3B36", flex: 1 }}>{levels[adminLevel].name}</span>
                    {levels.length > 1 && (
                      <button onClick={() => deleteLevel(adminLevel)} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #C07070", background: "transparent", color: "#C07070", cursor: "pointer", fontSize: 12 }}>Delete level</button>
                    )}
                  </div>
                  {levels[adminLevel].items.length === 0 && (
                    <div style={{ padding: "20px", color: "#999", textAlign: "center", fontSize: 14 }}>No items yet — add one below</div>
                  )}
                  {levels[adminLevel].items.map((item, ii) => (
                    <div key={ii} style={{ padding: "12px 18px", borderBottom: "1px solid #F0EDE8", display: "flex", alignItems: "center", gap: 10 }}>
                      {editingItem?.levelIdx === adminLevel && editingItem?.itemIdx === ii ? (
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                          {dupWarning === 'edit' && <div style={{ fontSize: 12, color: "#C07070", fontWeight: 600 }}>Duplicate — ignored</div>}
                          <div style={{ display: "flex", gap: 10 }}>
                            <input value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingItem(null); }}
                              autoFocus style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "2px solid #4E8B80", fontSize: 15, outline: "none" }} />
                            <button onClick={saveEdit} style={{ padding: "5px 12px", background: "#4E8B80", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Save</button>
                            <button onClick={() => setEditingItem(null)} style={{ padding: "5px 10px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#666" }}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 15, color: "#2D3B36" }}>{item}</span>
                          <button onClick={() => { setEditingItem({ levelIdx: adminLevel, itemIdx: ii }); setEditText(item); }}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 13, color: "#666" }}>✏ Edit</button>
                          <button onClick={() => deleteItem(adminLevel, ii)}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #E0A0A0", background: "#FFF5F5", cursor: "pointer", fontSize: 13, color: "#C07070" }}>✕</button>
                        </>
                      )}
                    </div>
                  ))}
                  {/* Add item */}
                  <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 6, background: "#F8F6F2" }}>
                    {dupWarning === 'item' && <div style={{ fontSize: 12, color: "#C07070", fontWeight: 600 }}>Duplicate — ignored</div>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem(adminLevel)}
                        placeholder={`Add new ${levels[adminLevel].name.toLowerCase().replace(/s$/, "")}...`}
                        style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 14, outline: "none", background: "#FFFDF9" }} />
                      <button onClick={() => addItem(adminLevel)}
                        style={{ padding: "8px 18px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>Add</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", padding: 24, maxWidth: 600, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Admin gear */}
      <button onClick={openAdmin} title="Admin: manage repetition items"
        style={{ position: "absolute", top: 8, right: 8, zIndex: 10, width: 34, height: 34, borderRadius: "50%", border: "2px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", transition: "all 0.2s" }}
        onMouseOver={e => { e.currentTarget.style.borderColor = "#4E8B80"; e.currentTarget.style.color = "#4E8B80"; }}
        onMouseOut={e => { e.currentTarget.style.borderColor = "#D5CFC4"; e.currentTarget.style.color = "#888"; }}>
        {"⚙️"}
      </button>

      <div style={{ display: "flex", gap: 8, background: "#F5F0E8", borderRadius: 14, padding: 6 }}>
        {levels.map((l, i) => (
          <button key={i} onClick={() => { setLevel(i); setIdx(0); setResult(null); setShowing(true); }}
            style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, background: level === i ? "#4E8B80" : "transparent", color: level === i ? "#fff" : "#666", transition: "all 0.2s" }}>
            {l.name}
          </button>
        ))}
      </div>

      <div style={{ background: "#FFFDF9", borderRadius: 20, padding: 36, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", border: "1px solid #E8E0D0", minHeight: 180 }}>
        <div style={{ fontSize: 13, color: "#999", letterSpacing: 2, textTransform: "uppercase", marginBottom: 20 }}>Repeat this</div>
        {showing ? (
          <>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#2D3B36", lineHeight: 1.4, marginBottom: 28 }}>"{current}"</div>
            {!result && (
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <Btn color="#4E8B80" onClick={() => record("correct")}>✓ Said it correctly</Btn>
                <Btn color="#D4A843" onClick={() => record("partial")}>〜 Close / partial</Btn>
                <Btn color="#C07070" onClick={() => record("incorrect")}>✗ Could not repeat</Btn>
              </div>
            )}
          </>
        ) : (
          <button onClick={() => setShowing(true)} style={{ fontSize: 18, padding: "16px 32px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 14, cursor: "pointer" }}>
            Show me the item
          </button>
        )}
        {result && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <div style={{ fontSize: 16, color: result === "correct" ? "#4E8B80" : result === "partial" ? "#D4A843" : "#C07070", fontWeight: 600 }}>
              {result === "correct" ? "✓ Well done!" : result === "partial" ? "〜 Good effort!" : "Let's try the next one"}
            </div>
            <button onClick={next} style={{ padding: "10px 24px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 15 }}>
              Next →
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        {[["✓ Correct", "#4E8B80", score.correct], ["〜 Partial", "#D4A843", score.partial], ["✗ Difficulty", "#C07070", score.incorrect]].map(([l, c, v]) => (
          <div key={l} style={{ textAlign: "center", padding: "10px 16px", background: c + "15", borderRadius: 12, border: `2px solid ${c}40`, minWidth: 80 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{v}</div>
            <div style={{ fontSize: 12, color: "#666" }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
