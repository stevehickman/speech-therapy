# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**`speech-therapy`** — a customisable, browser-based speech-language practice suite for patients with acquired or progressive speech and language disorders (aphasia, PPA, TBI, dementia, and others). It provides structured word-finding practice, sentence construction, repetition drills, script training, video comprehension, and AI-assisted feedback via Dr. Aria (Claude). All content — word lists, scripts, video clips, and tasks — is fully editable by clinicians and caregivers.

**Version:** 4.0.0
**Stack:** React 18 + Vite 5, ESM modules, no backend — all state in `localStorage`.
**AI:** Anthropic Claude API called directly from the browser.

---

## Development

```bash
npm install
npm run dev        # Vite dev server on :5173
npm run build      # Production bundle → dist/
npm run preview    # Serve built dist/
```

**API key** — create `.env` in the repo root:
```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```
Without it the AI calls fail silently and the app auto-advances rather than showing Dr. Aria's feedback.

---

## Source Layout

```
ppa-source/
├── ppa-speech-therapy_main.jsx   # App shell + all modules except Naming and SentenceBuilder
├── NamingModule.jsx              # Picture-naming practice with spaced repetition
├── SentenceBuilderModule.jsx     # Visual drag-and-drop sentence construction
├── ExportImportSystem.jsx        # .ppa / .ppabak export, import, and backup logic
├── shared.jsx                    # Shared utilities: fetchAnthropicApi, CallAPI, ThinkingDots
└── data/
    ├── config.js                 # CLAUDE_MODEL constant + Dr. Aria SYSTEM_PROMPT
    ├── dictionary.js             # Unified word→{graphic, cues, categories} store
    ├── namingItems.js            # 10 built-in picture-naming items (seed data)
    ├── sbWordBank.js             # Noun/verb/adjective/adverb/pronoun/prep/article banks
    ├── sbConjugation.js          # Verb conjugation rules for all tenses
    ├── repetitionItems.js        # Repetition drill levels
    ├── sentenceTasks.js          # Sentence completion and construction prompts
    ├── scripts.js                # Functional phrase scripts
    ├── assessmentTasks.js        # Evaluation items
    ├── videoClips.js             # Video comprehension clips and question types
    └── tools.js                  # Sidebar navigation definitions
```

---

## Shared Utilities (`shared.jsx`)

All Anthropic API access and the loading indicator live here. **Never duplicate these inline.**

### `fetchAnthropicApi(body, signal?)`
Low-level async helper. Applies all required headers (`x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access`). Returns parsed JSON. Throws on network error or abort. Use this for fire-and-forget calls (e.g. emoji lookup in SentenceBuilder).

### `<CallAPI messages onResult onError system?>`
React component that fires one API request on mount and calls `onResult(text)` or `onError(err)` exactly once. Uses `AbortController` — the request is cancelled automatically on unmount. `onResult` always receives a non-empty string (falls back to `"Well done — keep going!"`). Mount it conditionally: `{pendingAI && <CallAPI … />}`.

### `<ThinkingDots />`
Animated three-dot spinner. Use during any AI loading state.

---

## Naming Module (`NamingModule.jsx`)

### Modes

The module has two practice modes toggled by tabs at the top of the view:

| Mode | Tab | Items source | SR key | Admin access |
|---|---|---|---|---|
| **Standard** | 📚 Standard | `dictLoadNamingItems()` → `ppa_naming_items` | `ppa_naming_sr` | ⚙️ gear button — PIN-gated (`ADMIN_PIN`) |
| **Personal Photos** | 📸 My photos | `ppa_personal_items` | `ppa_personal_sr` | ✏️ pencil button — no PIN (patient/family-facing) |

Switching modes remounts `<Practice key={…}>` so each mode starts with its own independent SR state. The `Practice` component accepts a `srKey` prop (defaults to `SR_KEY`) and threads it through all `srLoad` / `srSave` / `srLoadOrBootstrap` calls.

#### Personal Photos library (`PersonalLibraryPanel`)

- Opens full-screen (replaces the module view, same pattern as `AdminPanel`)
- Purple header (`#7A5AB8`) to distinguish it from the teal admin panel
- **+ Add photo** → `ItemForm` (with AI auto-fill on word blur, graphic picker, all cues)
- **📁 Bulk import** → `BulkImportPanel` (drag-drop multiple images at once)
- Edit / delete per item; duplicate detection via `checkDuplicate`
- Items stored as raw JSON in `ppa_personal_items` — **not** routed through the shared dictionary (personal content is private)
- Item IDs prefixed `personal-` to distinguish from standard (`seed-`, `custom-`) items

### Spaced Repetition Engine

PPA-adapted SR — deliberately conservative (max 5-day interval, regression decay on every load):

| Result | `SR_FACTOR` | When used |
|---|---|---|
| `correct` | ×1.2 | Answered without any help |
| `space_cued` | ×0.9 | Used the Space-key phoneme starter |
| `semantic_cued` | ×0.8 | Used the concept hint |
| `phonemic_cued` | ×0.5 | Used the sound cue |
| `failed` | reset → 1 day | Needed full reveal |

SR state shape: `{ [word]: { interval, dueDate, streak, lastResult, lastSeen } }`.

- Standard items → `ppa_naming_sr`
- Personal photo items → `ppa_personal_sr`

`srLoadOrBootstrap(key)` bootstraps from legacy progress-log history only when `key === SR_KEY`; personal items start from a clean slate.

Words answered with `phonemic_cued` or `failed` are re-inserted 4 positions ahead in the session queue for same-session repetition.

### Phoneme Starter (Space key)

In the "show" phase, when the response field is empty, pressing **Space** reveals one additional letter from the start of the target word (e.g. `A…`, then `AP…`, then `APP…`). Each press is additive. Submitting with `phonemesRevealed > 0` records `space_cued` instead of `correct`. The `phonemesRevealed` counter is reset on every word advance.

### AI Feedback Flow

After recording any response, `<CallAPI>` is mounted to fetch Dr. Aria's feedback. Once the response arrives the "Next word →" button appears. If the API call fails (no key, CORS, etc.) `onError` calls `next()` directly so the user is never left stuck.

### Practice Phases

`show` → (Space for phoneme hints, optional) → `semantic` → `phonemic` → `answer`

Each phase transition records the appropriate result and updates SR state immediately.

---

## Dictionary (`data/dictionary.js`)

Single source of truth for all word graphics, stored in `localStorage` under `ppa_dictionary`. Both NamingModule and SentenceBuilder read and write through the dictionary API:

- `dictLoadNamingItems()` / `dictSaveNamingItems(items)` — load/persist the naming practice list
- `dictGetGraphic(word, fallback)` — resolve canonical emoji or base64 image
- `dictAddWord(word, graphic)` — register a new word (first writer wins; `❓` is always upgradeable)
- `useDictionaryLookup()` — React hook returning a stable `{ word: graphic }` map

---

## Video Module (`VideoModule.jsx`)

Two practice modes, tab-switched at the top of the module (same pattern as Naming):

| Mode | Tab | Clips source | Admin button |
|---|---|---|---|
| **Standard** | 🎬 Standard | `VIDEO_CLIPS` (built-in) + `ppa_video_clips` (custom) | ⚙️ clinician PIN |
| **Personal** | 🎞️ My clips | `ppa_personal_videos` + IndexedDB for file data | ✏️ caregiver PIN |

Personal clip metadata is stored in `ppa_personal_videos` (localStorage). Binary video data (local file uploads) shares the same IndexedDB store (`ppa_video_files`) using `personal_`-prefixed IDs. The `ImportPanel` 3-step flow (source → details → questions) is reused for both modes.

**Video file upload** has full drag-and-drop support (consistent with photo import).

---

## Export / Import System (`ExportImportSystem.jsx`)

- **`.ppa` files** — per-module item exports (naming items, scripts, sentences, etc.). Format: `{ ppaExport: true, moduleId, items: [...] }`.
- **`.ppabak` files** — full-app backup of all `ppa_*` localStorage keys. Restoring reloads the page.
- All public functions and components are named exports. The main app and each module import only what they need.

---

## Role Model

Three actors interact with the therapy ecosystem. The **client app** (this codebase) serves the patient and caregiver only. The clinician uses a separate app.

| Actor | App | What they can do | Access gate in client app |
|---|---|---|---|
| **Patient** | Client app | Practices all exercises; no content management | None — open access |
| **Caregiver** | Client app | Adds personal photos and personal video clips; manages all clinical content panels; changes caregiver PIN | Caregiver PIN (stored in `ppa_caregiver_pin`, default `"0000"`) |
| **Clinician** | Clinician app (separate codebase) | Authors word lists, video clip sets, exercise configs; subscribes to patient results | Clinician PIN lives in the clinician app — **never in this codebase** |

### PIN components (`AdminPinEntry.jsx`)

| Export | Purpose |
|---|---|
| `ADMIN_PIN` / `AdminPinEntry` | **Clinician app only** — not imported by any client-app module |
| `CAREGIVER_PIN_KEY` | localStorage key for caregiver PIN |
| `DEFAULT_CAREGIVER_PIN` | `"0000"` |
| `getCaregiverPin()` / `setCaregiverPin(pin)` | Read/write caregiver PIN |
| `CaregiverPinEntry` | Caregiver gate component (purple-themed, shows default-PIN warning) |
| `ChangeCaregiverPinForm` | Inline form for changing caregiver PIN; embed in any caregiver panel header |

### Caregiver-gated areas (all content management in the client app)

- **Personal Photos library** (`PersonalLibraryPanel` in `NamingModule.jsx`) — `🔑 PIN` button in header opens `ChangeCaregiverPinForm`
- **Personal Video Clips library** (`PersonalVideosLibraryPanel` in `VideoModule.jsx`) — same pattern
- **Naming Admin panel** — standard word list, bulk import, generate by category, export/import `.ppa`
- **Video Clips Admin** — built-in clip questions, custom clip management, export/import `.ppa`

---

## Clinician App (`clinician-app/`)

The clinician dashboard is a separate Vite + React 18 build located at `clinician-app/`. It is **fully built and production-ready**. All patient data stays on the clinician's device; nothing flows to any server except encrypted packets routed through a zero-knowledge relay.

### Development

```bash
cd clinician-app
npm install
npm run dev      # Vite dev server on :5174
npm run build    # Production bundle → dist/
```

### Security architecture

| Layer | Mechanism |
|---|---|
| **App access gate** | Passphrase required on every open; 5-min idle lock; immediate lock on tab hide/device sleep |
| **Private key protection** | NaCl `crypto_box` keypair; `secretKey` wrapped with AES-GCM using PBKDF2-derived KEK (600 000 iterations); only `wrappedSecretKey + salt + iv` persisted — plaintext bytes live in React state only |
| **Patient data at rest** | Encrypted with independent AES-GCM DEK (same PBKDF2 params, separate `dataSalt`); `familiar_data` is ciphertext; `familiar_meta` holds only non-PHI keypair metadata + relay URL |
| **Audit log at rest** | `familiar_audit` encrypted with the same DEK when available |
| **Relay transport** | NaCl `crypto_box_easy`; relay sees only ciphertext; no patient labels or plaintext ever sent |
| **Plaintext fallback** | Removed entirely; `encryptForPatient` returns `null` (not plaintext) when patient pubkey absent — callers queue locally |
| **Crypto library** | `libsodium-wrappers` npm package imported as ES module; bundled by Vite; no `window.sodium` global |
| **CSP** | `default-src 'self'; connect-src 'self' https:` — no `'unsafe-inline'`, no CDN allowances |
| **Passphrase strength** | Minimum 12 chars + score ≥ 3 (inline scorer, no external dep); enforced in UI and submit guard |

### Storage keys

| Key | Format | Contains |
|---|---|---|
| `familiar_meta` | JSON plaintext | `{ keypair: { publicKey, wrappedSecretKey, salt, iv, dataSalt }, relay_base_url, migration_complete? }` |
| `familiar_data` | AES-GCM encrypted JSON | `{ patients: [...], settings: { notifications, retention_months } }` |
| `familiar_audit` | AES-GCM encrypted JSON (plaintext array before first unlock) | `[{ ts, patient_id, action }]` — cap 500, no health data |
| `familiar_clinician` | `null` (zeroed after migration) | Legacy single-blob; zeroed on first unlock post-migration |

### Module-level singletons (App.jsx)

| Variable | Type | Lifecycle |
|---|---|---|
| `_sodium` | libsodium instance | Set once on load; `window.sodium` deleted after capture |
| `_dataKey` | `CryptoKey` (AES-GCM) | Set on unlock; cleared to `null` on lock, idle timeout, or tab hide |
| `_migrationComplete` | `boolean` | Set to `true` after first encrypted write AND read from `familiar_meta.migration_complete` on load; once true, `decryptBlob` rejects any plaintext blob |

### Key invariants — never break these

- **`secretKey` never touches storage.** Only `wrappedSecretKey` is persisted. Raw bytes live exclusively in React state (`secretKeyBytes`) and are cleared on lock.
- **`_dataKey` is cleared on every lock path.** The idle timer, `visibilitychange`, and manual lock all call `_dataKey = null` before `setSecretKeyBytes(null)`.
- **No plaintext to the relay.** `encryptForPatient` returns `null` (never a base64 stub) if the patient's pubkey is absent. The outbound queue (`patient.outbound_queue`) drains only inside `syncPatient` after `resolvedPubkey` is confirmed.
- **`decryptBlob` fails closed.** Decryption failure returns no data — it throws. Callers fall through to the legacy plaintext path only when `familiar_data` is absent, not when decryption fails.
- **Relay receives no patient labels.** `relayCreateTopic` sends only `{ clinician_pubkey }` — no `label` field.

### Clinician–Client relay protocol

```
Clinician App                    Zero-knowledge relay              Patient App
     │                                    │                              │
     │  POST /topics                      │                              │
     │  { clinician_pubkey }  ──────────► │                              │
     │◄── { topic_id, poll_token,         │                              │
     │      inbound_publish_token,        │                              │
     │      registration_url }            │                              │
     │                                    │                              │
     │  [share registration_url out-of-band to patient]                  │
     │                                    │                              │
     │                                    │◄── patient registers ────────│
     │                                    │    (stores patient_pubkey)   │
     │                                    │                              │
     │  GET /topics/:id  ─────────────► │                              │
     │◄── { patient_registered, patient_pubkey }                         │
     │                                    │                              │
     │  [clinician encrypts with patient_pubkey]                         │
     │  POST /topics/:id/inbound ───────► │ ──── delivers ciphertext ───►│
     │                                    │                              │
     │◄── poll /topics/:id/packets ─────  │◄─── patient encrypts  ───────│
     │    decrypt with secretKey          │     with clinician_pubkey    │
```

The relay never sees plaintext. `topic_id` values are random UUIDs. Patient labels are stored only on the clinician's device.

### Pending relay-side work

- `POST /topics/:id/rotate-inbound-token` — client UI (`TokenRotation` component) is ready and will persist the new token when the relay implements this endpoint.

---

## Key Conventions

- **No backend.** All persistence is `localStorage`. Keys are prefixed `ppa_`. Notable keys: `ppa_naming_items` (standard naming list), `ppa_naming_sr` (standard SR state), `ppa_personal_items` (personal photo items), `ppa_personal_sr` (personal SR state), `ppa_personal_videos` (personal video clip metadata), `ppa_video_clips` (custom standard video clips), `ppa_caregiver_pin` (caregiver PIN), `ppa_dictionary` (shared graphic store).
- **Shared code belongs in `shared.jsx`.** Any utility used by more than one module goes there.
- **Exported constants, not magic strings.** localStorage keys, file extensions, and result type strings are defined once and imported where needed.
- **Clinician PIN** (`ADMIN_PIN = "1234"` in `AdminPinEntry.jsx`) is for the **clinician app only** — not used in the client app. All content-management gates in the client app use the **caregiver PIN** (`CaregiverPinEntry`, stored in `ppa_caregiver_pin`).
- **`VITE_ANTHROPIC_API_KEY`** must be in `.env` — never hardcoded.
- **React StrictMode is active** in development (`src/main.jsx`). Effects run twice; always use cleanup functions.
