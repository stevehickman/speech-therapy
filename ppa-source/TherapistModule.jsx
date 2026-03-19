import { useState, useRef, useEffect } from "react";
import { CallAPI, ThinkingDots } from "./shared.jsx";

export default function TherapistModule({ sessionLog, addToLog }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingMessages, setPendingMessages] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: "assistant", content: "Hello. I'm Dr. Aria, your speech therapist. I'm here to help and support you. There's no rush here — take all the time you need. How are you feeling today?" }]);
    }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);
    setPendingMessages(newMsgs);
    addToLog({ type: "chat", content: input.trim(), time: new Date().toLocaleTimeString() });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      {pendingMessages && (
        <CallAPI
          messages={pendingMessages}
          onResult={text => {
            setMessages(m => [...m, { role: "assistant", content: text }]);
            setLoading(false);
            setPendingMessages(null);
          }}
          onError={err => {
            setMessages(m => [...m, { role: "assistant", content: "I'm sorry, I had trouble connecting. Please try again." }]);
            setLoading(false);
            setPendingMessages(null);
          }}
        />
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
          }}>
            {m.role === "assistant" && (
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #7BAE9F, #4E8B80)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginRight: 10, flexShrink: 0, marginTop: 4 }}>🧠</div>
            )}
            <div style={{
              maxWidth: "72%",
              padding: "14px 18px",
              borderRadius: m.role === "user" ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
              background: m.role === "user" ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#F5F0E8",
              color: m.role === "user" ? "#fff" : "#2D3B36",
              fontSize: 17,
              lineHeight: 1.65,
              boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #7BAE9F, #4E8B80)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginRight: 10 }}>🧠</div>
            <div style={{ background: "#F5F0E8", borderRadius: "20px 20px 20px 4px", padding: "10px 18px" }}>
              <ThinkingDots />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "16px 20px", borderTop: "1px solid #E8E0D0", background: "#FFFDF9", display: "flex", gap: 10, alignItems: "flex-end" }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type here, or speak your thoughts... (Enter to send)"
          style={{
            flex: 1, padding: "12px 16px", borderRadius: 14, border: "2px solid #D5CFC4",
            fontSize: 16, resize: "none", minHeight: 52, maxHeight: 120,
            background: "#FFFDF9", color: "#2D3B36", outline: "none", fontFamily: "inherit",
            lineHeight: 1.5,
          }}
          rows={2}
        />
        <button onClick={send} disabled={!input.trim() || loading} style={{
          padding: "14px 22px", borderRadius: 14, border: "none", cursor: "pointer",
          background: input.trim() && !loading ? "linear-gradient(135deg, #4E8B80, #3A7A6F)" : "#C5BEB4",
          color: "#fff", fontSize: 18, transition: "all 0.2s",
        }}>➤</button>
      </div>
    </div>
  );
}
