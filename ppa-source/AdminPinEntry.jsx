import { useState } from "react";

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
      <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36" }}>Admin PIN required</div>
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
