import { useState, useEffect, useRef } from "react";
import { NAMING_ITEMS } from "./data/namingItems.js";
import { CLAUDE_MODEL, SYSTEM_PROMPT } from "./data/config.js";
import { CallAPI, ThinkingDots } from "./shared.jsx";
import {
  PPA_EXT,
  ppaGetSnapshots, ppaFilesForModule, ppaAddKnownFile,
  ppaItemId, ppaIsItemDirty, ppaRecordExportInMemory,
  ppaDownload, ppaHandleReexport,
  PpaAdminToolbar, PpaExportDialog, PpaReexportDialog,
} from "./ExportImportSystem.jsx";
import { dictLoadNamingItems, dictSaveNamingItems, dictBuildSeed, isImageGraphic } from "./data/dictionary.js";
import meSpeak from "mespeak";
import meSpeakConfig from "mespeak/src/mespeak_config.json";
import enVoice from "mespeak/voices/en/en-us.json";

if (!meSpeak.isConfigLoaded()) meSpeak.loadConfig(meSpeakConfig);
if (!meSpeak.isVoiceLoaded())  meSpeak.loadVoice(enVoice);

const ADMIN_PIN   = "1234"; // change this to set a different PIN

// Load / save delegate entirely to the Dictionary module.
// ppa_naming_items is still written by dictSaveNamingItems for SR engine compat.
function loadItems()      { return dictLoadNamingItems(); }
function saveItems(items) { dictSaveNamingItems(items); }

// ── PPA-Adapted Spaced Repetition ─────────────────────────────────────────────
//
// Standard SM-2 assumes the learner IMPROVES over time and uses intervals that
// grow to weeks or months.  PPA is a PROGRESSIVE neurological condition —
// word-finding can REGRESS even after successful sessions.  This engine uses
// a deliberately conservative model designed around three realities of PPA:
//
//  1. SHORT INTERVALS — nothing goes beyond 5 days; every word is reviewed
//     at least weekly regardless of how well it has been recalled.
//
//  2. ASYMMETRIC DECAY — correct answers only modestly extend the interval
//     (×1.2), cued answers shorten it, and a failed attempt resets to daily.
//     Semantic cueing shrinks the interval slightly (×0.8); phonemic cueing
//     halves it (×0.5) because needing sound-level support signals fragility.
//
//  3. PPA REGRESSION DECAY (applied on every load) — if an item has not been
//     practised for longer than its stored interval suggests it should have
//     been, the interval is reduced proportionally.  A word unseen for twice
//     its scheduled interval has its interval cut by 40 %; unseen for four
//     times the interval, cut by 60 %.  This ensures the schedule tightens
//     automatically as the disease progresses and sessions become less regular.
//
//  4. WITHIN-SESSION RE-QUEUING — words answered with phonemic cueing or a
//     full reveal are re-inserted into the current session queue 4 items
//     ahead so the patient practises the word again before the session ends.
//     This mirrors real clinical practice of same-session repetition.
//
// Queue priority order:
//   1. Overdue (dueDate ≤ today), most overdue first
//   2. New (never seen), original order
//   3. Not yet due, soonest first
//
// SR state — localStorage key "ppa_naming_sr":
//   { [word]: { interval, dueDate, streak, lastResult, lastSeen } }
//
// On first load the state is bootstrapped from all stored ppa_progress_* days
// so returning users receive a sensible schedule immediately.

const SR_KEY       = "ppa_naming_sr";
const MAX_INTERVAL = 5;   // days — hard cap for PPA
const TODAY        = () => new Date().toISOString().slice(0, 10);

// How many items ahead to re-insert a failed / heavily-cued item
const REQUEUE_GAP  = 4;

// Interval multipliers by result
const SR_FACTOR = {
  correct:       1.2,  // modest growth — PPA patients may not hold gains
  space_cued:    0.9,  // mild step back — needed phoneme-starter prompts
  semantic_cued: 0.8,  // slight step back — needed a concept cue
  phonemic_cued: 0.5,  // significant step back — needed a sound cue
  failed:        0,    // special-cased below: reset to 1 day
};

// Results that trigger within-session re-queuing
const REQUEUE_RESULTS = new Set(["phonemic_cued", "failed"]);

function srLoad() {
  try { return JSON.parse(localStorage.getItem(SR_KEY) || "{}"); } catch { return {}; }
}

function srSave(state) {
  try { localStorage.setItem(SR_KEY, JSON.stringify(state)); } catch (_) {}
}

// Apply PPA regression decay to a loaded SR state.
// For each item, compare days since last seen against the stored interval.
// The longer the gap relative to the interval, the more we reduce it.
function srApplyDecay(state) {
  const today = new Date(TODAY());
  const decayed = { ...state };
  for (const [word, entry] of Object.entries(decayed)) {
    if (!entry.lastSeen) continue;
    const daysSince = (today - new Date(entry.lastSeen)) / 86400000;
    const interval  = entry.interval || 1;
    if (daysSince <= interval) continue; // within expected window — no decay

    const ratio = daysSince / interval;
    let keepFraction;
    if      (ratio >= 4) keepFraction = 0.4;  // very overdue: cut 60 %
    else if (ratio >= 2) keepFraction = 0.6;  // moderately overdue: cut 40 %
    else                 keepFraction = 0.8;  // mildly overdue: cut 20 %

    const newInterval = Math.max(1, Math.round(interval * keepFraction * 10) / 10);
    // Push dueDate forward from today based on the shrunken interval
    const newDue = new Date(today);
    newDue.setDate(newDue.getDate() + Math.round(newInterval));
    decayed[word] = {
      ...entry,
      interval: newInterval,
      dueDate:  newDue.toISOString().slice(0, 10),
    };
  }
  return decayed;
}

// Update SR state for one word after a response.
function srRecord(state, word, result) {
  const today = TODAY();
  const entry = state[word] ?? { interval: 0, dueDate: today, streak: 0, lastResult: null };
  const prev  = entry.interval || 1;

  let nextInterval;
  if (result === "failed") {
    nextInterval = 1;
  } else {
    nextInterval = Math.min(MAX_INTERVAL, Math.max(1, prev * SR_FACTOR[result]));
  }
  nextInterval = Math.round(nextInterval * 10) / 10;

  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + Math.round(nextInterval));

  return {
    ...state,
    [word]: {
      interval:   nextInterval,
      dueDate:    dueDate.toISOString().slice(0, 10),
      streak:     result === "failed" ? 0 : (entry.streak || 0) + 1,
      lastResult: result,
      lastSeen:   today,
    },
  };
}

// Rebuild SR state from stored progress history (used on first launch).
function srRebuildFromHistory() {
  const state = {};
  const dateKeys = Object.keys(localStorage)
    .filter(k => /^ppa_progress_\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();
  for (const key of dateKeys) {
    try {
      const entries = JSON.parse(localStorage.getItem(key) || "[]");
      for (const e of entries) {
        if (e.type === "naming" && e.word && e.result) {
          const entryDate = key.replace("ppa_progress_", "");
          const prev = state[e.word] ?? { interval: 0, dueDate: entryDate, streak: 0, lastResult: null };
          let nextInterval = e.result === "failed"
            ? 1
            : Math.min(MAX_INTERVAL, Math.max(1, (prev.interval || 1) * (SR_FACTOR[e.result] ?? 0)));
          nextInterval = Math.round(nextInterval * 10) / 10;
          const dd = new Date(entryDate);
          dd.setDate(dd.getDate() + Math.round(nextInterval));
          state[e.word] = {
            interval:   nextInterval,
            dueDate:    dd.toISOString().slice(0, 10),
            streak:     e.result === "failed" ? 0 : (prev.streak || 0) + 1,
            lastResult: e.result,
            lastSeen:   entryDate,
          };
        }
      }
    } catch (_) {}
  }
  return state;
}

// Load SR state, apply PPA decay, and bootstrap from history if absent.
function srLoadOrBootstrap() {
  const raw = localStorage.getItem(SR_KEY);
  let state;
  if (raw) {
    try { state = JSON.parse(raw); } catch { state = {}; }
  } else {
    state = srRebuildFromHistory();
  }
  const decayed = srApplyDecay(state);
  // Persist the decayed version so future loads don't re-apply
  srSave(decayed);
  return decayed;
}

// Build the ordered session queue from current SR state.
// Priority: 1) overdue (most overdue first)  2) new  3) upcoming (soonest first)
function srQueue(items, srState) {
  const today = TODAY();
  const overdue = [], newItems = [], upcoming = [];

  items.forEach((item, idx) => {
    const entry = srState[item.word];
    if (!entry) {
      newItems.push({ idx });
    } else {
      const diff = (new Date(today) - new Date(entry.dueDate)) / 86400000;
      if (diff >= 0) overdue.push({ idx, daysOverdue: diff });
      else           upcoming.push({ idx, daysUntilDue: -diff });
    }
  });

  overdue.sort((a, b)  => b.daysOverdue - a.daysOverdue);
  upcoming.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return [
    ...overdue.map(x => x.idx),
    ...newItems.map(x => x.idx),
    ...upcoming.map(x => x.idx),
  ];
}

// ── Emoji picker categories ────────────────────────────────────────────────────
const EMOJI_SETS = {
  "🍎 Food":     ["🍎","🍞","🥛","🍲","☕","🍌","🧀","🥚","🍕","🥗","🍰","🍇","🍊","🥕","🥦"],
  "🐕 Animals":  ["🐕","🐱","🐦","🐟","🐴","🐄","🐘","🐸","🐢","🦁","🐻","🐼","🐔","🦊","🐺"],
  "🪑 Objects":  ["🪑","📞","👓","🕐","☕","📚","📱","🚗","💊","🔑","✂️","🖊️","📷","🎸","🪞"],
  "🌳 Nature":   ["🌳","🌸","☀️","🌧️","🌤️","🌿","🍂","🌊","⛰️","🌻","🍄","🌵","❄️","🌈","🌙"],
  "🏠 Places":   ["🏠","🏥","🏫","🏪","🌉","🏖️","⛪","🏛️","🏕️","🛒","🏋️","🚉","✈️","🚢","🎪"],
  "👤 People":   ["👨","👩","👦","👧","👶","🧓","👩‍⚕️","👨‍🍳","👩‍🏫","👮","🧑‍🎨","👩‍💼","🧑‍🔧","👷","🧑‍🌾"],
  "🎨 Misc":     ["❤️","⭐","🎵","🎈","🎁","🏆","🔔","💡","🔥","💧","🌀","⚡","🎯","🧩","🎲"],
};

// ── Phoneme hint utilities ─────────────────────────────────────────────────────
// Digraphs and trigraphs that form a single grapheme group; checked longest-first.
// Used for the letter-reveal display (audio off: one group per Space press).
const TRIGRAPHS = ["thr", "shr", "spl", "spr", "str", "scr", "sch", "chr", "phr"];
const DIGRAPHS  = ["sh", "ch", "th", "ph", "wh", "ng", "qu", "gh", "kn", "wr", "gn", "ck", "mb", "dg"];

// Returns the letters (1–3) that make up the next grapheme group at position `pos`.
function getNextPhoneme(word, pos) {
  const slice = word.toLowerCase().slice(pos);
  for (const tri of TRIGRAPHS) { if (slice.startsWith(tri)) return tri; }
  for (const di  of DIGRAPHS)  { if (slice.startsWith(di))  return di;  }
  return slice[0] || "";
}

// Vowel digraphs and trigraphs checked longest-first for audio-on advancement.
const VOWEL_GROUPS = ['igh', 'ough', 'augh', 'ai', 'ay', 'ea', 'ee', 'ei', 'ey',
  'ie', 'oa', 'oe', 'oi', 'oo', 'ou', 'ow', 'ue', 'ui', 'au', 'aw', 'ew'];
const LETTER_VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

// Returns the character position after the next vowel (group) starting from startPos.
// Used in audio-on mode to determine how far to advance and what text to speak.
function findNextVowelEnd(word, startPos) {
  const lower = word.toLowerCase();
  for (let i = startPos; i < lower.length; i++) {
    if (LETTER_VOWELS.has(lower[i])) {
      for (const vg of VOWEL_GROUPS) {
        if (lower.startsWith(vg, i)) return i + vg.length;
      }
      return i + 1;
    }
  }
  return word.length;  // no more vowels — reveal the rest
}


// ── Helpers ────────────────────────────────────────────────────────────────────
// Resize + compress a File/Blob to a base64 JPEG data-URL via an offscreen canvas.
// maxSide caps the longer dimension; quality is JPEG quality (0–1).
function compressImageFile(file, maxSide = 240, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width  * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Emoji / image picker ───────────────────────────────────────────────────────
function GraphicPicker({ current, onChange }) {
  const [tab, setTab] = useState("emoji");
  const [emojiSet, setEmojiSet] = useState("🍎 Food");
  const [customEmoji, setCustomEmoji] = useState("");
  const [imgUrl, setImgUrl] = useState("");
  const [imgError, setImgError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const isImg = isImageGraphic(current);

  const processImageFile = async (file) => {
    if (!file) return;
    // HEIC files from Photos may arrive with type "" or "image/heic" — try anyway
    if (file.type && !file.type.startsWith("image/")) {
      setUploadError("Please select an image file (JPEG, PNG, WebP, HEIC, etc.).");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const dataUrl = await compressImageFile(file, 240, 0.75);
      onChange(dataUrl);
    } catch (_) {
      setUploadError("Could not read this image — the browser may not support this format. Try exporting as JPEG from Photos first.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e) => processImageFile(e.target.files?.[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? e.dataTransfer.items?.[0]?.getAsFile();
    processImageFile(file);
  };

  const TABS = [
    { id: "emoji",  label: "🎨 Pick emoji" },
    { id: "custom", label: "⌨️ Type emoji" },
    { id: "upload", label: "📁 Upload photo" },
    { id: "url",    label: "🔗 Image URL" },
  ];

  return (
    <div style={{ background: "#F8F5FF", borderRadius: 14, border: "2px solid #D0C0E8", padding: 16 }}>
      {/* Preview */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 14, color: "#7A5AB8", fontWeight: 700, marginBottom: 8 }}>Current graphic</div>
        {isImg ? (
          <img src={current} alt="item" style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 12, border: "2px solid #D0C0E8" }} />
        ) : (
          <div style={{ fontSize: 72, lineHeight: 1 }}>{current}</div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: "1 1 auto", padding: "7px 6px", borderRadius: 10,
              border: `2px solid ${tab === t.id ? "#9B7FB8" : "#D0C0E8"}`,
              background: tab === t.id ? "#9B7FB820" : "#fff",
              color: tab === t.id ? "#5A2A80" : "#666",
              fontWeight: tab === t.id ? 700 : 500, cursor: "pointer", fontSize: 12 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Emoji picker */}
      {tab === "emoji" && (
        <>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
            {Object.keys(EMOJI_SETS).map(k => (
              <button key={k} onClick={() => setEmojiSet(k)}
                style={{ padding: "5px 10px", borderRadius: 20, border: `2px solid ${emojiSet === k ? "#9B7FB8" : "#D5CFC4"}`,
                  background: emojiSet === k ? "#9B7FB820" : "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {k}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
            {EMOJI_SETS[emojiSet].map(e => (
              <button key={e} onClick={() => onChange(e)}
                style={{ padding: 6, borderRadius: 8, border: current === e ? "3px solid #9B7FB8" : "2px solid transparent",
                  background: current === e ? "#9B7FB820" : "transparent", cursor: "pointer", fontSize: 22 }}>
                {e}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Type an emoji */}
      {tab === "custom" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={customEmoji} onChange={e => setCustomEmoji(e.target.value)}
            placeholder="Paste or type an emoji…"
            style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "2px solid #D0C0E8", fontSize: 22, outline: "none" }}
          />
          <button onClick={() => { if (customEmoji.trim()) { onChange(customEmoji.trim()); setCustomEmoji(""); } }}
            disabled={!customEmoji.trim()}
            style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#9B7FB8", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            Use
          </button>
        </div>
      )}

      {/* Upload local photo */}
      {tab === "upload" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {/* Drop zone — drag a photo here from Photos app, Finder, Desktop, etc. */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              padding: "22px 16px", borderRadius: 14, cursor: uploading ? "default" : "pointer",
              border: `2px dashed ${dragOver ? "#5A2A80" : "#9B7FB8"}`,
              background: dragOver ? "#EEE8FF" : "#F8F5FF",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              transition: "all 0.15s",
            }}>
            <div style={{ fontSize: 32 }}>{uploading ? "⏳" : "📁"}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#5A2A80" }}>
              {uploading ? "Processing…" : "Drop photo here, or click to browse"}
            </div>
            <div style={{ fontSize: 12, color: "#888" }}>JPEG · PNG · WebP · HEIC · GIF and more</div>
          </div>

          {uploadError && <div style={{ fontSize: 13, color: "#C07070", fontWeight: 600 }}>⚠ {uploadError}</div>}

          {/* Mac Photos guidance */}
          <div style={{ background: "#FFFBF0", border: "1px solid #F0DFA0", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#6A5010", lineHeight: 1.6 }}>
            <strong>📚 Using Mac Photos Library?</strong><br />
            The file picker sidebar shows "No Library Found" if your browser hasn't been granted Photos access yet.
            Two easy workarounds:<br />
            <strong>① Drag &amp; drop</strong> — open Photos app, select a photo, drag it directly onto the drop zone above.<br />
            <strong>② Export first</strong> — in Photos, select a photo → <em>File → Export → Export Photo</em>, save to Desktop, then click the drop zone and pick it.
            <br /><br />
            To fix the sidebar permanently: <em>System Settings → Privacy &amp; Security → Photos</em> → enable your browser.
          </div>
        </div>
      )}

      {/* Image URL */}
      {tab === "url" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={imgUrl} onChange={e => { setImgUrl(e.target.value); setImgError(""); }}
            placeholder="https://example.com/image.png"
            style={{ padding: "10px 14px", borderRadius: 10, border: `2px solid ${imgError ? "#C07070" : "#D0C0E8"}`, fontSize: 14, outline: "none" }}
          />
          {imgError && <div style={{ fontSize: 12, color: "#C07070" }}>{imgError}</div>}
          <button onClick={() => {
            if (!imgUrl.trim().startsWith("http")) { setImgError("Must be a full URL starting with http"); return; }
            onChange(imgUrl.trim());
            setImgUrl("");
          }}
            style={{ padding: "10px 0", borderRadius: 10, border: "none", background: "#9B7FB8", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            Use this image
          </button>
          <div style={{ fontSize: 12, color: "#888" }}>Tip: right-click any image online → "Copy image address"</div>
        </div>
      )}
    </div>
  );
}

// ── Item form (used for both Add and Edit) ─────────────────────────────────────
function ItemForm({ initial, onSave, onCancel }) {
  const blank = { word: "", category: "", graphic: "🖼️", clue_semantic: "", clue_phonemic: "" };
  const [form, setForm] = useState(initial ?? blank);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError]   = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.word.trim())         { setError("Word is required"); return; }
    if (!form.category.trim())     { setError("Category is required"); return; }
    if (!form.clue_semantic.trim()){ setError("Semantic cue is required"); return; }
    if (!form.clue_phonemic.trim()){ setError("Phonemic cue is required"); return; }
    onSave({ ...form, word: form.word.trim(), category: form.category.trim().toLowerCase() });
  };

  const isImg = isImageGraphic(form.graphic);
  const fieldStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "2px solid #D5CFC4", fontSize: 15, outline: "none",
    background: "#FFFDF9", color: "#2D3B36", boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 4, display: "block" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Graphic preview + edit toggle */}
      <div>
        <span style={labelStyle}>Graphic</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: showPicker ? 10 : 0 }}>
          {isImg
            ? <img src={form.graphic} alt="" style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 10, border: "2px solid #D5CFC4" }} />
            : <span style={{ fontSize: 52 }}>{form.graphic}</span>
          }
          <button onClick={() => setShowPicker(p => !p)}
            style={{ padding: "8px 14px", borderRadius: 10, border: "2px solid #9B7FB8", background: showPicker ? "#9B7FB8" : "#fff",
              color: showPicker ? "#fff" : "#9B7FB8", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            {showPicker ? "✕ Close picker" : "✏️ Change graphic"}
          </button>
        </div>
        {showPicker && (
          <GraphicPicker current={form.graphic} onChange={g => { set("graphic", g); setShowPicker(false); }} />
        )}
      </div>

      {/* Word */}
      <div>
        <label style={labelStyle}>Word *</label>
        <input value={form.word} onChange={e => set("word", e.target.value)} placeholder="e.g. apple" style={fieldStyle} />
      </div>

      {/* Category */}
      <div>
        <label style={labelStyle}>Category *</label>
        <input value={form.category} onChange={e => set("category", e.target.value)} placeholder="e.g. food, animal, object" style={fieldStyle} />
      </div>

      {/* Semantic cue */}
      <div>
        <label style={labelStyle}>💡 Semantic cue *</label>
        <input value={form.clue_semantic} onChange={e => set("clue_semantic", e.target.value)}
          placeholder="e.g. It's a fruit you eat" style={fieldStyle} />
      </div>

      {/* Phonemic cue */}
      <div>
        <label style={labelStyle}>🔤 Phonemic cue *</label>
        <input value={form.clue_phonemic} onChange={e => set("clue_phonemic", e.target.value)}
          placeholder="e.g. Starts with 'A'..." style={fieldStyle} />
      </div>

      {error && <div style={{ color: "#C07070", fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={submit}
          style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)",
            color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
          {initial ? "Save changes" : "Add item"}
        </button>
        <button onClick={onCancel}
          style={{ padding: "12px 18px", borderRadius: 12, border: "2px solid #D5CFC4", background: "#FFFDF9",
            color: "#666", fontWeight: 600, cursor: "pointer", fontSize: 15 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Admin panel ────────────────────────────────────────────────────────────────
function AdminPanel({ items, onUpdate, onClose }) {
  const [mode, setMode]         = useState("list");   // list | add | edit
  const [editTarget, setEditTarget] = useState(null); // item being edited
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [inlineCatEdit, setInlineCatEdit] = useState(null); // { id, value }
  const [showExport,   setShowExport]   = useState(false);
  const [showReexport, setShowReexport] = useState(false);
  const [importToast,  setImportToast]  = useState(null); // {count, filename}

  const MODULE_ID    = "naming";
  const isBuiltin    = item => item.id?.startsWith("seed-");
  const customItems  = items.filter(it => !isBuiltin(it));
  const getLabel     = it => { const g = it.graphic ?? it.emoji ?? ""; const prefix = isImageGraphic(g) ? "🖼️" : g; return `${prefix} ${it.word}`.trim(); };

  const handleAdd = (newItem) => {
    const updated = [...items, { ...newItem, id: `custom-${Date.now()}` }];
    onUpdate(updated);
    setMode("list");
  };

  const handleEdit = (updated) => {
    onUpdate(items.map(it => it.id === editTarget.id ? { ...updated, id: editTarget.id } : it));
    setMode("list");
    setEditTarget(null);
  };

  const handleDelete = (id) => {
    onUpdate(items.filter(it => it.id !== id));
    setConfirmDelete(null);
  };

  const handleReset = () => {
    if (window.confirm("Reset to original items? All custom items and edits will be lost.")) {
      const seed = dictBuildSeed();
      onUpdate(NAMING_ITEMS.map((item, i) => ({
        ...item,
        graphic: seed[item.word?.toLowerCase()]?.graphic ?? item.graphic ?? item.emoji,
        id: `seed-${i}`,
      })));
    }
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = (selectedIds, filename) => {
    const toExport = customItems.filter(it => selectedIds.has(ppaItemId(it)));
    const updated  = ppaRecordExportInMemory(toExport, filename);
    // Merge updated _sourceFile back into the full items array
    const idMap = Object.fromEntries(updated.map(it => [it.id, it]));
    onUpdate(items.map(it => idMap[it.id] ?? it));
    ppaAddKnownFile(MODULE_ID, filename);
    ppaDownload(filename, { ppaExport: true, version: 1, moduleId: MODULE_ID, filename,
      exportedAt: new Date().toISOString(), items: toExport });
    setShowExport(false);
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImportFiles = (files) => {
    ppaHandleImport(
      MODULE_ID, files, MODULE_ID,
      (data, filename) => {
        const incoming = (data.items || []).map(it => ({ ...it, _sourceFile: filename }));
        const existingIds = new Set(items.map(it => it.id));
        const newItems = incoming.filter(it => !existingIds.has(it.id));
        // Replace items with same id (re-import = update)
        const replaced = items.map(it => {
          const match = incoming.find(inc => inc.id === it.id);
          return match ? match : it;
        });
        onUpdate([...replaced, ...newItems]);
        return { newItems: incoming, message: `${incoming.length} items from ${filename}${PPA_EXT}` };
      },
      results => setImportToast({ count: results.reduce((n, r) => n + parseInt(r.message), 0) || results.length, filename: results.map(r => r.filename).join(", ") }),
      (fn, msg) => alert(`Import error (${fn}): ${msg}`)
    );
  };

  // ── Dirty check on close ──────────────────────────────────────────────────
  const handleClose = () => {
    const snaps = ppaGetSnapshots();
    const dirty = customItems.filter(it => ppaIsItemDirty(it, snaps));
    if (dirty.length > 0) { setShowReexport(true); return; }
    onClose();
  };

  const handleReexport = (selections, getEffective) => {
    ppaHandleReexport(
      MODULE_ID, [], customItems, selections, getEffective,
      (filename, fileItems) => ({ ppaExport: true, version: 1, moduleId: MODULE_ID, filename,
        exportedAt: new Date().toISOString(), items: fileItems }),
      updated => onUpdate([...items.filter(isBuiltin), ...updated])
    );
    onClose();
  };

  const handleInlineCatSave = () => {
    if (!inlineCatEdit) return;
    const { id, value } = inlineCatEdit;
    onUpdate(items.map(it => it.id !== id ? it : { ...it, category: value.trim().toLowerCase() }));
    setInlineCatEdit(null);
  };

  const isImg = (g) => isImageGraphic(g);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Dialogs */}
      {showExport && (
        <PpaExportDialog moduleId={MODULE_ID} items={customItems} getLabel={getLabel}
          onExport={handleExport} onClose={() => setShowExport(false)} />
      )}
      {showReexport && (
        <PpaReexportDialog moduleId={MODULE_ID}
          dirtyItems={customItems.filter(it => ppaIsItemDirty(it, ppaGetSnapshots()))}
          getLabel={getLabel} knownFiles={ppaFilesForModule(MODULE_ID)}
          onReexport={handleReexport} onSkip={onClose} />
      )}
      {importToast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 4000, background: "#2D3B36",
          color: "#E8F4F2", borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)", display: "flex", gap: 12, alignItems: "center" }}>
          ✅ Imported: {importToast.filename}
          <button onClick={() => setImportToast(null)} style={{ background: "none", border: "none",
            color: "#7BAE9F", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "2px solid #E8E0D0", background: "#2D3B36",
        display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 20 }}>{"⚙️"}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#E8F4F2", flex: 1 }}>Naming Items Admin</span>
        <PpaAdminToolbar onExport={() => setShowExport(true)} onImport={handleImportFiles} />
        <span style={{ fontSize: 13, color: "#7BAE9F" }}>{items.length} items</span>
        <button onClick={handleClose}
          style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid #4E8B80", background: "transparent",
            color: "#7BAE9F", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          ✕ Close
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {/* List view */}
        {mode === "list" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <button onClick={() => setMode("add")}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                + Add new item
              </button>
              <button onClick={handleReset}
                style={{ padding: "11px 16px", borderRadius: 12, border: "2px solid #C07070",
                  background: "#fff", color: "#C07070", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                ↺ Reset to defaults
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map((item, idx) => (
                <div key={item.id} style={{ background: "#FFFDF9", borderRadius: 14, border: "1px solid #E8E0D0",
                  padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>

                  {/* Graphic */}
                  <div style={{ width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "#F5F0E8", borderRadius: 12, flexShrink: 0, overflow: "hidden" }}>
                    {isImg(item.graphic)
                      ? <img src={item.graphic} alt={item.word} style={{ width: 44, height: 44, objectFit: "contain" }} />
                      : <span style={{ fontSize: 36 }}>{item.graphic ?? item.emoji}</span>
                    }
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "#2D3B36" }}>{item.word}</div>
                    <div style={{ fontSize: 13, color: "#888", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {inlineCatEdit !== null && inlineCatEdit.id === item.id ? (
                        <input
                          autoFocus
                          value={inlineCatEdit.value}
                          onChange={e => setInlineCatEdit(ic => ({ ...ic, value: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") handleInlineCatSave(); if (e.key === "Escape") setInlineCatEdit(null); }}
                          onBlur={handleInlineCatSave}
                          style={{ padding: "2px 8px", borderRadius: 6, border: "2px solid #4E8B80", fontSize: 13, outline: "none", width: 120 }}
                        />
                      ) : (
                        <span
                          onClick={() => setInlineCatEdit({ id: item.id, value: item.category ?? "" })}
                          title="Click to edit category"
                          style={{ cursor: "pointer", borderBottom: "1px dotted #aaa", color: item.category ? "#555" : "#bbb" }}>
                          {item.category || "no category"}
                        </span>
                      )}
                      <span>· #{idx + 1}</span>
                      {item.id?.startsWith("custom") && <span style={{ color: "#9B7FB8", fontWeight: 700 }}>• custom</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#999", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      💡 {item.clue_semantic}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => { setEditTarget(item); setMode("edit"); }}
                      style={{ padding: "7px 12px", borderRadius: 10, border: "2px solid #D5CFC4",
                        background: "#FFFDF9", color: "#555", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                      ✏️ Edit
                    </button>
                    {confirmDelete === item.id ? (
                      <>
                        <button onClick={() => handleDelete(item.id)}
                          style={{ padding: "7px 12px", borderRadius: 10, border: "none",
                            background: "#C07070", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                          Delete
                        </button>
                        <button onClick={() => setConfirmDelete(null)}
                          style={{ padding: "7px 10px", borderRadius: 10, border: "2px solid #D5CFC4",
                            background: "#FFFDF9", color: "#666", cursor: "pointer", fontSize: 13 }}>
                          ✕
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDelete(item.id)}
                        style={{ padding: "7px 10px", borderRadius: 10, border: "2px solid #F0C0C0",
                          background: "#FFF5F5", color: "#C07070", cursor: "pointer", fontSize: 13 }}>
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Add view */}
        {mode === "add" && (
          <>
            <h3 style={{ margin: "0 0 16px", color: "#2D3B36" }}>Add new item</h3>
            <ItemForm onSave={handleAdd} onCancel={() => setMode("list")} />
          </>
        )}

        {/* Edit view */}
        {mode === "edit" && editTarget && (
          <>
            <h3 style={{ margin: "0 0 16px", color: "#2D3B36" }}>
              Edit: <em>{editTarget.word}</em>
            </h3>
            <ItemForm
              initial={{ ...editTarget, graphic: editTarget.graphic ?? editTarget.emoji }}
              onSave={handleEdit}
              onCancel={() => { setMode("list"); setEditTarget(null); }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── PIN gate ───────────────────────────────────────────────────────────────────
function PinGate({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    if (pin === ADMIN_PIN) { onUnlock(); }
    else { setError(true); setPin(""); setTimeout(() => setError(false), 1200); }
  };

  return (
    <div style={{ padding: 32, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36" }}>Admin PIN required</div>
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        maxLength={8}
        value={pin}
        onChange={e => setPin(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="Enter PIN"
        style={{ padding: "12px 20px", borderRadius: 12, border: `2px solid ${error ? "#C07070" : "#D5CFC4"}`,
          fontSize: 20, textAlign: "center", width: 160, outline: "none",
          animation: error ? "pinShake 0.3s ease" : "none",
          background: error ? "#FFF5F5" : "#FFFDF9" }}
      />
      {error && <div style={{ color: "#C07070", fontSize: 14, fontWeight: 600 }}>Incorrect PIN</div>}
      <button onClick={submit}
        style={{ padding: "11px 28px", borderRadius: 12, border: "none",
          background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff",
          fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
        Unlock
      </button>
      <style>{`@keyframes pinShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
    </div>
  );
}

// ── Practice view ─────────────────────────────────────────────────────────────
function Practice({ items, addToLog }) {
  // ── SR state ────────────────────────────────────────────────────────────────
  const [srState,  setSrState]  = useState(() => srLoadOrBootstrap());
  // queue: mutable array of item indices for this session.
  // We do NOT rebuild on every advance — that would erase within-session
  // re-inserts.  We rebuild only when items change (admin edit) or on wrap.
  const [queue,    setQueue]    = useState(() => srQueue(items, srLoadOrBootstrap()));
  const [queuePos, setQueuePos] = useState(0);

  // Rebuild queue whenever the items list changes (admin edits)
  useEffect(() => {
    const fresh = srLoadOrBootstrap();
    setSrState(fresh);
    setQueue(srQueue(items, fresh));
    setQueuePos(0);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const [phase,     setPhase]     = useState("show");
  const [response,  setResponse]  = useState("");
  const [score,     setScore]     = useState({ correct: 0, space_cued: 0, semantic_cued: 0, phonemic_cued: 0, failed: 0 });
  const [phonemesRevealed, setPhonemesRevealed] = useState(0);
  const [audioHintsOn, setAudioHintsOn] = useState(
    () => localStorage.getItem('ppa_naming_audio_hints') !== 'false'
  );
  const [aiComment, setAiComment] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [pendingAI, setPendingAI] = useState(null);
  // requeuedThisSession: words inserted back this session (prevents infinite loops)
  const [requeuedWords, setRequeuedWords] = useState(new Set());

  // Effective position wraps; if we exhaust the queue rebuild from fresh SR state
  const effectivePos = queuePos % Math.max(queue.length, 1);
  const itemIdx = queue.length > 0 ? queue[effectivePos] : 0;
  const item    = items[itemIdx] ?? items[0];
  const graphic = item.graphic ?? item.emoji;
  const isImg   = isImageGraphic(graphic);


  const getAIFeedback = (attempt, cueing, word) => {
    setLoadingAI(true);
    const msg = `Patient attempted to name "${word}". Their attempt was: "${attempt}". Cueing level used: ${cueing}. Give brief, warm, encouraging feedback (2 sentences max). Note the error type if relevant.`;
    setPendingAI([{ role: "user", content: msg }]);
  };

  const recordResponse = (type) => {
    const newScore = { ...score, [type]: score[type] + 1 };
    setScore(newScore);
    addToLog({ type: "naming", word: item.word, result: type, response, time: new Date().toLocaleTimeString() });

    // Update SR state
    const newSR = srRecord(srState, item.word, type);
    setSrState(newSR);
    srSave(newSR);

    // Within-session re-queue: if the result signals fragility and we haven't
    // already re-queued this word this session, insert it REQUEUE_GAP ahead.
    if (REQUEUE_RESULTS.has(type) && !requeuedWords.has(item.word)) {
      setRequeuedWords(prev => new Set([...prev, item.word]));
      setQueue(q => {
        const insertAt = effectivePos + REQUEUE_GAP + 1;
        const extended = [...q];
        // Pad with cycling indices if needed so the insert position exists
        while (extended.length <= insertAt) {
          extended.push(extended[extended.length % items.length] ?? 0);
        }
        extended.splice(insertAt, 0, itemIdx);
        return extended;
      });
    }

    getAIFeedback(
      response || "(no response)",
      type === "correct"       ? "none"            :
      type === "space_cued"    ? "phoneme starter" :
      type === "semantic_cued" ? "semantic"         :
      type === "phonemic_cued" ? "phonemic"         : "full reveal",
      item.word,
    );
  };

  const next = () => {
    const nextPos = queuePos + 1;
    // When we've exhausted the queue, rebuild so newly-due items are picked up
    if (nextPos >= queue.length) {
      const updated = srLoad();
      setSrState(updated);
      setQueue(srQueue(items, updated));
      setRequeuedWords(new Set()); // reset requeue guard for the next round
    }
    setQueuePos(nextPos);
    setPhase("show"); setResponse(""); setAiComment(""); setPendingAI(null); setPhonemesRevealed(0);
  };
  const total = score.correct + score.space_cued + score.semantic_cued + score.phonemic_cued + score.failed;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, maxWidth: 600, margin: "0 auto" }}>
      {pendingAI && (
        <CallAPI messages={pendingAI}
          onResult={t => { setAiComment(t); setLoadingAI(false); setPendingAI(null); }}
          onError={() => { setLoadingAI(false); setPendingAI(null); next(); }}
        />
      )}

      {/* Scoreboard */}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        {[["Correct", "#4E8B80", score.correct], ["Cued", "#D4A843", score.space_cued + score.semantic_cued + score.phonemic_cued], ["Needed help", "#C07070", score.failed]].map(([l, c, v]) => (
          <div key={l} style={{ textAlign: "center", padding: "10px 18px", background: c + "18", borderRadius: 12, border: `2px solid ${c}40` }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{v}</div>
            <div style={{ fontSize: 13, color: "#666" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* SR queue status */}
      {(() => {
        const today = TODAY();
        const overdueCount = items.filter(it => {
          const e = srState[it.word];
          return e && new Date(e.dueDate) <= new Date(today);
        }).length;
        const newCount = items.filter(it => !srState[it.word]).length;
        const dueNow = overdueCount + newCount;

        const srEntry  = srState[item.word];
        const lastResult = srEntry?.lastResult;
        const streak   = srEntry?.streak ?? 0;
        const isRequeued = requeuedWords.has(item.word);

        // Label for this specific card
        const cardLabel = isRequeued
          ? { text: "🔁 Practising again this session", bg: "#FFF0E0", border: "#F0C070", color: "#8A5010" }
          : !srEntry
          ? { text: "🆕 First time seeing this word", bg: "#F0F8FF", border: "#A0C8F0", color: "#1A3A5A" }
          : (() => {
              const diff = (new Date(today) - new Date(srEntry.dueDate)) / 86400000;
              if (diff >= 1) return { text: `📅 Overdue by ${Math.round(diff)} day${Math.round(diff) !== 1 ? "s" : ""}`, bg: "#FFF0E0", border: "#F0C070", color: "#8A5010" };
              if (lastResult === "correct" && streak >= 2) return { text: `⭐ Strong — ${streak} in a row`, bg: "#E8F4F2", border: "#B0D4CE", color: "#2D5A54" };
              if (lastResult === "correct") return { text: "✓ Correct last session", bg: "#E8F4F2", border: "#B0D4CE", color: "#2D5A54" };
              if (lastResult === "space_cued") return { text: "🔡 Used sound starter last time", bg: "#F0F8FF", border: "#A0C8F0", color: "#1A3A5A" };
              if (lastResult === "semantic_cued") return { text: "💡 Needed a hint last time", bg: "#FFF8E8", border: "#F0E0A0", color: "#7A5A10" };
              if (lastResult === "phonemic_cued") return { text: "🔤 Needed sound cue last time", bg: "#FFF0E0", border: "#F0C070", color: "#8A5010" };
              if (lastResult === "failed")        return { text: "✗ Needed full reveal last time", bg: "#FFF0F0", border: "#F0B0B0", color: "#8A1010" };
              return null;
            })();

        return (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", fontSize: 12 }}>
            {/* Due-today count */}
            {dueNow > 0 ? (
              <span style={{ background: "#FFF0E0", border: "1px solid #F0C070", borderRadius: 20, padding: "3px 10px", color: "#8A5010", fontWeight: 600 }}>
                📅 {dueNow} word{dueNow !== 1 ? "s" : ""} to review today
              </span>
            ) : (
              <span style={{ background: "#E8F4F2", border: "1px solid #B0D4CE", borderRadius: 20, padding: "3px 10px", color: "#2D5A54", fontWeight: 600 }}>
                ✅ All caught up — great work!
              </span>
            )}
            {/* Per-card context */}
            {cardLabel && (
              <span style={{ background: cardLabel.bg, border: `1px solid ${cardLabel.border}`, borderRadius: 20, padding: "3px 10px", color: cardLabel.color, fontWeight: 600 }}>
                {cardLabel.text}
              </span>
            )}
          </div>
        );
      })()}

      {/* Card */}
      <div style={{ background: "#FFFDF9", borderRadius: 20, padding: 32, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", border: "1px solid #E8E0D0" }}>
        {/* Graphic */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 110, marginBottom: 4 }}>
          {isImg
            ? <img src={graphic} alt={item.word} style={{ maxWidth: 100, maxHeight: 100, objectFit: "contain", borderRadius: 16 }} />
            : <span style={{ fontSize: 96, lineHeight: 1 }}>{graphic}</span>
          }
        </div>
        <div style={{ fontSize: 14, color: "#999", marginTop: 8, textTransform: "uppercase", letterSpacing: 2 }}>What is this called?</div>

        {phase === "show" && (
          <>
            {phonemesRevealed > 0 && (
              <div style={{ background: "#F0F8FF", borderRadius: 12, padding: "12px 20px", margin: "16px 0 0",
                border: "1px solid #A0C8F0", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#7090B0", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Sound starter</div>
                <span style={{ fontSize: 28, fontWeight: 700, color: "#1A3A5A", letterSpacing: 6 }}>
                  {item.word.slice(0, phonemesRevealed).toUpperCase()}
                </span>
                <span style={{ fontSize: 24, color: "#A0C8F0", fontWeight: 300 }}>...</span>
              </div>
            )}
            <input value={response} onChange={e => setResponse(e.target.value)}
              onKeyDown={e => {
                if (e.key === " " && response === "") {
                  e.preventDefault();
                  if (phonemesRevealed >= item.word.length) return;
                  if (audioHintsOn) {
                    // Audio on: advance display to the next vowel boundary, then speak the
                    // displayed prefix PLUS the immediately following consonant group from
                    // the real word.  The trailing consonant places the vowel in a closed-
                    // syllable context so eSpeak uses the correct in-word allophone:
                    //   "glas"  → short /æ/  (not the schwa eSpeak assigns to bare "gla")
                    //   "chair" → /tʃɛr/     (not the /tʃaɪ/ eSpeak assigns to bare "chai")
                    const newCharCount = findNextVowelEnd(item.word, phonemesRevealed);
                    const anchor = newCharCount < item.word.length
                      ? getNextPhoneme(item.word, newCharCount)   // next consonant group
                      : "";
                    const displayCount = newCharCount + anchor.length;
                    setPhonemesRevealed(displayCount);
                    const speakText = item.word.slice(0, displayCount).toLowerCase();
                    meSpeak.resetQueue();
                    meSpeak.speak(speakText, { speed: 130 });
                  } else {
                    // Audio off: reveal one grapheme group at a time, no speech.
                    const grapheme = getNextPhoneme(item.word, phonemesRevealed);
                    if (grapheme && phonemesRevealed + grapheme.length <= item.word.length) {
                      setPhonemesRevealed(prev => prev + grapheme.length);
                    }
                  }
                }
              }}
              placeholder="Type the name..."
              style={{ margin: "20px 0", padding: "14px 20px", borderRadius: 12,
                border: `2px solid ${phonemesRevealed > 0 ? "#A0C8F0" : "#D5CFC4"}`,
                fontSize: 18, width: "100%", textAlign: "center", background: "#FFFDF9", color: "#2D3B36",
                outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              marginTop: -14, marginBottom: 10, minHeight: 22 }}>
              {phonemesRevealed === 0 && (
                <div style={{ fontSize: 12, color: "#BBB" }}>
                  Press <kbd style={{ background: "#F0EDE8", border: "1px solid #D5CFC4", borderRadius: 4,
                    padding: "1px 6px", fontSize: 11, fontFamily: "inherit" }}>Space</kbd> for a hint
                </div>
              )}
              <div style={{ marginLeft: "auto" }}>
                <button
                  title={audioHintsOn ? "Sound hints on — click to turn off" : "Sound hints off — click to turn on"}
                  onClick={() => { const v = !audioHintsOn; setAudioHintsOn(v); localStorage.setItem('ppa_naming_audio_hints', String(v)); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16,
                    opacity: audioHintsOn ? 1 : 0.35, padding: "0 2px" }}>
                  🔊
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <PBtn color="#4E8B80" onClick={() => recordResponse(phonemesRevealed > 0 ? "space_cued" : "correct")}>✓ Got it!</PBtn>
              <PBtn color="#D4A843" onClick={() => setPhase("semantic")}>💡 Give me a hint</PBtn>
              <PBtn color="#9B7FB8" onClick={() => setPhase("answer")}>👁 Show me</PBtn>
            </div>
          </>
        )}

        {phase === "semantic" && (
          <>
            <div style={{ background: "#FFF8E8", borderRadius: 12, padding: "16px 20px", margin: "16px 0", fontSize: 17, color: "#5A4A1A", border: "1px solid #F0E0A0" }}>
              💡 {item.clue_semantic}
            </div>
            <input value={response} onChange={e => setResponse(e.target.value)}
              placeholder="Type the name..."
              style={{ margin: "4px 0 12px", padding: "14px 20px", borderRadius: 12, border: "2px solid #F0E0A0",
                fontSize: 18, width: "100%", textAlign: "center", background: "#FFFDF9", color: "#2D3B36",
                outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <PBtn color="#4E8B80" onClick={() => recordResponse("semantic_cued")}>✓ Now I know!</PBtn>
              <PBtn color="#C09050" onClick={() => setPhase("phonemic")}>🔤 More help</PBtn>
              <PBtn color="#9B7FB8" onClick={() => setPhase("answer")}>👁 Show me</PBtn>
            </div>
          </>
        )}

        {phase === "phonemic" && (
          <>
            <div style={{ background: "#F0F8FF", borderRadius: 12, padding: "16px 20px", margin: "16px 0", fontSize: 17, color: "#1A3A5A", border: "1px solid #A0C8F0" }}>
              🔤 {item.clue_phonemic}
            </div>
            <input value={response} onChange={e => setResponse(e.target.value)}
              placeholder="Type the name..."
              style={{ margin: "4px 0 12px", padding: "14px 20px", borderRadius: 12, border: "2px solid #A0C8F0",
                fontSize: 18, width: "100%", textAlign: "center", background: "#FFFDF9", color: "#2D3B36",
                outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <PBtn color="#4E8B80" onClick={() => recordResponse("phonemic_cued")}>✓ Got it!</PBtn>
              <PBtn color="#9B7FB8" onClick={() => setPhase("answer")}>👁 Show me</PBtn>
            </div>
          </>
        )}

        {phase === "answer" && (
          <>
            <div style={{ fontSize: 36, fontWeight: 700, color: "#4E8B80", margin: "16px 0", letterSpacing: 2 }}>{item.word.toUpperCase()}</div>
            <div style={{ fontSize: 14, color: "#999", marginBottom: 12 }}>Category: {item.category}</div>
            <PBtn color="#C07070" onClick={() => recordResponse("failed")}>Continue</PBtn>
          </>
        )}
      </div>

      {/* AI feedback */}
      {(loadingAI || aiComment) && (
        <div style={{ background: "#F0F7F5", borderRadius: 14, padding: "16px 20px", border: "1px solid #B0D4CE" }}>
          <div style={{ fontSize: 13, color: "#4E8B80", fontWeight: 600, marginBottom: 6 }}>🧠 Dr. Aria</div>
          {loadingAI
            ? <ThinkingDots />
            : <>
                {aiComment && <div style={{ fontSize: 16, color: "#2D3B36", lineHeight: 1.6, marginBottom: 12 }}>{aiComment}</div>}
                <button onClick={next}
                  style={{ marginTop: 4, padding: "10px 20px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 15 }}>
                  Next word →
                </button>
              </>
          }
        </div>
      )}
    </div>
  );
}

function PBtn({ color, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{ padding: "11px 20px", borderRadius: 12, border: "none", cursor: "pointer",
        background: color, color: "#fff", fontSize: 15, fontWeight: 600 }}
      onMouseOver={e => e.currentTarget.style.opacity = "0.85"}
      onMouseOut={e => e.currentTarget.style.opacity = "1"}>
      {children}
    </button>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function NamingModule({ addToLog }) {
  const [items, setItems]     = useState(loadItems);
  const [adminOpen, setAdminOpen] = useState(false);
  const [pinPassed, setPinPassed] = useState(false);

  // Persist whenever items change
  useEffect(() => { saveItems(items); }, [items]);

  const openAdmin = () => { setPinPassed(false); setAdminOpen(true); };
  const closeAdmin = () => setAdminOpen(false);

  if (adminOpen) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {pinPassed
          ? <AdminPanel items={items} onUpdate={setItems} onClose={closeAdmin} />
          : <PinGate onUnlock={() => setPinPassed(true)} />
        }
        {!pinPassed && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #E8E0D0" }}>
            <button onClick={closeAdmin}
              style={{ color: "#888", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>
              ← Back to practice
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100%" }}>
      {/* Admin gear button */}
      <button
        onClick={openAdmin}
        title="Admin: manage naming items"
        style={{ position: "absolute", top: 16, right: 16, zIndex: 10,
          width: 36, height: 36, borderRadius: "50%", border: "2px solid #D5CFC4",
          background: "#FFFDF9", cursor: "pointer", fontSize: 16, display: "flex",
          alignItems: "center", justifyContent: "center", color: "#888", transition: "all 0.2s" }}
        onMouseOver={e => { e.currentTarget.style.borderColor = "#4E8B80"; e.currentTarget.style.color = "#4E8B80"; }}
        onMouseOut={e => { e.currentTarget.style.borderColor = "#D5CFC4"; e.currentTarget.style.color = "#888"; }}>
        {"⚙️"}
      </button>

      <Practice items={items} addToLog={addToLog} />
    </div>
  );
}
