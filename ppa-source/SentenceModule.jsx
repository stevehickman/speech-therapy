import { useState, useEffect } from "react";
import { SENTENCE_COMPLETIONS, SENTENCE_CONSTRUCTIONS } from "./data/sentenceTasks.js";
import {
  PPA_EXT,
  ppaGetSnapshots, ppaFilesForModule, ppaAddKnownFile,
  ppaItemId, ppaIsItemDirty, ppaRecordExportInMemory,
  ppaDownload, ppaHandleReexport, ppaHandleImport,
  PpaAdminToolbar, PpaExportDialog, PpaReexportDialog,
} from "./ExportImportSystem.jsx";
import { AdminPinEntry } from "./AdminPinEntry.jsx";
import { CallAPI, ThinkingDots, Btn, checkDuplicate, DuplicateConflictModal } from "./shared.jsx";

export default function SentenceModule({ addToLog }) {
  // ── data ────────────────────────────────────────────────────────────────────
  const SM_MODULE_ID = "sentence";
  const smSeedCompl  = () => SENTENCE_COMPLETIONS.map((c, i)   => ({ ...c, _id: `smc-builtin-${i}`, _builtin: true }));
  const smSeedConstr = () => SENTENCE_CONSTRUCTIONS.map((c, i) => ({ ...c, _id: `smx-builtin-${i}`, _builtin: true }));
  const smEnsureIds  = (arr, prefix) => arr.map((c, i) => c._id ? c : { ...c, _id: `${prefix}-${Date.now()}-${i}` });

  const [completions, setCompletions] = useState(() => {
    try {
      const s = localStorage.getItem("ppa_sentence_completions");
      return s ? smEnsureIds(JSON.parse(s), "smc") : smSeedCompl();
    } catch { return smSeedCompl(); }
  });
  const [constructions, setConstructions] = useState(() => {
    try {
      const s = localStorage.getItem("ppa_sentence_constructions");
      return s ? smEnsureIds(JSON.parse(s), "smx") : smSeedConstr();
    } catch { return smSeedConstr(); }
  });
  const saveCompletions   = (next) => { setCompletions(next);   localStorage.setItem("ppa_sentence_completions",   JSON.stringify(next)); };
  const saveConstructions = (next) => { setConstructions(next); localStorage.setItem("ppa_sentence_constructions", JSON.stringify(next)); };
  useEffect(() => { saveCompletions(completions); saveConstructions(constructions); }, []); // seed localStorage on mount

  // ── practice state ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState("completion");
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [pendingAI, setPendingAI] = useState(null);
  const [taskIdx, setTaskIdx] = useState(0);

  // ── admin state ─────────────────────────────────────────────────────────────
  const [adminOpen, setAdminOpen] = useState(false);
  const [pinPassed, setPinPassed] = useState(false);
  // Completion admin
  const [newPrompt, setNewPrompt] = useState("");
  const [newHint, setNewHint] = useState("");
  const [editingComp, setEditingComp] = useState(null);
  const [editCompPrompt, setEditCompPrompt] = useState("");
  const [editCompHint, setEditCompHint] = useState("");

  // Construction admin
  const [newConWords, setNewConWords] = useState("");
  const [newConHint, setNewConHint] = useState("");
  const [editingCon, setEditingCon] = useState(null);
  const [editConWords, setEditConWords] = useState("");
  const [editConHint, setEditConHint] = useState("");

  const [showExport,   setShowExport]   = useState(false);
  const [showReexport, setShowReexport] = useState(false);
  const [importToast,  setImportToast]  = useState(null);
  const [adminTab,     setAdminTab]     = useState("completion");
  const [smConflict,   setSmConflict]   = useState(null); // { newItem, match, conflictFields, itemType }
  const [dupWarning, setDupWarning] = useState(null); // null | 'comp' | 'con' | 'edit-comp' | 'edit-con'
  const showDup = (key, revert) => { setDupWarning(key); setTimeout(() => { setDupWarning(null); revert?.(); }, 300); };

  const smCustomCompl  = () => completions.filter(c => !c._builtin);
  const smCustomConstr = () => constructions.filter(c => !c._builtin);
  const smAllCustom    = () => [...smCustomCompl().map(c => ({ ...c, _smType: "completion" })),
                                ...smCustomConstr().map(c => ({ ...c, _smType: "construction" }))];
  const smGetLabel = c => c.prompt || c.words?.join(", ") || "";
  const smBuildPayload = (filename, items) => ({
    ppaExport: true, version: 1, moduleId: SM_MODULE_ID, filename,
    exportedAt: new Date().toISOString(),
    completions:   items.filter(c => c._smType === "completion").map(({ _smType, ...rest }) => rest),
    constructions: items.filter(c => c._smType === "construction").map(({ _smType, ...rest }) => rest),
  });

  const handleSmExport = (selectedIds, filename) => {
    const toExport = smAllCustom().filter(c => selectedIds.has(ppaItemId(c)));
    const updatedC  = ppaRecordExportInMemory(toExport.filter(c => c._smType === "completion"), filename);
    const updatedX  = ppaRecordExportInMemory(toExport.filter(c => c._smType === "construction"), filename);
    const cMap = Object.fromEntries(updatedC.map(c => [c._id, c]));
    const xMap = Object.fromEntries(updatedX.map(c => [c._id, c]));
    saveCompletions(completions.map(c => cMap[c._id] ?? c));
    saveConstructions(constructions.map(c => xMap[c._id] ?? c));
    ppaAddKnownFile(SM_MODULE_ID, filename);
    ppaDownload(filename, smBuildPayload(filename, toExport));
    setShowExport(false);
  };

  const handleSmImport = (files) => {
    ppaHandleImport(SM_MODULE_ID, files, SM_MODULE_ID,
      (data, filename) => {
        const inC = (data.completions   || []).map(c => ({ ...c, _id: c._id || `smc-${Date.now()}`, _sourceFile: filename }));
        const inX = (data.constructions || []).map(c => ({ ...c, _id: c._id || `smx-${Date.now()}`, _sourceFile: filename }));
        const existC = new Set(completions.map(c => c._id));
        const existX = new Set(constructions.map(c => c._id));
        const newC = inC.filter(c => !existC.has(c._id));
        const newX = inX.filter(c => !existX.has(c._id));
        saveCompletions([...completions, ...newC]);
        saveConstructions([...constructions, ...newX]);
        return { newItems: [...inC, ...inX], message: `${newC.length + newX.length} items from ${filename}${PPA_EXT}` };
      },
      results => setImportToast({ text: results.map(r => r.message).join(", ") }),
      (fn, msg) => alert(`Import error (${fn}${PPA_EXT}): ${msg}`)
    );
  };

  const openAdmin = () => { setPinPassed(false); setAdminOpen(true); };
  const forceCloseAdmin = () => setAdminOpen(false);
  const closeAdmin = () => {
    const snaps = ppaGetSnapshots();
    const dirty = smAllCustom().filter(c => ppaIsItemDirty(c, snaps));
    if (dirty.length > 0) { setShowReexport(true); return; }
    setAdminOpen(false);
  };

  const tasks = mode === "completion" ? completions : constructions;
  const task = tasks[taskIdx % (tasks.length || 1)] || {};

  const getAIFeedback = () => {
    if (!input.trim()) return;
    setLoadingAI(true);
    const prompt = mode === "completion"
      ? `Patient was given sentence stem: "${task.prompt}" and completed it with: "${input}". Provide brief, warm clinical feedback on their sentence completion (grammar, meaning, fluency). 2-3 sentences max.`
      : `Patient was asked to construct a sentence using words: [${task.words?.join(", ")}]. Their sentence was: "${input}". Provide brief warm feedback on word order, grammar, meaning. 2-3 sentences.`;
    setPendingAI([{ role: "user", content: prompt }]);
    addToLog({ type: "sentence", mode, input, time: new Date().toLocaleTimeString() });
  };

  const next = () => { setTaskIdx(i => i + 1); setInput(""); setFeedback(""); setPendingAI(null); };

  // ── admin helpers — completions ─────────────────────────────────────────────
  const addCompletion = () => {
    if (!newPrompt.trim()) return;
    const newComp = { prompt: newPrompt.trim(), hint: newHint.trim() || "open" };
    const result = checkDuplicate(completions, newComp, it => it.prompt, ["hint"]);
    if (result.action === "ignore") { showDup('comp', () => { setNewPrompt(""); setNewHint(""); }); return; }
    if (result.action === "update") {
      saveCompletions(completions.map(c => c._id === result.match._id ? { ...result.merged, _id: c._id } : c));
      setNewPrompt(""); setNewHint(""); return;
    }
    if (result.action === "conflict") {
      setSmConflict({ newItem: newComp, match: result.match, conflictFields: result.conflictFields, itemType: "completion" });
      return;
    }
    saveCompletions([...completions, { ...newComp, _id: `smc-custom-${Date.now()}` }]);
    setNewPrompt(""); setNewHint("");
  };
  const deleteCompletion = (i) => saveCompletions(completions.filter((_, j) => j !== i));
  const saveEditComp = () => {
    if (!editCompPrompt.trim()) return;
    const edited = { prompt: editCompPrompt.trim(), hint: editCompHint.trim() || completions[editingComp].hint };
    const others = completions.filter((_, i) => i !== editingComp);
    const result = checkDuplicate(others, edited, it => it.prompt, ["hint"]);
    if (result.action === "ignore") { showDup('edit-comp', () => { setEditCompPrompt(completions[editingComp].prompt); setEditCompHint(completions[editingComp].hint); }); return; }
    if (result.action === "update") {
      saveCompletions(completions.map((c, i) => i === editingComp ? c : c._id === result.match._id ? { ...result.merged, _id: c._id } : c));
      setEditingComp(null); return;
    }
    if (result.action === "conflict") {
      setSmConflict({ newItem: edited, match: result.match, conflictFields: result.conflictFields, itemType: "completion" });
      return;
    }
    saveCompletions(completions.map((c, i) => i !== editingComp ? c : { ...edited, _id: c._id }));
    setEditingComp(null);
  };

  // ── admin helpers — constructions ───────────────────────────────────────────
  const addConstruction = () => {
    const words = newConWords.split(",").map(w => w.trim()).filter(Boolean);
    if (words.length < 2) return;
    const newCon = { words, hint: newConHint.trim() || "Make a sentence" };
    const result = checkDuplicate(constructions, newCon,
      it => (it.words ?? []).map(w => w.toLowerCase()).sort().join(","),
      ["hint"]);
    if (result.action === "ignore") { showDup('con', () => { setNewConWords(""); setNewConHint(""); }); return; }
    if (result.action === "update") {
      saveConstructions(constructions.map(c => c._id === result.match._id ? { ...result.merged, _id: c._id } : c));
      setNewConWords(""); setNewConHint(""); return;
    }
    if (result.action === "conflict") {
      setSmConflict({ newItem: newCon, match: result.match, conflictFields: result.conflictFields, itemType: "construction" });
      return;
    }
    saveConstructions([...constructions, { ...newCon, _id: `smx-custom-${Date.now()}` }]);
    setNewConWords(""); setNewConHint("");
  };
  const deleteConstruction = (i) => saveConstructions(constructions.filter((_, j) => j !== i));
  const saveEditCon = () => {
    const words = editConWords.split(",").map(w => w.trim()).filter(Boolean);
    if (words.length < 2) return;
    const edited = { words, hint: editConHint.trim() || constructions[editingCon].hint };
    const others = constructions.filter((_, i) => i !== editingCon);
    const result = checkDuplicate(others, edited,
      it => (it.words ?? []).map(w => w.toLowerCase()).sort().join(","),
      ["hint"]);
    if (result.action === "ignore") { showDup('edit-con', () => { setEditConWords(constructions[editingCon].words.join(", ")); setEditConHint(constructions[editingCon].hint); }); return; }
    if (result.action === "update") {
      saveConstructions(constructions.map((c, i) => i === editingCon ? c : c._id === result.match._id ? { ...result.merged, _id: c._id } : c));
      setEditingCon(null); return;
    }
    if (result.action === "conflict") {
      setSmConflict({ newItem: edited, match: result.match, conflictFields: result.conflictFields, itemType: "construction" });
      return;
    }
    saveConstructions(constructions.map((c, i) => i !== editingCon ? c : { ...edited, _id: c._id }));
    setEditingCon(null);
  };

  if (adminOpen) {
    return (
      <div style={{ position: "relative", height: "100%" }}>
        {/* Conflict resolution dialog */}
        {smConflict && (
          <DuplicateConflictModal
            itemLabel={smConflict.itemType === "completion" ? smConflict.match.prompt : (smConflict.match.words ?? []).join(", ")}
            existing={smConflict.match}
            incoming={smConflict.newItem}
            conflictFields={smConflict.conflictFields}
            onResolve={merged => {
              if (smConflict.itemType === "completion") {
                saveCompletions(completions.map(c => c._id === smConflict.match._id ? merged : c));
                setEditingComp(null);
              } else {
                saveConstructions(constructions.map(c => c._id === smConflict.match._id ? merged : c));
                setEditingCon(null);
              }
              setSmConflict(null);
            }}
            onCancel={() => setSmConflict(null)}
          />
        )}
        {/* Export/import dialogs */}
        {showExport && (
          <PpaExportDialog moduleId={SM_MODULE_ID} items={smAllCustom()} getLabel={smGetLabel}
            onExport={handleSmExport} onClose={() => setShowExport(false)} />
        )}
        {showReexport && (
          <PpaReexportDialog moduleId={SM_MODULE_ID}
            dirtyItems={smAllCustom().filter(c => ppaIsItemDirty(c, ppaGetSnapshots()))}
            getLabel={smGetLabel} knownFiles={ppaFilesForModule(SM_MODULE_ID)}
            onReexport={(s, gef) => { ppaHandleReexport(SM_MODULE_ID, [], smAllCustom(), s, gef, smBuildPayload, updated => { saveCompletions([...completions.filter(c => c._builtin), ...updated.filter(c => c._smType==="completion").map(({_smType,...r})=>r)]); saveConstructions([...constructions.filter(c => c._builtin), ...updated.filter(c => c._smType==="construction").map(({_smType,...r})=>r)]); }); forceCloseAdmin(); }}
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
        <div style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
          {!pinPassed ? (
            <AdminPinEntry onSuccess={() => setPinPassed(true)} onCancel={forceCloseAdmin} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#2D3B36", borderRadius: 14, padding: "14px 20px" }}>
                <span style={{ fontSize: 20 }}>{"⚙️"}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#E8F4F2", flex: 1 }}>Sentence Work Admin</span>
                <PpaAdminToolbar onExport={() => setShowExport(true)} onImport={handleSmImport} />
                <button onClick={() => { saveCompletions(smSeedCompl()); saveConstructions(smSeedConstr()); }}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #C07070", background: "transparent", color: "#E07070", cursor: "pointer", fontSize: 12 }}>Reset</button>
                <button onClick={closeAdmin} style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid #4E8B80", background: "transparent", color: "#7BAE9F", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>✕ Close</button>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 8, background: "#F5F0E8", borderRadius: 14, padding: 6 }}>
                {["completion", "construction"].map(t => (
                  <button key={t} onClick={() => setAdminTab(t)}
                    style={{ flex: 1, padding: "9px 8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, background: adminTab === t ? "#4E8B80" : "transparent", color: adminTab === t ? "#fff" : "#666", transition: "all 0.2s" }}>
                    {t === "completion" ? `Completions (${completions.length})` : `Constructions (${constructions.length})`}
                  </button>
                ))}
              </div>

              {/* Completion list */}
              {adminTab === "completion" && (
                <div style={{ background: "#FFFDF9", borderRadius: 16, border: "1px solid #E8E0D0", overflow: "hidden" }}>
                  {completions.map((c, i) => (
                    <div key={i} style={{ padding: "12px 18px", borderBottom: "1px solid #F0EDE8" }}>
                      {editingComp === i ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {dupWarning === 'edit-comp' && <div style={{ fontSize: 12, color: "#C07070", fontWeight: 600 }}>Duplicate — ignored</div>}
                          <input value={editCompPrompt} onChange={e => setEditCompPrompt(e.target.value)} placeholder="Sentence stem..."
                            style={{ padding: "7px 10px", borderRadius: 8, border: "2px solid #4E8B80", fontSize: 14, outline: "none" }} />
                          <input value={editCompHint} onChange={e => setEditCompHint(e.target.value)} placeholder="Topic hint..."
                            style={{ padding: "7px 10px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 13, outline: "none" }} />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={saveEditComp} style={{ padding: "5px 14px", background: "#4E8B80", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Save</button>
                            <button onClick={() => setEditingComp(null)} style={{ padding: "5px 10px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 8, cursor: "pointer", color: "#666" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 15, color: "#2D3B36", fontWeight: 500 }}>{c.prompt}</div>
                            <div style={{ fontSize: 12, color: "#9B7FB8", marginTop: 2 }}>Topic: {c.hint}</div>
                          </div>
                          <button onClick={() => { setEditingComp(i); setEditCompPrompt(c.prompt); setEditCompHint(c.hint); }}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 13, color: "#666" }}>✏ Edit</button>
                          <button onClick={() => deleteCompletion(i)}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #E0A0A0", background: "#FFF5F5", cursor: "pointer", fontSize: 13, color: "#C07070" }}>✕</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Add new */}
                  <div style={{ padding: "14px 18px", background: "#F8F6F2", display: "flex", flexDirection: "column", gap: 8 }}>
                    {dupWarning === 'comp' && <div style={{ fontSize: 12, color: "#C07070", fontWeight: 600 }}>Duplicate — ignored</div>}
                    <input value={newPrompt} onChange={e => setNewPrompt(e.target.value)} placeholder="New sentence stem (e.g. My favourite place is...)"
                      style={{ padding: "8px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 14, outline: "none", background: "#FFFDF9" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={newHint} onChange={e => setNewHint(e.target.value)} onKeyDown={e => e.key === "Enter" && addCompletion()} placeholder="Topic hint (optional)"
                        style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 13, outline: "none", background: "#FFFDF9" }} />
                      <button onClick={addCompletion}
                        style={{ padding: "8px 18px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Add</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Construction list */}
              {adminTab === "construction" && (
                <div style={{ background: "#FFFDF9", borderRadius: 16, border: "1px solid #E8E0D0", overflow: "hidden" }}>
                  {constructions.map((c, i) => (
                    <div key={i} style={{ padding: "12px 18px", borderBottom: "1px solid #F0EDE8" }}>
                      {editingCon === i ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {dupWarning === 'edit-con' && <div style={{ fontSize: 12, color: "#C07070", fontWeight: 600 }}>Duplicate — ignored</div>}
                          <input value={editConWords} onChange={e => setEditConWords(e.target.value)} placeholder="Words comma-separated (e.g. dog, run, park, the)"
                            style={{ padding: "7px 10px", borderRadius: 8, border: "2px solid #4E8B80", fontSize: 14, outline: "none" }} />
                          <input value={editConHint} onChange={e => setEditConHint(e.target.value)} placeholder="Hint..."
                            style={{ padding: "7px 10px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 13, outline: "none" }} />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={saveEditCon} style={{ padding: "5px 14px", background: "#4E8B80", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Save</button>
                            <button onClick={() => setEditingCon(null)} style={{ padding: "5px 10px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 8, cursor: "pointer", color: "#666" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 3 }}>
                              {c.words.map((w, j) => <span key={j} style={{ padding: "3px 10px", background: "#E8F4F2", borderRadius: 12, fontSize: 13, color: "#4E8B80", fontWeight: 600, border: "1px solid #B0D4CE" }}>{w}</span>)}
                            </div>
                            <div style={{ fontSize: 12, color: "#9B7FB8" }}>{c.hint}</div>
                          </div>
                          <button onClick={() => { setEditingCon(i); setEditConWords(c.words.join(", ")); setEditConHint(c.hint); }}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 13, color: "#666" }}>✏ Edit</button>
                          <button onClick={() => deleteConstruction(i)}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #E0A0A0", background: "#FFF5F5", cursor: "pointer", fontSize: 13, color: "#C07070" }}>✕</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Add new */}
                  <div style={{ padding: "14px 18px", background: "#F8F6F2", display: "flex", flexDirection: "column", gap: 8 }}>
                    {dupWarning === 'con' && <div style={{ fontSize: 12, color: "#C07070", fontWeight: 600 }}>Duplicate — ignored</div>}
                    <input value={newConWords} onChange={e => setNewConWords(e.target.value)} placeholder="Words comma-separated (e.g. cat, sat, mat, the)"
                      style={{ padding: "8px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 14, outline: "none", background: "#FFFDF9" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={newConHint} onChange={e => setNewConHint(e.target.value)} onKeyDown={e => e.key === "Enter" && addConstruction()} placeholder="Hint (e.g. Make a sentence about the cat)"
                        style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 13, outline: "none", background: "#FFFDF9" }} />
                      <button onClick={addConstruction}
                        style={{ padding: "8px 18px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Add</button>
                    </div>
                    <div style={{ fontSize: 12, color: "#999" }}>Enter at least 2 words separated by commas</div>
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
      {pendingAI && <CallAPI messages={pendingAI} onResult={t => { setFeedback(t); setLoadingAI(false); setPendingAI(null); }} onError={() => { setLoadingAI(false); setPendingAI(null); }} />}

      {/* Admin gear */}
      <button onClick={openAdmin} title="Admin: manage sentence tasks"
        style={{ position: "absolute", top: 8, right: 8, zIndex: 10, width: 34, height: 34, borderRadius: "50%", border: "2px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", transition: "all 0.2s" }}
        onMouseOver={e => { e.currentTarget.style.borderColor = "#4E8B80"; e.currentTarget.style.color = "#4E8B80"; }}
        onMouseOut={e => { e.currentTarget.style.borderColor = "#D5CFC4"; e.currentTarget.style.color = "#888"; }}>
        {"⚙️"}
      </button>

      <div style={{ display: "flex", gap: 8, background: "#F5F0E8", borderRadius: 14, padding: 6 }}>
        {["completion", "construction"].map(m => (
          <button key={m} onClick={() => { setMode(m); setTaskIdx(0); setInput(""); setFeedback(""); }}
            style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, background: mode === m ? "#4E8B80" : "transparent", color: mode === m ? "#fff" : "#666", transition: "all 0.2s" }}>
            {m === "completion" ? "Sentence Completion" : "Sentence Construction"}
          </button>
        ))}
      </div>

      <div style={{ background: "#FFFDF9", borderRadius: 20, padding: 28, boxShadow: "0 4px 20px rgba(0,0,0,0.06)", border: "1px solid #E8E0D0" }}>
        {mode === "completion" ? (
          <>
            <div style={{ fontSize: 13, color: "#999", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>Complete the sentence</div>
            <div style={{ fontSize: 22, color: "#2D3B36", fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}>{task.prompt}</div>
            <div style={{ fontSize: 13, color: "#9B7FB8", marginBottom: 16 }}>Topic: {task.hint}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "#999", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>Make a sentence using these words</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {(task.words || []).map((w, i) => (
                <span key={i} style={{ padding: "6px 14px", background: "#E8F4F2", borderRadius: 20, fontSize: 16, color: "#4E8B80", fontWeight: 600, border: "1px solid #B0D4CE" }}>{w}</span>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "#9B7FB8", marginBottom: 16 }}>Hint: {task.hint}</div>
          </>
        )}

        <textarea value={input} onChange={e => setInput(e.target.value)}
          placeholder="Type your sentence here..."
          style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "2px solid #D5CFC4", fontSize: 17, resize: "none", minHeight: 80, background: "#FFFDF9", color: "#2D3B36", outline: "none", lineHeight: 1.5, fontFamily: "inherit" }}
          rows={3}
        />

        {!feedback && (
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <Btn color="#4E8B80" onClick={getAIFeedback}>Get Feedback</Btn>
            <Btn color="#999" onClick={next}>Skip →</Btn>
          </div>
        )}
      </div>

      {(loadingAI || feedback) && (
        <div style={{ background: "#F0F7F5", borderRadius: 14, padding: "16px 20px", border: "1px solid #B0D4CE" }}>
          <div style={{ fontSize: 13, color: "#4E8B80", fontWeight: 600, marginBottom: 6 }}>🧠 Dr. Aria's Feedback</div>
          {loadingAI ? <ThinkingDots /> : <div style={{ fontSize: 16, color: "#2D3B36", lineHeight: 1.6 }}>{feedback}</div>}
          {feedback && <button onClick={next} style={{ marginTop: 12, padding: "10px 20px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 15 }}>Next task →</button>}
        </div>
      )}
    </div>
  );
}
