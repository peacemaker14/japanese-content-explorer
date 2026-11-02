export const taxonomy = [
  {
    slug: "cars-driving",
    name: "Cars & Driving",
    description: "Kei cars, JDM, open roads and everyday maintenance.",
    subtopics: [
      ["kei-cars", "Kei cars"],
      ["jdm", "JDM"],
      ["road-trips", "Road trips"],
      ["maintenance", "Maintenance"],
    ],
    queries: ["軽自動車 レビュー", "車 試乗"],
  },
  {
    slug: "fitness-movement",
    name: "Fitness & Movement",
    description: "Yoga, bodyweight training and moving well.",
    subtopics: [
      ["yoga", "Yoga"],
      ["calisthenics", "Calisthenics"],
      ["mobility", "Mobility"],
      ["martial-arts", "Martial arts"],
    ],
    queries: ["自重トレーニング", "ストレッチ 初心者"],
  },
  {
    slug: "gaming",
    name: "Gaming",
    description: "New discoveries, old favourites and how games are made.",
    subtopics: [
      ["reviews", "Reviews"],
      ["retro-games", "Retro games"],
      ["indie-games", "Indie games"],
      ["game-development", "Game development"],
    ],
    queries: ["ゲーム レビュー", "インディーゲーム"],
  },
  {
    slug: "food-cooking",
    name: "Food & Cooking",
    description: "Home kitchens, Japanese food and a good cup of coffee.",
    subtopics: [
      ["home-cooking", "Home cooking"],
      ["japanese-food", "Japanese food"],
      ["coffee", "Coffee"],
      ["cafes", "Cafés"],
    ],
    queries: ["家庭料理 作り方", "ハンドドリップ コーヒー"],
  },
  {
    slug: "travel-culture",
    name: "Travel & Culture",
    description: "City walks, local journeys and life across Japan.",
    subtopics: [
      ["city-walks", "City walks"],
      ["local-travel", "Local travel"],
      ["everyday-life", "Everyday life"],
      ["culture", "Culture"],
    ],
    queries: ["日本 旅行 vlog", "街歩き 日本"],
  },
] as const;
export const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;
export const MAX_METADATA_AGE_DAYS = 29;
