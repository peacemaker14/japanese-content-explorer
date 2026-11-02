export const difficultyValues = [
  "unassessed",
  "beginner",
  "intermediate",
  "advanced",
] as const;

export type Difficulty = (typeof difficultyValues)[number];
export type DifficultyFilter = "all" | Difficulty;

export const difficultyLabels: Record<Difficulty, string> = {
  unassessed: "Not assessed",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const difficultyGuidance: Record<Difficulty, string> = {
  unassessed: "No curator language-difficulty assessment yet.",
  beginner:
    "Clear, slower language with common vocabulary and strong visual context.",
  intermediate:
    "Natural-paced language with broader vocabulary and some implicit context.",
  advanced:
    "Fast, dense or specialist language with substantial assumed context.",
};
