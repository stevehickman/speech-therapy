import { useState, useRef, useEffect, useCallback, useMemo } from "react";

import { CLAUDE_MODEL, SYSTEM_PROMPT } from "./data/config.js";
import { TOOLS }          from "./data/tools.js";
import { NAMING_ITEMS }   from "./data/namingItems.js";
import { SCRIPTS } from "./data/scripts.js";
import { REPETITION_LEVELS } from "./data/repetitionItems.js";
import { SENTENCE_COMPLETIONS, SENTENCE_CONSTRUCTIONS } from "./data/sentenceTasks.js";
import { PPA_EXT } from "./ExportImportSystem.jsx";
import { ASSESSMENT_TASKS } from "./data/assessmentTasks.js";
import {
  VIDEO_CLIPS, EMOJI_OPTIONS, Q_TYPES,
  makeBlankQuestion, extractYouTubeId,
} from "./data/videoClips.js";
import { useDictionaryLookup, isImageGraphic } from "./data/dictionary.js";
import SentenceBuilderModule from "./SentenceBuilderModule.jsx";
import NamingModule from "./NamingModule.jsx";

function CallAPI({ messages, onResult, onError, system = SYSTEM_PROMPT }) {
  useEffect(() => {
    let cancelled = false;
    async function call() {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1000, system, messages }),
        });
        const data = await res.json();
        if (!cancelled) {
          const text = data.content?.map(b => b.text || "").join("") || "I'm here. How can I help?";
          onResult(text);
        }
      } catch (e) {
        if (!cancelled) onError(e.message);
      }
    }
    call();
    return () => { cancelled = true; };
  }, []);
  return null;
}

function ThinkingDots() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "8px 0" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: "50%", background: "#7BAE9F",
          animation: "pulse 1.4s ease-in-out infinite",
          animationDelay: `${i * 0.2}s`
        }} />
      ))}
    </div>
  );
}

// ---- MAIN THERAPIST CHAT ----
function TherapistModule({ sessionLog, addToLog }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingMessages, setPendingMessages] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: "assistant", content: "Hello. I'm Dr. Aria, your speech therapist. I'm here to help and support you. There's no rush here — take all the time you need. How are you feeling today?" }]);
    }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);
    setPendingMessages(newMsgs);
    addToLog({ type: "chat", content: input.trim(), time: new Date().toLocaleTimeString() });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      {pendingMessages && (
        <CallAPI
          messages={pendingMessages}
          onResult={text => {
            setMessages(m => [...m, { role: "assistant", content: text }]);
            setLoading(false);
            setPendingMessages(null);
          }}
          onError={err => {
            setMessages(m => [...m, { role: "assistant", content: "I'm sorry, I had trouble connecting. Please try again." }]);
            setLoading(false);
            setPendingMessages(null);
          }}
        />
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
          }}>
            {m.role === "assistant" && (
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #7BAE9F, #4E8B80)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginRight: 10, flexShrink: 0, marginTop: 4 }}>🧠</div>
            )}
            <div style={{
              maxWidth: "72%",
              padding: "14px 18px",
              borderRadius: m.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
              background: m.role === "user" ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#F5F0E8",
              color: m.role === "user" ? "#fff" : "#2D3B36",
              fontSize: 17,
              lineHeight: 1.65,
              boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #7BAE9F, #4E8B80)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginRight: 10 }}>🧠</div>
            <div style={{ background: "#F5F0E8", borderRadius: "20px 20px 20px 4px", padding: "10px 18px" }}>
              <ThinkingDots />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "16px 20px", borderTop: "1px solid #E8E0D0", background: "#FFFDF9", display: "flex", gap: 10, alignItems: "flex-end" }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type here, or speak your thoughts... (Enter to send)"
          style={{
            flex: 1, padding: "12px 16px", borderRadius: 14, border: "2px solid #D5CFC4",
            fontSize: 16, resize: "none", minHeight: 52, maxHeight: 120,
            background: "#FFFDF9", color: "#2D3B36", outline: "none", fontFamily: "inherit",
            lineHeight: 1.5,
          }}
          rows={2}
        />
        <button onClick={send} disabled={!input.trim() || loading} style={{
          padding: "14px 22px", borderRadius: 14, border: "none", cursor: "pointer",
          background: input.trim() && !loading ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#C5BEB4",
          color: "#fff", fontSize: 18, transition: "all 0.2s",
        }}>➤</button>
      </div>
    </div>
  );
}

// ---- SHARED ADMIN HELPERS ----
const ADMIN_PIN = "1234";

function AdminPinEntry({ onSuccess, onCancel }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const submit = () => {
    if (pin === ADMIN_PIN) { onSuccess(); }
    else { setShake(true); setPin(""); setTimeout(() => setShake(false), 600); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 240, gap: 18 }}>
      <div style={{ fontSize: 32 }}>{"🔒"}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36" }}>Admin PIN required</div>
      <div style={{ animation: shake ? "pinShake 0.5s" : "none", display: "flex", gap: 10, flexDirection: "column", alignItems: "center" }}>
        <input type="password" value={pin} onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="Enter PIN" autoFocus maxLength={8}
          style={{ padding: "12px 20px", fontSize: 22, borderRadius: 12, border: "2px solid #D5CFC4", textAlign: "center", letterSpacing: 8, width: 160, outline: "none", background: "#FFFDF9" }} />
        {shake && <div style={{ color: "#C07070", fontSize: 13 }}>Incorrect PIN</div>}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={submit} style={{ padding: "10px 28px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 15 }}>Unlock</button>
        <button onClick={onCancel} style={{ padding: "10px 20px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 10, cursor: "pointer", fontWeight: 600, color: "#666", fontSize: 15 }}>Cancel</button>
      </div>
      <style>{"`@keyframes pinShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`"}</style>
    </div>
  );
}

// ---- REPETITION ----
function RepetitionModule({ addToLog }) {
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
    const next = levels.map((l, i) => i !== li ? l : { ...l, items: [...l.items, newItem.trim()] });
    saveLevels(next); setNewItem("");
  };
  const saveEdit = () => {
    if (!editText.trim() || !editingItem) return;
    const { levelIdx, itemIdx } = editingItem;
    const next = levels.map((l, i) => i !== levelIdx ? l : {
      ...l, items: l.items.map((it, j) => j === itemIdx ? editText.trim() : it),
    });
    saveLevels(next); setEditingItem(null); setEditText("");
  };
  const addLevel = () => {
    if (!newLevelName.trim()) return;
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
                <div style={{ display: "flex", gap: 8, background: "#F0F7F5", borderRadius: 12, padding: "12px 16px", border: "1px solid #B0D4CE" }}>
                  <input value={newLevelName} onChange={e => setNewLevelName(e.target.value)} onKeyDown={e => e.key === "Enter" && addLevel()}
                    placeholder="Level name (e.g. Long Sentences)" autoFocus
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid #B0D4CE", fontSize: 14, outline: "none" }} />
                  <button onClick={addLevel} style={{ padding: "8px 16px", background: "#4E8B80", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Add</button>
                  <button onClick={() => setAddingLevel(false)} style={{ padding: "8px 12px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 8, cursor: "pointer", color: "#666" }}>Cancel</button>
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
                        <>
                          <input value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingItem(null); }}
                            autoFocus style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "2px solid #4E8B80", fontSize: 15, outline: "none" }} />
                          <button onClick={saveEdit} style={{ padding: "5px 12px", background: "#4E8B80", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Save</button>
                          <button onClick={() => setEditingItem(null)} style={{ padding: "5px 10px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#666" }}>✕</button>
                        </>
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
                  <div style={{ padding: "12px 18px", display: "flex", gap: 8, background: "#F8F6F2" }}>
                    <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem(adminLevel)}
                      placeholder={`Add new ${levels[adminLevel].name.toLowerCase().replace(/s$/, "")}...`}
                      style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 14, outline: "none", background: "#FFFDF9" }} />
                    <button onClick={() => addItem(adminLevel)}
                      style={{ padding: "8px 18px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>Add</button>
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


// ---- SENTENCE WORK ----
function SentenceModule({ addToLog }) {
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
    saveCompletions([...completions, { prompt: newPrompt.trim(), hint: newHint.trim() || "open", _id: `smc-custom-${Date.now()}` }]);
    setNewPrompt(""); setNewHint("");
  };
  const deleteCompletion = (i) => saveCompletions(completions.filter((_, j) => j !== i));
  const saveEditComp = () => {
    if (!editCompPrompt.trim()) return;
    saveCompletions(completions.map((c, i) => i !== editingComp ? c : { prompt: editCompPrompt.trim(), hint: editCompHint.trim() || c.hint }));
    setEditingComp(null);
  };

  // ── admin helpers — constructions ───────────────────────────────────────────
  const addConstruction = () => {
    const words = newConWords.split(",").map(w => w.trim()).filter(Boolean);
    if (words.length < 2) return;
    saveConstructions([...constructions, { words, hint: newConHint.trim() || "Make a sentence", _id: `smx-custom-${Date.now()}` }]);
    setNewConWords(""); setNewConHint("");
  };
  const deleteConstruction = (i) => saveConstructions(constructions.filter((_, j) => j !== i));
  const saveEditCon = () => {
    const words = editConWords.split(",").map(w => w.trim()).filter(Boolean);
    if (words.length < 2) return;
    saveConstructions(constructions.map((c, i) => i !== editingCon ? c : { words, hint: editConHint.trim() || c.hint }));
    setEditingCon(null);
  };

  if (adminOpen) {
    return (
      <div style={{ position: "relative", height: "100%" }}>
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


// ---- SCRIPT TRAINING ----
function ScriptsModule() {
  // ── data ────────────────────────────────────────────────────────────────────
  const SC_MODULE_ID = "scripts";
  const scSeed = () => SCRIPTS.map((s, i) => ({ ...s, _id: `sc-builtin-${i}`, _builtin: true }));
  const scEnsureIds = ss => ss.map((s, i) => s._id ? s : { ...s, _id: `sc-${Date.now()}-${i}` });

  const [scripts, setScripts] = useState(() => {
    try {
      const s = localStorage.getItem("ppa_scripts");
      return s ? scEnsureIds(JSON.parse(s)) : scSeed();
    } catch { return scSeed(); }
  });
  const saveScripts = (next) => { setScripts(next); localStorage.setItem("ppa_scripts", JSON.stringify(next)); };
  useEffect(() => { saveScripts(scripts); }, []); // seed localStorage on mount

  // ── practice state ──────────────────────────────────────────────────────────
  const [selected, setSelected] = useState(0);
  const [practiced, setPracticed] = useState({});
  const [activePhraseIdx, setActivePhraseIdx] = useState(null);

  // TTS state
  const [speaking, setSpeaking] = useState(null);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [rate, setRate] = useState(0.85);

  // Speech recognition state
  const [srAvailable] = useState(() => !!( window.SpeechRecognition || window.webkitSpeechRecognition));
  const [srEnabled, setSrEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [srResult, setSrResult] = useState(null);
  const recognizerRef = useRef(null);

  // ── admin state ─────────────────────────────────────────────────────────────
  const [adminOpen, setAdminOpen] = useState(false);
  const [pinPassed, setPinPassed] = useState(false);
  const [adminSit, setAdminSit] = useState(0);      // which situation is active in admin
  const [newPhrase, setNewPhrase] = useState("");
  const [newSitName, setNewSitName] = useState("");
  const [addingSit, setAddingSit] = useState(false);
  const [editingPhrase, setEditingPhrase] = useState(null); // { sitIdx, phraseIdx }
  const [editPhraseText, setEditPhraseText] = useState("");
  const [editingSitName, setEditingSitName] = useState(null); // sitIdx
  const [editSitNameText, setEditSitNameText] = useState("");

  const [showExport,   setShowExport]   = useState(false);
  const [showReexport, setShowReexport] = useState(false);
  const [importToast,  setImportToast]  = useState(null);

  const scCustom    = () => scripts.filter(s => !s._builtin);
  const scGetLabel  = s => s.situation;
  const scBuildPayload = (filename, sits) => ({
    ppaExport: true, version: 1, moduleId: SC_MODULE_ID, filename,
    exportedAt: new Date().toISOString(), situations: sits,
  });

  const handleScExport = (selectedIds, filename) => {
    const toExport = scCustom().filter(s => selectedIds.has(ppaItemId(s)));
    const updated  = ppaRecordExportInMemory(toExport, filename);
    const idMap = Object.fromEntries(updated.map(s => [s._id, s]));
    saveScripts(scripts.map(s => idMap[s._id] ?? s));
    ppaAddKnownFile(SC_MODULE_ID, filename);
    ppaDownload(filename, scBuildPayload(filename, toExport));
    setShowExport(false);
  };

  const handleScImport = (files) => {
    ppaHandleImport(SC_MODULE_ID, files, SC_MODULE_ID,
      (data, filename) => {
        const incoming = (data.situations || []).map(s => ({ ...s, _id: s._id || `sc-${Date.now()}`, _sourceFile: filename }));
        const existingIds = new Set(scripts.map(s => s._id));
        const newSits = incoming.filter(s => !existingIds.has(s._id));
        saveScripts([...scripts, ...newSits]);
        return { newItems: incoming, message: `${newSits.length} situations from ${filename}${PPA_EXT}` };
      },
      results => setImportToast({ text: results.map(r => r.message).join(", ") }),
      (fn, msg) => alert(`Import error (${fn}${PPA_EXT}): ${msg}`)
    );
  };

  const openAdmin = () => { setPinPassed(false); setAdminOpen(true); };
  const forceCloseAdmin = () => setAdminOpen(false);
  const closeAdmin = () => {
    const snaps = ppaGetSnapshots();
    const dirty = scCustom().filter(s => ppaIsItemDirty(s, snaps));
    if (dirty.length > 0) { setShowReexport(true); return; }
    setAdminOpen(false);
  };

  // ── voices ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) {
        setVoices(v);
        const preferred = v.find(x => /en[-_](US|GB|AU)/i.test(x.lang) && /natural|samantha|karen|moira|daniel|google/i.test(x.name))
          || v.find(x => /en/i.test(x.lang)) || v[0];
        setSelectedVoice(preferred);
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  const speak = (phrase) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(phrase);
    if (selectedVoice) utt.voice = selectedVoice;
    utt.rate = rate; utt.pitch = 1.0;
    utt.onstart = () => setSpeaking(phrase);
    utt.onend = () => setSpeaking(null);
    utt.onerror = () => setSpeaking(null);
    window.speechSynthesis.speak(utt);
  };

  const stopSpeaking = () => { window.speechSynthesis.cancel(); setSpeaking(null); };

  const startListening = (phrase) => {
    if (!srAvailable) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 3;
    rec.onstart = () => { setListening(true); setTranscript(""); setSrResult(null); };
    rec.onresult = (e) => {
      const interim = Array.from(e.results).map(r => r[0].transcript).join(" ");
      setTranscript(interim);
      if (e.results[e.results.length - 1].isFinal) {
        const heard = interim.trim().toLowerCase();
        const target = phrase.toLowerCase().replace(/[^a-z0-9 ']/g, "");
        const heardClean = heard.replace(/[^a-z0-9 ']/g, "");
        const targetWords = target.split(/\s+/);
        const heardWords = heardClean.split(/\s+/);
        const matched = targetWords.filter(w => heardWords.includes(w)).length;
        const score = matched / targetWords.length;
        const match = score >= 0.75 ? "good" : score >= 0.4 ? "partial" : "low";
        setSrResult({ phrase, heard: interim.trim(), match, score: Math.round(score * 100) });
        if (match === "good") setPracticed(p => ({ ...p, [phrase]: true }));
      }
    };
    rec.onerror = (e) => { setListening(false); if (e.error === "not-allowed") setSrResult({ phrase, heard: "", match: "denied", score: 0 }); };
    rec.onend = () => setListening(false);
    recognizerRef.current = rec;
    rec.start();
  };

  const stopListening = () => { recognizerRef.current?.stop(); setListening(false); };

  const matchColors = { good: "#4E8B80", partial: "#D4A843", low: "#C07070", denied: "#999" };
  const matchLabels = { good: "✓ Great match!", partial: "〜 Partial match — keep practicing", low: "Keep trying — say it slowly", denied: "Microphone access was denied" };

  // ── admin helpers ───────────────────────────────────────────────────────────
  const addPhrase = (si) => {
    if (!newPhrase.trim()) return;
    const next = scripts.map((s, i) => i !== si ? s : { ...s, phrases: [...s.phrases, newPhrase.trim()] });
    saveScripts(next); setNewPhrase("");
  };
  const deletePhrase = (si, pi) => {
    const next = scripts.map((s, i) => i !== si ? s : { ...s, phrases: s.phrases.filter((_, j) => j !== pi) });
    saveScripts(next);
  };
  const saveEditPhrase = () => {
    if (!editPhraseText.trim() || !editingPhrase) return;
    const { sitIdx, phraseIdx } = editingPhrase;
    const next = scripts.map((s, i) => i !== sitIdx ? s : { ...s, phrases: s.phrases.map((p, j) => j === phraseIdx ? editPhraseText.trim() : p) });
    saveScripts(next); setEditingPhrase(null); setEditPhraseText("");
  };
  const addSituation = () => {
    if (!newSitName.trim()) return;
    saveScripts([...scripts, { situation: newSitName.trim(), phrases: [], _id: `sc-custom-${Date.now()}` }]);
    setNewSitName(""); setAddingSit(false);
  };
  const deleteSituation = (si) => {
    if (scripts.length <= 1) return;
    const next = scripts.filter((_, i) => i !== si);
    saveScripts(next);
    if (adminSit >= next.length) setAdminSit(next.length - 1);
    if (selected >= next.length) setSelected(next.length - 1);
  };
  const saveSitName = () => {
    if (!editSitNameText.trim()) return;
    const next = scripts.map((s, i) => i !== editingSitName ? s : { ...s, situation: editSitNameText.trim() });
    saveScripts(next); setEditingSitName(null);
  };

  // ── admin view ──────────────────────────────────────────────────────────────
  if (adminOpen) {
    return (
      <div style={{ position: "relative", height: "100%" }}>
        {/* Export/import dialogs */}
        {showExport && (
          <PpaExportDialog moduleId={SC_MODULE_ID} items={scCustom()} getLabel={scGetLabel}
            onExport={handleScExport} onClose={() => setShowExport(false)} />
        )}
        {showReexport && (
          <PpaReexportDialog moduleId={SC_MODULE_ID}
            dirtyItems={scCustom().filter(s => ppaIsItemDirty(s, ppaGetSnapshots()))}
            getLabel={scGetLabel} knownFiles={ppaFilesForModule(SC_MODULE_ID)}
            onReexport={(s, gef) => { ppaHandleReexport(SC_MODULE_ID, [], scCustom(), s, gef, scBuildPayload, updated => saveScripts([...scripts.filter(s => s._builtin), ...updated])); forceCloseAdmin(); }}
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
                <span style={{ fontSize: 16, fontWeight: 700, color: "#E8F4F2", flex: 1 }}>Script Training Admin</span>
                <PpaAdminToolbar onExport={() => setShowExport(true)} onImport={handleScImport} />
                <button onClick={() => saveScripts(scSeed())}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #C07070", background: "transparent", color: "#E07070", cursor: "pointer", fontSize: 12 }}>Reset defaults</button>
                <button onClick={closeAdmin} style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid #4E8B80", background: "transparent", color: "#7BAE9F", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>✕ Close</button>
              </div>

              {/* Situation tabs */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {scripts.map((s, i) => (
                  <button key={i} onClick={() => setAdminSit(i)}
                    style={{ padding: "8px 14px", borderRadius: 20, border: `2px solid ${adminSit === i ? "#4E8B80" : "#D5CFC4"}`, background: adminSit === i ? "#E8F4F2" : "#FFFDF9", color: adminSit === i ? "#3A7A6F" : "#666", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                    {s.situation} <span style={{ color: "#999", fontWeight: 400 }}>({s.phrases.length})</span>
                  </button>
                ))}
                <button onClick={() => setAddingSit(true)} style={{ padding: "8px 14px", borderRadius: 20, border: "2px dashed #B0D4CE", background: "#F0F7F5", color: "#4E8B80", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>+ Situation</button>
              </div>

              {/* Add new situation */}
              {addingSit && (
                <div style={{ display: "flex", gap: 8, background: "#F0F7F5", borderRadius: 12, padding: "12px 16px", border: "1px solid #B0D4CE" }}>
                  <input value={newSitName} onChange={e => setNewSitName(e.target.value)} onKeyDown={e => e.key === "Enter" && addSituation()}
                    placeholder="Situation name (e.g. At the pharmacy)" autoFocus
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid #B0D4CE", fontSize: 14, outline: "none" }} />
                  <button onClick={addSituation} style={{ padding: "8px 16px", background: "#4E8B80", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Add</button>
                  <button onClick={() => setAddingSit(false)} style={{ padding: "8px 12px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 8, cursor: "pointer", color: "#666" }}>Cancel</button>
                </div>
              )}

              {/* Current situation phrases */}
              {scripts[adminSit] && (
                <div style={{ background: "#FFFDF9", borderRadius: 16, border: "1px solid #E8E0D0", overflow: "hidden" }}>
                  {/* Situation name header */}
                  <div style={{ padding: "12px 18px", background: "#F5F0E8", borderBottom: "1px solid #E8E0D0", display: "flex", alignItems: "center", gap: 10 }}>
                    {editingSitName === adminSit ? (
                      <>
                        <input value={editSitNameText} onChange={e => setEditSitNameText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveSitName(); if (e.key === "Escape") setEditingSitName(null); }}
                          autoFocus style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "2px solid #4E8B80", fontSize: 14, outline: "none" }} />
                        <button onClick={saveSitName} style={{ padding: "5px 12px", background: "#4E8B80", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Save</button>
                        <button onClick={() => setEditingSitName(null)} style={{ padding: "5px 10px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 8, cursor: "pointer", color: "#666", fontSize: 13 }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontWeight: 700, color: "#2D3B36", flex: 1, fontSize: 15 }}>{scripts[adminSit].situation}</span>
                        <button onClick={() => { setEditingSitName(adminSit); setEditSitNameText(scripts[adminSit].situation); }}
                          style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 12, color: "#666" }}>✏ Rename</button>
                        {scripts.length > 1 && (
                          <button onClick={() => deleteSituation(adminSit)} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #C07070", background: "transparent", color: "#C07070", cursor: "pointer", fontSize: 12 }}>Delete situation</button>
                        )}
                      </>
                    )}
                  </div>

                  {scripts[adminSit].phrases.length === 0 && (
                    <div style={{ padding: "20px", color: "#999", textAlign: "center", fontSize: 14 }}>No phrases yet — add one below</div>
                  )}

                  {scripts[adminSit].phrases.map((phrase, pi) => (
                    <div key={pi} style={{ padding: "12px 18px", borderBottom: "1px solid #F0EDE8", display: "flex", alignItems: "center", gap: 10 }}>
                      {editingPhrase?.sitIdx === adminSit && editingPhrase?.phraseIdx === pi ? (
                        <>
                          <input value={editPhraseText} onChange={e => setEditPhraseText(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveEditPhrase(); if (e.key === "Escape") setEditingPhrase(null); }}
                            autoFocus style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "2px solid #4E8B80", fontSize: 15, outline: "none" }} />
                          <button onClick={saveEditPhrase} style={{ padding: "5px 12px", background: "#4E8B80", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Save</button>
                          <button onClick={() => setEditingPhrase(null)} style={{ padding: "5px 10px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#666" }}>✕</button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 15, color: "#2D3B36" }}>"{phrase}"</span>
                          <button onClick={() => { setEditingPhrase({ sitIdx: adminSit, phraseIdx: pi }); setEditPhraseText(phrase); }}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 13, color: "#666" }}>✏ Edit</button>
                          <button onClick={() => deletePhrase(adminSit, pi)}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #E0A0A0", background: "#FFF5F5", cursor: "pointer", fontSize: 13, color: "#C07070" }}>✕</button>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Add phrase */}
                  <div style={{ padding: "12px 18px", display: "flex", gap: 8, background: "#F8F6F2" }}>
                    <input value={newPhrase} onChange={e => setNewPhrase(e.target.value)} onKeyDown={e => e.key === "Enter" && addPhrase(adminSit)}
                      placeholder={`Add phrase for "${scripts[adminSit].situation}"...`}
                      style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 14, outline: "none", background: "#FFFDF9" }} />
                    <button onClick={() => addPhrase(adminSit)}
                      style={{ padding: "8px 18px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>Add</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── practice view ───────────────────────────────────────────────────────────
  const phrases = scripts[Math.min(selected, scripts.length - 1)]?.phrases || [];

  return (
    <div style={{ padding: 24, maxWidth: 660, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18, position: "relative" }}>
      {/* Admin gear */}
      <button onClick={openAdmin} title="Admin: manage script situations and phrases"
        style={{ position: "absolute", top: 8, right: 8, zIndex: 10, width: 34, height: 34, borderRadius: "50%", border: "2px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", transition: "all 0.2s" }}
        onMouseOver={e => { e.currentTarget.style.borderColor = "#4E8B80"; e.currentTarget.style.color = "#4E8B80"; }}
        onMouseOut={e => { e.currentTarget.style.borderColor = "#D5CFC4"; e.currentTarget.style.color = "#888"; }}>
        {"⚙️"}
      </button>

      {/* Info banner */}
      <div style={{ background: "#F0F7F5", borderRadius: 14, padding: "14px 18px", border: "1px solid #B0D4CE" }}>
        <p style={{ margin: 0, fontSize: 15, color: "#2D5A54", lineHeight: 1.6 }}>
          <strong>Script Training</strong> — Listen to each phrase, then say it yourself. Practice until it feels automatic.
        </p>
      </div>

      {/* Settings row */}
      <div style={{ background: "#FFFDF9", borderRadius: 14, padding: "14px 18px", border: "1px solid #E8E0D0", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        {voices.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Voice</label>
            <select value={selectedVoice?.name || ""} onChange={e => setSelectedVoice(voices.find(v => v.name === e.target.value))}
              style={{ padding: "7px 10px", borderRadius: 9, border: "2px solid #D5CFC4", fontSize: 13, background: "#FFFDF9", color: "#2D3B36", outline: "none", cursor: "pointer" }}>
              {voices.filter(v => /en/i.test(v.lang)).map(v => (
                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
          <label style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
            Speed — {rate <= 0.7 ? "Slow" : rate <= 0.9 ? "Normal" : "Fast"}
          </label>
          <input type="range" min={0.5} max={1.2} step={0.05} value={rate} onChange={e => setRate(parseFloat(e.target.value))}
            style={{ accentColor: "#4E8B80", width: "100%" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Speech Recognition</label>
          {srAvailable ? (
            <button onClick={() => setSrEnabled(e => !e)} style={{ padding: "7px 14px", borderRadius: 20, border: "2px solid", borderColor: srEnabled ? "#4E8B80" : "#D5CFC4", background: srEnabled ? "#E8F4F2" : "#FFFDF9", color: srEnabled ? "#2D5A54" : "#888", fontWeight: 700, cursor: "pointer", fontSize: 13, transition: "all 0.2s", whiteSpace: "nowrap" }}>
              {srEnabled ? "🎤 On" : "🎤 Off"}
            </button>
          ) : (
            <span style={{ fontSize: 12, color: "#C07070", padding: "7px 0" }}>Not supported in this browser</span>
          )}
        </div>
      </div>

      {/* Situation tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {scripts.map((s, i) => (
          <button key={i} onClick={() => { setSelected(i); setActivePhraseIdx(null); setSrResult(null); setTranscript(""); stopSpeaking(); }}
            style={{ padding: "10px 18px", borderRadius: 20, border: "2px solid", borderColor: selected === i ? "#4E8B80" : "#D5CFC4", background: selected === i ? "#E8F4F2" : "#FFFDF9", color: selected === i ? "#3A7A6F" : "#666", fontWeight: 600, cursor: "pointer", fontSize: 14, transition: "all 0.2s" }}>
            {s.situation}
          </button>
        ))}
      </div>

      {/* Phrase cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {phrases.map((phrase, i) => {
          const isDone = practiced[phrase];
          const isActive = activePhraseIdx === i;
          const isSpeakingThis = speaking === phrase;
          const isListeningThis = listening && isActive;
          const thisResult = srResult?.phrase === phrase ? srResult : null;

          return (
            <div key={i} style={{ borderRadius: 16, border: `2px solid ${isDone ? "#4E8B80" : isActive ? "#9B7FB8" : "#E8E0D0"}`, background: isDone ? "#E8F4F2" : isActive ? "#FAF7FF" : "#FFFDF9", transition: "all 0.3s", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 26, flexShrink: 0 }}>{isDone ? "✅" : isActive ? "🔵" : "💬"}</div>
                <div style={{ flex: 1, fontSize: 20, color: "#2D3B36", fontWeight: 600, lineHeight: 1.4 }}>"{phrase}"</div>
                <button onClick={() => isSpeakingThis ? stopSpeaking() : speak(phrase)}
                  title={isSpeakingThis ? "Stop" : "Listen to this phrase"}
                  style={{ width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer", background: isSpeakingThis ? "#C07070" : "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s", boxShadow: isSpeakingThis ? "0 0 0 4px #C0707040" : "0 2px 8px #4E8B8040", animation: isSpeakingThis ? "speakPulse 1s ease-in-out infinite" : "none" }}>
                  {isSpeakingThis ? "■" : "▶"}
                </button>
                {srEnabled && (
                  <button onClick={() => { setActivePhraseIdx(isActive ? null : i); setSrResult(null); setTranscript(""); if (!isActive) { stopSpeaking(); stopListening(); } }}
                    style={{ padding: "9px 16px", borderRadius: 20, border: "2px solid", borderColor: isActive ? "#9B7FB8" : "#D5CFC4", background: isActive ? "#EEE8FF" : "#FFFDF9", color: isActive ? "#7A5AB8" : "#666", fontWeight: 700, cursor: "pointer", fontSize: 13, transition: "all 0.2s", whiteSpace: "nowrap" }}>
                    {isActive ? "Close" : "Practice 🎤"}
                  </button>
                )}
                {!srEnabled && !isDone && (
                  <button onClick={() => setPracticed(p => ({ ...p, [phrase]: true }))}
                    style={{ padding: "9px 16px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                    Practiced ✓
                  </button>
                )}
                {isDone && !srEnabled && <span style={{ fontSize: 13, color: "#4E8B80", fontWeight: 700 }}>Done!</span>}
              </div>

              {isActive && srEnabled && (
                <div style={{ borderTop: "1px solid #E0D8F0", padding: "16px 20px", background: "#F8F5FF", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ fontSize: 14, color: "#7A5AB8", lineHeight: 1.6 }}>
                    1. Press <strong>▶</strong> to hear the phrase. &nbsp; 2. Press <strong>🎤 Start</strong> to record yourself saying it.
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <button onClick={() => isListeningThis ? stopListening() : startListening(phrase)}
                      style={{ padding: "14px 28px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#fff", background: isListeningThis ? "linear-gradient(135deg, #C07070, #A05050)" : "linear-gradient(135deg, #9B7FB8, #7A5AB8)", boxShadow: isListeningThis ? "0 0 0 5px #C0707040" : "0 3px 12px #9B7FB840", transition: "all 0.2s", animation: isListeningThis ? "speakPulse 1s ease-in-out infinite" : "none" }}>
                      {isListeningThis ? "⏹ Stop" : "🎤 Start Speaking"}
                    </button>
                    {listening && isActive && (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        {[0,1,2,3,4].map(j => (
                          <div key={j} style={{ width: 4, borderRadius: 2, background: "#9B7FB8", animation: "waveBar 0.8s ease-in-out infinite", animationDelay: `${j * 0.1}s`, height: `${10 + Math.random() * 16}px` }} />
                        ))}
                        <span style={{ fontSize: 13, color: "#7A5AB8", marginLeft: 6 }}>Listening…</span>
                      </div>
                    )}
                  </div>
                  {(transcript || listening) && (
                    <div style={{ background: "#fff", borderRadius: 10, padding: "12px 16px", border: "2px solid #D0C8E8", minHeight: 44, fontSize: 17, color: "#2D3B36", fontStyle: transcript ? "normal" : "italic", lineHeight: 1.5 }}>
                      {transcript || <span style={{ color: "#bbb" }}>Waiting for speech…</span>}
                    </div>
                  )}
                  {thisResult && (
                    <div style={{ borderRadius: 12, padding: "14px 18px", background: matchColors[thisResult.match] + "18", border: `2px solid ${matchColors[thisResult.match]}40` }}>
                      <div style={{ fontWeight: 700, color: matchColors[thisResult.match], fontSize: 16, marginBottom: 6 }}>{matchLabels[thisResult.match]}</div>
                      {thisResult.heard && <div style={{ fontSize: 14, color: "#555" }}><span style={{ color: "#888" }}>You said: </span>"{thisResult.heard}"</div>}
                      {thisResult.match !== "denied" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                          <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#E8E0D0", overflow: "hidden" }}>
                            <div style={{ width: `${thisResult.score}%`, height: "100%", background: matchColors[thisResult.match], borderRadius: 4, transition: "width 0.5s ease" }} />
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: matchColors[thisResult.match], minWidth: 36 }}>{thisResult.score}%</span>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button onClick={() => { setTranscript(""); setSrResult(null); }} style={{ padding: "8px 16px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#666" }}>Try again</button>
                        {!isDone && (
                          <button onClick={() => setPracticed(p => ({ ...p, [phrase]: true }))} style={{ padding: "8px 16px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Mark as practiced ✓</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {phrases.length === 0 && (
          <div style={{ textAlign: "center", padding: 32, color: "#999", fontSize: 15 }}>No phrases in this situation yet. Use the ⚙️ admin panel to add some.</div>
        )}
      </div>

      <style>{`
        @keyframes speakPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
        @keyframes waveBar { 0%, 100% { transform: scaleY(0.4); opacity: 0.5; } 50% { transform: scaleY(1.2); opacity: 1; } }
      `}</style>

      <div style={{ textAlign: "center", fontSize: 15, color: "#888" }}>
        {Object.keys(practiced).length > 0 && `✓ ${Object.keys(practiced).length} phrase${Object.keys(practiced).length > 1 ? "s" : ""} practiced today`}
      </div>
    </div>
  );
}


// ---- SENTENCE BUILDER ----
function SentenceBuilderModule({ addToLog }) {
  const [words, setWords] = useState([]); // [{text, emoji, id}]
  const [wordClass, setWordClass] = useState("Nouns");
  const [nounCat, setNounCat] = useState("All Nouns");
  const [verbCat, setVerbCat] = useState("All Actions");
  const [adjCat, setAdjCat] = useState("All Adjectives");
  const [sentenceType, setSentenceType] = useState("statement");
  const [verbTense, setVerbTense] = useState("present-simple");
  const [library, setLibrary] = useState([]);
  const [libraryTab, setLibraryTab] = useState("All");
  const [speaking, setSpeaking] = useState(false);

  const WORD_CLASSES = ["Nouns", "Verbs", "Adjectives", "Adverbs", "Pronouns", "Preps", "Articles", "Library"];
  const SENTENCE_TYPES = [
    { id: "statement", icon: "💬", label: "Statement.", desc: "A regular sentence telling something." },
    { id: "question", icon: "❓", label: "Question?", desc: "Asking something." },
    { id: "exclamation", icon: "❗", label: "Exclamation!", desc: "Expressing strong feeling." },
    { id: "command", icon: "🫵", label: "Command!", desc: "Telling someone to do something." },
    { id: "negative", icon: "🚫", label: "Negative.", desc: "Saying something is not the case." },
  ];
  const VERB_TENSES = [
    { group: "PRESENT", items: [
      { id: "present-simple", label: "Simple", example: '"runs"', icon: "▶️" },
      { id: "present-progressive", label: "Progressive", example: '"is running"', icon: "🔄" },
      { id: "present-perfect", label: "Perfect", example: '"has run"', icon: "✅" },
    ]},
    { group: "PAST", items: [
      { id: "past-simple", label: "Simple", example: '"ran"', icon: "⏪" },
      { id: "past-progressive", label: "Progressive", example: '"was running"', icon: "🔄" },
      { id: "past-perfect", label: "Perfect", example: '"had run"', icon: "✅" },
    ]},
    { group: "FUTURE", items: [
      { id: "future-simple", label: "Simple", example: '"will run"', icon: "⏩" },
      { id: "future-progressive", label: "Progressive", example: '"will be running"', icon: "🔄" },
    ]},
    { group: "OTHER", items: [
      { id: "conditional", label: "Conditional", example: '"would run"', icon: "🔀" },
    ]},
  ];

  const buildSentenceText = () => {
    if (words.length === 0) return "";
    let text = words.map(w => w.text).join(" ");
    text = text.charAt(0).toUpperCase() + text.slice(1);
    switch (sentenceType) {
      case "question": return text + "?";
      case "exclamation": case "command": return text + "!";
      default: return text + ".";
    }
  };

  const addWord = (word, emoji) => {
    setWords(w => [...w, { text: word, emoji, id: Date.now() + Math.random() }]);
  };

  const removeWord = (id) => setWords(w => w.filter(x => x.id !== id));

  const speak = () => {
    const text = buildSentenceText();
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.85;
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  };

  const saveSentence = () => {
    const text = buildSentenceText();
    if (!text) return;
    setLibrary(lib => [...lib, { text, type: sentenceType, time: new Date().toLocaleTimeString(), id: Date.now() }]);
    addToLog && addToLog({ type: "sentence_builder", content: text, time: new Date().toLocaleTimeString() });
  };

  // Colors per word class
  const classColors = {
    Nouns: { bg: "#FFF8E8", border: "#F0D080", active: "#D4A843", text: "#7A5A10" },
    Verbs: { bg: "#EBF4FF", border: "#90BEF0", active: "#3A80C0", text: "#1A4A7A" },
    Adjectives: { bg: "#FDF0FF", border: "#D0A0E8", active: "#9B7FB8", text: "#5A2A80" },
    Adverbs: { bg: "#F0FFF0", border: "#90D090", active: "#4E9050", text: "#1A5A1A" },
    Pronouns: { bg: "#FFF0F0", border: "#F0A0A0", active: "#C05050", text: "#7A1A1A" },
    Preps: { bg: "#F0F8FF", border: "#90C8E8", active: "#3A78B0", text: "#1A3A7A" },
    Articles: { bg: "#F5F5F5", border: "#C0C0C0", active: "#606060", text: "#303030" },
    Library: { bg: "#1E3040", border: "#2D5A54", active: "#4E8B80", text: "#E8F4F2" },
  };
  const col = classColors[wordClass] || classColors.Nouns;

  const renderWordTile = (word, emoji, key) => (
    <button key={key} onClick={() => addWord(word, emoji)}
      style={{ padding: "12px 8px", borderRadius: 14, border: `2px solid ${col.border}`, background: col.bg,
        cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        transition: "all 0.15s", minWidth: 70, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}
      onMouseOver={e => { e.currentTarget.style.borderColor = col.active; e.currentTarget.style.transform = "scale(1.05)"; }}
      onMouseOut={e => { e.currentTarget.style.borderColor = col.border; e.currentTarget.style.transform = "scale(1)"; }}>
      <span style={{ fontSize: 28 }}>{emoji}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: col.text, textAlign: "center" }}>{word}</span>
    </button>
  );

  const renderNounSection = () => {
    const catNames = Object.keys(SB_NOUNS);
    const catIcons = { People: "👥", Animals: "🐾", "Food & Drink": "🍽️", Places: "📍", Things: "📦", Nature: "🌿" };
    const showItems = nounCat === "All Nouns"
      ? Object.values(SB_NOUNS).flat()
      : (SB_NOUNS[nounCat] || []);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setNounCat("All Nouns")} style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${nounCat === "All Nouns" ? col.active : col.border}`, background: nounCat === "All Nouns" ? col.active + "22" : col.bg, color: nounCat === "All Nouns" ? col.text : "#666", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            🧱 All Nouns
          </button>
          {catNames.map(c => (
            <button key={c} onClick={() => setNounCat(c)} style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${nounCat === c ? col.active : col.border}`, background: nounCat === c ? col.active + "22" : col.bg, color: nounCat === c ? col.text : "#666", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              {catIcons[c] || "🔷"} {c}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {showItems.map((item, i) => renderWordTile(item.word, item.emoji, i))}
        </div>
      </div>
    );
  };

  const renderVerbSection = () => {
    const catNames = Object.keys(SB_VERBS);
    const showBaseVerbs = verbCat === "All Actions" ? Object.values(SB_VERBS).flat() : (SB_VERBS[verbCat] || []);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Tense selector */}
        <div style={{ background: "#EBF4FF", borderRadius: 14, padding: "14px 16px", border: "1px solid #90BEF0" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#3A80C0", letterSpacing: 1.5, marginBottom: 10 }}>⏱ VERB TENSE</div>
          {VERB_TENSES.map(({ group, items }) => (
            <div key={group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7A9AB8", letterSpacing: 1, marginBottom: 6 }}>{group}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {items.map(t => (
                  <button key={t.id} onClick={() => setVerbTense(t.id)}
                    style={{ padding: "7px 12px", borderRadius: 20, border: `2px solid ${verbTense === t.id ? "#3A80C0" : "#90BEF0"}`, background: verbTense === t.id ? "#3A80C020" : "#fff", color: verbTense === t.id ? "#1A4A7A" : "#555", fontWeight: verbTense === t.id ? 700 : 500, cursor: "pointer", fontSize: 12 }}>
                    {t.icon} {t.label} <span style={{ color: "#999", fontWeight: 400 }}>e.g. {t.example}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Category sub-tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setVerbCat("All Actions")} style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${verbCat === "All Actions" ? "#3A80C0" : "#90BEF0"}`, background: verbCat === "All Actions" ? "#3A80C020" : "#EBF4FF", color: verbCat === "All Actions" ? "#1A4A7A" : "#666", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            ⚡ All Actions
          </button>
          {catNames.map(c => (
            <button key={c} onClick={() => setVerbCat(c)} style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${verbCat === c ? "#3A80C0" : "#90BEF0"}`, background: verbCat === c ? "#3A80C020" : "#EBF4FF", color: verbCat === c ? "#1A4A7A" : "#666", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              {c}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {showBaseVerbs.map((item, i) => {
            const conjugated = conjugateVerb(item.word, verbTense);
            return renderWordTile(conjugated, item.emoji, i);
          })}
        </div>
      </div>
    );
  };

  const renderAdjectiveSection = () => {
    const catNames = Object.keys(SB_ADJECTIVES).filter(k => k !== "quickPicks");
    const showItems = adjCat === "All Adjectives"
      ? catNames.flatMap(c => SB_ADJECTIVES[c])
      : (SB_ADJECTIVES[adjCat] || []);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Quick picks */}
        <div style={{ background: "#FDF0FF", borderRadius: 14, padding: "12px 16px", border: "1px solid #D0A0E8" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#9B7FB8", letterSpacing: 1, marginBottom: 8 }}>⚡ QUICK PICKS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {SB_ADJECTIVES.quickPicks.map((w, i) => (
              <button key={i} onClick={() => addWord(w, "")}
                style={{ padding: "7px 14px", borderRadius: 20, border: "2px solid #D0A0E8", background: "#fff", color: "#5A2A80", fontWeight: 600, cursor: "pointer", fontSize: 14, transition: "all 0.15s" }}
                onMouseOver={e => { e.currentTarget.style.background = "#D0A0E820"; }}
                onMouseOut={e => { e.currentTarget.style.background = "#fff"; }}>
                {w}
              </button>
            ))}
          </div>
        </div>
        {/* Category sub-tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setAdjCat("All Adjectives")} style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${adjCat === "All Adjectives" ? "#9B7FB8" : "#D0A0E8"}`, background: adjCat === "All Adjectives" ? "#9B7FB820" : "#FDF0FF", color: adjCat === "All Adjectives" ? "#5A2A80" : "#666", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            🌈 All Adjectives
          </button>
          {catNames.map(c => (
            <button key={c} onClick={() => setAdjCat(c)} style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${adjCat === c ? "#9B7FB8" : "#D0A0E8"}`, background: adjCat === c ? "#9B7FB820" : "#FDF0FF", color: adjCat === c ? "#5A2A80" : "#666", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              {c}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {showItems.map((item, i) => renderWordTile(item.word, item.emoji, i))}
        </div>
      </div>
    );
  };

  const renderSimpleSection = (items) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {items.map((item, i) => renderWordTile(item.word, item.emoji, i))}
    </div>
  );

  const renderLibrarySection = () => {
    const filtered = libraryTab === "All" ? library : library.filter(s => s.type === libraryTab.toLowerCase());
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {["All", "Sentences", "Templates"].map(t => (
              <button key={t} onClick={() => setLibraryTab(t)} style={{ padding: "7px 16px", borderRadius: 20, border: `2px solid ${libraryTab === t ? "#4E8B80" : "#3A5A50"}`, background: libraryTab === t ? "#4E8B80" : "transparent", color: libraryTab === t ? "#fff" : "#7BAE9F", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#7BAE9F" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>No saved sentences yet</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Build a sentence and tap "+ Save" below</div>
          </div>
        ) : (
          filtered.map(s => (
            <div key={s.id} style={{ background: "#2D4A60", borderRadius: 12, padding: "14px 18px", border: "1px solid #3A6A70", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, color: "#E8F4F2", fontWeight: 600, lineHeight: 1.4 }}>{s.text}</div>
                <div style={{ fontSize: 12, color: "#7BAE9F", marginTop: 4 }}>{s.time}</div>
              </div>
              <button onClick={() => { const ws = s.text.replace(/[.?!]$/, "").split(" ").map(t => ({ text: t, emoji: "", id: Date.now() + Math.random() })); setWords(ws); setWordClass("Nouns"); }}
                style={{ padding: "7px 14px", borderRadius: 10, border: "1px solid #4E8B80", background: "#4E8B8030", color: "#7BAE9F", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                Load
              </button>
              <button onClick={() => setLibrary(l => l.filter(x => x.id !== s.id))}
                style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid #C07070", background: "#C0707030", color: "#F0A0A0", cursor: "pointer", fontSize: 13 }}>
                ×
              </button>
            </div>
          ))
        )}
      </div>
    );
  };

  const sentenceText = buildSentenceText();
  const currentSentenceType = SENTENCE_TYPES.find(t => t.id === sentenceType);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FFFDF9" }}>
      <style>{`
        @keyframes sbPulse { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
      `}</style>

      {/* Sentence display */}
      <div style={{ padding: "16px 20px 0 20px", position: "relative" }}>
        <div style={{ background: "#FFFDF9", borderRadius: 16, border: "2px solid #E8E0D0", minHeight: 80, padding: "14px 16px", paddingRight: 110, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
          {words.length === 0 ? (
            <span style={{ color: "#C5BEB4", fontSize: 16, fontStyle: "italic", alignSelf: "center" }}>Tap words below to build a sentence…</span>
          ) : (
            words.map(w => (
              <button key={w.id} onClick={() => removeWord(w.id)}
                style={{ padding: "8px 14px", borderRadius: 12, border: "2px solid #D5CFC4", background: "#F5F0E8", color: "#2D3B36", fontWeight: 600, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}
                onMouseOver={e => { e.currentTarget.style.background = "#FFE8E8"; e.currentTarget.style.borderColor = "#C07070"; }}
                onMouseOut={e => { e.currentTarget.style.background = "#F5F0E8"; e.currentTarget.style.borderColor = "#D5CFC4"; }}
                title="Click to remove">
                {w.emoji && <span>{w.emoji}</span>}
                {w.text}
              </button>
            ))
          )}
          {/* Action buttons */}
          <div style={{ position: "absolute", top: 10, right: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            <button onClick={speak} disabled={!sentenceText}
              style={{ padding: "6px 12px", borderRadius: 10, border: `2px solid ${speaking ? "#C07070" : "#4E8B80"}`, background: speaking ? "#C0707020" : "#4E8B8020", color: speaking ? "#C07070" : "#4E8B80", fontWeight: 700, cursor: "pointer", fontSize: 12, animation: speaking ? "sbPulse 1s ease-in-out infinite" : "none" }}>
              🔊 Speak
            </button>
            <button onClick={() => setWords([])}
              style={{ padding: "6px 12px", borderRadius: 10, border: "2px solid #D5CFC4", background: "#F5F0E8", color: "#666", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
              🗑 Clear
            </button>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: "#888", fontStyle: "italic", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sentenceText || "…"}
          </span>
          <button onClick={saveSentence} disabled={!sentenceText}
            style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: sentenceText ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#C5BEB4", color: "#fff", fontWeight: 700, cursor: sentenceText ? "pointer" : "default", fontSize: 13, whiteSpace: "nowrap" }}>
            💾 Save
          </button>
        </div>
      </div>

      {/* Sentence type selector */}
      <div style={{ padding: "10px 20px 0 20px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SENTENCE_TYPES.map(t => (
          <button key={t.id} onClick={() => setSentenceType(t.id)}
            style={{ padding: "7px 12px", borderRadius: 20, border: `2px solid ${sentenceType === t.id ? "#4E8B80" : "#D5CFC4"}`, background: sentenceType === t.id ? "#E8F4F2" : "#FFFDF9", color: sentenceType === t.id ? "#2D5A54" : "#666", fontWeight: 600, cursor: "pointer", fontSize: 13, transition: "all 0.2s" }}>
            {t.icon} {t.label}
          </button>
        ))}
        {currentSentenceType && <span style={{ fontSize: 13, color: "#4E8B80", alignSelf: "center", fontStyle: "italic" }}>{currentSentenceType.desc}</span>}
      </div>

      {/* Word class tabs */}
      <div style={{ padding: "12px 20px 0 20px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid #E8E0D0", paddingBottom: 12 }}>
        {WORD_CLASSES.map(wc => {
          const wCol = classColors[wc];
          const isActive = wordClass === wc;
          return (
            <button key={wc} onClick={() => setWordClass(wc)}
              style={{ padding: "8px 14px", borderRadius: 20, border: `2px solid ${isActive ? wCol.active : "#D5CFC4"}`, background: isActive ? wCol.active + "20" : wc === "Library" ? "#1E304040" : "#FFFDF9", color: isActive ? wCol.text : wc === "Library" ? "#2D5A54" : "#666", fontWeight: isActive ? 800 : 600, cursor: "pointer", fontSize: 13, transition: "all 0.2s" }}>
              {wc === "Library" ? "🗂 Library" : wc}
            </button>
          );
        })}
      </div>

      {/* Word bank content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20, background: wordClass === "Library" ? "#1E3040" : `${col.bg}60` }}>
        {wordClass === "Nouns" && renderNounSection()}
        {wordClass === "Verbs" && renderVerbSection()}
        {wordClass === "Adjectives" && renderAdjectiveSection()}
        {wordClass === "Adverbs" && renderSimpleSection(SB_ADVERBS)}
        {wordClass === "Pronouns" && renderSimpleSection(SB_PRONOUNS)}
        {wordClass === "Preps" && renderSimpleSection(SB_PREPS)}
        {wordClass === "Articles" && renderSimpleSection(SB_ARTICLES)}
        {wordClass === "Library" && renderLibrarySection()}
      </div>
    </div>
  );
}

// ---- ASSESSMENT ----
function AssessmentModule({ addToLog }) {
  const graphicLookup = useDictionaryLookup();
  const [task, setTask] = useState(null);
  const [scores, setScores] = useState({});
  const [summary, setSummary] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [pendingAI, setPendingAI] = useState(null);
  const [currentItem, setCurrentItem] = useState(0);
  const [taskScores, setTaskScores] = useState([]);

  const startTask = (t) => {
    setTask(t);
    setCurrentItem(0);
    setTaskScores([]);
    setSummary("");
  };

  const recordItem = (result) => {
    const newScores = [...taskScores, result];
    setTaskScores(newScores);
    if (currentItem + 1 < getItems().length) {
      setCurrentItem(i => i + 1);
    } else {
      const pct = Math.round((newScores.filter(x => x === "correct").length / newScores.length) * 100);
      const newAllScores = { ...scores, [task.id]: { scores: newScores, pct } };
      setScores(newAllScores);
      addToLog({ type: "assessment", task: task.name, score: pct, time: new Date().toLocaleTimeString() });
      generateSummary(newScores, task.name);
      setTask(null);
    }
  };

  const getItems = () => {
    if (!task) return [];
    return task.items || task.categories || [];
  };

  const generateSummary = (sc, taskName) => {
    setLoadingAI(true);
    const pct = Math.round((sc.filter(x => x === "correct").length / sc.length) * 100);
    setPendingAI([{ role: "user", content: `Patient completed ${taskName} assessment. Score: ${pct}%. Error distribution: ${sc.join(", ")}. Provide brief clinical interpretation and 2 specific recommendations. Keep it warm and constructive.` }]);
  };

  const currentItems = getItems();
  const currentItemData = currentItems[currentItem];

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {pendingAI && <CallAPI messages={pendingAI} onResult={t => { setSummary(t); setLoadingAI(false); setPendingAI(null); }} onError={() => { setLoadingAI(false); setPendingAI(null); }} />}

      {!task ? (
        <>
          <div style={{ background: "#F0F7F5", borderRadius: 14, padding: "14px 18px", border: "1px solid #B0D4CE" }}>
            <p style={{ margin: 0, fontSize: 15, color: "#2D5A54", lineHeight: 1.6 }}>
              <strong>Language Assessment</strong> — These brief tasks help track your language abilities over time. There are no wrong answers — just do your best.
            </p>
          </div>

          {ASSESSMENT_TASKS.map((t) => {
            const done = scores[t.id];
            return (
              <div key={t.id} style={{ background: "#FFFDF9", borderRadius: 16, padding: "20px 24px", border: "1px solid #E8E0D0", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36" }}>{t.name}</div>
                  <div style={{ fontSize: 14, color: "#888", marginTop: 4 }}>{t.desc}</div>
                  {done && <div style={{ fontSize: 14, color: done.pct >= 70 ? "#4E8B80" : "#D4A843", fontWeight: 600, marginTop: 6 }}>Last score: {done.pct}%</div>}
                </div>
                <button onClick={() => startTask(t)} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {done ? "Retry" : "Start"}
                </button>
              </div>
            );
          })}

          {(loadingAI || summary) && (
            <div style={{ background: "#F0F7F5", borderRadius: 14, padding: "16px 20px", border: "1px solid #B0D4CE" }}>
              <div style={{ fontSize: 13, color: "#4E8B80", fontWeight: 600, marginBottom: 6 }}>🧠 Dr. Aria's Assessment Summary</div>
              {loadingAI ? <ThinkingDots /> : <div style={{ fontSize: 15, color: "#2D3B36", lineHeight: 1.7 }}>{summary}</div>}
            </div>
          )}
        </>
      ) : (
        <div style={{ background: "#FFFDF9", borderRadius: 20, padding: 32, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", border: "1px solid #E8E0D0" }}>
          <div style={{ fontSize: 13, color: "#4E8B80", fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{task.name}</div>
          <div style={{ fontSize: 13, color: "#999", marginBottom: 24 }}>Item {currentItem + 1} of {currentItems.length}</div>

          {task.id === "confrontation_naming" && currentItemData && (() => {
            const g = graphicLookup[currentItemData.word?.toLowerCase()]
              ?? currentItemData.graphic ?? currentItemData.emoji;
            return (
              <>
                {isImageGraphic(g)
                  ? <img src={g} alt="" style={{ width: 100, height: 100, objectFit: "contain", borderRadius: 16, border: "2px solid #E8E0D0" }} />
                  : <div style={{ fontSize: 80 }}>{g}</div>}
                <div style={{ fontSize: 14, color: "#999", margin: "12px 0 24px" }}>What is this called?</div>
              </>
            );
          })()}

          {(task.id === "repetition" || task.id === "sentence_repetition") && (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#2D3B36", margin: "20px 0", lineHeight: 1.4 }}>"{currentItemData}"</div>
              <div style={{ fontSize: 14, color: "#999", marginBottom: 24 }}>Repeat this back</div>
            </>
          )}

          {task.id === "category_fluency" && (
            <>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#2D3B36", margin: "20px 0" }}>
                Name as many <span style={{ color: "#4E8B80" }}>{currentItemData}</span> as you can
              </div>
              <div style={{ fontSize: 14, color: "#999", marginBottom: 24 }}>60 seconds — say them out loud</div>
            </>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Btn color="#4E8B80" onClick={() => recordItem("correct")}>✓ Successful</Btn>
            <Btn color="#D4A843" onClick={() => recordItem("partial")}>〜 Partial</Btn>
            <Btn color="#C07070" onClick={() => recordItem("error")}>✗ Difficulty</Btn>
          </div>
          <button onClick={() => setTask(null)} style={{ marginTop: 16, fontSize: 13, color: "#999", background: "none", border: "none", cursor: "pointer" }}>Cancel assessment</button>
        </div>
      )}
    </div>
  );
}

// ---- PROGRESS ----
// ── Progress persistence helpers ─────────────────────────────────────────────
const PROGRESS_SETTINGS_KEY = "ppa_progress_settings";
const DEFAULT_PROGRESS_SETTINGS = {
  defaultPeriod: "7days",
  emailAddress: "",
  moduleDetail: {
    therapist: "summary", naming: "detailed", assessment: "detailed",
    repetition: "detailed", sentence: "summary", scripts: "summary",
    sentence_builder: "none", video: "summary",
  },
};
const MODULE_LABELS = {
  therapist: "AI Therapist", naming: "Naming Practice", assessment: "Assessment",
  repetition: "Repetition", sentence: "Sentence Work", scripts: "Script Training",
  sentence_builder: "Sentence Builder", video: "Video Questions",
};
const PERIOD_OPTIONS = [
  { value: "7days", label: "Last 7 days" }, { value: "14days", label: "Last 14 days" },
  { value: "30days", label: "Last 30 days" }, { value: "90days", label: "Last 90 days" },
];

function getPeriodDates(period) {
  const end = new Date(); const start = new Date();
  const d = { "7days": 6, "14days": 13, "30days": 29, "90days": 89 }[period] ?? 6;
  start.setDate(start.getDate() - d);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function getStoredDays(startDate, endDate) {
  const days = []; const cur = new Date(startDate + "T00:00:00");
  const fin = new Date(endDate + "T00:00:00");
  while (cur <= fin) {
    const ds = cur.toISOString().slice(0, 10);
    try {
      const s = localStorage.getItem(`ppa_progress_${ds}`);
      if (s) { const e = JSON.parse(s); if (e.length) days.push({ date: ds, entries: e }); }
    } catch {}
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function computeModuleStats(entries) {
  const stats = {};
  for (const e of entries) {
    const m = e.type;
    if (!stats[m]) stats[m] = { count: 0, correct: 0, partial: 0, errors: 0, items: [] };
    stats[m].count++;
    const r = (e.result || "").toLowerCase();
    if (["correct", "correct_no_cue"].includes(r)) stats[m].correct++;
    else if (["partial", "correct_semantic", "correct_phonemic"].includes(r)) stats[m].partial++;
    else if (["error", "difficulty"].includes(r)) stats[m].errors++;
    stats[m].items.push(e);
  }
  return stats;
}

function buildReportPrompt(days, settings) {
  if (!days.length) return null;
  const first = days[0]; const last = days[days.length - 1];
  const allEntries = days.flatMap(d => d.entries);

  const fmtStats = (stats) => Object.entries(stats).map(([mod, s]) => {
    const det = (settings.moduleDetail || {})[mod] || "summary";
    if (det === "none") return null;
    const label = MODULE_LABELS[mod] || mod;
    const acc = s.correct + s.partial;
    let str = `  ${label}: ${s.count} activities`;
    if (s.correct + s.partial + s.errors > 0) str += `, ${acc}/${s.count} successful (${Math.round(acc / s.count * 100)}%)`;
    if (s.errors) str += `, ${s.errors} errors`;
    if (det === "detailed" && s.items.length) {
      const ex = s.items.slice(0, 6).map(it => {
        let d = it.word || it.item || (it.content || "").slice(0, 35) || it.task || "";
        if (it.result) d += ` [${it.result}]`;
        return d;
      }).filter(Boolean);
      if (ex.length) str += `\n    Items: ${ex.join("; ")}`;
    }
    return str;
  }).filter(Boolean).join("\n");

  return `You are Dr. Aria, SLP specialising in Primary Progressive Aphasia. Generate a formal clinical progress report.

PATIENT PROGRESS REPORT
Period: ${first.date} to ${last.date} | Active days: ${days.length}

STARTING STATUS (${first.date}):
${fmtStats(computeModuleStats(first.entries)) || "  No data"}

PERIOD ACTIVITY (${days.length} session days, ${allEntries.length} total activities):
${days.map(d => {
  const ms = computeModuleStats(d.entries);
  const mods = Object.keys(ms).map(m => MODULE_LABELS[m] || m).join(", ");
  return `  ${d.date}: ${d.entries.length} activities — ${mods}`;
}).join("\n")}

Period aggregate by module:
${fmtStats(computeModuleStats(allEntries)) || "  No data"}

ENDING STATUS (${last.date}):
${fmtStats(computeModuleStats(last.entries)) || "  No data"}

Write a structured clinical progress report with these sections:
1. EXECUTIVE SUMMARY (2-3 sentences capturing the key story)
2. STARTING STATUS — clinical interpretation of performance at the start of this period
3. PERIOD ACTIVITY — strengths, challenges, trends, consistency, and notable observations
4. ENDING STATUS — performance at period end vs start, any measurable change
5. RECOMMENDATIONS — 4-5 specific, actionable recommendations for the next therapy period

Tone: professional and clinical yet readable by family/caregivers. Use plain English. Be compassionate.`;
}

function ProgressModule({ sessionLog }) {
  const TODAY = new Date().toISOString().slice(0, 10);

  const loadSettings = () => {
    try {
      const s = localStorage.getItem(PROGRESS_SETTINGS_KEY);
      if (!s) return { ...DEFAULT_PROGRESS_SETTINGS, moduleDetail: { ...DEFAULT_PROGRESS_SETTINGS.moduleDetail } };
      const saved = JSON.parse(s);
      return { ...DEFAULT_PROGRESS_SETTINGS, ...saved, moduleDetail: { ...DEFAULT_PROGRESS_SETTINGS.moduleDetail, ...(saved.moduleDetail || {}) } };
    } catch { return { ...DEFAULT_PROGRESS_SETTINGS, moduleDetail: { ...DEFAULT_PROGRESS_SETTINGS.moduleDetail } }; }
  };

  const [settings, setSettings] = useState(loadSettings);
  const saveSettings = (ns) => { setSettings(ns); try { localStorage.setItem(PROGRESS_SETTINGS_KEY, JSON.stringify(ns)); } catch {} };

  const [view, setView] = useState("dashboard");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [backupStale, setBackupStale]   = useState(() => ppaBackupIsStale(7));

  // Report state
  const [reportRange, setReportRange] = useState(() => getPeriodDates(loadSettings().defaultPeriod || "7days"));
  const [generatedReport, setGeneratedReport] = useState("");
  const [loadingReport, setLoadingReport] = useState(false);
  const [pendingReport, setPendingReport] = useState(null);
  const [copied, setCopied] = useState(false);

  // Admin working copy
  const [editSettings, setEditSettings] = useState(null);
  const [clearStep, setClearStep] = useState(null); // null | 'today' | 'range' | 'all'
  const [clearRange, setClearRange] = useState({ start: TODAY, end: TODAY });

  // Today's grouped stats
  const grouped = sessionLog.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {});

  // Historical snapshot: count past active days in last 30 days
  const recentDays = (() => {
    const d = []; const cur = new Date();
    for (let i = 1; i <= 30; i++) {
      const dt = new Date(cur); dt.setDate(cur.getDate() - i);
      const ds = dt.toISOString().slice(0, 10);
      try {
        const s = localStorage.getItem(`ppa_progress_${ds}`);
        if (s) { const e = JSON.parse(s); if (e.length) d.push(ds); }
      } catch {}
    }
    return d;
  })();

  const generateReport = () => {
    const days = getStoredDays(reportRange.start, reportRange.end);
    const prompt = buildReportPrompt(days, settings);
    if (!prompt) { setGeneratedReport("No activity data found for the selected period."); return; }
    setLoadingReport(true); setGeneratedReport("");
    setPendingReport([{ role: "user", content: prompt }]);
  };

  const copyReport = () => {
    navigator.clipboard.writeText(generatedReport).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const emailReport = () => {
    const addr = settings.emailAddress || "";
    const subj = encodeURIComponent(`PPA Progress Report ${reportRange.start} to ${reportRange.end}`);
    const body = encodeURIComponent(generatedReport.slice(0, 1800) + (generatedReport.length > 1800 ? "\n\n[Report truncated — please see full copy]" : ""));
    window.open(`mailto:${addr}?subject=${subj}&body=${body}`);
  };

  const doClear = () => {
    if (clearStep === "today") {
      localStorage.removeItem(`ppa_progress_${TODAY}`);
    } else if (clearStep === "range") {
      const days = getStoredDays(clearRange.start, clearRange.end);
      days.forEach(d => localStorage.removeItem(`ppa_progress_${d.date}`));
    } else if (clearStep === "all") {
      Object.keys(localStorage).filter(k => /^ppa_progress_\d{4}-\d{2}-\d{2}$/.test(k)).forEach(k => localStorage.removeItem(k));
    }
    setClearStep(null);
    window.location.reload();
  };

  // ── Card style helpers ────────────────────────────────────────────────────
  const card = { background: "#FFFDF9", borderRadius: 16, padding: "18px 20px", border: "1px solid #E8E0D0" };
  const btn = (bg, color = "#fff") => ({ padding: "11px 22px", background: bg, color, border: "none", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" });
  const inp = { padding: "9px 12px", borderRadius: 9, border: "2px solid #D5CFC4", fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

  // ── REPORT VIEW ───────────────────────────────────────────────────────────
  if (view === "report") {
    return (
      <div style={{ padding: 20, maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {pendingReport && (
          <CallAPI messages={pendingReport}
            onResult={t => { setGeneratedReport(t); setLoadingReport(false); setPendingReport(null); }}
            onError={() => { setGeneratedReport("Error generating report. Please try again."); setLoadingReport(false); setPendingReport(null); }} />
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("dashboard")} style={{ ...btn("#F5F0E8", "#2D3B36"), padding: "8px 14px" }}>← Back</button>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36", flex: 1 }}>📋 Progress Report</div>
          <button onClick={() => { setEditSettings({ ...settings }); setAdminUnlocked(adminUnlocked); setView("admin"); }}
            style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 15, color: "#888" }}>
            {"⚙️"}
          </button>
        </div>

        {/* Date range picker */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", marginBottom: 12 }}>Select Reporting Period</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {PERIOD_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setReportRange(getPeriodDates(o.value))}
                style={{ padding: "7px 14px", borderRadius: 20, border: "2px solid", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  borderColor: reportRange.start === getPeriodDates(o.value).start ? "#4E8B80" : "#D5CFC4",
                  background: reportRange.start === getPeriodDates(o.value).start ? "#E8F4F2" : "#FFFDF9",
                  color: reportRange.start === getPeriodDates(o.value).start ? "#2D5A54" : "#666" }}>
                {o.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>From</label>
              <input type="date" value={reportRange.start} max={reportRange.end}
                onChange={e => setReportRange(r => ({ ...r, start: e.target.value }))} style={inp} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>To</label>
              <input type="date" value={reportRange.end} min={reportRange.start} max={TODAY}
                onChange={e => setReportRange(r => ({ ...r, end: e.target.value }))} style={inp} />
            </div>
            <div style={{ alignSelf: "flex-end" }}>
              <button onClick={generateReport} disabled={loadingReport}
                style={{ ...btn(loadingReport ? "#C5BEB4" : "linear-gradient(135deg, #4E8B80, #3A7A6F)"), padding: "10px 20px" }}>
                {loadingReport ? "Generating…" : "Generate Report"}
              </button>
            </div>
          </div>
        </div>

        {/* Report output */}
        {(loadingReport || generatedReport) && (
          <div style={{ ...card, border: "1px solid #B0D4CE" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#4E8B80", marginBottom: 10 }}>📄 Report by Dr. Aria</div>
            {loadingReport ? <ThinkingDots /> : (
              <>
                <div style={{ fontSize: 14, color: "#2D3B36", lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto" }}>{generatedReport}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <button onClick={copyReport} style={{ ...btn(copied ? "#4E8B80" : "#E8F4F2", copied ? "#fff" : "#2D5A54"), padding: "8px 16px" }}>
                    {copied ? "✓ Copied!" : "📋 Copy"}
                  </button>
                  <button onClick={emailReport} style={{ ...btn("#E8F4F2", "#2D5A54"), padding: "8px 16px" }}>
                    ✉️ {settings.emailAddress ? `Email to ${settings.emailAddress}` : "Email Report"}
                  </button>
                  <button onClick={generateReport} style={{ ...btn("#F5F0E8", "#666"), padding: "8px 16px" }}>
                    🔄 Regenerate
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── ADMIN VIEW ────────────────────────────────────────────────────────────
  if (view === "admin") {
    if (!adminUnlocked) {
      return (
        <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
          <AdminPinEntry
            onSuccess={() => { setAdminUnlocked(true); setEditSettings({ ...settings }); }}
            onCancel={() => setView("dashboard")} />
        </div>
      );
    }

    const es = editSettings || settings;
    const setES = (fn) => setEditSettings(prev => fn(prev || settings));

    return (
      <div style={{ padding: 20, maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#2D3B36", borderRadius: 14, padding: "14px 18px" }}>
          <span style={{ fontSize: 20 }}>{"⚙️"}</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#E8F4F2", flex: 1 }}>Progress Settings</span>
          <button onClick={() => setView("dashboard")} style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid #4E8B80", background: "transparent", color: "#7BAE9F", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
            ✕ Close
          </button>
        </div>

        {/* ── Section: Default Reporting Period ── */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", marginBottom: 12 }}>📅 Default Reporting Period</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PERIOD_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setES(prev => ({ ...prev, defaultPeriod: o.value }))}
                style={{ padding: "8px 16px", borderRadius: 20, border: "2px solid", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  borderColor: es.defaultPeriod === o.value ? "#4E8B80" : "#D5CFC4",
                  background: es.defaultPeriod === o.value ? "#E8F4F2" : "#FFFDF9",
                  color: es.defaultPeriod === o.value ? "#2D5A54" : "#666" }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Section: Email Address ── */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", marginBottom: 10 }}>📧 Report Email Address</div>
          <input type="email" value={es.emailAddress || ""} onChange={e => setES(prev => ({ ...prev, emailAddress: e.target.value }))}
            placeholder="therapist@clinic.com" style={inp} />
          <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>Reports will pre-fill this address in the email client.</div>
        </div>

        {/* ── Section: Per-module detail level ── */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", marginBottom: 12 }}>📊 Report Detail Level (per module)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(MODULE_LABELS).map(([mod, label]) => (
              <div key={mod} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F9F6EF", borderRadius: 10 }}>
                <span style={{ flex: 1, fontSize: 14, color: "#2D3B36", fontWeight: 600 }}>{label}</span>
                {["none", "summary", "detailed"].map(level => (
                  <button key={level} onClick={() => setES(prev => ({ ...prev, moduleDetail: { ...prev.moduleDetail, [mod]: level } }))}
                    style={{ padding: "5px 12px", borderRadius: 20, border: "2px solid", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
                      borderColor: (es.moduleDetail || {})[mod] === level ? "#4E8B80" : "#D5CFC4",
                      background: (es.moduleDetail || {})[mod] === level ? "#E8F4F2" : "#FFFDF9",
                      color: (es.moduleDetail || {})[mod] === level ? "#2D5A54" : "#888" }}>
                    {level}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
        <button onClick={() => { saveSettings(es); setView("dashboard"); }}
          style={{ ...btn("linear-gradient(135deg, #4E8B80, #3A7A6F)"), padding: "13px 24px", fontSize: 15 }}>
          ✓ Save Settings
        </button>

        {/* ── Section: Backup & Restore ── */}
        <div style={{ ...card, border: "1px solid #B0D4CE" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D5A54", marginBottom: 12 }}>💾 Backup &amp; Restore</div>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 14, lineHeight: 1.6 }}>
            localStorage is erased whenever the app is updated or redeployed. Download a backup before
            updating, then restore it immediately after to recover all your data.
          </div>
          <BackupRestorePanel onBackupDone={() => setBackupStale(ppaBackupIsStale(7))} />
        </div>

        {/* ── Section: Clear / Reset Progress ── */}
        <div style={{ ...card, border: "1px solid #F0C0B0" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#8B2D2D", marginBottom: 12 }}>🗑️ Clear Progress Data</div>
          {clearStep === null && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setClearStep("today")}
                style={{ ...btn("#FDE8E8", "#8B2D2D"), border: "2px solid #F0A0A0" }}>
                Clear Today
              </button>
              <button onClick={() => { setClearStep("range"); setClearRange({ start: TODAY, end: TODAY }); }}
                style={{ ...btn("#FDE8E8", "#8B2D2D"), border: "2px solid #F0A0A0" }}>
                Clear Date Range
              </button>
              <button onClick={() => setClearStep("all")}
                style={{ ...btn("#FDE8E8", "#8B2D2D"), border: "2px solid #F0A0A0" }}>
                Clear All History
              </button>
            </div>
          )}
          {clearStep === "today" && (
            <div style={{ background: "#FFF5F5", borderRadius: 10, padding: 14, border: "2px solid #F0A0A0" }}>
              <div style={{ fontSize: 14, color: "#8B2D2D", marginBottom: 10 }}>⚠️ Delete all progress data for today ({TODAY})? This cannot be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={doClear} style={{ ...btn("#C07070"), padding: "8px 16px" }}>Yes, Delete</button>
                <button onClick={() => setClearStep(null)} style={{ ...btn("#F5F0E8", "#2D3B36"), padding: "8px 16px" }}>Cancel</button>
              </div>
            </div>
          )}
          {clearStep === "range" && (
            <div style={{ background: "#FFF5F5", borderRadius: 10, padding: 14, border: "2px solid #F0A0A0" }}>
              <div style={{ fontSize: 14, color: "#8B2D2D", marginBottom: 10 }}>Select date range to clear:</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 3 }}>From</label>
                  <input type="date" value={clearRange.start} max={clearRange.end} onChange={e => setClearRange(r => ({ ...r, start: e.target.value }))} style={inp} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 3 }}>To</label>
                  <input type="date" value={clearRange.end} min={clearRange.start} max={TODAY} onChange={e => setClearRange(r => ({ ...r, end: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={doClear} style={{ ...btn("#C07070"), padding: "8px 16px" }}>Yes, Delete Range</button>
                <button onClick={() => setClearStep(null)} style={{ ...btn("#F5F0E8", "#2D3B36"), padding: "8px 16px" }}>Cancel</button>
              </div>
            </div>
          )}
          {clearStep === "all" && (
            <div style={{ background: "#FFF5F5", borderRadius: 10, padding: 14, border: "2px solid #C07070" }}>
              <div style={{ fontSize: 14, color: "#8B2D2D", fontWeight: 700, marginBottom: 6 }}>⚠️ Delete ALL historical progress data?</div>
              <div style={{ fontSize: 13, color: "#8B2D2D", marginBottom: 10 }}>This will permanently erase every session from every day. This cannot be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={doClear} style={{ ...btn("#8B2D2D"), padding: "8px 16px" }}>Yes, Delete Everything</button>
                <button onClick={() => setClearStep(null)} style={{ ...btn("#F5F0E8", "#2D3B36"), padding: "8px 16px" }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── DASHBOARD VIEW ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "16px 20px", maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36", flex: 1 }}>📈 Progress</div>
        <button onClick={() => setView("report")}
          style={{ ...btn("linear-gradient(135deg, #4E8B80, #3A7A6F)"), padding: "9px 18px" }}>
          📋 Generate Report
        </button>
        <button onClick={() => { setEditSettings(null); setBackupStale(ppaBackupIsStale(7)); setView("admin"); }}
          title={backupStale ? "Settings (backup recommended)" : "Settings"}
          style={{ position: "relative", width: 34, height: 34, borderRadius: "50%", border: `2px solid ${backupStale ? "#D4A843" : "#D5CFC4"}`, background: "#FFFDF9", cursor: "pointer", fontSize: 15, color: "#888" }}>
          {"⚙️"}
          {backupStale && (
            <span style={{ position: "absolute", top: -3, right: -3, width: 10, height: 10,
              borderRadius: "50%", background: "#D4A843", border: "2px solid #FFFDF9" }} />
          )}
        </button>
      </div>

      {/* Today's activity */}
      <div style={{ ...card }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#2D3B36", marginBottom: 12 }}>Today — {TODAY}</div>
        {sessionLog.length === 0 ? (
          <div style={{ color: "#999", fontSize: 14 }}>No activity recorded yet today. Complete some exercises to see your progress.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              {Object.entries(grouped).map(([type, count]) => (
                <div key={type} style={{ padding: "10px 14px", background: "#E8F4F2", borderRadius: 10, textAlign: "center", minWidth: 70 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#4E8B80" }}>{count}</div>
                  <div style={{ fontSize: 11, color: "#666", textTransform: "capitalize" }}>{MODULE_LABELS[type] || type}</div>
                </div>
              ))}
              <div style={{ padding: "10px 14px", background: "#F0ECF7", borderRadius: 10, textAlign: "center", minWidth: 70 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#9B7FB8" }}>{sessionLog.length}</div>
                <div style={{ fontSize: 11, color: "#666" }}>Total</div>
              </div>
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
              {sessionLog.slice().reverse().slice(0, 15).map((e, i) => (
                <div key={i} style={{ fontSize: 13, color: "#666", padding: "6px 12px", background: "#F5F0E8", borderRadius: 8, display: "flex", gap: 10 }}>
                  <span style={{ color: "#999", flexShrink: 0 }}>{e.time}</span>
                  <span style={{ textTransform: "capitalize", color: "#4E8B80", fontWeight: 600, flexShrink: 0 }}>{MODULE_LABELS[e.type] || e.type}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.word || e.item || (e.content || "").slice(0, 40) || e.task || ""}
                    {e.result ? ` → ${e.result}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Recent history summary */}
      <div style={{ ...card }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#2D3B36", marginBottom: 10 }}>
          History — Last 30 Days
        </div>
        {recentDays.length === 0 ? (
          <div style={{ color: "#999", fontSize: 14 }}>No previous sessions found. Progress will be tracked automatically.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ padding: "8px 14px", background: "#E8F4F2", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#4E8B80" }}>{recentDays.length}</div>
                <div style={{ fontSize: 11, color: "#666" }}>Active Days</div>
              </div>
              <div style={{ padding: "8px 14px", background: "#F0ECF7", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#9B7FB8" }}>
                  {recentDays.reduce((sum, ds) => {
                    try { const s = localStorage.getItem(`ppa_progress_${ds}`); return sum + (s ? JSON.parse(s).length : 0); } catch { return sum; }
                  }, 0)}
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>Total Activities</div>
              </div>
            </div>
            {/* Mini calendar heatmap */}
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {Array.from({ length: 30 }, (_, i) => {
                const dt = new Date(); dt.setDate(dt.getDate() - (29 - i));
                const ds = dt.toISOString().slice(0, 10);
                const active = recentDays.includes(ds) || ds === TODAY;
                const isToday = ds === TODAY;
                let count = 0;
                try { const s = localStorage.getItem(`ppa_progress_${ds}`); if (s) count = JSON.parse(s).length; } catch {}
                return (
                  <div key={ds} title={`${ds}${count ? `: ${count} activities` : ""}`}
                    style={{ width: 16, height: 16, borderRadius: 3,
                      background: isToday && count > 0 ? "#2D5A54" : isToday ? "#7BAE9F" : active ? (count > 10 ? "#2D5A54" : count > 5 ? "#4E8B80" : "#B0D4CE") : "#E8E0D0",
                      outline: isToday ? "2px solid #4E8B80" : "none", outlineOffset: 1 }} />
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>Each square = one day. Darker = more activity. Outlined = today.</div>
          </>
        )}
      </div>

      {/* PPA tips */}
      <div style={{ background: "#FFF8E8", borderRadius: 14, padding: "14px 18px", border: "1px solid #F0E0A0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7A5A10", marginBottom: 6 }}>💡 PPA Communication Tips</div>
        {["Reduce background noise during conversation.", "Use written words alongside speech.", "Give extra time — never rush responses.", "Gestures and pointing are valid communication.", "Fatigue is real — keep sessions short (20–30 min).", "Emotional content is often better preserved."].map((tip, i, a) => (
          <div key={i} style={{ fontSize: 13, color: "#5A4A1A", padding: "4px 0", borderBottom: i < a.length - 1 ? "1px solid #F0E0A0" : "none", display: "flex", gap: 8 }}>
            <span>•</span><span>{tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ---- VIDEO IMPORT PANEL ----
function ImportPanel({ onSave, onCancel }) {
  const [tab, setTab] = useState("youtube"); // youtube | file
  const [ytUrl, setYtUrl] = useState("");
  const [ytId, setYtId] = useState("");
  const [ytError, setYtError] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🎬");
  const [difficulty, setDifficulty] = useState("easy");
  const [startSeconds, setStartSeconds] = useState(0);
  const [stopSeconds, setStopSeconds] = useState("");
  const [questions, setQuestions] = useState(Q_TYPES.map(q => makeBlankQuestion(q.type, q.icon, q.color)));
  const [generatingAI, setGeneratingAI] = useState(false);
  const [pendingAI, setPendingAI] = useState(null);
  const [step, setStep] = useState(1); // 1=source, 2=details, 3=questions
  const fileRef = useRef(null);

  const handleYtParse = () => {
    const id = extractYouTubeId(ytUrl.trim());
    if (id) { setYtId(id); setYtError(""); }
    else setYtError("Couldn't find a YouTube video ID. Please check the URL.");
  };

  const [fileLoading, setFileLoading] = useState(false);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFileName(f.name);
    setFileLoading(true);
    const base = f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    if (!title) setTitle(base.charAt(0).toUpperCase() + base.slice(1));
    const reader = new FileReader();
    reader.onload = (ev) => { setFileUrl(ev.target.result); setFileLoading(false); };
    reader.onerror = () => { setFileLoading(false); };
    reader.readAsDataURL(f);
  };

  const autoGenerateQuestions = () => {
    if (!description.trim()) return;
    setGeneratingAI(true);
    setPendingAI([{
      role: "user",
      content: `Generate 3 simple multiple-choice video comprehension questions for a speech therapy patient with PPA (Primary Progressive Aphasia). The video is titled "${title || "a video clip"}" and shows: "${description}".

Create exactly 3 questions — one WHO, one WHAT, one WHERE. Each must have exactly 4 short answer options (under 6 words each), one correct answer, and a one-sentence hint.

Respond ONLY with valid JSON, no markdown, no extra text:
{
  "who": { "question": "...", "options": ["...", "...", "...", "..."], "answer": 0, "hint": "..." },
  "what": { "question": "...", "options": ["...", "...", "...", "..."], "answer": 1, "hint": "..." },
  "where": { "question": "...", "options": ["...", "...", "...", "..."], "answer": 2, "hint": "..." }
}`
    }]);
  };

  const updateQ = (qi, field, value) => {
    setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, [field]: value } : q));
  };
  const updateOption = (qi, oi, value) => {
    setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, options: q.options.map((o, j) => j === oi ? value : o) } : q));
  };

  const canProceed1 = tab === "youtube" ? !!ytId : (!!fileUrl && !fileLoading);
  const canProceed2 = title.trim().length > 0;
  const canSave = questions.every(q => q.question.trim() && q.options.every(o => o.trim()));

  const handleSave = () => {
    const id = `custom_${Date.now()}`;
    const clip = {
      id,
      title: title.trim(),
      description: description.trim() || title.trim(),
      thumbnail: emoji,
      difficulty,
      questions,
      isCustom: true,
      ...(tab === "youtube"
        ? { youtubeId: ytId, startSeconds: startSeconds || 0, ...(stopSeconds !== "" ? { stopSeconds: Number(stopSeconds) } : {}) }
        : { fileUrl, fileName }),
    };
    onSave(clip);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      {pendingAI && (
        <CallAPI messages={pendingAI}
          onResult={raw => {
            try {
              const clean = raw.replace(/```json|```/g, "").trim();
              const data = JSON.parse(clean);
              setQuestions(Q_TYPES.map(qt => ({
                ...makeBlankQuestion(qt.type, qt.icon, qt.color),
                ...(data[qt.type] || {}),
              })));
            } catch (e) { /* ignore parse errors */ }
            setGeneratingAI(false);
            setPendingAI(null);
            setStep(3);
          }}
          onError={() => { setGeneratingAI(false); setPendingAI(null); }}
        />
      )}

      <div style={{ background: "#FFFDF9", borderRadius: 24, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #E8E0D0", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(135deg, #2D5A54, #1E3D3A)", borderRadius: "24px 24px 0 0" }}>
          <div>
            <div style={{ color: "#E8F4F2", fontSize: 18, fontWeight: 700 }}>Import Video Clip</div>
            <div style={{ color: "#7BAE9F", fontSize: 13, marginTop: 2 }}>Step {step} of 3 — {step === 1 ? "Choose Source" : step === 2 ? "Add Details" : "Write Questions"}</div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7BAE9F", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", padding: "12px 24px", gap: 6 }}>
          {[1,2,3].map(s => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? "#4E8B80" : "#E8E0D0", transition: "background 0.3s" }} />
          ))}
        </div>

        <div style={{ padding: "8px 24px 24px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* STEP 1: Source */}
          {step === 1 && (
            <>
              <div style={{ display: "flex", gap: 8, background: "#F5F0E8", borderRadius: 12, padding: 5 }}>
                {[["youtube","▶ YouTube URL"],["file","📁 Upload File"]].map(([t, l]) => (
                  <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "10px 8px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: tab === t ? "#4E8B80" : "transparent", color: tab === t ? "#fff" : "#666", transition: "all 0.2s" }}>{l}</button>
                ))}
              </div>

              {tab === "youtube" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ fontSize: 14, color: "#444", fontWeight: 600 }}>Paste a YouTube link</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={ytUrl} onChange={e => setYtUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleYtParse()}
                      placeholder="https://www.youtube.com/watch?v=..."
                      style={{ flex: 1, padding: "11px 14px", borderRadius: 10, border: "2px solid #D5CFC4", fontSize: 14, background: "#FFFDF9", color: "#2D3B36", outline: "none", fontFamily: "inherit" }} />
                    <button onClick={handleYtParse} style={{ padding: "11px 18px", background: "#4E8B80", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>Load</button>
                  </div>
                  {ytError && <div style={{ color: "#C07070", fontSize: 13 }}>{ytError}</div>}
                  {ytId && (
                    <div style={{ borderRadius: 14, overflow: "hidden", border: "2px solid #4E8B80" }}>
                      <div style={{ position: "relative", paddingTop: "56.25%", background: "#000" }}>
                        <iframe src={`https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1`} frameBorder="0" allowFullScreen
                          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }} />
                      </div>
                      <div style={{ padding: "10px 14px", background: "#E8F4F2", fontSize: 13, color: "#2D5A54", fontWeight: 600 }}>✓ Video loaded — looks good?</div>
                    </div>
                  )}
                </div>
              )}

              {tab === "file" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ fontSize: 14, color: "#444", fontWeight: 600 }}>Upload a video file from your device</label>
                  <div onClick={() => fileRef.current?.click()} style={{ border: "3px dashed #D5CFC4", borderRadius: 14, padding: "32px 20px", textAlign: "center", cursor: "pointer", background: "#F9F6EF", transition: "border-color 0.2s" }}
                    onMouseOver={e => e.currentTarget.style.borderColor = "#4E8B80"} onMouseOut={e => e.currentTarget.style.borderColor = "#D5CFC4"}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
                    <div style={{ fontSize: 15, color: "#666" }}>{fileName || "Click to choose a video file"}</div>
                    <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>MP4, MOV, WebM, AVI supported</div>
                  </div>
                  <input ref={fileRef} type="file" accept="video/*" style={{ display: "none" }} onChange={handleFileChange} />
                  {fileLoading && (
                    <div style={{ padding: "16px", background: "#F0F7F5", borderRadius: 12, border: "1px solid #B0D4CE", display: "flex", alignItems: "center", gap: 10, color: "#4E8B80", fontSize: 14 }}>
                      <ThinkingDots /> Reading video file — please wait...
                    </div>
                  )}
                  {fileUrl && !fileLoading && (
                    <div style={{ borderRadius: 14, overflow: "hidden", border: "2px solid #4E8B80" }}>
                      <video src={fileUrl} controls style={{ width: "100%", display: "block", maxHeight: 240, background: "#000" }} />
                      <div style={{ padding: "10px 14px", background: "#E8F4F2", fontSize: 13, color: "#2D5A54", fontWeight: 600 }}>✓ {fileName}</div>
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#999", fontStyle: "italic" }}>
                    💡 Tip: Keep videos under ~50 MB for best performance. Larger files may load slowly.
                  </div>
                </div>
              )}

              <button onClick={() => setStep(2)} disabled={!canProceed1}
                style={{ padding: "13px 28px", background: canProceed1 ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#C5BEB4", color: "#fff", border: "none", borderRadius: 12, cursor: canProceed1 ? "pointer" : "default", fontSize: 16, fontWeight: 700, alignSelf: "flex-end" }}>
                Next: Add Details →
              </button>
            </>
          )}

          {/* STEP 2: Details */}
          {step === 2 && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 14, color: "#444", fontWeight: 600, display: "block", marginBottom: 6 }}>Video Title *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Grandma's Garden"
                    style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "2px solid #D5CFC4", fontSize: 16, background: "#FFFDF9", color: "#2D3B36", outline: "none", fontFamily: "inherit" }} />
                </div>

                <div>
                  <label style={{ fontSize: 14, color: "#444", fontWeight: 600, display: "block", marginBottom: 6 }}>Scene Description <span style={{ fontWeight: 400, color: "#888" }}>(helps AI generate questions)</span></label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what happens in the video in 1–3 sentences..."
                    rows={3} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "2px solid #D5CFC4", fontSize: 15, background: "#FFFDF9", color: "#2D3B36", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
                </div>

                <div>
                  <label style={{ fontSize: 14, color: "#444", fontWeight: 600, display: "block", marginBottom: 8 }}>Icon</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {EMOJI_OPTIONS.map(e => (
                      <button key={e} onClick={() => setEmoji(e)} style={{ width: 40, height: 40, borderRadius: 10, border: `2px solid ${emoji === e ? "#4E8B80" : "#D5CFC4"}`, background: emoji === e ? "#E8F4F2" : "#FFFDF9", fontSize: 20, cursor: "pointer", transition: "all 0.15s" }}>{e}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 14, color: "#444", fontWeight: 600, display: "block", marginBottom: 8 }}>Difficulty</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["easy","medium","hard"].map(d => (
                      <button key={d} onClick={() => setDifficulty(d)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${difficulty === d ? "#4E8B80" : "#D5CFC4"}`, background: difficulty === d ? "#E8F4F2" : "#FFFDF9", color: difficulty === d ? "#2D5A54" : "#666", fontWeight: 700, cursor: "pointer", fontSize: 14, textTransform: "capitalize" }}>{d}</button>
                    ))}
                  </div>
                </div>

                {tab === "youtube" && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 14, color: "#444", fontWeight: 600, display: "block", marginBottom: 6 }}>Start (seconds)</label>
                      <input type="number" min="0" value={startSeconds}
                        onChange={e => setStartSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                        style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "2px solid #D5CFC4", fontSize: 15, background: "#FFFDF9", color: "#2D3B36", outline: "none", fontFamily: "inherit" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 14, color: "#444", fontWeight: 600, display: "block", marginBottom: 6 }}>Stop (seconds, blank = end)</label>
                      <input type="number" min="0" value={stopSeconds}
                        onChange={e => setStopSeconds(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
                        placeholder="end of clip"
                        style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "2px solid #D5CFC4", fontSize: 15, background: "#FFFDF9", color: "#2D3B36", outline: "none", fontFamily: "inherit" }} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={() => setStep(1)} style={{ padding: "11px 20px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600, color: "#666" }}>← Back</button>
                <div style={{ display: "flex", gap: 10 }}>
                  {description.trim() && (
                    <button onClick={autoGenerateQuestions} disabled={generatingAI || !canProceed2}
                      style={{ padding: "11px 18px", background: "#9B7FB8", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                      {generatingAI ? <><ThinkingDots /> Generating...</> : "🧠 AI Generate Questions"}
                    </button>
                  )}
                  <button onClick={() => setStep(3)} disabled={!canProceed2}
                    style={{ padding: "11px 22px", background: canProceed2 ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#C5BEB4", color: "#fff", border: "none", borderRadius: 12, cursor: canProceed2 ? "pointer" : "default", fontSize: 15, fontWeight: 700 }}>
                    Next: Questions →
                  </button>
                </div>
              </div>
            </>
          )}

          {/* STEP 3: Questions */}
          {step === 3 && (
            <>
              <div style={{ fontSize: 14, color: "#666", background: "#F0F7F5", borderRadius: 10, padding: "10px 14px", border: "1px solid #B0D4CE" }}>
                Write one WHO, one WHAT, and one WHERE question. Each needs 4 answer choices and a hint.
              </div>

              {questions.map((q, qi) => (
                <div key={qi} style={{ borderRadius: 14, border: `2px solid ${q.color}30`, overflow: "hidden" }}>
                  <div style={{ padding: "10px 16px", background: q.color + "15", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{q.icon}</span>
                    <span style={{ fontWeight: 800, color: q.color, letterSpacing: 1, fontSize: 13 }}>{q.type.toUpperCase()} QUESTION</span>
                  </div>
                  <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, background: "#FFFDF9" }}>
                    <input value={q.question} onChange={e => updateQ(qi, "question", e.target.value)}
                      placeholder={Q_TYPES[qi].placeholder}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: "2px solid #D5CFC4", fontSize: 15, background: "#fff", color: "#2D3B36", outline: "none", fontFamily: "inherit" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {q.options.map((opt, oi) => (
                        <div key={oi} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button onClick={() => updateQ(qi, "answer", oi)} style={{ width: 30, height: 30, borderRadius: "50%", border: `3px solid ${q.answer === oi ? q.color : "#D5CFC4"}`, background: q.answer === oi ? q.color : "#fff", color: q.answer === oi ? "#fff" : "#999", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }} title="Mark as correct answer">
                            {String.fromCharCode(65 + oi)}
                          </button>
                          <input value={opt} onChange={e => updateOption(qi, oi, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65+oi)}${q.answer === oi ? " (correct)" : ""}`}
                            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `2px solid ${q.answer === oi ? q.color + "60" : "#D5CFC4"}`, fontSize: 14, background: q.answer === oi ? q.color + "08" : "#fff", color: "#2D3B36", outline: "none", fontFamily: "inherit" }} />
                        </div>
                      ))}
                    </div>
                    <input value={q.hint} onChange={e => updateQ(qi, "hint", e.target.value)} placeholder="Hint for this question..."
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 9, border: "2px solid #D5CFC4", fontSize: 13, background: "#FFFDF9", color: "#666", outline: "none", fontFamily: "inherit", fontStyle: "italic" }} />
                  </div>
                </div>
              ))}

              <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={() => setStep(2)} style={{ padding: "11px 20px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600, color: "#666" }}>← Back</button>
                <button onClick={handleSave} disabled={!canSave}
                  style={{ padding: "13px 28px", background: canSave ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#C5BEB4", color: "#fff", border: "none", borderRadius: 12, cursor: canSave ? "pointer" : "default", fontSize: 16, fontWeight: 700 }}>
                  ✓ Add to Library
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- VIDEO COMPREHENSION ----

// ── IndexedDB helpers for storing large video file data ─────────────────────
// localStorage is limited to ~5 MB; base64-encoded video files easily exceed
// that limit.  We keep clip *metadata* in localStorage (as before) and store
// only the raw base64 data-URL in IndexedDB, keyed by clip id.
// This is fully transparent to the rest of the VideoModule.

const VIDEO_IDB_NAME    = "ppa_video_files";
const VIDEO_IDB_STORE   = "files";
const VIDEO_IDB_VERSION = 1;

function videoIdb_open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VIDEO_IDB_NAME, VIDEO_IDB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(VIDEO_IDB_STORE, { keyPath: "id" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function videoIdb_save(id, dataUrl) {
  const db = await videoIdb_open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_IDB_STORE, "readwrite");
    tx.objectStore(VIDEO_IDB_STORE).put({ id, dataUrl });
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

async function videoIdb_load(id) {
  const db = await videoIdb_open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_IDB_STORE, "readonly");
    const req = tx.objectStore(VIDEO_IDB_STORE).get(id);
    req.onsuccess = (e) => resolve(e.target.result?.dataUrl ?? null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function videoIdb_delete(id) {
  const db = await videoIdb_open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_IDB_STORE, "readwrite");
    tx.objectStore(VIDEO_IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

async function videoIdb_loadAll(ids) {
  // Returns a Map<id, dataUrl> for the given ids.
  const db = await videoIdb_open();
  const result = new Map();
  await Promise.all(ids.map(id => new Promise((resolve) => {
    const req = db.transaction(VIDEO_IDB_STORE, "readonly")
                  .objectStore(VIDEO_IDB_STORE).get(id);
    req.onsuccess = (e) => {
      if (e.target.result?.dataUrl) result.set(id, e.target.result.dataUrl);
      resolve();
    };
    req.onerror = () => resolve(); // ignore individual errors
  })));
  return result;
}

// Ensures every custom clip stored in localStorage has the full expected structure.
// Fields missing from clips that were inserted programmatically (e.g. during debugging)
// or saved by an older version of the app are filled with safe defaults so that the
// full-backup / restore cycle always captures a complete, restorable clip.
function normaliseClip(c) {
  const blankQs = Q_TYPES.map(q => makeBlankQuestion(q.type, q.icon, q.color));
  return {
    // identity
    id:          c.id          ?? `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    isCustom:    true,
    // display
    title:       c.title       ?? "Untitled Clip",
    description: c.description ?? (c.title ?? ""),
    thumbnail:   c.thumbnail   ?? "🎬",
    difficulty:  c.difficulty  ?? "medium",
    // questions — preserve existing array; pad/fill with blanks if shorter than 3
    questions:   (() => {
      const existing = Array.isArray(c.questions) ? c.questions : [];
      return blankQs.map((blank, i) => existing[i] ?? blank);
    })(),
    // source — keep whatever the clip already had (youtubeId, etc.)
    // NOTE: fileUrl (base64 data-URL) is intentionally NOT included here —
    // it is too large for localStorage and is stored separately in IndexedDB,
    // then injected back at load time by VideoModule.
    ...(c.youtubeId  ? { youtubeId: c.youtubeId, startSeconds: c.startSeconds ?? 0, ...(c.stopSeconds != null ? { stopSeconds: c.stopSeconds } : {}) } : {}),
    ...(c.fileName   ? { fileName: c.fileName } : {}),
    // isLocalFile: true tells VideoModule to look up the video data in IndexedDB
    ...((c.isLocalFile || (c.fileUrl && !c.youtubeId)) ? { isLocalFile: true } : {}),
    // export tracking
    ...(c._sourceFile ? { _sourceFile: c._sourceFile } : {}),
  };
}

function VideoModule({ addToLog }) {
  // ── persistent custom clips ──────────────────────────────────────────────────────────────────────────────────────────
  // Clip metadata is stored in localStorage; large video file data (base64)
  // lives in IndexedDB to avoid the 5 MB localStorage quota limit.
  const [customClips, setCustomClips] = useState(() => {
    try {
      const s = localStorage.getItem("ppa_video_clips");
      const raw = s ? JSON.parse(s) : [];
      // Normalise on load so backup always has complete clip objects
      const normalised = raw.map(normaliseClip);
      // If any clip was missing fields, write the normalised version back immediately
      if (JSON.stringify(raw) !== JSON.stringify(normalised)) {
        try { localStorage.setItem("ppa_video_clips", JSON.stringify(normalised)); } catch {}
      }
      return normalised;
    } catch { return []; }
  });

  // fileUrls: { [clipId]: dataUrl } — video data loaded from IndexedDB after mount.
  // Injected into clip objects so the rest of the module sees clip.fileUrl as normal.
  const [fileUrls, setFileUrls] = useState({});

  // On mount, load all local video data from IndexedDB and populate fileUrls.
  useEffect(() => {
    const localIds = customClips.filter(c => c.isLocalFile).map(c => c.id);
    if (localIds.length === 0) return;
    videoIdb_loadAll(localIds).then(map => {
      if (map.size > 0) setFileUrls(prev => ({ ...prev, ...Object.fromEntries(map) }));
    }).catch(() => {});
  }, []); // intentionally empty — runs once on mount

  // Save clip metadata to localStorage and (for local-file clips) video data to IndexedDB.
  // pendingFileEntries: [{ id, fileUrl }] for clips being added that have new video data.
  const saveCustomClips = async (next, pendingFileEntries = []) => {
    const normalised = next.map(normaliseClip);
    // 1. Persist video data to IndexedDB before touching localStorage
    for (const { id, fileUrl } of pendingFileEntries) {
      try { await videoIdb_save(id, fileUrl); } catch (e) {
        console.warn("PPA: could not save video to IndexedDB:", e);
      }
    }
    // 2. Update in-memory fileUrls so video plays immediately after save
    if (pendingFileEntries.length > 0) {
      setFileUrls(prev => {
        const updated = { ...prev };
        for (const { id, fileUrl } of pendingFileEntries) updated[id] = fileUrl;
        return updated;
      });
    }
    // 3. Persist metadata (no large video data) to localStorage
    setCustomClips(normalised);
    try { localStorage.setItem("ppa_video_clips", JSON.stringify(normalised)); } catch (e) {
      console.warn("PPA: could not save clip metadata to localStorage:", e);
    }
  };

  // Convenience wrapper for callers that don't need to store new video data
  const saveCustomClipsSync = (next) => { saveCustomClips(next, []); };

  // ── practice state ──────────────────────────────────────────────────────────
  const [clipIdx, setClipIdx] = useState(0);
  const [phase, setPhase] = useState("watch");
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [aiComment, setAiComment] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [pendingAI, setPendingAI] = useState(null);
  const [videoError, setVideoError] = useState(false);
  const [scores, setScores] = useState({});
  const iframeRef = useRef(null);
  const dropdownRef = useRef(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);

  // ── admin state ─────────────────────────────────────────────────────────────
  const [adminOpen, setAdminOpen] = useState(false);
  const [pinPassed, setPinPassed] = useState(false);
  const [adminClipIdx, setAdminClipIdx] = useState(null); // null = list, number = edit that clip
  const [showAddPanel, setShowAddPanel] = useState(false);

  // Edit built-in clip (just questions)
  const [editingClip, setEditingClip] = useState(null); // deep clone for editing

  const openAdmin = () => { setPinPassed(false); setAdminOpen(true); setAdminClipIdx(null); setShowAddPanel(false); };
  const VM_MODULE_ID = "video";
  const [showVmExport,   setShowVmExport]   = useState(false);
  const [showVmReexport, setShowVmReexport] = useState(false);
  const [vmImportToast,  setVmImportToast]  = useState(null);

  const vmGetLabel = c => `${c.thumbnail || ""} ${c.title}`.trim();
  const vmBuildPayload = (filename, clips) => ({
    ppaExport: true, version: 1, moduleId: VM_MODULE_ID, filename,
    exportedAt: new Date().toISOString(), clips,
  });

  const handleVmExport = (selectedIds, filename) => {
    const toExport = customClips.filter(c => selectedIds.has(ppaItemId(c)));
    const updated  = ppaRecordExportInMemory(toExport, filename);
    const idMap = Object.fromEntries(updated.map(c => [c.id, c]));
    saveCustomClipsSync(customClips.map(c => idMap[c.id] ?? c));
    ppaAddKnownFile(VM_MODULE_ID, filename);
    ppaDownload(filename, vmBuildPayload(filename, toExport));
    setShowVmExport(false);
  };

  const handleVmImport = (files) => {
    ppaHandleImport(VM_MODULE_ID, files, VM_MODULE_ID,
      (data, filename) => {
        const incoming = (data.clips || []).map(c => ({ ...c, isCustom: true, _sourceFile: filename }));
        const existingIds = new Set(customClips.map(c => c.id));
        const newClips = incoming.filter(c => !existingIds.has(c.id));
        saveCustomClipsSync([...customClips, ...newClips]);
        return { newItems: incoming, message: `${newClips.length} clips from ${filename}${PPA_EXT}` };
      },
      results => setVmImportToast({ text: results.map(r => r.message).join(", ") }),
      (fn, msg) => alert(`Import error (${fn}${PPA_EXT}): ${msg}`)
    );
  };

  const forceCloseAdmin = () => setAdminOpen(false);
  const closeAdmin = () => {
    const snaps = ppaGetSnapshots();
    const dirty = customClips.filter(c => ppaIsItemDirty(c, snaps));
    if (dirty.length > 0) { setShowVmReexport(true); return; }
    setAdminOpen(false);
  };

  // Apply any saved question edits to built-in clips
  const [builtInPatches] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ppa_video_patches") || "{}"); }
    catch { return {}; }
  });
  const allClips = useMemo(() => [
    ...VIDEO_CLIPS.map(c => builtInPatches[c.id] ? { ...c, ...builtInPatches[c.id] } : c),
    // Inject fileUrl from IndexedDB for local-file clips (fileUrl is not in localStorage)
    ...customClips.map(c => c.isLocalFile && fileUrls[c.id] ? { ...c, fileUrl: fileUrls[c.id] } : c),
  ], [customClips, builtInPatches, fileUrls]);
  const clip = allClips[clipIdx] || allClips[0];
  const question = clip?.questions[qIdx];
  const qTypeColors = Object.fromEntries(Q_TYPES.map(t => [t.type, t.color]));
  const qTypeLabels = Object.fromEntries(Q_TYPES.map(t => [t.type, t.label]));

  const embedUrl = clip?.youtubeId
    ? `https://www.youtube-nocookie.com/embed/${clip.youtubeId}?start=${clip.startSeconds || 0}${clip.stopSeconds ? `&end=${clip.stopSeconds}` : ""}&rel=0&modestbranding=1&cc_load_policy=1`
    : null;

  const resetClipState = () => {
    setPhase("watch"); setQIdx(0); setAnswers([]); setSelected(null);
    setConfirmed(false); setAiComment(""); setPendingAI(null); setVideoError(false);
  };

  // Close dropdown when clicking outside; reposition on scroll/resize
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    const reposition = () => {
      const rect = dropdownRef.current?.getBoundingClientRect();
      if (rect) setDropdownRect(rect);
    };
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [dropdownOpen]);

  const confirmAnswer = () => {
    if (selected === null) return;
    const correct = selected === question.answer;
    const newAnswers = [...answers, { qIdx, selected, correct }];
    setAnswers(newAnswers);
    setConfirmed(true);
    // If this was the last question, transition to result immediately with complete answers
    if (qIdx >= clip.questions.length - 1) {
      const score = newAnswers.filter(a => a.correct).length;
      setScores(s => ({ ...s, [clip.id]: score }));
      addToLog && addToLog({ type: "video", item: clip.title, result: `${score}/${clip.questions.length}`, time: new Date().toLocaleTimeString() });
      const promptText = `The patient just watched a video titled "${clip.title}" and answered ${clip.questions.length} comprehension questions, getting ${score} correct.\n\nQuestions and answers:\n${clip.questions.map((q, i) => `Q${i+1} (${q.type}): "${q.question}"\nPatient chose: "${q.options[newAnswers[i]?.selected ?? -1] || "no answer"}" — ${newAnswers[i]?.correct ? "CORRECT" : `WRONG (correct: "${q.options[q.answer]}")`}`).join("\n\n")}\n\nProvide a brief, warm, encouraging comment (3-4 sentences) about their performance. Note what they did well and what to keep practising.`;
      setPendingAI([{ role: "user", content: promptText }]);
      setLoadingAI(true);
      // Small delay so the "✓ Correct / ✗ Wrong" feedback is visible before transitioning
      setTimeout(() => setPhase("result"), 900);
    }
  };

  const nextQuestion = () => {
    if (qIdx < clip.questions.length - 1) {
      setQIdx(q => q + 1); setSelected(null); setConfirmed(false);
    }
  };

  const nextClip = () => {
    const next = (clipIdx + 1) % allClips.length;
    setClipIdx(next);
    resetClipState();
  };

  const handleSaveImport = (newClip) => {
    const next = [...customClips, newClip];
    // If this is a local file clip, pass the fileUrl so it gets saved to IndexedDB.
    // The fileUrl is stripped from the metadata stored in localStorage (see normaliseClip).
    const fileEntries = newClip.fileUrl ? [{ id: newClip.id, fileUrl: newClip.fileUrl }] : [];
    saveCustomClips(next, fileEntries);
    setClipIdx(VIDEO_CLIPS.length + next.length - 1); // pre-select the new clip
    setShowAddPanel(false);   // return to admin list — user sees new clip in "My Clips"
    resetClipState();
    // Do NOT closeAdmin() — user stays in admin panel to confirm the clip was added
  };

  const deleteCustomClip = (id) => {
    const next = customClips.filter(c => c.id !== id);
    saveCustomClipsSync(next);
    // Also remove any stored video data from IndexedDB
    videoIdb_delete(id).catch(() => {});
    setFileUrls(prev => { const u = { ...prev }; delete u[id]; return u; });
    if (clipIdx >= VIDEO_CLIPS.length + next.length) setClipIdx(0);
    resetClipState();
  };

  // Save edits to a clip's questions (works for built-in and custom)
  const saveClipEdits = (updatedClip) => {
    if (updatedClip.isCustom) {
      saveCustomClipsSync(customClips.map(c => c.id === updatedClip.id ? updatedClip : c));
    } else {
      const patchKey = "ppa_video_patches";
      let patches = {};
      try { patches = JSON.parse(localStorage.getItem(patchKey) || "{}"); } catch {}
      patches[updatedClip.id] = updatedClip;
      localStorage.setItem(patchKey, JSON.stringify(patches));
      // Force re-read patches on next render by reloading
      window.location.reload();
    }
    setEditingClip(null);
    setAdminClipIdx(null);
  };

  // ── Admin view ──────────────────────────────────────────────────────────────
  if (adminOpen) {
    // Sub-view: Add new clip
        // Sub-view: Edit a clip's questions
    if (editingClip) {
      const updateQ = (qi, field, value) =>
        setEditingClip(ec => ({ ...ec, questions: ec.questions.map((q, i) => i === qi ? { ...q, [field]: value } : q) }));
      const updateOption = (qi, oi, value) =>
        setEditingClip(ec => ({ ...ec, questions: ec.questions.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? value : o) }) }));

      return (
        <div style={{ padding: 20, maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setEditingClip(null)} style={{ padding: "8px 16px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 10, cursor: "pointer", color: "#666", fontWeight: 600, fontSize: 14 }}>← Back</button>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#2D3B36" }}>Edit Questions — {editingClip.title}</div>
              {!editingClip.isCustom && <div style={{ fontSize: 12, color: "#D4A843" }}>Editing a built-in clip — changes saved locally in your browser</div>}
            </div>
          </div>

          {/* Title + description (custom clips only) */}
          {editingClip.isCustom && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "#F5F0E8", borderRadius: 14, padding: "14px 18px" }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>Title</label>
                <input value={editingClip.title} onChange={e => setEditingClip(ec => ({ ...ec, title: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 15, outline: "none", background: "#FFFDF9" }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>Description</label>
                <textarea value={editingClip.description} onChange={e => setEditingClip(ec => ({ ...ec, description: e.target.value }))}
                  rows={2} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit", background: "#FFFDF9" }} />
              </div>
              {editingClip.youtubeId && (
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>Start (seconds)</label>
                    <input type="number" min="0" value={editingClip.startSeconds ?? 0}
                      onChange={e => setEditingClip(ec => ({ ...ec, startSeconds: Math.max(0, parseInt(e.target.value) || 0) }))}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 14, fontFamily: "inherit", outline: "none", background: "#FFFDF9" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>Stop (seconds)</label>
                    <input type="number" min="0" value={editingClip.stopSeconds ?? ""}
                      onChange={e => setEditingClip(ec => ({ ...ec, stopSeconds: e.target.value === "" ? undefined : Math.max(0, parseInt(e.target.value) || 0) }))}
                      placeholder="end of clip"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "2px solid #D5CFC4", fontSize: 14, fontFamily: "inherit", outline: "none", background: "#FFFDF9" }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Questions editor */}
          {editingClip.questions.map((q, qi) => (
            <div key={qi} style={{ borderRadius: 14, border: `2px solid ${q.color}30`, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", background: q.color + "15", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{q.icon}</span>
                <span style={{ fontWeight: 800, color: q.color, letterSpacing: 1, fontSize: 13 }}>{q.type.toUpperCase()} QUESTION</span>
              </div>
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, background: "#FFFDF9" }}>
                <input value={q.question} onChange={e => updateQ(qi, "question", e.target.value)}
                  placeholder="Question text..."
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 9, border: "2px solid #D5CFC4", fontSize: 15, background: "#fff", color: "#2D3B36", outline: "none", fontFamily: "inherit" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {q.options.map((opt, oi) => (
                    <div key={oi} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={() => updateQ(qi, "answer", oi)}
                        style={{ width: 30, height: 30, borderRadius: "50%", border: `3px solid ${q.answer === oi ? q.color : "#D5CFC4"}`, background: q.answer === oi ? q.color : "#fff", color: q.answer === oi ? "#fff" : "#999", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }}
                        title="Mark as correct answer">{String.fromCharCode(65 + oi)}</button>
                      <input value={opt} onChange={e => updateOption(qi, oi, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + oi)}${q.answer === oi ? " (correct)" : ""}`}
                        style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `2px solid ${q.answer === oi ? q.color + "60" : "#D5CFC4"}`, fontSize: 14, background: q.answer === oi ? q.color + "08" : "#fff", color: "#2D3B36", outline: "none", fontFamily: "inherit" }} />
                    </div>
                  ))}
                </div>
                <input value={q.hint} onChange={e => updateQ(qi, "hint", e.target.value)} placeholder="Hint..."
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 9, border: "2px solid #D5CFC4", fontSize: 13, background: "#FFFDF9", color: "#666", outline: "none", fontFamily: "inherit", fontStyle: "italic" }} />
              </div>
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={() => setEditingClip(null)} style={{ padding: "11px 20px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600, color: "#666" }}>Cancel</button>
            <button onClick={() => saveClipEdits(editingClip)}
              style={{ padding: "11px 28px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 700 }}>Save Changes</button>
          </div>
        </div>
      );
    }

    // Main admin list view
        {/* Export/import dialogs */}
    {showVmExport && (
      <PpaExportDialog moduleId={VM_MODULE_ID} items={customClips} getLabel={vmGetLabel}
        onExport={handleVmExport} onClose={() => setShowVmExport(false)} />
    )}
    {showVmReexport && (
      <PpaReexportDialog moduleId={VM_MODULE_ID}
        dirtyItems={customClips.filter(c => ppaIsItemDirty(c, ppaGetSnapshots()))}
        getLabel={vmGetLabel} knownFiles={ppaFilesForModule(VM_MODULE_ID)}
        onReexport={(s, gef) => { ppaHandleReexport(VM_MODULE_ID, [], customClips, s, gef, vmBuildPayload, updated => saveCustomClipsSync(updated)); forceCloseAdmin(); }}
        onSkip={forceCloseAdmin} />
    )}
    {vmImportToast && (
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 4000, background: "#2D3B36",
        color: "#E8F4F2", borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 600,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)", display: "flex", gap: 12, alignItems: "center" }}>
        ✅ Imported: {vmImportToast.text}
        <button onClick={() => setVmImportToast(null)} style={{ background: "none", border: "none",
          color: "#7BAE9F", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>
    )}
    return (
      <div style={{ padding: 20, maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {!pinPassed ? (
          <AdminPinEntry onSuccess={() => setPinPassed(true)} onCancel={closeAdmin} />
        ) : (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#2D3B36", borderRadius: 14, padding: "14px 20px" }}>
              <span style={{ fontSize: 20 }}>{"⚙️"}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#E8F4F2", flex: 1 }}>Video Questions Admin</span>
              <PpaAdminToolbar onExport={() => setShowVmExport(true)} onImport={handleVmImport} />
              <button onClick={closeAdmin} style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid #4E8B80", background: "transparent", color: "#7BAE9F", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>✕ Close</button>
            </div>

            {/* Clip library */}
            <div style={{ background: "#FFFDF9", borderRadius: 16, border: "1px solid #E8E0D0", overflow: "hidden" }}>
              {/* Built-in clips */}
              <div style={{ padding: "10px 18px", background: "#F5F0E8", borderBottom: "1px solid #E8E0D0" }}>
                <span style={{ fontWeight: 700, color: "#2D3B36", fontSize: 14 }}>Built-in Clips</span>
                <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>Edit questions only</span>
              </div>
              {VIDEO_CLIPS.map((c, i) => (
                <div key={c.id} style={{ padding: "12px 18px", borderBottom: "1px solid #F0EDE8", display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{c.thumbnail}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#2D3B36" }}>{c.title}</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{c.difficulty} • {c.questions.length} questions</div>
                  </div>
                  <button onClick={() => setEditingClip(JSON.parse(JSON.stringify(c)))}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 13, color: "#666", fontWeight: 600 }}>✏ Edit Questions</button>
                </div>
              ))}

              {/* Custom clips */}
              {customClips.length > 0 ? (
                <>
                  <div style={{ padding: "10px 18px", background: "#FFF8E8", borderTop: "1px solid #E8E0D0", borderBottom: "1px solid #E8E0D0" }}>
                    <span style={{ fontWeight: 700, color: "#B08020", fontSize: 14 }}>My Clips</span>
                    <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>Edit or delete • appear in the clip selector above</span>
                  </div>
                  {customClips.map((c) => (
                    <div key={c.id} style={{ padding: "12px 18px", borderBottom: "1px solid #F0EDE8", display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 22, flexShrink: 0 }}>{c.thumbnail}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#2D3B36" }}>{c.title}</div>
                        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{c.difficulty} • {c.questions.length} questions {c.youtubeId ? "• YouTube" : c.isLocalFile ? "• Local file" : ""}</div>
                      </div>
                      <button onClick={() => setEditingClip(JSON.parse(JSON.stringify(c)))}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 13, color: "#666", fontWeight: 600 }}>✏ Edit</button>
                      <button onClick={() => deleteCustomClip(c.id)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E0A0A0", background: "#FFF5F5", cursor: "pointer", fontSize: 13, color: "#C07070", fontWeight: 600 }}>✕</button>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ padding: "14px 18px", background: "#FFFDF9", borderTop: "1px solid #E8E0D0", color: "#AAA", fontSize: 13, fontStyle: "italic" }}>
                  No custom clips yet — click "+ Add New Video Clip" below to add one.
                </div>
              )}
            </div>

            {/* Add new */}
            <button onClick={() => setShowAddPanel(true)}
              style={{ padding: "14px 24px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 14, cursor: "pointer", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              + Add New Video Clip
            </button>
          </>
        )}

        {/* Import panel — floats as modal over the admin list */}
        {showAddPanel && (
          <ImportPanel onSave={handleSaveImport} onCancel={() => setShowAddPanel(false)} />
        )}
      </div>
    );
  }


  return (
    <div style={{ padding: 20, maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", position: "relative", gap: 18 }}>
      {pendingAI && (
        <CallAPI messages={pendingAI}
          onResult={t => { setAiComment(t); setLoadingAI(false); setPendingAI(null); }}
          onError={() => { setLoadingAI(false); setPendingAI(null); }}
        />
      )}

      {/* Clip selector + admin gear */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

        {/* Dropdown clip picker */}
        <div ref={dropdownRef} style={{ position: "relative", flex: 1 }}>

          {/* Trigger button — shows current clip, opens dropdown */}
          <button onClick={() => {
              if (!dropdownOpen) {
                const rect = dropdownRef.current?.getBoundingClientRect();
                setDropdownRect(rect || null);
              }
              setDropdownOpen(o => !o);
            }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
              borderRadius: 14, border: "2px solid #4E8B80", background: "#E8F4F2",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <span style={{ fontSize: 20 }}>{clip?.thumbnail}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#2D3B36",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{clip?.title}</div>
              <div style={{ fontSize: 12, color: "#7BAE9F" }}>
                {clip?.difficulty} • {clip?.questions?.length} questions
                {scores[clip?.id] !== undefined ? ` • ✓ ${scores[clip.id]}/${clip.questions.length}` : ""}
                {clip?.isCustom ? " • MY CLIP" : ""}
              </div>
            </div>
            <span style={{ fontSize: 13, color: "#4E8B80", fontWeight: 700, flexShrink: 0 }}>{dropdownOpen ? "▲" : "▼"}</span>
          </button>

          {/* Dropdown panel */}
          {dropdownOpen && (() => {
            const builtIn = allClips.filter(c => !c.isCustom);
            const custom  = allClips.filter(c =>  c.isCustom);
            const groups  = [
              { label: "Easy",     clips: builtIn.filter(c => c.difficulty === "easy"),   color: "#4E8B80" },
              { label: "Medium",   clips: builtIn.filter(c => c.difficulty === "medium"), color: "#C09040" },
              { label: "Hard",     clips: builtIn.filter(c => c.difficulty === "hard"),   color: "#C07070" },
              ...(custom.length > 0 ? [{ label: "My Clips", clips: custom, color: "#B08020" }] : []),
            ].filter(g => g.clips.length > 0);

            return (
              <div style={{ position: "fixed",
                top: dropdownRect ? dropdownRect.bottom + 6 : 0,
                left: dropdownRect ? dropdownRect.left : 0,
                width: dropdownRect ? dropdownRect.width : "auto",
                zIndex: 9999,
                background: "#FFFDF9", borderRadius: 16, border: "2px solid #D5CFC4",
                boxShadow: "0 8px 32px rgba(0,0,0,0.15)", maxHeight: "60vh", overflowY: "auto" }}>
                {groups.map((group, gi) => (
                  <div key={group.label}>
                    <div style={{ padding: "6px 16px", background: "#F5F0E8",
                      borderTop: gi > 0 ? "1px solid #E8E0D0" : "none",
                      fontSize: 11, fontWeight: 800, color: group.color, letterSpacing: 1, textTransform: "uppercase" }}>
                      {group.label}
                    </div>
                    {group.clips.map(c => {
                      const i = allClips.indexOf(c);
                      const done = scores[c.id] !== undefined;
                      const isSel = i === clipIdx;
                      return (
                        <button key={c.id}
                          onClick={() => { setClipIdx(i); resetClipState(); setDropdownOpen(false); }}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 12,
                            padding: "11px 16px", background: isSel ? "#E8F4F2" : "transparent",
                            border: "none", borderTop: "1px solid #F0EDE8",
                            cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.12s" }}
                          onMouseOver={e => { if (!isSel) e.currentTarget.style.background = "#F5F0E8"; }}
                          onMouseOut={e =>  { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                          <span style={{ fontSize: 22, flexShrink: 0 }}>{c.thumbnail}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: isSel ? 700 : 600,
                              color: isSel ? "#2D5A54" : "#2D3B36" }}>{c.title}</div>
                            <div style={{ fontSize: 12, color: "#999", marginTop: 1 }}>{c.questions.length} questions</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {c.isCustom && <span style={{ fontSize: 10, padding: "2px 7px", background: "#D4A84330",
                              color: "#B08020", borderRadius: 6, fontWeight: 800 }}>MY</span>}
                            {done && <span style={{ fontSize: 12, color: "#9B7FB8", fontWeight: 700 }}>✓ {scores[c.id]}/{c.questions.length}</span>}
                            {isSel && <span style={{ fontSize: 14, color: "#4E8B80" }}>●</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Admin gear */}
        <button onClick={openAdmin} title="Admin: manage video clips"
          style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", border: "2px solid #D5CFC4",
            background: "#FFFDF9", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center",
            justifyContent: "center", color: "#888", transition: "all 0.2s" }}
          onMouseOver={e => { e.currentTarget.style.borderColor = "#4E8B80"; e.currentTarget.style.color = "#4E8B80"; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = "#D5CFC4"; e.currentTarget.style.color = "#888"; }}>
          {"⚙️"}
        </button>
      </div>


      {/* WATCH phase */}
      {phase === "watch" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#FFFDF9", borderRadius: 20, overflow: "hidden", border: "1px solid #E8E0D0", boxShadow: "0 4px 20px rgba(0,0,0,0.07)" }}>
            {/* Video embed — YouTube or local file */}
            {!videoError ? (
              <div style={{ position: "relative", paddingTop: "56.25%", background: "#1a1a2e" }}>
                {embedUrl ? (
                  <iframe
                    ref={iframeRef}
                    src={embedUrl}
                    title={clip.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    onError={() => setVideoError(true)}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                  />
                ) : clip.fileUrl ? (
                  <video src={clip.fileUrl} controls style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", background: "#000" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>No video source</div>
                )}
              </div>
            ) : (
              <div style={{ background: "#1a1a2e", padding: 40, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 64 }}>{clip.thumbnail}</div>
                <div style={{ color: "#E8F4F2", fontSize: 17, maxWidth: 460, lineHeight: 1.6 }}>{clip.description}</div>
                <div style={{ color: "#7BAE9F", fontSize: 13 }}>📖 Read the scene description above, then answer the questions.</div>
              </div>
            )}

            {/* Video info */}
            <div style={{ padding: "16px 20px", borderTop: "1px solid #E8E0D0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36" }}>{clip.title}</div>
                  <div style={{ fontSize: 14, color: "#888", marginTop: 4, lineHeight: 1.5 }}>{clip.description}</div>
                </div>
                <span style={{ padding: "4px 12px", borderRadius: 20, background: clip.difficulty === "easy" ? "#E8F4F2" : "#F0ECF7", color: clip.difficulty === "easy" ? "#4E8B80" : "#9B7FB8", fontSize: 12, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {clip.difficulty}
                </span>
              </div>
            </div>
          </div>

          <div style={{ background: "#FFF8E8", borderRadius: 14, padding: "14px 18px", border: "1px solid #F0E0A0", fontSize: 15, color: "#5A4A1A", lineHeight: 1.6 }}>
            💡 Watch the video above. Take your time. When you're ready, press the button below to answer questions about what you saw.
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={() => setPhase("questions")} style={{ padding: "16px 40px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 16, cursor: "pointer", fontSize: 18, fontWeight: 700, boxShadow: "0 4px 15px #4E8B8040" }}>
              I'm Ready — Answer Questions →
            </button>
          </div>
          {videoError && (
            <div style={{ textAlign: "center" }}>
              <button onClick={() => setVideoError(false)} style={{ fontSize: 13, color: "#4E8B80", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Try loading video again</button>
            </div>
          )}
        </div>
      )}

      {/* QUESTIONS phase */}
      {phase === "questions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Progress bar */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {clip.questions.map((q, i) => (
              <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < qIdx ? "#4E8B80" : i === qIdx ? "#D4A843" : "#E8E0D0", transition: "background 0.3s" }} />
            ))}
            <span style={{ fontSize: 13, color: "#888", whiteSpace: "nowrap", marginLeft: 4 }}>
              {qIdx + 1} / {clip.questions.length}
            </span>
          </div>

          {/* Question card */}
          <div style={{ background: "#FFFDF9", borderRadius: 20, padding: 28, border: "1px solid #E8E0D0", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            {/* Question type badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, background: qTypeColors[question.type] + "18", border: `2px solid ${qTypeColors[question.type]}40`, marginBottom: 18 }}>
              <span style={{ fontSize: 18 }}>{question.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: qTypeColors[question.type], letterSpacing: 2 }}>{qTypeLabels[question.type]}</span>
            </div>

            <div style={{ fontSize: 22, fontWeight: 700, color: "#2D3B36", marginBottom: 24, lineHeight: 1.4 }}>
              {question.question}
            </div>

            {/* Options */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {question.options.map((opt, i) => {
                let bg = "#F5F0E8", border = "#D5CFC4", color = "#2D3B36";
                if (selected === i && !confirmed) { bg = "#E8F4F2"; border = "#4E8B80"; color = "#2D5A54"; }
                if (confirmed) {
                  if (i === question.answer) { bg = "#E8F4F2"; border = "#4E8B80"; color = "#2D5A54"; }
                  else if (i === selected && selected !== question.answer) { bg = "#FDE8E8"; border = "#C07070"; color = "#7A2020"; }
                  else { bg = "#F5F0E8"; border = "#D5CFC4"; color = "#aaa"; }
                }
                return (
                  <button key={i} onClick={() => !confirmed && setSelected(i)}
                    style={{ padding: "14px 20px", borderRadius: 14, border: `2px solid ${border}`, background: bg, color, fontSize: 16, textAlign: "left", cursor: confirmed ? "default" : "pointer", fontFamily: "inherit", fontWeight: selected === i || (confirmed && i === question.answer) ? 700 : 400, transition: "all 0.2s", display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 28, height: 28, borderRadius: "50%", background: border + "30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: border, flexShrink: 0 }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                    {confirmed && i === question.answer && <span style={{ marginLeft: "auto", fontSize: 18 }}>✓</span>}
                    {confirmed && i === selected && selected !== question.answer && <span style={{ marginLeft: "auto", fontSize: 18 }}>✗</span>}
                  </button>
                );
              })}
            </div>

            {/* Hint */}
            {!confirmed && selected === null && (
              <div style={{ marginTop: 16, fontSize: 14, color: "#999", fontStyle: "italic" }}>
                💡 Hint: {question.hint}
              </div>
            )}

            {/* Confirm / next buttons */}
            <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              {!confirmed ? (
                <button onClick={confirmAnswer} disabled={selected === null}
                  style={{ padding: "12px 28px", background: selected !== null ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#C5BEB4", color: "#fff", border: "none", borderRadius: 12, cursor: selected !== null ? "pointer" : "default", fontSize: 16, fontWeight: 700 }}>
                  Confirm Answer
                </button>
              ) : (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 15, color: selected === question.answer ? "#4E8B80" : "#C07070", fontWeight: 700 }}>
                    {selected === question.answer ? "✓ Correct!" : `✗ The answer was: "${question.options[question.answer]}"`}
                  </div>
                  <button onClick={nextQuestion}
                    style={{ padding: "12px 28px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 700, display: qIdx >= clip.questions.length - 1 ? "none" : "block" }}>
                    {"Next Question →"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <button onClick={() => setPhase("watch")} style={{ alignSelf: "flex-start", fontSize: 13, color: "#888", background: "none", border: "none", cursor: "pointer" }}>
            ← Watch video again
          </button>
        </div>
      )}

      {/* RESULT phase */}
      {phase === "result" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Score card */}
          <div style={{ background: "#FFFDF9", borderRadius: 20, padding: 32, textAlign: "center", border: "1px solid #E8E0D0", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 56 }}>{clip.thumbnail}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#2D3B36", marginTop: 12 }}>{clip.title}</div>
            <div style={{ fontSize: 52, fontWeight: 800, color: "#4E8B80", margin: "16px 0" }}>
              {answers.filter(a => a.correct).length}<span style={{ fontSize: 28, color: "#888" }}>/{clip.questions.length}</span>
            </div>
            <div style={{ fontSize: 16, color: "#666", marginBottom: 24 }}>
              {answers.filter(a => a.correct).length === 3 ? "Excellent! All correct! 🌟" : answers.filter(a => a.correct).length === 2 ? "Good work — 2 out of 3! 👍" : answers.filter(a => a.correct).length === 1 ? "1 correct — keep practicing! 💪" : "Let's review and try again."}
            </div>

            {/* Answer review */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
              {clip.questions.map((q, i) => {
                const a = answers[i];
                return (
                  <div key={i} style={{ padding: "12px 16px", borderRadius: 12, background: a?.correct ? "#E8F4F2" : "#FDE8E8", border: `1px solid ${a?.correct ? "#B0D4CE" : "#F0B0B0"}`, display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 20 }}>{q.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: a?.correct ? "#4E8B80" : "#C07070", textTransform: "uppercase", letterSpacing: 1 }}>{q.type} {a?.correct ? "✓" : "✗"}</div>
                      <div style={{ fontSize: 14, color: "#444", marginTop: 2 }}>{q.question}</div>
                      <div style={{ fontSize: 14, color: "#2D3B36", fontWeight: 600, marginTop: 4 }}>
                        {a?.correct ? `Your answer: "${q.options[a.selected]}"` : <>Your answer: <span style={{ color: "#C07070" }}>"{q.options[a?.selected]}"</span> → Correct: <span style={{ color: "#4E8B80" }}>"{q.options[q.answer]}"</span></>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI feedback */}
          {(loadingAI || aiComment) && (
            <div style={{ background: "#F0F7F5", borderRadius: 14, padding: "16px 20px", border: "1px solid #B0D4CE" }}>
              <div style={{ fontSize: 13, color: "#4E8B80", fontWeight: 700, marginBottom: 8 }}>🧠 Dr. Aria</div>
              {loadingAI ? <ThinkingDots /> : <div style={{ fontSize: 16, color: "#2D3B36", lineHeight: 1.7 }}>{aiComment}</div>}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => { setPhase("watch"); setQIdx(0); setAnswers([]); setSelected(null); setConfirmed(false); setAiComment(""); setPendingAI(null); }}
              style={{ padding: "12px 24px", background: "#F5F0E8", color: "#2D3B36", border: "2px solid #D5CFC4", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600 }}>
              🔄 Try Again
            </button>
            <button onClick={nextClip}
              style={{ padding: "12px 24px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 700 }}>
              Next Video →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- UTIL ----
function Btn({ color, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "11px 20px", borderRadius: 12, border: "none", cursor: "pointer",
      background: color, color: "#fff", fontSize: 15, fontWeight: 600, transition: "opacity 0.15s",
    }}
      onMouseOver={e => e.target.style.opacity = 0.85}
      onMouseOut={e => e.target.style.opacity = 1}>
      {children}
    </button>
  );
}

// ---- APP ----
export default function App() {
  const [active, setActive] = useState("therapist");
  const [appBackupStale, setAppBackupStale] = useState(() => ppaBackupIsStale(7));
  const _TODAY_KEY = `ppa_progress_${new Date().toISOString().slice(0, 10)}`;
  const [sessionLog, setSessionLog] = useState(() => {
    try { const s = localStorage.getItem(_TODAY_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const addToLog = useCallback((entry) => {
    const key = `ppa_progress_${new Date().toISOString().slice(0, 10)}`;
    setSessionLog(l => {
      const next = [...l, entry];
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Refresh backup staleness whenever the active module changes (content may have changed)
  useEffect(() => { setAppBackupStale(ppaBackupIsStale(7)); }, [active]);
  // Also recheck on window focus so the badge appears even if the user stays on the same module
  useEffect(() => {
    const onFocus = () => setAppBackupStale(ppaBackupIsStale(7));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const ActiveModule = {
    therapist: <TherapistModule sessionLog={sessionLog} addToLog={addToLog} />,
    naming: <NamingModule addToLog={addToLog} />,
    assessment: <AssessmentModule addToLog={addToLog} />,
    repetition: <RepetitionModule addToLog={addToLog} />,
    sentence: <SentenceModule addToLog={addToLog} />,
    scripts: <ScriptsModule />,
    sentence_builder: <SentenceBuilderModule addToLog={addToLog} />,
    video: <VideoModule addToLog={addToLog} />,
    progress: <ProgressModule sessionLog={sessionLog} />,
  }[active];

  const activeTool = TOOLS.find(t => t.id === active);

  return (
    <div style={{ minHeight: "100vh", background: "#F9F6EF", fontFamily: "'Georgia', 'Times New Roman', serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #C5BEB4; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #2D5A54 0%, #1E3D3A 100%)", padding: "18px 24px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: 30 }}>🌿</div>
        <div>
          <div style={{ color: "#E8F4F2", fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>PPA Speech Therapy Suite</div>
          <div style={{ color: "#7BAE9F", fontSize: 13 }}>AI-Assisted Language Therapy • Dr. Aria, SLP</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {appBackupStale && (
            <button
              onClick={() => { setAppBackupStale(false); ppaDoBackup("ppa-therapy-backup"); setTimeout(() => setAppBackupStale(ppaBackupIsStale(7)), 500); }}
              title="Backup recommended — click to download a full backup"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                background: "#D4A84330", border: "1px solid #D4A843", borderRadius: 10,
                cursor: "pointer", color: "#D4A843", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
              💾 Backup recommended
            </button>
          )}
          <div style={{ background: "#4E8B8030", borderRadius: 10, padding: "6px 14px" }}>
            <span style={{ color: "#7BAE9F", fontSize: 13 }}>Session: {sessionLog.length} activities</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", maxHeight: "calc(100vh - 72px)" }}>
        {/* Sidebar */}
        <div style={{ width: 190, background: "#FFFDF9", borderRight: "1px solid #E8E0D0", display: "flex", flexDirection: "column", padding: "12px 8px", gap: 4, overflowY: "auto", flexShrink: 0 }}>
          {TOOLS.map(tool => (
            <button key={tool.id} onClick={() => setActive(tool.id)} style={{
              padding: "12px 10px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
              background: active === tool.id ? "linear-gradient(135deg, #E8F4F2, #D4EDE9)" : "transparent",
              borderLeft: active === tool.id ? "3px solid #4E8B80" : "3px solid transparent",
              transition: "all 0.2s",
            }}>
              <div style={{ fontSize: 18 }}>{tool.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: active === tool.id ? "#2D5A54" : "#444", marginTop: 2 }}>{tool.label}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2, lineHeight: 1.3 }}>{tool.desc}</div>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px 24px", borderBottom: "1px solid #E8E0D0", background: "#FFFDF9", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>{activeTool?.icon}</span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36" }}>{activeTool?.label}</div>
              <div style={{ fontSize: 13, color: "#888" }}>{activeTool?.desc}</div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {ActiveModule}
          </div>
        </div>
      </div>
    </div>
  );
}
