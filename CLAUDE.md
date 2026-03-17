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

### Spaced Repetition Engine

PPA-adapted SR — deliberately conservative (max 5-day interval, regression decay on every load):

| Result | `SR_FACTOR` | When used |
|---|---|---|
| `correct` | ×1.2 | Answered without any help |
| `space_cued` | ×0.9 | Used the Space-key phoneme starter |
| `semantic_cued` | ×0.8 | Used the concept hint |
| `phonemic_cued` | ×0.5 | Used the sound cue |
| `failed` | reset → 1 day | Needed full reveal |

SR state is stored in `localStorage` under `ppa_naming_sr`: `{ [word]: { interval, dueDate, streak, lastResult, lastSeen } }`.

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

## Export / Import System (`ExportImportSystem.jsx`)

- **`.ppa` files** — per-module item exports (naming items, scripts, sentences, etc.). Format: `{ ppaExport: true, moduleId, items: [...] }`.
- **`.ppabak` files** — full-app backup of all `ppa_*` localStorage keys. Restoring reloads the page.
- All public functions and components are named exports. The main app and each module import only what they need.

---

## Key Conventions

- **No backend.** All persistence is `localStorage`. Keys are prefixed `ppa_`.
- **Shared code belongs in `shared.jsx`.** Any utility used by more than one module goes there.
- **Exported constants, not magic strings.** localStorage keys, file extensions, and result type strings are defined once and imported where needed.
- **Admin PIN** is `"1234"` (defined in `NamingModule.jsx` — change before deployment).
- **`VITE_ANTHROPIC_API_KEY`** must be in `.env` — never hardcoded.
- **React StrictMode is active** in development (`src/main.jsx`). Effects run twice; always use cleanup functions.
