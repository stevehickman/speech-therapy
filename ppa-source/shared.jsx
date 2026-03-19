// ── Shared UI utilities ────────────────────────────────────────────────────────
// Components used by multiple modules.  Import from here rather than
// duplicating inline.

import { useState, useEffect } from "react";
import { CLAUDE_MODEL, SYSTEM_PROMPT } from "./data/config.js";

// ── fetchAnthropicApi ──────────────────────────────────────────────────────────
// Low-level fetch helper with all required Anthropic headers pre-applied.
// `body`   — the full request body object (caller supplies model, messages, etc.)
// `signal` — optional AbortSignal so callers can cancel in-flight requests.
// Returns the parsed JSON response; throws on network or HTTP error.
export async function fetchAnthropicApi(body, signal) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── CallAPI ────────────────────────────────────────────────────────────────────
// Fires a single Anthropic API request when mounted and calls onResult / onError.
// The request is aborted automatically if the component unmounts before it
// completes.  onResult always receives a non-empty string.
export function CallAPI({ messages, onResult, onError, system = SYSTEM_PROMPT }) {
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const data = await fetchAnthropicApi(
          { model: CLAUDE_MODEL, max_tokens: 1000, system, messages },
          controller.signal,
        );
        const text =
          data.content?.map(b => b.text || "").join("").trim() ||
          "Well done — keep going!";
        onResult(text);
      } catch (e) {
        if (!controller.signal.aborted) onError(e);
      }
    })();
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ── Btn ────────────────────────────────────────────────────────────────────────
// Simple coloured button used across several modules.
export function Btn({ color, onClick, children }) {
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

// ── ThinkingDots ───────────────────────────────────────────────────────────────
// Animated three-dot loading indicator.
export function ThinkingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: "50%", background: "#4E8B80",
          animation: "sharedPulseDot 1.2s ease-in-out infinite",
          animationDelay: `${i * 0.2}s`,
        }} />
      ))}
      <style>{`@keyframes sharedPulseDot{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}`}</style>
    </span>
  );
}

// ── Duplicate checking ─────────────────────────────────────────────────────────

/**
 * Check a new item against an existing list for duplicates.
 * keyFn extracts the comparison key from an item.
 * fields lists non-key fields to compare for update/conflict detection.
 *
 * Returns:
 *   { action: 'add' }                                    — no match, safe to add
 *   { action: 'ignore', match }                          — identical to existing
 *   { action: 'update', match, merged }                  — same key, new info
 *   { action: 'conflict', match, conflictFields, merged } — conflicting values
 */
// Strip punctuation, collapse whitespace, lowercase — used for fuzzy key comparison.
const normStr = v => {
  const s = typeof v === "string" ? v : String(v ?? "");
  return s.replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
};

export function checkDuplicate(existing, newItem, keyFn, fields = []) {
  const normalize = v => normStr(typeof v === "string" ? v : String(v ?? ""));
  const newKey = normalize(keyFn(newItem));
  const match = existing.find(item => normalize(keyFn(item)) === newKey);
  if (!match) return { action: "add" };

  const isEmpty = v => v === undefined || v === null || v === "" || v === "❓" || v === "🖼️";
  const toStr = v => (Array.isArray(v) ? v.join(",") : String(v ?? ""));
  const conflictFields = [];
  const merged = { ...match };
  let hasUpdate = false;

  for (const field of fields) {
    const existVal = match[field];
    const newVal = newItem[field];
    if (isEmpty(newVal)) continue;
    if (isEmpty(existVal)) {
      merged[field] = newVal;
      hasUpdate = true;
    } else if (toStr(existVal) !== toStr(newVal)) {
      conflictFields.push({ field, existingValue: existVal, incomingValue: newVal });
    }
  }

  if (conflictFields.length > 0) return { action: "conflict", match, conflictFields, merged };
  if (hasUpdate) return { action: "update", match, merged };
  return { action: "ignore", match };
}

/**
 * Returns true if str already exists in arr (case-insensitive, trimmed).
 */
export function isDuplicateString(arr, str) {
  const norm = normStr(str);
  return arr.some(s => typeof s === "string" && normStr(s) === norm);
}

const FIELD_LABELS = {
  graphic: "Graphic", emoji: "Graphic", category: "Category",
  clue_semantic: "Semantic cue", clue_phonemic: "Phonemic cue",
  hint: "Hint", words: "Words", type: "Type", situation: "Situation name",
  name: "Name",
};

function renderConflictValue(value) {
  if (typeof value === "string" && value.startsWith("data:image")) {
    return <img src={value} alt="graphic" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 6 }} />;
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/**
 * Modal for resolving duplicate item field conflicts.
 * Shows each conflicting field with radio buttons to choose existing vs incoming.
 */
export function DuplicateConflictModal({ itemLabel, existing, incoming, conflictFields, onResolve, onCancel }) {
  const [choices, setChoices] = useState(
    Object.fromEntries(conflictFields.map(f => [f.field, "existing"]))
  );

  const resolve = () => {
    const merged = { ...existing };
    for (const { field } of conflictFields) {
      if (choices[field] === "incoming") merged[field] = incoming[field];
    }
    onResolve(merged);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }}>
      <div style={{
        background: "#FFFDF9", borderRadius: 16, padding: 28, maxWidth: 480, width: "90%",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)", maxHeight: "80vh", overflowY: "auto",
      }}>
        <h3 style={{ margin: "0 0 8px", color: "#2D3B36", fontSize: 18 }}>Duplicate item found</h3>
        <p style={{ margin: "0 0 20px", color: "#666", fontSize: 14 }}>
          <strong>"{itemLabel}"</strong> already exists with different values. Choose which to keep:
        </p>
        {conflictFields.map(({ field, existingValue, incomingValue }) => (
          <div key={field} style={{ marginBottom: 14, padding: 14, background: "#F5F0E8", borderRadius: 10 }}>
            <div style={{ fontWeight: 700, color: "#555", marginBottom: 8, fontSize: 13 }}>
              {FIELD_LABELS[field] ?? field}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
              <input type="radio" name={field} checked={choices[field] === "existing"}
                onChange={() => setChoices(c => ({ ...c, [field]: "existing" }))} />
              <span style={{ fontSize: 14 }}><strong>Keep existing:</strong> {renderConflictValue(existingValue)}</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="radio" name={field} checked={choices[field] === "incoming"}
                onChange={() => setChoices(c => ({ ...c, [field]: "incoming" }))} />
              <span style={{ fontSize: 14 }}><strong>Use new:</strong> {renderConflictValue(incomingValue)}</span>
            </label>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={resolve} style={{
            flex: 1, padding: "11px 0", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff",
            fontWeight: 700, cursor: "pointer", fontSize: 15,
          }}>Apply choices</button>
          <button onClick={onCancel} style={{
            padding: "11px 18px", borderRadius: 10, border: "2px solid #D5CFC4",
            background: "#FFFDF9", color: "#666", fontWeight: 600, cursor: "pointer", fontSize: 15,
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
