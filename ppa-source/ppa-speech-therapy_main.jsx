import { useState, useEffect, useCallback, useRef } from "react";

import { TOOLS } from "./data/tools.js";
import { ppaBackupIsStale, ppaDoBackup } from "./ExportImportSystem.jsx";
import { hasApiKey, setApiKey } from "./shared.jsx";
import { ppaRunRetentionPurge, ppaStripChatContent } from "./ProgressModule.jsx";
import { CaregiverPinEntry } from "./AdminPinEntry.jsx";

// Familiar modules
import { bktInitialState, bktUpdate, bktAllTrajectories, bktSnapshotFromSession, applyTimeDecay, BKT_PARAMS, CONDITION_PROFILES, DEFAULT_CONDITION, logEntryToAttempt } from "./lib/bkt.js";
import { loadProfile, saveProfile, touchStreak, DEFAULT_PROFILE } from "./ProfileModule.jsx";
import { loadContentItems, saveContentItems } from "./ContentLibraryModule.jsx";
import { loadFamilyMembers, saveFamilyMembers } from "./FamilyModule.jsx";

// Speech-therapy modules
import NamingModule from "./NamingModule.jsx";
import SentenceBuilderModule from "./SentenceBuilderModule.jsx";
import TherapistModule from "./TherapistModule.jsx";
import RepetitionModule from "./RepetitionModule.jsx";
import SentenceModule from "./SentenceModule.jsx";
import ScriptsModule from "./ScriptsModule.jsx";
import AssessmentModule from "./AssessmentModule.jsx";
import ProgressModule from "./ProgressModule.jsx";
import VideoModule from "./VideoModule.jsx";

// Familiar-derived modules
import MemoryModule from "./MemoryModule.jsx";
import FamilyModule from "./FamilyModule.jsx";
import ContentLibraryModule from "./ContentLibraryModule.jsx";
import ProfileModule from "./ProfileModule.jsx";

// localStorage keys for Familiar state
const BKT_KEY          = "fam_bkt";
const BKT_SNAPSHOTS_KEY = "fam_bkt_snapshots";
const LAST_SESSION_KEY  = "fam_last_session_ms";

function loadBkt() {
  try { const s = localStorage.getItem(BKT_KEY); return s ? JSON.parse(s) : bktInitialState(); } catch { return bktInitialState(); }
}
function saveBkt(bkt) { try { localStorage.setItem(BKT_KEY, JSON.stringify(bkt)); } catch {} }

function loadSnapshots() {
  try { const s = localStorage.getItem(BKT_SNAPSHOTS_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
}
function saveSnapshots(snaps) { try { localStorage.setItem(BKT_SNAPSHOTS_KEY, JSON.stringify(snaps)); } catch {} }

function loadLastSessionMs() {
  try { const s = localStorage.getItem(LAST_SESSION_KEY); return s ? Number(s) : null; } catch { return null; }
}
function saveLastSessionMs(ms) { try { localStorage.setItem(LAST_SESSION_KEY, String(ms)); } catch {} }

// Apply time-decay to BKT on first load (if last session was yesterday or earlier)
function initBktWithDecay(bkt, lastSessionMs, conditionType) {
  if (!lastSessionMs) return bkt;
  const days = Math.max(0, Date.now() - lastSessionMs) / 86_400_000;
  if (days < 0.5) return bkt; // same-day, no decay
  const decayed = { ...bkt };
  for (const skill of Object.keys(BKT_PARAMS)) {
    if (decayed[skill] != null) decayed[skill] = applyTimeDecay(decayed[skill], days, skill, conditionType);
  }
  return decayed;
}

// ---- APP ----
function ApiKeySetupModal({ onDone }) {
  const [step, setStep] = useState("pin"); // "pin" | "key"
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState("");

  const handlePinSuccess = () => setStep("key");

  const handleSaveKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed.startsWith("sk-ant-")) {
      setKeyError("Key should start with sk-ant-…");
      return;
    }
    setApiKey(trimmed);
    onDone();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 10000, fontFamily: "'Georgia', 'Times New Roman', serif",
    }}>
      <div style={{
        background: "#FFFDF9", borderRadius: 20, padding: 32, maxWidth: 440, width: "90%",
        boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
      }}>
        {step === "pin" ? (
          <>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#2D3B36", marginBottom: 8 }}>
                API key required
              </div>
              <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6 }}>
                Dr. Aria's AI feedback needs an Anthropic API key.
                Caregiver access is required to set it.
              </div>
            </div>
            <CaregiverPinEntry onSuccess={handlePinSuccess} onCancel={onDone} />
          </>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🤖</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#2D3B36", marginBottom: 8 }}>
                Enter Anthropic API key
              </div>
              <div style={{ fontSize: 14, color: "#666", lineHeight: 1.6 }}>
                Get your key at{" "}
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                  style={{ color: "#4E8B80" }}>
                  console.anthropic.com
                </a>
                . Cost is typically under $10/month.
              </div>
            </div>
            <input
              type="password"
              value={keyInput}
              onChange={e => { setKeyInput(e.target.value); setKeyError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSaveKey()}
              placeholder="sk-ant-api03-…"
              autoFocus
              style={{
                width: "100%", padding: "12px 16px", fontSize: 15, borderRadius: 12,
                border: `2px solid ${keyError ? "#C07070" : "#C4A8E8"}`,
                outline: "none", background: "#FAF7FF", boxSizing: "border-box",
                fontFamily: "monospace", marginBottom: 8,
              }}
            />
            {keyError && (
              <div style={{ color: "#C07070", fontSize: 13, marginBottom: 8 }}>⚠ {keyError}</div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={handleSaveKey} style={{
                flex: 1, padding: "11px 0", background: "linear-gradient(135deg, #7A5AB8, #5A2A80)",
                color: "#fff", border: "none", borderRadius: 10, cursor: "pointer",
                fontWeight: 700, fontSize: 15,
              }}>
                Save key
              </button>
              <button onClick={onDone} style={{
                padding: "11px 18px", background: "#F5F0E8", border: "2px solid #D5CFC4",
                borderRadius: 10, cursor: "pointer", fontWeight: 600, color: "#666", fontSize: 15,
              }}>
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const PRIVACY_NOTICE_KEY = "ppa_privacy_accepted";

function PrivacyNoticeModal({ onAccept }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 11000, fontFamily: "'Georgia', 'Times New Roman', serif",
    }}>
      <div style={{
        background: "#FFFDF9", borderRadius: 20, padding: 32, maxWidth: 460, width: "90%",
        boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
      }}>
        <div style={{ fontSize: 28, marginBottom: 12, textAlign: "center" }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#2D3B36", marginBottom: 16, textAlign: "center" }}>
          About your privacy
        </div>
        <ul style={{ color: "#555", fontSize: 14, lineHeight: 1.9, paddingLeft: 20, margin: "0 0 24px" }}>
          <li>All your data — practice history, photos, and settings — is stored <strong>only on this device</strong>. Nothing is uploaded automatically.</li>
          <li>When you use Dr. Aria or generate a progress report, your messages and practice activity are sent to <strong>Anthropic's AI service</strong> to generate responses.</li>
          <li>No data is shared with anyone else unless you choose to download a backup file or email a report.</li>
        </ul>
        <button onClick={onAccept} style={{
          width: "100%", padding: "13px 0",
          background: "linear-gradient(135deg, #4E8B80, #3A7A6F)",
          color: "#fff", border: "none", borderRadius: 12,
          cursor: "pointer", fontWeight: 700, fontSize: 15,
          fontFamily: "'Georgia', 'Times New Roman', serif",
        }}>
          Understood
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState("therapist");
  const [appBackupStale, setAppBackupStale] = useState(() => ppaBackupIsStale(7));
  const [showApiKeySetup, setShowApiKeySetup] = useState(() => !hasApiKey());
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(() => !localStorage.getItem(PRIVACY_NOTICE_KEY));

  // Session log (existing speech-therapy mechanism)
  const _TODAY_KEY = `ppa_progress_${new Date().toISOString().slice(0, 10)}`;
  const [sessionLog, setSessionLog] = useState(() => {
    try { const s = localStorage.getItem(_TODAY_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });

  // Familiar state
  const [profile, setProfile]       = useState(() => loadProfile());
  const [contentItems, setContentItems] = useState(() => loadContentItems());
  const [familyMembers, setFamilyMembers] = useState(() => loadFamilyMembers());

  const [lastSessionMs, setLastSessionMs] = useState(() => loadLastSessionMs());
  const [bkt, setBkt] = useState(() => {
    const raw = loadBkt();
    const last = loadLastSessionMs();
    const prof = loadProfile();
    return initBktWithDecay(raw, last, prof.conditionType || DEFAULT_CONDITION);
  });
  const [bktSnapshots, setBktSnapshots] = useState(() => loadSnapshots());

  // Track whether we've taken a snapshot today already
  const snapshotTakenRef = useRef(false);

  // Take a BKT snapshot at start of first activity each day
  const maybeSnapshot = useCallback((nextBkt) => {
    if (snapshotTakenRef.current) return;
    snapshotTakenRef.current = true;
    const snap = bktSnapshotFromSession(nextBkt);
    setBktSnapshots(prev => {
      const next = { ...prev };
      for (const [skill, s] of Object.entries(snap)) {
        next[skill] = [...(next[skill] || []), s].slice(-50); // keep last 50 snapshots per skill
      }
      saveSnapshots(next);
      return next;
    });
  }, []);

  // Add to session log + update BKT incrementally
  const addToLog = useCallback((entry) => {
    const key = `ppa_progress_${new Date().toISOString().slice(0, 10)}`;
    setSessionLog(l => {
      const next = [...l, entry];
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });

    // BKT update from this activity
    const attempt = logEntryToAttempt(entry);
    if (attempt) {
      setBkt(prev => {
        maybeSnapshot(prev);
        const skill = attempt.skill;
        const prior = prev[skill] ?? BKT_PARAMS[skill].p_known0;
        const conditionType = loadProfile().conditionType || DEFAULT_CONDITION;
        const next = { ...prev, [skill]: bktUpdate(prior, attempt.score >= 70, attempt.hintUsed, skill, conditionType) };
        saveBkt(next);
        const nowMs = Date.now();
        saveLastSessionMs(nowMs);
        setLastSessionMs(nowMs);
        return next;
      });
    }
  }, [maybeSnapshot]);

  const handleProfileSave = (newProfile) => {
    setProfile(newProfile);
    // Recalculate streak
    const touched = touchStreak(newProfile);
    setProfile(touched);
    saveProfile(touched);
  };

  const handleContentUpdate = (items) => {
    setContentItems(items);
    saveContentItems(items);
  };

  const handleFamilyUpdate = (members) => {
    setFamilyMembers(members);
    saveFamilyMembers(members);
  };

  // Purge progress entries older than the configured retention window, and
  // strip any verbatim chat content written by older app versions.
  useEffect(() => { ppaRunRetentionPurge(); ppaStripChatContent(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh backup staleness whenever the active module changes
  useEffect(() => { setAppBackupStale(ppaBackupIsStale(7)); }, [active]);
  useEffect(() => {
    const onFocus = () => setAppBackupStale(ppaBackupIsStale(7));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Touch streak on first open each day
  useEffect(() => {
    const updated = touchStreak(profile);
    if (updated.lastSessionDate !== profile.lastSessionDate || updated.streak !== profile.streak) {
      setProfile(updated);
      saveProfile(updated);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const conditionType = profile.conditionType || DEFAULT_CONDITION;
  const conditionLabel = CONDITION_PROFILES[conditionType]?.label ?? "";

  const ActiveModule = {
    therapist:        <TherapistModule sessionLog={sessionLog} addToLog={addToLog} />,
    naming:           <NamingModule addToLog={addToLog} contentItems={contentItems} />,
    memory:           <MemoryModule members={familyMembers.persons ?? []} addToLog={addToLog} />,
    assessment:       <AssessmentModule addToLog={addToLog} />,
    repetition:       <RepetitionModule addToLog={addToLog} />,
    sentence:         <SentenceModule addToLog={addToLog} conditionType={conditionType} />,
    scripts:          <ScriptsModule />,
    sentence_builder: <SentenceBuilderModule addToLog={addToLog} />,
    video:            <VideoModule addToLog={addToLog} conditionType={conditionType} />,
    progress:         <ProgressModule sessionLog={sessionLog} bkt={bkt} bktSnapshots={bktSnapshots} conditionType={conditionType} />,
    family:           <FamilyModule members={familyMembers} onUpdate={handleFamilyUpdate} />,
    content:          <ContentLibraryModule items={contentItems} onUpdate={handleContentUpdate} />,
    profile:          <ProfileModule profile={profile} onSave={handleProfileSave} />,
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
      <div style={{ background: "linear-gradient(135deg, #2D5A54 0%, #1E3D3A 100%)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: 28 }}>🌿</div>
        <div>
          <div style={{ color: "#E8F4F2", fontSize: 19, fontWeight: 700, letterSpacing: 0.5 }}>
            {profile.name ? `${profile.name}'s Therapy Suite` : "Familiar Therapy Suite"}
          </div>
          <div style={{ color: "#7BAE9F", fontSize: 12 }}>
            {conditionLabel} • AI-Assisted Language Therapy • Dr. Aria, SLP
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {profile.streak > 0 && (
            <div style={{ background: "#4E8B8030", borderRadius: 10, padding: "5px 12px", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 16 }}>🔥</span>
              <span style={{ color: "#E8B84B", fontSize: 13, fontWeight: 700 }}>{profile.streak}</span>
            </div>
          )}
          {appBackupStale && (
            <button
              onClick={() => { setAppBackupStale(false); ppaDoBackup("therapy-backup"); setTimeout(() => setAppBackupStale(ppaBackupIsStale(7)), 500); }}
              title="Backup recommended — click to download"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "#D4A84330", border: "1px solid #D4A843", borderRadius: 10, cursor: "pointer", color: "#D4A843", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
              💾 Backup
            </button>
          )}
          <div style={{ background: "#4E8B8030", borderRadius: 10, padding: "5px 12px" }}>
            <span style={{ color: "#7BAE9F", fontSize: 12 }}>Session: {sessionLog.length} activities</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", maxHeight: "calc(100vh - 66px)" }}>
        {/* Sidebar */}
        <div style={{ width: 190, background: "#FFFDF9", borderRight: "1px solid #E8E0D0", display: "flex", flexDirection: "column", padding: "10px 8px", gap: 3, overflowY: "auto", flexShrink: 0 }}>
          {TOOLS.map(tool => (
            <button key={tool.id} onClick={() => setActive(tool.id)} style={{
              padding: "10px 10px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
              background: active === tool.id ? "linear-gradient(135deg, #E8F4F2, #D4EDE9)" : "transparent",
              borderLeft: active === tool.id ? "3px solid #4E8B80" : "3px solid transparent",
              transition: "all 0.2s",
            }}>
              <div style={{ fontSize: 16 }}>{tool.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: active === tool.id ? "#2D5A54" : "#444", marginTop: 2 }}>{tool.label}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 1, lineHeight: 1.3 }}>{tool.desc}</div>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 24px", borderBottom: "1px solid #E8E0D0", background: "#FFFDF9", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{activeTool?.icon}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#2D3B36" }}>{activeTool?.label}</div>
              <div style={{ fontSize: 12, color: "#888" }}>{activeTool?.desc}</div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {ActiveModule}
          </div>
        </div>
      </div>

      {showPrivacyNotice && (
        <PrivacyNoticeModal onAccept={() => {
          localStorage.setItem(PRIVACY_NOTICE_KEY, "1");
          setShowPrivacyNotice(false);
        }} />
      )}

      {!showPrivacyNotice && showApiKeySetup && (
        <ApiKeySetupModal onDone={() => setShowApiKeySetup(false)} />
      )}
    </div>
  );
}
