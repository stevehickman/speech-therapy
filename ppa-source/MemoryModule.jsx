import { useState, useCallback } from "react";

// ── Fact pools for semantic distractors ──────────────────────────────────────
const FACT_POOLS = {
  month:    ["January","February","March","April","May","June","July","August","September","October","November","December"],
  day:      ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
  year:     Array.from({ length: 40 }, (_, i) => String(1935 + i)),
  day_num:  ["1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th","11th","12th","13th","14th","15th","16th","17th","18th","19th","20th","21st","22nd","23rd","24th","25th","26th","27th","28th","29th","30th"],
  hobby:    ["gardening","reading","knitting","painting","cooking","walking","swimming","birdwatching","crosswords","chess","golf","fishing","bowls","choir","bridge","cycling","yoga","photography","pottery","sewing","sketching","jigsaws","dancing","volunteering","woodwork"],
  colour:   ["red","blue","green","yellow","purple","orange","pink","white","black","navy","turquoise","lilac","burgundy","cream","gold","silver","brown","grey","teal","coral","maroon","olive"],
  lives_in: ["London","Manchester","Birmingham","Leeds","Edinburgh","Cardiff","Bristol","Liverpool","Sheffield","Newcastle","Glasgow","Belfast","Brighton","Cambridge","Oxford","York","Bath","Exeter","Norwich","Coventry","Leicester","Nottingham","Derby","Plymouth","Aberdeen"],
  job:      ["teacher","nurse","doctor","engineer","accountant","retired","shop assistant","farmer","bus driver","secretary","bank clerk","civil servant","factory worker","carpenter","plumber","electrician","postman","librarian","social worker","police officer","chef","mechanic","hairdresser","bricklayer","office manager","midwife"],
  food:     ["fish and chips","roast dinner","shepherd's pie","curry","pasta","soup","sandwiches","spaghetti bolognese","beans on toast","cottage pie","lasagne","pizza","stew","casserole","quiche","omelette","salad","porridge","scrambled eggs","jacket potato"],
  pet:      ["dog","cat","rabbit","budgie","goldfish","hamster","parrot","guinea pig","tortoise","canary","cockatiel","gerbil","mouse","tropical fish","pony","chicken"],
};

export const MEMORY_QUALITY_KEY = "fam_memory_quality";

function loadQuality() {
  try { const s = localStorage.getItem(MEMORY_QUALITY_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
}
function saveQuality(q) {
  try { localStorage.setItem(MEMORY_QUALITY_KEY, JSON.stringify(q)); } catch {}
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function detectFactCategory(key, value) {
  const k = (key || "").toLowerCase().replace(/[_\s\-]+/g, "");
  const v = (value || "").trim();
  const vl = v.toLowerCase();
  if (/birth|dob|born|bday/.test(k)) {
    if (/^\d{4}$/.test(v)) return "year";
    if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(v) && !/\d{1,2}(st|nd|rd|th)?/.test(v)) return "month";
    if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(v)) return "day";
    return "birthday_full";
  }
  if (/hobby|interest|pastime|enjoy|like|sport|leisure/.test(k)) return "hobby";
  if (/colou?r|shade/.test(k)) return "colour";
  if (/live|home|address|town|city|village|area|region|district|where/.test(k)) return "lives_in";
  if (/job|work|career|profession|occupation|employ|role|trade/.test(k)) return "job";
  if (/food|meal|dish|eat|favourite.*eat|favour.*food/.test(k)) return "food";
  if (/pet|animal/.test(k)) return "pet";
  if (/^\d{4}$/.test(v)) return "year";
  if (/^(january|february|march|april|may|june|july|august|september|october|november|december)$/i.test(v)) return "month";
  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(v)) return "day";
  if (FACT_POOLS.colour.includes(vl)) return "colour";
  if (FACT_POOLS.pet.includes(vl)) return "pet";
  if (FACT_POOLS.hobby.includes(vl)) return "hobby";
  if (FACT_POOLS.job.includes(vl)) return "job";
  if (FACT_POOLS.food.some(f => vl.includes(f))) return "food";
  if (FACT_POOLS.lives_in.map(l => l.toLowerCase()).includes(vl)) return "lives_in";
  return "generic";
}

function birthdayDistractors(correctValue) {
  const months  = FACT_POOLS.month;
  const dayNums = FACT_POOLS.day_num;
  const years   = Array.from({ length: 20 }, (_, i) => String(1940 + i * 2));
  const hasMonth = months.some(m => new RegExp(m, "i").test(correctValue));
  const hasYear  = /\d{4}/.test(correctValue);
  const hasDay   = /\d{1,2}(st|nd|rd|th)?/.test(correctValue);
  const currMonth = months.find(m => new RegExp(m, "i").test(correctValue)) || "";
  const otherMonths = months.filter(m => m !== currMonth);
  const out = [];
  for (let i = 0; i < 12; i++) {
    const month = otherMonths[i % otherMonths.length];
    const day   = dayNums[Math.floor(Math.random() * dayNums.length)];
    const year  = years[Math.floor(Math.random() * years.length)];
    if (hasDay && hasMonth && hasYear) out.push(`${day} ${month} ${year}`);
    else if (hasDay && hasMonth)       out.push(`${day} ${month}`);
    else if (hasMonth)                 out.push(month);
    else                               out.push(`${day} ${month}`);
  }
  return [...new Set(out)];
}

function getFactDistractors(key, correctValue, quality, count = 3) {
  const category    = detectFactCategory(key, correctValue);
  const correctLower = (correctValue || "").trim().toLowerCase();
  let plausiblePool;
  switch (category) {
    case "month":         plausiblePool = FACT_POOLS.month;    break;
    case "day":           plausiblePool = FACT_POOLS.day;      break;
    case "year":          plausiblePool = FACT_POOLS.year;     break;
    case "birthday_full": plausiblePool = birthdayDistractors(correctValue); break;
    case "hobby":         plausiblePool = FACT_POOLS.hobby;    break;
    case "colour":        plausiblePool = FACT_POOLS.colour;   break;
    case "lives_in":      plausiblePool = FACT_POOLS.lives_in; break;
    case "job":           plausiblePool = FACT_POOLS.job;      break;
    case "food":          plausiblePool = FACT_POOLS.food;     break;
    case "pet":           plausiblePool = FACT_POOLS.pet;      break;
    default:              plausiblePool = null;
  }
  const plausible = (plausiblePool || []).filter(d => d.toLowerCase() !== correctLower);
  const otherCats = ["hobby","colour","lives_in","job","food","pet","month","year"].filter(c => c !== category);
  const implausible = [];
  for (const cat of shuffle(otherCats)) {
    const pool = FACT_POOLS[cat] || [];
    const pick = shuffle(pool.filter(d => d.toLowerCase() !== correctLower))[0];
    if (pick && !implausible.includes(pick)) implausible.push(pick);
    if (implausible.length >= count) break;
  }
  let nPlausible, nImplausible;
  if (quality === null || quality === undefined) { nPlausible = count; nImplausible = 0; }
  else if (quality >= 0.65)                      { nPlausible = count; nImplausible = 0; }
  else if (quality >= 0.35)                      { nPlausible = count - 1; nImplausible = 1; }
  else { nPlausible = Math.max(1, Math.floor(count / 2)); nImplausible = count - nPlausible; }
  const picked = [
    ...shuffle(plausible).slice(0, nPlausible),
    ...shuffle(implausible).slice(0, nImplausible),
  ].slice(0, count);
  while (picked.length < count) {
    const fallback = shuffle(["long ago","somewhere nice","something special","a happy memory"])[0];
    if (!picked.includes(fallback)) picked.push(fallback);
    else break;
  }
  return picked;
}

// Build a question from a family member + one of their facts
function buildQuestion(member, factKey, factValue, quality) {
  const distractors = getFactDistractors(factKey, factValue, quality);
  const options = shuffle([factValue, ...distractors.slice(0, 3)]);
  const questionLabel = factKey.replace(/_/g, " ");
  return {
    memberId:  member.id,
    memberName: member.name,
    factKey,
    factValue,
    question: `What is ${member.name}'s ${questionLabel}?`,
    options,
    correctAnswer: factValue,
  };
}

// ── Styles ──────────────────────────────────────────────────────────────────
const card = { background: "#FFFDF9", borderRadius: 14, padding: "16px 18px", border: "1px solid #E8E0D0" };
const btn  = (bg, col = "#fff") => ({ padding: "11px 22px", background: bg, color: col, border: "none", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" });

function QuestionCard({ q, onAnswer, answered, selectedOption }) {
  const correct = selectedOption === q.correctAnswer;
  return (
    <div style={{ ...card }}>
      {/* Member info */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#E8F4F2", border: "2px solid #B0D4CE", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
          {q.memberPhoto ? (
            <img src={q.memberPhoto} alt={q.memberName} style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={e => { e.target.style.display = "none"; }} />
          ) : <span style={{ fontSize: 24 }}>👤</span>}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36" }}>{q.question}</div>
      </div>
      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {q.options.map(opt => {
          let bg = "#F5F0E8", col = "#2D3B36", border = "2px solid #E8E0D0";
          if (answered) {
            if (opt === q.correctAnswer)       { bg = "#E8F4F2"; col = "#2D5A54"; border = "2px solid #4E8B80"; }
            else if (opt === selectedOption)   { bg = "#FDE8E8"; col = "#8B2D2D"; border = "2px solid #D04040"; }
          }
          return (
            <button key={opt} onClick={() => !answered && onAnswer(opt)}
              style={{ padding: "12px 16px", borderRadius: 12, border, background: bg, color: col, cursor: answered ? "default" : "pointer", textAlign: "left", fontSize: 15, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s" }}>
              {opt}
              {answered && opt === q.correctAnswer && " ✓"}
              {answered && opt === selectedOption && opt !== q.correctAnswer && " ✗"}
            </button>
          );
        })}
      </div>
      {answered && (
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: correct ? "#E8F4F2" : "#FDE8E8", color: correct ? "#2D5A54" : "#8B2D2D", fontSize: 14, fontWeight: 600 }}>
          {correct ? "✓ Correct! Well done." : `✗ The answer is: ${q.correctAnswer}`}
        </div>
      )}
    </div>
  );
}

export default function MemoryModule({ members, addToLog }) {
  const [quality, setQuality]     = useState(loadQuality);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent]     = useState(0);
  const [answered, setAnswered]   = useState(false);
  const [selected, setSelected]   = useState(null);
  const [sessionDone, setSessionDone] = useState(false);
  const [score, setScore]         = useState({ correct: 0, total: 0 });
  const [started, setStarted]     = useState(false);

  const membersWithFacts = members.filter(m => Object.keys(m.facts).length > 0);

  const buildSession = useCallback(() => {
    if (!membersWithFacts.length) return;
    const qs = [];
    // Up to 8 questions, cycling through members + facts
    const pairs = [];
    for (const m of membersWithFacts) {
      for (const [k, v] of Object.entries(m.facts)) {
        pairs.push({ member: m, factKey: k, factValue: v });
      }
    }
    const shuffled = shuffle(pairs).slice(0, 8);
    for (const { member, factKey, factValue } of shuffled) {
      const catKey = `${member.id}:${factKey}`;
      const q      = quality[catKey];
      const qual   = q ? q.correct / Math.max(1, q.attempts) : null;
      qs.push({ ...buildQuestion(member, factKey, factValue, qual), memberPhoto: member.photo_url, categoryKey: catKey });
    }
    setQuestions(qs);
    setCurrent(0);
    setAnswered(false);
    setSelected(null);
    setSessionDone(false);
    setScore({ correct: 0, total: 0 });
    setStarted(true);
  }, [membersWithFacts, quality]);

  const handleAnswer = (opt) => {
    if (answered) return;
    const q = questions[current];
    const correct = opt === q.correctAnswer;
    setSelected(opt);
    setAnswered(true);

    // Update quality
    const qNew = { ...quality };
    const prev = qNew[q.categoryKey] || { attempts: 0, correct: 0 };
    qNew[q.categoryKey] = { attempts: prev.attempts + 1, correct: prev.correct + (correct ? 1 : 0) };
    setQuality(qNew);
    saveQuality(qNew);

    // Log
    addToLog({
      type: "memory", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      item: `${q.memberName} — ${q.factKey.replace(/_/g, " ")}`,
      result: correct ? "correct" : "error", skill: "Memory",
    });

    setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
  };

  const next = () => {
    if (current + 1 >= questions.length) {
      setSessionDone(true);
    } else {
      setCurrent(c => c + 1);
      setAnswered(false);
      setSelected(null);
    }
  };

  // No family members with facts
  if (!membersWithFacts.length) {
    return (
      <div style={{ padding: 20, maxWidth: 560, margin: "0 auto" }}>
        <div style={{ ...card, textAlign: "center", padding: 36 }}>
          <div style={{ fontSize: 36 }}>🧠</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36", marginTop: 12 }}>No facts to practise yet</div>
          <div style={{ fontSize: 14, color: "#999", marginTop: 8, lineHeight: 1.6 }}>
            Go to <strong>Family & Friends</strong> and add facts like birthday, hometown, or favourite colour for your family members. They'll appear here as memory questions.
          </div>
        </div>
      </div>
    );
  }

  // Start screen
  if (!started) {
    return (
      <div style={{ padding: 20, maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...card, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 40 }}>🧠</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#2D3B36", marginTop: 10 }}>Memory Practice</div>
          <div style={{ fontSize: 14, color: "#666", marginTop: 8, lineHeight: 1.6 }}>
            Answer questions about {membersWithFacts.length} {membersWithFacts.length === 1 ? "person" : "people"} — up to 8 questions per session.
          </div>
          <div style={{ marginTop: 20 }}>
            <button onClick={buildSession} style={{ ...btn("linear-gradient(135deg,#4E8B80,#3A7A6F)"), fontSize: 16, padding: "14px 32px" }}>
              Start Session
            </button>
          </div>
        </div>
        {/* Who's in this session */}
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", marginBottom: 10 }}>People with facts</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {membersWithFacts.map(m => (
              <div key={m.id} style={{ padding: "6px 12px", background: "#E8F4F2", borderRadius: 10, fontSize: 13, color: "#2D5A54", fontWeight: 600 }}>
                {m.name} — {Object.keys(m.facts).length} facts
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Session done
  if (sessionDone) {
    const pct = questions.length > 0 ? Math.round((score.correct / questions.length) * 100) : 0;
    return (
      <div style={{ padding: 20, maxWidth: 560, margin: "0 auto" }}>
        <div style={{ ...card, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 48 }}>{pct >= 70 ? "🌟" : pct >= 40 ? "👍" : "💪"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#2D3B36", marginTop: 12 }}>Session complete!</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#4E8B80", marginTop: 8 }}>{score.correct}/{questions.length}</div>
          <div style={{ fontSize: 15, color: "#666", marginTop: 4 }}>{pct}% correct</div>
          <div style={{ marginTop: 20, display: "flex", gap: 12, justifyContent: "center" }}>
            <button onClick={buildSession} style={{ ...btn("linear-gradient(135deg,#4E8B80,#3A7A6F)") }}>Again</button>
            <button onClick={() => setStarted(false)} style={{ ...btn("#F5F0E8", "#666") }}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[current];

  return (
    <div style={{ padding: 20, maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", flex: 1 }}>
          Question {current + 1} of {questions.length}
        </div>
        <div style={{ fontSize: 13, color: "#4E8B80" }}>{score.correct} correct</div>
      </div>
      <div style={{ height: 6, background: "#E8E0D0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "#4E8B80", borderRadius: 3, width: `${((current + (answered ? 1 : 0)) / questions.length) * 100}%`, transition: "width 0.3s" }} />
      </div>

      <QuestionCard q={q} onAnswer={handleAnswer} answered={answered} selectedOption={selected} />

      {answered && (
        <button onClick={next} style={{ ...btn("linear-gradient(135deg,#4E8B80,#3A7A6F)"), fontSize: 16, padding: "13px 0", width: "100%" }}>
          {current + 1 >= questions.length ? "Finish" : "Next →"}
        </button>
      )}
    </div>
  );
}
