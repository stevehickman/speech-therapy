/**
 * Familiar — Clinician Dashboard
 *
 * Security architecture:
 *
 *  KEY MANAGEMENT
 *   - NaCl crypto_box keypair generated once on setup via libsodium (npm ES module,
 *     bundled by Vite — no dynamic script injection, no window.sodium global).
 *   - secretKey wrapped with AES-GCM using a PBKDF2-derived KEK (600 000 iters).
 *     Only { wrappedSecretKey, salt, iv } are persisted. Plaintext secretKey
 *     lives in React state (_secretKeyBytes) only and is cleared on every lock.
 *   - A separate DEK (data-encryption key) is derived from the same passphrase
 *     with an independent dataSalt. _dataKey is a module-level CryptoKey cleared
 *     on lock alongside _secretKeyBytes.
 *
 *  DATA AT REST  (window.storage)
 *   - familiar_meta   plaintext  { keypair, relay_base_url, migration_complete? }
 *   - familiar_data   AES-GCM    { patients, settings }
 *   - familiar_audit  AES-GCM    [{ ts, patient_id, action }]  (cap 500)
 *   - familiar_clinician  null   (zeroed on first unlock post-migration)
 *
 *  RELAY TRANSPORT
 *   - Zero-knowledge relay: only ciphertext transits; relay stores no plaintext.
 *   - Inbound (clinician → patient): encrypted with patient's pubkey.
 *   - Outbound (patient → clinician): encrypted with clinician's pubkey.
 *   - No patient labels sent to the relay — topic IDs are random UUIDs only.
 *   - Plaintext fallback removed: encryptForPatient returns null when pubkey
 *     absent; callers queue in patient.outbound_queue until next sync.
 *
 *  ACCESS CONTROL
 *   - Passphrase gate on every app open; 5-min idle lock; lock on visibilitychange.
 *   - Passphrase minimum: 12 chars + strength score ≥ 3 (inline scorer).
 *   - CSP: default-src 'self'; connect-src 'self' https:  (no unsafe-inline).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import _sodiumLib from "libsodium-wrappers";

// ─── libsodium initialisation ─────────────────────────────────────────────────
// Imported as a proper ES module (bundled by Vite) — no dynamic script injection,
// no window.sodium global, no StrictMode double-injection race.
let _sodium = null;

async function getSodium() {
  if (_sodium) return _sodium;
  await _sodiumLib.ready;
  _sodium = _sodiumLib;
  return _sodium;
}

// ─── Passphrase strength (inline — no external dependency) ───────────────────
function passphraseStrength(p) {
  if (!p || p.length < 12) return 0;
  let score = 1; // at least 12 chars
  if (p.length >= 16) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  // penalise trivially repeated or sequential patterns
  if (/(.)\1{3,}/.test(p) || /(?:abcd|1234|qwerty|password|passphrase)/i.test(p)) score = Math.max(1, score - 2);
  return Math.min(score, 4); // 0–4
}
const STRENGTH_LABEL = ["", "Weak", "Fair", "Good", "Strong"];
// Hex values match T.coral / T.amber / T.teal — defined here because T is declared later
const STRENGTH_COLOR = ["", "#993C1D", "#BA7517", "#1D9E75", "#1D9E75"];

// ─── Passphrase-derived key wrapping (Web Crypto) ────────────────────────────
const enc = new TextEncoder();

async function deriveKek(passphrase, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function wrapSecretKey(secretKeyBytes, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const kek  = await deriveKek(passphrase, salt);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, secretKeyBytes);
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { wrappedSecretKey: b64(wrapped), salt: b64(salt), iv: b64(iv) };
}

async function unwrapSecretKey(wrappedB64, saltB64, ivB64, passphrase) {
  const from = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const kek  = await deriveKek(passphrase, from(saltB64));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: from(ivB64) },
    kek,
    from(wrappedB64)
  );
  return new Uint8Array(plain); // raw secretKey bytes
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  teal:"#1D9E75", tealDk:"#085041", tealLt:"#E1F5EE", teal2:"#9FE1CB",
  amber:"#BA7517", amberLt:"#FAEEDA", amber2:"#FAC775",
  coral:"#993C1D", coralLt:"#FAECE7", coral2:"#F0997B",
  blue:"#185FA5", blueLt:"#E6F1FB", blue2:"#B5D4F4",
  purple:"#534AB7", purpleLt:"#EEEDFE", purple2:"#AFA9EC",
  gray:"#5F5E5A", grayLt:"#F1EFE8", grayMd:"#B4B2A9",
  black:"#2C2C2A",
  bg:"var(--color-background-primary)",
  bgSec:"var(--color-background-secondary)",
  bgTer:"var(--color-background-tertiary)",
  text:"var(--color-text-primary)",
  textSec:"var(--color-text-secondary)",
  textTer:"var(--color-text-tertiary)",
  border:"var(--color-border-tertiary)",
  borderSec:"var(--color-border-secondary)",
  radius:"var(--border-radius-lg)",
  radiusMd:"var(--border-radius-md)",
};

// ─── Exercise catalogue (mirrors patient app) ────────────────────────────────
const EXERCISES = [
  { slug:"name-image",    title:"Name what you see",    skill:"Naming",   difficulty:2 },
  { slug:"who-is-this",   title:"Who is this?",         skill:"Naming",   difficulty:2 },
  { slug:"remember-facts",title:"Remember a person",    skill:"Memory",   difficulty:3 },
  { slug:"match-word",    title:"Match words to images", skill:"Reading",  difficulty:2 },
  { slug:"spell-word",    title:"Spell what you hear",   skill:"Spelling", difficulty:2 },
  { slug:"repeat-phrase", title:"Repeat this phrase",    skill:"Speaking", difficulty:1 },
  { slug:"sequence",      title:"Put these in order",    skill:"Reasoning",difficulty:3 },
  { slug:"read-aloud",    title:"Read this aloud",       skill:"Speaking", difficulty:2 },
  { slug:"count-objects", title:"Count and calculate",   skill:"Math",     difficulty:2 },
  { slug:"identify-word", title:"Identify real words",   skill:"Reading",  difficulty:2 },
];

const SKILLS = ["Naming","Memory","Speaking","Reading","Spelling","Math","Reasoning"];

// ─── Default state ────────────────────────────────────────────────────────────
const DEFAULT_STATE = {
  keypair: null,          // { publicKey: base64, wrappedSecretKey: base64, salt: base64, iv: base64 }
  relay_base_url: "",
  patients: [],           // see makePatientShape() for shape
  settings: { notifications: true, retention_months: 24 },
};

const RETENTION_MS = months => months * 30 * 86_400_000;

function prunePatients(patients, retentionMonths) {
  const cutoff = Date.now() - RETENTION_MS(retentionMonths);
  return patients.map(p => ({
    ...p,
    sessions:    p.sessions.filter(s => new Date(s.completed_at).getTime() > cutoff),
    messages:    p.messages.filter(m => new Date(m.sent_at).getTime() > cutoff),
    assignments: p.assignments.filter(a => new Date(a.sent_at).getTime() > cutoff),
  }));
}

// ─── Data-at-rest encryption ──────────────────────────────────────────────────
// DEK lives only in memory after unlock, same lifecycle as secretKeyBytes.
let _dataKey = null;

// Derives a data-encryption key from the passphrase using an independent salt
// (different from the KEK salt used to wrap the NaCl secret key).
async function deriveDataKey(passphrase, dataSalt) {
  return deriveKek(passphrase, dataSalt);
}

async function encryptBlob(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, _dataKey, enc.encode(JSON.stringify(obj)));
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return JSON.stringify({ enc: true, ct: b64(ct), iv: b64(iv) });
}

// Set to true after the first successful encrypted write. Once set, decryptBlob rejects
// any plaintext blob — the migration window is permanently closed.
let _migrationComplete = false;

async function decryptBlob(raw) {
  const parsed = JSON.parse(raw);
  const from   = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  if (!parsed.enc) {
    if (_migrationComplete) throw new Error("expected encrypted blob — rejecting plaintext after migration");
    return parsed; // accept plaintext only during the one-time migration window
  }
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: from(parsed.iv) }, _dataKey, from(parsed.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

// ─── Persistence ─────────────────────────────────────────────────────────────
async function storageGet(key) {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
}

async function storageSet(key, val) {
  try {
    if (key !== "familiar_clinician" || !_dataKey) {
      await window.storage.set(key, JSON.stringify(val));
      return;
    }
    // Split: keypair + relay URL stay plaintext (needed pre-unlock);
    //        patients + settings are encrypted with the DEK.
    const { keypair, relay_base_url, ...dataFields } = val;
    await window.storage.set("familiar_meta", JSON.stringify({ keypair, relay_base_url, migration_complete: true }));
    await window.storage.set("familiar_data", await encryptBlob(dataFields));
    // Mark migration complete in-memory and in storage so the flag survives app restarts.
    _migrationComplete = true;
  } catch {}
}

// ─── Audit trail ─────────────────────────────────────────────────────────────
const AUDIT_KEY = "familiar_audit";
const AUDIT_CAP = 500;

// Appends { ts, patient_id, action } encrypted with the DEK when available.
// Falls back to plaintext only before first unlock (DEK not yet in memory).
async function audit(action, patientId = null) {
  try {
    const existing = await loadAuditLog();
    const updated  = [...existing, { ts: Date.now(), patient_id: patientId, action }].slice(-AUDIT_CAP);
    if (_dataKey) {
      await window.storage.set(AUDIT_KEY, await encryptBlob(updated));
    } else {
      await window.storage.set(AUDIT_KEY, JSON.stringify(updated));
    }
  } catch {}
}

async function loadAuditLog() {
  try {
    const raw = await window.storage.get(AUDIT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw.value);
    // Encrypted format: { enc: true, ct, iv }
    if (parsed?.enc && _dataKey) return await decryptBlob(raw.value);
    // Plaintext format (pre-migration entries): return as-is
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch { return []; }
}
// Phase 1 load (pre-unlock): reads only keypair + relay URL, no patient data.
async function loadState() {
  // New split format: familiar_meta holds keypair + relay_base_url (plaintext).
  try {
    const raw = await window.storage.get("familiar_meta");
    if (raw) {
      const meta = JSON.parse(raw.value);
      if (meta.migration_complete) _migrationComplete = true;
      return { ...DEFAULT_STATE, keypair: meta.keypair || null, relay_base_url: meta.relay_base_url || "" };
    }
  } catch {}
  // Legacy single-blob fallback.
  const s = await storageGet("familiar_clinician");
  if (!s) return DEFAULT_STATE;
  // Return only non-PHI fields for the pre-unlock shell; patient data merged after unlock.
  return { ...DEFAULT_STATE, keypair: s.keypair || null, relay_base_url: s.relay_base_url || "", settings: { ...DEFAULT_STATE.settings, ...s.settings } };
}

// Phase 2 load (post-unlock): decrypts and returns patients + settings.
// Always falls through to legacy plaintext path when no encrypted data exists,
// so existing users who haven't yet migrated to encrypted storage are not affected.
async function loadPatientData() {
  if (_dataKey) {
    try {
      const raw = await window.storage.get("familiar_data");
      if (raw) {
        const data = await decryptBlob(raw.value);
        const settings = { ...DEFAULT_STATE.settings, ...data.settings };
        return { settings, patients: prunePatients((data.patients || []).map(p => ({ ...makePatientShape(), ...p })), settings.retention_months) };
      }
    } catch {}
  }
  // No encrypted data yet (new encrypted format not written, or no DEK for legacy user):
  // load from legacy plaintext blob.
  const legacy = await storageGet("familiar_clinician");
  if (!legacy) return { settings: DEFAULT_STATE.settings, patients: [] };
  const settings = { ...DEFAULT_STATE.settings, ...legacy.settings };
  return { settings, patients: prunePatients((legacy.patients || []).map(p => ({ ...makePatientShape(), ...p })), settings.retention_months) };
}

function makePatientShape(overrides = {}) {
  return {
    id:                    `pt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label:                 "",          // clinician's internal label — not patient's legal name
    topic_id:              null,
    poll_token:            null,
    inbound_publish_token: null,
    registration_url:      null,
    registered:            false,
    patient_pubkey:        null,        // received from relay after patient registers
    out_sequence:          0,           // highest sequence acked so far
    sessions:              [],          // decrypted result session objects
    messages:              [],          // { direction, text, sent_at, packet_id }
    assignments:           [],          // { exercise_slug, prescribed_difficulty, note, sent_at }
    outbound_queue:        [],          // { type, data, queued_at } — drained once patient_pubkey arrives
    notes:                 "",
    condition_type:        "acute_aphasia",
    bkt_snapshots:         {},
    last_sync:             null,
    created_at:            new Date().toISOString(),
    ...overrides,
  };
}

// ─── BKT trajectory (clinician read-only; mirrors bkt-v2.js) ─────────────────

const CLIN_BKT_SKILLS = ["Naming","Memory","Speaking","Reading","Spelling","Math","Reasoning"];

const CLIN_CONDITION_PROFILES = {
  acute_aphasia:      { label:"Acute aphasia",             p_regress:0,     half_life_days:30, trajectory_window:5, alert_decline_threshold:-0.05 },
  chronic_aphasia:    { label:"Chronic aphasia",           p_regress:0.005, half_life_days:14, trajectory_window:5, alert_decline_threshold:-0.04 },
  primary_progressive:{ label:"Primary progressive (PPA)", p_regress:0.015, half_life_days:7,  trajectory_window:4, alert_decline_threshold:-0.03 },
  tbi:                { label:"Traumatic brain injury",    p_regress:0,     half_life_days:21, trajectory_window:5, alert_decline_threshold:-0.05 },
  dementia:           { label:"Dementia",                  p_regress:0.025, half_life_days:5,  trajectory_window:4, alert_decline_threshold:-0.02 },
};
const CLIN_DEFAULT_CONDITION = "acute_aphasia";

function clinTrajectory(snapshots, conditionType = CLIN_DEFAULT_CONDITION) {
  const profile = CLIN_CONDITION_PROFILES[conditionType] ?? CLIN_CONDITION_PROFILES[CLIN_DEFAULT_CONDITION];
  const recent  = (snapshots || []).slice(-profile.trajectory_window);
  if (recent.length < 2) return { trend:"insufficient_data", slope:0, slopePerSession:0, alertFlag:false, n:recent.length };
  const t0 = recent[0].timestamp_ms;
  const xs  = recent.map(s => (s.timestamp_ms - t0) / 86_400_000);
  const ys  = recent.map(s => s.knowledge);
  const n = recent.length;
  const xm = xs.reduce((a,b) => a+b, 0) / n;
  const ym = ys.reduce((a,b) => a+b, 0) / n;
  const num = xs.reduce((a,x,i) => a + (x-xm)*(ys[i]-ym), 0);
  const den = xs.reduce((a,x)   => a + (x-xm)**2, 0);
  const slope = den > 0 ? num / den : 0;
  const sps   = slope * (xs.at(-1) / Math.max(1, n-1));
  const trend = sps > 0.02 ? "improving" : sps < -0.02 ? "declining" : "stable";
  return { trend, slope, slopePerSession: sps, alertFlag: sps < profile.alert_decline_threshold, n };
}

function clinAllTrajectories(skillSnapshots, conditionType = CLIN_DEFAULT_CONDITION) {
  return Object.fromEntries(
    CLIN_BKT_SKILLS.map(skill => [skill, clinTrajectory((skillSnapshots||{})[skill] || [], conditionType)])
  );
}

// ─── Crypto ──────────────────────────────────────────────────────────────────
/**
 * Decrypt a result packet published by the patient app.
 * Accepts only real libsodium box ciphertext — plaintext fallback removed
 * to preserve the zero-knowledge relay guarantee.
 */
async function decryptPacket(payload, secretKeyBytes, senderPubkeyB64) {
  try {
    const sodium = await getSodium();
    const ciphertext = sodium.from_base64(payload);
    const NONCE_BYTES = sodium.crypto_box_NONCEBYTES; // 24
    if (ciphertext.length <= NONCE_BYTES) throw new Error("too short");
    const nonce = ciphertext.slice(0, NONCE_BYTES);
    const ct    = ciphertext.slice(NONCE_BYTES);
    const sk    = typeof secretKeyBytes === "string" ? sodium.from_base64(secretKeyBytes) : secretKeyBytes;
    const pk    = sodium.from_base64(senderPubkeyB64);
    const plain = sodium.crypto_box_open_easy(ct, nonce, pk, sk);
    const data  = JSON.parse(sodium.to_string(plain));
    return { ok: true, data };
  } catch {
    return { ok: false, data: null };
  }
}

/**
 * Encrypt a message/assignment for the patient using their public key.
 * Returns null if the patient hasn't registered yet (no public key).
 * Callers must queue the packet locally and retry after the next sync.
 */
async function encryptForPatient(data, patientPubkeyB64, clinicianSecretKeyBytes) {
  if (!patientPubkeyB64 || !clinicianSecretKeyBytes) return null;
  try {
    const sodium = await getSodium();
    const pk     = sodium.from_base64(patientPubkeyB64);
    const sk     = typeof clinicianSecretKeyBytes === "string"
                     ? sodium.from_base64(clinicianSecretKeyBytes)
                     : clinicianSecretKeyBytes;
    const nonce  = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    const plain  = sodium.from_string(JSON.stringify(data));
    const ct     = sodium.crypto_box_easy(plain, nonce, pk, sk);
    const full   = new Uint8Array(nonce.length + ct.length);
    full.set(nonce); full.set(ct, nonce.length);
    return sodium.to_base64(full);
  } catch {
    return null;
  }
}

// ─── Relay API calls (clinician-side) ────────────────────────────────────────
async function relayCreateTopic(baseUrl, clinicianPubkey) {
  const res = await fetch(`${baseUrl}/topics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clinician_pubkey: clinicianPubkey }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function relayGetTopic(baseUrl, topicId, pollToken) {
  const res = await fetch(`${baseUrl}/topics/${topicId}`, {
    headers: { Authorization: `Bearer ${pollToken}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function relayPollPackets(baseUrl, topicId, pollToken, sinceSequence = 0) {
  const res = await fetch(
    `${baseUrl}/topics/${topicId}/packets?since_sequence=${sinceSequence}&limit=100`,
    { headers: { Authorization: `Bearer ${pollToken}` } }
  );
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function relayAckPacket(baseUrl, topicId, pollToken, packetId) {
  await fetch(`${baseUrl}/topics/${topicId}/packets/${packetId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${pollToken}` },
  });
}

async function relaySendInbound(baseUrl, topicId, publishToken, payload) {
  const res = await fetch(`${baseUrl}/topics/${topicId}/inbound`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${publishToken}` },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function relayDeleteTopic(baseUrl, topicId, pollToken) {
  await fetch(`${baseUrl}/topics/${topicId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${pollToken}` },
  });
}

// ─── Sync logic ───────────────────────────────────────────────────────────────
/**
 * Poll the relay for a single patient, decrypt all new packets, drain any
 * queued outbound packets once the patient's public key is known, and return
 * the updated patient object. Pure — does not mutate state.
 *
 * secretKeyBytes is the in-memory Uint8Array unlocked by the clinician's
 * passphrase — it is never read from persistent storage here.
 */
async function syncPatient(patient, secretKeyBytes, baseUrl) {
  if (!patient.topic_id || !patient.poll_token) return { patient, newCount: 0 };

  let topicStatus = null;
  try {
    topicStatus = await relayGetTopic(baseUrl, patient.topic_id, patient.poll_token);
  } catch {}

  let packets = [];
  try {
    const result = await relayPollPackets(baseUrl, patient.topic_id, patient.poll_token, patient.out_sequence);
    packets = result.packets || [];
  } catch { return { patient, newCount: 0 }; }

  if (packets.length === 0 && !topicStatus) return { patient, newCount: 0 };

  const resolvedPubkey = topicStatus?.patient_pubkey ?? patient.patient_pubkey;

  // Decrypt inbound packets
  const newSessions  = [...patient.sessions];
  const updatedSnaps = { ...(patient.bkt_snapshots || {}) };
  let newOutSequence = patient.out_sequence;
  let newCount = 0;

  for (const pkt of packets) {
    if (!resolvedPubkey) continue; // no pubkey yet → cannot decrypt; skip
    const { ok, data } = await decryptPacket(pkt.payload, secretKeyBytes, resolvedPubkey);
    if (ok && data?.attempts) {
      if (!newSessions.some(s => s.session_id === data.session_id)) {
        newSessions.push({ ...data, packet_id: pkt.id, received_at: pkt.created_at });
        newCount++;
      }
    }
    if (ok && data?.bkt_snapshots) {
      for (const [skill, snaps] of Object.entries(data.bkt_snapshots)) {
        const arr = Array.isArray(snaps) ? snaps : [snaps];
        const existing = updatedSnaps[skill] || [];
        updatedSnaps[skill] = [...existing, ...arr]
          .sort((a, b) => a.timestamp_ms - b.timestamp_ms)
          .filter((s, i, a) => i === 0 || s.timestamp_ms !== a[i-1].timestamp_ms)
          .slice(-20);
      }
    }
    if (ok) {
      await relayAckPacket(baseUrl, patient.topic_id, patient.poll_token, pkt.id);
      if (pkt.sequence > newOutSequence) newOutSequence = pkt.sequence;
    }
  }

  // Drain outbound queue now that we have the patient's public key
  let remainingQueue = [...(patient.outbound_queue || [])];
  if (resolvedPubkey && remainingQueue.length > 0) {
    const stillPending = [];
    for (const item of remainingQueue) {
      const payload = await encryptForPatient(item.data, resolvedPubkey, secretKeyBytes);
      if (payload) {
        try {
          await relaySendInbound(baseUrl, patient.topic_id, patient.inbound_publish_token, payload);
        } catch {
          stillPending.push(item); // retry next sync
        }
      } else {
        stillPending.push(item);
      }
    }
    remainingQueue = stillPending;
  }

  return {
    patient: {
      ...patient,
      registered:     topicStatus?.patient_registered ?? patient.registered,
      patient_pubkey: resolvedPubkey,
      out_sequence:   newOutSequence,
      sessions:       newSessions,
      bkt_snapshots:  updatedSnaps,
      outbound_queue: remainingQueue,
      last_sync:      Date.now(),
    },
    newCount,
  };
}

// ─── Score helpers ────────────────────────────────────────────────────────────
function skillScores(patient) {
  const map = {};
  for (const skill of SKILLS) map[skill] = [];
  for (const sess of patient.sessions) {
    for (const att of sess.attempts || []) {
      if (!map[att.skill_area]) map[att.skill_area] = [];
      map[att.skill_area].push(att.score);
    }
  }
  return map;
}

function avgScore(arr) {
  if (!arr || arr.length === 0) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function weeklySessionCount(patient) {
  const cutoff = Date.now() - 7 * 86_400_000;
  return patient.sessions.filter(s => new Date(s.completed_at).getTime() > cutoff).length;
}

function lastActiveDate(patient) {
  if (patient.sessions.length === 0) return null;
  return new Date(patient.sessions.at(-1).completed_at);
}

function inactivityDays(patient) {
  const d = lastActiveDate(patient);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

// ─── UI primitives ────────────────────────────────────────────────────────────
const card = {
  background: T.bg, border: `0.5px solid ${T.border}`,
  borderRadius: T.radius, padding: "1rem 1.25rem",
};
const pill = (bg, col, size = 11) => ({
  display: "inline-block", background: bg, color: col,
  fontSize: size, fontWeight: 500, padding: "3px 10px", borderRadius: 99,
});
const btn = (bg, col, border) => ({
  padding: "9px 16px", background: bg, color: col, border: border || "none",
  borderRadius: T.radiusMd, fontSize: 13, fontWeight: 500, cursor: "pointer",
});

function Input({ value, onChange, placeholder, style, type = "text", multiline, disabled, onKeyDown }) {
  const s = {
    width: "100%", padding: "9px 12px", fontSize: 13, borderRadius: T.radiusMd,
    border: `0.5px solid ${T.borderSec}`, background: T.bg, color: T.text,
    boxSizing: "border-box", fontFamily: "var(--font-sans)", opacity: disabled ? 0.5 : 1, ...style,
  };
  return multiline
    ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...s, resize: "vertical" }} disabled={disabled} />
    : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={s} disabled={disabled} onKeyDown={onKeyDown} />;
}

function Avatar({ name, size = 36, bg = T.tealLt, color = T.tealDk }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 500, color, flexShrink: 0 }}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

function ProgressBar({ value, max = 100, color, height = 5 }) {
  return (
    <div style={{ height, background: T.bgSec, borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min((value / max) * 100, 100)}%`, background: color || T.teal, borderRadius: 99, transition: "width 0.4s" }} />
    </div>
  );
}

function AlertBadge({ type }) {
  const cfg = {
    inactive:    { bg: T.coralLt, color: T.coral,  label: "inactive" },
    no_sessions: { bg: T.amberLt, color: T.amber,  label: "no data yet" },
    declining:   { bg: T.coralLt, color: T.coral,  label: "↓ declining" },
  }[type] || null;
  if (!cfg) return null;
  return <span style={{ ...pill(cfg.bg, cfg.color, 10) }}>{cfg.label}</span>;
}

function SkillBar({ skill, scores, trajectory }) {
  const arr      = scores[skill] || [];
  const avg      = avgScore(arr);
  const recent   = arr.slice(-5);
  const prev     = avg && recent.length > 1 ? avgScore(arr.slice(-10, -5)) : null;
  const trend    = (prev && avg) ? avg - prev : 0;
  const barColor = avg >= 80 ? T.teal : avg >= 60 ? T.amber : T.coral;
  const ARROWS   = { improving:"↑", stable:"→", declining:"↓" };
  const TCOLORS  = { improving:T.teal, stable:T.textTer, declining:T.coral };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 13 }}>{skill}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {trend !== 0 && <span style={{ fontSize: 10, color: trend > 0 ? T.teal : T.coral }}>{trend > 0 ? "+" : ""}{trend}%</span>}
          {trajectory?.n >= 2 && ARROWS[trajectory.trend] && (
            <span style={{ fontSize: 12, fontWeight: 500, color: TCOLORS[trajectory.trend] }}
              title={`${trajectory.n}-session trend`}>
              {ARROWS[trajectory.trend]}
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 500 }}>{avg !== null ? `${avg}%` : "—"}</span>
        </div>
      </div>
      <ProgressBar value={avg || 0} color={barColor} />
      {arr.length > 0 && <div style={{ fontSize: 10, color: T.textTer, marginTop: 2 }}>{arr.length} attempt{arr.length !== 1 ? "s" : ""}</div>}
    </div>
  );
}

// ─── Mini session sparkline ───────────────────────────────────────────────────
function SessionSparkline({ sessions, width = 160, height = 36 }) {
  if (sessions.length === 0) return <span style={{ fontSize: 11, color: T.textTer }}>no sessions</span>;
  const last = sessions.slice(-12);
  const scores = last.map(s => {
    const atts = s.attempts || [];
    return atts.length ? Math.round(atts.reduce((a, b) => a + (b.score || 0), 0) / atts.length) : 0;
  });
  const barW  = Math.floor((width - (last.length - 1) * 3) / last.length);
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      {scores.map((score, i) => {
        const barH = Math.max(3, Math.round((score / 100) * (height - 4)));
        return (
          <rect key={i}
            x={i * (barW + 3)} y={height - barH}
            width={barW} height={barH}
            rx={2}
            fill={i === scores.length - 1 ? T.teal : T.teal2}
          />
        );
      })}
    </svg>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [state, _setState] = useState(null);
  // secretKeyBytes lives only in React state — never persisted to storage
  const [secretKeyBytes, setSecretKeyBytes] = useState(null);
  const [screen, setScreen]         = useState("roster");
  const [activePatientId, setActivePatientId] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [sodiumReady, setSodiumReady] = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [syncError, setSyncError]   = useState(null);
  const [newPacketCount, setNewPacketCount] = useState(0);

  const setState = useCallback(async updater => {
    _setState(prev => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      storageSet("familiar_clinician", next);
      return next;
    });
  }, []);

  // Load sodium and persisted state
  useEffect(() => {
    getSodium().then(() => setSodiumReady(true)).catch(() => {});
    loadState().then(s => { _setState(s); setLoading(false); });
  }, []);

  const activePatient = state?.patients?.find(p => p.id === activePatientId) || null;
  const needsSetup    = state && (!state.keypair?.wrappedSecretKey || !state.relay_base_url);
  // Show passphrase unlock if keypair exists but secret key isn't in memory yet
  const needsUnlock   = state && state.keypair && !needsSetup && !secretKeyBytes;

  // Merge patient data into state after unlock (called by both unlock screens).
  const handleUnlock = useCallback((sk, data = null) => {
    setSecretKeyBytes(sk);
    if (data?.patients) {
      _setState(prev => ({ ...prev, patients: data.patients, settings: { ...DEFAULT_STATE.settings, ...data.settings } }));
    }
  }, []);

  // Lock after 5 minutes of inactivity or when the app is hidden.
  // Clears both secretKeyBytes and the module-level DEK.
  useEffect(() => {
    if (!secretKeyBytes) return;
    const lock = () => { _dataKey = null; setSecretKeyBytes(null); };
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(lock, 5 * 60_000); };
    const onHide = () => { if (document.hidden) lock(); };
    document.addEventListener("visibilitychange", onHide);
    document.addEventListener("pointerdown", reset);
    document.addEventListener("keydown", reset);
    reset();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("pointerdown", reset);
      document.removeEventListener("keydown", reset);
    };
  }, [secretKeyBytes]);

  // Auto-sync every 3 minutes when relay is configured and unlocked
  useEffect(() => {
    if (!secretKeyBytes || !state?.relay_base_url || needsSetup) return;
    const doSync = async () => syncAll(false);
    const t = setInterval(doSync, 3 * 60_000);
    return () => clearInterval(t);
  }, [secretKeyBytes, state?.relay_base_url, needsSetup]);

  async function syncAll(showError = true) {
    if (!secretKeyBytes || !state?.relay_base_url) return;
    setSyncing(true); setSyncError(null);
    audit("sync_all");
    let total = 0;
    try {
      const updated = await Promise.all(
        state.patients.map(p => syncPatient(p, secretKeyBytes, state.relay_base_url))
      );
      total = updated.reduce((a, u) => a + u.newCount, 0);
      setState(s => ({ ...s, patients: updated.map(u => u.patient) }));
      if (total > 0) setNewPacketCount(c => c + total);
    } catch {
      if (showError) setSyncError("Sync failed — check your relay connection.");
    }
    setSyncing(false);
  }

  async function syncOne(patientId) {
    if (!secretKeyBytes || !state?.relay_base_url) return;
    setSyncing(true); setSyncError(null);
    audit("sync_one", patientId);
    try {
      const patient = state.patients.find(p => p.id === patientId);
      if (!patient) return;
      const { patient: updated, newCount } = await syncPatient(patient, secretKeyBytes, state.relay_base_url);
      setState(s => ({ ...s, patients: s.patients.map(p => p.id === patientId ? updated : p) }));
      if (newCount > 0) setNewPacketCount(c => c + newCount);
    } catch { setSyncError("Sync failed — check your relay connection."); }
    setSyncing(false);
  }

  async function createPatientTopic(label) {
    const topic = await relayCreateTopic(state.relay_base_url, state.keypair.publicKey);
    const patient = makePatientShape({
      label,
      topic_id:              topic.topic_id,
      poll_token:            topic.poll_token,
      inbound_publish_token: topic.inbound_publish_token,
      registration_url:      topic.registration_url,
    });
    setState(s => ({ ...s, patients: [...s.patients, patient] }));
    return patient;
  }

  async function sendAssignment(patient, assignment) {
    audit("assignment_send", patient.id);
    const data = { type: "assignment", ...assignment, sent_at: new Date().toISOString() };
    const payload = await encryptForPatient(data, patient.patient_pubkey, secretKeyBytes);
    if (!payload) {
      // Patient not yet registered — queue locally
      setState(s => ({
        ...s,
        patients: s.patients.map(p => p.id !== patient.id ? p : {
          ...p,
          outbound_queue: [...(p.outbound_queue || []), { type: "assignment", data, queued_at: new Date().toISOString() }],
          assignments:    [...p.assignments, { ...assignment, sent_at: new Date().toISOString() }],
        }),
      }));
      return;
    }
    await relaySendInbound(state.relay_base_url, patient.topic_id, patient.inbound_publish_token, payload);
    setState(s => ({
      ...s,
      patients: s.patients.map(p => p.id !== patient.id ? p : {
        ...p,
        assignments: [...p.assignments, { ...assignment, sent_at: new Date().toISOString() }],
      }),
    }));
  }

  async function sendMessage(patient, text) {
    audit("message_send", patient.id);
    const data = { type: "message", text, sent_at: new Date().toISOString() };
    const payload = await encryptForPatient(data, patient.patient_pubkey, secretKeyBytes);
    if (!payload) {
      // Patient not yet registered — queue locally
      setState(s => ({
        ...s,
        patients: s.patients.map(p => p.id !== patient.id ? p : {
          ...p,
          outbound_queue: [...(p.outbound_queue || []), { type: "message", data, queued_at: new Date().toISOString() }],
          messages:       [...p.messages, { direction: "out", text, sent_at: new Date().toISOString() }],
        }),
      }));
      return;
    }
    await relaySendInbound(state.relay_base_url, patient.topic_id, patient.inbound_publish_token, payload);
    setState(s => ({
      ...s,
      patients: s.patients.map(p => p.id !== patient.id ? p : {
        ...p,
        messages: [...p.messages, { direction: "out", text, sent_at: new Date().toISOString() }],
      }),
    }));
  }

  function removePatient(id) {
    const patient = state.patients.find(p => p.id === id);
    if (patient?.topic_id && patient?.poll_token) {
      relayDeleteTopic(state.relay_base_url, patient.topic_id, patient.poll_token).catch(() => {});
    }
    setState(s => ({ ...s, patients: s.patients.filter(p => p.id !== id) }));
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: T.textTer, fontSize: 14 }}>
      Loading…
    </div>
  );
  if (!state) return null;

  const navTo = (s, patientId = null) => {
    setScreen(s);
    if (patientId !== undefined) setActivePatientId(patientId);
    setSyncError(null);
    if (s === "patient" && patientId) audit("patient_open", patientId);
  };

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: T.text, background: T.bgTer, minHeight: "100vh", display: "flex", flexDirection: "column", maxWidth: 720, margin: "0 auto" }}>
      {needsSetup
        ? <SetupScreen state={state} setState={setState} sodiumReady={sodiumReady} onUnlock={handleUnlock} />
        : needsUnlock
        ? <PassphraseUnlockScreen keypair={state.keypair} onUnlock={handleUnlock} />
        : <>
            <Header state={state} screen={screen} syncing={syncing} syncError={syncError}
              onSync={() => activePatient ? syncOne(activePatient.id) : syncAll()} navTo={navTo} newPacketCount={newPacketCount} />

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 90px" }}>
              {screen === "roster"   && <RosterScreen   state={state} navTo={navTo} />}
              {screen === "patient"  && activePatient && (
                <PatientScreen
                  patient={activePatient} state={state}
                  onSync={() => syncOne(activePatient.id)}
                  onSendAssignment={a => sendAssignment(activePatient, a)}
                  onSendMessage={t => sendMessage(activePatient, t)}
                  onRemove={() => { removePatient(activePatient.id); navTo("roster"); }}
                  onUpdateNotes={notes => setState(s => ({ ...s, patients: s.patients.map(p => p.id === activePatient.id ? { ...p, notes } : p) }))}
                  onUpdateCondition={ct => setState(s => ({ ...s, patients: s.patients.map(p => p.id === activePatient.id ? { ...p, condition_type: ct } : p) }))}
                  onUpdatePatient={patch => setState(s => ({ ...s, patients: s.patients.map(p => p.id === activePatient.id ? { ...p, ...patch } : p) }))}
                  navTo={navTo}
                />
              )}
              {screen === "new"      && <NewPatientScreen state={state} onCreate={createPatientTopic} navTo={navTo} />}
              {screen === "settings" && <SettingsScreen state={state} setState={setState} sodiumReady={sodiumReady} />}
            </div>

            <BottomNav screen={screen} navTo={navTo} />
          </>
      }
    </div>
  );
}

// ─── Passphrase unlock screen (shown on every app open after initial setup) ────
function PassphraseUnlockScreen({ keypair, onUnlock }) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError]           = useState(null);
  const [unlocking, setUnlocking]   = useState(false);

  async function unlock() {
    if (!passphrase) return;
    setUnlocking(true); setError(null);
    try {
      const sk = await unwrapSecretKey(keypair.wrappedSecretKey, keypair.salt, keypair.iv, passphrase);
      // Derive DEK from the same passphrase (independent salt stored in keypair).
      if (keypair.dataSalt) {
        const from = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        _dataKey = await deriveDataKey(passphrase, from(keypair.dataSalt));
      }
      const data = await loadPatientData();
      // One-time migration: zero the legacy plaintext key now that encrypted data is loaded.
      // This runs only when familiar_clinician still has plaintext (pre-migration users).
      try {
        const legacy = await window.storage.get("familiar_clinician");
        if (legacy && JSON.parse(legacy.value) !== null) {
          await window.storage.set("familiar_clinician", JSON.stringify(null));
        }
      } catch {}
      onUnlock(sk, data);
    } catch {
      _dataKey = null;
      setError("Incorrect passphrase. Please try again.");
    }
    setUnlocking(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "2rem" }}>
      <div style={{ ...card, maxWidth: 400, width: "100%" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: T.purpleLt, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.purple} strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 4 }}>Unlock Familiar</p>
        <p style={{ fontSize: 13, color: T.textSec, marginBottom: 16 }}>Enter your passphrase to decrypt your private key and access patient records.</p>
        <Input type="password" value={passphrase} onChange={setPassphrase} placeholder="Passphrase" style={{ marginBottom: 10 }}
          onKeyDown={e => e.key === "Enter" && unlock()} />
        {error && <p style={{ fontSize: 12, color: T.coral, marginBottom: 10 }}>{error}</p>}
        <button onClick={unlock} disabled={unlocking || !passphrase} style={{ ...btn(T.purple, "white"), width: "100%", opacity: unlocking || !passphrase ? 0.6 : 1 }}>
          {unlocking ? "Unlocking…" : "Unlock"}
        </button>
      </div>
    </div>
  );
}

// ─── Setup screen ──────────────────────────────────────────────────────────────
function SetupScreen({ state, setState, sodiumReady, onUnlock }) {
  const [step, setStep]           = useState(state.keypair ? 2 : 0);
  const [relayUrl, setRelayUrl]   = useState(state.relay_base_url || "");
  const [passphrase, setPassphrase] = useState("");
  const [passphrase2, setPassphrase2] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(!!state.keypair);
  // Hold raw secretKey bytes in memory during setup so we can call onUnlock at finish
  const rawSecretKeyRef = useRef(null);

  async function generate() {
    setGenerating(true);
    try {
      const sodium = await getSodium();
      const kp     = sodium.crypto_box_keypair();
      rawSecretKeyRef.current = kp.privateKey; // raw Uint8Array — never persisted
      // Store only the public key for now; wrap after passphrase is set
      await setState(s => ({ ...s, keypair: { publicKey: sodium.to_base64(kp.publicKey) } }));
      setGenerated(true);
      setStep(1);
    } finally { setGenerating(false); }
  }

  async function setPassphraseAndAdvance() {
    if (!passphrase || passphrase !== passphrase2) return;
    if (passphraseStrength(passphrase) < 3) return; // enforced by UI — guard here too
    const dataSalt = crypto.getRandomValues(new Uint8Array(16));
    const b64      = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const wrapped  = await wrapSecretKey(rawSecretKeyRef.current, passphrase);
    const publicKey = state.keypair.publicKey;
    // Store dataSalt alongside keypair (not sensitive — used only for DEK derivation).
    await setState(s => ({ ...s, keypair: { publicKey, ...wrapped, dataSalt: b64(dataSalt) } }));
    // Derive and cache the DEK so it's ready when finish() calls onUnlock.
    _dataKey = await deriveDataKey(passphrase, dataSalt);
    setStep(2);
  }

  async function finish() {
    if (!relayUrl.trim()) return;
    await setState(s => ({ ...s, relay_base_url: relayUrl.trim().replace(/\/$/, "") }));
    onUnlock(rawSecretKeyRef.current, null); // new user — no patient data yet
  }

  const passphraseMatch = passphrase && passphrase === passphrase2;
  const strength        = passphraseStrength(passphrase);
  const passphraseOk    = passphrase.length >= 12 && strength >= 3;

  return (
    <div style={{ padding: "3rem 2rem", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: T.purple, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
      </div>
      <p style={{ fontSize: 22, fontWeight: 500, marginBottom: 6 }}>Familiar — Clinician</p>
      <p style={{ fontSize: 14, color: T.textSec, marginBottom: 32 }}>Set up once. Your encryption key is protected by a passphrase you choose.</p>

      {/* Step 0: generate keypair */}
      <div style={{ ...card, marginBottom: 12, border: step === 0 ? `2px solid ${T.purple}` : `0.5px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: generated ? T.tealLt : T.purpleLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, color: generated ? T.tealDk : T.purple }}>
            {generated ? "✓" : "1"}
          </div>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Generate your encryption keypair</span>
        </div>
        <p style={{ fontSize: 12, color: T.textSec, marginBottom: generated ? 0 : 12 }}>
          Creates a public/private keypair. Patient result packets are encrypted so only you can read them.
        </p>
        {!generated && (
          <button onClick={generate} disabled={!sodiumReady || generating} style={{ ...btn(T.purple, "white"), opacity: !sodiumReady || generating ? 0.6 : 1 }}>
            {generating ? "Generating…" : !sodiumReady ? "Loading crypto library…" : "Generate keypair"}
          </button>
        )}
      </div>

      {/* Step 1: choose passphrase */}
      <div style={{ ...card, marginBottom: 12, border: step === 1 ? `2px solid ${T.purple}` : `0.5px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: step >= 1 ? T.purpleLt : T.bgSec, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, color: step >= 1 ? T.purple : T.textTer }}>2</div>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Choose a passphrase</span>
        </div>
        <p style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>
          Your private key will be encrypted with this passphrase. You will need it every time you open the app. Store it safely — it cannot be recovered.
        </p>
        <Input type="password" value={passphrase} onChange={setPassphrase} placeholder="Passphrase" style={{ marginBottom: 8 }} disabled={step < 1} />
        {passphrase.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 3 }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: strength >= i ? STRENGTH_COLOR[strength] : T.bgSec, transition: "background 0.2s" }} />
              ))}
            </div>
            <p style={{ fontSize: 10, color: STRENGTH_COLOR[strength] || T.textTer }}>
              {strength > 0 ? STRENGTH_LABEL[strength] : `At least 12 characters (${passphrase.length}/12)`}
              {strength > 0 && strength < 3 && " — add length, numbers, or symbols"}
            </p>
          </div>
        )}
        <Input type="password" value={passphrase2} onChange={setPassphrase2} placeholder="Confirm passphrase" style={{ marginBottom: 10 }} disabled={step < 1} />
        {passphrase && passphrase2 && !passphraseMatch && (
          <p style={{ fontSize: 11, color: T.coral, marginBottom: 8 }}>Passphrases don't match.</p>
        )}
        <button onClick={setPassphraseAndAdvance} disabled={step < 1 || !passphraseMatch || !passphraseOk} style={{ ...btn(T.purple, "white"), opacity: step < 1 || !passphraseMatch || !passphraseOk ? 0.6 : 1 }}>
          Set passphrase
        </button>
      </div>

      {/* Step 2: relay URL */}
      <div style={{ ...card, border: step === 2 ? `2px solid ${T.purple}` : `0.5px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: step >= 2 ? T.purpleLt : T.bgSec, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, color: step >= 2 ? T.purple : T.textTer }}>3</div>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Connect to the relay server</span>
        </div>
        <p style={{ fontSize: 12, color: T.textSec, marginBottom: 12 }}>
          The relay routes encrypted packets between you and your patients without seeing any data.
        </p>
        <Input value={relayUrl} onChange={setRelayUrl} placeholder="https://your-relay.example.com" style={{ marginBottom: 10 }} disabled={step < 2} />
        <button onClick={finish} disabled={step < 2 || !relayUrl.trim()} style={{ ...btn(T.purple, "white"), opacity: step < 2 || !relayUrl.trim() ? 0.6 : 1, width: "100%" }}>
          Start using Familiar
        </button>
      </div>
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────────
function Header({ state, screen, syncing, syncError, onSync, navTo, newPacketCount }) {
  const titles = { roster: "Patients", patient: "Patient detail", new: "New patient", settings: "Settings" };
  return (
    <div style={{ background: T.bg, borderBottom: `0.5px solid ${T.border}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.purple, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <span style={{ fontSize: 16, fontWeight: 500 }}>{titles[screen] || "Familiar"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {syncError && <span style={{ fontSize: 10, color: T.coral }}>sync error</span>}
        {newPacketCount > 0 && <span style={{ ...pill(T.tealLt, T.tealDk, 10) }}>+{newPacketCount} new</span>}
        <button onClick={onSync} disabled={syncing} style={{ ...btn(syncing ? T.bgSec : T.purpleLt, syncing ? T.textTer : T.purple, `0.5px solid ${T.purple2}`), fontSize: 11, padding: "4px 10px" }}>
          {syncing ? "Syncing…" : "Sync"}
        </button>
      </div>
    </div>
  );
}

// ─── Roster screen ─────────────────────────────────────────────────────────────
function RosterScreen({ state, navTo }) {
  const patients = state.patients;
  const totalSessions = patients.reduce((a, p) => a + p.sessions.length, 0);
  const activeThisWeek = patients.filter(p => weeklySessionCount(p) > 0).length;

  return (
    <div>
      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { val: patients.length, label: "Patients" },
          { val: activeThisWeek,  label: "Active this week" },
          { val: totalSessions,   label: "Total sessions" },
        ].map((s, i) => (
          <div key={i} style={{ background: T.bgSec, borderRadius: T.radiusMd, padding: "10px", textAlign: "center" }}>
            <p style={{ fontSize: 22, fontWeight: 500, marginBottom: 1 }}>{s.val}</p>
            <p style={{ fontSize: 10, color: T.textSec }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: T.textSec }}>{patients.length} patient slot{patients.length !== 1 ? "s" : ""}</p>
        <button onClick={() => navTo("new")} style={{ ...btn(T.purple, "white"), fontSize: 12, padding: "5px 14px" }}>+ New patient</button>
      </div>

      {patients.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "3rem", color: T.textTer }}>
          <p style={{ marginBottom: 8, fontSize: 15 }}>No patients yet</p>
          <p style={{ fontSize: 13 }}>Create a patient slot to generate a registration URL and share it with your patient.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {patients.map(p => {
            const scores = skillScores(p);
            const allScores = Object.values(scores).flat();
            const avg = avgScore(allScores);
            const inactive = inactivityDays(p);
            const alert = !p.registered ? null : inactive === null ? "no_sessions" : inactive >= 5 ? "inactive" : null;

            return (
              <div key={p.id} onClick={() => navTo("patient", p.id)} style={{ ...card, cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}>
                <Avatar name={p.label} size={44} bg={T.purpleLt} color={T.purple} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{p.label || "(unlabelled)"}</span>
                    {!p.registered && <span style={{ ...pill(T.amberLt, T.amber, 10) }}>awaiting registration</span>}
                    {p.registered && alert && <AlertBadge type={alert} />}
                  {p.registered && (() => {
                    const trajs = clinAllTrajectories(p.bkt_snapshots, p.condition_type || CLIN_DEFAULT_CONDITION);
                    return Object.values(trajs).some(t => t.alertFlag)
                      ? <AlertBadge type="declining" />
                      : null;
                  })()}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <SessionSparkline sessions={p.sessions} width={100} height={28} />
                    <div style={{ fontSize: 12, color: T.textSec }}>
                      {p.sessions.length} session{p.sessions.length !== 1 ? "s" : ""}
                      {avg !== null && <span style={{ marginLeft: 8, fontWeight: 500, color: T.text }}>{avg}% avg</span>}
                    </div>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.textTer} strokeWidth="1.5"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Patient detail screen ────────────────────────────────────────────────────
function PatientScreen({ patient, state, onSync, onSendAssignment, onSendMessage, onRemove, onUpdateNotes, onUpdateCondition, onUpdatePatient, navTo }) {
  const [tab, setTab]         = useState("progress");
  const conditionType   = patient.condition_type || CLIN_DEFAULT_CONDITION;
  const conditionLabel  = CLIN_CONDITION_PROFILES[conditionType]?.label || conditionType;
  const trajectories    = clinAllTrajectories(patient.bkt_snapshots, conditionType);
  const hasDeclineAlert = Object.values(trajectories).some(t => t.alertFlag);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const scores   = skillScores(patient);
  const allScores = Object.values(scores).flat();
  const avg      = avgScore(allScores);
  const inactive = inactivityDays(patient);

  async function handleSendMessage() {
    if (!msgText.trim()) return;
    setSending(true); setSendError(null);
    try {
      await onSendMessage(msgText.trim());
      setMsgText("");
    } catch { setSendError("Could not send — check your connection and try again."); }
    setSending(false);
  }

  const recentSessions = patient.sessions.slice(-10);

  return (
    <div>
      {/* Patient header card */}
      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <Avatar name={patient.label} size={52} bg={T.purpleLt} color={T.purple} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 3 }}>{patient.label || "(unlabelled)"}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {patient.registered
                ? <span style={{ ...pill(T.tealLt, T.tealDk, 10) }}>registered</span>
                : <span style={{ ...pill(T.amberLt, T.amber, 10) }}>awaiting registration</span>}
              {inactive !== null && inactive >= 5 && <AlertBadge type="inactive" />}
              {hasDeclineAlert && <AlertBadge type="declining" />}
              <span style={{ ...pill(T.bgSec, T.textSec, 10) }}>{conditionLabel}</span>
            </div>
            <p style={{ fontSize: 12, color: T.textSec }}>
              {patient.sessions.length} session{patient.sessions.length !== 1 ? "s" : ""}
              {avg !== null && ` · ${avg}% avg score`}
              {inactive !== null ? ` · last active ${inactive === 0 ? "today" : `${inactive}d ago`}` : patient.registered ? " · no sessions yet" : ""}
            </p>
          </div>
        </div>

        {/* Registration URL (if not yet registered) */}
        {!patient.registered && patient.registration_url && (
          <div style={{ marginTop: 12, padding: "10px 12px", background: T.amberLt, borderRadius: T.radiusMd, border: `0.5px solid ${T.amber2}` }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: T.amber, marginBottom: 4 }}>Share this URL with your patient</p>
            <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: T.amber, wordBreak: "break-all", marginBottom: 8 }}>{patient.registration_url}</p>
            <button onClick={() => navigator.clipboard?.writeText(patient.registration_url)} style={{ ...btn(T.amber, "white"), fontSize: 11, padding: "4px 12px" }}>Copy URL</button>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button onClick={onSync} style={{ ...btn(T.purpleLt, T.purple, `0.5px solid ${T.purple2}`), fontSize: 12, padding: "5px 12px" }}>Sync</button>
          <button onClick={() => setTab("assign")} style={{ ...btn(T.tealLt, T.tealDk, `0.5px solid ${T.teal2}`), fontSize: 12, padding: "5px 12px" }}>Assign exercise</button>
          <button onClick={() => setTab("messages")} style={{ ...btn("transparent", T.textSec, `0.5px solid ${T.border}`), fontSize: 12, padding: "5px 12px" }}>Message</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 12, border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd, overflow: "hidden" }}>
        {[["progress","Progress"],["sessions","Sessions"],["assign","Assign"],["messages","Messages"],["notes","Notes"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "8px 4px", fontSize: 11, border: "none", borderRight: k !== "notes" ? `0.5px solid ${T.border}` : "none", background: tab === k ? T.purple : T.bg, color: tab === k ? "white" : T.textSec, cursor: "pointer", fontWeight: tab === k ? 500 : 400 }}>{l}</button>
        ))}
      </div>

      {/* Progress tab */}
      {tab === "progress" && (
        <div>
          {patient.sessions.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: "2rem", color: T.textTer }}>
              <p>No sessions received yet.</p>
              {!patient.registered && <p style={{ fontSize: 12, marginTop: 8 }}>Patient hasn't registered. Share the registration URL above.</p>}
            </div>
          ) : (
            <>
              {/* Score chart */}
              <div style={{ ...card, marginBottom: 10 }}>
                <p style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>Session scores (most recent {Math.min(recentSessions.length, 10)})</p>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60, marginBottom: 6 }}>
                  {recentSessions.map((sess, i) => {
                    const atts = sess.attempts || [];
                    const sessAvg = atts.length ? Math.round(atts.reduce((a, b) => a + (b.score || 0), 0) / atts.length) : 0;
                    return (
                      <div key={i} title={`${new Date(sess.completed_at).toLocaleDateString()}: ${sessAvg}%`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{ width: "100%", height: Math.max(4, Math.round((sessAvg / 100) * 52)), background: i === recentSessions.length - 1 ? T.purple : T.purple2, borderRadius: "3px 3px 0 0" }} />
                        <span style={{ fontSize: 9, color: T.textTer }}>{sessAvg}%</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `0.5px solid ${T.border}` }}>
                  <div><p style={{ fontSize: 18, fontWeight: 500 }}>{weeklySessionCount(patient)}</p><p style={{ fontSize: 10, color: T.textTer }}>sessions this week</p></div>
                  <div style={{ textAlign: "right" }}><p style={{ fontSize: 18, fontWeight: 500 }}>{avg !== null ? `${avg}%` : "—"}</p><p style={{ fontSize: 10, color: T.textTer }}>overall avg</p></div>
                </div>
              </div>

              {/* Skill breakdown */}
              <div style={{ ...card, marginBottom: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Skill areas</p>
                {SKILLS.map(skill => <SkillBar key={skill} skill={skill} scores={scores} trajectory={trajectories[skill]} />)}
              </div>

              {/* Trajectory decline alerts */}
              {hasDeclineAlert && (
                <div style={{ ...card, marginBottom: 10, background: T.coralLt, border: `0.5px solid ${T.coral2}` }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: T.coral, marginBottom: 8 }}>Skill trajectories — declining</p>
                  {Object.entries(trajectories).filter(([, t]) => t.alertFlag).map(([skill, t]) => (
                    <div key={skill} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13 }}>{skill}</span>
                      <span style={{ fontSize: 11, color: T.coral }}>
                        ↓ {Math.abs((t.slopePerSession||0)*100).toFixed(1)}%/session · {t.n} sessions
                      </span>
                    </div>
                  ))}
                  <p style={{ fontSize: 11, color: T.coral, marginTop: 6 }}>
                    Consider adjusting difficulty or discussing therapy goals with the patient.
                  </p>
                </div>
              )}

              {/* Personalization impact */}
              {(() => {
                const allAtts = patient.sessions.flatMap(s => s.attempts || []);
                const pAtts = allAtts.filter(a => a.was_personalized);
                const gAtts = allAtts.filter(a => !a.was_personalized);
                const pAvg = avgScore(pAtts.map(a => a.score));
                const gAvg = avgScore(gAtts.map(a => a.score));
                if (!pAvg && !gAvg) return null;
                return (
                  <div style={{ ...card, background: T.tealLt, border: `0.5px solid ${T.teal2}` }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: T.tealDk, marginBottom: 4 }}>Personalization impact</p>
                    <div style={{ display: "flex", gap: 16 }}>
                      {pAvg && <div><p style={{ fontSize: 18, fontWeight: 500, color: T.tealDk }}>{pAvg}%</p><p style={{ fontSize: 10, color: T.teal }}>personal content</p></div>}
                      {gAvg && <div><p style={{ fontSize: 18, fontWeight: 500, color: T.tealDk }}>{gAvg}%</p><p style={{ fontSize: 10, color: T.teal }}>generic content</p></div>}
                      {pAvg && gAvg && pAvg > gAvg && <div style={{ alignSelf: "center" }}><span style={{ ...pill(T.tealLt, T.tealDk, 11) }}>+{pAvg - gAvg}% with personal</span></div>}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* Sessions tab */}
      {tab === "sessions" && (
        <div>
          {patient.sessions.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: "2rem", color: T.textTer }}>No sessions yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...patient.sessions].reverse().map((sess, i) => {
                const atts = sess.attempts || [];
                const sessAvg = atts.length ? Math.round(atts.reduce((a, b) => a + (b.score || 0), 0) / atts.length) : 0;
                return (
                  <div key={i} style={{ ...card }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{new Date(sess.completed_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{sessAvg}%</span>
                        <span style={{ ...pill(T.bgSec, T.textSec, 10) }}>{atts.length} exercises</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {atts.map((att, j) => (
                        <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                          <div style={{ width: 40, textAlign: "right", fontWeight: 500, color: att.score >= 80 ? T.teal : att.score >= 50 ? T.amber : T.coral }}>{att.score}%</div>
                          <div style={{ flex: 1, color: T.textSec }}>{att.exercise_slug?.replace(/-/g, " ")} <span style={{ color: T.textTer }}>· {att.skill_area}</span></div>
                          {att.was_personalized && <span style={{ ...pill(T.tealLt, T.tealDk, 9) }}>personal</span>}
                          {att.hint_used && <span style={{ ...pill(T.amberLt, T.amber, 9) }}>hint</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Assign tab */}
      {tab === "assign" && (
        <AssignTab patient={patient} onSend={onSendAssignment} />
      )}

      {/* Messages tab */}
      {tab === "messages" && (
        <div>
          {!patient.registered && (
            <div style={{ ...card, marginBottom: 10, background: T.amberLt, border: `0.5px solid ${T.amber2}` }}>
              <p style={{ fontSize: 12, color: T.amber }}>Patient hasn't registered yet. Messages can be sent once they connect.</p>
            </div>
          )}

          {/* Message history */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {[...patient.assignments.map(a => ({ ...a, direction: "out", text: `Assigned: ${a.exercise_slug} (difficulty ${a.prescribed_difficulty || a.difficulty})${a.note ? ` — "${a.note}"` : ""}` })),
              ...patient.messages].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at)).map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ maxWidth: "80%", padding: "8px 12px", background: T.purpleLt, borderRadius: T.radiusMd, border: `0.5px solid ${T.purple2}` }}>
                  <p style={{ fontSize: 13, color: T.purple, marginBottom: 2 }}>{item.text}</p>
                  <p style={{ fontSize: 10, color: T.textTer }}>{new Date(item.sent_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
            {patient.messages.length === 0 && patient.assignments.length === 0 && (
              <p style={{ fontSize: 13, color: T.textTer, textAlign: "center", padding: "1rem" }}>No messages sent yet.</p>
            )}
          </div>

          {/* Compose */}
          <div style={{ ...card }}>
            <Input value={msgText} onChange={setMsgText} placeholder="Type a message to your patient…" multiline style={{ marginBottom: 10 }} />
            {sendError && <p style={{ fontSize: 11, color: T.coral, marginBottom: 8 }}>{sendError}</p>}
            <button onClick={handleSendMessage} disabled={sending || !msgText.trim() || !patient.registered} style={{ ...btn(T.purple, "white"), opacity: sending || !msgText.trim() || !patient.registered ? 0.6 : 1 }}>
              {sending ? "Sending…" : "Send message"}
            </button>
          </div>
        </div>
      )}

      {/* Notes tab */}
      {tab === "notes" && (
        <div>
          <div style={{ ...card, marginBottom: 10 }}>
            <p style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>Clinical notes (stored only on this device)</p>
            <Input value={patient.notes || ""} onChange={onUpdateNotes} multiline placeholder="Add notes about this patient's progress, goals, observations…" style={{ marginBottom: 10 }} />
          </div>
          <div style={{ ...card, marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Condition profile</p>
            <p style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>
              Determines the trajectory model: how quickly knowledge decays between sessions,
              whether background regression is applied, and alert thresholds for declining skills.
            </p>
            <select
              value={conditionType}
              onChange={e => onUpdateCondition && onUpdateCondition(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", fontSize: 13, borderRadius: T.radiusMd, border: `0.5px solid ${T.borderSec}`, background: T.bg, color: T.text, marginBottom: 6 }}>
              {Object.entries(CLIN_CONDITION_PROFILES).map(([k, p]) => (
                <option key={k} value={k}>{p.label}</option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: T.textTer }}>
              {CLIN_CONDITION_PROFILES[conditionType]?.p_regress > 0
                ? `Active regression model — half-life ${CLIN_CONDITION_PROFILES[conditionType].half_life_days} days, p_regress ${CLIN_CONDITION_PROFILES[conditionType].p_regress}`
                : `Recovery model — half-life ${CLIN_CONDITION_PROFILES[conditionType]?.half_life_days} days, no regression`}
            </p>
          </div>
          <TokenRotation patient={patient} state={state}
            onNewToken={tok => onUpdatePatient({ inbound_publish_token: tok })} />
          <div style={{ ...card, border: `0.5px solid ${T.coral}` }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: T.coral, marginBottom: 4 }}>Remove patient slot</p>
            <p style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>Deletes the topic from the relay and removes all local data. This cannot be undone.</p>
            {!showRemoveConfirm
              ? <button onClick={() => setShowRemoveConfirm(true)} style={{ ...btn("transparent", T.coral, `0.5px solid ${T.coral}`), fontSize: 12 }}>Remove patient</button>
              : <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowRemoveConfirm(false)} style={{ ...btn("transparent", T.textSec, `0.5px solid ${T.border}`), fontSize: 12 }}>Cancel</button>
                  <button onClick={onRemove} style={{ ...btn(T.coral, "white"), fontSize: 12 }}>Yes, remove</button>
                </div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Assign tab ────────────────────────────────────────────────────────────────
function AssignTab({ patient, onSend }) {
  const [selected, setSelected] = useState(null);
  const [difficulty, setDifficulty] = useState(2);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function send() {
    if (!selected) return;
    setSending(true); setError(null);
    try {
      await onSend({ exercise_slug: selected, prescribed_difficulty: difficulty, note });
      setSent(true); setSelected(null); setNote("");
      setTimeout(() => setSent(false), 3000);
    } catch { setError("Could not send — check your connection and try again."); }
    setSending(false);
  }

  return (
    <div>
      {!patient.registered && (
        <div style={{ ...card, marginBottom: 10, background: T.amberLt, border: `0.5px solid ${T.amber2}` }}>
          <p style={{ fontSize: 12, color: T.amber }}>Patient hasn't registered yet. Assignments will be queued and delivered once they connect.</p>
        </div>
      )}

      {sent && <div style={{ ...card, marginBottom: 10, background: T.tealLt, border: `0.5px solid ${T.teal2}` }}><p style={{ fontSize: 13, color: T.tealDk }}>✓ Assignment sent to patient.</p></div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {EXERCISES.map(ex => (
          <div key={ex.slug} onClick={() => setSelected(ex.slug === selected ? null : ex.slug)}
            style={{ ...card, cursor: "pointer", display: "flex", gap: 10, alignItems: "center", border: `0.5px solid ${selected === ex.slug ? T.purple : T.border}`, background: selected === ex.slug ? T.purpleLt : T.bg }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", border: `1.5px solid ${selected === ex.slug ? T.purple : T.borderSec}`, background: selected === ex.slug ? T.purple : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {selected === ex.slug && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white" }} />}
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: selected === ex.slug ? 500 : 400, color: selected === ex.slug ? T.purple : T.text }}>{ex.title}</span>
              <span style={{ fontSize: 11, color: T.textSec, marginLeft: 8 }}>{ex.skill}</span>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div style={{ ...card, marginBottom: 10, border: `0.5px solid ${T.purple}` }}>
          <p style={{ fontSize: 12, color: T.textSec, marginBottom: 6 }}>Difficulty level (1 = easiest, 5 = hardest)</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[1, 2, 3, 4, 5].map(d => (
              <button key={d} onClick={() => setDifficulty(d)} style={{ flex: 1, padding: "8px", fontSize: 13, border: `0.5px solid ${difficulty === d ? T.purple : T.border}`, background: difficulty === d ? T.purpleLt : T.bg, borderRadius: T.radiusMd, cursor: "pointer", fontWeight: difficulty === d ? 500 : 400, color: difficulty === d ? T.purple : T.text }}>
                {d}
              </button>
            ))}
          </div>
          <Input value={note} onChange={setNote} placeholder="Note to patient (optional)…" style={{ marginBottom: 10 }} />
          {error && <p style={{ fontSize: 11, color: T.coral, marginBottom: 8 }}>{error}</p>}
          <button onClick={send} disabled={sending} style={{ ...btn(T.purple, "white"), width: "100%", opacity: sending ? 0.6 : 1 }}>
            {sending ? "Sending…" : "Send assignment"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── New patient screen ────────────────────────────────────────────────────────
function NewPatientScreen({ state, onCreate, navTo }) {
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  async function create() {
    if (!label.trim()) return;
    setCreating(true); setError(null);
    try {
      const patient = await onCreate(label.trim());
      setCreated(patient);
    } catch { setError("Could not create patient slot — check your relay connection."); }
    setCreating(false);
  }

  if (created) {
    return (
      <div>
        <div style={{ ...card, border: `0.5px solid ${T.teal}`, marginBottom: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: T.teal, marginBottom: 6 }}>✓ Patient slot created</p>
          <p style={{ fontSize: 13, color: T.textSec, marginBottom: 12 }}>Share this registration URL with <strong>{created.label}</strong>. They paste it into the Familiar patient app to connect.</p>
          <div style={{ background: T.bgSec, borderRadius: T.radiusMd, padding: "10px 12px", marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", wordBreak: "break-all", color: T.text }}>{created.registration_url}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => navigator.clipboard?.writeText(created.registration_url)} style={{ ...btn(T.tealLt, T.tealDk, `0.5px solid ${T.teal2}`), fontSize: 12 }}>Copy URL</button>
            <button onClick={() => { setCreated(null); setLabel(""); }} style={{ ...btn("transparent", T.textSec, `0.5px solid ${T.border}`), fontSize: 12 }}>Create another</button>
          </div>
        </div>
        <button onClick={() => navTo("roster")} style={{ ...btn(T.purple, "white"), width: "100%" }}>Back to patient list</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ ...card, marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: T.textSec, marginBottom: 14 }}>
          Create a patient slot to get a registration URL. The label is your internal reference — it does not have to be the patient's real name.
        </p>
        <label style={{ fontSize: 12, color: T.textSec }}>Internal label</label>
        <Input value={label} onChange={setLabel} placeholder="e.g. Patient slot 1, or a name or initials" style={{ marginTop: 4, marginBottom: 10 }} />
        {error && <p style={{ fontSize: 11, color: T.coral, marginBottom: 8 }}>{error}</p>}
        <button onClick={create} disabled={creating || !label.trim()} style={{ ...btn(T.purple, "white"), width: "100%", opacity: creating || !label.trim() ? 0.6 : 1 }}>
          {creating ? "Creating…" : "Create patient slot"}
        </button>
      </div>

      <div style={{ ...card, background: T.blueLt, border: `0.5px solid ${T.blue2}` }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: T.blue, marginBottom: 4 }}>Privacy note</p>
        <p style={{ fontSize: 12, color: T.blue }}>The relay never sees patient names. Topics are identified only by random IDs. The label you enter here is stored only on your device.</p>
      </div>
    </div>
  );
}

// ─── Settings screen ───────────────────────────────────────────────────────────
function SettingsScreen({ state, setState, sodiumReady }) {
  const [tab, setTab] = useState("relay");
  return (
    <div>
      <div style={{ display: "flex", gap: 0, marginBottom: 14, border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd, overflow: "hidden" }}>
        {[["relay","Relay"],["keys","Keys"],["audit","Audit log"],["danger","Danger"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "9px 4px", fontSize: 11, border: "none", borderRight: k !== "danger" ? `0.5px solid ${T.border}` : "none", background: tab === k ? T.purple : T.bg, color: tab === k ? "white" : T.textSec, cursor: "pointer", fontWeight: tab === k ? 500 : 400 }}>{l}</button>
        ))}
      </div>

      {tab === "relay" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...card }}>
            <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Relay server</p>
            <p style={{ fontSize: 12, color: T.textSec, marginBottom: 4 }}>Current URL</p>
            <p style={{ fontSize: 12, fontFamily: "var(--font-mono)", marginBottom: 12, color: T.text }}>{state.relay_base_url}</p>
            <ChangeRelayUrl state={state} setState={setState} />
          </div>
          <div style={{ ...card, background: T.tealLt, border: `0.5px solid ${T.teal2}` }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: T.tealDk, marginBottom: 4 }}>Data at rest</p>
            <p style={{ fontSize: 12, color: T.tealDk, marginBottom: 6 }}>
              Patient records, session history, and clinical notes are encrypted on this device using
              a key derived from your passphrase. The data is unreadable without it.
            </p>
            <p style={{ fontSize: 11, color: T.teal }}>
              Full-disk encryption (FileVault / BitLocker) is still recommended as a defence-in-depth measure.
            </p>
          </div>
          <div style={{ ...card }}>
            <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Data retention</p>
            <p style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>
              Session history, messages, and assignments older than this window are pruned on app load.
              Reducing this also reduces local storage usage.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[6, 12, 24, 36].map(m => (
                <button key={m}
                  onClick={() => setState(s => ({ ...s, settings: { ...s.settings, retention_months: m } }))}
                  style={{ ...btn(state.settings.retention_months === m ? T.purple : T.bg, state.settings.retention_months === m ? "white" : T.textSec, `0.5px solid ${state.settings.retention_months === m ? T.purple : T.border}`), fontSize: 12 }}>
                  {m} months
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "keys" && (
        <div>
          <div style={{ ...card, marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Your public key</p>
            <p style={{ fontSize: 11, color: T.textSec, marginBottom: 8 }}>This is embedded in every patient registration URL. Patients' result packets are encrypted with this key.</p>
            <div style={{ background: T.bgSec, borderRadius: T.radiusMd, padding: "10px 12px", marginBottom: 10, wordBreak: "break-all" }}>
              <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: T.textSec }}>{state.keypair?.publicKey || "—"}</p>
            </div>
            <button onClick={() => navigator.clipboard?.writeText(state.keypair?.publicKey || "")} style={{ ...btn(T.purpleLt, T.purple, `0.5px solid ${T.purple2}`), fontSize: 12 }}>Copy public key</button>
          </div>
          <div style={{ ...card, background: T.coralLt, border: `0.5px solid ${T.coral2}` }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: T.coral, marginBottom: 4 }}>Private key</p>
            <p style={{ fontSize: 12, color: T.coral }}>Your private key is stored only in this browser's storage. It never leaves this device and is never shown. If you clear your browser data, you will permanently lose the ability to decrypt past patient result packets.</p>
          </div>
        </div>
      )}

      {tab === "audit" && <AuditLogPanel />}

      {tab === "danger" && (
        <DangerZone setState={setState} />
      )}
    </div>
  );
}

function AuditLogPanel() {
  const [entries, setEntries] = useState(null);
  useEffect(() => { loadAuditLog().then(setEntries); }, []);

  const ACTION_LABEL = {
    patient_open:    "Opened patient record",
    sync_all:        "Synced all patients",
    sync_one:        "Synced patient",
    assignment_send: "Sent assignment",
    message_send:    "Sent message",
  };

  if (!entries) return <div style={{ ...card, color: T.textTer, fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ ...card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 500 }}>Access log</p>
        <span style={{ fontSize: 10, color: T.textTer }}>last {Math.min(entries.length, 50)} of {entries.length} entries</span>
      </div>
      <p style={{ fontSize: 11, color: T.textSec, marginBottom: 10 }}>
        Timestamps, pseudonymous patient IDs, and action types only — no health data.
      </p>
      {entries.length === 0
        ? <p style={{ fontSize: 13, color: T.textTer }}>No entries yet.</p>
        : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[...entries].reverse().slice(0, 50).map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, padding: "4px 0", borderBottom: `0.5px solid ${T.border}` }}>
                <span style={{ color: T.textTer, flexShrink: 0, fontFamily: "var(--font-mono)" }}>
                  {new Date(e.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span style={{ color: T.text }}>{ACTION_LABEL[e.action] || e.action}</span>
                {e.patient_id && <span style={{ color: T.textTer, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.patient_id.slice(0, 18)}…</span>}
              </div>
            ))}
          </div>
      }
    </div>
  );
}

function TokenRotation({ patient, state, onNewToken }) {
  const [rotating, setRotating] = useState(false);
  const [result, setResult]     = useState(null); // "ok" | "error" | "unsupported"

  async function rotate() {
    setRotating(true); setResult(null);
    try {
      const res = await fetch(
        `${state.relay_base_url}/topics/${patient.topic_id}/rotate-inbound-token`,
        { method: "POST", headers: { Authorization: `Bearer ${patient.poll_token}` } }
      );
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.inbound_publish_token) onNewToken(body.inbound_publish_token);
        setResult("ok");
      } else {
        setResult("unsupported");
      }
    } catch { setResult("error"); }
    setRotating(false);
  }

  return (
    <div style={{ ...card, marginBottom: 10 }}>
      <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Rotate inbound token</p>
      <p style={{ fontSize: 12, color: T.textSec, marginBottom: 10 }}>
        Invalidates the current write credential used to send assignments and messages to this patient.
        Use this if you suspect the token has been compromised. Requires relay support.
      </p>
      {result === "ok"          && <p style={{ fontSize: 11, color: T.teal,    marginBottom: 8 }}>Token rotated successfully.</p>}
      {result === "unsupported" && <p style={{ fontSize: 11, color: T.amber,   marginBottom: 8 }}>This relay does not support token rotation (POST /topics/:id/rotate-inbound-token).</p>}
      {result === "error"       && <p style={{ fontSize: 11, color: T.coral,   marginBottom: 8 }}>Could not reach relay — check your connection.</p>}
      <button onClick={rotate} disabled={rotating || !patient.topic_id} style={{ ...btn(T.purpleLt, T.purple, `0.5px solid ${T.purple2}`), fontSize: 12, opacity: rotating || !patient.topic_id ? 0.6 : 1 }}>
        {rotating ? "Rotating…" : "Rotate token"}
      </button>
    </div>
  );
}

function DangerZone({ setState }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ ...card, border: `0.5px solid ${T.coral}` }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: T.coral, marginBottom: 4 }}>Clear all clinician data</p>
      <p style={{ fontSize: 12, color: T.textSec, marginBottom: 12 }}>
        Deletes your keypair, all patient records, and all session data from this device.
        Patient topics on the relay are NOT deleted automatically. This cannot be undone.
      </p>
      {!confirm
        ? <button onClick={() => setConfirm(true)} style={{ ...btn("transparent", T.coral, `0.5px solid ${T.coral}`), fontSize: 13 }}>Clear all data</button>
        : <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirm(false)} style={{ ...btn("transparent", T.textSec, `0.5px solid ${T.border}`), fontSize: 13 }}>Cancel</button>
            <button onClick={() => setState({ ...DEFAULT_STATE })} style={{ ...btn(T.coral, "white"), fontSize: 13 }}>Yes, delete everything</button>
          </div>
      }
    </div>
  );
}

function ChangeRelayUrl({ state, setState }) {
  const [url, setUrl] = useState(state.relay_base_url);
  const [saved, setSaved] = useState(false);
  return (
    <div>
      <Input value={url} onChange={setUrl} placeholder="https://your-relay.example.com" style={{ marginBottom: 8 }} />
      {saved && <p style={{ fontSize: 11, color: T.teal, marginBottom: 6 }}>Saved.</p>}
      <button onClick={() => { setState(s => ({ ...s, relay_base_url: url.trim().replace(/\/$/, "") })); setSaved(true); setTimeout(() => setSaved(false), 2000); }} style={{ ...btn(T.purpleLt, T.purple, `0.5px solid ${T.purple2}`), fontSize: 12 }}>Update relay URL</button>
    </div>
  );
}

// ─── Bottom nav ────────────────────────────────────────────────────────────────
function BottomNav({ screen, navTo }) {
  const items = [
    { id: "roster",   label: "Patients", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { id: "new",      label: "New",      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg> },
    { id: "settings", label: "Settings", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg> },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 720, background: T.bg, borderTop: `0.5px solid ${T.border}`, display: "flex", zIndex: 10 }}>
      {items.map(item => (
        <button key={item.id} onClick={() => navTo(item.id)} style={{ flex: 1, padding: "10px 0 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", color: screen === item.id ? T.purple : T.textTer }}>
          {item.icon}
          <span style={{ fontSize: 10 }}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
