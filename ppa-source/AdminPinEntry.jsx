import { useState, useEffect } from "react";

// NOTE: ADMIN_PIN and AdminPinEntry have been removed from this file.
// They belong exclusively to the clinician app (separate codebase) and must never
// be shipped in the client (patient) bundle — doing so would expose a hardcoded
// credential to anyone with DevTools access.
// See clinician-app/ for the clinician-side equivalents.

// ── Caregiver PIN ─────────────────────────────────────────────────────────────
// Guards personal content: personal photos, personal video clips.
// Set by the caregiver; stored as a SHA-256 hash in localStorage.  Default is "0000".
export const CAREGIVER_PIN_KEY     = "ppa_caregiver_pin";
export const DEFAULT_CAREGIVER_PIN = "0000";

async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const isHash = s => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);

// Compare a plaintext PIN against the stored value (hash or legacy plaintext).
// Automatically migrates legacy plaintext to a hash on first successful match.
export async function checkCaregiverPin(pin) {
  const stored = localStorage.getItem(CAREGIVER_PIN_KEY);
  if (!stored) return pin === DEFAULT_CAREGIVER_PIN;
  if (isHash(stored)) return (await hashPin(pin)) === stored;
  // Legacy plaintext — migrate on successful match
  if (pin === stored) { await setCaregiverPin(pin); return true; }
  return false;
}

export async function setCaregiverPin(pin) {
  localStorage.setItem(CAREGIVER_PIN_KEY, await hashPin(pin));
}

export async function isCaregiverPinDefault() {
  const stored = localStorage.getItem(CAREGIVER_PIN_KEY);
  if (!stored) return true;
  return checkCaregiverPin(DEFAULT_CAREGIVER_PIN);
}

export function CaregiverPinEntry({ onSuccess, onCancel }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  // When the default PIN is still active, require the caregiver to set a
  // personal PIN before being granted access — don't just warn and allow through.
  const [mustSetPin, setMustSetPin] = useState(false);

  useEffect(() => { isCaregiverPinDefault().then(setIsDefault); }, []);

  const submit = async () => {
    const ok = await checkCaregiverPin(pin);
    if (ok) {
      if (isDefault) {
        // Correct but still the factory default — gate behind PIN change first
        setMustSetPin(true);
      } else {
        onSuccess();
      }
    } else {
      setShake(true); setPin(""); setTimeout(() => setShake(false), 600);
    }
  };

  // Inline PIN-change gate shown after the user unlocks with the default "0000"
  if (mustSetPin) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 24 }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#5A2A80", textAlign: "center" }}>
          Set a personal caregiver PIN
        </div>
        <div style={{ fontSize: 13, color: "#7A5010", background: "#FFF8E8", border: "1px solid #F0E080",
          borderRadius: 10, padding: "8px 14px", textAlign: "center", maxWidth: 300, lineHeight: 1.6 }}>
          The default PIN (0000) is easy for anyone to guess. Please choose a personal PIN
          before accessing caregiver content.
        </div>
        <ChangeCaregiverPinForm onClose={onSuccess} skipCurrentCheck />
        <button onClick={onCancel} style={{ padding: "8px 18px", background: "#F5F0E8",
          border: "2px solid #D5CFC4", borderRadius: 10, cursor: "pointer",
          fontWeight: 600, color: "#666", fontSize: 14 }}>Cancel</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 240, gap: 16, padding: 24 }}>
      <div style={{ fontSize: 32 }}>🔑</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#5A2A80" }}>Caregiver access</div>
      {isDefault && (
        <div style={{ background: "#FFF8E8", border: "1px solid #F0E080", borderRadius: 10, padding: "8px 14px",
          fontSize: 13, color: "#7A5010", textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}>
          ℹ️ Default PIN is active (<strong>0000</strong>). You'll be asked to set a personal PIN on first unlock.
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
// skipCurrentCheck: pass true when the caller already verified the current PIN
// (e.g. CaregiverPinEntry's forced-change flow after the default PIN is used).
export function ChangeCaregiverPinForm({ onClose, skipCurrentCheck = false }) {
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    setError("");
    if (!skipCurrentCheck) {
      const ok = await checkCaregiverPin(current);
      if (!ok) { setError("Current PIN is incorrect."); return; }
    }
    if (next.length < 4)   { setError("New PIN must be at least 4 digits."); return; }
    if (next !== confirm)  { setError("PINs don't match."); return; }
    await setCaregiverPin(next);
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
      {!skipCurrentCheck && (
        <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
          placeholder="Current PIN" maxLength={8} style={inp} />
      )}
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
