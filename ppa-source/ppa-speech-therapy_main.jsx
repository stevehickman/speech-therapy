import { useState, useEffect, useCallback } from "react";

import { TOOLS } from "./data/tools.js";
import { ppaBackupIsStale, ppaDoBackup } from "./ExportImportSystem.jsx";
import NamingModule from "./NamingModule.jsx";
import SentenceBuilderModule from "./SentenceBuilderModule.jsx";
import TherapistModule from "./TherapistModule.jsx";
import RepetitionModule from "./RepetitionModule.jsx";
import SentenceModule from "./SentenceModule.jsx";
import ScriptsModule from "./ScriptsModule.jsx";
import AssessmentModule from "./AssessmentModule.jsx";
import ProgressModule from "./ProgressModule.jsx";
import VideoModule from "./VideoModule.jsx";

// ---- APP ----
export default function App() {
  const [active, setActive] = useState("therapist");
  const [appBackupStale, setAppBackupStale] = useState(() => ppaBackupIsStale(7));
  const _TODAY_KEY = `ppa_progress_${new Date().toISOString().slice(0, 10)}`;
  const [sessionLog, setSessionLog] = useState(() => {
    try { const s = localStorage.getItem(_TODAY_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const addToLog = useCallback((entry) => {
    const key = `ppa_progress_${new Date().toISOString().slice(0, 10)}`;
    setSessionLog(l => {
      const next = [...l, entry];
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Refresh backup staleness whenever the active module changes (content may have changed)
  useEffect(() => { setAppBackupStale(ppaBackupIsStale(7)); }, [active]);
  // Also recheck on window focus so the badge appears even if the user stays on the same module
  useEffect(() => {
    const onFocus = () => setAppBackupStale(ppaBackupIsStale(7));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const ActiveModule = {
    therapist: <TherapistModule sessionLog={sessionLog} addToLog={addToLog} />,
    naming: <NamingModule addToLog={addToLog} />,
    assessment: <AssessmentModule addToLog={addToLog} />,
    repetition: <RepetitionModule addToLog={addToLog} />,
    sentence: <SentenceModule addToLog={addToLog} />,
    scripts: <ScriptsModule />,
    sentence_builder: <SentenceBuilderModule addToLog={addToLog} />,
    video: <VideoModule addToLog={addToLog} />,
    progress: <ProgressModule sessionLog={sessionLog} />,
  }[active];

  const activeTool = TOOLS.find(t => t.id === active);

  return (
    <div style={{ minHeight: "100vh", background: "#F9F6EF", fontFamily: "'Georgia', 'Times New Roman', serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #C5BEB4; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #2D5A54 0%, #1E3D3A 100%)", padding: "18px 24px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: 30 }}>🌿</div>
        <div>
          <div style={{ color: "#E8F4F2", fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>PPA Speech Therapy Suite</div>
          <div style={{ color: "#7BAE9F", fontSize: 13 }}>AI-Assisted Language Therapy • Dr. Aria, SLP</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {appBackupStale && (
            <button
              onClick={() => { setAppBackupStale(false); ppaDoBackup("ppa-therapy-backup"); setTimeout(() => setAppBackupStale(ppaBackupIsStale(7)), 500); }}
              title="Backup recommended — click to download a full backup"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                background: "#D4A84330", border: "1px solid #D4A843", borderRadius: 10,
                cursor: "pointer", color: "#D4A843", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
              💾 Backup recommended
            </button>
          )}
          <div style={{ background: "#4E8B8030", borderRadius: 10, padding: "6px 14px" }}>
            <span style={{ color: "#7BAE9F", fontSize: 13 }}>Session: {sessionLog.length} activities</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", maxHeight: "calc(100vh - 72px)" }}>
        {/* Sidebar */}
        <div style={{ width: 190, background: "#FFFDF9", borderRight: "1px solid #E8E0D0", display: "flex", flexDirection: "column", padding: "12px 8px", gap: 4, overflowY: "auto", flexShrink: 0 }}>
          {TOOLS.map(tool => (
            <button key={tool.id} onClick={() => setActive(tool.id)} style={{
              padding: "12px 10px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
              background: active === tool.id ? "linear-gradient(135deg, #E8F4F2, #D4EDE9)" : "transparent",
              borderLeft: active === tool.id ? "3px solid #4E8B80" : "3px solid transparent",
              transition: "all 0.2s",
            }}>
              <div style={{ fontSize: 18 }}>{tool.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: active === tool.id ? "#2D5A54" : "#444", marginTop: 2 }}>{tool.label}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2, lineHeight: 1.3 }}>{tool.desc}</div>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px 24px", borderBottom: "1px solid #E8E0D0", background: "#FFFDF9", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>{activeTool?.icon}</span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36" }}>{activeTool?.label}</div>
              <div style={{ fontSize: 13, color: "#888" }}>{activeTool?.desc}</div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {ActiveModule}
          </div>
        </div>
      </div>
    </div>
  );
}
