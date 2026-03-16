import { useState, useRef, useEffect } from "react";
import {
  SB_NOUNS, SB_VERBS, SB_ADJECTIVES,
  SB_ADVERBS, SB_PRONOUNS, SB_PREPS, SB_ARTICLES,
} from "./data/sbWordBank.js";
import { conjugateVerb } from "./data/sbConjugation.js";
import { PPA_EXT } from "./ExportImportSystem.jsx";
import { useDictionaryLookup, isImageGraphic, dictGetEntry, dictAddWord } from "./data/dictionary.js";
import { CLAUDE_MODEL } from "./data/config.js";

// ---- SENTENCE BUILDER ----
function SentenceBuilderModule({ addToLog }) {
  const graphicLookup = useDictionaryLookup();
  const [words, setWords] = useState([]); // [{text, emoji, id}]
  const [typedText,  setTypedText]  = useState("");
  const inputRef    = useRef(null);
  const typeTimerRef = useRef(null);

  // ── Typed-word resolution ─────────────────────────────────────────────────
  // Called after the debounce fires.  Splits the buffered input by whitespace,
  // converts each complete word to a chip, and fires a background API call for
  // any word not already in the dictionary.
  const resolveTypedWords = (raw) => {
    const wordList = raw.trim().split(/\s+/).filter(Boolean);
    if (!wordList.length) { setTypedText(""); return; }
    setTypedText("");

    for (const w of wordList) {
      const entry = dictGetEntry(w);
      if (entry) {
        // Known word — add chip with canonical graphic immediately
        setWords(prev => [...prev, { text: w, emoji: entry.graphic, id: Date.now() + Math.random() }]);
      } else {
        // Unknown word — add chip with placeholder, then look up emoji in background
        const chipId = Date.now() + Math.random();
        setWords(prev => [...prev, { text: w, emoji: "❓", id: chipId }]);
        dictAddWord(w, "❓"); // register now; graphic may be upgraded below
        fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: CLAUDE_MODEL, max_tokens: 16,
            messages: [{ role: "user", content: `Reply with only a single emoji that best represents the word "${w}". Just the emoji character, nothing else.` }],
          }),
        })
          .then(r => r.json())
          .then(data => {
            const candidate = (data.content?.map(b => b.text || "").join("") ?? "").trim();
            // Accept only short strings that contain at least one emoji codepoint
            const graphic = (candidate.length > 0 && candidate.length <= 10 && /\p{Emoji}/u.test(candidate))
              ? candidate : "❓";
            dictAddWord(w, graphic);                // upgrades ❓ → real emoji in dictionary
            if (graphic !== "❓") {
              setWords(prev => prev.map(c => c.id === chipId ? { ...c, emoji: graphic } : c));
            }
          })
          .catch(() => {}); // keep ❓ on failure — user can edit in Naming admin
      }
    }
  };

  const handleTypeChange = (val) => {
    setTypedText(val);
    if (typeTimerRef.current) { clearTimeout(typeTimerRef.current); typeTimerRef.current = null; }
    // Trigger conversion after a short pause whenever the buffer ends with a space
    if (val.endsWith(" ") && val.trim()) {
      typeTimerRef.current = setTimeout(() => {
        typeTimerRef.current = null;
        resolveTypedWords(val);
      }, 600);
    }
  };
  const [wordClass, setWordClass] = useState("Nouns");
  const [nounCat, setNounCat] = useState("All Nouns");
  const [verbCat, setVerbCat] = useState("All Actions");
  const [adjCat, setAdjCat] = useState("All Adjectives");
  const [sentenceType, setSentenceType] = useState("statement");
  const [verbTense, setVerbTense] = useState("present-simple");
  const SB_LIB_KEY   = "ppa_sb_library";
  const SB_MODULE_ID = "sentenceBuilder";
  const [library, setLibrary] = useState(() => {
    try { const s = localStorage.getItem(SB_LIB_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const saveLibrary = (next) => { setLibrary(next); try { localStorage.setItem(SB_LIB_KEY, JSON.stringify(next)); } catch {} };
  useEffect(() => { saveLibrary(library); }, []); // seed localStorage on mount
  const [libraryTab, setLibraryTab] = useState("All");
  const [speaking, setSpeaking] = useState(false);
  const [showExportLib,   setShowExportLib]   = useState(false);
  const [showReexportLib, setShowReexportLib] = useState(false);
  const [importToast,     setImportToast]     = useState(null);

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
    saveLibrary([...library, { text, type: sentenceType, time: new Date().toLocaleTimeString(), id: Date.now() }]);
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

  const renderWordTile = (word, emoji, key) => {
    const g = graphicLookup[word?.toLowerCase()] ?? emoji;
    const tileIsImg = isImageGraphic(g);
    return (
      <button key={key} onClick={() => addWord(word, g)}
        style={{ padding: "12px 8px", borderRadius: 14, border: `2px solid ${col.border}`, background: col.bg,
          cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          transition: "all 0.15s", minWidth: 70, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}
        onMouseOver={e => { e.currentTarget.style.borderColor = col.active; e.currentTarget.style.transform = "scale(1.05)"; }}
        onMouseOut={e => { e.currentTarget.style.borderColor = col.border; e.currentTarget.style.transform = "scale(1)"; }}>
        {tileIsImg
          ? <img src={g} alt={word} style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 4 }} />
          : <span style={{ fontSize: 28 }}>{g}</span>}
        <span style={{ fontSize: 12, fontWeight: 700, color: col.text, textAlign: "center" }}>{word}</span>
      </button>
    );
  };

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

  // ── Library export/import ──────────────────────────────────────────────────
  const sbGetLabel = it => it.text || "";
  const sbBuildPayload = (filename, items) => ({
    ppaExport: true, version: 1, moduleId: SB_MODULE_ID, filename,
    exportedAt: new Date().toISOString(), items,
  });

  const handleSbExport = (selectedIds, filename) => {
    const toExport = library.filter(it => selectedIds.has(ppaItemId(it)));
    const updated  = ppaRecordExportInMemory(toExport, filename);
    const idMap = Object.fromEntries(updated.map(it => [it.id, it]));
    saveLibrary(library.map(it => idMap[it.id] ?? it));
    ppaAddKnownFile(SB_MODULE_ID, filename);
    ppaDownload(filename, sbBuildPayload(filename, toExport));
    setShowExportLib(false);
  };

  const handleSbImportFiles = (files) => {
    ppaHandleImport(
      SB_MODULE_ID, files, SB_MODULE_ID,
      (data, filename) => {
        const incoming = (data.items || []).map(it => ({ ...it, _sourceFile: filename }));
        const existingIds = new Set(library.map(it => it.id));
        const newItems = incoming.filter(it => !existingIds.has(it.id));
        saveLibrary([...library, ...newItems]);
        return { newItems, message: `${newItems.length} entries from ${filename}${PPA_EXT}` };
      },
      results => setImportToast({ text: results.map(r => r.message).join(", ") }),
      (fn, msg) => alert(`Import error (${fn}${PPA_EXT}): ${msg}`)
    );
  };

  const renderLibrarySection = () => {
    const filtered = libraryTab === "All" ? library : library.filter(s => s.type === libraryTab.toLowerCase());
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Export/import dialogs */}
        {showExportLib && (
          <PpaExportDialog moduleId={SB_MODULE_ID} items={library} getLabel={sbGetLabel}
            onExport={handleSbExport} onClose={() => setShowExportLib(false)} />
        )}
        {showReexportLib && (
          <PpaReexportDialog moduleId={SB_MODULE_ID}
            dirtyItems={library.filter(it => ppaIsItemDirty(it, ppaGetSnapshots()))}
            getLabel={sbGetLabel} knownFiles={ppaFilesForModule(SB_MODULE_ID)}
            onReexport={(s, gef) => { ppaHandleReexport(SB_MODULE_ID, [], library, s, gef, sbBuildPayload, updated => saveLibrary(updated)); setShowReexportLib(false); }}
            onSkip={() => setShowReexportLib(false)} />
        )}
        {importToast && (
          <div style={{ background: "#2D3B36", color: "#E8F4F2", borderRadius: 10, padding: "10px 16px",
            fontSize: 13, fontWeight: 600, display: "flex", gap: 10, alignItems: "center" }}>
            ✅ Imported: {importToast.text}
            <button onClick={() => setImportToast(null)} style={{ background: "none", border: "none",
              color: "#7BAE9F", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            {["All", "Sentences", "Templates"].map(t => (
              <button key={t} onClick={() => setLibraryTab(t)} style={{ padding: "7px 16px", borderRadius: 20, border: `2px solid ${libraryTab === t ? "#4E8B80" : "#3A5A50"}`, background: libraryTab === t ? "#4E8B80" : "transparent", color: libraryTab === t ? "#fff" : "#7BAE9F", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                {t}
              </button>
            ))}
          </div>
          <PpaAdminToolbar onExport={() => setShowExportLib(true)} onImport={handleSbImportFiles} />
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
              <button onClick={() => saveLibrary(library.filter(x => x.id !== s.id))}
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
      <div style={{ padding: "16px 20px 0 20px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
          {/* Word chips + inline type input */}
          <div style={{ flex: 1, background: "#FFFDF9", borderRadius: 16, border: "2px solid #E8E0D0", minHeight: 80, padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", cursor: "text" }}
            onClick={() => inputRef.current?.focus()}>
            {words.map(w => (
              <button key={w.id} onClick={e => { e.stopPropagation(); removeWord(w.id); }}
                style={{ padding: "8px 14px", borderRadius: 12, border: "2px solid #D5CFC4", background: "#F5F0E8", color: "#2D3B36", fontWeight: 600, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}
                onMouseOver={e => { e.currentTarget.style.background = "#FFE8E8"; e.currentTarget.style.borderColor = "#C07070"; }}
                onMouseOut={e => { e.currentTarget.style.background = "#F5F0E8"; e.currentTarget.style.borderColor = "#D5CFC4"; }}
                title="Click to remove">
                {w.emoji && (
                  isImageGraphic(w.emoji)
                    ? <img src={w.emoji} alt="" style={{ width: 18, height: 18, objectFit: "contain", borderRadius: 3 }} />
                    : <span style={{ fontSize: 16 }}>{w.emoji}</span>
                )}
                {w.text}
              </button>
            ))}
            <input
              ref={inputRef}
              value={typedText}
              onChange={e => handleTypeChange(e.target.value)}
              onKeyDown={e => {
                // Backspace on empty input removes the last chip
                if (e.key === "Backspace" && !typedText && words.length > 0) {
                  removeWord(words[words.length - 1].id);
                }
                // Enter confirms the current word without needing a trailing space
                if (e.key === "Enter" && typedText.trim()) {
                  if (typeTimerRef.current) { clearTimeout(typeTimerRef.current); typeTimerRef.current = null; }
                  resolveTypedWords(typedText);
                }
              }}
              placeholder={words.length === 0 ? "Tap words below, or type here…" : "type…"}
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 15,
                fontFamily: "inherit", minWidth: 80, flex: "1 1 80px", color: "#2D3B36", padding: "6px 0",
                alignSelf: "center" }}
            />
          </div>
          {/* Action buttons — vertical column, always visible beside the sentence field */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
            <button onClick={speak} disabled={!sentenceText}
              style={{ padding: "8px 14px", borderRadius: 10, border: `2px solid ${speaking ? "#C07070" : "#4E8B80"}`, background: speaking ? "#C0707020" : "#4E8B8020", color: speaking ? "#C07070" : "#4E8B80", fontWeight: 700, cursor: "pointer", fontSize: 12, animation: speaking ? "sbPulse 1s ease-in-out infinite" : "none", whiteSpace: "nowrap" }}>
              🔊 Speak
            </button>
            <button onClick={() => setWords([])}
              style={{ padding: "8px 14px", borderRadius: 10, border: "2px solid #D5CFC4", background: "#F5F0E8", color: "#666", fontWeight: 700, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
              🗑 Clear
            </button>
            <button onClick={saveSentence} disabled={!sentenceText}
              style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: sentenceText ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#C5BEB4", color: "#fff", fontWeight: 700, cursor: sentenceText ? "pointer" : "default", fontSize: 12, whiteSpace: "nowrap" }}>
              💾 Save
            </button>
          </div>
        </div>

        {/* Sentence text preview */}
        <div style={{ marginTop: 6, paddingLeft: 4 }}>
          <span style={{ fontSize: 13, color: "#888", fontStyle: "italic" }}>
            {sentenceText || "…"}
          </span>
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

export default SentenceBuilderModule;
