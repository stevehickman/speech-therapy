import { useState } from "react";
import { CONDITION_PROFILES } from "./lib/bkt.js";
import { CaregiverPinEntry } from "./AdminPinEntry.jsx";

export const PROFILE_KEY = "fam_profile";

export const DEFAULT_PROFILE = {
  name: "",
  conditionType: "primary_progressive",
  dailyGoalMinutes: 20,
  streak: 0,
  lastSessionDate: null,
};

export function loadProfile() {
  try {
    const s = localStorage.getItem(PROFILE_KEY);
    if (!s) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(s) };
  } catch { return { ...DEFAULT_PROFILE }; }
}

export function saveProfile(profile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch {}
}

// Returns updated profile with streak recalculated for today
export function touchStreak(profile) {
  const today = new Date().toISOString().slice(0, 10);
  if (profile.lastSessionDate === today) return profile;
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const streak = profile.lastSessionDate === yesterday ? (profile.streak || 0) + 1 : 1;
  return { ...profile, streak, lastSessionDate: today };
}

// ── Styles ──────────────────────────────────────────────────────────────────
const card  = { background: "#FFFDF9", borderRadius: 16, padding: "18px 20px", border: "1px solid #E8E0D0" };
const inp   = { padding: "10px 13px", borderRadius: 10, border: "2px solid #D5CFC4", fontSize: 15, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const btn   = (bg, col = "#fff") => ({ padding: "11px 22px", background: bg, color: col, border: "none", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" });
const label = { fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" };

export default function ProfileModule({ profile, onSave }) {
  const [view, setView] = useState("profile"); // "profile" | "settings" | "pin"
  const [draft, setDraft] = useState({ ...profile });
  const [saved, setSaved] = useState(false);

  const save = () => {
    const next = { ...draft };
    saveProfile(next);
    onSave(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (view === "pin") {
    return (
      <div style={{ padding: 20, maxWidth: 420, margin: "0 auto" }}>
        <CaregiverPinEntry
          onSuccess={() => setView("settings")}
          onCancel={() => setView("profile")} />
      </div>
    );
  }

  const conditionLabel = CONDITION_PROFILES[profile.conditionType]?.label ?? "Not set";

  return (
    <div style={{ padding: 20, maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Greeting card */}
      <div style={{ ...card, background: "linear-gradient(135deg,#E8F4F2,#D4EDE9)", border: "1px solid #B0D4CE" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 48 }}>🌿</div>
          <div>
            {profile.name ? (
              <div style={{ fontSize: 22, fontWeight: 700, color: "#2D5A54" }}>Hello, {profile.name}</div>
            ) : (
              <div style={{ fontSize: 20, fontWeight: 700, color: "#2D5A54" }}>Welcome</div>
            )}
            <div style={{ fontSize: 13, color: "#4E8B80", marginTop: 3 }}>{conditionLabel}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#2D5A54" }}>{profile.streak || 0}</div>
            <div style={{ fontSize: 11, color: "#7BAE9F" }}>day streak 🔥</div>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div style={{ ...card }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#2D3B36", marginBottom: 16 }}>👤 Patient Profile</div>

        <div style={{ marginBottom: 14 }}>
          <span style={label}>Name</span>
          <input style={inp} value={draft.name} placeholder="Patient name"
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={label}>Daily goal (minutes)</span>
          <input type="number" style={{ ...inp, width: 100 }} min={5} max={120} step={5}
            value={draft.dailyGoalMinutes}
            onChange={e => setDraft(d => ({ ...d, dailyGoalMinutes: Number(e.target.value) }))} />
        </div>

        <button onClick={save} style={{ ...btn(saved ? "#4E8B80" : "linear-gradient(135deg,#4E8B80,#3A7A6F)") }}>
          {saved ? "✓ Saved!" : "Save Profile"}
        </button>
      </div>

      {/* Condition — admin only */}
      <div style={{ ...card }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#2D3B36" }}>🏥 Clinical Condition</div>
          <button onClick={() => setView("pin")}
            style={{ ...btn("#F5F0E8", "#666"), padding: "7px 14px", fontSize: 12 }}>
            Change (Admin)
          </button>
        </div>
        <div style={{ padding: "10px 14px", background: "#E8F4F2", borderRadius: 10, fontSize: 14, color: "#2D5A54", fontWeight: 600 }}>
          {conditionLabel}
        </div>
        <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>
          The condition profile controls how quickly knowledge decays between sessions and how difficulty adapts over time.
        </div>
      </div>

      {/* Condition picker — shown after admin unlock */}
      {view === "settings" && (
        <div style={{ ...card, border: "1px solid #4E8B80" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D5A54", marginBottom: 14 }}>Select Condition Profile</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(CONDITION_PROFILES).map(([key, { label: lbl }]) => (
              <button key={key}
                onClick={() => setDraft(d => ({ ...d, conditionType: key }))}
                style={{
                  padding: "10px 16px", borderRadius: 10, border: "2px solid",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 14, fontWeight: 600,
                  borderColor: draft.conditionType === key ? "#4E8B80" : "#D5CFC4",
                  background:  draft.conditionType === key ? "#E8F4F2" : "#FFFDF9",
                  color:       draft.conditionType === key ? "#2D5A54" : "#555",
                }}>
                {lbl}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={() => { save(); setView("profile"); }}
              style={{ ...btn("linear-gradient(135deg,#4E8B80,#3A7A6F)") }}>✓ Apply</button>
            <button onClick={() => setView("profile")}
              style={{ ...btn("#F5F0E8", "#666") }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
