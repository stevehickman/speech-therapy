// Verb conjugation tables and helper for the Sentence Builder
// Used by: SentenceBuilderModule.jsx

export const IRREGULAR_PAST = {
  be: "was", have: "had", go: "went", come: "came", see: "saw",
  get: "got", give: "gave", take: "took", make: "made", know: "knew", say: "said",
  tell: "told", find: "found", put: "put", sit: "sat", run: "ran", eat: "ate",
  drink: "drank", sleep: "slept", feel: "felt", keep: "kept", swim: "swam",
  drive: "drove", write: "wrote", read: "read", hear: "heard", wear: "wore",
  buy: "bought", bring: "brought", think: "thought", teach: "taught",
};

export const IRREGULAR_PAST_PARTICIPLE = {
  be: "been", have: "had", go: "gone", come: "come",
  see: "seen", get: "gotten", give: "given", take: "taken", make: "made", know: "known",
  say: "said", tell: "told", find: "found", run: "run", eat: "eaten", drink: "drunk",
  sleep: "slept", feel: "felt", keep: "kept", swim: "swum", drive: "driven",
  write: "written", read: "read", hear: "heard", wear: "worn", buy: "bought",
  bring: "brought", think: "thought", teach: "taught",
};

export function conjugateVerb(base, tense) {
  const ing = base.endsWith("e") && base !== "be" ? base.slice(0, -1) + "ing"
    : /[^aeiou][aeiou][^aeiouwy]$/.test(base) && base.length <= 5 ? base + base.slice(-1) + "ing"
    : base + "ing";
  const ed = IRREGULAR_PAST[base] || (base.endsWith("e") ? base + "d"
    : /[^aeiou][aeiou][^aeiouwy]$/.test(base) && base.length <= 4 ? base + base.slice(-1) + "ed"
    : base + "ed");
  const pp = IRREGULAR_PAST_PARTICIPLE[base] || ed;
  const s = base.endsWith("s") || base.endsWith("sh") || base.endsWith("ch") ? base + "es"
    : base.endsWith("y") && !/[aeiou]/.test(base.slice(-2, -1)) ? base.slice(0, -1) + "ies"
    : base === "be" ? "is" : base === "have" ? "has" : base + "s";
  switch (tense) {
    case "present-simple":      return s;
    case "present-progressive": return `is ${ing}`;
    case "present-perfect":     return `has ${pp}`;
    case "past-simple":         return ed;
    case "past-progressive":    return `was ${ing}`;
    case "past-perfect":        return `had ${pp}`;
    case "future-simple":       return `will ${base}`;
    case "future-progressive":  return `will be ${ing}`;
    case "conditional":         return `would ${base}`;
    default:                    return base;
  }
}
