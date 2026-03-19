import { useState, useEffect } from "react";
import { ppaBackupIsStale, BackupRestorePanel } from "./ExportImportSystem.jsx";
import { AdminPinEntry } from "./AdminPinEntry.jsx";
import { CallAPI, ThinkingDots } from "./shared.jsx";

// ── Progress persistence helpers ─────────────────────────────────────────────
export const PROGRESS_SETTINGS_KEY = "ppa_progress_settings";
export const DEFAULT_PROGRESS_SETTINGS = {
  defaultPeriod: "7days",
  emailAddress: "",
  moduleDetail: {
    therapist: "summary", naming: "detailed", assessment: "detailed",
    repetition: "detailed", sentence: "summary", scripts: "summary",
    sentence_builder: "none", video: "summary",
  },
};
export const MODULE_LABELS = {
  therapist: "AI Therapist", naming: "Naming Practice", assessment: "Assessment",
  repetition: "Repetition", sentence: "Sentence Work", scripts: "Script Training",
  sentence_builder: "Sentence Builder", video: "Video Questions",
};
export const PERIOD_OPTIONS = [
  { value: "7days", label: "Last 7 days" }, { value: "14days", label: "Last 14 days" },
  { value: "30days", label: "Last 30 days" }, { value: "90days", label: "Last 90 days" },
];

export function getPeriodDates(period) {
  const end = new Date(); const start = new Date();
  const d = { "7days": 6, "14days": 13, "30days": 29, "90days": 89 }[period] ?? 6;
  start.setDate(start.getDate() - d);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function getStoredDays(startDate, endDate) {
  const days = []; const cur = new Date(startDate + "T00:00:00");
  const fin = new Date(endDate + "T00:00:00");
  while (cur <= fin) {
    const ds = cur.toISOString().slice(0, 10);
    try {
      const s = localStorage.getItem(`ppa_progress_${ds}`);
      if (s) { const e = JSON.parse(s); if (e.length) days.push({ date: ds, entries: e }); }
    } catch {}
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function computeModuleStats(entries) {
  const stats = {};
  for (const e of entries) {
    const m = e.type;
    if (!stats[m]) stats[m] = { count: 0, correct: 0, partial: 0, errors: 0, items: [] };
    stats[m].count++;
    const r = (e.result || "").toLowerCase();
    if (["correct", "correct_no_cue"].includes(r)) stats[m].correct++;
    else if (["partial", "correct_semantic", "correct_phonemic"].includes(r)) stats[m].partial++;
    else if (["error", "difficulty"].includes(r)) stats[m].errors++;
    stats[m].items.push(e);
  }
  return stats;
}

export function buildReportPrompt(days, settings) {
  if (!days.length) return null;
  const first = days[0]; const last = days[days.length - 1];
  const allEntries = days.flatMap(d => d.entries);

  const fmtStats = (stats) => Object.entries(stats).map(([mod, s]) => {
    const det = (settings.moduleDetail || {})[mod] || "summary";
    if (det === "none") return null;
    const label = MODULE_LABELS[mod] || mod;
    const acc = s.correct + s.partial;
    let str = `  ${label}: ${s.count} activities`;
    if (s.correct + s.partial + s.errors > 0) str += `, ${acc}/${s.count} successful (${Math.round(acc / s.count * 100)}%)`;
    if (s.errors) str += `, ${s.errors} errors`;
    if (det === "detailed" && s.items.length) {
      const ex = s.items.slice(0, 6).map(it => {
        let d = it.word || it.item || (it.content || "").slice(0, 35) || it.task || "";
        if (it.result) d += ` [${it.result}]`;
        return d;
      }).filter(Boolean);
      if (ex.length) str += `\n    Items: ${ex.join("; ")}`;
    }
    return str;
  }).filter(Boolean).join("\n");

  return `You are Dr. Aria, SLP specialising in Primary Progressive Aphasia. Generate a formal clinical progress report.

PATIENT PROGRESS REPORT
Period: ${first.date} to ${last.date} | Active days: ${days.length}

STARTING STATUS (${first.date}):
${fmtStats(computeModuleStats(first.entries)) || "  No data"}

PERIOD ACTIVITY (${days.length} session days, ${allEntries.length} total activities):
${days.map(d => {
  const ms = computeModuleStats(d.entries);
  const mods = Object.keys(ms).map(m => MODULE_LABELS[m] || m).join(", ");
  return `  ${d.date}: ${d.entries.length} activities — ${mods}`;
}).join("\n")}

Period aggregate by module:
${fmtStats(computeModuleStats(allEntries)) || "  No data"}

ENDING STATUS (${last.date}):
${fmtStats(computeModuleStats(last.entries)) || "  No data"}

Write a structured clinical progress report with these sections:
1. EXECUTIVE SUMMARY (2-3 sentences capturing the key story)
2. STARTING STATUS — clinical interpretation of performance at the start of this period
3. PERIOD ACTIVITY — strengths, challenges, trends, consistency, and notable observations
4. ENDING STATUS — performance at period end vs start, any measurable change
5. RECOMMENDATIONS — 4-5 specific, actionable recommendations for the next therapy period

Tone: professional and clinical yet readable by family/caregivers. Use plain English. Be compassionate.`;
}

export default function ProgressModule({ sessionLog }) {
  const TODAY = new Date().toISOString().slice(0, 10);

  const loadSettings = () => {
    try {
      const s = localStorage.getItem(PROGRESS_SETTINGS_KEY);
      if (!s) return { ...DEFAULT_PROGRESS_SETTINGS, moduleDetail: { ...DEFAULT_PROGRESS_SETTINGS.moduleDetail } };
      const saved = JSON.parse(s);
      return { ...DEFAULT_PROGRESS_SETTINGS, ...saved, moduleDetail: { ...DEFAULT_PROGRESS_SETTINGS.moduleDetail, ...(saved.moduleDetail || {}) } };
    } catch { return { ...DEFAULT_PROGRESS_SETTINGS, moduleDetail: { ...DEFAULT_PROGRESS_SETTINGS.moduleDetail } }; }
  };

  const [settings, setSettings] = useState(loadSettings);
  const saveSettings = (ns) => { setSettings(ns); try { localStorage.setItem(PROGRESS_SETTINGS_KEY, JSON.stringify(ns)); } catch {} };

  const [view, setView] = useState("dashboard");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [backupStale, setBackupStale]   = useState(() => ppaBackupIsStale(7));

  // Report state
  const [reportRange, setReportRange] = useState(() => getPeriodDates(loadSettings().defaultPeriod || "7days"));
  const [generatedReport, setGeneratedReport] = useState("");
  const [loadingReport, setLoadingReport] = useState(false);
  const [pendingReport, setPendingReport] = useState(null);
  const [copied, setCopied] = useState(false);

  // Admin working copy
  const [editSettings, setEditSettings] = useState(null);
  const [clearStep, setClearStep] = useState(null); // null | 'today' | 'range' | 'all'
  const [clearRange, setClearRange] = useState({ start: TODAY, end: TODAY });

  // Today's grouped stats
  const grouped = sessionLog.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {});

  // Historical snapshot: count past active days in last 30 days
  const recentDays = (() => {
    const d = []; const cur = new Date();
    for (let i = 1; i <= 30; i++) {
      const dt = new Date(cur); dt.setDate(cur.getDate() - i);
      const ds = dt.toISOString().slice(0, 10);
      try {
        const s = localStorage.getItem(`ppa_progress_${ds}`);
        if (s) { const e = JSON.parse(s); if (e.length) d.push(ds); }
      } catch {}
    }
    return d;
  })();

  const generateReport = () => {
    const days = getStoredDays(reportRange.start, reportRange.end);
    const prompt = buildReportPrompt(days, settings);
    if (!prompt) { setGeneratedReport("No activity data found for the selected period."); return; }
    setLoadingReport(true); setGeneratedReport("");
    setPendingReport([{ role: "user", content: prompt }]);
  };

  const copyReport = () => {
    navigator.clipboard.writeText(generatedReport).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const emailReport = () => {
    const addr = settings.emailAddress || "";
    const subj = encodeURIComponent(`PPA Progress Report ${reportRange.start} to ${reportRange.end}`);
    const body = encodeURIComponent(generatedReport.slice(0, 1800) + (generatedReport.length > 1800 ? "\n\n[Report truncated — please see full copy]" : ""));
    window.open(`mailto:${addr}?subject=${subj}&body=${body}`);
  };

  const doClear = () => {
    if (clearStep === "today") {
      localStorage.removeItem(`ppa_progress_${TODAY}`);
    } else if (clearStep === "range") {
      const days = getStoredDays(clearRange.start, clearRange.end);
      days.forEach(d => localStorage.removeItem(`ppa_progress_${d.date}`));
    } else if (clearStep === "all") {
      Object.keys(localStorage).filter(k => /^ppa_progress_\d{4}-\d{2}-\d{2}$/.test(k)).forEach(k => localStorage.removeItem(k));
    }
    setClearStep(null);
    window.location.reload();
  };

  // ── Card style helpers ────────────────────────────────────────────────────
  const card = { background: "#FFFDF9", borderRadius: 16, padding: "18px 20px", border: "1px solid #E8E0D0" };
  const btn = (bg, color = "#fff") => ({ padding: "11px 22px", background: bg, color, border: "none", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" });
  const inp = { padding: "9px 12px", borderRadius: 9, border: "2px solid #D5CFC4", fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

  // ── REPORT VIEW ───────────────────────────────────────────────────────────
  if (view === "report") {
    return (
      <div style={{ padding: 20, maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {pendingReport && (
          <CallAPI messages={pendingReport}
            onResult={t => { setGeneratedReport(t); setLoadingReport(false); setPendingReport(null); }}
            onError={() => { setGeneratedReport("Error generating report. Please try again."); setLoadingReport(false); setPendingReport(null); }} />
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("dashboard")} style={{ ...btn("#F5F0E8", "#2D3B36"), padding: "8px 14px" }}>← Back</button>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36", flex: 1 }}>📋 Progress Report</div>
          <button onClick={() => { setEditSettings({ ...settings }); setAdminUnlocked(adminUnlocked); setView("admin"); }}
            style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid #D5CFC4", background: "#FFFDF9", cursor: "pointer", fontSize: 15, color: "#888" }}>
            {"⚙️"}
          </button>
        </div>

        {/* Date range picker */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", marginBottom: 12 }}>Select Reporting Period</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {PERIOD_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setReportRange(getPeriodDates(o.value))}
                style={{ padding: "7px 14px", borderRadius: 20, border: "2px solid", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  borderColor: reportRange.start === getPeriodDates(o.value).start ? "#4E8B80" : "#D5CFC4",
                  background: reportRange.start === getPeriodDates(o.value).start ? "#E8F4F2" : "#FFFDF9",
                  color: reportRange.start === getPeriodDates(o.value).start ? "#2D5A54" : "#666" }}>
                {o.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>From</label>
              <input type="date" value={reportRange.start} max={reportRange.end}
                onChange={e => setReportRange(r => ({ ...r, start: e.target.value }))} style={inp} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>To</label>
              <input type="date" value={reportRange.end} min={reportRange.start} max={TODAY}
                onChange={e => setReportRange(r => ({ ...r, end: e.target.value }))} style={inp} />
            </div>
            <div style={{ alignSelf: "flex-end" }}>
              <button onClick={generateReport} disabled={loadingReport}
                style={{ ...btn(loadingReport ? "#C5BEB4" : "linear-gradient(135deg, #4E8B80, #3A7A6F)"), padding: "10px 20px" }}>
                {loadingReport ? "Generating…" : "Generate Report"}
              </button>
            </div>
          </div>
        </div>

        {/* Report output */}
        {(loadingReport || generatedReport) && (
          <div style={{ ...card, border: "1px solid #B0D4CE" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#4E8B80", marginBottom: 10 }}>📄 Report by Dr. Aria</div>
            {loadingReport ? <ThinkingDots /> : (
              <>
                <div style={{ fontSize: 14, color: "#2D3B36", lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 400, overflowY: "auto" }}>{generatedReport}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <button onClick={copyReport} style={{ ...btn(copied ? "#4E8B80" : "#E8F4F2", copied ? "#fff" : "#2D5A54"), padding: "8px 16px" }}>
                    {copied ? "✓ Copied!" : "📋 Copy"}
                  </button>
                  <button onClick={emailReport} style={{ ...btn("#E8F4F2", "#2D5A54"), padding: "8px 16px" }}>
                    ✉️ {settings.emailAddress ? `Email to ${settings.emailAddress}` : "Email Report"}
                  </button>
                  <button onClick={generateReport} style={{ ...btn("#F5F0E8", "#666"), padding: "8px 16px" }}>
                    🔄 Regenerate
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── ADMIN VIEW ────────────────────────────────────────────────────────────
  if (view === "admin") {
    if (!adminUnlocked) {
      return (
        <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
          <AdminPinEntry
            onSuccess={() => { setAdminUnlocked(true); setEditSettings({ ...settings }); }}
            onCancel={() => setView("dashboard")} />
        </div>
      );
    }

    const es = editSettings || settings;
    const setES = (fn) => setEditSettings(prev => fn(prev || settings));

    return (
      <div style={{ padding: 20, maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#2D3B36", borderRadius: 14, padding: "14px 18px" }}>
          <span style={{ fontSize: 20 }}>{"⚙️"}</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#E8F4F2", flex: 1 }}>Progress Settings</span>
          <button onClick={() => setView("dashboard")} style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid #4E8B80", background: "transparent", color: "#7BAE9F", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
            ✕ Close
          </button>
        </div>

        {/* ── Section: Default Reporting Period ── */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", marginBottom: 12 }}>📅 Default Reporting Period</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PERIOD_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setES(prev => ({ ...prev, defaultPeriod: o.value }))}
                style={{ padding: "8px 16px", borderRadius: 20, border: "2px solid", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  borderColor: es.defaultPeriod === o.value ? "#4E8B80" : "#D5CFC4",
                  background: es.defaultPeriod === o.value ? "#E8F4F2" : "#FFFDF9",
                  color: es.defaultPeriod === o.value ? "#2D5A54" : "#666" }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Section: Email Address ── */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", marginBottom: 10 }}>📧 Report Email Address</div>
          <input type="email" value={es.emailAddress || ""} onChange={e => setES(prev => ({ ...prev, emailAddress: e.target.value }))}
            placeholder="therapist@clinic.com" style={inp} />
          <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>Reports will pre-fill this address in the email client.</div>
        </div>

        {/* ── Section: Per-module detail level ── */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", marginBottom: 12 }}>📊 Report Detail Level (per module)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(MODULE_LABELS).map(([mod, label]) => (
              <div key={mod} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F9F6EF", borderRadius: 10 }}>
                <span style={{ flex: 1, fontSize: 14, color: "#2D3B36", fontWeight: 600 }}>{label}</span>
                {["none", "summary", "detailed"].map(level => (
                  <button key={level} onClick={() => setES(prev => ({ ...prev, moduleDetail: { ...prev.moduleDetail, [mod]: level } }))}
                    style={{ padding: "5px 12px", borderRadius: 20, border: "2px solid", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
                      borderColor: (es.moduleDetail || {})[mod] === level ? "#4E8B80" : "#D5CFC4",
                      background: (es.moduleDetail || {})[mod] === level ? "#E8F4F2" : "#FFFDF9",
                      color: (es.moduleDetail || {})[mod] === level ? "#2D5A54" : "#888" }}>
                    {level}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
        <button onClick={() => { saveSettings(es); setView("dashboard"); }}
          style={{ ...btn("linear-gradient(135deg, #4E8B80, #3A7A6F)"), padding: "13px 24px", fontSize: 15 }}>
          ✓ Save Settings
        </button>

        {/* ── Section: Backup & Restore ── */}
        <div style={{ ...card, border: "1px solid #B0D4CE" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D5A54", marginBottom: 12 }}>💾 Backup &amp; Restore</div>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 14, lineHeight: 1.6 }}>
            localStorage is erased whenever the app is updated or redeployed. Download a backup before
            updating, then restore it immediately after to recover all your data.
          </div>
          <BackupRestorePanel onBackupDone={() => setBackupStale(ppaBackupIsStale(7))} />
        </div>

        {/* ── Section: Clear / Reset Progress ── */}
        <div style={{ ...card, border: "1px solid #F0C0B0" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#8B2D2D", marginBottom: 12 }}>🗑️ Clear Progress Data</div>
          {clearStep === null && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setClearStep("today")}
                style={{ ...btn("#FDE8E8", "#8B2D2D"), border: "2px solid #F0A0A0" }}>
                Clear Today
              </button>
              <button onClick={() => { setClearStep("range"); setClearRange({ start: TODAY, end: TODAY }); }}
                style={{ ...btn("#FDE8E8", "#8B2D2D"), border: "2px solid #F0A0A0" }}>
                Clear Date Range
              </button>
              <button onClick={() => setClearStep("all")}
                style={{ ...btn("#FDE8E8", "#8B2D2D"), border: "2px solid #F0A0A0" }}>
                Clear All History
              </button>
            </div>
          )}
          {clearStep === "today" && (
            <div style={{ background: "#FFF5F5", borderRadius: 10, padding: 14, border: "2px solid #F0A0A0" }}>
              <div style={{ fontSize: 14, color: "#8B2D2D", marginBottom: 10 }}>⚠️ Delete all progress data for today ({TODAY})? This cannot be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={doClear} style={{ ...btn("#C07070"), padding: "8px 16px" }}>Yes, Delete</button>
                <button onClick={() => setClearStep(null)} style={{ ...btn("#F5F0E8", "#2D3B36"), padding: "8px 16px" }}>Cancel</button>
              </div>
            </div>
          )}
          {clearStep === "range" && (
            <div style={{ background: "#FFF5F5", borderRadius: 10, padding: 14, border: "2px solid #F0A0A0" }}>
              <div style={{ fontSize: 14, color: "#8B2D2D", marginBottom: 10 }}>Select date range to clear:</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 3 }}>From</label>
                  <input type="date" value={clearRange.start} max={clearRange.end} onChange={e => setClearRange(r => ({ ...r, start: e.target.value }))} style={inp} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 3 }}>To</label>
                  <input type="date" value={clearRange.end} min={clearRange.start} max={TODAY} onChange={e => setClearRange(r => ({ ...r, end: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={doClear} style={{ ...btn("#C07070"), padding: "8px 16px" }}>Yes, Delete Range</button>
                <button onClick={() => setClearStep(null)} style={{ ...btn("#F5F0E8", "#2D3B36"), padding: "8px 16px" }}>Cancel</button>
              </div>
            </div>
          )}
          {clearStep === "all" && (
            <div style={{ background: "#FFF5F5", borderRadius: 10, padding: 14, border: "2px solid #C07070" }}>
              <div style={{ fontSize: 14, color: "#8B2D2D", fontWeight: 700, marginBottom: 6 }}>⚠️ Delete ALL historical progress data?</div>
              <div style={{ fontSize: 13, color: "#8B2D2D", marginBottom: 10 }}>This will permanently erase every session from every day. This cannot be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={doClear} style={{ ...btn("#8B2D2D"), padding: "8px 16px" }}>Yes, Delete Everything</button>
                <button onClick={() => setClearStep(null)} style={{ ...btn("#F5F0E8", "#2D3B36"), padding: "8px 16px" }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── DASHBOARD VIEW ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "16px 20px", maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36", flex: 1 }}>📈 Progress</div>
        <button onClick={() => setView("report")}
          style={{ ...btn("linear-gradient(135deg, #4E8B80, #3A7A6F)"), padding: "9px 18px" }}>
          📋 Generate Report
        </button>
        <button onClick={() => { setEditSettings(null); setBackupStale(ppaBackupIsStale(7)); setView("admin"); }}
          title={backupStale ? "Settings (backup recommended)" : "Settings"}
          style={{ position: "relative", width: 34, height: 34, borderRadius: "50%", border: `2px solid ${backupStale ? "#D4A843" : "#D5CFC4"}`, background: "#FFFDF9", cursor: "pointer", fontSize: 15, color: "#888" }}>
          {"⚙️"}
          {backupStale && (
            <span style={{ position: "absolute", top: -3, right: -3, width: 10, height: 10,
              borderRadius: "50%", background: "#D4A843", border: "2px solid #FFFDF9" }} />
          )}
        </button>
      </div>

      {/* Today's activity */}
      <div style={{ ...card }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#2D3B36", marginBottom: 12 }}>Today — {TODAY}</div>
        {sessionLog.length === 0 ? (
          <div style={{ color: "#999", fontSize: 14 }}>No activity recorded yet today. Complete some exercises to see your progress.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              {Object.entries(grouped).map(([type, count]) => (
                <div key={type} style={{ padding: "10px 14px", background: "#E8F4F2", borderRadius: 10, textAlign: "center", minWidth: 70 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#4E8B80" }}>{count}</div>
                  <div style={{ fontSize: 11, color: "#666", textTransform: "capitalize" }}>{MODULE_LABELS[type] || type}</div>
                </div>
              ))}
              <div style={{ padding: "10px 14px", background: "#F0ECF7", borderRadius: 10, textAlign: "center", minWidth: 70 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#9B7FB8" }}>{sessionLog.length}</div>
                <div style={{ fontSize: 11, color: "#666" }}>Total</div>
              </div>
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
              {sessionLog.slice().reverse().slice(0, 15).map((e, i) => (
                <div key={i} style={{ fontSize: 13, color: "#666", padding: "6px 12px", background: "#F5F0E8", borderRadius: 8, display: "flex", gap: 10 }}>
                  <span style={{ color: "#999", flexShrink: 0 }}>{e.time}</span>
                  <span style={{ textTransform: "capitalize", color: "#4E8B80", fontWeight: 600, flexShrink: 0 }}>{MODULE_LABELS[e.type] || e.type}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.word || e.item || (e.content || "").slice(0, 40) || e.task || ""}
                    {e.result ? ` → ${e.result}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Recent history summary */}
      <div style={{ ...card }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#2D3B36", marginBottom: 10 }}>
          History — Last 30 Days
        </div>
        {recentDays.length === 0 ? (
          <div style={{ color: "#999", fontSize: 14 }}>No previous sessions found. Progress will be tracked automatically.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ padding: "8px 14px", background: "#E8F4F2", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#4E8B80" }}>{recentDays.length}</div>
                <div style={{ fontSize: 11, color: "#666" }}>Active Days</div>
              </div>
              <div style={{ padding: "8px 14px", background: "#F0ECF7", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#9B7FB8" }}>
                  {recentDays.reduce((sum, ds) => {
                    try { const s = localStorage.getItem(`ppa_progress_${ds}`); return sum + (s ? JSON.parse(s).length : 0); } catch { return sum; }
                  }, 0)}
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>Total Activities</div>
              </div>
            </div>
            {/* Mini calendar heatmap */}
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {Array.from({ length: 30 }, (_, i) => {
                const dt = new Date(); dt.setDate(dt.getDate() - (29 - i));
                const ds = dt.toISOString().slice(0, 10);
                const active = recentDays.includes(ds) || ds === TODAY;
                const isToday = ds === TODAY;
                let count = 0;
                try { const s = localStorage.getItem(`ppa_progress_${ds}`); if (s) count = JSON.parse(s).length; } catch {}
                return (
                  <div key={ds} title={`${ds}${count ? `: ${count} activities` : ""}`}
                    style={{ width: 16, height: 16, borderRadius: 3,
                      background: isToday && count > 0 ? "#2D5A54" : isToday ? "#7BAE9F" : active ? (count > 10 ? "#2D5A54" : count > 5 ? "#4E8B80" : "#B0D4CE") : "#E8E0D0",
                      outline: isToday ? "2px solid #4E8B80" : "none", outlineOffset: 1 }} />
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>Each square = one day. Darker = more activity. Outlined = today.</div>
          </>
        )}
      </div>

      {/* PPA tips */}
      <div style={{ background: "#FFF8E8", borderRadius: 14, padding: "14px 18px", border: "1px solid #F0E0A0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7A5A10", marginBottom: 6 }}>💡 PPA Communication Tips</div>
        {["Reduce background noise during conversation.", "Use written words alongside speech.", "Give extra time — never rush responses.", "Gestures and pointing are valid communication.", "Fatigue is real — keep sessions short (20–30 min).", "Emotional content is often better preserved."].map((tip, i, a) => (
          <div key={i} style={{ fontSize: 13, color: "#5A4A1A", padding: "4px 0", borderBottom: i < a.length - 1 ? "1px solid #F0E0A0" : "none", display: "flex", gap: 8 }}>
            <span>•</span><span>{tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
