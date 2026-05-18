import { useState, useEffect, useRef } from "react";
import { runLaunchHealthCheck, applyHealthResults, itemHealthStatus } from "./lib/healthCheck.js";

export const CONTENT_KEY   = "fam_content_items";
export const CONTENT_TAGS  = ["person", "family", "animal", "pet", "place", "food", "object", "plant", "vehicle", "other"];
export const MEDIA_TYPES   = ["image", "video", "audio"];

export function loadContentItems() {
  try { const s = localStorage.getItem(CONTENT_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
export function saveContentItems(items) {
  try { localStorage.setItem(CONTENT_KEY, JSON.stringify(items)); } catch {}
}

function newItem(overrides = {}) {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: "", media_type: "image", url: "",
    tags: [], url_status: null, last_verified_at: null,
    ...overrides,
  };
}

// ── Styles ───────────────────────────────────────────────────────────────────
const card  = { background: "#FFFDF9", borderRadius: 14, padding: "14px 16px", border: "1px solid #E8E0D0" };
const inp   = { padding: "9px 12px", borderRadius: 9, border: "2px solid #D5CFC4", fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const btn   = (bg, col = "#fff") => ({ padding: "9px 18px", background: bg, color: col, border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" });
const chip  = (active) => ({ padding: "4px 10px", borderRadius: 20, border: `2px solid ${active ? "#4E8B80" : "#D5CFC4"}`, background: active ? "#E8F4F2" : "#FFFDF9", color: active ? "#2D5A54" : "#888", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });

function StatusDot({ status }) {
  const colours = { ok: "#4E8B80", missing: "#D04040", unverified: "#D4A843", unchecked: "#B4B2A9" };
  const labels  = { ok: "✓ Reachable", missing: "✗ Not found", unverified: "? Unverified", unchecked: "— Unchecked" };
  return (
    <span title={labels[status || "unchecked"]} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: colours[status || "unchecked"] }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: colours[status || "unchecked"], display: "inline-block" }} />
      {labels[status || "unchecked"]}
    </span>
  );
}

function ItemCard({ item, onEdit, onDelete }) {
  const status = itemHealthStatus(item);
  return (
    <div style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start" }}>
      {/* Thumbnail */}
      <div style={{ width: 60, height: 60, borderRadius: 10, background: "#F0ECE4", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {item.url && item.media_type === "image" ? (
          <img src={item.url} alt={item.label} style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => { e.target.style.display = "none"; }} />
        ) : (
          <span style={{ fontSize: 28 }}>{item.media_type === "video" ? "🎬" : item.media_type === "audio" ? "🎵" : "🖼️"}</span>
        )}
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: "#2D3B36", fontSize: 14, marginBottom: 2 }}>{item.label || "(unlabelled)"}</div>
        <div style={{ fontSize: 12, color: "#999", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.url || "No URL"}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <StatusDot status={status} />
          {item.tags.map(t => (
            <span key={t} style={{ padding: "2px 7px", background: "#E8F4F2", borderRadius: 8, fontSize: 11, color: "#4E8B80" }}>{t}</span>
          ))}
        </div>
      </div>
      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={() => onEdit(item)} style={{ ...btn("#F5F0E8", "#444"), padding: "6px 12px", fontSize: 12 }}>Edit</button>
        <button onClick={() => onDelete(item.id)} style={{ ...btn("#FDE8E8", "#8B2D2D"), padding: "6px 12px", fontSize: 12 }}>✕</button>
      </div>
    </div>
  );
}

function ItemForm({ item, onSave, onCancel }) {
  const [draft, setDraft] = useState({ ...item });
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const toggleTag = (t) => set("tags", draft.tags.includes(t) ? draft.tags.filter(x => x !== t) : [...draft.tags, t]);

  return (
    <div style={{ ...card, border: "2px solid #4E8B80" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#2D5A54", marginBottom: 14 }}>
        {item.label ? `Edit: ${item.label}` : "Add New Item"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 4 }}>Label (what to call this)</label>
          <input style={inp} value={draft.label} placeholder="e.g. Golden Gate Bridge, Mum, tabby cat"
            onChange={e => set("label", e.target.value)} autoFocus />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 4 }}>Image / video URL</label>
          <input style={inp} value={draft.url} placeholder="https://example.com/photo.jpg"
            onChange={e => set("url", e.target.value)} />
          <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>Paste a direct link to the photo. Use Google Photos, Dropbox, or OneDrive shared links.</div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Media type</label>
          <div style={{ display: "flex", gap: 6 }}>
            {MEDIA_TYPES.map(t => (
              <button key={t} onClick={() => set("media_type", t)} style={chip(draft.media_type === t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Tags (for exercises)</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CONTENT_TAGS.map(t => (
              <button key={t} onClick={() => toggleTag(t)} style={chip(draft.tags.includes(t))}>{t}</button>
            ))}
          </div>
        </div>

        {/* Live preview */}
        {draft.url && draft.media_type === "image" && (
          <div style={{ borderRadius: 10, overflow: "hidden", background: "#F0ECE4", maxHeight: 200, display: "flex", justifyContent: "center" }}>
            <img src={draft.url} alt="preview" style={{ maxHeight: 200, maxWidth: "100%", objectFit: "contain" }}
              onError={e => { e.target.style.display = "none"; }} />
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => onSave(draft)} disabled={!draft.label.trim()}
            style={{ ...btn(!draft.label.trim() ? "#C5BEB4" : "linear-gradient(135deg,#4E8B80,#3A7A6F)") }}>
            ✓ Save
          </button>
          <button onClick={onCancel} style={{ ...btn("#F5F0E8", "#666") }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function ContentLibraryModule({ items, onUpdate }) {
  const [editing, setEditing]   = useState(null); // item being edited, or "new"
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");
  const [checking, setChecking] = useState(false);
  const abortRef = useRef(null);

  const save = (updated) => {
    const exists = items.find(i => i.id === updated.id);
    const next = exists
      ? items.map(i => i.id === updated.id ? { ...updated, url_status: null, last_verified_at: null } : i)
      : [...items, { ...updated, url_status: null, last_verified_at: null }];
    saveContentItems(next);
    onUpdate(next);
    setEditing(null);
  };

  const remove = (id) => {
    const next = items.filter(i => i.id !== id);
    saveContentItems(next);
    onUpdate(next);
  };

  const checkUrls = async () => {
    if (checking) { abortRef.current?.abort(); setChecking(false); return; }
    abortRef.current = new AbortController();
    setChecking(true);
    const updates = await runLaunchHealthCheck(items, null, abortRef.current.signal);
    const next = applyHealthResults(items, updates);
    saveContentItems(next);
    onUpdate(next);
    setChecking(false);
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  const filtered = items.filter(item => {
    if (filter !== "all" && !item.tags.includes(filter)) return false;
    if (search && !item.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statusCounts = items.reduce((acc, i) => {
    const s = itemHealthStatus(i); acc[s] = (acc[s] || 0) + 1; return acc;
  }, {});

  return (
    <div style={{ padding: 20, maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#2D3B36", flex: 1 }}>🖼️ Content Library ({items.length} items)</div>
        <button onClick={checkUrls} style={{ ...btn(checking ? "#D4A843" : "#E8F4F2", checking ? "#fff" : "#2D5A54"), padding: "8px 14px", fontSize: 12 }}>
          {checking ? "⏹ Stop" : "🔍 Check URLs"}
        </button>
        <button onClick={() => setEditing(newItem())} style={{ ...btn("linear-gradient(135deg,#4E8B80,#3A7A6F)"), padding: "8px 14px" }}>
          + Add
        </button>
      </div>

      {/* Health summary */}
      {items.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[["ok","#4E8B80","✓"], ["missing","#D04040","✗"], ["unverified","#D4A843","?"], ["unchecked","#999","—"]].map(([s, col, icon]) => (
            statusCounts[s] ? (
              <div key={s} style={{ padding: "5px 12px", borderRadius: 20, background: col + "20", border: `1px solid ${col}50`, fontSize: 12, color: col, fontWeight: 600 }}>
                {icon} {statusCounts[s]} {s}
              </div>
            ) : null
          ))}
        </div>
      )}

      {/* New / edit form */}
      {editing && (
        <ItemForm item={editing} onSave={save} onCancel={() => setEditing(null)} />
      )}

      {/* Filters */}
      {items.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inp, width: 180 }} placeholder="🔍 Search…" value={search}
            onChange={e => setSearch(e.target.value)} />
          {["all", ...CONTENT_TAGS].map(t => (
            <button key={t} onClick={() => setFilter(t)} style={chip(filter === t)}>{t}</button>
          ))}
        </div>
      )}

      {/* Item list */}
      {filtered.length === 0 && !editing && (
        <div style={{ ...card, textAlign: "center", padding: 32, color: "#999" }}>
          {items.length === 0
            ? <><div style={{ fontSize: 36 }}>📷</div><div style={{ marginTop: 10, fontSize: 14 }}>No photos yet. Add some to personalise your exercises.</div></>
            : <div style={{ fontSize: 14 }}>No items match this filter.</div>
          }
        </div>
      )}
      {filtered.map(item => (
        <ItemCard key={item.id} item={item} onEdit={setEditing} onDelete={remove} />
      ))}

      {/* Import tip */}
      {items.length === 0 && !editing && (
        <div style={{ background: "#FFF8E8", borderRadius: 12, padding: "14px 18px", border: "1px solid #F0E0A0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#7A5A10", marginBottom: 6 }}>💡 Tips for adding photos</div>
          {["Use Google Photos: share a photo → copy link → paste here.", "Dropbox: share → create a link → change ?dl=0 to ?raw=1.", "The photo stays on the original service — nothing is uploaded to this app."].map((t, i) => (
            <div key={i} style={{ fontSize: 13, color: "#5A4A1A", padding: "3px 0", display: "flex", gap: 8 }}>
              <span>•</span><span>{t}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
