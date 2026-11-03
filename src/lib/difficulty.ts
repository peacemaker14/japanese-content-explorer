export const difficultyValues = [
  "unassessed",
  "beginner",
  "intermediate",
  "advanced",
] as const;

export type Difficulty = (typeof difficultyValues)[number];
export type DifficultyFilter = "all" | Difficulty;

export const difficultyLabels: Record<Difficulty, string> = {
  unassessed: "Unrated",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Hard",
};

export const difficultyGuidance: Record<Difficulty, string> = {
  unassessed: "No curator rating or machine difficulty estimate is available.",
  beginner:
    "Clear, slower language with common vocabulary and strong visual context.",
  intermediate:
    "Natural-paced language with broader vocabulary and some implicit context.",
  advanced:
    "Fast, dense or specialist language with substantial assumed context.",
};

export const difficultyEstimateGuidance =
  "Machine estimates are approximate and depend on the reviewed sample and method. They are not verified listening assessments or JLPT levels. Curator ratings take precedence.";

export function presentDifficulty(
  difficulty: Difficulty,
  estimatedDifficulty?: Difficulty | null,
): { value: Difficulty; label: string; isEstimate: boolean } {
  if (difficulty !== "unassessed") {
    return { value: difficulty, label: difficultyLabels[difficulty], isEstimate: false };
  }
  if (estimatedDifficulty && estimatedDifficulty !== "unassessed") {
    return {
      value: estimatedDifficulty,
      label: difficultyLabels[estimatedDifficulty],
      isEstimate: true,
    };
  }
  return { value: "unassessed", label: difficultyLabels.unassessed, isEstimate: false };
}
