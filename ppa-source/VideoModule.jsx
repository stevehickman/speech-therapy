import { useState, useRef, useEffect, useMemo } from "react";
import {
  VIDEO_CLIPS, EMOJI_OPTIONS, Q_TYPES,
  makeBlankQuestion, extractYouTubeId,
} from "./data/videoClips.js";
import {
  PPA_EXT,
  ppaGetSnapshots, ppaFilesForModule, ppaAddKnownFile,
  ppaItemId, ppaIsItemDirty, ppaRecordExportInMemory,
  ppaDownload, ppaHandleReexport, ppaHandleImport,
  PpaAdminToolbar, PpaExportDialog, PpaReexportDialog,
} from "./ExportImportSystem.jsx";
import { AdminPinEntry } from "./AdminPinEntry.jsx";
import { CallAPI, ThinkingDots } from "./shared.jsx";

// ── IndexedDB helpers for storing large video file data ─────────────────────
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
  const db = await videoIdb_open();
  const result = new Map();
  await Promise.all(ids.map(id => new Promise((resolve) => {
    const req = db.transaction(VIDEO_IDB_STORE, "readonly")
                  .objectStore(VIDEO_IDB_STORE).get(id);
    req.onsuccess = (e) => {
      if (e.target.result?.dataUrl) result.set(id, e.target.result.dataUrl);
      resolve();
    };
    req.onerror = () => resolve();
  })));
  return result;
}

function normaliseClip(c) {
  const blankQs = Q_TYPES.map(q => makeBlankQuestion(q.type, q.icon, q.color));
  return {
    id:          c.id          ?? `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    isCustom:    true,
    title:       c.title       ?? "Untitled Clip",
    description: c.description ?? (c.title ?? ""),
    thumbnail:   c.thumbnail   ?? "🎬",
    difficulty:  c.difficulty  ?? "medium",
    questions:   (() => {
      const existing = Array.isArray(c.questions) ? c.questions : [];
      return blankQs.map((blank, i) => existing[i] ?? blank);
    })(),
    ...(c.youtubeId  ? { youtubeId: c.youtubeId, startSeconds: c.startSeconds ?? 0, ...(c.stopSeconds != null ? { stopSeconds: c.stopSeconds } : {}) } : {}),
    ...(c.fileName   ? { fileName: c.fileName } : {}),
    ...((c.isLocalFile || (c.fileUrl && !c.youtubeId)) ? { isLocalFile: true } : {}),
    ...(c._sourceFile ? { _sourceFile: c._sourceFile } : {}),
  };
}

// ---- IMPORT PANEL ----
function ImportPanel({ onSave, onCancel }) {
  const [tab, setTab] = useState("youtube");
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
  const [step, setStep] = useState(1);
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

// ---- VIDEO MODULE ----
export default function VideoModule({ addToLog }) {
  const [customClips, setCustomClips] = useState(() => {
    try {
      const s = localStorage.getItem("ppa_video_clips");
      const raw = s ? JSON.parse(s) : [];
      const normalised = raw.map(normaliseClip);
      if (JSON.stringify(raw) !== JSON.stringify(normalised)) {
        try { localStorage.setItem("ppa_video_clips", JSON.stringify(normalised)); } catch {}
      }
      return normalised;
    } catch { return []; }
  });

  const [fileUrls, setFileUrls] = useState({});

  useEffect(() => {
    const localIds = customClips.filter(c => c.isLocalFile).map(c => c.id);
    if (localIds.length === 0) return;
    videoIdb_loadAll(localIds).then(map => {
      if (map.size > 0) setFileUrls(prev => ({ ...prev, ...Object.fromEntries(map) }));
    }).catch(() => {});
  }, []);

  const saveCustomClips = async (next, pendingFileEntries = []) => {
    const normalised = next.map(normaliseClip);
    for (const { id, fileUrl } of pendingFileEntries) {
      try { await videoIdb_save(id, fileUrl); } catch (e) {
        console.warn("PPA: could not save video to IndexedDB:", e);
      }
    }
    if (pendingFileEntries.length > 0) {
      setFileUrls(prev => {
        const updated = { ...prev };
        for (const { id, fileUrl } of pendingFileEntries) updated[id] = fileUrl;
        return updated;
      });
    }
    setCustomClips(normalised);
    try { localStorage.setItem("ppa_video_clips", JSON.stringify(normalised)); } catch (e) {
      console.warn("PPA: could not save clip metadata to localStorage:", e);
    }
  };

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
  const [adminClipIdx, setAdminClipIdx] = useState(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [editingClip, setEditingClip] = useState(null);

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

  const [builtInPatches] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ppa_video_patches") || "{}"); }
    catch { return {}; }
  });
  const allClips = useMemo(() => [
    ...VIDEO_CLIPS.map(c => builtInPatches[c.id] ? { ...c, ...builtInPatches[c.id] } : c),
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
    if (qIdx >= clip.questions.length - 1) {
      const score = newAnswers.filter(a => a.correct).length;
      setScores(s => ({ ...s, [clip.id]: score }));
      addToLog && addToLog({ type: "video", item: clip.title, result: `${score}/${clip.questions.length}`, time: new Date().toLocaleTimeString() });
      const promptText = `The patient just watched a video titled "${clip.title}" and answered ${clip.questions.length} comprehension questions, getting ${score} correct.\n\nQuestions and answers:\n${clip.questions.map((q, i) => `Q${i+1} (${q.type}): "${q.question}"\nPatient chose: "${q.options[newAnswers[i]?.selected ?? -1] || "no answer"}" — ${newAnswers[i]?.correct ? "CORRECT" : `WRONG (correct: "${q.options[q.answer]}")`}`).join("\n\n")}\n\nProvide a brief, warm, encouraging comment (3-4 sentences) about their performance. Note what they did well and what to keep practising.`;
      setPendingAI([{ role: "user", content: promptText }]);
      setLoadingAI(true);
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
    const fileEntries = newClip.fileUrl ? [{ id: newClip.id, fileUrl: newClip.fileUrl }] : [];
    saveCustomClips(next, fileEntries);
    setClipIdx(VIDEO_CLIPS.length + next.length - 1);
    setShowAddPanel(false);
    resetClipState();
  };

  const deleteCustomClip = (id) => {
    const next = customClips.filter(c => c.id !== id);
    saveCustomClipsSync(next);
    videoIdb_delete(id).catch(() => {});
    setFileUrls(prev => { const u = { ...prev }; delete u[id]; return u; });
    if (clipIdx >= VIDEO_CLIPS.length + next.length) setClipIdx(0);
    resetClipState();
  };

  const saveClipEdits = (updatedClip) => {
    if (updatedClip.isCustom) {
      saveCustomClipsSync(customClips.map(c => c.id === updatedClip.id ? updatedClip : c));
    } else {
      const patchKey = "ppa_video_patches";
      let patches = {};
      try { patches = JSON.parse(localStorage.getItem(patchKey) || "{}"); } catch {}
      patches[updatedClip.id] = updatedClip;
      localStorage.setItem(patchKey, JSON.stringify(patches));
      window.location.reload();
    }
    setEditingClip(null);
    setAdminClipIdx(null);
  };

  // ── Admin view ──────────────────────────────────────────────────────────────
  if (adminOpen) {
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

    return (
      <div style={{ padding: 20, maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
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

        {!pinPassed ? (
          <AdminPinEntry onSuccess={() => setPinPassed(true)} onCancel={closeAdmin} />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#2D3B36", borderRadius: 14, padding: "14px 20px" }}>
              <span style={{ fontSize: 20 }}>{"⚙️"}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#E8F4F2", flex: 1 }}>Video Questions Admin</span>
              <PpaAdminToolbar onExport={() => setShowVmExport(true)} onImport={handleVmImport} />
              <button onClick={closeAdmin} style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid #4E8B80", background: "transparent", color: "#7BAE9F", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>✕ Close</button>
            </div>

            <div style={{ background: "#FFFDF9", borderRadius: 16, border: "1px solid #E8E0D0", overflow: "hidden" }}>
              <div style={{ padding: "10px 18px", background: "#F5F0E8", borderBottom: "1px solid #E8E0D0" }}>
                <span style={{ fontWeight: 700, color: "#2D3B36", fontSize: 14 }}>Built-in Clips</span>
                <span style={{ fontSize: 12, color: "#999", marginLeft: 8 }}>Edit questions only</span>
              </div>
              {VIDEO_CLIPS.map((c) => (
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

            <button onClick={() => setShowAddPanel(true)}
              style={{ padding: "14px 24px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 14, cursor: "pointer", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              + Add New Video Clip
            </button>
          </>
        )}

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
        <div ref={dropdownRef} style={{ position: "relative", flex: 1 }}>
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
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {clip.questions.map((q, i) => (
              <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < qIdx ? "#4E8B80" : i === qIdx ? "#D4A843" : "#E8E0D0", transition: "background 0.3s" }} />
            ))}
            <span style={{ fontSize: 13, color: "#888", whiteSpace: "nowrap", marginLeft: 4 }}>
              {qIdx + 1} / {clip.questions.length}
            </span>
          </div>

          <div style={{ background: "#FFFDF9", borderRadius: 20, padding: 28, border: "1px solid #E8E0D0", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px", borderRadius: 20, background: qTypeColors[question.type] + "18", border: `2px solid ${qTypeColors[question.type]}40`, marginBottom: 18 }}>
              <span style={{ fontSize: 18 }}>{question.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: qTypeColors[question.type], letterSpacing: 2 }}>{qTypeLabels[question.type]}</span>
            </div>

            <div style={{ fontSize: 22, fontWeight: 700, color: "#2D3B36", marginBottom: 24, lineHeight: 1.4 }}>
              {question.question}
            </div>

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

            {!confirmed && selected === null && (
              <div style={{ marginTop: 16, fontSize: 14, color: "#999", fontStyle: "italic" }}>
                💡 Hint: {question.hint}
              </div>
            )}

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
          <div style={{ background: "#FFFDF9", borderRadius: 20, padding: 32, textAlign: "center", border: "1px solid #E8E0D0", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 56 }}>{clip.thumbnail}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#2D3B36", marginTop: 12 }}>{clip.title}</div>
            <div style={{ fontSize: 52, fontWeight: 800, color: "#4E8B80", margin: "16px 0" }}>
              {answers.filter(a => a.correct).length}<span style={{ fontSize: 28, color: "#888" }}>/{clip.questions.length}</span>
            </div>
            <div style={{ fontSize: 16, color: "#666", marginBottom: 24 }}>
              {answers.filter(a => a.correct).length === 3 ? "Excellent! All correct! 🌟" : answers.filter(a => a.correct).length === 2 ? "Good work — 2 out of 3! 👍" : answers.filter(a => a.correct).length === 1 ? "1 correct — keep practicing! 💪" : "Let's review and try again."}
            </div>

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
