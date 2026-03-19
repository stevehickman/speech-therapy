import { useState } from "react";
import { ASSESSMENT_TASKS } from "./data/assessmentTasks.js";
import { useDictionaryLookup, isImageGraphic } from "./data/dictionary.js";
import { CallAPI, ThinkingDots, Btn } from "./shared.jsx";

export default function AssessmentModule({ addToLog }) {
  const graphicLookup = useDictionaryLookup();
  const [task, setTask] = useState(null);
  const [scores, setScores] = useState({});
  const [summary, setSummary] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [pendingAI, setPendingAI] = useState(null);
  const [currentItem, setCurrentItem] = useState(0);
  const [taskScores, setTaskScores] = useState([]);

  const startTask = (t) => {
    setTask(t);
    setCurrentItem(0);
    setTaskScores([]);
    setSummary("");
  };

  const recordItem = (result) => {
    const newScores = [...taskScores, result];
    setTaskScores(newScores);
    if (currentItem + 1 < getItems().length) {
      setCurrentItem(i => i + 1);
    } else {
      const pct = Math.round((newScores.filter(x => x === "correct").length / newScores.length) * 100);
      const newAllScores = { ...scores, [task.id]: { scores: newScores, pct } };
      setScores(newAllScores);
      addToLog({ type: "assessment", task: task.name, score: pct, time: new Date().toLocaleTimeString() });
      generateSummary(newScores, task.name);
      setTask(null);
    }
  };

  const getItems = () => {
    if (!task) return [];
    return task.items || task.categories || [];
  };

  const generateSummary = (sc, taskName) => {
    setLoadingAI(true);
    const pct = Math.round((sc.filter(x => x === "correct").length / sc.length) * 100);
    setPendingAI([{ role: "user", content: `Patient completed ${taskName} assessment. Score: ${pct}%. Error distribution: ${sc.join(", ")}. Provide brief clinical interpretation and 2 specific recommendations. Keep it warm and constructive.` }]);
  };

  const currentItems = getItems();
  const currentItemData = currentItems[currentItem];

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {pendingAI && <CallAPI messages={pendingAI} onResult={t => { setSummary(t); setLoadingAI(false); setPendingAI(null); }} onError={() => { setLoadingAI(false); setPendingAI(null); }} />}

      {!task ? (
        <>
          <div style={{ background: "#F0F7F5", borderRadius: 14, padding: "14px 18px", border: "1px solid #B0D4CE" }}>
            <p style={{ margin: 0, fontSize: 15, color: "#2D5A54", lineHeight: 1.6 }}>
              <strong>Language Assessment</strong> — These brief tasks help track your language abilities over time. There are no wrong answers — just do your best.
            </p>
          </div>

          {ASSESSMENT_TASKS.map((t) => {
            const done = scores[t.id];
            return (
              <div key={t.id} style={{ background: "#FFFDF9", borderRadius: 16, padding: "20px 24px", border: "1px solid #E8E0D0", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36" }}>{t.name}</div>
                  <div style={{ fontSize: 14, color: "#888", marginTop: 4 }}>{t.desc}</div>
                  {done && <div style={{ fontSize: 14, color: done.pct >= 70 ? "#4E8B80" : "#D4A843", fontWeight: 600, marginTop: 6 }}>Last score: {done.pct}%</div>}
                </div>
                <button onClick={() => startTask(t)} style={{ padding: "10px 20px", background: "linear-gradient(135deg, #4E8B80, #3A7A6F)", color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {done ? "Retry" : "Start"}
                </button>
              </div>
            );
          })}

          {(loadingAI || summary) && (
            <div style={{ background: "#F0F7F5", borderRadius: 14, padding: "16px 20px", border: "1px solid #B0D4CE" }}>
              <div style={{ fontSize: 13, color: "#4E8B80", fontWeight: 600, marginBottom: 6 }}>🧠 Dr. Aria's Assessment Summary</div>
              {loadingAI ? <ThinkingDots /> : <div style={{ fontSize: 15, color: "#2D3B36", lineHeight: 1.7 }}>{summary}</div>}
            </div>
          )}
        </>
      ) : (
        <div style={{ background: "#FFFDF9", borderRadius: 20, padding: 32, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", border: "1px solid #E8E0D0" }}>
          <div style={{ fontSize: 13, color: "#4E8B80", fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{task.name}</div>
          <div style={{ fontSize: 13, color: "#999", marginBottom: 24 }}>Item {currentItem + 1} of {currentItems.length}</div>

          {task.id === "confrontation_naming" && currentItemData && (() => {
            const g = graphicLookup[currentItemData.word?.toLowerCase()]
              ?? currentItemData.graphic ?? currentItemData.emoji;
            return (
              <>
                {isImageGraphic(g)
                  ? <img src={g} alt="" style={{ width: 100, height: 100, objectFit: "contain", borderRadius: 16, border: "2px solid #E8E0D0" }} />
                  : <div style={{ fontSize: 80 }}>{g}</div>}
                <div style={{ fontSize: 14, color: "#999", margin: "12px 0 24px" }}>What is this called?</div>
              </>
            );
          })()}

          {(task.id === "repetition" || task.id === "sentence_repetition") && (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#2D3B36", margin: "20px 0", lineHeight: 1.4 }}>"{currentItemData}"</div>
              <div style={{ fontSize: 14, color: "#999", marginBottom: 24 }}>Repeat this back</div>
            </>
          )}

          {task.id === "category_fluency" && (
            <>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#2D3B36", margin: "20px 0" }}>
                Name as many <span style={{ color: "#4E8B80" }}>{currentItemData}</span> as you can
              </div>
              <div style={{ fontSize: 14, color: "#999", marginBottom: 24 }}>60 seconds — say them out loud</div>
            </>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Btn color="#4E8B80" onClick={() => recordItem("correct")}>✓ Successful</Btn>
            <Btn color="#D4A843" onClick={() => recordItem("partial")}>〜 Partial</Btn>
            <Btn color="#C07070" onClick={() => recordItem("error")}>✗ Difficulty</Btn>
          </div>
          <button onClick={() => setTask(null)} style={{ marginTop: 16, fontSize: 13, color: "#999", background: "none", border: "none", cursor: "pointer" }}>Cancel assessment</button>
        </div>
      )}
    </div>
  );
}
