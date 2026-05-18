// URL health-check utilities. Ported from Familiar patient-app v1.1.
// Probes local and remote URLs, returns "ok" | "missing" | "unverified".

const PROBE_TIMEOUT_MS = 8000;
const INTER_PROBE_MS   = 500;
const REMOTE_BATCH_SIZE = 20;
const LOCAL_CONCURRENCY = 4;
export const REMOTE_TTL_MS = 24 * 60 * 60 * 1000;

const BROWSER_UNRESOLVABLE = /^(photos-library:|iphoto:|ms-appdata:)/i;

function isElectronCtx() {
  return typeof window !== "undefined" &&
    (window.location?.protocol === "file:" || window.process?.type === "renderer");
}

function probeImage(url, ms) {
  return new Promise(res => {
    const img = new Image(); let ok = false;
    const done = s => { if (ok) return; ok = true; img.onload = null; img.onerror = null; img.src = ""; res(s); };
    const t = setTimeout(() => done("unverified"), ms);
    img.onload  = () => { clearTimeout(t); done("ok"); };
    img.onerror = () => { clearTimeout(t); done("missing"); };
    img.src = url;
  });
}

async function probeFetch(url, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { method: "HEAD", signal: c.signal, cache: "no-store" });
    clearTimeout(t); return r.ok ? "ok" : "missing";
  } catch {
    if (c.signal.aborted) { clearTimeout(t); return "unverified"; }
    const c2 = new AbortController(), t2 = setTimeout(() => c2.abort(), Math.min(ms, 5000));
    try {
      const r2 = await fetch(url, { method: "GET", signal: c2.signal, mode: "no-cors", cache: "no-store" });
      clearTimeout(t2); return r2.type === "opaque" ? "unverified" : (r2.ok ? "ok" : "missing");
    } catch (e) { clearTimeout(t2); return c2.signal.aborted ? "unverified" : "missing"; }
  } finally { clearTimeout(t); }
}

export async function probeUrl(url, mediaType = "image", ms = PROBE_TIMEOUT_MS) {
  if (!url) return "missing";
  if (BROWSER_UNRESOLVABLE.test(url)) return "unverified";
  if (/^file:\/\//i.test(url) && !isElectronCtx()) return "unverified";
  if (mediaType === "image" || /\.(jpe?g|png|gif|webp|svg|bmp|ico|avif|heic)(\?|$)/i.test(url))
    return probeImage(url, ms);
  if (mediaType === "video" || mediaType === "audio") return probeFetch(url, ms);
  const r = await probeImage(url, Math.min(ms, 4000));
  return r !== "unverified" ? r : probeFetch(url, ms);
}

function shouldCheckRemote(item, now = Date.now()) {
  if (!item.url) return false;
  if (!item.last_verified_at) return true;
  return (now - item.last_verified_at) >= REMOTE_TTL_MS;
}

export function itemHealthStatus(item) {
  const s = item.url_status;
  if (!s || s === "unchecked") return "unchecked";
  return s;
}

export function healthSummary(items) {
  const c = { ok: 0, missing: 0, unverified: 0, unchecked: 0 };
  for (const item of items) c[itemHealthStatus(item)]++;
  return c;
}

export async function runLaunchHealthCheck(items, onProgress, signal) {
  const withUrls = items.filter(i => i.url);
  if (!withUrls.length) return [];
  const now = Date.now(), updates = []; let checked = 0;
  for (let i = 0; i < withUrls.length; i += LOCAL_CONCURRENCY) {
    const wave = withUrls.slice(i, i + LOCAL_CONCURRENCY);
    const batch = await Promise.all(wave.map(async item => {
      if (signal?.aborted) return null;
      const status = await probeUrl(item.url, item.media_type || "image");
      checked++; if (onProgress) onProgress(checked, withUrls.length);
      return { id: item.id, url_status: status, last_verified_at: now };
    }));
    updates.push(...batch.filter(Boolean));
    if (i + LOCAL_CONCURRENCY < withUrls.length)
      await new Promise(r => setTimeout(r, 100));
  }
  return updates;
}

export async function runRemoteHealthCheck(items, signal) {
  const now = Date.now();
  const eligible = items.filter(i => shouldCheckRemote(i, now))
    .sort((a, b) => (a.last_verified_at ?? 0) - (b.last_verified_at ?? 0))
    .slice(0, REMOTE_BATCH_SIZE);
  if (!eligible.length) return [];
  const updates = [];
  for (const item of eligible) {
    if (signal?.aborted) break;
    const status = await probeUrl(item.url, item.media_type || "image");
    updates.push({ id: item.id, url_status: status, last_verified_at: now });
    if (INTER_PROBE_MS > 0 && !signal?.aborted)
      await new Promise(r => setTimeout(r, INTER_PROBE_MS));
  }
  return updates;
}

export function applyHealthResults(items, updates) {
  if (!updates?.length) return items;
  const m = new Map(updates.map(u => [u.id, u]));
  return items.map(item => { const u = m.get(item.id); return u ? { ...item, ...u } : item; });
}
