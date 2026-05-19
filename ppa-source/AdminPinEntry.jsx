import { useState } from "react";

// ── Clinician / Admin PIN ──────────────────────────────────────────────────────
// Guards clinical data: naming word lists, exercise configs, export/import.
export const ADMIN_PIN = "1234";

export function AdminPinEntry({ onSuccess, onCancel }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const submit = () => {
    if (pin === ADMIN_PIN) { onSuccess(); }
    else { setShake(true); setPin(""); setTimeout(() => setShake(false), 600); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 240, gap: 18 }}>
      <div style={{ fontSize: 32 }}>{"🔒"}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36" }}>Clinician PIN required</div>
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

// ── Caregiver PIN ─────────────────────────────────────────────────────────────
// Guards personal content: personal photos, personal video clips.
// Set by the caregiver; stored in localStorage.  Default is "0000".
export const CAREGIVER_PIN_KEY     = "ppa_caregiver_pin";
export const DEFAULT_CAREGIVER_PIN = "0000";

export function getCaregiverPin() {
  return localStorage.getItem(CAREGIVER_PIN_KEY) || DEFAULT_CAREGIVER_PIN;
}
export function setCaregiverPin(pin) {
  localStorage.setItem(CAREGIVER_PIN_KEY, pin);
}

export function CaregiverPinEntry({ onSuccess, onCancel }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const currentPin = getCaregiverPin();
  const isDefault  = currentPin === DEFAULT_CAREGIVER_PIN;

  const submit = () => {
    if (pin === currentPin) { onSuccess(); }
    else { setShake(true); setPin(""); setTimeout(() => setShake(false), 600); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 240, gap: 16, padding: 24 }}>
      <div style={{ fontSize: 32 }}>🔑</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#5A2A80" }}>Caregiver access</div>
      {isDefault && (
        <div style={{ background: "#FFF8E8", border: "1px solid #F0E080", borderRadius: 10, padding: "8px 14px",
          fontSize: 13, color: "#7A5010", textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}>
          ℹ️ Default PIN is active (<strong>0000</strong>). Set a personal PIN after unlocking.
        </div>
      )}
      <div style={{ animation: shake ? "cgShake 0.5s" : "none", display: "flex", gap: 10, flexDirection: "column", alignItems: "center" }}>
        <input type="password" value={pin} onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="Enter PIN" autoFocus maxLength={8}
          style={{ padding: "12px 20px", fontSize: 22, borderRadius: 12, border: "2px solid #C4A8E8", textAlign: "center", letterSpacing: 8, width: 160, outline: "none", background: "#FAF7FF" }} />
        {shake && <div style={{ color: "#C07070", fontSize: 13 }}>Incorrect PIN</div>}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={submit} style={{ padding: "10px 28px", background: "linear-gradient(135deg, #7A5AB8, #5A2A80)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 15 }}>Unlock</button>
        <button onClick={onCancel} style={{ padding: "10px 20px", background: "#F5F0E8", border: "2px solid #D5CFC4", borderRadius: 10, cursor: "pointer", fontWeight: 600, color: "#666", fontSize: 15 }}>Cancel</button>
      </div>
      <style>{`@keyframes cgShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`}</style>
    </div>
  );
}

// ── Change Caregiver PIN form ──────────────────────────────────────────────────
// Renders inline — drop it anywhere inside a caregiver-unlocked panel.
export function ChangeCaregiverPinForm({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);

  const submit = () => {
    setError("");
    if (current !== getCaregiverPin()) { setError("Current PIN is incorrect."); return; }
    if (next.length < 4)               { setError("New PIN must be at least 4 digits."); return; }
    if (next !== confirm)              { setError("PINs don't match."); return; }
    setCaregiverPin(next);
    setSuccess(true);
    setTimeout(onClose, 1200);
  };

  const inp = { padding: "10px 14px", borderRadius: 10, border: "2px solid #C4A8E8", fontSize: 18,
    textAlign: "center", letterSpacing: 6, width: "100%", outline: "none", background: "#FAF7FF",
    boxSizing: "border-box" };

  if (success) {
    return (
      <div style={{ textAlign: "center", padding: 24, color: "#5A2A80", fontWeight: 700, fontSize: 15 }}>
        ✅ Caregiver PIN updated!
      </div>
    );
  }

  return (
    <div style={{ background: "#FAF7FF", border: "2px solid #C4A8E8", borderRadius: 14, padding: "16px 20px",
      display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#5A2A80" }}>🔑 Change caregiver PIN</div>
      <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
        placeholder="Current PIN" maxLength={8} style={inp} />
      <input type="password" value={next} onChange={e => setNext(e.target.value)}
        placeholder="New PIN (4+ digits)" maxLength={8} style={inp} />
      <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="Confirm new PIN" maxLength={8} style={inp} />
      {error && <div style={{ color: "#C07070", fontSize: 13, fontWeight: 600 }}>⚠ {error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit}
          style={{ flex: 1, padding: "10px 0", background: "linear-gradient(135deg, #7A5AB8, #5A2A80)", color: "#fff",
            border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          Save new PIN
        </button>
        <button onClick={onClose}
          style={{ padding: "10px 16px", background: "#F5F0E8", border: "2px solid #D5CFC4",
            borderRadius: 10, cursor: "pointer", fontWeight: 600, color: "#666", fontSize: 14 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
