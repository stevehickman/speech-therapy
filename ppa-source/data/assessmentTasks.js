// Assessment task definitions for the Assessment module
// Depends on: namingItems.js (for confrontation naming items)
// Used by: AssessmentModule (in ppa-speech-therapy_3.jsx)

import { NAMING_ITEMS } from "./namingItems.js";

export const ASSESSMENT_TASKS = [
  {
    id: "confrontation_naming",
    name: "Confrontation Naming",
    desc: "Name pictures as quickly as possible",
    items: NAMING_ITEMS.slice(0, 5),
  },
  {
    id: "repetition",
    name: "Word Repetition",
    desc: "Repeat words and phrases back",
    items: ["cat", "elephant", "blue", "running quickly", "the big brown dog", "I went to the store yesterday"],
  },
  {
    id: "category_fluency",
    name: "Category Fluency",
    desc: "Name as many items in a category as you can in 60 seconds",
    categories: ["animals", "foods", "things in a kitchen"],
  },
  {
    id: "sentence_repetition",
    name: "Sentence Repetition",
    desc: "Repeat sentences of increasing length",
    items: [
      "The cat sat.",
      "She is cooking dinner.",
      "The children played in the park all afternoon.",
      "He carefully placed the fragrant flowers in the blue glass vase.",
    ],
  },
];
