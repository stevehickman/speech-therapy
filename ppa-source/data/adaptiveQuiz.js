// Adaptive quiz store — per-fact, per-category, global performance with temporal decay.
// Drives multiple-choice difficulty tier and hint starting level across all modules.

const AQ_KEY = "ppa_adaptive_quiz";

// Half-life in days by condition — mirrors BKT condition profiles
const HALF_LIFE_DAYS = {
  primary_progressive: 7,
  dementia: 5,
  chronic_aphasia: 14,
  acute_aphasia: 30,
  tbi: 21,
};

function load() {
  try { return JSON.parse(localStorage.getItem(AQ_KEY) || "null") ?? {}; }
  catch { return {}; }
}

function save(aq) {
  try { localStorage.setItem(AQ_KEY, JSON.stringify(aq)); } catch {}
}

function decayConf(raw, daysSince, conditionType) {
  const hl = HALF_LIFE_DAYS[conditionType] ?? 14;
  const floor = 0.25; // never below chance level
  return Math.max(floor, floor + (raw - floor) * Math.pow(2, -daysSince / hl));
}

// Record one attempt.
// factKey: unique question ID, e.g. "video::clipId::0" or "naming::word"
// category: e.g. "who", "what", "where", "naming"
// correct: boolean
// hintLevel: 0–3
// wrongOption: text of wrong option chosen (for confusion tracking)
export function aqRecord({ factKey, category, correct, hintLevel = 0, wrongOption = null }) {
  const aq = load();
  const now = Date.now();

  aq.global ??= { correct: 0, total: 0 };
  aq.global.correct += correct ? 1 : 0;
  aq.global.total += 1;
  aq.lastMs = now;

  if (category) {
    aq.categories ??= {};
    aq.categories[category] ??= { correct: 0, total: 0, lastMs: null };
    aq.categories[category].correct += correct ? 1 : 0;
    aq.categories[category].total += 1;
    aq.categories[category].lastMs = now;
  }

  if (factKey) {
    aq.facts ??= {};
    aq.facts[factKey] ??= { correct: 0, total: 0, lastMs: null, confusions: {}, sumHint: 0 };
    const f = aq.facts[factKey];
    f.correct += correct ? 1 : 0;
    f.total += 1;
    f.lastMs = now;
    f.sumHint = (f.sumHint || 0) + hintLevel;
    if (!correct && wrongOption) {
      f.confusions[wrongOption] = (f.confusions[wrongOption] || 0) + 1;
    }
  }

  save(aq);
}

function resolveConf(stats, now, conditionType) {
  if (!stats || stats.total < 2) return null;
  const daysSince = stats.lastMs ? (now - stats.lastMs) / 86_400_000 : 0;
  return decayConf(stats.correct / stats.total, daysSince, conditionType);
}

// Returns decayed confidence [0..1], or null if too little data.
// Specificity: fact (≥3) > category (≥3) > global (≥5)
export function aqGetConfidence(factKey, category, conditionType = "primary_progressive") {
  const aq = load();
  const now = Date.now();
  const factConf = resolveConf(aq.facts?.[factKey], now, conditionType);
  if (factConf !== null && (aq.facts?.[factKey]?.total ?? 0) >= 3) return factConf;
  const catConf = resolveConf(aq.categories?.[category], now, conditionType);
  if (catConf !== null && (aq.categories?.[category]?.total ?? 0) >= 3) return catConf;
  const g = aq.global;
  if (g?.total >= 5) return g.correct / g.total;
  return null;
}

// 0 = easy (user struggling — show most distinct wrong options)
// 1 = medium (default)
// 2 = hard (user thriving — show most confusable wrong options)
export function aqGetDifficultyTier(factKey, category, conditionType) {
  const conf = aqGetConfidence(factKey, category, conditionType);
  if (conf === null) return 1;
  if (conf < 0.45) return 0;
  if (conf < 0.72) return 1;
  return 2;
}

// Return the most-confused wrong-option text for a fact, or null.
// Used to prioritise which distractor to auto-eliminate at hint level 2.
export function aqMostConfused(factKey) {
  const f = load().facts?.[factKey];
  if (!f?.confusions) return null;
  const entries = Object.entries(f.confusions);
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

// Distractor difficulty tags.
// questionTags: array of per-question tag arrays, one per question in clip.
//   Each inner array has one entry per option (0=distinct, 1=plausible, 2=confusable, null=correct option)
export function aqSaveDistractorTags(clipId, questionTags) {
  const aq = load();
  aq.distractorTags ??= {};
  aq.distractorTags[clipId] = { tagged: true, lastTagMs: Date.now(), questions: questionTags };
  save(aq);
}

export function aqGetDistractorTags(clipId) {
  return load().distractorTags?.[clipId] ?? null;
}

export function aqNeedsTagging(clipId) {
  return !load().distractorTags?.[clipId]?.tagged;
}
