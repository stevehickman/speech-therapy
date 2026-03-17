// Default sentence completion and construction tasks for the Sentence Work module
// Used by: SentenceModule (ppa-speech-therapy_main.jsx)
// localStorage keys: ppa_sentence_completions, ppa_sentence_constructions

export const SENTENCE_COMPLETIONS = [
  { prompt: "Every morning I like to...", hint: "daily routine" },
  { prompt: "When I feel happy, I...", hint: "emotion" },
  { prompt: "My favorite food is...", hint: "food preference" },
  { prompt: "I want to go to...", hint: "a place" },
  { prompt: "I need help with...", hint: "a need" },
  { prompt: "Today I am feeling...", hint: "emotion" },
];

export const SENTENCE_CONSTRUCTIONS = [
  { words: ["dog", "run", "park", "the"], hint: "Make a sentence about a dog in the park" },
  { words: ["eat", "I", "breakfast", "morning"], hint: "Make a sentence about eating breakfast" },
  { words: ["family", "love", "my", "I"], hint: "Make a sentence about family" },
  { words: ["water", "need", "I", "glass", "a"], hint: "Make a sentence about wanting water" },
];
