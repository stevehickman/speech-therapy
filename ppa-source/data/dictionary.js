import { useState } from "react";
import { NAMING_ITEMS } from "./namingItems.js";
import {
  SB_NOUNS, SB_VERBS, SB_ADJECTIVES,
  SB_ADVERBS, SB_PRONOUNS, SB_PREPS, SB_ARTICLES,
} from "./sbWordBank.js";
import { DICT_KEY, DICT_NAMING_KEY } from "../ExportImportSystem.jsx";

// ── Shared graphic utilities ───────────────────────────────────────────────────
// Exported so every module can branch between <img> and emoji without
// duplicating this logic.
export function isImageGraphic(g) {
  return g?.startsWith?.("http") || g?.startsWith?.("data:");
}

// ── PPA Dictionary ─────────────────────────────────────────────────────────────
//
// The single source of truth for every word used across all modules.
// Stored in localStorage as ppa_dictionary: { [lowercaseWord]: entry }
//
// Each entry carries:
//   word          – display form (case-preserved, e.g. "I", "out of")
//   graphic       – emoji string or base64/URL image — authoritative across all modules
//   categories    – all category labels for this word, from both the naming module
//                   (e.g. "food", "animal") and SB word bank sub-groups
//                   (e.g. "Food & Drink", "Animals").  Always an array.
//   clue_semantic – naming-module semantic cue
//   clue_phonemic – naming-module phonemic cue
//   partOfSpeech  – SB word-class labels, e.g. ["Nouns", "Verbs"]
//
// Consumer API:
//   dictGetEntry(word)           → entry | null
//   dictGetGraphic(word, fb)     → graphic string (falls back to fb)
//   useDictionaryLookup()        → hook: { lowercaseWord → graphic } map
//
// NamingModule API:
//   dictLoadNamingItems()        → replaces old loadItems()
//   dictSaveNamingItems(items)   → replaces old saveItems()

// ── Migration helper ───────────────────────────────────────────────────────────
// Converts a stored entry from the old schema (category: string, sbGroups: array)
// to the new schema (categories: array).  Safe to call on already-migrated entries.
function migrateEntry(entry) {
  if ("categories" in entry && !("category" in entry) && !("sbGroups" in entry)) {
    return entry; // already on new schema
  }
  const { category, sbGroups, categories: existing, ...rest } = entry;
  const merged = [
    ...(existing              ?? []),
    ...(Array.isArray(sbGroups) ? sbGroups : []),
    ...(category               ? [category] : []),
  ];
  return { ...rest, categories: [...new Set(merged)] };
}

// ── Seed ───────────────────────────────────────────────────────────────────────
// Build the initial word→entry map from all built-in data sources.
// NAMING_ITEMS are the authority for cues; SB banks add partOfSpeech and categories.
// NAMING_ITEMS go first so their graphic always wins for shared words.
export function dictBuildSeed() {
  const dict = {};

  const put = (word, graphic, extra = {}) => {
    const k = word?.toLowerCase?.();
    if (!k) return;
    const prev = dict[k] ?? { partOfSpeech: [], categories: [] };
    dict[k] = {
      word,
      graphic:      prev.graphic ?? graphic,   // first writer wins
      partOfSpeech: [...new Set([...prev.partOfSpeech, ...(extra.partOfSpeech ?? [])])],
      categories:   [...new Set([...prev.categories,   ...(extra.categories   ?? [])])],
      ...(extra.clue_semantic != null ? { clue_semantic: extra.clue_semantic } : {}),
      ...(extra.clue_phonemic != null ? { clue_phonemic: extra.clue_phonemic } : {}),
    };
  };

  // NAMING_ITEMS — highest authority: carry cues, naming category, and graphic
  NAMING_ITEMS.forEach(it => put(it.word, it.graphic ?? it.emoji, {
    categories:    it.category ? [it.category] : [],
    clue_semantic: it.clue_semantic,
    clue_phonemic: it.clue_phonemic,
    partOfSpeech:  ["Nouns"],
  }));

  // SB word banks — contribute partOfSpeech and sub-group categories
  const sbBank = (items, pos, group) =>
    items.forEach(it => put(it.word, it.emoji, { partOfSpeech: [pos], categories: [group] }));
  const sbNamed = (bank, pos) =>
    Object.entries(bank).forEach(([group, items]) => {
      if (!Array.isArray(items)) return; // skip non-array values (e.g. quickPicks)
      sbBank(items, pos, group);
    });

  sbNamed(SB_NOUNS,      "Nouns");
  sbNamed(SB_VERBS,      "Verbs");
  sbNamed(SB_ADJECTIVES, "Adjectives");
  sbBank(SB_ADVERBS,  "Adverbs",  "Adverbs");
  sbBank(SB_PRONOUNS, "Pronouns", "Pronouns");
  sbBank(SB_PREPS,    "Preps",    "Prepositions");
  sbBank(SB_ARTICLES, "Articles", "Articles");

  return dict;
}

// ── Persistence ────────────────────────────────────────────────────────────────

// Load dictionary from localStorage.  On first run, seeds from built-in data
// and migrates any existing custom naming items so their graphics are available
// to all modules without requiring a NamingModule save.
// Also migrates any stored entries still using the old category/sbGroups schema.
export function dictLoad() {
  try {
    const raw = localStorage.getItem(DICT_KEY);
    if (raw) {
      const dict = JSON.parse(raw);
      // Migrate entries still on old schema (category string + sbGroups array)
      let needsSave = false;
      for (const k of Object.keys(dict)) {
        if ("category" in dict[k] || "sbGroups" in dict[k]) {
          dict[k] = migrateEntry(dict[k]);
          needsSave = true;
        }
      }
      if (needsSave) dictSave(dict);
      return dict;
    }
  } catch {}

  const dict = dictBuildSeed();

  // Migration: pull custom graphics out of any pre-existing ppa_naming_items
  try {
    const namingItems = JSON.parse(localStorage.getItem(DICT_NAMING_KEY) || "[]");
    namingItems.forEach(it => {
      const k = it.word?.toLowerCase();
      if (!k) return;
      const g = it.graphic ?? it.emoji;
      if (dict[k]) {
        if (g) dict[k].graphic = g;
      } else {
        dict[k] = {
          word:          it.word,
          graphic:       g ?? "",
          categories:    it.category ? [it.category] : [],
          clue_semantic: it.clue_semantic ?? "",
          clue_phonemic: it.clue_phonemic ?? "",
          partOfSpeech:  [],
        };
      }
    });
  } catch {}

  dictSave(dict);
  return dict;
}

export function dictSave(dict) {
  try { localStorage.setItem(DICT_KEY, JSON.stringify(dict)); } catch {}
}

// ── Lookup ─────────────────────────────────────────────────────────────────────

// Return the full entry for a word, or null if not found.
export function dictGetEntry(word) {
  if (!word) return null;
  try {
    const raw = localStorage.getItem(DICT_KEY);
    const dict = raw ? JSON.parse(raw) : dictLoad();
    return dict[word.toLowerCase()] ?? null;
  } catch { return null; }
}

// Resolve the canonical graphic for a word, falling back to a supplied default.
export function dictGetGraphic(word, fallback) {
  return dictGetEntry(word)?.graphic ?? fallback;
}

// Add a word to the dictionary if it is not already present.
// If it exists with a placeholder graphic (❓) and a real graphic is supplied,
// upgrade the stored graphic.  Returns the final stored entry.
export function dictAddWord(word, graphic) {
  if (!word) return null;
  try {
    const raw = localStorage.getItem(DICT_KEY);
    const dict = raw ? JSON.parse(raw) : dictLoad();
    const k = word.toLowerCase();
    const existing = dict[k];
    if (!existing) {
      dict[k] = {
        word, graphic: graphic ?? "❓",
        categories: [], partOfSpeech: [],
        clue_semantic: "", clue_phonemic: "",
      };
    } else if (existing.graphic === "❓" && graphic && graphic !== "❓") {
      dict[k] = { ...existing, graphic };
    }
    dictSave(dict);
    return dict[k];
  } catch { return null; }
}

// Build a flat { lowercaseWord: graphic } map for O(1) lookup in render loops.
export function dictBuildGraphicLookup() {
  try {
    const raw = localStorage.getItem(DICT_KEY);
    const dict = raw ? JSON.parse(raw) : dictLoad();
    const out = {};
    for (const [k, v] of Object.entries(dict)) { if (v.graphic) out[k] = v.graphic; }
    return out;
  } catch { return {}; }
}

// Hook: call once per module on mount.
// Returns a stable { lowercaseWord: graphic } object for the render lifetime.
export function useDictionaryLookup() {
  const [lookup] = useState(dictBuildGraphicLookup);
  return lookup;
}

// ── NamingModule sync ──────────────────────────────────────────────────────────

// Write naming-module items into the dictionary (called on every NamingModule save).
// Preserves each word's existing partOfSpeech and SB-sourced categories.
// The naming-module category (a single string) is merged into the categories array.
export function dictSyncFromNamingItems(items) {
  try {
    const raw = localStorage.getItem(DICT_KEY);
    const dict = raw ? JSON.parse(raw) : dictLoad();
    items.forEach(it => {
      const k = it.word?.toLowerCase();
      if (!k) return;
      const prev       = dict[k] ?? { partOfSpeech: [], categories: [] };
      const prevCats   = prev.categories ?? [];
      const incomingCat = it.category ?? "";
      const categories  = incomingCat && !prevCats.includes(incomingCat)
        ? [...prevCats, incomingCat]
        : prevCats;
      dict[k] = {
        ...prev,
        word:          it.word,
        graphic:       it.graphic ?? it.emoji ?? prev.graphic ?? "",
        categories,
        clue_semantic: it.clue_semantic ?? prev.clue_semantic ?? "",
        clue_phonemic: it.clue_phonemic ?? prev.clue_phonemic ?? "",
      };
    });
    dictSave(dict);
  } catch {}
}

// ── NamingModule load/save ─────────────────────────────────────────────────────

// Replaces old loadItems().  Loads the practice list from ppa_naming_items,
// then overlays each word's authoritative graphic from the dictionary.
export function dictLoadNamingItems() {
  const seed = () => NAMING_ITEMS.map((it, i) => ({ ...it, id: `seed-${i}` }));
  try {
    const raw   = localStorage.getItem(DICT_NAMING_KEY);
    const items = raw ? JSON.parse(raw) : seed();
    const raw2  = localStorage.getItem(DICT_KEY);
    const dict  = raw2 ? JSON.parse(raw2) : dictLoad();
    return items.map(it => {
      const entry = it.word && dict[it.word.toLowerCase()];
      return entry?.graphic ? { ...it, graphic: entry.graphic } : it;
    });
  } catch { return seed(); }
}

// Replaces old saveItems().  Persists the naming list to ppa_naming_items
// (backward-compat for the SR engine) and syncs graphics into the dictionary.
export function dictSaveNamingItems(items) {
  try { localStorage.setItem(DICT_NAMING_KEY, JSON.stringify(items)); } catch {}
  dictSyncFromNamingItems(items);
}
