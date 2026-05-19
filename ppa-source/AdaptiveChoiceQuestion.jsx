// Unified adaptive multiple-choice question component.
// Used wherever the patient selects from a list of options (Video, etc.).
//
// Behaviour:
//   • Wrong pick → that option is disabled (crossed out), hint level rises
//   • Hint level 1 (after 1 wrong): shows the standard hint text
//   • Hint level 2 (after 2 wrong): shows a stronger hint + auto-eliminates one more wrong option
//   • Hint level 3 (all wrong used): correct answer revealed
//
// Cross-session adaptation via adaptiveQuiz store:
//   • Difficulty tier 0 (struggling): show correct + 1 most-distinct wrong option
//   • Difficulty tier 1 (medium):     show correct + 2 wrong options
//   • Difficulty tier 2 (thriving):   show all options (correct + 3 wrong)
//   Wrong options are ordered so the most-distinct appear first at low tiers.

import { useState, useMemo } from "react";
import { aqRecord, aqGetDifficultyTier, aqGetDistractorTags, aqMostConfused } from "./data/adaptiveQuiz.js";

const ENCOURAGEMENTS = [
  "Good try — have another look!",
  "Not quite. You can do this — try again.",
  "Take your time. Look carefully.",
  "Almost there — one more try!",
];

const STRONGER_HINTS = {
  who:   "Think carefully about the person you saw.",
  what:  "Think about the main action or activity.",
  where: "Picture the location or setting.",
};

function shuffleStable(arr, seed) {
  // Deterministic Fisher-Yates using a simple hash seed so order is stable on re-render
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Select and order options based on difficulty tier + distractor tags.
// Returns an array of { originalIdx, text, isCorrect, diff } sorted for display.
function buildDisplayOptions(question, tier, optionTags) {
  const correctEntry = {
    originalIdx: question.answer,
    text: question.options[question.answer],
    isCorrect: true,
    diff: -1,
  };

  const wrongEntries = question.options
    .map((text, i) => ({
      originalIdx: i,
      text,
      isCorrect: false,
      diff: optionTags ? (optionTags[i] ?? 1) : 1,
    }))
    .filter(o => !o.isCorrect);

  // Sort: tier 0 → distinct-first (asc), tier 2 → confusable-first (desc), tier 1 → stable
  const sorted = [...wrongEntries].sort((a, b) => {
    if (tier === 0) return a.diff - b.diff;
    if (tier === 2) return b.diff - a.diff;
    return 0;
  });

  // How many wrong options to show
  const wrongCount = tier === 0 ? 1 : tier === 1 ? 2 : 3;
  const chosen = sorted.slice(0, Math.min(wrongCount, sorted.length));

  // Stable shuffle so positions don't jump on re-render (seed from question text)
  const seed = question.question.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  return shuffleStable([correctEntry, ...chosen], seed);
}

// Props:
//   question       { question, options, answer, hint, type, icon, color }
//   factKey        unique tracking ID, e.g. "video::clipId::0"
//   category       e.g. "who" | "what" | "where" | "naming"
//   conditionType  BKT condition string, e.g. "primary_progressive"
//   clipId         clip ID for distractor tag lookup (optional)
//   onComplete     ({ correct, hintLevel }) → called when the question is resolved
export function AdaptiveChoiceQuestion({
  question,
  factKey,
  category,
  conditionType = "primary_progressive",
  clipId = null,
  questionIdx = 0,
  onComplete,
}) {
  const tier = useMemo(
    () => aqGetDifficultyTier(factKey, category, conditionType),
    [factKey, category, conditionType],
  );

  const optionTags = useMemo(() => {
    if (!clipId) return null;
    return aqGetDistractorTags(clipId)?.questions?.[questionIdx] ?? null;
  }, [clipId, questionIdx]);

  const displayOptions = useMemo(
    () => buildDisplayOptions(question, tier, optionTags),
    // Only recompute when the question itself changes (tier/tags are session-stable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question.question, question.answer],
  );

  const [wrongAttempts, setWrongAttempts] = useState(new Set()); // original indices
  const [autoEliminated, setAutoEliminated] = useState(new Set()); // original indices
  const [hintLevel, setHintLevel] = useState(0);
  const [encouragement, setEncouragement] = useState(null);
  const [resolved, setResolved] = useState(false);
  const [resolvedCorrect, setResolvedCorrect] = useState(null);

  const allDisabled = new Set([...wrongAttempts, ...autoEliminated]);

  const handleSelect = (originalIdx) => {
    if (allDisabled.has(originalIdx) || resolved) return;

    const isCorrect = originalIdx === question.answer;

    if (isCorrect) {
      aqRecord({ factKey, category, correct: true, hintLevel });
      setResolved(true);
      setResolvedCorrect(true);
      onComplete({ correct: true, hintLevel });
      return;
    }

    const newWrong = new Set([...wrongAttempts, originalIdx]);
    setWrongAttempts(newWrong);
    aqRecord({
      factKey,
      category,
      correct: false,
      hintLevel,
      wrongOption: question.options[originalIdx],
    });
    setEncouragement(ENCOURAGEMENTS[Math.min(newWrong.size - 1, ENCOURAGEMENTS.length - 1)]);

    const nextHint = Math.min(newWrong.size, 3);
    setHintLevel(nextHint);

    // At hint 2: auto-eliminate one more wrong option (the one most often confused)
    if (nextHint === 2 && autoEliminated.size === 0) {
      const mostConfusedText = aqMostConfused(factKey);
      const candidates = displayOptions
        .filter(o => !o.isCorrect && !newWrong.has(o.originalIdx))
        .map(o => o.originalIdx);
      if (candidates.length > 1) {
        // Prefer most-confused option; fall back to last candidate
        const toElim = candidates.find(
          idx => question.options[idx] === mostConfusedText
        ) ?? candidates[candidates.length - 1];
        setAutoEliminated(new Set([toElim]));
      }
    }

    // At hint 3: no more options — reveal
    const availableAfter = displayOptions.filter(
      o => !o.isCorrect && !newWrong.has(o.originalIdx) && !autoEliminated.has(o.originalIdx)
    );
    if (nextHint >= 3 || availableAfter.length === 0) {
      setResolved(true);
      setResolvedCorrect(false);
      onComplete({ correct: false, hintLevel: nextHint });
    }
  };

  const accentColor = question.color ?? "#4E8B80";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Encouragement banner */}
      {encouragement && !resolved && (
        <div style={{
          fontSize: 15, color: "#7A5AB8", fontWeight: 600,
          padding: "10px 16px", background: "#F5F0FF",
          borderRadius: 12, border: "1px solid #D5C5EE",
        }}>
          💜 {encouragement}
        </div>
      )}

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {displayOptions.map((opt) => {
          const { originalIdx, text, isCorrect } = opt;
          const isWrong = wrongAttempts.has(originalIdx);
          const isAutoElim = autoEliminated.has(originalIdx);
          const isDisabled = isWrong || isAutoElim;
          const isRevealedCorrect = resolved && isCorrect;

          let bg = "#F5F0E8", border = "#D5CFC4", color = "#2D3B36", opacity = 1;
          if (isRevealedCorrect) {
            bg = "#E8F4F2"; border = "#4E8B80"; color = "#2D5A54";
          } else if (isWrong) {
            bg = "#FDE8E8"; border = "#C07070"; color = "#7A2020"; opacity = 0.75;
          } else if (isAutoElim) {
            bg = "#F5F0E8"; border = "#D5CFC4"; color = "#bbb"; opacity = 0.5;
          }

          // Display label: A, B, C… based on position in displayOptions
          const posLabel = String.fromCharCode(65 + displayOptions.indexOf(opt));

          return (
            <button
              key={originalIdx}
              onClick={() => handleSelect(originalIdx)}
              disabled={isDisabled || (resolved && !isCorrect)}
              style={{
                padding: "14px 20px", borderRadius: 14,
                border: `2px solid ${border}`, background: bg, color,
                fontSize: 16, textAlign: "left",
                cursor: (isDisabled || resolved) ? "default" : "pointer",
                fontFamily: "inherit",
                fontWeight: isRevealedCorrect ? 700 : 400,
                transition: "all 0.18s",
                display: "flex", alignItems: "center", gap: 12,
                opacity,
              }}
              onMouseOver={e => {
                if (!isDisabled && !resolved)
                  e.currentTarget.style.background = accentColor + "18";
              }}
              onMouseOut={e => {
                if (!isDisabled && !resolved)
                  e.currentTarget.style.background = bg;
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: "50%",
                background: border + "30", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, color: border,
              }}>
                {isWrong ? "✗" : isAutoElim ? "–" : posLabel}
              </span>
              <span style={{
                textDecoration: (isWrong || isAutoElim) ? "line-through" : "none",
                flex: 1,
              }}>
                {text}
              </span>
              {isRevealedCorrect && (
                <span style={{ marginLeft: "auto", fontSize: 20 }}>✓</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hints */}
      {!resolved && hintLevel === 0 && question.hint && (
        <div style={{ fontSize: 13, color: "#aaa", fontStyle: "italic", paddingLeft: 4 }}>
          💡 {question.hint}
        </div>
      )}
      {!resolved && hintLevel === 1 && (
        <div style={{
          fontSize: 14, color: "#9B7FB8", fontWeight: 600,
          background: "#F0ECF7", borderRadius: 10, padding: "10px 14px",
        }}>
          💡 Hint: {question.hint}
        </div>
      )}
      {!resolved && hintLevel >= 2 && (
        <div style={{
          fontSize: 14, color: "#6A40A8", fontWeight: 700,
          background: "#EAE4F7", borderRadius: 10, padding: "10px 14px",
          border: "1px solid #C8BAE8",
        }}>
          💡 {STRONGER_HINTS[category] ?? question.hint}
          {autoEliminated.size > 0 && " — one option has been removed to help."}
        </div>
      )}

      {/* Result banner */}
      {resolved && (
        <div style={{
          fontSize: 15, fontWeight: 700,
          color: resolvedCorrect ? "#2D5A54" : "#7A2020",
          background: resolvedCorrect ? "#E8F4F2" : "#FDE8E8",
          borderRadius: 10, padding: "10px 16px",
          border: `1px solid ${resolvedCorrect ? "#B0D4CE" : "#F0B0B0"}`,
        }}>
          {resolvedCorrect
            ? "✓ That's right!"
            : `The answer was: "${question.options[question.answer]}"`}
        </div>
      )}
    </div>
  );
}
