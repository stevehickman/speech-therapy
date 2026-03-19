import { useState, useRef, useEffect } from "react";
import { SCRIPTS } from "./data/scripts.js";
import {
  PPA_EXT,
  ppaGetSnapshots, ppaFilesForModule, ppaAddKnownFile,
  ppaItemId, ppaIsItemDirty, ppaRecordExportInMemory,
  ppaDownload, ppaHandleReexport, ppaHandleImport,
  PpaAdminToolbar, PpaExportDialog, PpaReexportDialog,
} from "./ExportImportSystem.jsx";
import { AdminPinEntry } from "./AdminPinEntry.jsx";

export default function ScriptsModule() {
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
  const [adminSit, setAdminSit] = useState(0);
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
