import { useState } from "react";

export default function ApiKeySetup({ onSave }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError("Please enter your API key.");
      return;
    }
    if (!trimmed.startsWith("sk-ant-")) {
      setError("That doesn't look like an Anthropic API key (should start with sk-ant-).");
      return;
    }
    setSaving(true);
    localStorage.setItem("ppa_api_key", trimmed);
    setTimeout(() => onSave(), 300);
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(160deg, #3A7A6F 0%, #2D5E55 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "env(safe-area-inset-top, 24px) env(safe-area-inset-right, 24px) env(safe-area-inset-bottom, 24px) env(safe-area-inset-left, 24px)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: "#FFFDF9",
        borderRadius: 24,
        padding: "44px 40px",
        maxWidth: 520,
        width: "100%",
        boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 80, height: 80,
            background: "linear-gradient(135deg, #4E8B80, #3A7A6F)",
            borderRadius: 20,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40, margin: "0 auto 16px",
          }}>🧠</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#2D3B36", lineHeight: 1.2 }}>
            PPA Speech Therapy
          </div>
          <div style={{ fontSize: 15, color: "#7A9990", marginTop: 6 }}>
            AI-powered speech therapy tools
          </div>
        </div>

        <div style={{ height: 1, background: "#E8E0D0", margin: "24px 0" }} />

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36", marginBottom: 8 }}>
            Enter your Anthropic API key
          </div>
          <div style={{ fontSize: 14, color: "#6B7E79", lineHeight: 1.6, marginBottom: 16 }}>
            This app uses Claude AI for the speech therapy features. Your key is stored
            only on this device — it never leaves your iPad.
          </div>
          <div style={{ fontSize: 13, color: "#4E8B80", marginBottom: 16 }}>
            Get a key at{" "}
            <span style={{ fontWeight: 700 }}>console.anthropic.com</span>{" "}
            (costs ~$5–10/month depending on usage)
          </div>
        </div>

        <input
          type="password"
          value={key}
          onChange={e => { setKey(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleSave()}
          placeholder="sk-ant-api03-…"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          style={{
            width: "100%",
            padding: "16px 18px",
            fontSize: 16,
            borderRadius: 14,
            border: error ? "2px solid #C07070" : "2px solid #D5CFC4",
            background: "#FAFAF7",
            color: "#2D3B36",
            outline: "none",
            fontFamily: "monospace",
            boxSizing: "border-box",
            marginBottom: error ? 8 : 0,
          }}
        />

        {error && (
          <div style={{ color: "#C07070", fontSize: 13, marginBottom: 12, paddingLeft: 4 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: "100%",
            marginTop: 16,
            padding: "18px",
            fontSize: 17,
            fontWeight: 700,
            borderRadius: 14,
            border: "none",
            cursor: saving ? "default" : "pointer",
            background: saving
              ? "#A8C5BF"
              : "linear-gradient(135deg, #4E8B80, #3A7A6F)",
            color: "#fff",
            transition: "all 0.2s",
            minHeight: 56,
          }}
        >
          {saving ? "Starting app…" : "Save & Continue"}
        </button>

        <div style={{ marginTop: 20, fontSize: 12, color: "#AAA09A", textAlign: "center", lineHeight: 1.6 }}>
          You can update your key at any time in the Progress &amp; Settings tab.
        </div>
      </div>
    </div>
  );
}
