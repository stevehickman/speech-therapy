# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**`ppa-speech-therapy`** — a browser-based speech therapy suite designed for patients with Primary Progressive Aphasia (PPA). It provides structured word-finding practice, sentence construction, repetition drills, script training, video comprehension, and AI-assisted feedback via Dr. Aria (Claude).

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

## Clinician–Client Architecture (design — not yet built)

The clinician and client apps form a **subscription-based, bidirectional sync** over an optional lightweight backend. The client app is fully standalone without the backend — it simply won't receive clinician-authored content or send results upstream.

```
Clinician App (separate Vite build / codebase)
  ├─ Authors word lists, video clip sets, exercise configs
  ├─ Manages a roster of subscribed client apps
  └─ Publishes content bundles to each client's endpoint
           ↓  content (clinician → client)
  [Optional lightweight backend — relay only, no storage]
           ↑  results (client → clinician)
Client App (this codebase)
  ├─ Subscribes once via a clinician-generated code/URL
  ├─ Receives and validates incoming content bundles
  ├─ Merges items into ppa_naming_items / ppa_video_clips
  └─ Sends practice results back via the same channel
```

Key design constraints:

- **Client runs standalone.** No backend required. Without a subscription the app works exactly as it does today — all content is caregiver-supplied or built-in.
- **Subscription via one-time code/URL.** The clinician generates a code in the clinician app; the caregiver enters it in the client app once to register the subscription endpoint.
- **Bidirectional transport.** Content flows clinician → client; anonymised practice results flow client → clinician via the same relay. Personal caregiver-added content never leaves the device.
- **Merge semantics.** Same de-duplication logic as existing `.ppa` imports — same-`id` items update in place; new items appended; caregiver-side custom items are untouched and invisible to the clinician.
- **Content provenance.** Items sourced from a clinician bundle carry `_sourceType: "clinician"` so the caregiver panel can show their origin and the client can re-send updated results correctly.
- **No clinician PIN in the client app.** All content-management gates in the client app use the caregiver PIN. `ADMIN_PIN` and `AdminPinEntry` exist only in `AdminPinEntry.jsx` for use by the clinician app and must not be imported by any client-app module.

---

## Key Conventions

- **No backend.** All persistence is `localStorage`. Keys are prefixed `ppa_`. Notable keys: `ppa_naming_items` (standard naming list), `ppa_naming_sr` (standard SR state), `ppa_personal_items` (personal photo items), `ppa_personal_sr` (personal SR state), `ppa_personal_videos` (personal video clip metadata), `ppa_video_clips` (custom standard video clips), `ppa_caregiver_pin` (caregiver PIN), `ppa_dictionary` (shared graphic store).
- **Shared code belongs in `shared.jsx`.** Any utility used by more than one module goes there.
- **Exported constants, not magic strings.** localStorage keys, file extensions, and result type strings are defined once and imported where needed.
- **Clinician PIN** (`ADMIN_PIN = "1234"` in `AdminPinEntry.jsx`) is for the **clinician app only** — not used in the client app. All content-management gates in the client app use the **caregiver PIN** (`CaregiverPinEntry`, stored in `ppa_caregiver_pin`).
- **`VITE_ANTHROPIC_API_KEY`** must be in `.env` — never hardcoded.
- **React StrictMode is active** in development (`src/main.jsx`). Effects run twice; always use cleanup functions.
