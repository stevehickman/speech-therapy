import { useState } from "react";

// ── Storage keys ───────────────────────────────────────────────────────────────
const PERSONS_KEY = "fam_persons";
const RELS_KEY    = "fam_relationships";
const LEGACY_KEY  = "fam_family_members"; // old flat format — migrated on first load

// ── Preset facts (used by Memory module questions) ────────────────────────────
export const PRESET_FACT_KEYS = [
  "birthday", "lives_in", "job", "favourite_colour", "favourite_food",
  "pet", "hobby", "favourite_sport", "where_met", "middle_name",
];

// ── Persistence ────────────────────────────────────────────────────────────────

function migrateLegacy(old) {
  // Only parent / child / partner / sibling map to direct edges.
  // grandparent, grandchild, aunt_uncle, cousin, friend, carer, other → person
  // only (user must manually add the intermediate relationship chain).
  const persons = [];
  const relationships = [];
  for (const m of old) {
    persons.push({ id: m.id, name: m.name, photo_url: m.photo_url || "", facts: m.facts || {} });
    const t = m.relation_type;
    if (t === "parent") {
      relationships.push({ id: `rel-mig-${m.id}`, from: m.id, to: "_patient", type: "parent", lineage: "biological" });
    } else if (t === "child") {
      relationships.push({ id: `rel-mig-${m.id}`, from: "_patient", to: m.id, type: "parent", lineage: "biological" });
    } else if (t === "partner") {
      relationships.push({ id: `rel-mig-${m.id}`, from: m.id, to: "_patient", type: "partner", lineage: "biological" });
    } else if (t === "sibling") {
      relationships.push({ id: `rel-mig-${m.id}`, from: m.id, to: "_patient", type: "sibling", lineage: "biological" });
    }
    // grandparent / grandchild / aunt_uncle / cousin / friend / carer / other → no edge
  }
  return { persons, relationships };
}

export function loadFamilyMembers() {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const old = JSON.parse(legacy);
      if (Array.isArray(old) && old.length > 0) {
        const migrated = migrateLegacy(old);
        localStorage.setItem(PERSONS_KEY, JSON.stringify(migrated.persons));
        localStorage.setItem(RELS_KEY, JSON.stringify(migrated.relationships));
        localStorage.removeItem(LEGACY_KEY);
        return migrated;
      }
    } catch {}
    localStorage.removeItem(LEGACY_KEY);
  }
  try {
    const p = localStorage.getItem(PERSONS_KEY);
    const r = localStorage.getItem(RELS_KEY);
    return {
      persons:       p ? JSON.parse(p) : [],
      relationships: r ? JSON.parse(r) : [],
    };
  } catch {
    return { persons: [], relationships: [] };
  }
}

export function saveFamilyMembers({ persons, relationships }) {
  try {
    localStorage.setItem(PERSONS_KEY, JSON.stringify(persons));
    localStorage.setItem(RELS_KEY, JSON.stringify(relationships));
  } catch {}
}

function loadPatientName() {
  try { const s = localStorage.getItem("fam_profile"); return s ? (JSON.parse(s).name || "") : ""; } catch { return ""; }
}

function uid(prefix = "p") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Graph utilities ────────────────────────────────────────────────────────────

// BFS from _patient; returns Map<personId, generationNumber>
// parent edge goes down (+1 gen); partner/sibling stay at same gen (0).
function assignGenerations(persons, relationships) {
  const gen = new Map([["_patient", 0]]);
  const adj = new Map();
  const addEdge = (a, b, delta) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push([b, delta]);
  };
  for (const r of relationships) {
    if (r.type === "parent") {
      addEdge(r.from, r.to, +1); // parent → child: going down
      addEdge(r.to, r.from, -1); // child → parent: going up
    } else {
      addEdge(r.from, r.to, 0);
      addEdge(r.to, r.from, 0);
    }
  }
  const visited = new Set(["_patient"]);
  const queue = [["_patient", 0]];
  while (queue.length) {
    const [id, g] = queue.shift();
    for (const [nb, d] of (adj.get(id) || [])) {
      if (!visited.has(nb)) {
        visited.add(nb);
        gen.set(nb, g + d);
        queue.push([nb, g + d]);
      }
    }
  }
  for (const p of persons) { if (!gen.has(p.id)) gen.set(p.id, 0); }
  return gen;
}

// Walk the graph from _patient to personId and return a display label.
function deriveLabel(personId, relationships) {
  if (personId === "_patient") return "you";
  const adj = new Map();
  const addEdge = (a, b, type, dir, lineage) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push({ to: b, type, dir, lineage });
  };
  for (const r of relationships) {
    if (r.type === "parent") {
      addEdge(r.from, r.to, "parent", "down", r.lineage);
      addEdge(r.to, r.from, "parent", "up",   r.lineage);
    } else {
      addEdge(r.from, r.to, r.type, "side", r.lineage);
      addEdge(r.to, r.from, r.type, "side", r.lineage);
    }
  }
  const visited = new Set(["_patient"]);
  const queue = [{ id: "_patient", path: [] }];
  while (queue.length) {
    const { id, path } = queue.shift();
    if (path.length >= 5) continue;
    for (const e of (adj.get(id) || [])) {
      if (visited.has(e.to)) continue;
      visited.add(e.to);
      const p = [...path, { type: e.type, dir: e.dir, lineage: e.lineage }];
      if (e.to === personId) return pathToLabel(p);
      queue.push({ id: e.to, path: p });
    }
  }
  return "relative";
}

function pathToLabel(path) {
  const d = path.map(s => s.dir);
  const t = path.map(s => s.type);
  const lg = path[0]?.lineage || "biological";
  if (path.length === 1) {
    if (t[0] === "parent"  && d[0] === "up")   return lg === "step" ? "step-parent" : lg === "adopted" ? "adoptive parent" : "parent";
    if (t[0] === "parent"  && d[0] === "down")  return lg === "step" ? "step-child" : "child";
    if (t[0] === "partner")                     return "partner";
    if (t[0] === "sibling")                     return lg === "half" ? "half-sibling" : "sibling";
  }
  if (path.length === 2) {
    if (d[0]==="up"   && d[1]==="up")   return "grandparent";
    if (d[0]==="down" && d[1]==="down") return "grandchild";
    if (d[0]==="up"   && d[1]==="down") return "sibling";
    if (d[0]==="up"   && t[1]==="partner") return "parent's partner";
    if (t[0]==="partner" && d[1]==="up")   return "partner's parent";
    if (t[0]==="partner" && d[1]==="down") return "step-child";
    if (d[0]==="down" && t[1]==="partner") return "child's partner";
  }
  if (path.length === 3) {
    if (d[0]==="up"  && d[1]==="up"   && d[2]==="up")   return "great-grandparent";
    if (d[0]==="down"&& d[1]==="down" && d[2]==="down")  return "great-grandchild";
    if (d[0]==="up"  && d[1]==="up"   && d[2]==="down")  return "aunt / uncle";
    if (d[0]==="up"  && d[1]==="down" && d[2]==="down")  return "niece / nephew";
  }
  if (path.length === 4) {
    if (d[0]==="up"&&d[1]==="up"&&d[2]==="down"&&d[3]==="down") return "cousin";
  }
  return "relative";
}

// Convert a link descriptor (direction + toId) to a storable relationship.
function linkToRel(personId, link) {
  const relId = link.id || uid("rel");
  const { dir, toId, lineage = "biological" } = link;
  if (dir === "parent_of")  return { id: relId, from: personId, to: toId,     type: "parent",  lineage };
  if (dir === "child_of")   return { id: relId, from: toId,     to: personId, type: "parent",  lineage };
  if (dir === "partner_of") return { id: relId, from: personId, to: toId,     type: "partner", lineage };
  if (dir === "sibling_of") return { id: relId, from: personId, to: toId,     type: "sibling", lineage };
  return null;
}

// Extract link descriptors for a person from the relationships array.
function getLinks(personId, relationships) {
  const links = [];
  for (const r of relationships) {
    const involves = r.from === personId || r.to === personId;
    if (!involves) continue;
    let dir, toId;
    if (r.type === "parent") {
      if (r.from === personId) { dir = "parent_of"; toId = r.to; }
      else                     { dir = "child_of";  toId = r.from; }
    } else {
      dir  = r.type === "partner" ? "partner_of" : "sibling_of";
      toId = r.from === personId ? r.to : r.from;
    }
    links.push({ id: r.id, dir, toId, lineage: r.lineage || "biological" });
  }
  return links;
}

// ── Tree layout ────────────────────────────────────────────────────────────────
const NW = 96, NH = 72, GX = 28, GY = 88, PAD = 44;

function buildTreeLayout(persons, relationships) {
  const patientNode = { id: "_patient", name: loadPatientName() || "Me", isPatient: true };
  const all = [...persons, patientNode];
  const genMap = assignGenerations(persons, relationships);

  // Group by generation
  const byGen = new Map();
  for (const p of all) {
    const g = genMap.get(p.id) ?? 0;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g).push(p);
  }

  // Order gen-0 row: siblings | patient | partners | others
  if (byGen.has(0)) {
    const g0 = byGen.get(0);
    const isPartner = p => relationships.some(r =>
      r.type === "partner" && (r.from === p.id && r.to === "_patient" || r.to === p.id && r.from === "_patient")
    );
    const isSibling = p => relationships.some(r =>
      r.type === "sibling" && (r.from === p.id && r.to === "_patient" || r.to === p.id && r.from === "_patient")
    );
    const patient  = g0.find(p => p.id === "_patient");
    const siblings = g0.filter(p => p.id !== "_patient" && isSibling(p));
    const partners = g0.filter(p => p.id !== "_patient" && isPartner(p));
    const others   = g0.filter(p => p.id !== "_patient" && !isSibling(p) && !isPartner(p));
    byGen.set(0, [...siblings, patient, ...partners, ...others]);
  }

  const gens = [...byGen.keys()].sort((a, b) => a - b);
  const rw = row => row.length * NW + Math.max(0, row.length - 1) * GX;

  // Keep patient centred horizontally
  const gen0Row = byGen.get(0) || [patientNode];
  const pIdx    = gen0Row.findIndex(p => p.id === "_patient");
  const pOffset = pIdx * (NW + GX) + NW / 2;
  const svgW = Math.max(
    2 * (PAD + pOffset),
    Math.max(...[...byGen.values()].map(rw)) + 2 * PAD,
    280
  );
  const cx = svgW / 2;

  const positions = {};
  const genRowIdx = new Map(gens.map((g, i) => [g, i]));
  for (const [g, row] of byGen) {
    const y      = genRowIdx.get(g) * (NH + GY) + NH / 2 + PAD;
    const startX = g === 0 ? cx - pOffset : cx - rw(row) / 2;
    row.forEach((p, i) => {
      positions[p.id] = { x: startX + i * (NW + GX) + NW / 2, y };
    });
  }

  const svgH = gens.length * (NH + GY) - GY + 2 * PAD;
  return { positions, svgW, svgH, allPersons: all };
}

// Build SVG line segments from relationship data and computed positions.
function buildLines(persons, relationships, positions) {
  const TEAL = "#4E8B80", ROSE = "#B05090";
  const lines = [];

  // --- Parent-child pedigree bars ---
  // Group children by their sorted parent-ID set so siblings share one bar.
  const parentsOf = new Map();
  for (const r of relationships) {
    if (r.type !== "parent") continue;
    if (!parentsOf.has(r.to)) parentsOf.set(r.to, []);
    parentsOf.get(r.to).push(r.from);
  }
  const groups = new Map(); // parentKey → { parents, children }
  for (const [childId, pIds] of parentsOf) {
    const key = [...pIds].sort().join(",");
    if (!groups.has(key)) groups.set(key, { parents: [...pIds], children: [] });
    groups.get(key).children.push(childId);
  }
  for (const { parents, children } of groups.values()) {
    const pPos = parents.map(id => positions[id]).filter(Boolean);
    const cPos = children.map(id => positions[id]).filter(Boolean);
    if (!pPos.length || !cPos.length) continue;

    const parentY = Math.max(...pPos.map(p => p.y));
    const childY  = Math.min(...cPos.map(p => p.y));
    const barY    = (parentY + NH / 2 + childY - NH / 2) / 2;
    const srcX    = pPos.reduce((s, p) => s + p.x, 0) / pPos.length; // midpoint of parents

    // Drops from each parent to bar
    for (const pp of pPos) lines.push({ x1: pp.x, y1: pp.y + NH/2, x2: pp.x, y2: barY, color: TEAL });

    // Horizontal bar spanning parents and children
    const allXs  = [...pPos.map(p => p.x), ...cPos.map(p => p.x), srcX];
    lines.push({ x1: Math.min(...allXs), y1: barY, x2: Math.max(...allXs), y2: barY, color: TEAL });

    // Drops from bar to each child
    for (const cp of cPos) lines.push({ x1: cp.x, y1: barY, x2: cp.x, y2: cp.y - NH/2, color: TEAL });
  }

  // --- Partner double-line (rose) ---
  const drawnPairs = new Set();
  for (const r of relationships) {
    if (r.type !== "partner") continue;
    const key = [r.from, r.to].sort().join(",");
    if (drawnPairs.has(key)) continue;
    drawnPairs.add(key);
    const p1 = positions[r.from], p2 = positions[r.to];
    if (!p1 || !p2) continue;
    const lx = Math.min(p1.x, p2.x) + NW / 2;
    const rx = Math.max(p1.x, p2.x) - NW / 2;
    if (rx <= lx) continue;
    const my = (p1.y + p2.y) / 2;
    lines.push({ x1: lx, y1: my - 3, x2: rx, y2: my - 3, color: ROSE });
    lines.push({ x1: lx, y1: my + 3, x2: rx, y2: my + 3, color: ROSE });
  }

  // --- Sibling dashed line (only when no shared parent is known) ---
  for (const r of relationships) {
    if (r.type !== "sibling") continue;
    // Skip if both siblings already share a parent (covered by bar above)
    const p1parents = [...(parentsOf.get(r.from) || [])];
    const p2parents = [...(parentsOf.get(r.to)   || [])];
    if (p1parents.some(id => p2parents.includes(id))) continue;
    const pos1 = positions[r.from], pos2 = positions[r.to];
    if (!pos1 || !pos2) continue;
    const lx = Math.min(pos1.x, pos2.x) + NW / 2;
    const rx = Math.max(pos1.x, pos2.x) - NW / 2;
    if (rx <= lx) continue;
    const my = (pos1.y + pos2.y) / 2;
    lines.push({ x1: lx, y1: my, x2: rx, y2: my, color: TEAL, dashed: true });
  }

  return lines;
}

// ── Family Tree SVG ────────────────────────────────────────────────────────────
function FamilyTree({ persons, relationships }) {
  const { positions, svgW, svgH, allPersons } = buildTreeLayout(persons, relationships);
  const lines = buildLines(persons, relationships, positions);

  return (
    <div>
      {/* Scroll container — scrollbars appear automatically in both directions when tree overflows */}
      <div style={{ overflow: "auto", maxHeight: "60vh", border: "1px solid #E8E0D0", borderRadius: 10 }}>
      <svg width={svgW} height={svgH} style={{ display: "block", margin: "0 auto" }}>
        <defs>
          {allPersons.map(m => m.photo_url && positions[m.id] && (
            <clipPath key={`clip-${m.id}`} id={`clip-${m.id}`}>
              <circle cx={positions[m.id].x} cy={positions[m.id].y - NH/2 + 26} r={18} />
            </clipPath>
          ))}
        </defs>

        {lines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.color}
            strokeWidth={l.color === "#B05090" ? 1.5 : 2}
            strokeDasharray={l.dashed ? "5,4" : undefined} />
        ))}

        {allPersons.map(m => {
          const pos = positions[m.id];
          if (!pos) return null;
          const x = pos.x - NW / 2, y = pos.y - NH / 2;
          const isP = m.isPatient;
          const label = isP ? "you" : deriveLabel(m.id, relationships);
          return (
            <g key={m.id}>
              <rect x={x} y={y} width={NW} height={NH} rx={14}
                fill={isP ? "#D4EDE9" : "#FFFDF9"}
                stroke={isP ? "#2D5A54" : "#4E8B80"}
                strokeWidth={isP ? 2.5 : 1.5} />
              {m.photo_url ? (
                <image href={m.photo_url} x={pos.x - 18} y={y + 8} width={36} height={36}
                  clipPath={`url(#clip-${m.id})`} preserveAspectRatio="xMidYMid slice" />
              ) : (
                <text x={pos.x} y={y + 31} textAnchor="middle" fontSize={20} dominantBaseline="middle">
                  {isP ? "🧑" : "👤"}
                </text>
              )}
              <text x={pos.x} y={y + 52} textAnchor="middle" fontSize={11} fontWeight={700}
                fill={isP ? "#1A3A30" : "#2D5A54"}>
                {m.name.length > 11 ? m.name.slice(0, 11) + "…" : m.name}
              </text>
              <text x={pos.x} y={y + 64} textAnchor="middle" fontSize={9}
                fill={isP ? "#4E8B80" : "#7BAE9F"} fontWeight={isP ? 600 : 400}>
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      </div>

      <div style={{ display: "flex", gap: 20, justifyContent: "center", marginTop: 10, fontSize: 11, color: "#888", flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <svg width={24} height={8}><line x1={0} y1={4} x2={24} y2={4} stroke="#4E8B80" strokeWidth={2} /></svg>
          family
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <svg width={24} height={10}>
            <line x1={0} y1={3} x2={24} y2={3} stroke="#B05090" strokeWidth={1.5} />
            <line x1={0} y1={7} x2={24} y2={7} stroke="#B05090" strokeWidth={1.5} />
          </svg>
          partner
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <svg width={24} height={8}><line x1={0} y1={4} x2={24} y2={4} stroke="#4E8B80" strokeWidth={2} strokeDasharray="5,4" /></svg>
          sibling (parent unknown)
        </span>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const card = { background: "#FFFDF9", borderRadius: 14, padding: "14px 16px", border: "1px solid #E8E0D0" };
const inp  = { padding: "9px 12px", borderRadius: 9, border: "2px solid #D5CFC4", fontSize: 14,
               fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const btn  = (bg, col = "#fff") => ({ padding: "9px 18px", background: bg, color: col, border: "none",
               borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" });

// Person name for picker display
function personLabel(id, persons, patientName) {
  if (id === "_patient") return patientName ? `${patientName} (you)` : "You (patient)";
  return persons.find(p => p.id === id)?.name || id;
}

// ── Link editor row ────────────────────────────────────────────────────────────
function LinkRow({ link, persons, patientName, onChange, onRemove }) {
  const needsLineage = link.dir === "parent_of" || link.dir === "child_of";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
      <select style={{ ...inp, flex: "0 0 auto", width: "auto", minWidth: 130 }}
        value={link.dir} onChange={e => onChange({ ...link, dir: e.target.value })}>
        <option value="parent_of">parent of</option>
        <option value="child_of">child of</option>
        <option value="partner_of">partner of</option>
        <option value="sibling_of">sibling of</option>
      </select>

      <select style={{ ...inp, flex: "1 1 120px", width: "auto" }}
        value={link.toId} onChange={e => onChange({ ...link, toId: e.target.value })}>
        <option value="_patient">{personLabel("_patient", persons, patientName)}</option>
        {persons.map(p => (
          <option key={p.id} value={p.id}>{p.name || "(unnamed)"}</option>
        ))}
      </select>

      {needsLineage && (
        <select style={{ ...inp, flex: "0 0 auto", width: "auto", minWidth: 110 }}
          value={link.lineage || "biological"} onChange={e => onChange({ ...link, lineage: e.target.value })}>
          <option value="biological">biological</option>
          <option value="step">step</option>
          <option value="adopted">adopted</option>
          <option value="guardian">guardian</option>
          <option value="half">half</option>
        </select>
      )}

      <button onClick={onRemove} style={{ ...btn("#FDE8E8", "#8B2D2D"), padding: "6px 10px", fontSize: 12 }}>✕</button>
    </div>
  );
}

// ── Person form ────────────────────────────────────────────────────────────────
function PersonForm({ person, persons, relationships, onSave, onCancel, defaultRelatedToId, onRelatedToChange }) {
  const patientName = loadPatientName();
  const isNew = person._isNew;

  const [name, setName]   = useState(person.name || "");
  const [photo, setPhoto] = useState(person.photo_url || "");
  const [facts, setFacts] = useState({ ...(person.facts || {}) });
  const [links, setLinks] = useState(() =>
    isNew
      ? [{ id: uid("lnk"), dir: "parent_of", toId: defaultRelatedToId || "_patient", lineage: "biological" }]
      : getLinks(person.id, relationships)
  );

  const [factKey, setFactKey]     = useState("");
  const [factVal, setFactVal]     = useState("");
  const [customKey, setCustomKey] = useState("");
  const effectiveKey = factKey === "_custom" ? customKey : factKey;

  const addFact = () => {
    if (!effectiveKey.trim() || !factVal.trim()) return;
    setFacts(f => ({ ...f, [effectiveKey.trim()]: factVal.trim() }));
    setFactKey(""); setFactVal(""); setCustomKey("");
  };
  const removeFact = k => setFacts(f => { const n = { ...f }; delete n[k]; return n; });

  const addLink = () => {
    const toId = links.length > 0 ? links[links.length - 1].toId : (defaultRelatedToId || "_patient");
    setLinks(ls => [...ls, { id: uid("lnk"), dir: "parent_of", toId, lineage: "biological" }]);
  };

  const changeLink = (idx, updated) => {
    // When the user changes the "of whom?" party, notify parent so it becomes the new default
    if (updated.toId !== links[idx].toId) onRelatedToChange?.(updated.toId);
    setLinks(ls => ls.map((l, i) => i === idx ? updated : l));
  };

  const removeLink = idx => setLinks(ls => ls.filter((_, i) => i !== idx));

  const handleSave = () => {
    if (!name.trim()) return;
    const personOut = { id: person.id || uid("p"), name: name.trim(), photo_url: photo.trim(), facts };
    onSave(personOut, links);
  };

  return (
    <div style={{ ...card, border: "2px solid #4E8B80" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#2D5A54", marginBottom: 14 }}>
        {isNew ? "Add person" : `Edit: ${person.name}`}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Name */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 4 }}>Name</label>
          <input style={inp} value={name} placeholder="First name" autoFocus
            onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSave(); }} />
        </div>

        {/* Photo URL */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 4 }}>Photo URL (optional)</label>
          <input style={inp} value={photo} placeholder="https://…" onChange={e => setPhoto(e.target.value)} />
        </div>

        {/* Relationships */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 8 }}>
            Relationships
            <span style={{ fontWeight: 400, color: "#999", marginLeft: 6 }}>— how is this person related to others?</span>
          </label>
          {links.map((link, i) => (
            <LinkRow key={link.id} link={link} persons={persons} patientName={patientName}
              onChange={upd => changeLink(i, upd)} onRemove={() => removeLink(i)} />
          ))}
          <button onClick={addLink} style={{ ...btn("#E8F4F2", "#2D5A54"), padding: "6px 14px", fontSize: 12, marginTop: 4 }}>
            + Add another link
          </button>
        </div>

        {/* Facts */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 8 }}>Facts for memory exercises</label>
          {Object.entries(facts).map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6,
              background: "#F0ECE4", borderRadius: 8, padding: "6px 10px" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#4E8B80", minWidth: 90 }}>{k.replace(/_/g, " ")}</span>
              <span style={{ fontSize: 14, flex: 1, color: "#2D3B36" }}>{v}</span>
              <button onClick={() => removeFact(k)} style={{ ...btn("#FDE8E8", "#8B2D2D"), padding: "3px 10px", fontSize: 12 }}>✕</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <select style={{ ...inp, flex: "1 1 140px" }} value={factKey}
              onChange={e => { setFactKey(e.target.value); setCustomKey(""); }}>
              <option value="">Select fact…</option>
              {PRESET_FACT_KEYS.map(k => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
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
          <button onClick={handleSave} disabled={!name.trim()}
            style={{ ...btn(!name.trim() ? "#C5BEB4" : "linear-gradient(135deg,#4E8B80,#3A7A6F)") }}>
            ✓ Save
          </button>
          <button onClick={onCancel} style={{ ...btn("#F5F0E8", "#666") }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main module ────────────────────────────────────────────────────────────────
export default function FamilyModule({ members, onUpdate }) {
  const { persons = [], relationships = [] } = members || {};
  const [view, setView]       = useState("list"); // "list" | "tree"
  const [editing, setEditing] = useState(null);
  // Sticky "related to" default — starts as patient, updates when user picks someone else
  const [defaultRelTo, setDefaultRelTo] = useState("_patient");

  const commit = ({ persons: p, relationships: r }) => {
    saveFamilyMembers({ persons: p, relationships: r });
    onUpdate({ persons: p, relationships: r });
  };

  const savePerson = (personOut, links) => {
    const pid = personOut.id;
    const newPersons = persons.some(p => p.id === pid)
      ? persons.map(p => p.id === pid ? personOut : p)
      : [...persons, personOut];
    const newRels = [
      ...relationships.filter(r => r.from !== pid && r.to !== pid),
      ...links.map(l => linkToRel(pid, l)).filter(Boolean),
    ];
    commit({ persons: newPersons, relationships: newRels });
    setEditing(null);
  };

  const deletePerson = pid => {
    commit({
      persons: persons.filter(p => p.id !== pid),
      relationships: relationships.filter(r => r.from !== pid && r.to !== pid),
    });
  };

  const patientName = loadPatientName();

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36", flex: 1 }}>
          👨‍👩‍👧‍👦 Family & Friends ({persons.length})
        </div>
        <button onClick={() => setView(v => v === "tree" ? "list" : "tree")}
          style={{ ...btn("#E8F4F2", "#2D5A54"), padding: "7px 14px", fontSize: 12 }}>
          {view === "tree" ? "📋 List" : "🌳 Tree"}
        </button>
        <button
          onClick={() => setEditing({ _isNew: true, name: "", photo_url: "", facts: {} })}
          style={{ ...btn("linear-gradient(135deg,#4E8B80,#3A7A6F)"), padding: "8px 14px" }}>
          + Add
        </button>
      </div>

      {/* Form */}
      {editing && (
        <PersonForm
          person={editing}
          persons={persons}
          relationships={relationships}
          onSave={savePerson}
          onCancel={() => setEditing(null)}
          defaultRelatedToId={defaultRelTo}
          onRelatedToChange={setDefaultRelTo}
        />
      )}

      {/* Tree view */}
      {view === "tree" && (
        <div style={{ ...card }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2D3B36", marginBottom: 12 }}>Family Tree</div>
          <FamilyTree persons={persons} relationships={relationships} />
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <>
          {persons.length === 0 && !editing && (
            <div style={{ ...card, textAlign: "center", padding: 32, color: "#999" }}>
              <div style={{ fontSize: 36 }}>👨‍👩‍👧‍👦</div>
              <div style={{ marginTop: 10, fontSize: 14 }}>No family members yet. Add people to personalise exercises.</div>
            </div>
          )}
          {persons.map(m => {
            const label = deriveLabel(m.id, relationships);
            return (
              <div key={m.id} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#E8F4F2", flexShrink: 0,
                  overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                  border: "2px solid #B0D4CE" }}>
                  {m.photo_url
                    ? <img src={m.photo_url} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={e => { e.target.style.display = "none"; }} />
                    : <span style={{ fontSize: 24 }}>👤</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "#2D3B36", fontSize: 15 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "#7BAE9F", marginBottom: 6 }}>{label}</div>
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
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setEditing(m)} style={{ ...btn("#F5F0E8", "#444"), padding: "6px 12px", fontSize: 12 }}>Edit</button>
                  <button onClick={() => deletePerson(m.id)} style={{ ...btn("#FDE8E8", "#8B2D2D"), padding: "6px 12px", fontSize: 12 }}>✕</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Tip (shown when empty) */}
      {persons.length === 0 && !editing && (
        <div style={{ background: "#FFF8E8", borderRadius: 12, padding: "14px 18px", border: "1px solid #F0E0A0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#7A5A10", marginBottom: 6 }}>💡 How family facts are used</div>
          {[
            "Add birthday, job, favourite colour — anything meaningful.",
            "The Memory module asks 'What is Gran's birthday?' with realistic multiple-choice options.",
            "Facts become harder distractors as you get better, and easier when you're struggling.",
          ].map((t, i) => (
            <div key={i} style={{ fontSize: 13, color: "#5A4A1A", padding: "3px 0", display: "flex", gap: 8 }}>
              <span>•</span><span>{t}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
