// Video clips, question types, and video utility functions
// Used by: VideoModule (in ppa-speech-therapy_3.jsx)

export const VIDEO_CLIPS = [
  {
    id: "vc1",
    title: "A Day at the Market",
    youtubeId: "zr9leP_Dcm8",
    startSeconds: 10,
    description: "A butterfly sips nectar from a flower",
    thumbnail: "🛒",
    difficulty: "easy",
    questions: [
      { type: "who",   icon: "👤", color: "#4E8B80", question: "What is in the video?",         options: ["A man shopping", "A butterfly on a flower", "A child playing", "A baker cooking"],           answer: 1, hint: "Look at the thing moving." },
      { type: "what",  icon: "🎬", color: "#9B7FB8", question: "What is it doing?",             options: ["Cooking a meal", "Reading a book", "Sipping nectar from the flower", "Talking on the phone"], answer: 2, hint: "Watch what it does." },
      { type: "where", icon: "📍", color: "#C07070", question: "Where does this happen?",       options: ["In a restaurant", "In a garden", "In a supermarket", "In a kitchen"],      answer: 1, hint: "Look at the setting." },
    ],
  },
  {
    id: "vc2",
    title: "Eating an Apple",
    youtubeId: "YE7VzlLtp-4",
    startSeconds: 84,
    stopSeconds: 96,
    description: "a large fluffy rabbit eats an apple that falls from a tree.",
    thumbnail: "🐇",
    difficulty: "easy",
    questions: [
      { type: "who",   icon: "👤", color: "#4E8B80", question: "Who is the main character?",           options: ["A squirrel", "A bear", "A large rabbit", "A fox"],                               answer: 2, hint: "Look for the big fluffy animal." },
      { type: "what",  icon: "🎬", color: "#9B7FB8", question: "What is the rabbit doing at first?",   options: ["Running fast", "Resting and napping", "Eating an apple", "Swimming"],             answer: 2, hint: "Watch what the rabbit does when the video begins." },
      { type: "where", icon: "📍", color: "#C07070", question: "Where does the story take place?",     options: ["In a city", "On a farm", "In a forest meadow", "At the beach"],                  answer: 2, hint: "Look at the trees and grass around the characters." },
    ],
  },
  {
    id: "vc3",
    title: "At the zoo",
    youtubeId: "jNQXAC9IVRw",
    startSeconds: 0,
    description: "A man stands in front of the elephant enclosure at a zoo and talks about the animals he can see.",
    thumbnail: "🐘",
    difficulty: "easy",
    questions: [
      { type: "who",   icon: "👤", color: "#4E8B80", question: "Who is speaking in the video?",    options: ["A zookeeper in uniform", "A young man visiting", "A small child", "A scientist"],   answer: 1, hint: "Look at the person talking to the camera." },
      { type: "what",  icon: "🎬", color: "#9B7FB8", question: "What animals does he talk about?", options: ["Lions", "Giraffes", "Elephants", "Monkeys"],                                       answer: 2, hint: "Look behind him at what animals are in the enclosure." },
      { type: "where", icon: "📍", color: "#C07070", question: "Where is he standing?",            options: ["At a farm", "At a zoo", "In a jungle", "In a museum"],                             answer: 1, hint: "Look at the fences and signs in the background." },
    ],
  },
  {
    id: "vc4",
    title: "Winter Walk",
    youtubeId: "eRsGyueVLvQ",
    startSeconds: 25,
    stopSeconds: 40,
    description: "A young woman with red hair travels through snowy mountain landscapes on a journey.",
    thumbnail: "🏔️",
    difficulty: "medium",
    questions: [
      { type: "who",   icon: "👤", color: "#4E8B80", question: "Who is the main character?",              options: ["An old man with a beard", "A young woman with red hair", "A young boy", "A warrior in armor"], answer: 1, hint: "Look for the main person traveling through the landscape." },
      { type: "what",  icon: "🎬", color: "#9B7FB8", question: "What is she doing on her journey?",       options: ["Building a house", "Fighting an army", "Traveling and searching", "Cooking by a fire"],       answer: 2, hint: "Watch her movements and what she seems to be looking for." },
      { type: "where", icon: "📍", color: "#C07070", question: "What kind of place does she travel through?", options: ["A hot desert", "A busy city", "Snowy cold mountains", "A tropical jungle"],               answer: 2, hint: "Look at the weather and the landscape around her." },
    ],
  },
];

export const EMOJI_OPTIONS = [
  "🎬","🏠","🌳","🐾","🍽️","🏖️","🎪","👨‍👩‍👧","🏥","🛒",
  "🌸","⚽","🎵","🚂","🌊","🏔️","🐦","🍎","📚","🧩",
];

export const Q_TYPES = [
  { type: "who",   icon: "👤", color: "#4E8B80", label: "WHO",   placeholder: "Who is in the video?" },
  { type: "what",  icon: "🎬", color: "#9B7FB8", label: "WHAT",  placeholder: "What are they doing?" },
  { type: "where", icon: "📍", color: "#C07070", label: "WHERE", placeholder: "Where does this happen?" },
];

export function makeBlankQuestion(type, icon, color) {
  return { type, icon, color, question: "", options: ["", "", "", ""], answer: 0, hint: "" };
}

export function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}
