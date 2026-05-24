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
  // words: "The dog runs in the park" / "A big dog runs in the park"
  { words: ["the", "dog", "runs", "in", "the", "park", "a", "big"], hint: "Make a sentence about a dog in the park" },

  // words: "I eat breakfast in the morning" / "I eat breakfast every morning"
  { words: ["I", "eat", "breakfast", "in", "the", "morning", "every"], hint: "Make a sentence about eating breakfast" },

  // words: "I love my family" / "I love my family very much"
  { words: ["I", "love", "my", "family", "very", "much"], hint: "Make a sentence about family" },

  // words: "I need a glass of water" / "I need a glass of cold water"
  { words: ["I", "need", "a", "glass", "of", "cold", "water"], hint: "Make a sentence about wanting water" },

  // words: "It is a sunny day" / "It is a beautiful day today" / "Today is a sunny day"
  { words: ["it", "is", "a", "sunny", "beautiful", "day", "today"], hint: "Make a sentence about the weather" },

  // words: "I want to go to the shops" / "I need to go to the shops today"
  { words: ["I", "want", "to", "go", "to", "the", "shops", "today", "need"], hint: "Make a sentence about going shopping" },

  // words: "The cat sleeps on the sofa" / "My cat sleeps on the sofa" / "A cat sleeps on the sofa"
  { words: ["the", "cat", "sleeps", "on", "the", "sofa", "my", "a"], hint: "Make a sentence about a cat" },

  // words: "I called my sister on the phone" / "I called my brother on the phone"
  { words: ["I", "called", "my", "sister", "brother", "on", "the", "phone"], hint: "Make a sentence about calling someone" },
];
