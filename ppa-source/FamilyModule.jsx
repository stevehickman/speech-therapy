import { useState } from "react";

export const FAMILY_KEY = "fam_family_members";

export const RELATION_TYPES = [
  "grandparent", "parent", "sibling", "partner", "child", "grandchild",
  "aunt_uncle", "cousin", "friend", "carer", "other",
];

export const PRESET_FACT_KEYS = [
  "birthday", "lives_in", "job", "favourite_colour", "favourite_food",
  "pet", "hobby", "favourite_sport", "where_met", "middle_name",
];

const GENERATION = {
  grandparent: 0, parent: 1, aunt_uncle: 1,
  sibling: 2, partner: 2, cousin: 2, friend: 2, carer: 2, other: 2,
  child: 3, grandchild: 4,
};

export function loadFamilyMembers() {
  try { const s = localStorage.getItem(FAMILY_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
export function saveFamilyMembers(members) {
  try { localStorage.setItem(FAMILY_KEY, JSON.stringify(members)); } catch {}
}

function newMember() {
  return {
    id: `fam-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "", relation_type: "parent", photo_url: "", facts: {},
  };
}

// Build positions for the SVG family tree
function buildTreeLayout(members) {
  const byGen = {};
  for (const m of members) {
    const g = GENERATION[m.relation_type] ?? 2;
    if (!byGen[g]) byGen[g] = [];
    byGen[g].push(m);
  }
  const NODE_W = 90, NODE_H = 70, GAP_X = 20, GAP_Y = 60;
  const positions = {};
  const gens = Object.keys(byGen).map(Number).sort((a, b) => a - b);
  let maxW = 0;
  for (const g of gens) {
    const row = byGen[g];
    const rowW = row.length * NODE_W + (row.length - 1) * GAP_X;
    if (rowW > maxW) maxW = rowW;
  }
  for (const g of gens) {
    const row = byGen[g];
    const rowW = row.length * NODE_W + (row.length - 1) * GAP_X;
    const startX = (maxW - rowW) / 2;
    row.forEach((m, i) => {
      positions[m.id] = {
        x: startX + i * (NODE_W + GAP_X) + NODE_W / 2,
        y: g * (NODE_H + GAP_Y) + NODE_H / 2,
      };
    });
  }
  const svgW = maxW + 40;
  const svgH = (gens.length > 0 ? (Math.max(...gens) + 1) : 1) * (NODE_H + GAP_Y) + 20;
  return { positions, svgW, svgH, byGen, gens };
}

// ── Styles ─────────────────────────────────────────────────────────────────
const card = { background: "#FFFDF9", borderRadius: 14, padding: "14px 16px", border: "1px solid #E8E0D0" };
const inp  = { padding: "9px 12px", borderRadius: 9, border: "2px solid #D5CFC4", fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const btn  = (bg, col = "#fff") => ({ padding: "9px 18px", background: bg, color: col, border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" });

function MemberForm({ member, onSave, onCancel }) {
  const [draft, setDraft] = useState({ ...member, facts: { ...member.facts } });
  const [factKey, setFactKey]   = useState("");
  const [factVal, setFactVal]   = useState("");
  const [customKey, setCustomKey] = useState("");

  const effectiveKey = factKey === "_custom" ? customKey : factKey;

  const addFact = () => {
    if (!effectiveKey.trim() || !factVal.trim()) return;
    setDraft(d => ({ ...d, facts: { ...d.facts, [effectiveKey.trim()]: factVal.trim() } }));
    setFactKey(""); setFactVal(""); setCustomKey("");
  };

  const removeFact = (k) => setDraft(d => {
    const f = { ...d.facts }; delete f[k]; return { ...d, facts: f };
  });

  return (
    <div style={{ ...card, border: "2px solid #4E8B80" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#2D5A54", marginBottom: 14 }}>
        {member.name ? `Edit: ${member.name}` : "Add Family Member"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 4 }}>Name</label>
          <input style={inp} value={draft.name} placeholder="First name"
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} autoFocus />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 4 }}>Relationship</label>
          <select style={inp} value={draft.relation_type}
            onChange={e => setDraft(d => ({ ...d, relation_type: e.target.value }))}>
            {RELATION_TYPES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 4 }}>Photo URL (optional)</label>
          <input style={inp} value={draft.photo_url} placeholder="https://…"
            onChange={e => setDraft(d => ({ ...d, photo_url: e.target.value }))} />
        </div>

        {/* Facts */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 8 }}>Facts for memory exercises</label>
          {Object.entries(draft.facts).map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, background: "#F0ECE4", borderRadius: 8, padding: "6px 10px" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4E8B80", minWidth: 90 }}>{k.replace(/_/g, " ")}</span>
              <span style={{ fontSize: 14, flex: 1, color: "#2D3B36" }}>{v}</span>
              <button onClick={() => removeFact(k)} style={{ ...btn("#FDE8E8", "#8B2D2D"), padding: "3px 10px", fontSize: 12 }}>✕</button>
            </div>
          ))}
          {/* Add fact row */}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <select style={{ ...inp, flex: "1 1 140px" }} value={factKey}
              onChange={e => { setFactKey(e.target.value); setCustomKey(""); }}>
              <option value="">Select fact…</option>
              {PRESET_FACT_KEYS.map(k => (
                <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
              ))}
              <option value="_custom">Custom…</option>
            </select>
            {factKey === "_custom" && (
              <input style={{ ...inp, flex: "1 1 120px" }} value={customKey} placeholder="Fact name"
                onChange={e => setCustomKey(e.target.value)} />
            )}
            <input style={{ ...inp, flex: "2 1 160px" }} value={factVal} placeholder="Value"
              onChange={e => setFactVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addFact(); }} />
            <button onClick={addFact} disabled={!effectiveKey.trim() || !factVal.trim()}
              style={{ ...btn(!effectiveKey.trim() || !factVal.trim() ? "#C5BEB4" : "#4E8B80"), padding: "9px 14px" }}>
              + Add
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => onSave(draft)} disabled={!draft.name.trim()}
            style={{ ...btn(!draft.name.trim() ? "#C5BEB4" : "linear-gradient(135deg,#4E8B80,#3A7A6F)") }}>✓ Save</button>
          <button onClick={onCancel} style={{ ...btn("#F5F0E8", "#666") }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function FamilyTree({ members }) {
  const { positions, svgW, svgH } = buildTreeLayout(members);
  const NODE_W = 90, NODE_H = 70;
  if (!members.length) return null;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={svgW} height={svgH} style={{ display: "block", margin: "0 auto" }}>
        {members.map(m => {
          const pos = positions[m.id];
          if (!pos) return null;
          const x = pos.x - NODE_W / 2, y = pos.y - NODE_H / 2;
          const hasPhoto = m.photo_url;
          return (
            <g key={m.id}>
              <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={12}
                fill="#E8F4F2" stroke="#4E8B80" strokeWidth={1.5} />
              {hasPhoto && (
                <image href={m.photo_url} x={x + 25} y={y + 6} width={40} height={32}
                  style={{ clipPath: "inset(0 0 0 0 round 8px)" }} />
              )}
              {!hasPhoto && (
                <text x={pos.x} y={y + 26} textAnchor="middle" fontSize={20}>👤</text>
              )}
              <text x={pos.x} y={y + 48} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2D5A54">
                {m.name.length > 10 ? m.name.slice(0, 10) + "…" : m.name}
              </text>
              <text x={pos.x} y={y + 62} textAnchor="middle" fontSize={9} fill="#7BAE9F">
                {m.relation_type.replace(/_/g, " ")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function FamilyModule({ members, onUpdate }) {
  const [view, setView]     = useState("list"); // "list" | "tree"
  const [editing, setEditing] = useState(null);

  const save = (updated) => {
    const exists = members.find(m => m.id === updated.id);
    const next = exists
      ? members.map(m => m.id === updated.id ? updated : m)
      : [...members, updated];
    saveFamilyMembers(next);
    onUpdate(next);
    setEditing(null);
  };

  const remove = (id) => {
    const next = members.filter(m => m.id !== id);
    saveFamilyMembers(next);
    onUpdate(next);
  };

  return (
    <div style={{ padding: 20, maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36", flex: 1 }}>
          👨‍👩‍👧‍👦 Family & Friends ({members.length})
        </div>
        <button onClick={() => setView(v => v === "tree" ? "list" : "tree")}
          style={{ ...btn("#E8F4F2", "#2D5A54"), padding: "7px 14px", fontSize: 12 }}>
          {view === "tree" ? "📋 List" : "🌳 Tree"}
        </button>
        <button onClick={() => setEditing(newMember())}
          style={{ ...btn("linear-gradient(135deg,#4E8B80,#3A7A6F)"), padding: "8px 14px" }}>
          + Add
        </button>
      </div>

      {/* Form */}
      {editing && <MemberForm member={editing} onSave={save} onCancel={() => setEditing(null)} />}

      {/* Tree view */}
      {view === "tree" && members.length > 0 && (
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", marginBottom: 12 }}>Family Tree</div>
          <FamilyTree members={members} />
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <>
          {members.length === 0 && !editing && (
            <div style={{ ...card, textAlign: "center", padding: 32, color: "#999" }}>
              <div style={{ fontSize: 36 }}>👨‍👩‍👧‍👦</div>
              <div style={{ marginTop: 10, fontSize: 14 }}>No family members yet. Add people to personalise exercises.</div>
            </div>
          )}
          {members.map(m => (
            <div key={m.id} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start" }}>
              {/* Avatar */}
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#E8F4F2", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #B0D4CE" }}>
                {m.photo_url ? (
                  <img src={m.photo_url} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={e => { e.target.style.display = "none"; }} />
                ) : (
                  <span style={{ fontSize: 24 }}>👤</span>
                )}
              </div>
              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#2D3B36", fontSize: 15 }}>{m.name}</div>
                <div style={{ fontSize: 12, color: "#7BAE9F", marginBottom: 6 }}>{m.relation_type.replace(/_/g, " ")}</div>
                {Object.keys(m.facts).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.entries(m.facts).slice(0, 4).map(([k, v]) => (
                      <span key={k} style={{ padding: "2px 8px", background: "#F0ECE4", borderRadius: 8, fontSize: 11, color: "#666" }}>
                        {k.replace(/_/g, " ")}: <strong>{v}</strong>
                      </span>
                    ))}
                    {Object.keys(m.facts).length > 4 && (
                      <span style={{ fontSize: 11, color: "#999" }}>+{Object.keys(m.facts).length - 4} more</span>
                    )}
                  </div>
                )}
              </div>
              {/* Actions */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => setEditing({ ...m })} style={{ ...btn("#F5F0E8", "#444"), padding: "6px 12px", fontSize: 12 }}>Edit</button>
                <button onClick={() => remove(m.id)} style={{ ...btn("#FDE8E8", "#8B2D2D"), padding: "6px 12px", fontSize: 12 }}>✕</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Tip */}
      {members.length === 0 && !editing && (
        <div style={{ background: "#FFF8E8", borderRadius: 12, padding: "14px 18px", border: "1px solid #F0E0A0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#7A5A10", marginBottom: 6 }}>💡 How family facts are used</div>
          {["Add birthday, job, favourite colour — anything meaningful.", "The Memory module asks 'What is Gran's birthday?' with realistic multiple-choice options.", "Facts become harder distractors as you get better, and easier when you're struggling."].map((t, i) => (
            <div key={i} style={{ fontSize: 13, color: "#5A4A1A", padding: "3px 0", display: "flex", gap: 8 }}>
              <span>•</span><span>{t}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
