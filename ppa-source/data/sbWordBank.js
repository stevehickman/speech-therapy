// Sentence Builder word bank: all noun/verb/adjective/adverb/pronoun/prep/article data
// Used by: SentenceBuilderModule.jsx

export const SB_NOUNS = {
  People: [
    { word: "man", emoji: "👨" }, { word: "woman", emoji: "👩" }, { word: "boy", emoji: "👦" },
    { word: "girl", emoji: "👧" }, { word: "baby", emoji: "👶" }, { word: "friend", emoji: "🤝" },
    { word: "teacher", emoji: "👩‍🏫" }, { word: "doctor", emoji: "👨‍⚕️" },
  ],
  Animals: [
    { word: "dog", emoji: "🐕" }, { word: "cat", emoji: "🐱" }, { word: "bird", emoji: "🐦" },
    { word: "fish", emoji: "🐟" }, { word: "horse", emoji: "🐴" }, { word: "cow", emoji: "🐄" },
  ],
  "Food & Drink": [
    { word: "apple", emoji: "🍎" }, { word: "bread", emoji: "🍞" }, { word: "water", emoji: "💧" },
    { word: "milk", emoji: "🥛" }, { word: "soup", emoji: "🍲" }, { word: "coffee", emoji: "☕" },
  ],
  Places: [
    { word: "home", emoji: "🏠" }, { word: "park", emoji: "🌳" }, { word: "store", emoji: "🏪" },
    { word: "hospital", emoji: "🏥" }, { word: "school", emoji: "🏫" }, { word: "kitchen", emoji: "🍳" },
  ],
  Things: [
    { word: "book", emoji: "📚" }, { word: "phone", emoji: "📱" }, { word: "chair", emoji: "🪑" },
    { word: "table", emoji: "🪵" }, { word: "car", emoji: "🚗" }, { word: "medicine", emoji: "💊" },
  ],
  Nature: [
    { word: "flower", emoji: "🌸" }, { word: "tree", emoji: "🌳" }, { word: "sun", emoji: "☀️" },
    { word: "rain", emoji: "🌧️" }, { word: "sky", emoji: "🌤️" }, { word: "garden", emoji: "🌿" },
  ],
};

export const SB_VERBS = {
  Movement: [
    { word: "walk", emoji: "🚶" }, { word: "run", emoji: "🏃" }, { word: "sit", emoji: "🧍" },
    { word: "stand", emoji: "🏋️" }, { word: "go", emoji: "➡️" }, { word: "come", emoji: "⬅️" },
    { word: "drive", emoji: "🚗" }, { word: "swim", emoji: "🏊" }, { word: "jump", emoji: "🦘" }, { word: "sleep", emoji: "😴" },
  ],
  Communication: [
    { word: "say", emoji: "💬" }, { word: "call", emoji: "📞" }, { word: "write", emoji: "✍️" },
    { word: "read", emoji: "📖" }, { word: "ask", emoji: "❓" }, { word: "tell", emoji: "🗣️" },
    { word: "listen", emoji: "👂" }, { word: "talk", emoji: "💭" }, { word: "answer", emoji: "📩" }, { word: "show", emoji: "👉" },
  ],
  "Daily Life": [
    { word: "eat", emoji: "🍽️" }, { word: "drink", emoji: "🥤" }, { word: "cook", emoji: "🍳" },
    { word: "clean", emoji: "🧹" }, { word: "work", emoji: "💼" }, { word: "rest", emoji: "🛋️" },
    { word: "wash", emoji: "🫧" }, { word: "dress", emoji: "👔" }, { word: "shop", emoji: "🛍️" }, { word: "help", emoji: "🙌" },
  ],
  "Feelings & Wants": [
    { word: "love", emoji: "❤️" }, { word: "want", emoji: "💭" }, { word: "need", emoji: "🙏" },
    { word: "like", emoji: "👍" }, { word: "feel", emoji: "😊" }, { word: "hope", emoji: "🌟" },
    { word: "enjoy", emoji: "😄" }, { word: "miss", emoji: "💔" }, { word: "worry", emoji: "😟" }, { word: "try", emoji: "💪" },
  ],
  Senses: [
    { word: "see", emoji: "👁️" }, { word: "hear", emoji: "👂" }, { word: "smell", emoji: "👃" },
    { word: "taste", emoji: "👅" }, { word: "touch", emoji: "🤲" },
  ],
  "Being & Having": [
    { word: "be", emoji: "🔵" }, { word: "have", emoji: "📦" }, { word: "get", emoji: "📥" },
    { word: "give", emoji: "🎁" }, { word: "keep", emoji: "📌" }, { word: "make", emoji: "🔨" },
    { word: "take", emoji: "✋" }, { word: "find", emoji: "🔍" }, { word: "put", emoji: "📍" }, { word: "use", emoji: "🛠️" },
  ],
};

export const SB_ADJECTIVES = {
  quickPicks: ["big", "small", "happy", "sad", "hot", "cold", "fast", "slow", "good", "bad", "new", "old", "red", "blue", "green", "loud", "quiet", "soft", "hard", "beautiful", "clean"],
  Size: [
    { word: "big", emoji: "🐘" }, { word: "small", emoji: "🐭" }, { word: "tall", emoji: "🏔️" },
    { word: "short", emoji: "⬇️" }, { word: "long", emoji: "📏" }, { word: "wide", emoji: "↔️" },
    { word: "thin", emoji: "🪶" }, { word: "tiny", emoji: "🔬" }, { word: "huge", emoji: "🌋" },
  ],
  Color: [
    { word: "red", emoji: "🔴" }, { word: "blue", emoji: "🔵" }, { word: "green", emoji: "🟢" },
    { word: "yellow", emoji: "🟡" }, { word: "white", emoji: "⬜" }, { word: "black", emoji: "⬛" },
    { word: "brown", emoji: "🟫" }, { word: "pink", emoji: "🌸" }, { word: "orange", emoji: "🟠" },
    { word: "gray", emoji: "🌫️" }, { word: "purple", emoji: "🟣" }, { word: "gold", emoji: "✨" },
  ],
  Feelings: [
    { word: "happy", emoji: "😊" }, { word: "sad", emoji: "😢" }, { word: "angry", emoji: "😠" },
    { word: "scared", emoji: "😨" }, { word: "tired", emoji: "😴" }, { word: "excited", emoji: "🤩" },
    { word: "calm", emoji: "😌" }, { word: "worried", emoji: "😟" }, { word: "proud", emoji: "😤" },
    { word: "lonely", emoji: "🥺" }, { word: "sick", emoji: "🤒" }, { word: "well", emoji: "💪" },
  ],
  Quality: [
    { word: "good", emoji: "✅" }, { word: "bad", emoji: "❌" }, { word: "nice", emoji: "😊" },
    { word: "pretty", emoji: "🌹" }, { word: "clean", emoji: "✨" }, { word: "dirty", emoji: "🪣" },
    { word: "healthy", emoji: "💚" }, { word: "special", emoji: "⭐" }, { word: "safe", emoji: "🛡️" },
    { word: "easy", emoji: "🌿" }, { word: "hard", emoji: "🪨" }, { word: "full", emoji: "🪣" },
  ],
  "Touch & Texture": [
    { word: "soft", emoji: "🧸" }, { word: "rough", emoji: "🪨" }, { word: "smooth", emoji: "🪞" },
    { word: "warm", emoji: "🌡️" }, { word: "cold", emoji: "🧊" }, { word: "wet", emoji: "💧" },
    { word: "dry", emoji: "🏜️" }, { word: "sharp", emoji: "🔪" }, { word: "fluffy", emoji: "🐑" },
    { word: "heavy", emoji: "⚓" }, { word: "light", emoji: "🪶" }, { word: "sticky", emoji: "🍯" },
  ],
  "Speed & Amount": [
    { word: "fast", emoji: "⚡" }, { word: "slow", emoji: "🐢" }, { word: "many", emoji: "🔢" },
    { word: "few", emoji: "🔢" }, { word: "all", emoji: "💯" }, { word: "some", emoji: "🔸" },
    { word: "more", emoji: "➕" }, { word: "less", emoji: "➖" }, { word: "most", emoji: "🏆" },
    { word: "each", emoji: "🔁" }, { word: "every", emoji: "🌐" }, { word: "enough", emoji: "☑️" },
  ],
  "Shape & Look": [
    { word: "round", emoji: "⭕" }, { word: "flat", emoji: "📄" }, { word: "square", emoji: "⬛" },
    { word: "bright", emoji: "💡" }, { word: "dark", emoji: "🌑" }, { word: "clear", emoji: "🔭" },
    { word: "old", emoji: "🏚️" }, { word: "new", emoji: "✨" }, { word: "long", emoji: "📏" },
  ],
};

export const SB_ADVERBS = [
  { word: "very", emoji: "⚡" }, { word: "too", emoji: "➕" }, { word: "also", emoji: "🔗" },
  { word: "again", emoji: "🔄" }, { word: "now", emoji: "⏰" }, { word: "then", emoji: "⏩" },
  { word: "here", emoji: "📍" }, { word: "there", emoji: "🗺️" }, { word: "always", emoji: "♾️" },
  { word: "never", emoji: "🚫" }, { word: "sometimes", emoji: "🔄" }, { word: "often", emoji: "📅" },
  { word: "quickly", emoji: "💨" }, { word: "slowly", emoji: "🐢" }, { word: "carefully", emoji: "🎯" },
  { word: "well", emoji: "✅" }, { word: "today", emoji: "📅" }, { word: "yesterday", emoji: "⬅️" },
  { word: "tomorrow", emoji: "➡️" }, { word: "already", emoji: "✔️" },
];

export const SB_PRONOUNS = [
  { word: "I", emoji: "👤" }, { word: "you", emoji: "👉" }, { word: "he", emoji: "👦" },
  { word: "she", emoji: "👧" }, { word: "it", emoji: "🔵" }, { word: "we", emoji: "👥" },
  { word: "they", emoji: "👥" }, { word: "me", emoji: "👤" }, { word: "him", emoji: "👦" },
  { word: "her", emoji: "👧" }, { word: "us", emoji: "👥" }, { word: "them", emoji: "👥" },
  { word: "my", emoji: "🏷️" }, { word: "your", emoji: "🏷️" }, { word: "his", emoji: "🏷️" },
  { word: "our", emoji: "🏷️" }, { word: "their", emoji: "🏷️" }, { word: "this", emoji: "👆" },
  { word: "that", emoji: "👉" }, { word: "everything", emoji: "🌐" },
];

export const SB_PREPS = [
  { word: "in", emoji: "📦" }, { word: "on", emoji: "⬆️" }, { word: "at", emoji: "📍" },
  { word: "to", emoji: "➡️" }, { word: "for", emoji: "🎯" }, { word: "from", emoji: "⬅️" },
  { word: "with", emoji: "🤝" }, { word: "about", emoji: "💬" }, { word: "after", emoji: "⏩" },
  { word: "before", emoji: "⏪" }, { word: "near", emoji: "📌" }, { word: "under", emoji: "⬇️" },
  { word: "over", emoji: "⬆️" }, { word: "by", emoji: "👤" }, { word: "into", emoji: "🚪" },
  { word: "out of", emoji: "🚪" }, { word: "around", emoji: "🔄" }, { word: "between", emoji: "↔️" },
  { word: "without", emoji: "❌" }, { word: "during", emoji: "⏱️" },
];

export const SB_ARTICLES = [
  { word: "the", emoji: "📌" }, { word: "a", emoji: "🔡" }, { word: "an", emoji: "🔡" },
  { word: "some", emoji: "🔸" }, { word: "any", emoji: "❓" }, { word: "this", emoji: "👆" },
  { word: "that", emoji: "👉" }, { word: "these", emoji: "👆" }, { word: "those", emoji: "👉" },
  { word: "one", emoji: "1️⃣" }, { word: "two", emoji: "2️⃣" }, { word: "three", emoji: "3️⃣" },
  { word: "no", emoji: "🚫" }, { word: "another", emoji: "➕" },
];
