// ── Shared UI utilities ────────────────────────────────────────────────────────
// Components used by multiple modules.  Import from here rather than
// duplicating inline.

import { useEffect } from "react";
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
