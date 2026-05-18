// BKT v2 — Bayesian Knowledge Tracing with progressive-condition support.
// Condition-aware time decay, p_regress for progressive conditions,
// and linear-regression trajectory detection.
// Ported from Familiar patient-app v1.1.

export const BKT_PARAMS = {
  Naming:    { p_known0:0.30, p_learn:0.12, p_guess:0.25, p_slip:0.08 },
  Memory:    { p_known0:0.20, p_learn:0.10, p_guess:0.20, p_slip:0.10 },
  Speaking:  { p_known0:0.25, p_learn:0.11, p_guess:0.20, p_slip:0.09 },
  Reading:   { p_known0:0.30, p_learn:0.13, p_guess:0.25, p_slip:0.08 },
  Spelling:  { p_known0:0.20, p_learn:0.09, p_guess:0.15, p_slip:0.10 },
  Math:      { p_known0:0.35, p_learn:0.12, p_guess:0.25, p_slip:0.08 },
  Reasoning: { p_known0:0.20, p_learn:0.10, p_guess:0.20, p_slip:0.10 },
};

export const CONDITION_PROFILES = {
  acute_aphasia:       { label:"Acute aphasia",             p_regress:0,     half_life_days:30, trajectory_window:5, alert_decline_threshold:-0.05 },
  chronic_aphasia:     { label:"Chronic aphasia",           p_regress:0.005, half_life_days:14, trajectory_window:5, alert_decline_threshold:-0.04 },
  primary_progressive: { label:"Primary progressive (PPA)", p_regress:0.015, half_life_days:7,  trajectory_window:4, alert_decline_threshold:-0.03 },
  tbi:                 { label:"Traumatic brain injury",    p_regress:0,     half_life_days:21, trajectory_window:5, alert_decline_threshold:-0.05 },
  dementia:            { label:"Dementia",                  p_regress:0.025, half_life_days:5,  trajectory_window:4, alert_decline_threshold:-0.02 },
};

export const DEFAULT_CONDITION = "primary_progressive";

export function bktInitialState() {
  return Object.fromEntries(Object.entries(BKT_PARAMS).map(([s, p]) => [s, p.p_known0]));
}

export function applyTimeDecay(knowledge, elapsedDays, skill, conditionType) {
  const profile = CONDITION_PROFILES[conditionType] ?? CONDITION_PROFILES[DEFAULT_CONDITION];
  const params  = BKT_PARAMS[skill];
  if (!params) return knowledge;
  const floor  = params.p_known0;
  const factor = elapsedDays > 0 ? Math.pow(2, -elapsedDays / profile.half_life_days) : 1;
  return Math.max(floor, Math.min(1, floor + (knowledge - floor) * factor));
}

export function bktUpdate(prior, correct, hintUsed, skill, conditionType = DEFAULT_CONDITION) {
  const { p_learn, p_guess, p_slip } = BKT_PARAMS[skill] ?? BKT_PARAMS.Naming;
  const { p_regress } = CONDITION_PROFILES[conditionType] ?? CONDITION_PROFILES[DEFAULT_CONDITION];
  let pEv;
  if (!hintUsed) {
    if (correct) {
      const n = prior * (1 - p_slip), d = n + (1 - prior) * p_guess;
      pEv = d > 0 ? n / d : prior;
    } else {
      const n = prior * p_slip, d = n + (1 - prior) * (1 - p_guess);
      pEv = d > 0 ? n / d : prior;
    }
  } else {
    const pKc = (prior * (1 - p_slip)) / Math.max(1e-9, prior * (1 - p_slip) + (1 - prior) * p_guess);
    const pKw = (prior * p_slip) / Math.max(1e-9, prior * p_slip + (1 - prior) * (1 - p_guess));
    pEv = correct ? 0.60 * pKc + 0.40 * pKw : 0.40 * pKc + 0.60 * pKw;
  }
  let updated = pEv + (1 - pEv) * p_learn;
  if (p_regress > 0) updated = updated * (1 - p_regress);
  return Math.max(0, Math.min(1, updated));
}

// Apply a full session: time-decay first, then per-attempt updates.
// attempts: [{ skill, score (0-100), hintUsed }]
export function bktApplySession(bktState, attempts, conditionType, lastSessionMs, nowMs = Date.now()) {
  let next = { ...bktState };
  if (lastSessionMs != null) {
    const days = Math.max(0, nowMs - lastSessionMs) / 86_400_000;
    for (const skill of Object.keys(BKT_PARAMS)) {
      if (next[skill] != null) next[skill] = applyTimeDecay(next[skill], days, skill, conditionType);
    }
  }
  for (const att of attempts) {
    const skill = att.skill;
    if (!skill || !(skill in BKT_PARAMS)) continue;
    const prior = next[skill] ?? BKT_PARAMS[skill].p_known0;
    next[skill] = bktUpdate(prior, att.score >= 70, att.hintUsed ?? false, skill, conditionType);
  }
  return next;
}

export function bktSnapshotFromSession(bktState, nowMs = Date.now()) {
  return Object.fromEntries(
    Object.entries(bktState)
      .filter(([s]) => s in BKT_PARAMS)
      .map(([s, k]) => [s, { knowledge: k, timestamp_ms: nowMs }])
  );
}

export function bktTrajectory(snapshots, conditionType = DEFAULT_CONDITION) {
  const profile = CONDITION_PROFILES[conditionType] ?? CONDITION_PROFILES[DEFAULT_CONDITION];
  const recent  = (snapshots || []).slice(-profile.trajectory_window);
  if (recent.length < 2) return { trend: "insufficient_data", slope: 0, slopePerSession: 0, alertFlag: false, n: recent.length };
  const t0 = recent[0].timestamp_ms;
  const xs = recent.map(s => (s.timestamp_ms - t0) / 86_400_000);
  const ys = recent.map(s => s.knowledge);
  const n = recent.length;
  const xm = xs.reduce((a, b) => a + b, 0) / n;
  const ym = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((a, x, i) => a + (x - xm) * (ys[i] - ym), 0);
  const den = xs.reduce((a, x) => a + (x - xm) ** 2, 0);
  const slope = den > 0 ? num / den : 0;
  const sps   = slope * (xs.at(-1) / Math.max(1, n - 1));
  return {
    trend: sps > 0.02 ? "improving" : sps < -0.02 ? "declining" : "stable",
    slope, slopePerSession: sps,
    alertFlag: sps < profile.alert_decline_threshold,
    n,
  };
}

export function bktAllTrajectories(skillSnapshots, conditionType = DEFAULT_CONDITION) {
  return Object.fromEntries(
    Object.keys(BKT_PARAMS).map(skill => [skill, bktTrajectory(skillSnapshots[skill] || [], conditionType)])
  );
}

// Map speech-therapy module activity types → BKT skills
export const ACTIVITY_SKILL_MAP = {
  naming:           "Naming",
  memory:           "Memory",
  repetition:       "Speaking",
  sentence:         "Reading",
  sentence_builder: "Speaking",
  scripts:          "Speaking",
  assessment:       "Naming",
  video:            "Reasoning",
  therapist:        "Speaking",
};

// Derive a BKT attempt from a session log entry
export function logEntryToAttempt(entry) {
  const skill = ACTIVITY_SKILL_MAP[entry.type];
  if (!skill) return null;
  const result = (entry.result || "").toLowerCase();
  let score;
  if (["correct", "correct_no_cue"].includes(result)) score = 100;
  else if (["correct_semantic", "correct_phonemic", "space_cued"].includes(result)) score = 60;
  else if (result === "partial") score = 50;
  else if (["error", "difficulty"].includes(result)) score = 20;
  else return null;
  const hintUsed = ["correct_semantic", "correct_phonemic", "space_cued"].includes(result);
  return { skill, score, hintUsed };
}
